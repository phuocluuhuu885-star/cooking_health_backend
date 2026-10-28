import { ActivityLevel, BmiCategory, Gender, Goal, } from "../generated/prisma/client.js";
const ACTIVITY_FACTOR = {
    SEDENTARY: 1.2,
    LIGHT: 1.375,
    MODERATE: 1.55,
    ACTIVE: 1.725,
    VERY_ACTIVE: 1.9,
};
const GOAL_CALORIE_ADJUSTMENT = {
    LOSE_WEIGHT: -500,
    MAINTAIN: 0,
    GAIN_MUSCLE: 300,
};
export const calculateHealthMetrics = ({ age, gender, heightCm, weightKg, activityLevel, goal, }) => {
    const heightM = heightCm / 100;
    const bmi = weightKg / (heightM * heightM);
    const isAdult = age >= 18;
    let bmiCategory = null;
    if (isAdult) {
        if (bmi < 18.5) {
            bmiCategory = BmiCategory.UNDERWEIGHT;
        }
        else if (bmi < 25) {
            bmiCategory = BmiCategory.NORMAL_WEIGHT;
        }
        else if (bmi < 30) {
            bmiCategory = BmiCategory.OVERWEIGHT;
        }
        else if (bmi < 35) {
            bmiCategory = BmiCategory.OBESITY_CLASS_I;
        }
        else if (bmi < 40) {
            bmiCategory = BmiCategory.OBESITY_CLASS_II;
        }
        else {
            bmiCategory = BmiCategory.OBESITY_CLASS_III;
        }
    }
    const bmr = gender === Gender.MALE
        ? 10 * weightKg + 6.25 * heightCm - 5 * age + 5
        : 10 * weightKg + 6.25 * heightCm - 5 * age - 161;
    const tdee = bmr * ACTIVITY_FACTOR[activityLevel];
    const dailyCaloriesTarget = Math.max(1200, Math.round(tdee + GOAL_CALORIE_ADJUSTMENT[goal]));
    const proteinPerKg = goal === Goal.GAIN_MUSCLE ? 2 : 1.8;
    const targetProteinG = Math.min(weightKg * proteinPerKg, (dailyCaloriesTarget * 0.75) / 4);
    const targetFatG = (dailyCaloriesTarget * 0.25) / 9;
    const targetCarbsG = Math.max(0, (dailyCaloriesTarget - targetProteinG * 4 - targetFatG * 9) / 4);
    return {
        bmr: Math.round(bmr),
        tdee: Math.round(tdee),
        dailyCaloriesTarget,
        bmi: Math.round(bmi * 100) / 100,
        bmiCategory,
        healthyWeightMinKg: isAdult
            ? Math.round(18.5 * heightM * heightM * 10) / 10
            : null,
        healthyWeightMaxKg: isAdult
            ? Math.round(24.9 * heightM * heightM * 10) / 10
            : null,
        targetProteinG: Math.round(targetProteinG),
        targetCarbsG: Math.round(targetCarbsG),
        targetFatG: Math.round(targetFatG),
    };
};
//# sourceMappingURL=healthService.js.map