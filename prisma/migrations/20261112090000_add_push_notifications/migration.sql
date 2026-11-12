CREATE TYPE "PushPlatform" AS ENUM ('ANDROID');

CREATE TABLE "PushDeviceToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" "PushPlatform" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PushDeviceToken_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "HouseholdNotification"
ADD COLUMN "pushSentAt" TIMESTAMP(3),
ADD COLUMN "pushFailedAt" TIMESTAMP(3),
ADD COLUMN "pushAttemptCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "pushNextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "HouseholdNotification"
SET "pushSentAt" = CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX "PushDeviceToken_token_key" ON "PushDeviceToken"("token");
CREATE INDEX "PushDeviceToken_userId_idx" ON "PushDeviceToken"("userId");
CREATE INDEX "HouseholdNotification_push_delivery_idx"
ON "HouseholdNotification"("pushSentAt", "pushFailedAt", "pushNextAttemptAt", "createdAt");

ALTER TABLE "PushDeviceToken"
ADD CONSTRAINT "PushDeviceToken_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
