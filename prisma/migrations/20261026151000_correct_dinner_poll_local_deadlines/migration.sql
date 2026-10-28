UPDATE "HouseholdMealPoll"
SET "closesAt" = "dateKey"::date + TIME '17:00'
WHERE "mealPeriod" = 'DINNER'
  AND "closedAt" IS NULL
  AND "dateKey" >= TO_CHAR(
    CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh',
    'YYYY-MM-DD'
  )
  AND "closesAt" = "dateKey"::date + TIME '10:00';
