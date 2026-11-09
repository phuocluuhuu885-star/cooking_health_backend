import type { Request, Response } from "express";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  MealPeriod,
  MealType,
  Prisma,
  PrismaClient,
} from "../generated/prisma/client.js";
import { calculateNutritionSummary } from "../services/mealNutritionService.js";
import {
  estimateMealPrice,
  estimateMealPricePerServing,
  getBudgetDistance,
  readMealPriceBudget,
} from "../services/mealPriceEstimateService.js";
import {
  ensureHouseholdMealPoll,
  finalizeHouseholdMealPoll,
  getHouseholdDateKey,
} from "../services/householdMealPollService.js";
import { createHouseholdNotifications } from "../services/householdNotificationService.js";
import "dotenv/config";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});
const prisma = new PrismaClient({ adapter });

type Nutrition = {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

const emptyNutrition = (): Nutrition => ({
  calories: 0,
  proteinG: 0,
  carbsG: 0,
  fatG: 0,
});

const addNutrition = (target: Nutrition, value: Nutrition) => {
  target.calories += value.calories;
  target.proteinG += value.proteinG;
  target.carbsG += value.carbsG;
  target.fatG += value.fatG;
};

const readNutrition = (value: Prisma.JsonValue): Nutrition | null => {
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

const readSnapshotNutrition = (value: Prisma.JsonValue): Nutrition | null => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const total = (value as Prisma.JsonObject).total;
  return typeof total === "object" && total !== null && !Array.isArray(total)
    ? readNutrition(total as Prisma.JsonValue)
    : null;
};

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
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { date: value, start, end };
};

const mealNutritionScore = (nutrition: Nutrition, targets: Nutrition) => {
  const calories = nutrition.calories || 1;
  const targetCalories =
    targets.proteinG * 4 + targets.carbsG * 4 + targets.fatG * 9 || 1;
  const ratios = [
    (nutrition.proteinG * 4) / calories,
    (nutrition.carbsG * 4) / calories,
    (nutrition.fatG * 9) / calories,
  ];
  const targetRatios = [
    (targets.proteinG * 4) / targetCalories,
    (targets.carbsG * 4) / targetCalories,
    (targets.fatG * 9) / targetCalories,
  ];
  return ratios.reduce(
    (score, ratio, index) => score + Math.abs(ratio - targetRatios[index]!),
    0,
  );
};

const getFamilyMember = (userId: string) =>
  prisma.householdMember.findFirst({
    where: { userId },
    select: {
      householdId: true,
      household: {
        select: {
          members: {
            select: {
              userId: true,
              user: { select: { healthProfile: true } },
            },
          },
        },
      },
    },
  });

export const getFamilyMealRecommendations = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const userId = req.user?.id;
  const dateRange = getDateRange(req.body?.date);
  if (!userId) {
    res.status(401).json({
      success: false,
      message: "Phiên đăng nhập không hợp lệ",
    });
    return;
  }
  if (!dateRange) {
    res.status(400).json({
      success: false,
      message: "Ngày phải đúng định dạng YYYY-MM-DD",
    });
    return;
  }
  const budget = readMealPriceBudget(req.body?.budget);
  if (!budget) {
    res.status(400).json({
      success: false,
      message: "Khoảng ngân sách món ăn không hợp lệ.",
    });
    return;
  }

  try {
    const member = await getFamilyMember(userId);
    if (!member) {
      res.status(404).json({
        success: false,
        message: "Bạn chưa thuộc gia đình nào",
      });
      return;
    }
    const savedMealBudgets = await prisma.mealBudget.findMany({
      where: { householdId: member.householdId },
      select: { mealPeriod: true, limitVnd: true },
    });
    const mealBudgets = Object.fromEntries(
      savedMealBudgets.map(({ mealPeriod, limitVnd }) => [mealPeriod, limitVnd]),
    ) as Partial<Record<MealPeriod, number>>;

    const profiles = member.household.members.flatMap(({ userId: id, user }) =>
      user.healthProfile ? [{ userId: id, profile: user.healthProfile }] : [],
    );
    if (profiles.length === 0) {
      res.status(409).json({
        success: false,
        message:
          "Cần ít nhất một thành viên hoàn thành hồ sơ sức khỏe để tạo gợi ý thực đơn gia đình.",
      });
      return;
    }
    const memberIds = member.household.members.map(({ userId: id }) => id);
    const profileIds = profiles.map(({ userId: id }) => id);

    const [
      householdCompletions,
      personalCompletions,
      householdMeals,
      personalMeals,
      manualEntries,
      scannedEntries,
      meals,
    ] = await Promise.all([
      prisma.mealCompletion.findMany({
        where: { householdId: member.householdId, dateKey: dateRange.date },
        select: { mealPeriod: true, nutritionSummary: true },
      }),
      prisma.mealCompletion.findMany({
        where: {
          userId: { in: profileIds },
          dateKey: dateRange.date,
          scopeKey: "PERSONAL",
          consumedItems: { gt: 0 },
        },
        select: { userId: true, mealPeriod: true, nutritionSummary: true },
      }),
      prisma.householdPlannedMeal.findMany({
        where: {
          householdId: member.householdId,
          isConsumed: true,
          consumedAt: { gte: dateRange.start, lt: dateRange.end },
        },
        include: { meal: { include: { ingredients: true } } },
      }),
      prisma.plannedMeal.findMany({
        where: {
          userId: { in: profileIds },
          isConsumed: true,
          consumedAt: { gte: dateRange.start, lt: dateRange.end },
        },
        include: { meal: { include: { ingredients: true } } },
      }),
      prisma.consumedMealEntry.findMany({
        where: {
          userId: { in: profileIds },
          consumedAt: { gte: dateRange.start, lt: dateRange.end },
        },
        select: { mealPeriod: true, nutritionSummary: true },
      }),
      prisma.scannedConsumedMealEntry.findMany({
        where: {
          userId: { in: profileIds },
          dateKey: dateRange.date,
        },
        select: { mealPeriod: true, nutritionSummary: true },
      }),
      prisma.meal.findMany({
        where: { category: { in: [MealType.LUNCH, MealType.DINNER] } },
        include: { ingredients: true },
      }),
    ]);

    const targets = profiles.reduce((total, { profile }) => {
      total.calories += profile.dailyCaloriesTarget;
      total.proteinG += profile.targetProteinG;
      total.carbsG += profile.targetCarbsG;
      total.fatG += profile.targetFatG;
      return total;
    }, emptyNutrition());
    const householdNutritionShare = profiles.length / memberIds.length;
    const consumed = emptyNutrition();
    const consumedPeriods = new Set<MealPeriod>();
    let unavailableNutritionItems = 0;
    const addMealNutrition = (
      meal: (typeof householdMeals)[number]["meal"],
      servings: number,
      period: MealPeriod,
    ) => {
      consumedPeriods.add(period);
      const nutrition = calculateNutritionSummary(meal, servings);
      if (!nutrition) {
        unavailableNutritionItems += 1;
        return;
      }
      addNutrition(consumed, {
        calories: nutrition.total.calories * householdNutritionShare,
        proteinG: nutrition.total.proteinG * householdNutritionShare,
        carbsG: nutrition.total.carbsG * householdNutritionShare,
        fatG: nutrition.total.fatG * householdNutritionShare,
      });
    };

    householdCompletions.forEach((completion) => {
      consumedPeriods.add(completion.mealPeriod);
      const nutrition = readNutrition(completion.nutritionSummary);
      if (nutrition) {
        addNutrition(consumed, {
          calories: nutrition.calories * householdNutritionShare,
          proteinG: nutrition.proteinG * householdNutritionShare,
          carbsG: nutrition.carbsG * householdNutritionShare,
          fatG: nutrition.fatG * householdNutritionShare,
        });
      }
    });
    householdMeals.forEach((meal) => {
      if (
        householdCompletions.some(
          (completion) => completion.mealPeriod === meal.mealPeriod,
        )
      ) {
        return;
      }
      addMealNutrition(meal.meal, meal.servings, meal.mealPeriod);
    });
    const completedPersonalPeriods = new Set(
      personalCompletions.map(
        (completion) => `${completion.userId}:${completion.mealPeriod}`,
      ),
    );
    personalCompletions.forEach((completion) => {
      const nutrition = readNutrition(completion.nutritionSummary);
      if (nutrition) addNutrition(consumed, nutrition);
      else unavailableNutritionItems += 1;
    });
    personalMeals.forEach((meal) => {
      if (completedPersonalPeriods.has(`${meal.userId}:${meal.mealPeriod}`)) {
        return;
      }
      const nutrition = calculateNutritionSummary(meal.meal, meal.servings);
      if (nutrition) addNutrition(consumed, nutrition.total);
      else unavailableNutritionItems += 1;
    });
    manualEntries.forEach((entry) => {
      const nutrition = readSnapshotNutrition(entry.nutritionSummary);
      if (nutrition) addNutrition(consumed, nutrition);
      else unavailableNutritionItems += 1;
    });
    scannedEntries.forEach((entry) => {
      const nutrition = readSnapshotNutrition(entry.nutritionSummary);
      if (nutrition) addNutrition(consumed, nutrition);
      else unavailableNutritionItems += 1;
    });

    const remaining = {
      calories: Math.max(0, targets.calories - consumed.calories),
      proteinG: Math.max(0, targets.proteinG - consumed.proteinG),
      carbsG: Math.max(0, targets.carbsG - consumed.carbsG),
      fatG: Math.max(0, targets.fatG - consumed.fatG),
    };
    const maxServings = Math.max(1, Math.min(50, profiles.length * 2));
    const recommendations = (period: MealPeriod) => {
      if (consumedPeriods.has(period)) return [];
      const mealTargets = {
        calories: remaining.calories * 0.35,
        proteinG: remaining.proteinG * 0.35,
        carbsG: remaining.carbsG * 0.35,
        fatG: remaining.fatG * 0.35,
      };
      return meals
        .filter((meal) => meal.category === period)
        .flatMap((meal) => {
          const nutritionSummary = calculateNutritionSummary(
            meal,
            meal.servings,
          );
          if (!nutritionSummary) return [];
          const perServing = nutritionSummary.perServing;
          const limits = [maxServings];
          if (perServing.calories > 0) {
            limits.push(mealTargets.calories / perServing.calories);
          }
          if (perServing.proteinG > 0) {
            limits.push(mealTargets.proteinG / perServing.proteinG);
          }
          if (perServing.carbsG > 0) {
            limits.push(mealTargets.carbsG / perServing.carbsG);
          }
          if (perServing.fatG > 0) {
            limits.push(mealTargets.fatG / perServing.fatG);
          }
          const recommendedServings =
            Math.floor(Math.max(0, Math.min(...limits)) * 10) / 10;
          if (recommendedServings < 0.1) return [];
          const suggestedNutrition = {
            calories: perServing.calories * recommendedServings,
            proteinG: perServing.proteinG * recommendedServings,
            carbsG: perServing.carbsG * recommendedServings,
            fatG: perServing.fatG * recommendedServings,
          };
          const estimatedPricePerServing = estimateMealPricePerServing(meal);
          const estimatedPrice = estimateMealPrice(meal, recommendedServings);
          const mealBudgetVnd = mealBudgets[period];
          return [
            {
              meal: {
                id: meal.id,
                name: meal.name,
                description: meal.description,
                imageUrl: meal.imageUrl,
                category: meal.category,
                prepTimeMinutes: meal.prepTimeMinutes,
                cookTimeMinutes: meal.cookTimeMinutes,
                nutritionSummary,
              },
              recommendedServings,
              estimatedPricePerServing,
              estimatedPrice,
              recommendationReason:
                "Xếp hạng nội bộ theo tổng mục tiêu dinh dưỡng của các thành viên có hồ sơ.",
              score:
                mealNutritionScore(suggestedNutrition, mealTargets) +
                getBudgetDistance(estimatedPricePerServing, budget) * 0.2 +
                (mealBudgetVnd
                  ? Math.max(0, estimatedPrice.maxVnd - mealBudgetVnd) /
                    mealBudgetVnd
                  : 0),
            },
          ];
        })
        .sort((first, second) => {
          const limit = mealBudgets[period];
          if (!limit) return first.score - second.score;
          const firstOverage = Math.max(0, first.estimatedPrice.maxVnd - limit);
          const secondOverage = Math.max(
            0,
            second.estimatedPrice.maxVnd - limit,
          );
          return firstOverage - secondOverage || first.score - second.score;
        })
        .slice(0, 4)
        .map(({ score: _score, ...recommendation }) => recommendation);
    };

    const missingProfiles = memberIds.length - profiles.length;
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({
      success: true,
      data: {
        date: dateRange.date,
        targets,
        consumed,
        remaining,
        consumedPeriods: [...consumedPeriods],
        unavailableNutritionItems,
        source: "LOCAL",
        budget,
        mealBudgets,
        message: `Gợi ý được tính nội bộ theo hồ sơ sức khỏe của ${
          profiles.length
        } thành viên${
          missingProfiles
            ? `; bỏ qua ${missingProfiles} thành viên chưa hoàn thành hồ sơ`
            : ""
        }. Khẩu phần là tổng cho gia đình.`,
        recommendations: {
          LUNCH: recommendations(MealPeriod.LUNCH),
          DINNER: recommendations(MealPeriod.DINNER),
        },
      },
    });
  } catch (error) {
    console.error("GET FAMILY MEAL RECOMMENDATIONS ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Không thể tạo gợi ý thực đơn gia đình lúc này.",
    });
  }
};

type WeeklyItem = {
  date: string;
  mealId: string;
  mealPeriod: MealPeriod;
  servings: number;
};

const isMealPeriod = (value: unknown): value is MealPeriod =>
  value === MealPeriod.LUNCH || value === MealPeriod.DINNER;

export const saveFamilyWeeklyMealPlan = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const userId = req.user?.id;
  const submittedItems = req.body?.items;
  if (!userId) {
    res.status(401).json({
      success: false,
      message: "Phiên đăng nhập không hợp lệ",
    });
    return;
  }
  if (
    !Array.isArray(submittedItems) ||
    submittedItems.length < 1 ||
    submittedItems.length > 56
  ) {
    res.status(400).json({
      success: false,
      message: "Kế hoạch gia đình phải có từ 1 đến 56 món.",
    });
    return;
  }

  const todayDateKey = getHouseholdDateKey();
  const today = new Date(`${todayDateKey}T00:00:00.000Z`);
  const items: WeeklyItem[] = [];
  const uniqueKeys = new Set<string>();
  for (const rawItem of submittedItems) {
    if (typeof rawItem !== "object" || rawItem === null) {
      res.status(400).json({
        success: false,
        message: "Món trong kế hoạch gia đình không hợp lệ.",
      });
      return;
    }
    const item = rawItem as Record<string, unknown>;
    const date = getDateRange(item.date);
    if (
      !date ||
      typeof item.mealId !== "string" ||
      !item.mealId ||
      !isMealPeriod(item.mealPeriod) ||
      typeof item.servings !== "number" ||
      !Number.isFinite(item.servings) ||
      item.servings < 0.1 ||
      item.servings > 100
    ) {
      res.status(400).json({
        success: false,
        message: "Ngày, món, bữa hoặc khẩu phần gia đình không hợp lệ.",
      });
      return;
    }
    const daysFromToday = Math.round(
      (date.start.getTime() - today.getTime()) / 86_400_000,
    );
    if (daysFromToday < 0 || daysFromToday > 6) {
      res.status(400).json({
        success: false,
        message:
          "Chỉ có thể lên thực đơn gia đình từ hôm nay đến 6 ngày tiếp theo.",
      });
      return;
    }
    const key = `${date.date}:${item.mealPeriod}:${item.mealId}`;
    if (uniqueKeys.has(key)) {
      res.status(400).json({
        success: false,
        message: "Một món bị lặp trong cùng bữa gia đình.",
      });
      return;
    }
    uniqueKeys.add(key);
    items.push({
      date: date.date,
      mealId: item.mealId,
      mealPeriod: item.mealPeriod,
      servings: Math.round(item.servings * 100) / 100,
    });
  }

  try {
    const member = await prisma.householdMember.findFirst({
      where: { userId },
      select: { householdId: true },
    });
    if (!member) {
      res.status(404).json({
        success: false,
        message: "Bạn chưa thuộc gia đình nào.",
      });
      return;
    }
    const mealIds = [...new Set(items.map((item) => item.mealId))];
    const meals = await prisma.meal.findMany({
      where: { id: { in: mealIds } },
      select: { id: true, name: true, category: true },
    });
    const mealsById = new Map(meals.map((meal) => [meal.id, meal]));
    if (
      items.some(
        (item) => mealsById.get(item.mealId)?.category !== item.mealPeriod,
      )
    ) {
      res.status(400).json({
        success: false,
        message: "Chỉ được thêm món bữa trưa/tối hợp lệ trong thư viện.",
      });
      return;
    }

    const groups = new Map<string, WeeklyItem[]>();
    items.forEach((item) => {
      const key = `${item.date}:${item.mealPeriod}`;
      groups.set(key, [...(groups.get(key) ?? []), item]);
    });
    const todayDate = getHouseholdDateKey();
    const todayGroupKeys = [...groups.keys()].filter((key) =>
      key.startsWith(`${todayDate}:`),
    );
    const [existingCompletions, existingTodayMeals] = await Promise.all([
      prisma.mealCompletion.findMany({
        where: {
          householdId: member.householdId,
          OR: [...groups.keys()].map((key) => {
            const [dateKey, mealPeriod] = key.split(":") as [
              string,
              MealPeriod,
            ];
            return { dateKey, mealPeriod };
          }),
        },
        select: { dateKey: true, mealPeriod: true },
      }),
      todayGroupKeys.length
        ? prisma.householdPlannedMeal.findMany({
            where: {
              householdId: member.householdId,
              dateKey: todayDate,
              mealPeriod: {
                in: todayGroupKeys.map(
                  (key) => key.split(":")[1] as MealPeriod,
                ),
              },
            },
            select: { dateKey: true, mealPeriod: true },
            distinct: ["dateKey", "mealPeriod"],
          })
        : Promise.resolve([]),
    ]);
    const completedKeys = new Set(
      existingCompletions.map((item) => `${item.dateKey}:${item.mealPeriod}`),
    );
    const plannedTodayKeys = new Set(
      existingTodayMeals.map((item) => `${item.dateKey}:${item.mealPeriod}`),
    );
    const skippedPeriods: Array<{
      date: string;
      mealPeriod: MealPeriod;
      reason: "ALREADY_PLANNED" | "COMPLETED";
    }> = [];
    for (const key of groups.keys()) {
      const [date, mealPeriod] = key.split(":") as [string, MealPeriod];
      const isCompleted = completedKeys.has(key);
      const alreadyPlanned = date === todayDate && plannedTodayKeys.has(key);
      if (isCompleted || alreadyPlanned) {
        skippedPeriods.push({
          date,
          mealPeriod,
          reason: isCompleted ? "COMPLETED" : "ALREADY_PLANNED",
        });
        groups.delete(key);
      }
    }

    const orderedKeys = [...groups.keys()].sort();
    if (orderedKeys.length === 0) {
      res.status(201).json({
        success: true,
        message:
          "Không thêm món mới. Các bữa hôm nay đã có món hoặc những bữa đã hoàn tất được giữ nguyên.",
        data: {
          proposedCount: 0,
          plannedCount: 0,
          skippedPeriods,
        },
      });
      return;
    }
    for (const key of orderedKeys) {
      const [date, mealPeriod] = key.split(":") as [string, MealPeriod];
      const poll = await ensureHouseholdMealPoll(
        prisma,
        member.householdId,
        date,
        mealPeriod,
      );
      await finalizeHouseholdMealPoll(prisma, poll.id);
    }

    let result:
      | {
          proposedCount: number;
          plannedCount: number;
          skippedPeriods: typeof skippedPeriods;
        }
      | undefined;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        result = await prisma.$transaction(
          async (transaction) => {
            let proposedCount = 0;
            let plannedCount = 0;
            const newlySkippedPeriods: typeof skippedPeriods = [];
            for (const key of orderedKeys) {
              const [date, mealPeriod] = key.split(":") as [string, MealPeriod];
              const periodItems = groups.get(key) ?? [];
              const poll =
                await transaction.householdMealPoll.findUniqueOrThrow({
                  where: {
                    householdId_dateKey_mealPeriod: {
                      householdId: member.householdId,
                      dateKey: date,
                      mealPeriod,
                    },
                  },
                  select: { id: true, closedAt: true, closesAt: true },
                });
              const completion = await transaction.mealCompletion.findFirst({
                where: {
                  householdId: member.householdId,
                  dateKey: date,
                  mealPeriod,
                },
                select: { id: true },
              });
              if (completion) {
                newlySkippedPeriods.push({
                  date,
                  mealPeriod,
                  reason: "COMPLETED",
                });
                continue;
              }
              if (date === todayDate) {
                const plannedToday =
                  await transaction.householdPlannedMeal.findFirst({
                    where: {
                      householdId: member.householdId,
                      dateKey: date,
                      mealPeriod,
                    },
                    select: { id: true },
                  });
                if (plannedToday) {
                  newlySkippedPeriods.push({
                    date,
                    mealPeriod,
                    reason: "ALREADY_PLANNED",
                  });
                  continue;
                }
              }

              const pollIsClosed =
                Boolean(poll.closedAt) || poll.closesAt <= new Date();
              if (pollIsClosed) {
                const created =
                  await transaction.householdPlannedMeal.createMany({
                    data: periodItems.map((item) => ({
                      householdId: member.householdId,
                      addedByUserId: userId,
                      mealId: item.mealId,
                      dateKey: date,
                      mealPeriod,
                      servings: item.servings,
                    })),
                    skipDuplicates: true,
                  });
                plannedCount += created.count;
                if (created.count > 0) {
                  await createHouseholdNotifications(transaction, {
                    householdId: member.householdId,
                    excludeUserId: userId,
                    eventKey: `${poll.id}:ai-plan:${Date.now()}:${attempt}`,
                    type: "MEAL_PLAN_UPDATED",
                    title: "Thực đơn gia đình đã được cập nhật",
                    body: `Đã thêm ${created.count} món vào bữa ${
                      mealPeriod === MealPeriod.LUNCH ? "trưa" : "tối"
                    } ngày ${date}.`,
                    data: {
                      householdId: member.householdId,
                      date,
                      mealPeriod,
                    },
                  });
                }
              } else {
                const created =
                  await transaction.householdMealPollOption.createMany({
                    data: periodItems.map((item) => ({
                      pollId: poll.id,
                      mealId: item.mealId,
                      proposedByUserId: userId,
                      servings: item.servings,
                    })),
                    skipDuplicates: true,
                  });
                proposedCount += created.count;
                if (created.count > 0) {
                  await createHouseholdNotifications(transaction, {
                    householdId: member.householdId,
                    excludeUserId: userId,
                    eventKey: `${poll.id}:ai-proposal:${Date.now()}:${attempt}`,
                    type: "MEAL_ADDED",
                    title: "Có thực đơn AI mới để bình chọn",
                    body: `Đã đề xuất ${created.count} món cho bữa ${
                      mealPeriod === MealPeriod.LUNCH ? "trưa" : "tối"
                    } ngày ${date}.`,
                    data: {
                      householdId: member.householdId,
                      date,
                      mealPeriod,
                    },
                  });
                }
              }
            }
            return {
              proposedCount,
              plannedCount,
              skippedPeriods: newlySkippedPeriods,
            };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
        break;
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2034" &&
          attempt < 2
        ) {
          continue;
        }
        throw error;
      }
    }

    if (!result) {
      throw new Error("Unable to save the family meal plan.");
    }
    const allSkippedPeriods = [...skippedPeriods, ...result.skippedPeriods];
    res.status(201).json({
      success: true,
      message: `Đã gửi ${
        result.proposedCount
      } món vào bình chọn gia đình và thêm trực tiếp ${
        result.plannedCount
      } món vào thực đơn.${
        allSkippedPeriods.length
          ? ` Giữ nguyên ${allSkippedPeriods.length} bữa đã có món hoặc đã hoàn tất.`
          : ""
      }`,
      data: {
        proposedCount: result.proposedCount,
        plannedCount: result.plannedCount,
        skippedPeriods: allSkippedPeriods,
      },
    });
  } catch (error) {
    console.error("SAVE FAMILY WEEKLY MEAL PLAN ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Không thể lưu thực đơn gia đình.",
    });
  }
};
