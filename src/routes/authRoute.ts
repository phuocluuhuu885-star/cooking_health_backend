import { Router } from "express";
import {
  changePassword,
  deleteAccount,
  login,
  register,
  updateAvatar,
  updatePersonalInfo,
  updateHealthProfile,
} from "../controllers/authController.js";
import {
  getAllMeals,
  getMealDetailWithServings,
  searchMeals,
} from "../controllers/mealController.js";
import {
  addConsumedMealEntry,
  completePersonalMeal,
  addMealToPlan,
  deletePlannedMeal,
  getDailyConsumedMeals,
  getConsumptionReport,
  getMealPlan,
  updateMealConsumption,
} from "../controllers/mealPlanController.js";
import {
  addMealToHouseholdPlan,
  completeHouseholdMeal,
  createHousehold,
  createHouseholdInvitation,
  deleteHouseholdPlannedMeal,
  getCurrentHousehold,
  getHouseholdMealPlan,
  joinHousehold,
  leaveHousehold,
  removeHouseholdMember,
  updateHouseholdMealConsumption,
  updateHouseholdMealPollDeadline,
  voteForHouseholdMeal,
} from "../controllers/householdController.js";
import {
  getHouseholdChatMessages,
  getHouseholdChatUnreadCount,
  markHouseholdChatRead,
} from "../controllers/householdChatController.js";
import {
  getHouseholdNotificationUnreadCount,
  getHouseholdNotifications,
  markAllHouseholdNotificationsRead,
  markHouseholdNotificationRead,
} from "../controllers/householdNotificationController.js";
import {
  getHouseholdShoppingList,
  updateHouseholdShoppingItem,
} from "../controllers/householdShoppingController.js";
import {
  createMealReview,
  getMealReviewSummaries,
  getMealReviews,
} from "../controllers/mealReviewController.js";
import {
  finishWalkingWorkout,
  getActiveWalkingWorkout,
  getWalkingDailySummary,
  getWalkingWorkout,
  getWalkingWorkoutHistory,
  pauseWalkingWorkout,
  resumeWalkingWorkout,
  startWalkingWorkout,
  updateWalkingWorkoutProgress,
} from "../controllers/walkingWorkoutController.js";
import { authenticate, optionalAuthenticate } from "../middlewares/auth.js";

const router = Router();

router.post("/auth/register", register);
router.post("/auth/login", login);
router.post("/auth/changePassword", authenticate, changePassword);
router.delete("/auth/account", authenticate, deleteAccount);
router.put("/auth/profile", authenticate, updatePersonalInfo);
router.put("/auth/profile/avatar", authenticate, updateAvatar);
router.get("/meal/getAll", getAllMeals);
router.get("/meal/search", searchMeals);
router.get(
  "/meal/reviews/summary",
  optionalAuthenticate,
  getMealReviewSummaries,
);
router.get("/meal/:id/reviews", optionalAuthenticate, getMealReviews);
router.post("/meal/:id/reviews", authenticate, createMealReview);
router.post("/walking-workouts", authenticate, startWalkingWorkout);
router.get("/walking-workouts/active", authenticate, getActiveWalkingWorkout);
router.get("/walking-workouts/history", authenticate, getWalkingWorkoutHistory);
router.get(
  "/walking-workouts/daily-summary",
  authenticate,
  getWalkingDailySummary,
);
router.get("/walking-workouts/summary", authenticate, getWalkingDailySummary);
router.put("/walking-workouts/:id/pause", authenticate, pauseWalkingWorkout);
router.put("/walking-workouts/:id/resume", authenticate, resumeWalkingWorkout);
router.post("/walking-workouts/:id/finish", authenticate, finishWalkingWorkout);
router.put("/walking-workouts/:id", authenticate, updateWalkingWorkoutProgress);
router.get("/walking-workouts/:id", authenticate, getWalkingWorkout);
router.get("/meal/:id", getMealDetailWithServings);
router.post("/meal-plan", authenticate, addMealToPlan);
router.post("/meal-plan/complete", authenticate, completePersonalMeal);
router.delete("/meal-plan/:id", authenticate, deletePlannedMeal);
router.get("/meal-plan", authenticate, getMealPlan);
router.get("/meal-plan/consumed", authenticate, getDailyConsumedMeals);
router.post("/meal-plan/consumed", authenticate, addConsumedMealEntry);
router.put("/meal-plan/:id/consumption", authenticate, updateMealConsumption);
router.get("/meal-plan/report", authenticate, getConsumptionReport);
router.get("/households/current", authenticate, getCurrentHousehold);
router.post("/households", authenticate, createHousehold);
router.post("/households/join", authenticate, joinHousehold);
router.post(
  "/households/:id/invitations",
  authenticate,
  createHouseholdInvitation,
);
router.delete("/households/current/membership", authenticate, leaveHousehold);
router.delete(
  "/households/:id/members/:memberId",
  authenticate,
  removeHouseholdMember,
);
router.get("/household/meal-plan", authenticate, getHouseholdMealPlan);
router.get("/household/chat/messages", authenticate, getHouseholdChatMessages);
router.get(
  "/household/chat/unread-count",
  authenticate,
  getHouseholdChatUnreadCount,
);
router.put("/household/chat/read", authenticate, markHouseholdChatRead);
router.get("/household/notifications", authenticate, getHouseholdNotifications);
router.get(
  "/household/notifications/unread-count",
  authenticate,
  getHouseholdNotificationUnreadCount,
);
router.put(
  "/household/notifications/read-all",
  authenticate,
  markAllHouseholdNotificationsRead,
);
router.put(
  "/household/notifications/:id/read",
  authenticate,
  markHouseholdNotificationRead,
);
router.get("/household/shopping-list", authenticate, getHouseholdShoppingList);
router.put(
  "/household/shopping-list/:ingredientKey",
  authenticate,
  updateHouseholdShoppingItem,
);
router.post("/household/meal-plan", authenticate, addMealToHouseholdPlan);
router.put(
  "/household/meal-plan/poll/deadline",
  authenticate,
  updateHouseholdMealPollDeadline,
);
router.put("/household/meal-plan/vote", authenticate, voteForHouseholdMeal);
router.post(
  "/household/meal-plan/complete",
  authenticate,
  completeHouseholdMeal,
);
router.put(
  "/household/meal-plan/:id/consumption",
  authenticate,
  updateHouseholdMealConsumption,
);
router.delete(
  "/household/meal-plan/:id",
  authenticate,
  deleteHouseholdPlannedMeal,
);
router.post("/auth/updateHealth", authenticate, updateHealthProfile);

export default router;
