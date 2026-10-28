WITH reopened_polls AS (
  UPDATE "HouseholdMealPoll"
  SET "closesAt" = "dateKey"::date + TIME '10:00',
      "closedAt" = NULL
  WHERE "mealPeriod" = 'DINNER'
    AND "dateKey" >= TO_CHAR(
      CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh',
      'YYYY-MM-DD'
    )
    AND "closesAt" = "dateKey"::date + TIME '04:00'
  RETURNING "id"
)
UPDATE "HouseholdMealPollOption"
SET "finalAgreeCount" = NULL,
    "finalDisagreeCount" = NULL,
    "finalUnvotedCount" = NULL
WHERE "pollId" IN (SELECT "id" FROM reopened_polls);
