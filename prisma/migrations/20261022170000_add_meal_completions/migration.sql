CREATE TABLE "MealCompletion" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "householdId" TEXT,
    "scopeKey" TEXT NOT NULL,
    "dateKey" VARCHAR(10) NOT NULL,
    "mealPeriod" "MealPeriod" NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "items" JSONB NOT NULL,
    "nutritionSummary" JSONB NOT NULL,
    "consumedItems" INTEGER NOT NULL,
    "unavailableNutritionItems" INTEGER NOT NULL,

    CONSTRAINT "MealCompletion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MealCompletion_userId_dateKey_mealPeriod_scopeKey_key"
    ON "MealCompletion"("userId", "dateKey", "mealPeriod", "scopeKey");
CREATE INDEX "MealCompletion_userId_completedAt_idx"
    ON "MealCompletion"("userId", "completedAt");
CREATE INDEX "MealCompletion_householdId_dateKey_mealPeriod_idx"
    ON "MealCompletion"("householdId", "dateKey", "mealPeriod");

ALTER TABLE "MealCompletion"
    ADD CONSTRAINT "MealCompletion_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "MealCompletion_householdId_fkey"
    FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE SET NULL ON UPDATE CASCADE;
