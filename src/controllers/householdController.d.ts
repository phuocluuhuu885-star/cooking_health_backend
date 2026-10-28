import type { Request, Response } from "express";
import "dotenv/config";
export declare const getCurrentHousehold: (req: Request, res: Response) => Promise<void>;
export declare const createHousehold: (req: Request, res: Response) => Promise<void>;
export declare const createHouseholdInvitation: (req: Request, res: Response) => Promise<void>;
export declare const joinHousehold: (req: Request, res: Response) => Promise<void>;
export declare const removeHouseholdMember: (req: Request, res: Response) => Promise<void>;
export declare const leaveHousehold: (req: Request, res: Response) => Promise<void>;
export declare const getHouseholdMealPlan: (req: Request, res: Response) => Promise<void>;
export declare const updateHouseholdMealPollDeadline: (req: Request, res: Response) => Promise<void>;
export declare const addMealToHouseholdPlan: (req: Request, res: Response) => Promise<void>;
export declare const voteForHouseholdMeal: (req: Request, res: Response) => Promise<void>;
export declare const updateHouseholdMealConsumption: (req: Request, res: Response) => Promise<void>;
export declare const completeHouseholdMeal: (req: Request, res: Response) => Promise<void>;
export declare const deleteHouseholdPlannedMeal: (req: Request, res: Response) => Promise<void>;
//# sourceMappingURL=householdController.d.ts.map