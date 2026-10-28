export type HouseholdMealPeriod = "LUNCH" | "DINNER";

const MEAL_REMINDER_WINDOWS: Record<
  HouseholdMealPeriod,
  { startMinute: number; endMinute: number }
> = {
  LUNCH: { startMinute: 10 * 60 + 30, endMinute: 13 * 60 },
  DINNER: { startMinute: 16 * 60 + 30, endMinute: 20 * 60 },
};

export const isMealReminderAllowed = (
  mealPeriod: HouseholdMealPeriod,
  now: Date,
): boolean => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const hour = Number(parts.find(part => part.type === "hour")?.value);
  const minute = Number(parts.find(part => part.type === "minute")?.value);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return false;
  const minuteOfDay = hour * 60 + minute;
  const window = MEAL_REMINDER_WINDOWS[mealPeriod];
  return minuteOfDay >= window.startMinute && minuteOfDay < window.endMinute;
};
