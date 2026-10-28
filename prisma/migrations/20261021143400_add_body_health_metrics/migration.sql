CREATE TYPE "BmiCategory" AS ENUM (
    'UNDERWEIGHT',
    'NORMAL_WEIGHT',
    'OVERWEIGHT',
    'OBESITY_CLASS_I',
    'OBESITY_CLASS_II',
    'OBESITY_CLASS_III'
);

ALTER TABLE "HealthProfile"
    ADD COLUMN "bmi" DOUBLE PRECISION,
    ADD COLUMN "bmiCategory" "BmiCategory",
    ADD COLUMN "healthyWeightMinKg" DOUBLE PRECISION,
    ADD COLUMN "healthyWeightMaxKg" DOUBLE PRECISION;

UPDATE "HealthProfile"
SET
    "bmi" = round(
        ("weightKg" / (("heightCm" / 100.0) * ("heightCm" / 100.0)))::numeric,
        2
    )::double precision,
    "bmiCategory" = CASE
        WHEN "age" < 18 THEN NULL
        WHEN "weightKg" / (("heightCm" / 100.0) * ("heightCm" / 100.0)) < 18.5 THEN 'UNDERWEIGHT'::"BmiCategory"
        WHEN "weightKg" / (("heightCm" / 100.0) * ("heightCm" / 100.0)) < 25 THEN 'NORMAL_WEIGHT'::"BmiCategory"
        WHEN "weightKg" / (("heightCm" / 100.0) * ("heightCm" / 100.0)) < 30 THEN 'OVERWEIGHT'::"BmiCategory"
        WHEN "weightKg" / (("heightCm" / 100.0) * ("heightCm" / 100.0)) < 35 THEN 'OBESITY_CLASS_I'::"BmiCategory"
        WHEN "weightKg" / (("heightCm" / 100.0) * ("heightCm" / 100.0)) < 40 THEN 'OBESITY_CLASS_II'::"BmiCategory"
        ELSE 'OBESITY_CLASS_III'::"BmiCategory"
    END,
    "healthyWeightMinKg" = CASE
        WHEN "age" >= 18 THEN round(
            (18.5 * ("heightCm" / 100.0) * ("heightCm" / 100.0))::numeric,
            1
        )::double precision
        ELSE NULL
    END,
    "healthyWeightMaxKg" = CASE
        WHEN "age" >= 18 THEN round(
            (24.9 * ("heightCm" / 100.0) * ("heightCm" / 100.0))::numeric,
            1
        )::double precision
        ELSE NULL
    END;

ALTER TABLE "HealthProfile"
    ALTER COLUMN "bmi" SET NOT NULL;
