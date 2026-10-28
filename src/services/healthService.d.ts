import { ActivityLevel, BmiCategory, Gender, Goal } from "../generated/prisma/client.js";
export declare const calculateHealthMetrics: ({ age, gender, heightCm, weightKg, activityLevel, goal, }: {
    age: number;
    gender: Gender;
    heightCm: number;
    weightKg: number;
    activityLevel: ActivityLevel;
    goal: Goal;
}) => {
    bmr: number;
    tdee: number;
    dailyCaloriesTarget: number;
    bmi: number;
    bmiCategory: BmiCategory | null;
    healthyWeightMinKg: number | null;
    healthyWeightMaxKg: number | null;
    targetProteinG: number;
    targetCarbsG: number;
    targetFatG: number;
};
//# sourceMappingURL=healthService.d.ts.map