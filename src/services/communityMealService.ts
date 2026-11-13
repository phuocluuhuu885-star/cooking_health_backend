export type CommunityMealNutrition = {
  caloriesKcal: number;
  proteinG: number;
  carbohydratesG: number;
  fatG: number;
  fiberG: number | null;
  confidence: "LOW" | "MEDIUM" | "HIGH";
  notes: string[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isNonNegativeNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

export const parseCommunityMealNutrition = (
  value: unknown,
): CommunityMealNutrition => {
  if (
    !isRecord(value) ||
    !isNonNegativeNumber(value.caloriesKcal) ||
    !isNonNegativeNumber(value.proteinG) ||
    !isNonNegativeNumber(value.carbohydratesG) ||
    !isNonNegativeNumber(value.fatG) ||
    !(value.fiberG === null || isNonNegativeNumber(value.fiberG)) ||
    !["LOW", "MEDIUM", "HIGH"].includes(String(value.confidence)) ||
    !Array.isArray(value.notes) ||
    !value.notes.every((note) => typeof note === "string")
  ) {
    throw new Error("AI trả về thông tin dinh dưỡng không đúng định dạng.");
  }

  return {
    caloriesKcal: value.caloriesKcal,
    proteinG: value.proteinG,
    carbohydratesG: value.carbohydratesG,
    fatG: value.fatG,
    fiberG: value.fiberG,
    confidence: value.confidence as CommunityMealNutrition["confidence"],
    notes: value.notes.slice(0, 5).map((note) => note.slice(0, 200)),
  };
};

export const parseCommunityMealIngredients = (
  value: unknown,
): string[] | null => {
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > 50 ||
    !value.every(
      (ingredient) =>
        typeof ingredient === "string" &&
        ingredient.trim().length > 0 &&
        ingredient.trim().length <= 200,
    )
  ) {
    return null;
  }

  return value.map((ingredient: string) => ingredient.trim());
};
