CREATE TYPE "CommunityMealStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE "CommunityModerationSource" AS ENUM ('ADMIN', 'AI');

ALTER TABLE "CommunityMeal"
ADD COLUMN "status" "CommunityMealStatus" NOT NULL DEFAULT 'APPROVED',
ADD COLUMN "moderationSource" "CommunityModerationSource",
ADD COLUMN "moderationReason" VARCHAR(500),
ADD COLUMN "reviewedAt" TIMESTAMP(3),
ADD COLUMN "reviewedById" TEXT;

ALTER TABLE "CommunityMeal"
ALTER COLUMN "status" SET DEFAULT 'PENDING';

CREATE INDEX "CommunityMeal_status_createdAt_idx"
ON "CommunityMeal"("status", "createdAt");

ALTER TABLE "CommunityMeal"
ADD CONSTRAINT "CommunityMeal_reviewedById_fkey"
FOREIGN KEY ("reviewedById") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "CommunityModerationSettings" (
    "id" INTEGER NOT NULL,
    "autoModerationEnabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunityModerationSettings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "CommunityModerationSettings" ("id", "autoModerationEnabled", "updatedAt")
VALUES (1, false, CURRENT_TIMESTAMP);
