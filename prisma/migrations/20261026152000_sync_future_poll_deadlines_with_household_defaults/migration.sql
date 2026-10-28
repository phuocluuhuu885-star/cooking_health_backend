UPDATE "HouseholdMealPoll" AS poll
SET "closesAt" = poll."dateKey"::date + household."dinnerPollCloseTime"::time
FROM "Household" AS household
WHERE poll."householdId" = household."id"
  AND poll."mealPeriod" = 'DINNER'
  AND poll."closedAt" IS NULL
  AND poll."dateKey" >= TO_CHAR(
    CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh',
    'YYYY-MM-DD'
  )
  AND poll."closesAt" <> poll."dateKey"::date + household."dinnerPollCloseTime"::time;

UPDATE "HouseholdMealPoll" AS poll
SET "closesAt" = poll."dateKey"::date + household."lunchPollCloseTime"::time
FROM "Household" AS household
WHERE poll."householdId" = household."id"
  AND poll."mealPeriod" = 'LUNCH'
  AND poll."closedAt" IS NULL
  AND poll."dateKey" >= TO_CHAR(
    CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh',
    'YYYY-MM-DD'
  )
  AND poll."closesAt" <> poll."dateKey"::date + household."lunchPollCloseTime"::time;
