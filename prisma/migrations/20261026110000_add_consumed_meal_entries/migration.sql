CREATE TABLE "ConsumedMealEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mealId" TEXT NOT NULL,
    "mealPeriod" "MealPeriod" NOT NULL,
    "servings" DOUBLE PRECISION NOT NULL,
    "nutritionSummary" JSONB NOT NULL,
    "consumedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsumedMealEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ConsumedMealEntry_userId_consumedAt_idx"
ON "ConsumedMealEntry"("userId", "consumedAt");

ALTER TABLE "ConsumedMealEntry"
ADD CONSTRAINT "ConsumedMealEntry_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ConsumedMealEntry"
ADD CONSTRAINT "ConsumedMealEntry_mealId_fkey"
FOREIGN KEY ("mealId") REFERENCES "Meal"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
