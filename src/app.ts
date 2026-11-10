import express from "express";
import type { Application, Request, Response } from "express";
import { createServer } from "node:http";
import cors from "cors";
import dotenv from "dotenv";
import authRoutes from "./routes/authRoute.js";
import { startConsumptionHistoryCleanup } from "./services/consumptionHistoryCleanup.js";
import { startHouseholdMealPollScheduler } from "./services/householdMealPollService.js";
import { attachHouseholdChatSocket } from "./services/householdChatSocket.js";
import { avatarUploadDirectory } from "./services/avatarStorage.js";
import { fileURLToPath } from "node:url";

dotenv.config();

const app: Application = express();
const httpServer = createServer(app);
attachHouseholdChatSocket(httpServer);
const PORT = process.env.PORT || 5000;
const adminDashboardDirectory = fileURLToPath(
  new URL("../public/admin", import.meta.url),
);

// Middlewares
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use("/uploads/avatars", express.static(avatarUploadDirectory));
app.use("/admin", express.static(adminDashboardDirectory));

// Routes
app.use("/api", authRoutes);

// Healthcheck Route
app.get("/health", (req: Request, res: Response) => {
  res
    .status(200)
    .json({ status: "OK", message: "MealCraft Backend Service Running" });
});

httpServer.listen(PORT, () => {
  console.log(`🚀 Server ready at: http://localhost:${PORT}`);
  startConsumptionHistoryCleanup();
  startHouseholdMealPollScheduler();
});
