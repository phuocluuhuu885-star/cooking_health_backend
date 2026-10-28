ALTER TABLE "PlannedMeal"
ADD COLUMN "isConsumed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "consumedAt" TIMESTAMP(3);

CREATE INDEX "PlannedMeal_userId_isConsumed_dateKey_idx"
ON "PlannedMeal"("userId", "isConsumed", "dateKey");
