import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateWalkingEnergy,
  getActiveDurationSeconds,
  isValidClientSessionId,
  isValidWeight,
} from "./walkingWorkoutService.js";

test("standing still does not accumulate walking calories", () => {
  assert.deepEqual(calculateWalkingEnergy(70, 30 * 60, 0, 0), {
    averageSpeed: 0,
    metValue: 0,
    caloriesBurned: 0,
    activeCalories: 0,
  });
});

test("walking MET increases with measured pace", () => {
  assert.equal(calculateWalkingEnergy(70, 600, 600, 1000).metValue, 2.8);
  assert.equal(calculateWalkingEnergy(70, 600, 900, 1000).metValue, 3.5);
  assert.equal(calculateWalkingEnergy(70, 600, 1100, 1000).metValue, 5);
});

test("idle time does not increase calories when steps and distance are unchanged", () => {
  const walkingCalories = calculateWalkingEnergy(70, 600, 600, 1000);
  const idleCalories = calculateWalkingEnergy(70, 1800, 600, 1000);
  assert.equal(idleCalories.caloriesBurned, walkingCalories.caloriesBurned);
  assert.equal(idleCalories.activeCalories, walkingCalories.activeCalories);
});

test("GPS-only calorie estimate is based on distance, not idle duration", () => {
  const shortSession = calculateWalkingEnergy(70, 600, 600);
  const longSession = calculateWalkingEnergy(70, 1800, 600);
  assert.equal(longSession.caloriesBurned, shortSession.caloriesBurned);
});

test("step data can estimate calories when GPS distance is unavailable", () => {
  const shortSession = calculateWalkingEnergy(70, 600, 0, 1000);
  const longSession = calculateWalkingEnergy(70, 1800, 0, 1000);
  assert.ok(shortSession.caloriesBurned && shortSession.caloriesBurned > 0);
  assert.equal(longSession.caloriesBurned, shortSession.caloriesBurned);
});

test("energy remains unavailable without valid weight or active duration", () => {
  assert.equal(calculateWalkingEnergy(null, 600, 500).caloriesBurned, null);
  assert.equal(calculateWalkingEnergy(20, 600, 500).activeCalories, null);
  assert.equal(calculateWalkingEnergy(70, 0, 0).caloriesBurned, null);
});

test("active duration excludes completed and current pauses", () => {
  const startedAt = new Date("2026-10-28T00:00:00.000Z");
  assert.equal(
    getActiveDurationSeconds({
      startedAt,
      now: new Date("2026-10-28T00:20:00.000Z"),
      pausedDurationSeconds: 300,
      pausedAt: new Date("2026-10-28T00:18:00.000Z"),
    }),
    780,
  );
});

test("weight and client session id validation enforce supported ranges", () => {
  assert.equal(isValidWeight(70), true);
  assert.equal(isValidWeight(24.9), false);
  assert.equal(isValidWeight(Number.NaN), false);
  assert.equal(isValidClientSessionId("walking_12345"), true);
  assert.equal(isValidClientSessionId("short"), false);
  assert.equal(isValidClientSessionId("not safe!"), false);
});
