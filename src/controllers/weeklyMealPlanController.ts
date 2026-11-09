import type { Request, Response } from "express";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  MealPeriod,
  Prisma,
  PrismaClient,
} from "../generated/prisma/client.js";
import "dotenv/config";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});
const prisma = new PrismaClient({ adapter });
const getUtcDateKey = () => new Date().toISOString().slice(0, 10);

const getDateRange = (value: unknown) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const start = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(start.getTime()) ||
    start.toISOString().slice(0, 10) !== value
  ) {
    return null;
  }
  return { date: value, start };
};

export const saveWeeklyMealPlan = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const userId = req.user?.id;
  const submittedItems = req.body?.items;
  if (!userId) {
    res
      .status(401)
      .json({ success: false, message: "Phiên đăng nhập không hợp lệ" });
    return;
  }
  if (
    !Array.isArray(submittedItems) ||
    submittedItems.length < 1 ||
    submittedItems.length > 56
  ) {
    res.status(400).json({
      success: false,
      message: "Kế hoạch phải có từ 1 đến 56 món.",
    });
    return;
  }

  const todayDate = new Date(`${getUtcDateKey()}T00:00:00.000Z`);
  const validatedItems: Array<{
    mealId: string;
    dateKey: string;
    mealPeriod: MealPeriod;
    servings: number;
  }> = [];
  const uniqueKeys = new Set<string>();

  for (const rawItem of submittedItems) {
    if (typeof rawItem !== "object" || rawItem === null) {
      res
        .status(400)
        .json({ success: false, message: "Món trong kế hoạch không hợp lệ." });
      return;
    }
    const item = rawItem as Record<string, unknown>;
    const date = getDateRange(item.date);
    const servings = item.servings;
    if (
      !date ||
      typeof item.mealId !== "string" ||
      item.mealId.length === 0 ||
      (item.mealPeriod !== MealPeriod.LUNCH &&
        item.mealPeriod !== MealPeriod.DINNER) ||
      typeof servings !== "number" ||
      !Number.isFinite(servings) ||
      servings < 0.1 ||
      servings > 5
    ) {
      res.status(400).json({
        success: false,
        message: "Ngày, món, bữa hoặc khẩu phần trong kế hoạch không hợp lệ.",
      });
      return;
    }
    const daysFromToday = Math.round(
      (date.start.getTime() - todayDate.getTime()) / 86_400_000,
    );
    if (daysFromToday < 0 || daysFromToday > 6) {
      res.status(400).json({
        success: false,
        message: "Chỉ có thể lưu kế hoạch từ hôm nay đến 6 ngày tiếp theo.",
      });
      return;
    }
    const key = `${date.date}:${item.mealPeriod}:${item.mealId}`;
    if (uniqueKeys.has(key)) {
      res.status(400).json({
        success: false,
        message: "Một món bị lặp trong cùng bữa của kế hoạch.",
      });
      return;
    }
    uniqueKeys.add(key);
    validatedItems.push({
      mealId: item.mealId,
      dateKey: date.date,
      mealPeriod: item.mealPeriod,
      servings: Math.round(servings * 100) / 100,
    });
  }

  try {
    const mealIds = [...new Set(validatedItems.map((item) => item.mealId))];
    const databaseMeals = await prisma.meal.findMany({
      where: { id: { in: mealIds } },
      select: { id: true, category: true },
    });
    const mealById = new Map(databaseMeals.map((meal) => [meal.id, meal]));
    if (
      validatedItems.some(
        (item) =>
          !mealById.has(item.mealId) ||
          mealById.get(item.mealId)?.category !== item.mealPeriod,
      )
    ) {
      res.status(400).json({
        success: false,
        message: "Chỉ được thêm món bữa trưa/tối hợp lệ trong cơ sở dữ liệu.",
      });
      return;
    }

    const result = await prisma.$transaction(async (transaction) => {
      const periodKeys = [
        ...new Set(
          validatedItems.map((item) => `${item.dateKey}:${item.mealPeriod}`),
        ),
      ].sort();
      const lockKeys = periodKeys.map(
        (key) => `personal-meal:${userId}:${key}`,
      );
      await transaction.$queryRaw`
        SELECT pg_advisory_xact_lock(hashtextextended(lock_key, 0))::text AS locked
        FROM (
          SELECT unnest(ARRAY[${Prisma.join(lockKeys)}]::text[]) AS lock_key
          ORDER BY lock_key
        ) AS ordered_lock_keys
      `;

      const completedMeals = await transaction.mealCompletion.findMany({
        where: {
          userId,
          scopeKey: "PERSONAL",
          OR: validatedItems.map((item) => ({
            dateKey: item.dateKey,
            mealPeriod: item.mealPeriod,
          })),
        },
        select: { dateKey: true, mealPeriod: true },
      });
      const completedKeys = new Set(
        completedMeals.map((item) => `${item.dateKey}:${item.mealPeriod}`),
      );
      const todayDateKey = getUtcDateKey();
      const plannedToday = await transaction.plannedMeal.findMany({
        where: {
          userId,
          dateKey: todayDateKey,
          mealPeriod: {
            in: [
              ...new Set(
                validatedItems
                  .filter((item) => item.dateKey === todayDateKey)
                  .map((item) => item.mealPeriod),
              ),
            ],
          },
        },
        select: { dateKey: true, mealPeriod: true },
        distinct: ["dateKey", "mealPeriod"],
      });
      const plannedTodayKeys = new Set(
        plannedToday.map((item) => `${item.dateKey}:${item.mealPeriod}`),
      );
      const skippedPeriods: Array<{
        date: string;
        mealPeriod: MealPeriod;
        reason: "ALREADY_PLANNED" | "COMPLETED";
      }> = [];
      const skippedKeys = new Set<string>();
      validatedItems.forEach((item) => {
        const key = `${item.dateKey}:${item.mealPeriod}`;
        const isCompleted = completedKeys.has(key);
        const alreadyPlanned =
          item.dateKey === todayDateKey && plannedTodayKeys.has(key);
        if ((isCompleted || alreadyPlanned) && !skippedKeys.has(key)) {
          skippedKeys.add(key);
          skippedPeriods.push({
            date: item.dateKey,
            mealPeriod: item.mealPeriod,
            reason: isCompleted ? "COMPLETED" : "ALREADY_PLANNED",
          });
        }
      });

      const itemsToSave = validatedItems
        .filter(
          (item) => !skippedKeys.has(`${item.dateKey}:${item.mealPeriod}`),
        )
        .map((item) => ({
          userId,
          mealId: item.mealId,
          dateKey: item.dateKey,
          mealPeriod: item.mealPeriod,
          servings: item.servings,
        }));
      const result = itemsToSave.length
        ? await transaction.plannedMeal.createMany({
            data: itemsToSave,
            skipDuplicates: true,
          })
        : { count: 0 };
      return { savedCount: result.count, skippedPeriods };
    });

    res.status(201).json({
      success: true,
      message: `Đã lưu ${result.savedCount} món vào thực đơn cá nhân.${result.skippedPeriods.length ? ` Giữ nguyên ${result.skippedPeriods.length} bữa đã có món hoặc đã hoàn tất.` : ""}`,
      data: result,
    });
  } catch (error) {
    console.error("SAVE WEEKLY MEAL PLAN ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Không thể lưu kế hoạch 7 ngày.",
    });
  }
};
