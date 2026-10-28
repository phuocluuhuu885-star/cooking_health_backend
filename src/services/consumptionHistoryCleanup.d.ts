import "dotenv/config";
export declare const cleanupExpiredConsumptionHistory: (now?: Date) => Promise<{
    cutoff: Date;
    expiredCompletionSnapshots: number;
    expiredPersonalConsumptions: number;
    expiredHouseholdConsumptions: number;
}>;
export declare const startConsumptionHistoryCleanup: () => void;
//# sourceMappingURL=consumptionHistoryCleanup.d.ts.map