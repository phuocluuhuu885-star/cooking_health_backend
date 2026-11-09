import assert from "node:assert/strict";
import test from "node:test";
import {
  decodeMealScanImage,
  MealScanInputError,
  parseMealScanResult,
} from "./mealScanService.js";

test("accepts images with supported MIME types and matching signatures", () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x00]).toString("base64");
  assert.equal(decodeMealScanImage(jpeg).mimeType, "image/jpeg");
  const png = Buffer.from([
    137, 80, 78, 71, 13, 10, 26, 10,
  ]).toString("base64");
  assert.equal(decodeMealScanImage(png).mimeType, "image/png");
  const webp = Buffer.from("RIFF0000WEBP", "ascii").toString("base64");
  assert.equal(decodeMealScanImage(webp).mimeType, "image/webp");
  assert.throws(
    () => decodeMealScanImage(Buffer.from("GIF89a").toString("base64")),
    MealScanInputError,
  );
});

test("rejects malformed, empty, and oversized meal images", () => {
  assert.throws(() => decodeMealScanImage("not base64"));
  assert.throws(() => decodeMealScanImage(""));
  const tooLarge = Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff]),
    Buffer.alloc(512 * 1024),
  ]).toString("base64");
  assert.throws(
    () => decodeMealScanImage(tooLarge),
    MealScanInputError,
  );
});

test("accepts a structured estimated meal analysis", () => {
  const result = parseMealScanResult({
    recognized: true,
    dishName: "Cơm gà",
    components: [
      {
        name: "Cơm",
        estimatedAmount: "1 bát nhỏ",
        estimatedWeightG: 150,
        estimatedQuantity: 1,
        quantityUnit: "bát",
        nutrition: {
          caloriesKcal: 200,
          proteinG: 4,
          carbohydratesG: 45,
          fatG: 1,
          fiberG: 1,
        },
        confidence: "MEDIUM",
      },
    ],
    totalNutrition: {
      caloriesKcal: 200,
      proteinG: 4,
      carbohydratesG: 45,
      fatG: 1,
      fiberG: 1,
    },
    notes: ["Khẩu phần được ước tính từ ảnh."],
  });
  assert.equal(result.dishName, "Cơm gà");
  assert.ok(result.components[0]);
  assert.equal(result.components[0].nutrition.caloriesKcal, 200);
  assert.equal(result.components[0].estimatedQuantity, 1);
  assert.equal(result.components[0].quantityUnit, "bát");
});

test("normalizes missing quantity estimates to null", () => {
  const result = parseMealScanResult({
    recognized: true,
    dishName: "Canh rau",
    components: [
      {
        name: "Nước dùng",
        estimatedAmount: "Một ít",
        estimatedWeightG: null,
        nutrition: {
          caloriesKcal: 10,
          proteinG: 1,
          carbohydratesG: 1,
          fatG: 1,
          fiberG: null,
        },
        confidence: "LOW",
      },
    ],
    totalNutrition: {
      caloriesKcal: 10,
      proteinG: 1,
      carbohydratesG: 1,
      fatG: 1,
      fiberG: null,
    },
    notes: [],
  });
  assert.equal(result.components[0]?.estimatedQuantity, null);
  assert.equal(result.components[0]?.quantityUnit, null);
});

test("rejects malformed nutrition results", () => {
  assert.throws(() =>
    parseMealScanResult({
      recognized: true,
      dishName: "Món",
      components: [],
      totalNutrition: {
        caloriesKcal: -5,
        proteinG: 0,
        carbohydratesG: 0,
        fatG: 0,
        fiberG: null,
      },
      notes: [],
    }),
  );
});
