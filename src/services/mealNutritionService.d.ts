export type MealNutritionData = {
    servings: number;
    finalWeightG: number | null;
    caloriesPer100g: number;
    proteinPer100g: number;
    carbsPer100g: number;
    fatPer100g: number;
    ingredients: Array<{
        amountG: number;
    }>;
};
export declare const calculateNutritionSummary: (meal: MealNutritionData, targetServings: number) => {
    servings: number;
    totalWeightG: number;
    weightBasis: string;
    per100g: {
        calories: number;
        proteinG: number;
        carbsG: number;
        fatG: number;
    };
    total: {
        calories: number;
        proteinG: number;
        carbsG: number;
        fatG: number;
    };
    perServing: {
        calories: number;
        proteinG: number;
        carbsG: number;
        fatG: number;
    };
} | null;
//# sourceMappingURL=mealNutritionService.d.ts.map