import type { Server as HttpServer } from "node:http";
import jwt from "jsonwebtoken";
import { Server } from "socket.io";
import { PrismaClient } from "../generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { JWT_SECRET } from "../utils.ts/jwt.js";
import {
  isMealReminderAllowed,
  type HouseholdMealPeriod,
} from "./householdMealReminder.js";
import "dotenv/config";

type ChatMessage = {
  id: string;
  householdId: string;
  senderUserId: string | null;
  content: string;
  createdAt: string;
  sender: {
    id: string;
    fullName: string | null;
    avatarUrl: string | null;
  } | null;
};

type ChatAck<T> = (
  response:
    | { success: true; data: T }
    | {
        success: false;
        message: string;
      },
) => void;

type MealReminder = {
  reminderId: string;
  householdId: string;
  mealPeriod: HouseholdMealPeriod;
  title: string;
  body: string;
  startedAt: string;
};

type MealReminderAck = (
  response: { success: true } | { success: false; message: string },
) => void;

type ClientToServerEvents = {
  "chat:join": (
    payload: { householdId: string },
    acknowledge: ChatAck<{ householdId: string }>,
  ) => void;
  "chat:leave": () => void;
  "chat:send": (
    payload: { content: string },
    acknowledge: ChatAck<ChatMessage>,
  ) => void;
  "meal:reminder:subscribe": (
    payload: { householdId: string },
    acknowledge: ChatAck<{ householdId: string }>,
  ) => void;
  "meal:reminder:start": (
    payload: { householdId: string; mealPeriod: HouseholdMealPeriod },
    acknowledge: MealReminderAck,
  ) => void;
  "meal:reminder:acknowledge": (
    payload: { householdId: string; reminderId: string },
    acknowledge: MealReminderAck,
  ) => void;
};

type ServerToClientEvents = {
  "chat:ready": (payload: { householdId: string }) => void;
  "chat:message": (message: ChatMessage) => void;
  "meal:reminder:started": (reminder: MealReminder) => void;
  "meal:reminder:state": (payload: {
    householdId: string;
    activeReminder: MealReminder | null;
  }) => void;
  "meal:reminder:dismissed": (payload: {
    householdId: string;
    reminderId: string;
    acknowledgedBy: string | null;
  }) => void;
};

type SocketData = {
  userId: string;
  householdId: string | undefined;
};

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});
const prisma = new PrismaClient({ adapter });
const MAX_MESSAGE_LENGTH = 2000;
const REMINDER_TIMEOUT_MS = 5 * 60 * 1000;
const activeMealReminders = new Map<string, MealReminder>();
const startingMealReminders = new Set<string>();
const mealReminderTimers = new Map<string, ReturnType<typeof setTimeout>>();

export const attachHouseholdChatSocket = (httpServer: HttpServer) => {
  const io = new Server<
    ClientToServerEvents,
    ServerToClientEvents,
    Record<string, never>,
    SocketData
  >(httpServer, { cors: { origin: "*" } });

  const expireReminder = (reminder: MealReminder) => {
    if (
      activeMealReminders.get(reminder.householdId)?.reminderId !==
      reminder.reminderId
    ) {
      return;
    }
    activeMealReminders.delete(reminder.householdId);
    const timer = mealReminderTimers.get(reminder.householdId);
    if (timer) clearTimeout(timer);
    mealReminderTimers.delete(reminder.householdId);
    void prisma.householdMember
      .findMany({
        where: { householdId: reminder.householdId },
        select: { userId: true },
      })
      .then((members) => {
        const dismissedPayload = {
          householdId: reminder.householdId,
          reminderId: reminder.reminderId,
          acknowledgedBy: null,
        };
        members.forEach(({ userId }) => {
          io.to(`user:${userId}`).emit(
            "meal:reminder:dismissed",
            dismissedPayload,
          );
        });
      })
      .catch((error) => {
        console.error("Failed to expire household meal reminder", error);
      });
  };

  const getActiveReminder = (householdId: string) => {
    const reminder = activeMealReminders.get(householdId);
    if (
      reminder &&
      Date.now() - new Date(reminder.startedAt).getTime() >= REMINDER_TIMEOUT_MS
    ) {
      expireReminder(reminder);
      return undefined;
    }
    return reminder;
  };

  io.use((socket, next) => {
    const token: unknown = socket.handshake.auth.token;
    if (typeof token !== "string") {
      next(new Error("Phiên đăng nhập không hợp lệ"));
      return;
    }
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      if (
        typeof decoded !== "object" ||
        decoded === null ||
        !("sub" in decoded) ||
        typeof decoded.sub !== "string" ||
        !decoded.sub
      ) {
        next(new Error("Token không hợp lệ"));
        return;
      }
      socket.data.userId = decoded.sub;
      next();
    } catch {
      next(new Error("Token không hợp lệ hoặc đã hết hạn"));
    }
  });

  io.on("connection", (socket) => {
    socket.data.householdId = undefined;
    const userRoom = `user:${socket.data.userId}`;
    void socket.join(userRoom);

    socket.on("chat:join", async (payload, acknowledge) => {
      if (typeof acknowledge !== "function") {
        return;
      }
      const householdId =
        typeof payload?.householdId === "string"
          ? payload.householdId.trim()
          : "";
      if (!householdId) {
        acknowledge({
          success: false,
          message: "Mã gia đình không hợp lệ",
        });
        return;
      }
      try {
        const member = await prisma.householdMember.findFirst({
          where: { householdId, userId: socket.data.userId },
          select: { householdId: true },
        });
        if (!member) {
          socket.data.householdId = undefined;
          acknowledge({
            success: false,
            message: "Bạn không còn là thành viên của gia đình này",
          });
          return;
        }
        socket.data.householdId = member.householdId;
        acknowledge({
          success: true,
          data: { householdId: member.householdId },
        });
        socket.emit("chat:ready", { householdId: member.householdId });
      } catch (error) {
        console.error("Failed to authorize household chat socket", error);
        acknowledge({
          success: false,
          message: "Không thể tham gia phòng chat",
        });
      }
    });

    socket.on("chat:leave", () => {
      socket.data.householdId = undefined;
    });

    socket.on("meal:reminder:subscribe", async (payload, acknowledge) => {
      if (typeof acknowledge !== "function") return;
      const householdId =
        typeof payload?.householdId === "string"
          ? payload.householdId.trim()
          : "";
      if (!householdId) {
        acknowledge({ success: false, message: "Mã gia đình không hợp lệ" });
        return;
      }
      try {
        const member = await prisma.householdMember.findFirst({
          where: { householdId, userId: socket.data.userId },
          select: { householdId: true },
        });
        if (!member) {
          acknowledge({
            success: false,
            message: "Bạn không còn là thành viên của gia đình này",
          });
          return;
        }
        acknowledge({ success: true, data: { householdId } });
        const activeReminder = getActiveReminder(householdId);
        socket.emit("meal:reminder:state", {
          householdId,
          activeReminder: activeReminder ?? null,
        });
      } catch (error) {
        console.error("Failed to subscribe to household meal reminders", error);
        acknowledge({
          success: false,
          message: "Không thể kết nối nhắc nhở bữa ăn",
        });
      }
    });

    socket.on("meal:reminder:start", async (payload, acknowledge) => {
      if (typeof acknowledge !== "function") return;
      const householdId =
        typeof payload?.householdId === "string"
          ? payload.householdId.trim()
          : "";
      const mealPeriod = payload?.mealPeriod;
      if (!householdId || (mealPeriod !== "LUNCH" && mealPeriod !== "DINNER")) {
        acknowledge({
          success: false,
          message: "Thông tin bữa ăn không hợp lệ",
        });
        return;
      }
      if (!isMealReminderAllowed(mealPeriod, new Date())) {
        acknowledge({
          success: false,
          message:
            mealPeriod === "LUNCH"
              ? "Chỉ có thể nhắc bữa trưa từ 10:30 đến trước 13:00."
              : "Chỉ có thể nhắc bữa tối từ 16:30 đến trước 20:00.",
        });
        return;
      }
      if (
        getActiveReminder(householdId) ||
        startingMealReminders.has(householdId)
      ) {
        acknowledge({
          success: false,
          message: "Gia đình đang có lời nhắc ăn chưa được xác nhận.",
        });
        return;
      }

      startingMealReminders.add(householdId);
      try {
        const members = await prisma.householdMember.findMany({
          where: { householdId },
          select: { userId: true },
        });
        if (!members.some((member) => member.userId === socket.data.userId)) {
          acknowledge({
            success: false,
            message: "Bạn không còn là thành viên của gia đình này",
          });
          return;
        }

        const reminder: MealReminder = {
          reminderId: `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
          householdId,
          mealPeriod,
          title: "Đã tới giờ ăn",
          body: `Đã tới giờ ăn ${mealPeriod === "LUNCH" ? "trưa" : "tối"}. Mọi người cùng xuống ăn cơm nhé!`,
          startedAt: new Date().toISOString(),
        };
        activeMealReminders.set(householdId, reminder);
        const timer = setTimeout(
          () => expireReminder(reminder),
          REMINDER_TIMEOUT_MS,
        );
        timer.unref();
        mealReminderTimers.set(householdId, timer);
        members.forEach(({ userId }) => {
          io.to(`user:${userId}`).emit("meal:reminder:started", reminder);
        });
        acknowledge({ success: true });
      } catch (error) {
        console.error("Failed to start household meal reminder", error);
        acknowledge({
          success: false,
          message: "Không thể gửi lời nhắc. Vui lòng thử lại.",
        });
      } finally {
        startingMealReminders.delete(householdId);
      }
    });

    socket.on("meal:reminder:acknowledge", async (payload, acknowledge) => {
      if (typeof acknowledge !== "function") return;
      const householdId =
        typeof payload?.householdId === "string"
          ? payload.householdId.trim()
          : "";
      const reminderId =
        typeof payload?.reminderId === "string"
          ? payload.reminderId.trim()
          : "";
      if (!householdId || !reminderId) {
        acknowledge({ success: false, message: "Lời nhắc không hợp lệ" });
        return;
      }
      try {
        const member = await prisma.householdMember.findFirst({
          where: { householdId, userId: socket.data.userId },
          select: { userId: true },
        });
        if (!member) {
          acknowledge({
            success: false,
            message: "Bạn không còn là thành viên của gia đình này",
          });
          return;
        }
        const activeReminder = getActiveReminder(householdId);
        if (!activeReminder || activeReminder.reminderId !== reminderId) {
          acknowledge({
            success: false,
            message: "Lời nhắc này đã được xác nhận hoặc không còn hoạt động",
          });
          return;
        }

        const members = await prisma.householdMember.findMany({
          where: { householdId },
          select: { userId: true },
        });
        if (getActiveReminder(householdId)?.reminderId !== reminderId) {
          acknowledge({
            success: false,
            message: "Lời nhắc này đã được xác nhận hoặc không còn hoạt động",
          });
          return;
        }
        activeMealReminders.delete(householdId);
        const timer = mealReminderTimers.get(householdId);
        if (timer) clearTimeout(timer);
        mealReminderTimers.delete(householdId);
        const dismissedPayload = {
          householdId,
          reminderId,
          acknowledgedBy: socket.data.userId,
        };
        members.forEach(({ userId }) => {
          io.to(`user:${userId}`).emit(
            "meal:reminder:dismissed",
            dismissedPayload,
          );
        });
        acknowledge({ success: true });
      } catch (error) {
        console.error("Failed to acknowledge household meal reminder", error);
        acknowledge({
          success: false,
          message: "Không thể xác nhận lời nhắc. Vui lòng thử lại.",
        });
      }
    });

    socket.on("chat:send", async (payload, acknowledge) => {
      if (typeof acknowledge !== "function") {
        return;
      }
      const householdId = socket.data.householdId;
      const normalizedContent =
        typeof payload?.content === "string" ? payload.content.trim() : "";
      if (!householdId) {
        acknowledge({
          success: false,
          message: "Hãy tham gia phòng chat gia đình trước",
        });
        return;
      }
      if (!normalizedContent || normalizedContent.length > MAX_MESSAGE_LENGTH) {
        acknowledge({
          success: false,
          message: "Tin nhắn không được để trống và tối đa 2000 ký tự",
        });
        return;
      }

      try {
        const member = await prisma.householdMember.findFirst({
          where: { householdId, userId: socket.data.userId },
          select: { householdId: true },
        });
        if (!member) {
          socket.data.householdId = undefined;
          acknowledge({
            success: false,
            message: "Bạn không còn là thành viên của gia đình này",
          });
          return;
        }

        const message = await prisma.householdChatMessage.create({
          data: {
            householdId,
            senderUserId: socket.data.userId,
            content: normalizedContent,
          },
          select: {
            id: true,
            householdId: true,
            senderUserId: true,
            content: true,
            createdAt: true,
            sender: {
              select: { id: true, fullName: true, avatarUrl: true },
            },
          },
        });
        const payload: ChatMessage = {
          ...message,
          createdAt: message.createdAt.toISOString(),
        };
        const currentMembers = await prisma.householdMember.findMany({
          where: { householdId },
          select: { userId: true },
        });
        currentMembers.forEach(({ userId }) => {
          io.to(`user:${userId}`).emit("chat:message", payload);
        });
        acknowledge({ success: true, data: payload });
      } catch (error) {
        console.error("Failed to send household chat message", error);
        acknowledge({
          success: false,
          message: "Không thể gửi tin nhắn. Vui lòng thử lại.",
        });
      }
    });
  });

  return io;
};
