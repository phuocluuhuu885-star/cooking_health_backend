import {
  CommunityMealStatus,
  MealType,
  Prisma,
} from "../generated/prisma/client.js";
import { parseCommunityMealNutrition } from "./communityMealService.js";

export const getOrCreateCommunityMealPlanCopy = async (
  transaction: Prisma.TransactionClient,
  communityMealId: string,
): Promise<string | null> => {
  const communityMeal = await transaction.communityMeal.findFirst({
    where: { id: communityMealId, status: CommunityMealStatus.APPROVED },
    select: {
      id: true,
      name: true,
      description: true,
      ingredients: true,
      instructions: true,
      nutrition: true,
    },
  });
  if (!communityMeal) return null;

  const nutrition = parseCommunityMealNutrition(communityMeal.nutrition);
  const ingredients = Array.isArray(communityMeal.ingredients)
    ? communityMeal.ingredients.filter(
        (ingredient): ingredient is string => typeof ingredient === "string",
      )
    : [];

  const meal = await transaction.meal.upsert({
    where: { communitySourceId: communityMeal.id },
    create: {
      communitySourceId: communityMeal.id,
      name: communityMeal.name,
      description: communityMeal.description,
      category: MealType.DINNER,
      isPublished: false,
      servings: 1,
      finalWeightG: 100,
      caloriesPer100g: nutrition.caloriesKcal,
      proteinPer100g: nutrition.proteinG,
      carbsPer100g: nutrition.carbohydratesG,
      fatPer100g: nutrition.fatG,
      ingredients: {
        create: ingredients.map((name) => ({ name, amountG: 0 })),
      },
      cookingSteps: {
        create: {
          stepNumber: 1,
          title: "Cách nấu",
          instruction: communityMeal.instructions,
        },
      },
    },
    update: {},
    select: { id: true },
  });
  return meal.id;
};
