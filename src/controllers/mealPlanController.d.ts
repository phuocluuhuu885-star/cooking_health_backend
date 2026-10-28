import type { Request, Response } from "express";
import "dotenv/config";
export declare const addMealToPlan: (req: Request, res: Response) => Promise<void>;
export declare const getMealPlan: (req: Request, res: Response) => Promise<void>;
export declare const updateMealConsumption: (req: Request, res: Response) => Promise<void>;
export declare const completePersonalMeal: (req: Request, res: Response) => Promise<void>;
export declare const deletePlannedMeal: (req: Request, res: Response) => Promise<void>;
export declare const addConsumedMealEntry: (req: Request, res: Response) => Promise<void>;
export declare const getDailyConsumedMeals: (req: Request, res: Response) => Promise<void>;
export declare const getConsumptionReport: (req: Request, res: Response) => Promise<void>;
//# sourceMappingURL=mealPlanController.d.ts.map