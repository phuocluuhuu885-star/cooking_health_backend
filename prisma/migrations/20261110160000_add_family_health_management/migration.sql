ALTER TABLE "HealthProfile"
ADD COLUMN "allowFamilyHealthManagement" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "HealthProfileHistory"
ADD COLUMN "recordedByUserId" TEXT;
