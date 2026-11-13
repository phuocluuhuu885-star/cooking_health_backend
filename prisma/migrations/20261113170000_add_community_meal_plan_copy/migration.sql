ALTER TABLE "Meal"
ADD COLUMN "communitySourceId" TEXT;

CREATE UNIQUE INDEX "Meal_communitySourceId_key"
ON "Meal"("communitySourceId");

ALTER TABLE "Meal"
ADD CONSTRAINT "Meal_communitySourceId_fkey"
FOREIGN KEY ("communitySourceId") REFERENCES "CommunityMeal"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
