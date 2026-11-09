CREATE TABLE "HealthProfileHistory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weightKg" DOUBLE PRECISION NOT NULL,
    "bmi" DOUBLE PRECISION NOT NULL,
    "measuredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HealthProfileHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "HealthProfileHistory_userId_measuredAt_idx"
    ON "HealthProfileHistory"("userId", "measuredAt");

ALTER TABLE "HealthProfileHistory"
    ADD CONSTRAINT "HealthProfileHistory_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "HealthProfileHistory" ("id", "userId", "weightKg", "bmi", "measuredAt", "createdAt")
SELECT
    'health-history-' || "id",
    "userId",
    "weightKg",
    "bmi",
    "updatedAt",
    "updatedAt"
FROM "HealthProfile";
