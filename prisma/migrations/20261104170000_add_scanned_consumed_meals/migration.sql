CREATE TABLE "ScannedConsumedMealEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mealPeriod" "MealPeriod" NOT NULL,
    "dateKey" VARCHAR(10) NOT NULL,
    "servings" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "nutritionSummary" JSONB NOT NULL,
    "scanResult" JSONB NOT NULL,
    "consumedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScannedConsumedMealEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ScannedConsumedMealEntry_userId_dateKey_idx"
ON "ScannedConsumedMealEntry"("userId", "dateKey");

CREATE INDEX "ScannedConsumedMealEntry_userId_dateKey_mealPeriod_idx"
ON "ScannedConsumedMealEntry"("userId", "dateKey", "mealPeriod");

ALTER TABLE "ScannedConsumedMealEntry"
ADD CONSTRAINT "ScannedConsumedMealEntry_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
