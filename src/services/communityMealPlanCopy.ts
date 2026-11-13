import {
  CommunityMealStatus,
  MealType,
  Prisma,
} from "../generated/prisma/client.js";
import { parseCommunityMealNutrition } from "./communityMealService.js";

type ParsedCommunityIngredient = {
  name: string;
  amountG: number;
};

export const parseCommunityMealPlanIngredients = (
  value: unknown,
): ParsedCommunityIngredient[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): ParsedCommunityIngredient[] => {
    if (typeof entry !== "string" || !entry.trim()) return [];
    const text = entry.trim();
    const match = text.match(/^(.+?)\s*[-–—:]\s*(\d+(?:[.,]\d+)?)\s*(g|gr|gram|grams|kg)?$/i);
    if (!match) return [{ name: text, amountG: 0 }];
    const [, name, rawAmount, unit] = match;
    if (!name || !rawAmount) return [{ name: text, amountG: 0 }];
    const amount = Number(rawAmount.replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0) {
      return [];
    }
    return [
      {
        name: name.trim(),
        amountG: unit?.toLowerCase() === "kg" ? amount * 1000 : amount,
      },
    ];
  });
};

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
  const ingredients = parseCommunityMealPlanIngredients(
    communityMeal.ingredients,
  );
  const steps = {
    create: {
      stepNumber: 1,
      title: "Cách nấu",
      instruction: communityMeal.instructions,
    },
  };

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
        create: ingredients,
      },
      cookingSteps: steps,
    },
    update: {
      name: communityMeal.name,
      description: communityMeal.description,
      caloriesPer100g: nutrition.caloriesKcal,
      proteinPer100g: nutrition.proteinG,
      carbsPer100g: nutrition.carbohydratesG,
      fatPer100g: nutrition.fatG,
      ingredients: {
        deleteMany: {},
        create: ingredients,
      },
      cookingSteps: {
        deleteMany: {},
        create: steps.create,
      },
    },
    select: { id: true },
  });
  return meal.id;
};
