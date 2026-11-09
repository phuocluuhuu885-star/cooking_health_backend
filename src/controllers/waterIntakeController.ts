import type { Request, Response } from "express";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";
import "dotenv/config";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});
const prisma = new PrismaClient({ adapter });

const getVietnamDateKey = (date: Date) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts.map(({ type, value }) => [type, value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
};

const getVietnamDateRange = (dateKey: string) => {
  const start = new Date(`${dateKey}T00:00:00.000+07:00`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
};

const isDateKey = (dateKey: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return false;
  const parsed = new Date(`${dateKey}T00:00:00.000Z`);
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === dateKey
  );
};

const getDateRange = (dateKey: string) => {
  const { start, end } = getVietnamDateRange(dateKey);
  const weekStart = new Date(start);
  weekStart.setUTCDate(weekStart.getUTCDate() - 6);
  return { start, end, weekStart };
};

export const getWaterIntake = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) {
    res
      .status(401)
      .json({ success: false, message: "Phiên đăng nhập không hợp lệ." });
    return;
  }
  const date =
    typeof req.query.date === "string"
      ? req.query.date
      : getVietnamDateKey(new Date());
  if (!isDateKey(date)) {
    res.status(400).json({ success: false, message: "Ngày không hợp lệ." });
    return;
  }
  const { start, end, weekStart } = getDateRange(date);
  try {
    const entries = await prisma.waterIntakeEntry.findMany({
      where: { userId, consumedAt: { gte: weekStart, lt: end } },
      select: { id: true, amountMl: true, consumedAt: true },
      orderBy: { consumedAt: "desc" },
    });
    const dailyTotals = new Map<string, number>();
    for (const entry of entries) {
      const key = getVietnamDateKey(entry.consumedAt);
      dailyTotals.set(key, (dailyTotals.get(key) ?? 0) + entry.amountMl);
    }
    const todayEntries = entries.filter(
      (entry) => entry.consumedAt >= start && entry.consumedAt < end,
    );
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({
      success: true,
      data: {
        date,
        totalMl: todayEntries.reduce(
          (total, entry) => total + entry.amountMl,
          0,
        ),
        entries: todayEntries,
        dailyTotals: [...dailyTotals.entries()]
          .map(([day, totalMl]) => ({ date: day, totalMl }))
          .sort((first, second) => first.date.localeCompare(second.date)),
      },
    });
  } catch (error) {
    console.error("GET WATER INTAKE ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Không thể tải dữ liệu nước uống.",
    });
  }
};

export const addWaterIntake = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) {
    res
      .status(401)
      .json({ success: false, message: "Phiên đăng nhập không hợp lệ." });
    return;
  }
  const amountMl = req.body?.amountMl;
  if (
    typeof amountMl !== "number" ||
    !Number.isInteger(amountMl) ||
    amountMl < 50 ||
    amountMl > 2000
  ) {
    res.status(400).json({
      success: false,
      message: "Lượng nước mỗi lần ghi nhận phải từ 50 đến 2.000 ml.",
    });
    return;
  }

  try {
    const entry = await prisma.waterIntakeEntry.create({
      data: { userId, amountMl },
      select: { id: true, amountMl: true, consumedAt: true },
    });
    res.setHeader("Cache-Control", "no-store");
    res.status(201).json({
      success: true,
      data: {
        entry,
        date: getVietnamDateKey(entry.consumedAt),
      },
    });
  } catch (error) {
    console.error("ADD WATER INTAKE ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Không thể ghi nhận lượng nước.",
    });
  }
};
