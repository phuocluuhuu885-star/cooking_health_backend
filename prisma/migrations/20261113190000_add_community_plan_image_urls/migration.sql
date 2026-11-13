UPDATE "Meal"
SET "imageUrl" = '/api/community-meals/' || "communitySourceId" || '/image'
WHERE "communitySourceId" IS NOT NULL
  AND "imageUrl" IS NULL;
