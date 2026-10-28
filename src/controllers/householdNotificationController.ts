import type { Request, Response } from "express";
import { PrismaClient } from "../generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});
const prisma = new PrismaClient({ adapter });
const DEFAULT_PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 50;

const getHouseholdId = async (userId: string) => {
  const member = await prisma.householdMember.findUnique({
    where: { userId },
    select: { householdId: true },
  });
  return member?.householdId ?? null;
};

const getAuthenticatedUserId = (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({
      success: false,
      message: "Phiên đăng nhập không hợp lệ",
    });
    return null;
  }
  return userId;
};

export const getHouseholdNotifications = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const userId = getAuthenticatedUserId(req, res);
  if (!userId) {
    return;
  }
  const rawLimit = req.query.limit;
  const limit =
    rawLimit === undefined
      ? DEFAULT_PAGE_SIZE
      : typeof rawLimit === "string"
        ? Number(rawLimit)
        : Number.NaN;
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > MAX_PAGE_SIZE
  ) {
    res.status(400).json({
      success: false,
      message: "Số lượng thông báo yêu cầu không hợp lệ",
    });
    return;
  }
  try {
    const householdId = await getHouseholdId(userId);
    if (!householdId) {
      res.status(404).json({
        success: false,
        message: "Bạn chưa thuộc gia đình nào",
      });
      return;
    }
    const [notifications, unreadCount] = await Promise.all([
      prisma.householdNotification.findMany({
        where: { userId, householdId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit,
        select: {
          id: true,
          type: true,
          title: true,
          body: true,
          data: true,
          createdAt: true,
          readAt: true,
        },
      }),
      prisma.householdNotification.count({
        where: { userId, householdId, readAt: null },
      }),
    ]);
    res.status(200).json({
      success: true,
      data: {
        notifications: notifications.map((notification) => ({
          ...notification,
          createdAt: notification.createdAt.toISOString(),
          readAt: notification.readAt?.toISOString() ?? null,
        })),
        unreadCount,
      },
    });
  } catch (error) {
    console.error("Failed to load household notifications", error);
    res.status(500).json({
      success: false,
      message: "Không thể tải thông báo gia đình",
    });
  }
};

export const getHouseholdNotificationUnreadCount = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const userId = getAuthenticatedUserId(req, res);
  if (!userId) {
    return;
  }
  try {
    const householdId = await getHouseholdId(userId);
    if (!householdId) {
      res.status(404).json({
        success: false,
        message: "Bạn chưa thuộc gia đình nào",
      });
      return;
    }
    const unreadCount = await prisma.householdNotification.count({
      where: { userId, householdId, readAt: null },
    });
    res.status(200).json({ success: true, data: { unreadCount } });
  } catch (error) {
    console.error("Failed to count unread household notifications", error);
    res.status(500).json({
      success: false,
      message: "Không thể tải số thông báo chưa đọc",
    });
  }
};

export const markHouseholdNotificationRead = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const userId = getAuthenticatedUserId(req, res);
  if (!userId) {
    return;
  }
  const notificationId =
    typeof req.params.id === "string" ? req.params.id.trim() : "";
  if (!notificationId) {
    res.status(400).json({
      success: false,
      message: "Mã thông báo không hợp lệ",
    });
    return;
  }
  try {
    const householdId = await getHouseholdId(userId);
    if (!householdId) {
      res.status(404).json({
        success: false,
        message: "Bạn chưa thuộc gia đình nào",
      });
      return;
    }
    const updated = await prisma.householdNotification.updateMany({
      where: { id: notificationId, userId, householdId, readAt: null },
      data: { readAt: new Date() },
    });
    if (updated.count === 0) {
      const existing = await prisma.householdNotification.findFirst({
        where: { id: notificationId, userId, householdId },
        select: { id: true },
      });
      if (!existing) {
        res.status(404).json({
          success: false,
          message: "Không tìm thấy thông báo",
        });
        return;
      }
    }
    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Failed to mark household notification as read", error);
    res.status(500).json({
      success: false,
      message: "Không thể cập nhật trạng thái thông báo",
    });
  }
};

export const markAllHouseholdNotificationsRead = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const userId = getAuthenticatedUserId(req, res);
  if (!userId) {
    return;
  }
  try {
    const householdId = await getHouseholdId(userId);
    if (!householdId) {
      res.status(404).json({
        success: false,
        message: "Bạn chưa thuộc gia đình nào",
      });
      return;
    }
    await prisma.householdNotification.updateMany({
      where: { userId, householdId, readAt: null },
      data: { readAt: new Date() },
    });
    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Failed to mark household notifications as read", error);
    res.status(500).json({
      success: false,
      message: "Không thể cập nhật thông báo",
    });
  }
};
