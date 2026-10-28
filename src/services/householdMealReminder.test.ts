import assert from "node:assert/strict";
import test from "node:test";
import { isMealReminderAllowed } from "./householdMealReminder.js";

const vietnamTime = (hour: number, minute: number) =>
  new Date(Date.UTC(2026, 0, 15, hour - 7, minute));

test("meal reminder is allowed from 10:30 through 12:59 Vietnam time", () => {
  assert.equal(isMealReminderAllowed("LUNCH", vietnamTime(10, 29)), false);
  assert.equal(isMealReminderAllowed("LUNCH", vietnamTime(10, 30)), true);
  assert.equal(isMealReminderAllowed("LUNCH", vietnamTime(12, 59)), true);
  assert.equal(isMealReminderAllowed("LUNCH", vietnamTime(13, 0)), false);
});

test("meal reminder is allowed from 16:30 through 19:59 Vietnam time", () => {
  assert.equal(isMealReminderAllowed("DINNER", vietnamTime(16, 29)), false);
  assert.equal(isMealReminderAllowed("DINNER", vietnamTime(16, 30)), true);
  assert.equal(isMealReminderAllowed("DINNER", vietnamTime(19, 59)), true);
  assert.equal(isMealReminderAllowed("DINNER", vietnamTime(20, 0)), false);
});
