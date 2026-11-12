export type MealPeriod = "LUNCH" | "DINNER";

export type MealNutrition = {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

type MealCandidate = {
  estimatedPrice: { maxVnd: number };
  recommendedNutrition: MealNutrition;
};

export const splitNutritionAcrossMeals = (
  remaining: MealNutrition,
  consumedPeriods: Set<MealPeriod>,
): Record<MealPeriod, MealNutrition> => {
  const availablePeriods = (["LUNCH", "DINNER"] as const).filter(
    period => !consumedPeriods.has(period),
  );
  const share = availablePeriods.length > 0 ? 1 / availablePeriods.length : 0;
  const allocation = Object.fromEntries(
    (["LUNCH", "DINNER"] as const).map(period => [
      period,
      availablePeriods.includes(period)
        ? {
            calories: remaining.calories * share,
            proteinG: remaining.proteinG * share,
            carbsG: remaining.carbsG * share,
            fatG: remaining.fatG * share,
          }
        : { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
    ]),
  ) as Record<MealPeriod, MealNutrition>;
  return allocation;
};

export const selectMealsWithinLimits = <T extends MealCandidate>(
  candidates: T[],
  nutritionLimit: MealNutrition,
  budgetLimitVnd: number | undefined,
  limit = 4,
): T[] => {
  const selected: T[] = [];
  let totalPrice = 0;
  const totalNutrition: MealNutrition = {
    calories: 0,
    proteinG: 0,
    carbsG: 0,
    fatG: 0,
  };

  for (const candidate of candidates) {
    if (selected.length >= limit) break;
    const nextPrice = totalPrice + candidate.estimatedPrice.maxVnd;
    const nextNutrition = {
      calories: totalNutrition.calories + candidate.recommendedNutrition.calories,
      proteinG: totalNutrition.proteinG + candidate.recommendedNutrition.proteinG,
      carbsG: totalNutrition.carbsG + candidate.recommendedNutrition.carbsG,
      fatG: totalNutrition.fatG + candidate.recommendedNutrition.fatG,
    };
    if (
      (budgetLimitVnd !== undefined && nextPrice > budgetLimitVnd) ||
      nextNutrition.calories > nutritionLimit.calories ||
      nextNutrition.proteinG > nutritionLimit.proteinG ||
      nextNutrition.carbsG > nutritionLimit.carbsG ||
      nextNutrition.fatG > nutritionLimit.fatG
    ) {
      continue;
    }
    selected.push(candidate);
    totalPrice = nextPrice;
    totalNutrition.calories = nextNutrition.calories;
    totalNutrition.proteinG = nextNutrition.proteinG;
    totalNutrition.carbsG = nextNutrition.carbsG;
    totalNutrition.fatG = nextNutrition.fatG;
  }
  return selected;
};

export const selectMealsWithinBudget = <
  T extends { estimatedPrice: { maxVnd: number } },
>(
  candidates: T[],
  budgetLimitVnd: number | undefined,
  limit = 4,
): T[] => {
  const selected: T[] = [];
  let totalPrice = 0;
  for (const candidate of candidates) {
    if (selected.length >= limit) break;
    const nextTotal = totalPrice + candidate.estimatedPrice.maxVnd;
    if (budgetLimitVnd !== undefined && nextTotal > budgetLimitVnd) continue;
    selected.push(candidate);
    totalPrice = nextTotal;
  }
  return selected;
};
