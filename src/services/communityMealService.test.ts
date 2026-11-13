import assert from "node:assert/strict";
import test from "node:test";
import {
  parseCommunityMealIngredients,
  parseCommunityMealNutrition,
} from "./communityMealService.js";

test("validates and normalizes community meal nutrition", () => {
  const nutrition = parseCommunityMealNutrition({
    caloriesKcal: 420,
    proteinG: 28,
    carbohydratesG: 40,
    fatG: 14,
    fiberG: null,
    confidence: "MEDIUM",
    notes: ["Ước tính từ nguyên liệu được cung cấp."],
  });

  assert.equal(nutrition.caloriesKcal, 420);
  assert.equal(nutrition.confidence, "MEDIUM");
  assert.throws(() =>
    parseCommunityMealNutrition({
      caloriesKcal: -1,
      proteinG: 0,
      carbohydratesG: 0,
      fatG: 0,
      fiberG: null,
      confidence: "HIGH",
      notes: [],
    }),
  );
});

test("trims valid ingredient lines and rejects invalid lists", () => {
  assert.deepEqual(parseCommunityMealIngredients(["  Gạo  ", "Ức gà"]), [
    "Gạo",
    "Ức gà",
  ]);
  assert.equal(parseCommunityMealIngredients([]), null);
  assert.equal(parseCommunityMealIngredients([" "]), null);
});
