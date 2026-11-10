import type { Request, Response } from "express";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  MealType,
  Prisma,
  PrismaClient,
} from "../generated/prisma/client.js";
import "dotenv/config";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});
const prisma = new PrismaClient({ adapter });

type IngredientInput = { name: string; amountG: number };
type CookingStepInput = {
  title: string;
  instruction: string;
  imageUrl: string | null;
};
type MealInput = {
  name: string;
  description: string | null;
  imageUrl: string | null;
  category: MealType;
  isVegetarian: boolean;
  prepTimeMinutes: number;
  cookTimeMinutes: number;
  servings: number;
  finalWeightG: number | null;
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  ingredients: IngredientInput[];
  cookingSteps: CookingStepInput[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readText = (
  value: unknown,
  field: string,
  maxLength: number,
  required = false,
): string | null => {
  if (value === undefined || value === null) {
    return required ? null : "";
  }
  if (typeof value !== "string") return null;
  const text = value.trim();
  if ((required && !text) || text.length > maxLength) return null;
  return text;
};

const readNumber = (
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
  integer = false,
): number | null => {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum ||
    (integer && !Number.isInteger(value))
  ) {
    return null;
  }
  return value;
};

const isValidImageUrl = (value: string): boolean => {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
};

const parseMealInput = (
  value: unknown,
): { data?: MealInput; error?: string } => {
  if (!isRecord(value)) return { error: "Dữ liệu món ăn không hợp lệ." };

  const name = readText(value.name, "name", 120, true);
  const description = readText(value.description, "description", 2000);
  const imageUrl = readText(value.imageUrl, "imageUrl", 2048);
  if (name === null) return { error: "Tên món ăn là bắt buộc (tối đa 120 ký tự)." };
  if (description === null) return { error: "Mô tả không được vượt quá 2.000 ký tự." };
  if (imageUrl === null || !isValidImageUrl(imageUrl)) {
    return { error: "URL ảnh phải là địa chỉ HTTP hoặc HTTPS hợp lệ." };
  }
  if (
    typeof value.category !== "string" ||
    !Object.values(MealType).includes(value.category as MealType)
  ) {
    return { error: "Loại bữa ăn không hợp lệ." };
  }
  if (typeof value.isVegetarian !== "boolean") {
    return { error: "Hãy chọn món ăn có phải món chay hay không." };
  }

  const prepTimeMinutes = readNumber(value.prepTimeMinutes, "prepTimeMinutes", 0, 1440, true);
  const cookTimeMinutes = readNumber(value.cookTimeMinutes, "cookTimeMinutes", 0, 1440, true);
  const servings = readNumber(value.servings, "servings", 1, 100, true);
  const caloriesPer100g = readNumber(value.caloriesPer100g, "caloriesPer100g", 0, 10000);
  const proteinPer100g = readNumber(value.proteinPer100g, "proteinPer100g", 0, 1000);
  const carbsPer100g = readNumber(value.carbsPer100g, "carbsPer100g", 0, 1000);
  const fatPer100g = readNumber(value.fatPer100g, "fatPer100g", 0, 1000);
  const hasFinalWeight =
    value.finalWeightG !== undefined &&
    value.finalWeightG !== null &&
    value.finalWeightG !== "";
  const finalWeightG = hasFinalWeight
    ? readNumber(value.finalWeightG, "finalWeightG", 0.1, 100000)
    : null;
  if (
    prepTimeMinutes === null ||
    cookTimeMinutes === null ||
    servings === null ||
    caloriesPer100g === null ||
    proteinPer100g === null ||
    carbsPer100g === null ||
    fatPer100g === null ||
    (hasFinalWeight && finalWeightG === null)
  ) {
    return { error: "Thời gian, khẩu phần hoặc chỉ số dinh dưỡng không hợp lệ." };
  }

  if (
    !Array.isArray(value.ingredients) ||
    value.ingredients.length < 1 ||
    value.ingredients.length > 100
  ) {
    return { error: "Món ăn cần có từ 1 đến 100 nguyên liệu." };
  }
  const ingredients: IngredientInput[] = [];
  for (const rawIngredient of value.ingredients) {
    if (!isRecord(rawIngredient)) {
      return { error: "Thông tin nguyên liệu không hợp lệ." };
    }
    const ingredientName = readText(rawIngredient.name, "ingredient.name", 120, true);
    const amountG = readNumber(rawIngredient.amountG, "ingredient.amountG", 0.1, 100000);
    if (ingredientName === null || amountG === null) {
      return { error: "Mỗi nguyên liệu cần có tên và khối lượng lớn hơn 0." };
    }
    ingredients.push({ name: ingredientName, amountG });
  }

  if (
    !Array.isArray(value.cookingSteps) ||
    value.cookingSteps.length < 1 ||
    value.cookingSteps.length > 50
  ) {
    return { error: "Món ăn cần có từ 1 đến 50 bước nấu." };
  }
  const cookingSteps: CookingStepInput[] = [];
  for (const rawStep of value.cookingSteps) {
    if (!isRecord(rawStep)) {
      return { error: "Thông tin bước nấu không hợp lệ." };
    }
    const title = readText(rawStep.title, "step.title", 120, true);
    const instruction = readText(rawStep.instruction, "step.instruction", 2000, true);
    const stepImageUrl = readText(rawStep.imageUrl, "step.imageUrl", 2048);
    if (
      title === null ||
      instruction === null ||
      stepImageUrl === null ||
      !isValidImageUrl(stepImageUrl)
    ) {
      return { error: "Mỗi bước cần có tiêu đề, hướng dẫn và URL ảnh hợp lệ nếu có." };
    }
    cookingSteps.push({
      title,
      instruction,
      imageUrl: stepImageUrl || null,
    });
  }

  return {
    data: {
      name,
      description: description || null,
      imageUrl: imageUrl || null,
      category: value.category as MealType,
      isVegetarian: value.isVegetarian,
      prepTimeMinutes,
      cookTimeMinutes,
      servings,
      finalWeightG,
      caloriesPer100g,
      proteinPer100g,
      carbsPer100g,
      fatPer100g,
      ingredients,
      cookingSteps,
    },
  };
};

const mealInclude = {
  ingredients: { orderBy: { name: "asc" as const } },
  cookingSteps: { orderBy: { stepNumber: "asc" as const } },
};

const getQueryString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

export const getAdminMeals = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const pageValue = getQueryString(req.query.page) ?? "1";
  const limitValue = getQueryString(req.query.limit) ?? "20";
  const search = getQueryString(req.query.search)?.trim() ?? "";
  const category = getQueryString(req.query.category);
  const vegetarian = getQueryString(req.query.vegetarian);
  const published = getQueryString(req.query.published);
  const page = Number(pageValue);
  const limit = Number(limitValue);

  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 50 ||
    search.length > 100 ||
    (category !== undefined &&
      category !== "all" &&
      !Object.values(MealType).includes(category as MealType)) ||
    (vegetarian !== undefined && !["all", "true", "false"].includes(vegetarian)) ||
    (published !== undefined && !["all", "true", "false"].includes(published))
  ) {
    res.status(400).json({ success: false, message: "Bộ lọc món ăn không hợp lệ." });
    return;
  }

  const where: Prisma.MealWhereInput = {
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { description: { contains: search, mode: "insensitive" } },
            {
              ingredients: {
                some: { name: { contains: search, mode: "insensitive" } },
              },
            },
          ],
        }
      : {}),
    ...(category && category !== "all" ? { category: category as MealType } : {}),
    ...(vegetarian && vegetarian !== "all"
      ? { isVegetarian: vegetarian === "true" }
      : {}),
    ...(published && published !== "all"
      ? { isPublished: published === "true" }
      : {}),
  };

  try {
    const [data, totalItems] = await Promise.all([
      prisma.meal.findMany({
        where,
        include: mealInclude,
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.meal.count({ where }),
    ]);
    const totalPages = Math.ceil(totalItems / limit);
    res.status(200).json({
      success: true,
      data,
      pagination: {
        totalItems,
        currentPage: page,
        pageSize: limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    console.error("GET ADMIN MEALS ERROR:", error);
    res.status(500).json({ success: false, message: "Không thể tải danh sách món ăn." });
  }
};

export const createAdminMeal = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const parsed = parseMealInput(req.body);
  if (!parsed.data) {
    res.status(400).json({
      success: false,
      message: parsed.error ?? "Dữ liệu món ăn không hợp lệ.",
    });
    return;
  }

  try {
    const meal = await prisma.meal.create({
      data: {
        ...parsed.data,
        ingredients: { create: parsed.data.ingredients },
        cookingSteps: {
          create: parsed.data.cookingSteps.map((step, index) => ({
            ...step,
            stepNumber: index + 1,
          })),
        },
      },
      include: mealInclude,
    });
    res.status(201).json({ success: true, data: meal });
  } catch (error) {
    console.error("CREATE ADMIN MEAL ERROR:", error);
    res.status(500).json({ success: false, message: "Không thể tạo món ăn." });
  }
};

export const updateAdminMeal = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { id } = req.params;
  if (typeof id !== "string" || !id) {
    res.status(400).json({ success: false, message: "Mã món ăn không hợp lệ." });
    return;
  }
  const parsed = parseMealInput(req.body);
  if (!parsed.data) {
    res.status(400).json({
      success: false,
      message: parsed.error ?? "Dữ liệu món ăn không hợp lệ.",
    });
    return;
  }

  try {
    const meal = await prisma.meal.update({
      where: { id },
      data: {
        ...parsed.data,
        ingredients: {
          deleteMany: {},
          create: parsed.data.ingredients,
        },
        cookingSteps: {
          deleteMany: {},
          create: parsed.data.cookingSteps.map((step, index) => ({
            ...step,
            stepNumber: index + 1,
          })),
        },
      },
      include: mealInclude,
    });
    res.status(200).json({ success: true, data: meal });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      res.status(404).json({ success: false, message: "Không tìm thấy món ăn." });
      return;
    }
    console.error("UPDATE ADMIN MEAL ERROR:", error);
    res.status(500).json({ success: false, message: "Không thể cập nhật món ăn." });
  }
};

export const setAdminMealPublished = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { id } = req.params;
  const isPublished = isRecord(req.body) ? req.body.isPublished : undefined;
  if (typeof id !== "string" || !id || typeof isPublished !== "boolean") {
    res.status(400).json({ success: false, message: "Trạng thái món ăn không hợp lệ." });
    return;
  }
  try {
    const meal = await prisma.meal.update({
      where: { id },
      data: { isPublished },
      select: { id: true, name: true, isPublished: true },
    });
    res.status(200).json({ success: true, data: meal });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      res.status(404).json({ success: false, message: "Không tìm thấy món ăn." });
      return;
    }
    console.error("PUBLISH ADMIN MEAL ERROR:", error);
    res.status(500).json({ success: false, message: "Không thể cập nhật trạng thái món ăn." });
  }
};
