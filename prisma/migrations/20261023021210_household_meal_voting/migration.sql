-- CreateTable
CREATE TABLE "HouseholdMealPoll" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "dateKey" VARCHAR(10) NOT NULL,
    "mealPeriod" "MealPeriod" NOT NULL,
    "closesAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HouseholdMealPoll_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HouseholdMealPollOption" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "mealId" TEXT NOT NULL,
    "proposedByUserId" TEXT NOT NULL,
    "servings" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "finalAgreeCount" INTEGER,
    "finalDisagreeCount" INTEGER,
    "finalUnvotedCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HouseholdMealPollOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HouseholdMealVote" (
    "id" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "agrees" BOOLEAN NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HouseholdMealVote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HouseholdMealPoll_closedAt_closesAt_idx" ON "HouseholdMealPoll"("closedAt", "closesAt");

-- CreateIndex
CREATE UNIQUE INDEX "HouseholdMealPoll_householdId_dateKey_mealPeriod_key" ON "HouseholdMealPoll"("householdId", "dateKey", "mealPeriod");

-- CreateIndex
CREATE INDEX "HouseholdMealPollOption_pollId_createdAt_idx" ON "HouseholdMealPollOption"("pollId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "HouseholdMealPollOption_pollId_mealId_key" ON "HouseholdMealPollOption"("pollId", "mealId");

-- CreateIndex
CREATE INDEX "HouseholdMealVote_userId_updatedAt_idx" ON "HouseholdMealVote"("userId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "HouseholdMealVote_optionId_userId_key" ON "HouseholdMealVote"("optionId", "userId");

-- AddForeignKey
ALTER TABLE "HouseholdMealPoll" ADD CONSTRAINT "HouseholdMealPoll_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdMealPollOption" ADD CONSTRAINT "HouseholdMealPollOption_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "HouseholdMealPoll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdMealPollOption" ADD CONSTRAINT "HouseholdMealPollOption_mealId_fkey" FOREIGN KEY ("mealId") REFERENCES "Meal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdMealPollOption" ADD CONSTRAINT "HouseholdMealPollOption_proposedByUserId_fkey" FOREIGN KEY ("proposedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdMealVote" ADD CONSTRAINT "HouseholdMealVote_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "HouseholdMealPollOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdMealVote" ADD CONSTRAINT "HouseholdMealVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
