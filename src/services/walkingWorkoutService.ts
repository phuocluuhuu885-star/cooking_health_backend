export const WALKING_CALCULATION_METHOD = "MET_SPEED_BANDS_V1";
export const WALKING_SOURCE = "MEALCRAFT_NATIVE";

export type WalkingEnergyEstimate = {
  averageSpeed: number | null;
  metValue: number;
  caloriesBurned: number | null;
  activeCalories: number | null;
};

export const calculateWalkingEnergy = (
  weightKg: number | null,
  durationSeconds: number,
  distanceMeters: number,
): WalkingEnergyEstimate => {
  const validDuration =
    Number.isFinite(durationSeconds) && durationSeconds > 0;
  const averageSpeed =
    validDuration &&
    Number.isFinite(distanceMeters) &&
    distanceMeters >= 0
      ? distanceMeters / durationSeconds
      : null;
  const speedKmh = (averageSpeed ?? 0) * 3.6;
  const metValue =
    speedKmh < 3.2 ? 2 : speedKmh < 4.8 ? 2.8 : speedKmh < 6.4 ? 3.5 : 5;

  if (
    !validDuration ||
    weightKg === null ||
    !Number.isFinite(weightKg) ||
    weightKg < 25 ||
    weightKg > 300
  ) {
    return {
      averageSpeed,
      metValue,
      caloriesBurned: null,
      activeCalories: null,
    };
  }

  const calorieFactor = (3.5 * weightKg * (durationSeconds / 60)) / 200;
  return {
    averageSpeed,
    metValue,
    caloriesBurned: Math.round(metValue * calorieFactor * 10) / 10,
    activeCalories:
      Math.round(Math.max(metValue - 1, 0) * calorieFactor * 10) / 10,
  };
};

export const getActiveDurationSeconds = ({
  startedAt,
  now,
  pausedDurationSeconds,
  pausedAt,
}: {
  startedAt: Date;
  now: Date;
  pausedDurationSeconds: number;
  pausedAt: Date | null;
}): number =>
  Math.max(
    0,
    Math.floor(
      ((pausedAt ?? now).getTime() -
        startedAt.getTime() -
        pausedDurationSeconds * 1000) /
        1000,
    ),
  );

export const isValidWeight = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= 25 &&
  value <= 300;

export const isValidClientSessionId = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length >= 8 &&
  value.length <= 64 &&
  /^[a-zA-Z0-9_-]+$/.test(value);
