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
  getGeminiApiErrorMessage,
  getGeminiModelName,
} from "../services/geminiApi.js";
import {
  estimateMealPrice,
  estimateMealPricePerServing,
  getBudgetDistance,
  readMealPriceBudget,
  type EstimatedPriceRange,
} from "../services/mealPriceEstimateService.js";
import "dotenv/config";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});
const prisma = new PrismaClient({ adapter });
const getUtcDateKey = () => new Date().toISOString().slice(0, 10);

type Nutrition = {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

type RecommendationCandidate = {
  meal: {
    id: string;
    name: string;
    description: string | null;
    imageUrl: string | null;
    category: MealType;
    prepTimeMinutes: number;
    cookTimeMinutes: number;
    nutritionSummary: ReturnType<typeof calculateNutritionSummary>;
  };
  recommendedServings: number;
  recommendationReason: string;
  estimatedPricePerServing: EstimatedPriceRange;
  estimatedPrice: EstimatedPriceRange;
  score: number;
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

const readSnapshotNutrition = (
  value: Prisma.JsonValue | undefined,
): Nutrition | null => {
  if (
    value === undefined ||
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    return null;
  }
  const total = (value as Prisma.JsonObject).total;
  if (typeof total !== "object" || total === null || Array.isArray(total)) {
    return null;
  }
  return readNutrition(total);
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

const calculateServingLimit = (perServing: Nutrition, remaining: Nutrition) => {
  const limits = [1];
  if (perServing.calories > 0) {
    limits.push(remaining.calories / perServing.calories);
  }
  if (perServing.proteinG > 0) {
    limits.push(remaining.proteinG / perServing.proteinG);
  }
  if (perServing.carbsG > 0) {
    limits.push(remaining.carbsG / perServing.carbsG);
  }
  if (perServing.fatG > 0) {
    limits.push(remaining.fatG / perServing.fatG);
  }
  return Math.floor(Math.max(0, Math.min(...limits)) * 10) / 10;
};

const nutritionFitScore = (nutrition: Nutrition, targets: Nutrition) => {
  const candidateCalories = nutrition.calories || 1;
  const targetCalories =
    targets.proteinG * 4 + targets.carbsG * 4 + targets.fatG * 9 || 1;
  const candidateShares = [
    (nutrition.proteinG * 4) / candidateCalories,
    (nutrition.carbsG * 4) / candidateCalories,
    (nutrition.fatG * 9) / candidateCalories,
  ];
  const targetShares = [
    (targets.proteinG * 4) / targetCalories,
    (targets.carbsG * 4) / targetCalories,
    (targets.fatG * 9) / targetCalories,
  ];
  return candidateShares.reduce(
    (score, share, index) => score + Math.abs(share - targetShares[index]!),
    0,
  );
};

const scaleNutritionSummary = (
  summary: ReturnType<typeof calculateNutritionSummary>,
  servings: number,
): ReturnType<typeof calculateNutritionSummary> => {
  if (!summary) return null;
  return {
    ...summary,
    servings,
    totalWeightG:
      Math.round((summary.totalWeightG / summary.servings) * servings * 10) /
      10,
    total: {
      calories: Math.round(summary.perServing.calories * servings),
      proteinG: Math.round(summary.perServing.proteinG * servings * 10) / 10,
      carbsG: Math.round(summary.perServing.carbsG * servings * 10) / 10,
      fatG: Math.round(summary.perServing.fatG * servings * 10) / 10,
    },
  };
};

const getRecommendationsFromGemini = async (
  periodCandidates: Record<MealPeriod, RecommendationCandidate[]>,
  targets: Nutrition,
  consumed: Nutrition,
  remaining: Nutrition,
  budget: EstimatedPriceRange,
): Promise<{
  recommendations: Record<
    MealPeriod,
    Array<{ mealId: string; reason: string }>
  >;
  error?: string;
}> => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      recommendations: { LUNCH: [], DINNER: [] },
      error: "Chưa cấu hình GEMINI_API_KEY trên máy chủ.",
    };
  }

  const mealOptions = Object.fromEntries(
    ([MealPeriod.LUNCH, MealPeriod.DINNER] as const).map((period) => [
      period,
      periodCandidates[period].map(
        ({ meal, recommendedServings, estimatedPricePerServing }) => {
          const perServing = meal.nutritionSummary?.perServing;
          return {
            id: meal.id,
            name: meal.name.slice(0, 100),
            servings: recommendedServings,
            nutritionPerServing: perServing,
            recommendedNutrition: perServing
              ? {
                  calories: Math.round(
                    perServing.calories * recommendedServings,
                  ),
                  proteinG:
                    Math.round(perServing.proteinG * recommendedServings * 10) /
                    10,
                  carbsG:
                    Math.round(perServing.carbsG * recommendedServings * 10) /
                    10,
                  fatG:
                    Math.round(perServing.fatG * recommendedServings * 10) / 10,
                }
              : null,
            estimatedPricePerServing,
          };
        },
      ),
    ]),
  );
  const prompt = [
    "Bạn là trợ lý gợi ý món ăn trong ứng dụng MealCraft.",
    "Chỉ xếp hạng các món trong danh sách được cung cấp; tuyệt đối không tạo món hoặc ID mới.",
    "Chỉ dùng số liệu dinh dưỡng đã cho. Không chẩn đoán, không đưa lời khuyên y tế và không hứa hẹn tác dụng sức khỏe.",
    'Mỗi bữa chọn tối đa 4 món. Trả lời JSON thuần theo dạng {"LUNCH":[{"mealId":"...","reason":"..."}],"DINNER":[...]}.',
    "Lý do ngắn, tiếng Việt, tối đa 140 ký tự, nói về mức phù hợp với mục tiêu dinh dưỡng còn lại.",
    `Mục tiêu dinh dưỡng ngày: ${JSON.stringify(targets)}.`,
    `Đã tiêu thụ hôm nay: ${JSON.stringify(consumed)}.`,
    `Còn lại hôm nay: ${JSON.stringify(remaining)}.`,
    `Ngân sách ước tính mục tiêu mỗi khẩu phần: ${JSON.stringify(
      budget,
    )} VND. Ưu tiên món nằm trong khoảng giá này, nhưng không tự thay đổi giá đã cung cấp.`,
    `Các món có sẵn trong cơ sở dữ liệu: ${JSON.stringify(mealOptions)}.`,
  ].join("\n");

  const startedAt = Date.now();
  try {
    const model = getGeminiModelName(process.env.GEMINI_MODEL);
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        model,
      )}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.2,
            maxOutputTokens: 700,
          },
        }),
        signal: AbortSignal.timeout(8_000),
      },
    );
    if (!response.ok) {
      return {
        recommendations: { LUNCH: [], DINNER: [] },
        error: await getGeminiApiErrorMessage(response, model),
      };
    }

    const payload: unknown = await response.json();
    if (typeof payload !== "object" || payload === null) {
      return {
        recommendations: { LUNCH: [], DINNER: [] },
        error: "Gemini trả về phản hồi không hợp lệ.",
      };
    }
    const candidates = (
      payload as {
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string }> };
        }>;
      }
    ).candidates;
    const text = candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("")
      .trim();
    if (!text) {
      return {
        recommendations: { LUNCH: [], DINNER: [] },
        error: "Gemini không trả về danh sách món gợi ý.",
      };
    }

    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null) {
      return {
        recommendations: { LUNCH: [], DINNER: [] },
        error: "Gemini trả về danh sách món không hợp lệ.",
      };
    }

    const result = parsed as Record<string, unknown>;
    const validate = (period: MealPeriod) => {
      const available = new Map(
        periodCandidates[period].map((candidate) => [
          candidate.meal.id,
          candidate,
        ]),
      );
      const values = result[period];
      if (!Array.isArray(values)) return [];
      const seen = new Set<string>();
      return values
        .flatMap((item) => {
          if (typeof item !== "object" || item === null) return [];
          const recommendation = item as Record<string, unknown>;
          const mealId = recommendation.mealId;
          const candidate =
            typeof mealId === "string" ? available.get(mealId) : undefined;
          if (!candidate || seen.has(candidate.meal.id)) return [];
          seen.add(candidate.meal.id);
          const reason =
            typeof recommendation.reason === "string"
              ? recommendation.reason.trim().slice(0, 140)
              : "";
          return [
            {
              mealId: candidate.meal.id,
              reason:
                reason ||
                "Được chọn từ món có sẵn và mục tiêu dinh dưỡng còn lại.",
            },
          ];
        })
        .slice(0, 4);
    };
    return {
      recommendations: {
        LUNCH: validate(MealPeriod.LUNCH),
        DINNER: validate(MealPeriod.DINNER),
      },
    };
  } catch (error) {
    console.error("AI MEAL RECOMMENDATION GEMINI ERROR:", {
      elapsedMs: Date.now() - startedAt,
      error,
    });
    return {
      recommendations: { LUNCH: [], DINNER: [] },
      error:
        error instanceof DOMException && error.name === "TimeoutError"
          ? "Gemini phản hồi chậm, MealCraft đang dùng gợi ý nội bộ."
          : "Không thể kết nối hoặc đọc phản hồi từ Gemini.",
    };
  }
};

export const getAiMealRecommendations = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) {
    res
      .status(401)
      .json({ success: false, message: "Phiên đăng nhập không hợp lệ" });
    return;
  }
  if (req.body?.consent !== true) {
    res.status(403).json({
      success: false,
      message: "Cần đồng ý chia sẻ dữ liệu dinh dưỡng tối thiểu với Gemini.",
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
  res.setHeader("Cache-Control", "no-store");
  const dateRange = getDateRange(req.body?.date);
  if (!dateRange) {
    res.status(400).json({
      success: false,
      message: "Ngày phải đúng định dạng YYYY-MM-DD",
    });
    return;
  }

  try {
    const [
      user,
      personalMeals,
      householdMeals,
      completions,
      manualEntries,
      scannedEntries,
      meals,
      savedMealBudgets,
    ] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { healthProfile: true },
      }),
      prisma.plannedMeal.findMany({
        where: {
          userId,
          isConsumed: true,
          consumedAt: { gte: dateRange.start, lt: dateRange.end },
        },
        include: { meal: { include: { ingredients: true } } },
      }),
      prisma.householdPlannedMeal.findMany({
        where: {
          consumedByUserId: userId,
          isConsumed: true,
          consumedAt: { gte: dateRange.start, lt: dateRange.end },
        },
        include: { meal: { include: { ingredients: true } } },
      }),
      prisma.mealCompletion.findMany({
        where: {
          userId,
          completedAt: { gte: dateRange.start, lt: dateRange.end },
          consumedItems: { gt: 0 },
        },
      }),
      prisma.consumedMealEntry.findMany({
        where: {
          userId,
          consumedAt: { gte: dateRange.start, lt: dateRange.end },
        },
      }),
      prisma.scannedConsumedMealEntry.findMany({
        where: {
          userId,
          dateKey: dateRange.date,
        },
        select: { mealPeriod: true, nutritionSummary: true },
      }),
      prisma.meal.findMany({
        where: { category: { in: [MealType.LUNCH, MealType.DINNER] } },
        select: {
          id: true,
          name: true,
          description: true,
          imageUrl: true,
          category: true,
          prepTimeMinutes: true,
          cookTimeMinutes: true,
          servings: true,
          finalWeightG: true,
          caloriesPer100g: true,
          proteinPer100g: true,
          carbsPer100g: true,
          fatPer100g: true,
          ingredients: { select: { name: true, amountG: true } },
        },
      }),
      prisma.mealBudget.findMany({
        where: { ownerUserId: userId },
        select: { mealPeriod: true, limitVnd: true },
      }),
    ]);

    const healthProfile = user?.healthProfile;
    if (!healthProfile) {
      res.status(409).json({
        success: false,
        message: "Hãy hoàn thành hồ sơ sức khỏe để nhận gợi ý cá nhân hóa.",
      });
      return;
    }

    const completedPeriods = new Set(
      completions.map(
        (completion) =>
          `${completion.scopeKey}:${completion.dateKey}:${completion.mealPeriod}`,
      ),
    );
    const consumed = emptyNutrition();
    const consumedPeriods = new Set<MealPeriod>();
    let unavailableNutritionItems = 0;
    const addSnapshot = (period: MealPeriod, nutrition: Nutrition | null) => {
      consumedPeriods.add(period);
      if (nutrition) addNutrition(consumed, nutrition);
      else unavailableNutritionItems += 1;
    };

    for (const plannedMeal of personalMeals) {
      if (
        completedPeriods.has(
          `PERSONAL:${plannedMeal.dateKey}:${plannedMeal.mealPeriod}`,
        )
      ) {
        continue;
      }
      addSnapshot(
        plannedMeal.mealPeriod,
        calculateNutritionSummary(plannedMeal.meal, plannedMeal.servings)
          ?.total ?? null,
      );
    }
    for (const plannedMeal of householdMeals) {
      if (
        completedPeriods.has(
          `${plannedMeal.householdId}:${plannedMeal.dateKey}:${plannedMeal.mealPeriod}`,
        )
      ) {
        continue;
      }
      addSnapshot(
        plannedMeal.mealPeriod,
        calculateNutritionSummary(plannedMeal.meal, plannedMeal.servings)
          ?.total ?? null,
      );
    }
    for (const completion of completions) {
      addSnapshot(
        completion.mealPeriod,
        readNutrition(completion.nutritionSummary),
      );
    }
    for (const entry of manualEntries) {
      addSnapshot(
        entry.mealPeriod,
        readSnapshotNutrition(entry.nutritionSummary),
      );
    }
    for (const entry of scannedEntries) {
      addSnapshot(
        entry.mealPeriod,
        readSnapshotNutrition(entry.nutritionSummary),
      );
    }

    const targets: Nutrition = {
      calories: healthProfile.dailyCaloriesTarget,
      proteinG: healthProfile.targetProteinG,
      carbsG: healthProfile.targetCarbsG,
      fatG: healthProfile.targetFatG,
    };
    const remaining = {
      calories: Math.max(0, targets.calories - consumed.calories),
      proteinG: Math.max(0, targets.proteinG - consumed.proteinG),
      carbsG: Math.max(0, targets.carbsG - consumed.carbsG),
      fatG: Math.max(0, targets.fatG - consumed.fatG),
    };
    const mealBudgets = Object.fromEntries(
      savedMealBudgets.map(({ mealPeriod, limitVnd }) => [mealPeriod, limitVnd]),
    ) as Partial<Record<MealPeriod, number>>;
    const candidates = (period: MealPeriod): RecommendationCandidate[] =>
      consumedPeriods.has(period)
        ? []
        : meals
            .filter((meal) => meal.category === period)
            .flatMap((meal) => {
              const nutritionSummary = calculateNutritionSummary(
                meal,
                meal.servings,
              );
              if (!nutritionSummary) return [];
              const recommendedServings = calculateServingLimit(
                nutritionSummary.perServing,
                remaining,
              );
              if (recommendedServings < 0.3) return [];
              const recommendedNutrition = {
                calories:
                  nutritionSummary.perServing.calories * recommendedServings,
                proteinG:
                  nutritionSummary.perServing.proteinG * recommendedServings,
                carbsG:
                  nutritionSummary.perServing.carbsG * recommendedServings,
                fatG: nutritionSummary.perServing.fatG * recommendedServings,
              };
              const estimatedPricePerServing =
                estimateMealPricePerServing(meal);
              const estimatedPrice = estimateMealPrice(
                meal,
                recommendedServings,
              );
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
                  recommendationReason: "",
                  estimatedPricePerServing,
                  estimatedPrice,
                  score:
                    nutritionFitScore(recommendedNutrition, targets) +
                    getBudgetDistance(estimatedPricePerServing, budget) * 0.2 +
                    (mealBudgetVnd
                      ? Math.max(
                          0,
                          estimatedPrice.maxVnd - mealBudgetVnd,
                        ) /
                        mealBudgetVnd
                      : 0),
                },
              ];
            })
            .sort((first, second) => first.score - second.score)
            .slice(0, 16);

    const periodCandidates = {
      LUNCH: candidates(MealPeriod.LUNCH),
      DINNER: candidates(MealPeriod.DINNER),
    };
    const hasCandidates = Boolean(
      periodCandidates.LUNCH.length || periodCandidates.DINNER.length,
    );
    const ranked =
      hasCandidates && healthProfile.age >= 18
        ? await getRecommendationsFromGemini(
            periodCandidates,
            targets,
            consumed,
            remaining,
            budget,
          )
        : {
            recommendations: { LUNCH: [], DINNER: [] },
            error: !hasCandidates
              ? "Không còn bữa trưa hoặc tối nào cần gợi ý."
              : "Để bảo vệ dữ liệu sức khỏe của người dưới 18 tuổi, gợi ý được xử lý nội bộ và không gửi đến Gemini.",
          };

    const toRecommendation = (
      period: MealPeriod,
    ): Array<RecommendationCandidate & { recommendationReason: string }> => {
      const byId = new Map(
        periodCandidates[period].map((candidate) => [
          candidate.meal.id,
          candidate,
        ]),
      );
      const aiRanked = ranked.recommendations[period].flatMap((item, index) => {
        const candidate = byId.get(item.mealId);
        return candidate
          ? [
              {
                ...candidate,
                recommendationReason: item.reason,
                score: index,
              },
            ]
          : [];
      });
      const selected =
        aiRanked.length > 0
          ? aiRanked.sort((first, second) => {
              const limit = mealBudgets[period];
              if (!limit) return first.score - second.score;
              const firstOverage = Math.max(
                0,
                first.estimatedPrice.maxVnd - limit,
              );
              const secondOverage = Math.max(
                0,
                second.estimatedPrice.maxVnd - limit,
              );
              return firstOverage - secondOverage || first.score - second.score;
            })
          : periodCandidates[period].slice(0, 4).map((candidate) => ({
              ...candidate,
              recommendationReason:
                "Khẩu phần được giới hạn theo lượng dinh dưỡng còn lại trong ngày.",
            }));
      return selected.map((candidate) => ({
        ...candidate,
        meal: {
          ...candidate.meal,
          nutritionSummary: scaleNutritionSummary(
            candidate.meal.nutritionSummary,
            candidate.recommendedServings,
          ),
        },
        estimatedPricePerServing: candidate.estimatedPricePerServing,
        estimatedPrice: candidate.estimatedPrice,
      }));
    };

    const geminiUsed =
      !ranked.error &&
      ([MealPeriod.LUNCH, MealPeriod.DINNER] as const).every(
        (period) =>
          periodCandidates[period].length === 0 ||
          ranked.recommendations[period].length > 0,
      );
    res.status(200).json({
      success: true,
      data: {
        date: dateRange.date,
        targets,
        consumed,
        remaining,
        consumedPeriods: [...consumedPeriods],
        unavailableNutritionItems,
        source: geminiUsed ? "GEMINI" : "LOCAL",
        budget,
        mealBudgets,
        message:
          ranked.error ??
          (geminiUsed
            ? ""
            : "Gemini chưa cung cấp đủ kết quả; danh sách được xếp hạng nội bộ."),
        recommendations: {
          LUNCH: toRecommendation(MealPeriod.LUNCH),
          DINNER: toRecommendation(MealPeriod.DINNER),
        },
      },
    });
  } catch (error) {
    console.error("GET AI MEAL RECOMMENDATIONS ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Không thể tạo gợi ý món ăn lúc này.",
    });
  }
};
