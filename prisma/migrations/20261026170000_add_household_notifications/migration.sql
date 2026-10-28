CREATE TABLE "HouseholdNotification" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "type" VARCHAR(40) NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),
    CONSTRAINT "HouseholdNotification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HouseholdNotification_userId_eventKey_key"
ON "HouseholdNotification"("userId", "eventKey");

CREATE INDEX "HouseholdNotification_userId_readAt_createdAt_idx"
ON "HouseholdNotification"("userId", "readAt", "createdAt");

CREATE INDEX "HouseholdNotification_householdId_createdAt_idx"
ON "HouseholdNotification"("householdId", "createdAt");

ALTER TABLE "HouseholdNotification"
ADD CONSTRAINT "HouseholdNotification_householdId_fkey"
FOREIGN KEY ("householdId") REFERENCES "Household"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "HouseholdNotification"
ADD CONSTRAINT "HouseholdNotification_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
