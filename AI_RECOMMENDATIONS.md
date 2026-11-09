# AI meal recommendations

The authenticated `POST /api/ai/meal-recommendations` endpoint ranks lunch and
dinner recipes from the MealCraft database against the user's daily nutrition
targets and recorded intake. The server calculates nutrition and serving limits;
Gemini may only rank the supplied database recipes and provide short reasons.
Returned meal IDs are validated against the server's candidate list.

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
questions directly from MealCraft data. Meal suggestions are ranked locally
from the user's remaining nutrition targets and catalog meals; only general
MealCraft questions that need a generated explanation call Gemini. This keeps
common nutrition answers independent of model latency.

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
