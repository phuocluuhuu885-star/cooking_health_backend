import { Prisma, PrismaClient } from "../generated/prisma/client.js";
import "dotenv/config";
type DatabaseClient = PrismaClient | Prisma.TransactionClient;
export declare const getHouseholdDateKey: (date?: Date) => string;
export declare const ensureHouseholdMealPoll: (database: DatabaseClient, householdId: string, dateKey: string, mealPeriod: "LUNCH" | "DINNER") => Promise<{
    id: string;
    householdId: string;
    dateKey: string;
    mealPeriod: import("../generated/prisma/enums.js").MealPeriod;
    closesAt: Date;
    closedAt: Date | null;
    createdAt: Date;
}>;
export declare const finalizeHouseholdMealPoll: (database: PrismaClient, pollId: string, now?: Date, force?: boolean) => Promise<boolean>;
export declare const startHouseholdMealPollScheduler: () => void;
export {};
//# sourceMappingURL=householdMealPollService.d.ts.map