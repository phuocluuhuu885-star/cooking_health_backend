type MealPeriod = "LUNCH" | "DINNER";

type MealOption = {
  id: string;
  period: MealPeriod;
  caloriesPerServing: number | null;
  proteinPerServingG: number | null;
  carbsPerServingG: number | null;
  fatPerServingG: number | null;
};

type NutritionTarget = {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

const getNutritionDistance = (
  meal: MealOption,
  targets: NutritionTarget | null,
) => {
  if (!targets) return 0;
  const values = [
    [meal.caloriesPerServing, targets.calories],
    [meal.proteinPerServingG, targets.proteinG],
    [meal.carbsPerServingG, targets.carbsG],
    [meal.fatPerServingG, targets.fatG],
  ] as const;
  return values.reduce((total, [value, target]) => {
    if (value === null || target <= 0) return total + 1;
    return total + Math.abs(value - target) / target;
  }, 0);
};

export const rankChatMealRecommendations = (
  meals: MealOption[],
  remaining: NutritionTarget | null,
  periods: MealPeriod[],
  excludedIds: Set<string>,
  limit = 3,
) => {
  const candidates = meals
    .filter(
      meal =>
        periods.includes(meal.period) &&
        !excludedIds.has(meal.id) &&
        meal.caloriesPerServing !== null,
    )
    .map(meal => {
      const calorieTarget = remaining?.calories;
      const calories = meal.caloriesPerServing ?? 0;
      const calorieDistance =
        calorieTarget == null || calorieTarget <= 0
          ? 0
          : calories <= calorieTarget
            ? (calorieTarget - calories) / calorieTarget
            : 1 + (calories - calorieTarget) / calorieTarget;
      return {
        meal,
        score:
          calorieDistance * 2 +
          getNutritionDistance(meal, remaining) * 0.25,
      };
    })
    .sort(
      (first, second) =>
        first.score - second.score ||
        first.meal.id.localeCompare(second.meal.id),
    );

  return candidates.slice(0, limit).map(({ meal }) => meal.id);
};
