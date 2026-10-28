CREATE TABLE "HouseholdChatMessage" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "senderUserId" TEXT,
    "content" VARCHAR(2000) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HouseholdChatMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HouseholdChatReadState" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "HouseholdChatReadState_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "HouseholdChatMessage_householdId_createdAt_idx"
ON "HouseholdChatMessage"("householdId", "createdAt");

CREATE UNIQUE INDEX "HouseholdChatReadState_householdId_userId_key"
ON "HouseholdChatReadState"("householdId", "userId");

ALTER TABLE "HouseholdChatMessage"
ADD CONSTRAINT "HouseholdChatMessage_householdId_fkey"
FOREIGN KEY ("householdId") REFERENCES "Household"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "HouseholdChatMessage"
ADD CONSTRAINT "HouseholdChatMessage_senderUserId_fkey"
FOREIGN KEY ("senderUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "HouseholdChatReadState"
ADD CONSTRAINT "HouseholdChatReadState_householdId_fkey"
FOREIGN KEY ("householdId") REFERENCES "Household"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "HouseholdChatReadState"
ADD CONSTRAINT "HouseholdChatReadState_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
