CREATE TABLE "WaterIntakeEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amountMl" INTEGER NOT NULL,
    "consumedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaterIntakeEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WaterIntakeEntry_userId_consumedAt_idx"
    ON "WaterIntakeEntry"("userId", "consumedAt");

ALTER TABLE "WaterIntakeEntry"
    ADD CONSTRAINT "WaterIntakeEntry_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
