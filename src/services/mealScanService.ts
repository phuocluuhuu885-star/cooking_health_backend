const MAX_MEAL_IMAGE_BYTES = 512 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export class MealScanInputError extends Error {}

export type MealScanNutrition = {
  caloriesKcal: number;
  proteinG: number;
  carbohydratesG: number;
  fatG: number;
  fiberG: number | null;
};

export type MealScanResult = {
  recognized: boolean;
  dishName: string | null;
  components: Array<{
    name: string;
    estimatedAmount: string;
    estimatedWeightG: number | null;
    estimatedQuantity: number | null;
    quantityUnit: string | null;
    nutrition: MealScanNutrition;
    confidence: "LOW" | "MEDIUM" | "HIGH";
  }>;
  totalNutrition: MealScanNutrition;
  notes: string[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isNonNegativeNumberOrNull = (value: unknown): value is number | null =>
  value === null ||
  (typeof value === "number" && Number.isFinite(value) && value >= 0);

const isNutrition = (value: unknown): value is MealScanNutrition =>
  isRecord(value) &&
  isNonNegativeNumberOrNull(value.caloriesKcal) &&
  isNonNegativeNumberOrNull(value.proteinG) &&
  isNonNegativeNumberOrNull(value.carbohydratesG) &&
  isNonNegativeNumberOrNull(value.fatG) &&
  isNonNegativeNumberOrNull(value.fiberG) &&
  value.caloriesKcal !== null &&
  value.proteinG !== null &&
  value.carbohydratesG !== null &&
  value.fatG !== null;

const detectMealScanImageType = (image: Buffer): string | null => {
  if (
    image.length >= 3 &&
    image.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))
  ) {
    return "image/jpeg";
  }
  if (
    image.length >= 8 &&
    image
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ) {
    return "image/png";
  }
  if (
    image.length >= 12 &&
    image.toString("ascii", 0, 4) === "RIFF" &&
    image.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
};

export const decodeMealScanImage = (
  encodedImage: unknown
): { image: Buffer; mimeType: string } => {
  if (
    typeof encodedImage !== "string" ||
    encodedImage.length === 0 ||
    encodedImage.length > Math.ceil((MAX_MEAL_IMAGE_BYTES * 4) / 3) + 4 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(encodedImage)
  ) {
    throw new MealScanInputError(
      "Ảnh không hợp lệ. Hãy chọn ảnh JPEG, PNG hoặc WebP.",
    );
  }

  const image = Buffer.from(encodedImage, "base64");
  const mimeType = detectMealScanImageType(image);
  if (
    image.length === 0 ||
    image.length > MAX_MEAL_IMAGE_BYTES ||
    !mimeType ||
    !ALLOWED_IMAGE_TYPES.has(mimeType)
  ) {
    throw new MealScanInputError(
      "Ảnh không hợp lệ, không hỗ trợ định dạng hoặc vượt quá giới hạn 512 KB. Hãy chọn ảnh JPEG, PNG hoặc WebP khác.",
    );
  }
  return { image, mimeType };
};

export const parseMealScanResult = (value: unknown): MealScanResult => {
  if (
    !isRecord(value) ||
    typeof value.recognized !== "boolean" ||
    !(typeof value.dishName === "string" || value.dishName === null) ||
    !Array.isArray(value.components) ||
    !isNutrition(value.totalNutrition) ||
    !Array.isArray(value.notes) ||
    !value.notes.every((note) => typeof note === "string")
  ) {
    throw new Error("AI trả về kết quả quét món ăn không đúng định dạng.");
  }

  const components = value.components.map((component) => {
    if (
      !isRecord(component) ||
      typeof component.name !== "string" ||
      typeof component.estimatedAmount !== "string" ||
      !isNonNegativeNumberOrNull(component.estimatedWeightG) ||
      (component.estimatedQuantity !== undefined &&
        !isNonNegativeNumberOrNull(component.estimatedQuantity)) ||
      !(
        typeof component.quantityUnit === "string" ||
        component.quantityUnit === null ||
        component.quantityUnit === undefined
      ) ||
      !isNutrition(component.nutrition) ||
      !["LOW", "MEDIUM", "HIGH"].includes(String(component.confidence))
    ) {
      throw new Error("AI trả về thành phần hoặc dinh dưỡng không hợp lệ.");
    }
    return {
      name: component.name.slice(0, 100),
      estimatedAmount: component.estimatedAmount.slice(0, 100),
      estimatedWeightG: component.estimatedWeightG,
      estimatedQuantity: isNonNegativeNumberOrNull(component.estimatedQuantity)
        ? component.estimatedQuantity
        : null,
      quantityUnit:
        typeof component.quantityUnit === "string"
          ? component.quantityUnit.slice(0, 40)
          : null,
      nutrition: component.nutrition,
      confidence: component.confidence as "LOW" | "MEDIUM" | "HIGH",
    };
  });

  return {
    recognized: value.recognized,
    dishName:
      typeof value.dishName === "string" ? value.dishName.slice(0, 120) : null,
    components,
    totalNutrition: value.totalNutrition,
    notes: value.notes
      .filter((note): note is string => typeof note === "string")
      .map((note) => note.slice(0, 200))
      .slice(0, 8),
  };
};
