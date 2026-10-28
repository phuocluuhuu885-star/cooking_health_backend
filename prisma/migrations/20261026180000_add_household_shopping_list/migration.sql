CREATE TABLE "HouseholdShoppingItem" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "dateKey" VARCHAR(10) NOT NULL,
    "ingredientKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amountG" DOUBLE PRECISION NOT NULL,
    "mealNames" JSONB NOT NULL,
    "purchasedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "HouseholdShoppingItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HouseholdShoppingItem_householdId_dateKey_ingredientKey_key"
ON "HouseholdShoppingItem"("householdId", "dateKey", "ingredientKey");

CREATE INDEX "HouseholdShoppingItem_householdId_dateKey_purchasedAt_idx"
ON "HouseholdShoppingItem"("householdId", "dateKey", "purchasedAt");

ALTER TABLE "HouseholdShoppingItem"
ADD CONSTRAINT "HouseholdShoppingItem_householdId_fkey"
FOREIGN KEY ("householdId") REFERENCES "Household"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
