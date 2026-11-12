# AI meal recommendations

The authenticated `POST /api/ai/meal-recommendations` endpoint ranks lunch and
dinner recipes from the MealCraft database against the user's nutrition targets
and recorded intake. Remaining daily calories and macros are divided between
the lunch and dinner periods that have not yet been consumed. The server
calculates serving limits and estimated prices, excludes dishes that individually
exceed a saved meal budget, and caps each returned meal list so its combined
estimated maximum cost and nutrition stay within that period's allocations.
Gemini may only rank the supplied database recipes and provide short reasons;
the server validates and enforces the final limits.
Saved personal or household meal budgets affect recommendations only while
their `enabled` switch is on. With the switch off, saved budget values are not
used for ranking or filtering.

The mobile app asks for explicit consent before the first request and supports
revoking that consent. Requests without `consent: true` are rejected. When
Gemini is unavailable or not configured, the endpoint transparently returns
the server's nutrition-ranked recommendations instead.

The Home AI Coach also uses these recommendations to prepare a seven-day
preview. It requests today's remaining-intake suggestions and one full-day
suggestion set, rotates the available choices for later days, and only writes
the selected items after the user confirms. The preview shows recipe photos,
preselects up to two suggestions per meal, and allows multiple selections.
Suggested portions are divided across selected dishes to keep the meal's
overall portion budget steady. `POST /api/ai/weekly-plan` validates up to 56
meal selections, meal IDs, lunch/dinner categories, serving sizes, and dates
before saving the batch atomically to the user's personal meal plan. It does
not modify household plans.

For family plans, `POST /api/household/ai/meal-recommendations` combines the
daily nutrition targets and recorded intake of household members who have a
health profile. Members without a profile are excluded. The family calculation
runs locally on the backend; family health data is not sent to Gemini. Saving
the preview submits selected dishes to open household polls, or adds them
directly to the household plan when the poll has closed.

The authenticated `POST /api/ai/chat` endpoint answers intake and current-menu
questions from MealCraft data. For meal recommendations, Gemini may choose
from the supplied catalog candidates, and the backend validates every returned
meal ID. If Gemini is unavailable or returns no valid candidate IDs, the
backend ranks eligible meals locally against the user's remaining nutrition
and returns up to three suggestions. The chat catalog is limited to the 24
newest published lunch and dinner recipes with usable nutrition data.

Configure these variables in the backend environment (never in the mobile app):

```dotenv
GEMINI_API_KEY=your-server-side-key naă
GEMINI_MODEL=gemini-3.8-flash
```

Gemini receives only daily calorie/macro targets, consumed and remaining
nutrition totals, and candidate recipe IDs, names, serving sizes, and nutrition.
The request does not include account identifiers, email, name,
age, gender, height, weight, or BMI. For profiles under 18, recommendations
remain server-side and no data is sent to Gemini. Adult nutrition totals can
still be sensitive health information; the user's consent is required before
sending them to Google.
