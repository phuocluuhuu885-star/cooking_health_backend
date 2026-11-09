CREATE TYPE "ExpenseScope" AS ENUM ('PERSONAL', 'HOUSEHOLD');
CREATE TYPE "ExpenseSource" AS ENUM ('MANUAL', 'MEAL');
CREATE TYPE "ExpenseCategory" AS ENUM (
    'FOOD',
    'SHOPPING',
    'TRANSPORT',
    'HOUSEHOLD',
    'HEALTH',
    'ENTERTAINMENT',
    'OTHER'
);

CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "scope" "ExpenseScope" NOT NULL,
    "source" "ExpenseSource" NOT NULL DEFAULT 'MANUAL',
    "category" "ExpenseCategory" NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "amountVnd" INTEGER NOT NULL,
    "expenseDate" DATE NOT NULL,
    "note" VARCHAR(500),
    "mealId" TEXT,
    "mealName" VARCHAR(120),
    "mealPeriod" "MealPeriod",
    "ownerUserId" TEXT,
    "createdByUserId" TEXT,
    "householdId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Expense_positive_amount" CHECK ("amountVnd" > 0),
    CONSTRAINT "Expense_scope_owner_check" CHECK (
        ("scope" = 'PERSONAL' AND "ownerUserId" IS NOT NULL AND "householdId" IS NULL)
        OR
        ("scope" = 'HOUSEHOLD' AND "ownerUserId" IS NULL AND "householdId" IS NOT NULL)
    ),
    CONSTRAINT "Expense_meal_source_check" CHECK (
        ("source" = 'MEAL' AND "mealId" IS NOT NULL AND "mealName" IS NOT NULL)
        OR
        ("source" = 'MANUAL' AND "mealId" IS NULL AND "mealName" IS NULL)
    )
);

CREATE INDEX "Expense_ownerUserId_expenseDate_idx"
    ON "Expense"("ownerUserId", "expenseDate");
CREATE INDEX "Expense_householdId_expenseDate_idx"
    ON "Expense"("householdId", "expenseDate");

ALTER TABLE "Expense"
    ADD CONSTRAINT "Expense_ownerUserId_fkey"
    FOREIGN KEY ("ownerUserId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Expense"
    ADD CONSTRAINT "Expense_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Expense"
    ADD CONSTRAINT "Expense_householdId_fkey"
    FOREIGN KEY ("householdId") REFERENCES "Household"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "MealBudget" (
    "id" TEXT NOT NULL,
    "mealPeriod" "MealPeriod" NOT NULL,
    "limitVnd" INTEGER NOT NULL,
    "ownerUserId" TEXT,
    "householdId" TEXT,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MealBudget_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MealBudget_positive_limit" CHECK ("limitVnd" > 0),
    CONSTRAINT "MealBudget_owner_check" CHECK (
        ("ownerUserId" IS NOT NULL AND "householdId" IS NULL)
        OR
        ("ownerUserId" IS NULL AND "householdId" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "MealBudget_ownerUserId_mealPeriod_key"
    ON "MealBudget"("ownerUserId", "mealPeriod");
CREATE UNIQUE INDEX "MealBudget_householdId_mealPeriod_key"
    ON "MealBudget"("householdId", "mealPeriod");

ALTER TABLE "MealBudget"
    ADD CONSTRAINT "MealBudget_ownerUserId_fkey"
    FOREIGN KEY ("ownerUserId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MealBudget"
    ADD CONSTRAINT "MealBudget_householdId_fkey"
    FOREIGN KEY ("householdId") REFERENCES "Household"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MealBudget"
    ADD CONSTRAINT "MealBudget_updatedByUserId_fkey"
    FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
