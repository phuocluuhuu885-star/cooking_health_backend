export type MealNutritionData = {
  servings: number;
  finalWeightG: number | null;
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  ingredients: Array<{ amountG: number }>;
};

const roundToOneDecimal = (value: number): number =>
  Math.round(value * 10) / 10;

export const calculateNutritionSummary = (
  meal: MealNutritionData,
  targetServings: number,
) => {
  const ingredientWeightG = meal.ingredients.reduce(
    (total, ingredient) => total + ingredient.amountG,
    0,
  );
  const finalWeightG = meal.finalWeightG;
  const hasFinalWeight = finalWeightG !== null && finalWeightG > 0;
  const baseWeightG =
    finalWeightG !== null && finalWeightG > 0
      ? finalWeightG
      : ingredientWeightG;

  if (meal.servings <= 0 || targetServings <= 0 || baseWeightG <= 0) {
    return null;
  }

  const totalWeightG = (baseWeightG * targetServings) / meal.servings;
  const nutritionFactor = totalWeightG / 100;

  return {
    servings: targetServings,
    totalWeightG: roundToOneDecimal(totalWeightG),
    weightBasis: hasFinalWeight ? "FINAL_WEIGHT" : "INGREDIENT_WEIGHT_ESTIMATE",
    per100g: {
      calories: Math.round(meal.caloriesPer100g),
      proteinG: roundToOneDecimal(meal.proteinPer100g),
      carbsG: roundToOneDecimal(meal.carbsPer100g),
      fatG: roundToOneDecimal(meal.fatPer100g),
    },
    total: {
      calories: Math.round(meal.caloriesPer100g * nutritionFactor),
      proteinG: roundToOneDecimal(meal.proteinPer100g * nutritionFactor),
      carbsG: roundToOneDecimal(meal.carbsPer100g * nutritionFactor),
      fatG: roundToOneDecimal(meal.fatPer100g * nutritionFactor),
    },
    perServing: {
      calories: Math.round(
        (meal.caloriesPer100g * baseWeightG) / 100 / meal.servings,
      ),
      proteinG: roundToOneDecimal(
        (meal.proteinPer100g * baseWeightG) / 100 / meal.servings,
      ),
      carbsG: roundToOneDecimal(
        (meal.carbsPer100g * baseWeightG) / 100 / meal.servings,
      ),
      fatG: roundToOneDecimal(
        (meal.fatPer100g * baseWeightG) / 100 / meal.servings,
      ),
    },
  };
};
