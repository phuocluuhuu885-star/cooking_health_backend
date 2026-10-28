CREATE TYPE "WalkingWorkoutStatus" AS ENUM (
    'IN_PROGRESS',
    'PAUSED',
    'FINISHED'
);

CREATE TABLE "WalkingWorkout" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clientSessionId" VARCHAR(64) NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pausedAt" TIMESTAMP(3),
    "durationSeconds" INTEGER NOT NULL DEFAULT 0,
    "pausedDurationSeconds" INTEGER NOT NULL DEFAULT 0,
    "steps" INTEGER NOT NULL DEFAULT 0,
    "distanceMeters" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "caloriesBurned" DOUBLE PRECISION,
    "activeCalories" DOUBLE PRECISION,
    "averageSpeed" DOUBLE PRECISION,
    "weightKgAtWorkout" DOUBLE PRECISION,
    "metValue" DOUBLE PRECISION,
    "calculationMethod" VARCHAR(40),
    "source" VARCHAR(40) NOT NULL DEFAULT 'MEALCRAFT_FOREGROUND',
    "status" "WalkingWorkoutStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WalkingWorkout_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WalkingWorkout_userId_clientSessionId_key"
ON "WalkingWorkout"("userId", "clientSessionId");

CREATE INDEX "WalkingWorkout_userId_startedAt_idx"
ON "WalkingWorkout"("userId", "startedAt");

CREATE INDEX "WalkingWorkout_userId_status_idx"
ON "WalkingWorkout"("userId", "status");

CREATE UNIQUE INDEX "WalkingWorkout_one_active_per_user_key"
ON "WalkingWorkout"("userId")
WHERE "status" IN ('IN_PROGRESS', 'PAUSED');

ALTER TABLE "WalkingWorkout"
ADD CONSTRAINT "WalkingWorkout_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
