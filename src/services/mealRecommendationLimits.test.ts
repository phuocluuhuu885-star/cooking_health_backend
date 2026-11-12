import assert from "node:assert/strict";
import test from "node:test";
import {
  selectMealsWithinBudget,
  selectMealsWithinLimits,
  splitNutritionAcrossMeals,
} from "./mealRecommendationLimits.js";

const remaining = {
  calories: 1_000,
  proteinG: 100,
  carbsG: 120,
  fatG: 50,
};

test("splits remaining nutrition between lunch and dinner not yet consumed", () => {
  assert.deepEqual(splitNutritionAcrossMeals(remaining, new Set()), {
    LUNCH: { calories: 500, proteinG: 50, carbsG: 60, fatG: 25 },
    DINNER: { calories: 500, proteinG: 50, carbsG: 60, fatG: 25 },
  });

  test("enforces the total price cap while preserving candidate ranking", () => {
    const candidates = [
      { id: "dish-a", estimatedPrice: { maxVnd: 120_000 } },
      { id: "dish-b", estimatedPrice: { maxVnd: 90_000 } },
      { id: "dish-c", estimatedPrice: { maxVnd: 80_000 } },
    ];
    assert.deepEqual(
      selectMealsWithinBudget(candidates, 200_000).map(({ id }) => id),
      ["dish-a", "dish-c"],
    );
    assert.deepEqual(
      selectMealsWithinBudget(candidates, undefined).map(({ id }) => id),
      ["dish-a", "dish-b", "dish-c"],
    );
  });
  assert.deepEqual(
    splitNutritionAcrossMeals(remaining, new Set(["LUNCH"])),
    {
      LUNCH: { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
      DINNER: remaining,
    },
  );
});

test("keeps the selected dishes within the combined nutrition and meal budget", () => {
  const candidates = [
    {
      id: "dish-a",
      estimatedPrice: { maxVnd: 110_000 },
      recommendedNutrition: {
        calories: 300,
        proteinG: 30,
        carbsG: 30,
        fatG: 10,
      },
    },
    {
      id: "dish-b",
      estimatedPrice: { maxVnd: 100_000 },
      recommendedNutrition: {
        calories: 200,
        proteinG: 20,
        carbsG: 30,
        fatG: 10,
      },
    },
    {
      id: "dish-c",
      estimatedPrice: { maxVnd: 80_000 },
      recommendedNutrition: {
        calories: 200,
        proteinG: 20,
        carbsG: 30,
        fatG: 10,
      },
    },
  ];

  assert.deepEqual(
    selectMealsWithinLimits(candidates, remaining, 200_000).map(({ id }) => id),
    ["dish-a", "dish-c"],
  );
  assert.deepEqual(
    selectMealsWithinLimits(
      candidates,
      { calories: 250, proteinG: 100, carbsG: 120, fatG: 50 },
      200_000,
    ).map(({ id }) => id),
    ["dish-b"],
  );
});
