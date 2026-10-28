CREATE TABLE "MealReview" (
    "id" TEXT NOT NULL,
    "mealId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" VARCHAR(1000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MealReview_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MealReview_mealId_userId_key"
ON "MealReview"("mealId", "userId");

CREATE INDEX "MealReview_mealId_createdAt_idx"
ON "MealReview"("mealId", "createdAt");

ALTER TABLE "MealReview"
ADD CONSTRAINT "MealReview_mealId_fkey"
FOREIGN KEY ("mealId") REFERENCES "Meal"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MealReview"
ADD CONSTRAINT "MealReview_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
