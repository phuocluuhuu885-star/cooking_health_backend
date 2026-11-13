WITH parsed_ingredients AS (
    SELECT
        ingredient."id",
        regexp_match(
            ingredient."name",
            '^(.+)[[:space:]]*[-–—:][[:space:]]*([0-9]+([.,][0-9]+)?)[[:space:]]*(g|gr|gram|grams|kg)?$',
            'i'
        ) AS parts
    FROM "Ingredient" AS ingredient
    INNER JOIN "Meal" AS meal ON meal."id" = ingredient."mealId"
    WHERE meal."communitySourceId" IS NOT NULL
)
UPDATE "Ingredient" AS ingredient
SET
    "name" = btrim(parsed_ingredients.parts[1]),
    "amountG" = (
        replace(parsed_ingredients.parts[2], ',', '.')::double precision
        * CASE WHEN lower(coalesce(parsed_ingredients.parts[4], 'g')) = 'kg'
            THEN 1000
            ELSE 1
          END
    )
FROM parsed_ingredients
WHERE ingredient."id" = parsed_ingredients."id"
  AND parsed_ingredients.parts IS NOT NULL;
