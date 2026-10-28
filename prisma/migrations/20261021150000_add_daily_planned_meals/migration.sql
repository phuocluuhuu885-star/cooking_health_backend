CREATE TYPE "MealPeriod" AS ENUM ('LUNCH', 'DINNER');

CREATE TABLE "PlannedMeal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mealId" TEXT NOT NULL,
    "dateKey" VARCHAR(10) NOT NULL,
    "mealPeriod" "MealPeriod" NOT NULL,
    "servings" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlannedMeal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlannedMeal_userId_dateKey_mealPeriod_mealId_key"
ON "PlannedMeal"("userId", "dateKey", "mealPeriod", "mealId");

CREATE INDEX "PlannedMeal_userId_dateKey_mealPeriod_idx"
ON "PlannedMeal"("userId", "dateKey", "mealPeriod");

ALTER TABLE "PlannedMeal"
ADD CONSTRAINT "PlannedMeal_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PlannedMeal"
ADD CONSTRAINT "PlannedMeal_mealId_fkey"
FOREIGN KEY ("mealId") REFERENCES "Meal"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
