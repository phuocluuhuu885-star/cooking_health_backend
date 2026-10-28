ALTER TABLE "Household"
ADD COLUMN "lunchPollCloseTime" VARCHAR(5) NOT NULL DEFAULT '11:00',
ADD COLUMN "dinnerPollCloseTime" VARCHAR(5) NOT NULL DEFAULT '17:00';

UPDATE "HouseholdMealPoll"
SET "closesAt" = "dateKey"::date + TIME '10:00'
WHERE "mealPeriod" = 'DINNER'
  AND "closedAt" IS NULL
  AND "closesAt" = "dateKey"::date + TIME '04:00';
