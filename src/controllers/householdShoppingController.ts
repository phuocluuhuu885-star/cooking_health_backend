import type { Request, Response } from "express";
import { MealPeriod, Prisma, PrismaClient } from "../generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});
const prisma = new PrismaClient({ adapter });

const getHouseholdDateKey = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts.map(({ type, value }) => [type, value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
};

const getDateKey = (value: unknown) => {
  if (value === undefined) {
    return getHouseholdDateKey();
  }
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
    ? value
    : null;
};

const getMealPeriod = (value: unknown): MealPeriod | null =>
  value === MealPeriod.LUNCH || value === MealPeriod.DINNER ? value : null;

type AggregatedIngredient = {
  key: string;
  name: string;
  amountG: number;
  mealNames: Set<string>;
};

const synchronizeShoppingList = async (
  householdId: string,
  dateKey: string,
  mealPeriod: MealPeriod,
) =>
  prisma.$transaction(async transaction => {
    const plannedMeals = await transaction.householdPlannedMeal.findMany({
      where: { householdId, dateKey, mealPeriod },
      select: {
        servings: true,
        meal: {
          select: {
            name: true,
            servings: true,
            ingredients: { select: { name: true, amountG: true } },
          },
        },
      },
    });
    const ingredients = new Map<string, AggregatedIngredient>();
    for (const plannedMeal of plannedMeals) {
      if (plannedMeal.meal.servings <= 0) {
        throw new Error(`Meal has invalid base servings: ${plannedMeal.meal.name}`);
      }
      const servingFactor = plannedMeal.servings / plannedMeal.meal.servings;
      for (const ingredient of plannedMeal.meal.ingredients) {
        const name = ingredient.name.trim();
        const key = name.toLocaleLowerCase();
        if (!key || !Number.isFinite(ingredient.amountG)) {
          continue;
        }
        const existing = ingredients.get(key);
        if (existing) {
          existing.amountG += ingredient.amountG * servingFactor;
          existing.mealNames.add(plannedMeal.meal.name);
        } else {
          ingredients.set(key, {
            key,
            name,
            amountG: ingredient.amountG * servingFactor,
            mealNames: new Set([plannedMeal.meal.name]),
          });
        }
      }
    }

    const currentIngredients = [...ingredients.values()];
    for (const ingredient of currentIngredients) {
      await transaction.householdShoppingItem.upsert({
        where: {
          householdId_dateKey_mealPeriod_ingredientKey: {
            householdId,
            dateKey,
            mealPeriod,
            ingredientKey: ingredient.key,
          },
        },
        create: {
          householdId,
          dateKey,
          mealPeriod,
          ingredientKey: ingredient.key,
          name: ingredient.name,
          amountG: ingredient.amountG,
          mealNames: [...ingredient.mealNames],
        },
        update: {
          name: ingredient.name,
          amountG: ingredient.amountG,
          mealNames: [...ingredient.mealNames],
        },
      });
    }
    await transaction.householdShoppingItem.deleteMany({
      where: {
        householdId,
        dateKey,
        mealPeriod,
        ...(currentIngredients.length > 0
          ? { ingredientKey: { notIn: currentIngredients.map(item => item.key) } }
          : {}),
      },
    });
    return transaction.householdShoppingItem.findMany({
      where: { householdId, dateKey, mealPeriod },
      orderBy: { name: "asc" },
      select: {
        ingredientKey: true,
        name: true,
        amountG: true,
        mealNames: true,
        purchasedAt: true,
      },
    });
  });

const getMemberHousehold = async (userId: string) =>
  prisma.householdMember.findUnique({
    where: { userId },
    select: { householdId: true },
  });

const serializeShoppingItem = (item: {
  ingredientKey: string;
  name: string;
  amountG: number;
  mealNames: Prisma.JsonValue;
  purchasedAt: Date | null;
}) => ({
  ingredientKey: item.ingredientKey,
  name: item.name,
  amountG: item.amountG,
  mealNames: Array.isArray(item.mealNames)
    ? item.mealNames.filter((name): name is string => typeof name === "string")
    : [],
  purchasedAt: item.purchasedAt?.toISOString() ?? null,
});

export const getHouseholdShoppingList = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const userId = req.user?.id;
  const dateKey = getDateKey(req.query.date);
  const mealPeriod = getMealPeriod(req.query.mealPeriod);
  if (!userId) {
    res.status(401).json({
      success: false,
      message: "Phiên đăng nhập không hợp lệ",
    });
    return;
  }
  if (!dateKey || !mealPeriod) {
    res.status(400).json({
      success: false,
      message: "Ngày hoặc bữa ăn không hợp lệ",
    });
    return;
  }
  try {
    const member = await getMemberHousehold(userId);
    if (!member) {
      res.status(404).json({
        success: false,
        message: "Bạn chưa thuộc gia đình nào",
      });
      return;
    }
    const items = await synchronizeShoppingList(
      member.householdId,
      dateKey,
      mealPeriod,
    );
    res.status(200).json({
      success: true,
      data: {
        householdId: member.householdId,
        date: dateKey,
        mealPeriod,
        items: items.map(serializeShoppingItem),
      },
    });
  } catch (error) {
    console.error("Failed to load household shopping list", error);
    res.status(500).json({
      success: false,
      message: "Không thể tải danh sách đi chợ gia đình",
    });
  }
};

export const updateHouseholdShoppingItem = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const userId = req.user?.id;
  const dateKey = getDateKey(req.body?.date);
  const mealPeriod = getMealPeriod(req.body?.mealPeriod);
  const ingredientKey =
    typeof req.params.ingredientKey === "string"
      ? req.params.ingredientKey.trim()
      : "";
  const isPurchased = req.body?.isPurchased;
  if (!userId) {
    res.status(401).json({
      success: false,
      message: "Phiên đăng nhập không hợp lệ",
    });
    return;
  }
  if (
    !dateKey ||
    !mealPeriod ||
    !ingredientKey ||
    typeof isPurchased !== "boolean"
  ) {
    res.status(400).json({
      success: false,
      message: "Ngày, bữa ăn, nguyên liệu hoặc trạng thái mua không hợp lệ",
    });
    return;
  }
  try {
    const member = await getMemberHousehold(userId);
    if (!member) {
      res.status(404).json({
        success: false,
        message: "Bạn chưa thuộc gia đình nào",
      });
      return;
    }
    await synchronizeShoppingList(member.householdId, dateKey, mealPeriod);
    const updated = await prisma.householdShoppingItem.updateMany({
      where: {
        householdId: member.householdId,
        dateKey,
        mealPeriod,
        ingredientKey,
      },
      data: { purchasedAt: isPurchased ? new Date() : null },
    });
    if (updated.count !== 1) {
      res.status(404).json({
        success: false,
        message: "Nguyên liệu không còn trong danh sách đi chợ",
      });
      return;
    }
    const item = await prisma.householdShoppingItem.findUniqueOrThrow({
      where: {
        householdId_dateKey_mealPeriod_ingredientKey: {
          householdId: member.householdId,
          dateKey,
          mealPeriod,
          ingredientKey,
        },
      },
      select: {
        ingredientKey: true,
        name: true,
        amountG: true,
        mealNames: true,
        purchasedAt: true,
      },
    });
    res.status(200).json({
      success: true,
      data: serializeShoppingItem(item),
    });
  } catch (error) {
    console.error("Failed to update household shopping item", error);
    res.status(500).json({
      success: false,
      message: "Không thể cập nhật nguyên liệu đã mua",
    });
  }
};
