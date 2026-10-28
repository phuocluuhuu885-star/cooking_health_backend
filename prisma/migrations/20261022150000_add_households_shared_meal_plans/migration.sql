CREATE TYPE "HouseholdRole" AS ENUM ('ADMIN', 'MEMBER');

CREATE TABLE "Household" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Household_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HouseholdMember" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "HouseholdRole" NOT NULL DEFAULT 'MEMBER',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HouseholdMember_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HouseholdInvitation" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "code" VARCHAR(12) NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "maxUses" INTEGER NOT NULL DEFAULT 20,
    "uses" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HouseholdInvitation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HouseholdPlannedMeal" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "addedByUserId" TEXT NOT NULL,
    "consumedByUserId" TEXT,
    "mealId" TEXT NOT NULL,
    "dateKey" VARCHAR(10) NOT NULL,
    "mealPeriod" "MealPeriod" NOT NULL,
    "servings" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "isConsumed" BOOLEAN NOT NULL DEFAULT false,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HouseholdPlannedMeal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HouseholdMember_userId_key" ON "HouseholdMember"("userId");
CREATE INDEX "HouseholdMember_householdId_joinedAt_idx" ON "HouseholdMember"("householdId", "joinedAt");
CREATE UNIQUE INDEX "HouseholdInvitation_code_key" ON "HouseholdInvitation"("code");
CREATE INDEX "HouseholdInvitation_householdId_expiresAt_idx" ON "HouseholdInvitation"("householdId", "expiresAt");
CREATE UNIQUE INDEX "HouseholdPlannedMeal_householdId_dateKey_mealPeriod_mealId_key"
    ON "HouseholdPlannedMeal"("householdId", "dateKey", "mealPeriod", "mealId");
CREATE INDEX "HouseholdPlannedMeal_householdId_dateKey_mealPeriod_idx"
    ON "HouseholdPlannedMeal"("householdId", "dateKey", "mealPeriod");
CREATE INDEX "HouseholdPlannedMeal_consumedByUserId_isConsumed_consumedAt_idx"
    ON "HouseholdPlannedMeal"("consumedByUserId", "isConsumed", "consumedAt");

ALTER TABLE "HouseholdMember"
    ADD CONSTRAINT "HouseholdMember_householdId_fkey"
    FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "HouseholdMember_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "HouseholdInvitation"
    ADD CONSTRAINT "HouseholdInvitation_householdId_fkey"
    FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "HouseholdInvitation_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "HouseholdPlannedMeal"
    ADD CONSTRAINT "HouseholdPlannedMeal_householdId_fkey"
    FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "HouseholdPlannedMeal_addedByUserId_fkey"
    FOREIGN KEY ("addedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "HouseholdPlannedMeal_consumedByUserId_fkey"
    FOREIGN KEY ("consumedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT "HouseholdPlannedMeal_mealId_fkey"
    FOREIGN KEY ("mealId") REFERENCES "Meal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
