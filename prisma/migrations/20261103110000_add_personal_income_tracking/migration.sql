CREATE TYPE "IncomeCategory" AS ENUM (
    'SALARY',
    'BUSINESS',
    'INVESTMENT',
    'GIFT',
    'OTHER'
);

CREATE TABLE "Income" (
    "id" TEXT NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "amountVnd" INTEGER NOT NULL,
    "incomeDate" DATE NOT NULL,
    "category" "IncomeCategory" NOT NULL,
    "note" VARCHAR(500),
    "ownerUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Income_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Income_positive_amount" CHECK ("amountVnd" > 0)
);

CREATE INDEX "Income_ownerUserId_incomeDate_idx"
    ON "Income"("ownerUserId", "incomeDate");

ALTER TABLE "Income"
    ADD CONSTRAINT "Income_ownerUserId_fkey"
    FOREIGN KEY ("ownerUserId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
