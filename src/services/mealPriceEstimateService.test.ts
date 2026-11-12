import assert from "node:assert/strict";
import test from "node:test";
import {
  estimateMealPrice,
  estimateMealPricePerServing,
  readMealPriceBudget,
} from "./mealPriceEstimateService.js";

test("estimates total price from ingredient weights and scales by servings", () => {
  const meal = {
    servings: 2,
    category: "LUNCH",
    ingredients: [
      { name: "Ức gà", amountG: 400 },
      { name: "Cà rốt", amountG: 200 },
    ],
  };
  const perServing = estimateMealPricePerServing(meal);
  const twoServings = estimateMealPrice(meal, 2);

  assert.deepEqual(perServing, { minVnd: 14_000, maxVnd: 38_000 });
  assert.deepEqual(twoServings, { minVnd: 29_000, maxVnd: 75_000 });
});

test("uses the default budget and accepts a zero minimum budget", () => {
  assert.deepEqual(readMealPriceBudget(undefined), {
    minVnd: 30_000,
    maxVnd: 60_000,
  });
  assert.deepEqual(readMealPriceBudget({ minVnd: 0, maxVnd: 60_000 }), {
    minVnd: 0,
    maxVnd: 60_000,
  });
  assert.equal(readMealPriceBudget({ minVnd: -1, maxVnd: 60_000 }), null);
  assert.equal(readMealPriceBudget({ minVnd: 60_000, maxVnd: 30_000 }), null);
});

test("uses a per-serving fallback when ingredient quantities are unavailable", () => {
  const meal = { servings: 4, category: "DINNER", ingredients: [] };
  assert.deepEqual(estimateMealPricePerServing(meal), {
    minVnd: 31_000,
    maxVnd: 72_000,
  });
  assert.deepEqual(estimateMealPrice(meal, 4), {
    minVnd: 126_000,
    maxVnd: 286_000,
  });
});
