type IngredientAmount = {
  name: string;
  amountG: number;
};

type MealIngredients = {
  servings: number;
  category?: string;
  ingredients: IngredientAmount[];
};

export type EstimatedPriceRange = {
  minVnd: number;
  maxVnd: number;
};

export const DEFAULT_MEAL_PRICE_BUDGET: EstimatedPriceRange = {
  minVnd: 30_000,
  maxVnd: 60_000,
};

export const readMealPriceBudget = (
  value: unknown,
): EstimatedPriceRange | null => {
  if (value === undefined) return DEFAULT_MEAL_PRICE_BUDGET;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const budget = value as Record<string, unknown>;
  if (
    typeof budget.minVnd !== "number" ||
    typeof budget.maxVnd !== "number" ||
    !Number.isInteger(budget.minVnd) ||
    !Number.isInteger(budget.maxVnd) ||
    budget.minVnd < 0 ||
    budget.maxVnd > 500_000 ||
    budget.minVnd >= budget.maxVnd
  ) {
    return null;
  }
  return { minVnd: budget.minVnd, maxVnd: budget.maxVnd };
};

const ingredientPricePerKg = (name: string): EstimatedPriceRange => {
  const normalized = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/đ/g, "d");
  if (/bo vien|thit bo|bo xay|duoi bo|gan bo/.test(normalized)) {
    return { minVnd: 200_000, maxVnd: 300_000 };
  }
  if (/thit heo|thit lon|ba chi|suon non|thit nac/.test(normalized)) {
    return { minVnd: 110_000, maxVnd: 180_000 };
  }
  if (/thit ga|uc ga|dui ga|canh ga/.test(normalized)) {
    return { minVnd: 70_000, maxVnd: 130_000 };
  }
  if (/tom|cua|muc|bach tuoc/.test(normalized)) {
    return { minVnd: 160_000, maxVnd: 300_000 };
  }
  if (
    /ca rot|ca chua|rau|cu|nam|hanh|toi|gung|chanh|dua leo/.test(normalized)
  ) {
    return { minVnd: 25_000, maxVnd: 80_000 };
  }
  if (
    /ca loc|ca hoi|ca thu|ca basa|ca diep|ca ngu|ca chim|ca ro/.test(normalized)
  ) {
    return { minVnd: 90_000, maxVnd: 220_000 };
  }
  if (/trung/.test(normalized)) {
    return { minVnd: 35_000, maxVnd: 60_000 };
  }
  if (/dau hu|dau phu|tofu/.test(normalized)) {
    return { minVnd: 25_000, maxVnd: 50_000 };
  }
  if (/gao|bun|pho|mi|hu tieu/.test(normalized)) {
    return { minVnd: 20_000, maxVnd: 55_000 };
  }
  if (/dau an|nuoc mam|nuoc tuong|gia vi|muoi|duong/.test(normalized)) {
    return { minVnd: 25_000, maxVnd: 70_000 };
  }
  return { minVnd: 50_000, maxVnd: 100_000 };
};

const roundDownThousand = (value: number) =>
  Math.max(0, Math.floor(value / 1_000) * 1_000);
const roundUpThousand = (value: number) => Math.ceil(value / 1_000) * 1_000;

export const estimateMealPrice = (
  meal: MealIngredients,
  servings: number,
): EstimatedPriceRange => {
  const recipeServings = Math.max(1, meal.servings || 1);
  const targetServings = Math.max(0, servings);
  const ingredients = meal.ingredients.filter(
    (ingredient) =>
      Number.isFinite(ingredient.amountG) && ingredient.amountG > 0,
  );
  const hasIngredients = ingredients.length > 0;
  const recipePrice = ingredients.length
    ? ingredients.reduce(
        (total, ingredient) => {
          const unitPrice = ingredientPricePerKg(ingredient.name);
          return {
            min: total.min + (ingredient.amountG / 1_000) * unitPrice.minVnd,
            max: total.max + (ingredient.amountG / 1_000) * unitPrice.maxVnd,
          };
        },
        { min: 0, max: 0 },
      )
    : meal.category === "DINNER"
      ? { min: 35_000, max: 65_000 }
      : { min: 30_000, max: 60_000 };
  const scale = targetServings / (hasIngredients ? recipeServings : 1);
  return {
    minVnd: roundDownThousand(recipePrice.min * scale * 0.9),
    maxVnd: roundUpThousand(recipePrice.max * scale * 1.1),
  };
};

export const estimateMealPricePerServing = (meal: MealIngredients) =>
  estimateMealPrice(meal, 1);

export const getBudgetDistance = (
  price: EstimatedPriceRange,
  budget: EstimatedPriceRange,
) => {
  const midpoint = (price.minVnd + price.maxVnd) / 2;
  const budgetMidpoint = (budget.minVnd + budget.maxVnd) / 2;
  const spread = Math.max(1, budget.maxVnd - budget.minVnd);
  if (midpoint < budget.minVnd) return (budget.minVnd - midpoint) / spread;
  if (midpoint > budget.maxVnd) return (midpoint - budget.maxVnd) / spread;
  return 0;
};
