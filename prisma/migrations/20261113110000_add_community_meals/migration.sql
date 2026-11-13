CREATE TABLE "CommunityMeal" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(500),
    "ingredients" JSONB NOT NULL,
    "instructions" TEXT NOT NULL,
    "nutrition" JSONB NOT NULL,
    "image" BYTEA NOT NULL,
    "contentType" VARCHAR(30) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunityMeal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CommunityMeal_createdAt_idx" ON "CommunityMeal"("createdAt");
CREATE INDEX "CommunityMeal_creatorId_createdAt_idx" ON "CommunityMeal"("creatorId", "createdAt");

ALTER TABLE "CommunityMeal"
ADD CONSTRAINT "CommunityMeal_creatorId_fkey"
FOREIGN KEY ("creatorId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
