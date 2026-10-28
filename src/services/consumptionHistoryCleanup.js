import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "../generated/prisma/client.js";
import "dotenv/config";
const RETENTION_DAYS = 30;
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });
export const cleanupExpiredConsumptionHistory = async (now = new Date()) => {
    const cutoff = new Date(now);
    cutoff.setUTCDate(cutoff.getUTCDate() - RETENTION_DAYS);
    const [expiredCompletions, personalMeals, householdMeals] = await prisma.$transaction([
        prisma.mealCompletion.updateMany({
            where: {
                completedAt: { lt: cutoff },
                consumedItems: { gt: 0 },
            },
            data: {
                items: [],
                nutritionSummary: {
                    calories: 0,
                    proteinG: 0,
                    carbsG: 0,
                    fatG: 0,
                },
                consumedItems: 0,
                unavailableNutritionItems: 0,
            },
        }),
        prisma.plannedMeal.updateMany({
            where: {
                isConsumed: true,
                consumedAt: { lt: cutoff },
            },
            data: {
                isConsumed: false,
                consumedAt: null,
            },
        }),
        prisma.householdPlannedMeal.updateMany({
            where: {
                isConsumed: true,
                consumedAt: { lt: cutoff },
            },
            data: {
                isConsumed: false,
                consumedAt: null,
                consumedByUserId: null,
            },
        }),
    ]);
    return {
        cutoff,
        expiredCompletionSnapshots: expiredCompletions.count,
        expiredPersonalConsumptions: personalMeals.count,
        expiredHouseholdConsumptions: householdMeals.count,
    };
};
export const startConsumptionHistoryCleanup = () => {
    const runCleanup = async () => {
        try {
            const result = await cleanupExpiredConsumptionHistory();
            const removed = result.expiredCompletionSnapshots +
                result.expiredPersonalConsumptions +
                result.expiredHouseholdConsumptions;
            if (removed > 0) {
                console.info("Expired consumption history was cleared", result);
            }
        }
        catch (error) {
            console.error("Failed to clear expired consumption history", error);
        }
    };
    void runCleanup();
    const interval = setInterval(() => {
        void runCleanup();
    }, CLEANUP_INTERVAL_MS);
    interval.unref();
};
//# sourceMappingURL=consumptionHistoryCleanup.js.map