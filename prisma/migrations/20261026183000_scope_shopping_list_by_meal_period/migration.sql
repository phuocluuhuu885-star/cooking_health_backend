ALTER TABLE "HouseholdShoppingItem"
ADD COLUMN "mealPeriod" "MealPeriod";

DROP INDEX "HouseholdShoppingItem_householdId_dateKey_ingredientKey_key";

CREATE UNIQUE INDEX "HouseholdShoppingItem_householdId_dateKey_mealPeriod_ingredientKey_key"
ON "HouseholdShoppingItem"("householdId", "dateKey", "mealPeriod", "ingredientKey");

DROP INDEX "HouseholdShoppingItem_householdId_dateKey_purchasedAt_idx";

CREATE INDEX "HouseholdShoppingItem_householdId_dateKey_mealPeriod_purchasedAt_idx"
ON "HouseholdShoppingItem"("householdId", "dateKey", "mealPeriod", "purchasedAt");
