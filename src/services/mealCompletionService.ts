import type { Meal } from "../generated/prisma/client.js";
import { calculateNutritionSummary } from "./mealNutritionService.js";

type MealForCompletion = {
  mealId: string;
  servings: number;
  meal: Meal & { ingredients: Array<{ amountG: number }> };
};

export type MealCompletionSnapshot = {
  items: Array<{
    mealId: string;
    communityMealId: string | null;
    name: string;
    servings: number;
    nutrition: ReturnType<typeof calculateNutritionSummary>;
  }>;
  nutritionSummary: {
    calories: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
  };
  consumedItems: number;
  unavailableNutritionItems: number;
};

export const createMealCompletionSnapshot = (
  plannedMeals: MealForCompletion[],
): MealCompletionSnapshot => {
  const snapshot: MealCompletionSnapshot = {
    items: [],
    nutritionSummary: {
      calories: 0,
      proteinG: 0,
      carbsG: 0,
      fatG: 0,
    },
    consumedItems: plannedMeals.length,
    unavailableNutritionItems: 0,
  };

  plannedMeals.forEach(plannedMeal => {
    const nutrition = calculateNutritionSummary(
      plannedMeal.meal,
      plannedMeal.servings,
    );
    snapshot.items.push({
      mealId: plannedMeal.mealId,
      communityMealId: plannedMeal.meal.communitySourceId,
      name: plannedMeal.meal.name,
      servings: plannedMeal.servings,
      nutrition,
    });
    if (!nutrition) {
      snapshot.unavailableNutritionItems += 1;
      return;
    }
    snapshot.nutritionSummary.calories += nutrition.total.calories;
    snapshot.nutritionSummary.proteinG += nutrition.total.proteinG;
    snapshot.nutritionSummary.carbsG += nutrition.total.carbsG;
    snapshot.nutritionSummary.fatG += nutrition.total.fatG;
  });

  snapshot.nutritionSummary.calories = Math.round(
    snapshot.nutritionSummary.calories,
  );
  snapshot.nutritionSummary.proteinG =
    Math.round(snapshot.nutritionSummary.proteinG * 10) / 10;
  snapshot.nutritionSummary.carbsG =
    Math.round(snapshot.nutritionSummary.carbsG * 10) / 10;
  snapshot.nutritionSummary.fatG =
    Math.round(snapshot.nutritionSummary.fatG * 10) / 10;

  return snapshot;
};
