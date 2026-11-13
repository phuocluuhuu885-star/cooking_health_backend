CREATE TABLE "CommunityMealFavorite" (
    "id" TEXT NOT NULL,
    "mealId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityMealFavorite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CommunityMealFavorite_mealId_userId_key"
ON "CommunityMealFavorite"("mealId", "userId");
CREATE INDEX "CommunityMealFavorite_userId_createdAt_idx"
ON "CommunityMealFavorite"("userId", "createdAt");

ALTER TABLE "CommunityMealFavorite"
ADD CONSTRAINT "CommunityMealFavorite_mealId_fkey"
FOREIGN KEY ("mealId") REFERENCES "CommunityMeal"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CommunityMealFavorite"
ADD CONSTRAINT "CommunityMealFavorite_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
