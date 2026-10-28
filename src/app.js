import express from "express";
import { createServer } from "node:http";
import cors from "cors";
import dotenv from "dotenv";
import authRoutes from "./routes/authRoute.js";
import { startConsumptionHistoryCleanup } from "./services/consumptionHistoryCleanup.js";
import { startHouseholdMealPollScheduler } from "./services/householdMealPollService.js";
import { attachHouseholdChatSocket } from "./services/householdChatSocket.js";
dotenv.config();
const app = express();
const httpServer = createServer(app);
attachHouseholdChatSocket(httpServer);
const PORT = process.env.PORT || 5000;
// Middlewares
app.use(cors());
app.use(express.json());
// Routes
app.use("/api", authRoutes);
// Healthcheck Route
app.get("/health", (req, res) => {
    res
        .status(200)
        .json({ status: "OK", message: "MealCraft Backend Service Running" });
});
httpServer.listen(PORT, () => {
    console.log(`🚀 Server ready at: http://localhost:${PORT}`);
    startConsumptionHistoryCleanup();
    startHouseholdMealPollScheduler();
});
//# sourceMappingURL=app.js.map