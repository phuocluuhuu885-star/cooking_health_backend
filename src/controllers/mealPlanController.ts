import type { Request, Response } from "express";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  MealPeriod,
  Prisma,
  PrismaClient,
} from "../generated/prisma/client.js";
import { calculateNutritionSummary } from "../services/mealNutritionService.js";
import {
  estimateMealPrice,
  type EstimatedPriceRange,
} from "../services/mealPriceEstimateService.js";
import { createMealCompletionSnapshot } from "../services/mealCompletionService.js";
import {
  parseMealScanResult,
  type MealScanResult,
} from "../services/mealScanService.js";
import { getOrCreateCommunityMealPlanCopy } from "../services/communityMealPlanCopy.js";
import "dotenv/config";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({ adapter });

const getVietnamDateKey = (date = new Date()): string => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts.map(({ type, value }) => [type, value])
  );
  return `${values.year}-${values.month}-${values.day}`;
};

const getDateKey = (value: unknown): string | null => {
  if (value === undefined) {
    return getVietnamDateKey();
  }
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const parsedDate = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsedDate.getTime()) &&
    parsedDate.toISOString().slice(0, 10) === value
    ? value
    : null;
};

const isMealPeriod = (value: unknown): value is MealPeriod =>
  typeof value === "string" &&
  Object.values(MealPeriod).some((period) => period === value);

const lockPersonalMeal = async (
  transaction: Prisma.TransactionClient,
  userId: string,
  dateKey: string,
  mealPeriod: MealPeriod
): Promise<void> => {
  const lockKey = `personal-meal:${userId}:${dateKey}:${mealPeriod}`;
  await transaction.$queryRaw`
    SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))::text AS "locked"
  `;
};

const emptyNutrition = () => ({
  calories: 0,
  proteinG: 0,
  carbsG: 0,
  fatG: 0,
});

const getCompletedMealIds = (
  completion: { items: Prisma.JsonValue } | null
): Set<string> => {
  if (!completion || !Array.isArray(completion.items)) {
    return new Set();
  }
  return new Set(
    completion.items.flatMap((item) =>
      typeof item === "object" &&
      item !== null &&
      !Array.isArray(item) &&
      "mealId" in item &&
      typeof item.mealId === "string"
        ? [item.mealId]
        : []
    )
  );
};

type PlannedMealResponseItem = {
  id: string;
  servings: number;
  addedAt: Date;
  isConsumed: boolean;
  consumedAt: Date | null;
  meal: {
    id: string;
    communityMealId: string | null;
    name: string;
    description: string | null;
    imageUrl: string | null;
    category: string;
  };
  nutritionSummary: ReturnType<typeof calculateNutritionSummary>;
  estimatedPrice: EstimatedPriceRange;
};

type MealPeriodResponse = {
  items: PlannedMealResponseItem[];
  nutritionSummary: ReturnType<typeof emptyNutrition>;
  estimatedPrice: EstimatedPriceRange;
  unavailableNutritionItems: number;
};

type ConsumedNutrition = {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

const roundNutrition = (nutrition: ConsumedNutrition): ConsumedNutrition => ({
  calories: Math.round(nutrition.calories),
  proteinG: Math.round(nutrition.proteinG * 10) / 10,
  carbsG: Math.round(nutrition.carbsG * 10) / 10,
  fatG: Math.round(nutrition.fatG * 10) / 10,
});

const readNutritionSnapshot = (
  value: Prisma.JsonValue
): ConsumedNutrition | null => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const nutrition = value as Prisma.JsonObject;
  const { calories, proteinG, carbsG, fatG } = nutrition;
  if (
    typeof calories !== "number" ||
    typeof proteinG !== "number" ||
    typeof carbsG !== "number" ||
    typeof fatG !== "number"
  ) {
    return null;
  }
  return { calories, proteinG, carbsG, fatG };
};

const readSnapshotNutrition = (
  value: Prisma.JsonValue | undefined
): ConsumedNutrition | null => {
  if (
    value === undefined ||
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    return null;
  }
  const snapshot = value as Prisma.JsonObject;
  const total = snapshot.total;
  if (typeof total !== "object" || total === null || Array.isArray(total)) {
    return null;
  }
  const nutrition = total as Prisma.JsonObject;
  const { calories, proteinG, carbsG, fatG } = nutrition;
  if (
    typeof calories !== "number" ||
    typeof proteinG !== "number" ||
    typeof carbsG !== "number" ||
    typeof fatG !== "number"
  ) {
    return null;
  }
  return { calories, proteinG, carbsG, fatG };
};

const toDateKey = (date: Date) => date.toISOString().slice(0, 10);

const getReportRange = (period: "WEEK" | "MONTH", anchor: string) => {
  const date = new Date(`${anchor}T00:00:00.000Z`);
  let start: Date;
  let end: Date;

  if (period === "WEEK") {
    start = new Date(date);
    start.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
    end = new Date(start);
    end.setUTCDate(start.getUTCDate() + 6);
  } else {
    start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
    end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
  }

  return { startDate: toDateKey(start), endDate: toDateKey(end) };
};

const isReportPeriod = (value: unknown): value is "WEEK" | "MONTH" =>
  value === "WEEK" || value === "MONTH";

export const addMealToPlan = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({
        success: false,
        message: "Phiên đăng nhập không hợp lệ",
      });
      return;
    }

    const {
      mealId: submittedMealId,
      communityMealId: submittedCommunityMealId,
      mealPeriod,
    } = req.body ?? {};
    const communityMealId =
      typeof submittedCommunityMealId === "string"
        ? submittedCommunityMealId.trim()
        : "";
    const hasSubmittedMealId =
      typeof submittedMealId === "string" &&
      submittedMealId.trim().length > 0;
    const servingsValue = req.body?.servings ?? 1;
    const servings =
      typeof servingsValue === "number" ? servingsValue : Number.NaN;
    const dateKey = getDateKey(req.body?.date);

    if (hasSubmittedMealId === Boolean(communityMealId)) {
      res.status(400).json({
        success: false,
        message: "Mã món ăn không hợp lệ",
      });
      return;
    }
    let mealId =
      typeof submittedMealId === "string" ? submittedMealId.trim() : "";
    if (!isMealPeriod(mealPeriod)) {
      res.status(400).json({
        success: false,
        message: "Bữa ăn chỉ được là LUNCH hoặc DINNER",
      });
      return;
    }
    if (!Number.isFinite(servings) || servings <= 0) {
      res.status(400).json({
        success: false,
        message: "Số khẩu phần phải là số lớn hơn 0",
      });
      return;
    }
    if (!dateKey) {
      res.status(400).json({
        success: false,
        message: "Ngày phải đúng định dạng YYYY-MM-DD",
      });
      return;
    }
    if (communityMealId) {
      const communityMealCopyId = await prisma.$transaction((transaction) =>
        getOrCreateCommunityMealPlanCopy(transaction, communityMealId),
      );
      if (!communityMealCopyId) {
        res.status(404).json({
          success: false,
          message: "Không tìm thấy món cộng đồng đã được duyệt",
        });
        return;
      }
      mealId = communityMealCopyId;
    }
    const meal = communityMealId
      ? await prisma.meal.findUnique({
          where: { id: mealId },
          select: { id: true },
        })
      : await prisma.meal.findFirst({
          where: { id: mealId, isPublished: true },
          select: { id: true },
        });
    if (!meal) {
      res.status(404).json({
        success: false,
        message: "Không tìm thấy món ăn",
      });
      return;
    }

    const plannedMeal = await prisma.$transaction(async (transaction) => {
      await lockPersonalMeal(transaction, userId, dateKey, mealPeriod);
      const completion = await transaction.mealCompletion.findUnique({
        where: {
          userId_dateKey_mealPeriod_scopeKey: {
            userId,
            dateKey,
            mealPeriod,
            scopeKey: "PERSONAL",
          },
        },
        select: { id: true },
      });
      if (completion) {
        return null;
      }

      return transaction.plannedMeal.create({
        data: {
          userId,
          mealId,
          mealPeriod,
          dateKey,
          servings,
        },
        include: {
          meal: {
            include: { ingredients: true },
          },
        },
      });
    });

    if (!plannedMeal) {
      res.status(409).json({
        success: false,
        message: "Bữa ăn đã hoàn thành và không thể thêm món mới",
      });
      return;
    }

    res.status(201).json({
      success: true,
      message: "Đã thêm món vào bữa ăn",
      data: {
        id: plannedMeal.id,
        date: plannedMeal.dateKey,
        mealPeriod: plannedMeal.mealPeriod,
        servings: plannedMeal.servings,
        addedAt: plannedMeal.createdAt,
        isConsumed: plannedMeal.isConsumed,
        consumedAt: plannedMeal.consumedAt,
        meal: {
          id: plannedMeal.meal.id,
          name: plannedMeal.meal.name,
          imageUrl: plannedMeal.meal.imageUrl,
          category: plannedMeal.meal.category,
          communityMealId: plannedMeal.meal.communitySourceId,
        },
        nutritionSummary: calculateNutritionSummary(
          plannedMeal.meal,
          plannedMeal.servings
        ),
      },
    });
  } catch (error: unknown) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      res.status(409).json({
        success: false,
        message: "Món này đã được thêm vào bữa ăn đã chọn trong ngày",
      });
      return;
    }

    console.error("ADD MEAL TO PLAN ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Không thể thêm món vào bữa ăn",
    });
  }
};

export const getMealPlan = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({
        success: false,
        message: "Phiên đăng nhập không hợp lệ",
      });
      return;
    }

    const dateKey = getDateKey(req.query.date);
    if (!dateKey) {
      res.status(400).json({
        success: false,
        message: "Ngày phải đúng định dạng YYYY-MM-DD",
      });
      return;
    }

    const plannedMeals = await prisma.plannedMeal.findMany({
      where: { userId, dateKey },
      include: {
        meal: {
          include: { ingredients: true },
        },
      },
      orderBy: { createdAt: "asc" },
    });
    const completion = await prisma.mealCompletion.findUnique({
      where: {
        userId_dateKey_mealPeriod_scopeKey: {
          userId,
          dateKey,
          mealPeriod: MealPeriod.LUNCH,
          scopeKey: "PERSONAL",
        },
      },
      select: { mealPeriod: true, completedAt: true, items: true },
    });
    const dinnerCompletion = await prisma.mealCompletion.findUnique({
      where: {
        userId_dateKey_mealPeriod_scopeKey: {
          userId,
          dateKey,
          mealPeriod: MealPeriod.DINNER,
          scopeKey: "PERSONAL",
        },
      },
      select: { mealPeriod: true, completedAt: true, items: true },
    });

    const meals: Record<MealPeriod, MealPeriodResponse> = {
      LUNCH: {
        items: [],
        nutritionSummary: emptyNutrition(),
        estimatedPrice: { minVnd: 0, maxVnd: 0 },
        unavailableNutritionItems: 0,
      },
      DINNER: {
        items: [],
        nutritionSummary: emptyNutrition(),
        estimatedPrice: { minVnd: 0, maxVnd: 0 },
        unavailableNutritionItems: 0,
      },
    };
    const completedMealIds = {
      [MealPeriod.LUNCH]: getCompletedMealIds(completion),
      [MealPeriod.DINNER]: getCompletedMealIds(dinnerCompletion),
    };

    for (const plannedMeal of plannedMeals) {
      const nutritionSummary = calculateNutritionSummary(
        plannedMeal.meal,
        plannedMeal.servings
      );
      const estimatedPrice = estimateMealPrice(
        plannedMeal.meal,
        plannedMeal.servings
      );
      const entry = meals[plannedMeal.mealPeriod];
      const isConsumed =
        plannedMeal.isConsumed ||
        completedMealIds[plannedMeal.mealPeriod].has(plannedMeal.mealId);

      entry.items.push({
        id: plannedMeal.id,
        servings: plannedMeal.servings,
        addedAt: plannedMeal.createdAt,
        isConsumed,
        consumedAt:
          plannedMeal.consumedAt ??
          (isConsumed
            ? plannedMeal.mealPeriod === MealPeriod.LUNCH
              ? completion?.completedAt
              : dinnerCompletion?.completedAt
            : null) ??
          null,
        meal: {
          id: plannedMeal.meal.id,
          name: plannedMeal.meal.name,
          description: plannedMeal.meal.description,
          imageUrl: plannedMeal.meal.imageUrl,
          category: plannedMeal.meal.category,
          communityMealId: plannedMeal.meal.communitySourceId,
        },
        nutritionSummary,
        estimatedPrice,
      });

      entry.estimatedPrice.minVnd += estimatedPrice.minVnd;
      entry.estimatedPrice.maxVnd += estimatedPrice.maxVnd;
      if (nutritionSummary) {
        entry.nutritionSummary.calories += nutritionSummary.total.calories;
        entry.nutritionSummary.proteinG += nutritionSummary.total.proteinG;
        entry.nutritionSummary.carbsG += nutritionSummary.total.carbsG;
        entry.nutritionSummary.fatG += nutritionSummary.total.fatG;
      } else {
        entry.unavailableNutritionItems += 1;
      }
    }

    for (const period of [MealPeriod.LUNCH, MealPeriod.DINNER]) {
      const summary = meals[period].nutritionSummary;
      summary.proteinG = Math.round(summary.proteinG * 10) / 10;
      summary.carbsG = Math.round(summary.carbsG * 10) / 10;
      summary.fatG = Math.round(summary.fatG * 10) / 10;
    }

    res.status(200).json({
      success: true,
      data: {
        date: dateKey,
        meals: {
          ...meals,
          LUNCH: {
            ...meals.LUNCH,
            isCompleted: Boolean(completion),
            completedAt: completion?.completedAt ?? null,
          },
          DINNER: {
            ...meals.DINNER,
            isCompleted: Boolean(dinnerCompletion),
            completedAt: dinnerCompletion?.completedAt ?? null,
          },
        },
      },
    });
  } catch (error: unknown) {
    console.error("GET MEAL PLAN ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Không thể tải thực đơn trong ngày",
    });
  }
};

export const updateMealConsumption = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({
        success: false,
        message: "Phiên đăng nhập không hợp lệ",
      });
      return;
    }

    const id = req.params.id;
    const { isConsumed } = req.body ?? {};
    if (
      typeof id !== "string" ||
      id.length === 0 ||
      typeof isConsumed !== "boolean"
    ) {
      res.status(400).json({
        success: false,
        message: "Mã món và trạng thái đã ăn không hợp lệ",
      });
      return;
    }

    const plannedMeal = await prisma.plannedMeal.findFirst({
      where: { id, userId },
      select: { dateKey: true, mealPeriod: true },
    });
    if (!plannedMeal) {
      res.status(404).json({
        success: false,
        message: "Không tìm thấy món trong thực đơn của bạn",
      });
      return;
    }
    const result = await prisma.$transaction(async (transaction) => {
      await lockPersonalMeal(
        transaction,
        userId,
        plannedMeal.dateKey,
        plannedMeal.mealPeriod
      );
      const currentMeal = await transaction.plannedMeal.findFirst({
        where: { id, userId },
        select: { id: true },
      });
      if (!currentMeal) {
        return "NOT_FOUND" as const;
      }
      const completion = await transaction.mealCompletion.findUnique({
        where: {
          userId_dateKey_mealPeriod_scopeKey: {
            userId,
            dateKey: plannedMeal.dateKey,
            mealPeriod: plannedMeal.mealPeriod,
            scopeKey: "PERSONAL",
          },
        },
        select: { id: true },
      });
      if (completion) {
        return "COMPLETED" as const;
      }

      const consumedAt = isConsumed ? new Date() : null;
      await transaction.plannedMeal.update({
        where: { id },
        data: { isConsumed, consumedAt },
      });
      return { consumedAt };
    });
    if (result === "NOT_FOUND") {
      res.status(404).json({
        success: false,
        message: "Không tìm thấy món trong thực đơn của bạn",
      });
      return;
    }
    if (result === "COMPLETED") {
      res.status(409).json({
        success: false,
        message: "Bữa ăn đã hoàn thành và không thể thay đổi",
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: isConsumed
        ? "Đã ghi nhận món đã ăn"
        : "Đã bỏ ghi nhận món đã ăn",
      data: { id, isConsumed, consumedAt: result.consumedAt },
    });
  } catch (error: unknown) {
    console.error("UPDATE MEAL CONSUMPTION ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Không thể cập nhật trạng thái món ăn",
    });
  }
};

export const completePersonalMeal = async (
  req: Request,
  res: Response
): Promise<void> => {
  const userId = req.user?.id;
  const dateKey = getDateKey(req.body?.date);
  const mealPeriod = req.body?.mealPeriod;
  if (!userId) {
    res.status(401).json({
      success: false,
      message: "Phiên đăng nhập không hợp lệ",
    });
    return;
  }
  if (!dateKey || !isMealPeriod(mealPeriod)) {
    res.status(400).json({
      success: false,
      message: "Ngày hoặc bữa ăn không hợp lệ",
    });
    return;
  }
  try {
    const result = await prisma.$transaction(async (transaction) => {
      await lockPersonalMeal(transaction, userId, dateKey, mealPeriod);
      const plannedMeals = await transaction.plannedMeal.findMany({
        where: { userId, dateKey, mealPeriod },
        include: { meal: { include: { ingredients: true } } },
        orderBy: { createdAt: "asc" },
      });
      if (plannedMeals.length === 0) {
        return null;
      }

      const snapshot = createMealCompletionSnapshot(plannedMeals);
      const completion = await transaction.mealCompletion.upsert({
        where: {
          userId_dateKey_mealPeriod_scopeKey: {
            userId,
            dateKey,
            mealPeriod,
            scopeKey: "PERSONAL",
          },
        },
        create: {
          userId,
          dateKey,
          mealPeriod,
          scopeKey: "PERSONAL",
          items: snapshot.items as Prisma.InputJsonValue,
          nutritionSummary: snapshot.nutritionSummary as Prisma.InputJsonValue,
          consumedItems: snapshot.consumedItems,
          unavailableNutritionItems: snapshot.unavailableNutritionItems,
        },
        update: {
          completedAt: new Date(),
          items: snapshot.items as Prisma.InputJsonValue,
          nutritionSummary: snapshot.nutritionSummary as Prisma.InputJsonValue,
          consumedItems: snapshot.consumedItems,
          unavailableNutritionItems: snapshot.unavailableNutritionItems,
        },
      });
      await transaction.plannedMeal.updateMany({
        where: { userId, dateKey, mealPeriod },
        data: { isConsumed: true, consumedAt: completion.completedAt },
      });
      return { completion, snapshot };
    });
    if (!result) {
      res.status(400).json({
        success: false,
        message: "Bữa ăn chưa có món nào để hoàn thành",
      });
      return;
    }
    res.status(200).json({
      success: true,
      message: "Đã cập nhật món đã ăn và dinh dưỡng",
      data: {
        date: dateKey,
        mealPeriod,
        completedAt: result.completion.completedAt,
        ...result.snapshot,
      },
    });
  } catch (error: unknown) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      res.status(409).json({
        success: false,
        message:
          "Không thể cập nhật xác nhận bữa ăn. Vui lòng tải lại và thử lại.",
      });
      return;
    }
    console.error("COMPLETE PERSONAL MEAL ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Không thể hoàn thành bữa ăn",
    });
  }
};

export const deletePlannedMeal = async (
  req: Request,
  res: Response
): Promise<void> => {
  const userId = req.user?.id;
  const id = req.params.id;
  if (!userId) {
    res.status(401).json({
      success: false,
      message: "Phiên đăng nhập không hợp lệ",
    });
    return;
  }
  if (typeof id !== "string" || id.length === 0) {
    res.status(400).json({
      success: false,
      message: "Mã món ăn không hợp lệ",
    });
    return;
  }
  try {
    const plannedMeal = await prisma.plannedMeal.findFirst({
      where: { id, userId },
      select: { dateKey: true, mealPeriod: true },
    });
    if (!plannedMeal) {
      res.status(404).json({
        success: false,
        message: "Không tìm thấy món trong thực đơn của bạn",
      });
      return;
    }
    const result = await prisma.$transaction(async (transaction) => {
      await lockPersonalMeal(
        transaction,
        userId,
        plannedMeal.dateKey,
        plannedMeal.mealPeriod
      );
      const currentMeal = await transaction.plannedMeal.findFirst({
        where: { id, userId },
        select: { id: true },
      });
      if (!currentMeal) {
        return "NOT_FOUND" as const;
      }
      const completion = await transaction.mealCompletion.findUnique({
        where: {
          userId_dateKey_mealPeriod_scopeKey: {
            userId,
            dateKey: plannedMeal.dateKey,
            mealPeriod: plannedMeal.mealPeriod,
            scopeKey: "PERSONAL",
          },
        },
        select: { id: true },
      });
      if (completion) {
        return "COMPLETED" as const;
      }
      await transaction.plannedMeal.delete({ where: { id } });
      return "DELETED" as const;
    });
    if (result === "NOT_FOUND") {
      res.status(404).json({
        success: false,
        message: "Không tìm thấy món trong thực đơn của bạn",
      });
      return;
    }
    if (result === "COMPLETED") {
      res.status(409).json({
        success: false,
        message: "Bữa ăn đã hoàn thành và không thể thay đổi",
      });
      return;
    }
    res
      .status(200)
      .json({ success: true, message: "Đã xóa món khỏi thực đơn" });
  } catch (error: unknown) {
    console.error("DELETE PLANNED MEAL ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Không thể xóa món khỏi thực đơn",
    });
  }
};

export const addConsumedMealEntry = async (
  req: Request,
  res: Response
): Promise<void> => {
  const userId = req.user?.id;
  const { mealId, mealPeriod, servings } = req.body as {
    mealId?: unknown;
    mealPeriod?: unknown;
    servings?: unknown;
  };

  if (!userId) {
    res.status(401).json({
      success: false,
      message: "Phiên đăng nhập không hợp lệ",
    });
    return;
  }
  if (
    typeof mealId !== "string" ||
    mealId.trim().length === 0 ||
    !isMealPeriod(mealPeriod) ||
    typeof servings !== "number" ||
    !Number.isFinite(servings) ||
    servings <= 0 ||
    servings > 100
  ) {
    res.status(400).json({
      success: false,
      message: "Món ăn, bữa ăn hoặc số khẩu phần không hợp lệ",
    });
    return;
  }

  try {
    const meal = await prisma.meal.findFirst({
      where: { id: mealId, isPublished: true },
      include: { ingredients: true },
    });
    if (!meal) {
      res
        .status(404)
        .json({ success: false, message: "Không tìm thấy món ăn" });
      return;
    }

    const nutritionSummary = calculateNutritionSummary(meal, servings);
    if (!nutritionSummary) {
      res.status(422).json({
        success: false,
        message: "Món ăn chưa có đủ dữ liệu để tính dinh dưỡng",
      });
      return;
    }

    const entry = await prisma.consumedMealEntry.create({
      data: {
        userId,
        mealId,
        mealPeriod,
        servings,
        nutritionSummary: nutritionSummary as Prisma.InputJsonValue,
      },
      include: { meal: true },
    });
    res.status(201).json({
      success: true,
      data: {
        id: entry.id,
        mealId: entry.mealId,
        name: entry.meal.name,
        imageUrl: entry.meal.imageUrl,
        mealPeriod: entry.mealPeriod,
        servings: entry.servings,
        consumedAt: entry.consumedAt.toISOString(),
        source: "MANUAL",
        nutrition: nutritionSummary.total,
      },
    });
  } catch (error: unknown) {
    console.error("ADD CONSUMED MEAL ENTRY ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Không thể ghi nhận món đã tiêu thụ",
    });
  }
};

export const addScannedConsumedMealEntry = async (
  req: Request,
  res: Response
): Promise<void> => {
  const userId = req.user?.id;
  const { mealPeriod, scanResult: rawScanResult } = req.body as {
    mealPeriod?: unknown;
    scanResult?: unknown;
  };

  if (!userId) {
    res.status(401).json({
      success: false,
      message: "Phiên đăng nhập không hợp lệ",
    });
    return;
  }
  if (!isMealPeriod(mealPeriod)) {
    res.status(400).json({
      success: false,
      message: "Bữa ăn không hợp lệ",
    });
    return;
  }

  let scanResult: MealScanResult;
  try {
    scanResult = parseMealScanResult(rawScanResult);
  } catch {
    res.status(400).json({
      success: false,
      message: "Kết quả quét món ăn không hợp lệ",
    });
    return;
  }
  if (!scanResult.recognized || !scanResult.dishName?.trim()) {
    res.status(400).json({
      success: false,
      message: "Không thể ghi nhận món chưa được nhận diện",
    });
    return;
  }

  const totalNutrition = {
    calories: scanResult.totalNutrition.caloriesKcal,
    proteinG: scanResult.totalNutrition.proteinG,
    carbsG: scanResult.totalNutrition.carbohydratesG,
    fatG: scanResult.totalNutrition.fatG,
    fiberG: scanResult.totalNutrition.fiberG,
  };
  const nutritionSummary = {
    total: totalNutrition,
    perServing: totalNutrition,
    servings: 1,
  };

  try {
    const entry = await prisma.scannedConsumedMealEntry.create({
      data: {
        userId,
        name: scanResult.dishName.trim().slice(0, 120),
        mealPeriod,
        dateKey: getVietnamDateKey(),
        servings: 1,
        nutritionSummary: nutritionSummary as Prisma.InputJsonValue,
        scanResult: scanResult as Prisma.InputJsonValue,
      },
    });
    res.status(201).json({
      success: true,
      data: {
        id: entry.id,
        mealId: `scan:${entry.id}`,
        name: entry.name,
        imageUrl: null,
        mealPeriod: entry.mealPeriod,
        servings: entry.servings,
        consumedAt: entry.consumedAt.toISOString(),
        source: "SCANNED",
        nutrition: {
          calories: totalNutrition.calories,
          proteinG: totalNutrition.proteinG,
          carbsG: totalNutrition.carbsG,
          fatG: totalNutrition.fatG,
        },
      },
    });
  } catch (error: unknown) {
    console.error("ADD SCANNED CONSUMED MEAL ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Không thể ghi nhận món đã ăn",
    });
  }
};

export const getDailyConsumedMeals = async (
  req: Request,
  res: Response
): Promise<void> => {
  const userId = req.user?.id;
  const dateKey = getDateKey(req.query.date);
  if (!userId) {
    res.status(401).json({
      success: false,
      message: "Phiên đăng nhập không hợp lệ",
    });
    return;
  }
  if (!dateKey) {
    res.status(400).json({
      success: false,
      message: "Ngày phải đúng định dạng YYYY-MM-DD",
    });
    return;
  }

  const rangeStart = new Date(`${dateKey}T00:00:00.000Z`);
  const rangeEnd = new Date(rangeStart);
  rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 1);

  try {
    const [
      personalMeals,
      householdMeals,
      dailyCompletions,
      manualEntries,
      scannedEntries,
    ] = await Promise.all([
        prisma.plannedMeal.findMany({
          where: {
            userId,
            isConsumed: true,
            consumedAt: { gte: rangeStart, lt: rangeEnd },
          },
          include: { meal: { include: { ingredients: true } } },
          orderBy: { consumedAt: "asc" },
        }),
        prisma.householdPlannedMeal.findMany({
          where: {
            consumedByUserId: userId,
            isConsumed: true,
            consumedAt: { gte: rangeStart, lt: rangeEnd },
          },
          include: { meal: { include: { ingredients: true } } },
          orderBy: { consumedAt: "asc" },
        }),
        prisma.mealCompletion.findMany({
          where: {
            userId,
            completedAt: { gte: rangeStart, lt: rangeEnd },
            consumedItems: { gt: 0 },
          },
          orderBy: { completedAt: "asc" },
        }),
        prisma.consumedMealEntry.findMany({
          where: {
            userId,
            consumedAt: { gte: rangeStart, lt: rangeEnd },
          },
          include: { meal: true },
          orderBy: { consumedAt: "asc" },
        }),
        prisma.scannedConsumedMealEntry.findMany({
          where: {
            userId,
            dateKey,
          },
          orderBy: { consumedAt: "asc" },
        }),
      ]);

    const plannedDateKeys = [
      ...new Set([
        ...personalMeals.map((meal) => meal.dateKey),
        ...householdMeals.map((meal) => meal.dateKey),
      ]),
    ];
    const mealPeriodLocks =
      plannedDateKeys.length > 0
        ? await prisma.mealCompletion.findMany({
            where: {
              userId,
              dateKey: { in: plannedDateKeys },
            },
            select: {
              dateKey: true,
              mealPeriod: true,
              scopeKey: true,
            },
          })
        : [];
    const completedPeriods = new Set(
      mealPeriodLocks.map(
        (completion) =>
          `${completion.scopeKey}:${completion.dateKey}:${completion.mealPeriod}`
      )
    );

    const individualItems = [
      ...personalMeals
        .filter(
          (meal) =>
            !completedPeriods.has(`PERSONAL:${meal.dateKey}:${meal.mealPeriod}`)
        )
        .map((meal) => ({
          id: meal.id,
          mealId: meal.mealId,
          communityMealId: meal.meal.communitySourceId,
          name: meal.meal.name,
          imageUrl: meal.meal.imageUrl,
          mealPeriod: meal.mealPeriod,
          servings: meal.servings,
          consumedAt: meal.consumedAt!,
          source: "PERSONAL" as const,
          nutrition:
            calculateNutritionSummary(meal.meal, meal.servings)?.total ?? null,
        })),
      ...householdMeals
        .filter(
          (meal) =>
            !completedPeriods.has(
              `${meal.householdId}:${meal.dateKey}:${meal.mealPeriod}`
            )
        )
        .map((meal) => ({
          id: meal.id,
          mealId: meal.mealId,
          communityMealId: meal.meal.communitySourceId,
          name: meal.meal.name,
          imageUrl: meal.meal.imageUrl,
          mealPeriod: meal.mealPeriod,
          servings: meal.servings,
          consumedAt: meal.consumedAt!,
          source: "HOUSEHOLD" as const,
          nutrition:
            calculateNutritionSummary(meal.meal, meal.servings)?.total ?? null,
        })),
      ...manualEntries.map((entry) => ({
        id: entry.id,
        mealId: entry.mealId,
        communityMealId: entry.meal.communitySourceId,
        name: entry.meal.name,
        imageUrl: entry.meal.imageUrl,
        mealPeriod: entry.mealPeriod,
        servings: entry.servings,
        consumedAt: entry.consumedAt,
        source: "MANUAL" as const,
        nutrition: readSnapshotNutrition(entry.nutritionSummary),
      })),
      ...scannedEntries.map((entry) => ({
        id: entry.id,
        mealId: `scan:${entry.id}`,
        name: entry.name,
        imageUrl: null,
        mealPeriod: entry.mealPeriod,
        servings: entry.servings,
        consumedAt: entry.consumedAt,
        source: "SCANNED" as const,
        nutrition: readSnapshotNutrition(entry.nutritionSummary),
      })),
    ];

    const completedItems = dailyCompletions.flatMap((completion) => {
      if (!Array.isArray(completion.items)) {
        return [];
      }
      return completion.items.flatMap((value, index) => {
        if (
          typeof value !== "object" ||
          value === null ||
          Array.isArray(value)
        ) {
          return [];
        }
        const item = value as Prisma.JsonObject;
        if (
          typeof item.mealId !== "string" ||
          typeof item.name !== "string" ||
          typeof item.servings !== "number"
        ) {
          return [];
        }
        return [
          {
            id: `${completion.id}:${index}`,
            mealId: item.mealId,
            communityMealId:
              typeof item.communityMealId === "string"
                ? item.communityMealId
                : null,
            name: item.name,
            imageUrl: null,
            mealPeriod: completion.mealPeriod,
            servings: item.servings,
            consumedAt: completion.completedAt,
            source:
              completion.scopeKey === "PERSONAL"
                ? ("PERSONAL" as const)
                : ("HOUSEHOLD" as const),
            nutrition: readSnapshotNutrition(item.nutrition),
          },
        ];
      });
    });

    const items = [...individualItems, ...completedItems].sort(
      (first, second) =>
        first.consumedAt.getTime() - second.consumedAt.getTime()
    );
    res.status(200).json({
      success: true,
      data: {
        date: dateKey,
        items: items.map((item) => ({
          ...item,
          consumedAt: item.consumedAt.toISOString(),
        })),
      },
    });
  } catch (error: unknown) {
    console.error("GET DAILY CONSUMED MEALS ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Không thể tải thực phẩm đã tiêu thụ trong ngày",
    });
  }
};

export const getConsumptionReport = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({
        success: false,
        message: "Phiên đăng nhập không hợp lệ",
      });
      return;
    }

    const period = req.query.period;
    const anchorDate = getDateKey(req.query.date);
    if (!isReportPeriod(period) || !anchorDate) {
      res.status(400).json({
        success: false,
        message:
          "Kỳ báo cáo phải là WEEK hoặc MONTH; ngày phải đúng YYYY-MM-DD",
      });
      return;
    }

    const { startDate, endDate } = getReportRange(period, anchorDate);
    const rangeStart = new Date(`${startDate}T00:00:00.000Z`);
    const rangeEndExclusive = new Date(`${endDate}T00:00:00.000Z`);
    rangeEndExclusive.setUTCDate(rangeEndExclusive.getUTCDate() + 1);
    const reportDays: Array<{
      date: string;
      nutrition: ConsumedNutrition;
      consumedItems: number;
      unavailableNutritionItems: number;
    }> = [];
    const dayByDate = new Map<string, (typeof reportDays)[number]>();

    for (
      let cursor = new Date(`${startDate}T00:00:00.000Z`);
      toDateKey(cursor) <= endDate;
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    ) {
      const date = toDateKey(cursor);
      const day = {
        date,
        nutrition: emptyNutrition(),
        consumedItems: 0,
        unavailableNutritionItems: 0,
      };
      reportDays.push(day);
      dayByDate.set(date, day);
    }

    const [
      personalMeals,
      householdMeals,
      completions,
      manualEntries,
      scannedEntries,
    ] = await Promise.all([
        prisma.plannedMeal.findMany({
          where: {
            userId,
            isConsumed: true,
            consumedAt: { gte: rangeStart, lt: rangeEndExclusive },
          },
          include: {
            meal: {
              include: { ingredients: true },
            },
          },
          orderBy: { consumedAt: "asc" },
        }),
        prisma.householdPlannedMeal.findMany({
          where: {
            consumedByUserId: userId,
            isConsumed: true,
            consumedAt: { gte: rangeStart, lt: rangeEndExclusive },
          },
          include: {
            meal: {
              include: { ingredients: true },
            },
          },
          orderBy: { consumedAt: "asc" },
        }),
        prisma.mealCompletion.findMany({
          where: {
            userId,
            completedAt: { gte: rangeStart, lt: rangeEndExclusive },
          },
          orderBy: { completedAt: "asc" },
        }),
        prisma.consumedMealEntry.findMany({
          where: {
            userId,
            consumedAt: { gte: rangeStart, lt: rangeEndExclusive },
          },
          orderBy: { consumedAt: "asc" },
        }),
        prisma.scannedConsumedMealEntry.findMany({
          where: {
            userId,
            dateKey: { gte: startDate, lte: endDate },
          },
          orderBy: { consumedAt: "asc" },
        }),
      ]);
    const completedPersonalPeriods = new Set(
      completions
        .filter((completion) => completion.scopeKey === "PERSONAL")
        .map((completion) => `${completion.dateKey}:${completion.mealPeriod}`)
    );
    const completedHouseholdPeriods = new Set(
      completions
        .filter((completion) => completion.scopeKey !== "PERSONAL")
        .map(
          (completion) =>
            `${completion.householdId}:${completion.dateKey}:${completion.mealPeriod}`
        )
    );
    const consumedMeals = [
      ...personalMeals.filter(
        (meal) =>
          !completedPersonalPeriods.has(`${meal.dateKey}:${meal.mealPeriod}`)
      ),
      ...householdMeals.filter(
        (meal) =>
          !completedHouseholdPeriods.has(
            `${meal.householdId}:${meal.dateKey}:${meal.mealPeriod}`
          )
      ),
    ].sort(
      (first, second) =>
        (first.consumedAt?.getTime() ?? 0) - (second.consumedAt?.getTime() ?? 0)
    );

    const totals = emptyNutrition();
    let unavailableNutritionItems = 0;
    for (const plannedMeal of consumedMeals) {
      if (!plannedMeal.consumedAt) {
        continue;
      }
      const day = dayByDate.get(toDateKey(plannedMeal.consumedAt));
      if (!day) {
        continue;
      }

      day.consumedItems += 1;
      const nutrition = calculateNutritionSummary(
        plannedMeal.meal,
        plannedMeal.servings
      );
      if (!nutrition) {
        day.unavailableNutritionItems += 1;
        unavailableNutritionItems += 1;
        continue;
      }

      day.nutrition.calories += nutrition.total.calories;
      day.nutrition.proteinG += nutrition.total.proteinG;
      day.nutrition.carbsG += nutrition.total.carbsG;
      day.nutrition.fatG += nutrition.total.fatG;
      totals.calories += nutrition.total.calories;
      totals.proteinG += nutrition.total.proteinG;
      totals.carbsG += nutrition.total.carbsG;
      totals.fatG += nutrition.total.fatG;
    }

    for (const completion of completions) {
      const day = dayByDate.get(toDateKey(completion.completedAt));
      if (!day) {
        continue;
      }
      day.consumedItems += completion.consumedItems;
      const nutrition = readNutritionSnapshot(completion.nutritionSummary);
      if (!nutrition) {
        day.unavailableNutritionItems += completion.unavailableNutritionItems;
        unavailableNutritionItems += completion.unavailableNutritionItems;
        continue;
      }
      day.nutrition.calories += nutrition.calories;
      day.nutrition.proteinG += nutrition.proteinG;
      day.nutrition.carbsG += nutrition.carbsG;
      day.nutrition.fatG += nutrition.fatG;
      totals.calories += nutrition.calories;
      totals.proteinG += nutrition.proteinG;
      totals.carbsG += nutrition.carbsG;
      totals.fatG += nutrition.fatG;
    }

    for (const entry of manualEntries) {
      const day = dayByDate.get(toDateKey(entry.consumedAt));
      if (!day) {
        continue;
      }

      day.consumedItems += 1;
      const nutrition = readSnapshotNutrition(entry.nutritionSummary);
      if (!nutrition) {
        day.unavailableNutritionItems += 1;
        unavailableNutritionItems += 1;
        continue;
      }

      day.nutrition.calories += nutrition.calories;
      day.nutrition.proteinG += nutrition.proteinG;
      day.nutrition.carbsG += nutrition.carbsG;
      day.nutrition.fatG += nutrition.fatG;
      totals.calories += nutrition.calories;
      totals.proteinG += nutrition.proteinG;
      totals.carbsG += nutrition.carbsG;
      totals.fatG += nutrition.fatG;
    }
    for (const entry of scannedEntries) {
      const day = dayByDate.get(entry.dateKey);
      if (!day) {
        continue;
      }

      day.consumedItems += 1;
      const nutrition = readSnapshotNutrition(entry.nutritionSummary);
      if (!nutrition) {
        day.unavailableNutritionItems += 1;
        unavailableNutritionItems += 1;
        continue;
      }

      day.nutrition.calories += nutrition.calories;
      day.nutrition.proteinG += nutrition.proteinG;
      day.nutrition.carbsG += nutrition.carbsG;
      day.nutrition.fatG += nutrition.fatG;
      totals.calories += nutrition.calories;
      totals.proteinG += nutrition.proteinG;
      totals.carbsG += nutrition.carbsG;
      totals.fatG += nutrition.fatG;
    }

    res.status(200).json({
      success: true,
      data: {
        period,
        startDate,
        endDate,
        totals: roundNutrition(totals),
        unavailableNutritionItems,
        days: reportDays.map((day) => ({
          ...day,
          nutrition: roundNutrition(day.nutrition),
        })),
      },
    });
  } catch (error: unknown) {
    console.error("GET CONSUMPTION REPORT ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Không thể tải báo cáo dinh dưỡng",
    });
  }
};
