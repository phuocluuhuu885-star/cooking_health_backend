import type { Request, Response } from "express";
import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});
const prisma = new PrismaClient({ adapter });
const MAX_TOKEN_LENGTH = 4096;
const PUSH_PLATFORMS = ["ANDROID", "IOS"] as const;

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

export const registerPushDeviceToken = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const userId = getAuthenticatedUserId(req, res);
  if (!userId) {
    return;
  }
  const token =
    typeof req.body?.token === "string" ? req.body.token.trim() : "";
  const platform = req.body?.platform ?? "ANDROID";
  if (
    !token ||
    token.length > MAX_TOKEN_LENGTH ||
    !PUSH_PLATFORMS.includes(platform)
  ) {
    res.status(400).json({
      success: false,
      message: "FCM token hoặc nền tảng không hợp lệ",
    });
    return;
  }

  try {
    await prisma.pushDeviceToken.upsert({
      where: { token },
      update: { userId, platform },
      create: { userId, token, platform },
    });
    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Failed to register push device token", error);
    res.status(500).json({
      success: false,
      message: "Không thể đăng ký thiết bị nhận thông báo",
    });
  }
};

export const unregisterPushDeviceTokens = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const userId = getAuthenticatedUserId(req, res);
  if (!userId) {
    return;
  }
  const token =
    typeof req.body?.token === "string" ? req.body.token.trim() : "";
  const platform = req.body?.platform ?? "ANDROID";
  if (
    !token ||
    token.length > MAX_TOKEN_LENGTH ||
    !PUSH_PLATFORMS.includes(platform)
  ) {
    res.status(400).json({
      success: false,
      message: "FCM token hoặc nền tảng không hợp lệ",
    });
    return;
  }

  try {
    await prisma.pushDeviceToken.deleteMany({
      where: { userId, token, platform },
    });
    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Failed to unregister push device tokens", error);
    res.status(500).json({
      success: false,
      message: "Không thể hủy đăng ký thiết bị nhận thông báo",
    });
  }
};
