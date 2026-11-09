import type { Request, Response } from "express";
import { IncomeCategory, PrismaClient } from "../generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});
const prisma = new PrismaClient({ adapter });

const readDate = (value: unknown): Date | null => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
    ? null
    : date;
};

const readMonth = (value: unknown) => {
  if (typeof value !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
    return null;
  }
  const start = new Date(`${value}-01T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return { start, end };
};

const readIncomeFields = (body: unknown) => {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }
  const value = body as Record<string, unknown>;
  const title = typeof value.title === "string" ? value.title.trim() : "";
  const amountVnd = value.amountVnd;
  const incomeDate = readDate(value.incomeDate);
  const category =
    typeof value.category === "string" &&
    Object.values(IncomeCategory).includes(value.category as IncomeCategory)
      ? (value.category as IncomeCategory)
      : null;
  const note =
    value.note === undefined || value.note === null
      ? null
      : typeof value.note === "string"
      ? value.note.trim()
      : undefined;

  if (
    !title ||
    title.length > 120 ||
    typeof amountVnd !== "number" ||
    !Number.isSafeInteger(amountVnd) ||
    amountVnd < 1 ||
    amountVnd > 2_000_000_000 ||
    !incomeDate ||
    !category ||
    note === undefined ||
    (note !== null && note.length > 500)
  ) {
    return null;
  }
  return { title, amountVnd, incomeDate, category, note };
};

const serializeIncome = (income: {
  id: string;
  title: string;
  amountVnd: number;
  incomeDate: Date;
  category: IncomeCategory;
  note: string | null;
  ownerUserId: string;
  createdAt: Date;
  updatedAt: Date;
}) => ({
  ...income,
  incomeDate: income.incomeDate.toISOString().slice(0, 10),
  createdAt: income.createdAt.toISOString(),
  updatedAt: income.updatedAt.toISOString(),
});

export const getIncomes = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const userId = req.user?.id;
  const month = readMonth(req.query.month);
  if (!userId) {
    res
      .status(401)
      .json({ success: false, message: "Phiên đăng nhập không hợp lệ" });
    return;
  }
  if (!month) {
    res.status(400).json({ success: false, message: "Tháng không hợp lệ." });
    return;
  }
  try {
    const items = await prisma.income.findMany({
      where: {
        ownerUserId: userId,
        incomeDate: { gte: month.start, lt: month.end },
      },
      orderBy: [{ incomeDate: "desc" }, { createdAt: "desc" }],
    });
    const categories = Object.values(IncomeCategory).map((category) => ({
      category,
      totalAmountVnd: items
        .filter((item) => item.category === category)
        .reduce((total, item) => total + item.amountVnd, 0),
    }));
    res.status(200).json({
      success: true,
      data: {
        month: req.query.month,
        items: items.map(serializeIncome),
        totalAmountVnd: items.reduce(
          (total, item) => total + item.amountVnd,
          0,
        ),
        categories,
      },
    });
  } catch (error) {
    console.error("GET INCOMES ERROR:", error);
    res
      .status(500)
      .json({ success: false, message: "Không thể tải khoản thu." });
  }
};

export const createIncome = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const userId = req.user?.id;
  const fields = readIncomeFields(req.body);
  if (!userId) {
    res
      .status(401)
      .json({ success: false, message: "Phiên đăng nhập không hợp lệ" });
    return;
  }
  if (!fields) {
    res
      .status(400)
      .json({ success: false, message: "Thông tin khoản thu không hợp lệ." });
    return;
  }
  try {
    const income = await prisma.income.create({
      data: { ...fields, ownerUserId: userId },
    });
    res.status(201).json({ success: true, data: serializeIncome(income) });
  } catch (error) {
    console.error("CREATE INCOME ERROR:", error);
    res
      .status(500)
      .json({ success: false, message: "Không thể lưu khoản thu." });
  }
};

export const updateIncome = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const userId = req.user?.id;
  const fields = readIncomeFields(req.body);
  const id = req.params.id;
  if (!userId) {
    res
      .status(401)
      .json({ success: false, message: "Phiên đăng nhập không hợp lệ" });
    return;
  }
  if (!fields || typeof id !== "string") {
    res
      .status(400)
      .json({ success: false, message: "Thông tin khoản thu không hợp lệ." });
    return;
  }
  try {
    const existing = await prisma.income.findFirst({
      where: { id, ownerUserId: userId },
      select: { id: true },
    });
    if (!existing) {
      res.status(404).json({ success: false, message: "Không tìm thấy khoản thu." });
      return;
    }
    const income = await prisma.income.update({
      where: { id: existing.id },
      data: fields,
    });
    res.status(200).json({ success: true, data: serializeIncome(income) });
  } catch (error) {
    console.error("UPDATE INCOME ERROR:", error);
    res
      .status(500)
      .json({ success: false, message: "Không thể cập nhật khoản thu." });
  }
};

export const deleteIncome = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const userId = req.user?.id;
  const id = req.params.id;
  if (!userId) {
    res
      .status(401)
      .json({ success: false, message: "Phiên đăng nhập không hợp lệ" });
    return;
  }
  if (typeof id !== "string") {
    res.status(400).json({ success: false, message: "Khoản thu không hợp lệ." });
    return;
  }
  try {
    const result = await prisma.income.deleteMany({
      where: { id, ownerUserId: userId },
    });
    if (!result.count) {
      res.status(404).json({ success: false, message: "Không tìm thấy khoản thu." });
      return;
    }
    res.status(200).json({ success: true });
  } catch (error) {
    console.error("DELETE INCOME ERROR:", error);
    res.status(500).json({ success: false, message: "Không thể xóa khoản thu." });
  }
};
