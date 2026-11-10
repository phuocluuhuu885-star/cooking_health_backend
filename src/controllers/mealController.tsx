// src/controllers/meal.controller.ts
import type { Request, Response } from "express";
import { PrismaPg } from "@prisma/adapter-pg";
import { MealType, Prisma, PrismaClient } from "../generated/prisma/client.js";
import { calculateNutritionSummary } from "../services/mealNutritionService.js";
import "dotenv/config";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({
  adapter,
});

const isMealType = (value: unknown): value is MealType =>
  typeof value === "string" &&
  Object.values(MealType).some((mealType) => mealType === value);

export const getMealDetailWithServings = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { id } = req.params;
    const servingsQuery = req.query.servings;
    if (typeof id !== "string" || (servingsQuery !== undefined && typeof servingsQuery !== "string")) {
      res.status(400).json({
        success: false,
        message: "Tham số món ăn hoặc số khẩu phần không hợp lệ",
      });
      return;
    }
    const targetServings = servingsQuery === undefined ? 1 : Number(servingsQuery);

    if (!Number.isFinite(targetServings) || targetServings <= 0) {
      res.status(400).json({
        success: false,
        message: "Số khẩu phần phải là số lớn hơn 0",
      });
      return;
    }

    const meal = await prisma.meal.findFirst({
      where: { id, isPublished: true },
      include: {
        ingredients: true,
        cookingSteps: { orderBy: { stepNumber: "asc" } },
      },
    });
    if (!meal) {
      res.status(404).json({ success: false, message: "Không tìm thấy món ăn" });
      return;
    }

    const baseServings = meal.servings;
    if (baseServings <= 0) {
      console.error("Meal has invalid base servings:", meal.id);
      res.status(500).json({
        success: false,
        message: "Thông tin khẩu phần của món ăn không hợp lệ",
      });
      return;
    }
    const servingFactor = targetServings / baseServings;
    const adjustedIngredients = meal.ingredients.map((ing) => {
      const totalWeightG = ing.amountG * servingFactor;
      return {
        id: ing.id,
        name: ing.name,
        amountG: totalWeightG,
        formattedAmount: totalWeightG >= 1000 ? `${(totalWeightG / 1000).toFixed(1)} kg` : `${Math.round(totalWeightG)} g`,
      };
    });
    const nutritionSummary = calculateNutritionSummary(meal, targetServings);

    res.status(200).json({
      success: true,
      data: {
        id: meal.id,
        name: meal.name,
        description: meal.description,
        imageUrl: meal.imageUrl,
        category: meal.category,
        isVegetarian: meal.isVegetarian,
        servings: targetServings, // Số người ăn hiện tại
        prepTimeMinutes: meal.prepTimeMinutes,
        // Thời gian nấu tăng nhẹ thêm 15% cho mỗi người tăng thêm (quy đổi thực tế)
        cookTimeMinutes: Math.round(meal.cookTimeMinutes * (1 + (targetServings - 1) * 0.15)),

        nutritionSummary,
        groceryList: adjustedIngredients, // Danh sách thực phẩm cần mua
        cookingSteps: meal.cookingSteps,
      },
    });
  } catch (error) {
    console.error("GET MEAL DETAIL ERROR:", error);
    res.status(500).json({ success: false, message: "Không thể tải thông tin món ăn" });
  }
};

export const searchMeals = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const {
      q,
      category,
      vegetarian,
      page: pageQuery,
      limit: limitQuery,
    } = req.query;

    if (
      typeof q !== "string" ||
      q.trim().length === 0 ||
      q.trim().length > 100
    ) {
      res.status(400).json({
        success: false,
        message: "Từ khóa tìm kiếm phải có từ 1 đến 100 ký tự",
      });
      return;
    }
    if (category !== undefined && !isMealType(category)) {
      res.status(400).json({
        success: false,
        message: "Loại món ăn không hợp lệ",
      });
      return;
    }
    if (
      vegetarian !== undefined &&
      vegetarian !== "true" &&
      vegetarian !== "false"
    ) {
      res.status(400).json({
        success: false,
        message: "Bộ lọc món chay không hợp lệ",
      });
      return;
    }
    if (
      (pageQuery !== undefined && typeof pageQuery !== "string") ||
      (limitQuery !== undefined && typeof limitQuery !== "string")
    ) {
      res.status(400).json({
        success: false,
        message: "Tham số phân trang không hợp lệ",
      });
      return;
    }

    const page = pageQuery === undefined ? 1 : Number(pageQuery);
    const limit = limitQuery === undefined ? 10 : Number(limitQuery);
    if (
      !Number.isSafeInteger(page) ||
      page < 1 ||
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 100 ||
      !Number.isSafeInteger((page - 1) * limit)
    ) {
      res.status(400).json({
        success: false,
        message: "Trang phải là số nguyên dương; limit từ 1 đến 100",
      });
      return;
    }

    const keyword = q.trim();
    const where: Prisma.MealWhereInput = {
      isPublished: true,
      OR: [
        { name: { contains: keyword, mode: "insensitive" } },
        { description: { contains: keyword, mode: "insensitive" } },
        {
          ingredients: {
            some: { name: { contains: keyword, mode: "insensitive" } },
          },
        },
      ],
      ...(isMealType(category) ? { category } : {}),
      ...(vegetarian === "true" ? { isVegetarian: true } : {}),
    };

    const [meals, total] = await Promise.all([
      prisma.meal.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: { ingredients: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.meal.count({ where }),
    ]);
    const totalPages = Math.ceil(total / limit);

    res.status(200).json({
      success: true,
      data: meals.map((meal) => ({
        ...meal,
        nutritionSummary: calculateNutritionSummary(meal, meal.servings),
      })),
      pagination: {
        totalItems: total,
        currentPage: page,
        pageSize: limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (error: unknown) {
    console.error("SEARCH MEALS ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Không thể tìm kiếm món ăn",
    });
  }
};

export const getAllMeals = async (req: Request, res: Response): Promise<void> => {
  try {
    // 1. Lấy các tham số query từ URL (Mặc định page = 1, limit = 10)
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.max(1, Number(req.query.limit) || 10);
    const search = req.query.search as string;
    const category = req.query.category as MealType;
    const vegetarian = req.query.vegetarian;

    if (
      vegetarian !== undefined &&
      vegetarian !== "true" &&
      vegetarian !== "false"
    ) {
      res.status(400).json({
        success: false,
        message: "Bộ lọc món chay không hợp lệ",
      });
      return;
    }

    const skip = (page - 1) * limit;

    const whereCondition: {
      name?: { contains: string; mode: "insensitive" };
      category?: MealType;
      isVegetarian?: boolean;
      isPublished: boolean;
    } = { isPublished: true };

    if (search) {
      whereCondition.name = {
        contains: search,
        mode: "insensitive", // Không phân biệt chữ hoa/thường
      };
    }
    if (category && Object.values(MealType).includes(category)) {
      whereCondition.category = category;
    }
    if (vegetarian === "true") {
      whereCondition.isVegetarian = true;
    } else if (vegetarian === "false") {
      whereCondition.isVegetarian = false;
    }

    const [meals, total] = await Promise.all([
      prisma.meal.findMany({
        where: whereCondition,
        skip,
        take: limit,
        include: {
          ingredients: true,
          cookingSteps: { orderBy: { stepNumber: "asc" } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.meal.count({ where: whereCondition }),
    ]);

    const totalPages = Math.ceil(total / limit);

    res.status(200).json({
      success: true,
      data: meals.map((meal) => ({
        ...meal,
        nutritionSummary: calculateNutritionSummary(meal, meal.servings),
      })),
      pagination: {
        totalItems: total,
        currentPage: page,
        pageSize: limit,
        totalPages: totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (error: unknown) {
    console.error("🔥 GET ALL MEALS ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ nội bộ",
    });
  }
};
