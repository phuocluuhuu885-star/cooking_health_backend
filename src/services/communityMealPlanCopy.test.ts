import assert from "node:assert/strict";
import test from "node:test";
import { parseCommunityMealPlanIngredients } from "./communityMealPlanCopy.js";

test("parses community ingredient names and gram weights", () => {
  assert.deepEqual(
    parseCommunityMealPlanIngredients([
      "Ức gà - 300 g",
      "Nước mắm: 15 ml",
      "Gạo - 1,5 kg",
      "Muối",
    ]),
    [
      { name: "Ức gà", amountG: 300 },
      { name: "Nước mắm: 15 ml", amountG: 0 },
      { name: "Gạo", amountG: 1500 },
      { name: "Muối", amountG: 0 },
    ],
  );
});

test("ignores invalid and empty community ingredients", () => {
  assert.deepEqual(
    parseCommunityMealPlanIngredients([
      "",
      null,
      "Đường - 0 g",
      "Tiêu - không rõ g",
    ]),
    [{ name: "Tiêu - không rõ g", amountG: 0 }],
  );
});
