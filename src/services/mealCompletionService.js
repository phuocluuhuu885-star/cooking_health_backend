import { calculateNutritionSummary } from "./mealNutritionService.js";
export const createMealCompletionSnapshot = (plannedMeals) => {
    const snapshot = {
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
        const nutrition = calculateNutritionSummary(plannedMeal.meal, plannedMeal.servings);
        snapshot.items.push({
            mealId: plannedMeal.mealId,
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
    snapshot.nutritionSummary.calories = Math.round(snapshot.nutritionSummary.calories);
    snapshot.nutritionSummary.proteinG =
        Math.round(snapshot.nutritionSummary.proteinG * 10) / 10;
    snapshot.nutritionSummary.carbsG =
        Math.round(snapshot.nutritionSummary.carbsG * 10) / 10;
    snapshot.nutritionSummary.fatG =
        Math.round(snapshot.nutritionSummary.fatG * 10) / 10;
    return snapshot;
};
//# sourceMappingURL=mealCompletionService.js.map