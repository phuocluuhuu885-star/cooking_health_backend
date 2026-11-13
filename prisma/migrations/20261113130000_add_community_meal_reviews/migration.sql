CREATE TABLE "CommunityMealReview" (
    "id" TEXT NOT NULL,
    "mealId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" VARCHAR(1000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunityMealReview_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CommunityMealReview_mealId_userId_key"
ON "CommunityMealReview"("mealId", "userId");
CREATE INDEX "CommunityMealReview_mealId_createdAt_idx"
ON "CommunityMealReview"("mealId", "createdAt");

ALTER TABLE "CommunityMealReview"
ADD CONSTRAINT "CommunityMealReview_mealId_fkey"
FOREIGN KEY ("mealId") REFERENCES "CommunityMeal"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CommunityMealReview"
ADD CONSTRAINT "CommunityMealReview_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
