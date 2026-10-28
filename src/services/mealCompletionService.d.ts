import type { Meal } from "../generated/prisma/client.js";
import { calculateNutritionSummary } from "./mealNutritionService.js";
type MealForCompletion = {
    mealId: string;
    servings: number;
    meal: Meal & {
        ingredients: Array<{
            amountG: number;
        }>;
    };
};
export type MealCompletionSnapshot = {
    items: Array<{
        mealId: string;
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
export declare const createMealCompletionSnapshot: (plannedMeals: MealForCompletion[]) => MealCompletionSnapshot;
export {};
//# sourceMappingURL=mealCompletionService.d.ts.map