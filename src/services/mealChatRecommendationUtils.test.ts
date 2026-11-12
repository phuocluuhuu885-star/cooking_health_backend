import assert from "node:assert/strict";
import test from "node:test";
import { rankChatMealRecommendations } from "./mealChatRecommendationUtils.js";

const meals = [
  {
    id: "lunch-600",
    period: "LUNCH" as const,
    caloriesPerServing: 600,
    proteinPerServingG: 30,
    carbsPerServingG: 50,
    fatPerServingG: 20,
  },
  {
    id: "lunch-400",
    period: "LUNCH" as const,
    caloriesPerServing: 400,
    proteinPerServingG: 25,
    carbsPerServingG: 40,
    fatPerServingG: 12,
  },
  {
    id: "dinner-450",
    period: "DINNER" as const,
    caloriesPerServing: 450,
    proteinPerServingG: 28,
    carbsPerServingG: 45,
    fatPerServingG: 15,
  },
  {
    id: "no-nutrition",
    period: "LUNCH" as const,
    caloriesPerServing: null,
    proteinPerServingG: null,
    carbsPerServingG: null,
    fatPerServingG: null,
  },
];

test("ranks remaining-intake matches and filters requested meal periods", () => {
  assert.deepEqual(
    rankChatMealRecommendations(
      meals,
      { calories: 500, proteinG: 30, carbsG: 45, fatG: 15 },
      ["LUNCH"],
      new Set(),
    ),
    ["lunch-400", "lunch-600"],
  );
});

test("skips prior suggestions and meals without nutrition data", () => {
  assert.deepEqual(
    rankChatMealRecommendations(
      meals,
      null,
      ["LUNCH", "DINNER"],
      new Set(["lunch-400"]),
    ),
    ["dinner-450", "lunch-600"],
  );
});

test("returns a short, deterministic list of available meals", () => {
  assert.deepEqual(
    rankChatMealRecommendations(meals, null, ["LUNCH", "DINNER"], new Set(), 1),
    ["dinner-450"],
  );
});
