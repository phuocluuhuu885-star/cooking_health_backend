import type { Request, Response } from "express";
import {
  ExpenseCategory,
  ExpenseScope,
  ExpenseSource,
  MealPeriod,
  MealType,
  PrismaClient,
} from "../generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});
const prisma = new PrismaClient({ adapter });

type ExpenseOwner = {
  scope: ExpenseScope;
  ownerUserId: string | null;
  householdId: string | null;
};

const readScope = (value: unknown): ExpenseScope | null =>
  value === ExpenseScope.PERSONAL || value === ExpenseScope.HOUSEHOLD
    ? value
    : null;

const resolveOwner = async (
  userId: string,
  scope: ExpenseScope
): Promise<ExpenseOwner | null> => {
  if (scope === ExpenseScope.PERSONAL) {
    return { scope, ownerUserId: userId, householdId: null };
  }
  const membership = await prisma.householdMember.findUnique({
    where: { userId },
    select: { householdId: true },
  });
  return membership
    ? { scope, ownerUserId: null, householdId: membership.householdId }
    : null;
};

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

const readCategory = (value: unknown): ExpenseCategory | null =>
  typeof value === "string" &&
  Object.values(ExpenseCategory).includes(value as ExpenseCategory)
    ? (value as ExpenseCategory)
    : null;

const readExpenseFields = (body: unknown) => {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }
  const value = body as Record<string, unknown>;
  const title = typeof value.title === "string" ? value.title.trim() : "";
  const amountVnd = value.amountVnd;
  const expenseDate = readDate(value.expenseDate);
  const category = readCategory(value.category);
  const note =
    value.note === undefined || value.note === null
      ? null
      : typeof value.note === "string"
      ? value.note.trim()
      : undefined;
  const mealId =
    value.mealId === undefined || value.mealId === null || value.mealId === ""
      ? null
      : typeof value.mealId === "string"
      ? value.mealId
      : undefined;
  if (
    !title ||
    title.length > 120 ||
    typeof amountVnd !== "number" ||
    !Number.isSafeInteger(amountVnd) ||
    amountVnd < 1 ||
    amountVnd > 2_000_000_000 ||
    !expenseDate ||
    !category ||
    note === undefined ||
    (note !== null && note.length > 500) ||
    mealId === undefined
  ) {
    return null;
  }
  return { title, amountVnd, expenseDate, category, note, mealId };
};

const serializeExpense = (expense: {
  id: string;
  scope: ExpenseScope;
  source: ExpenseSource;
  category: ExpenseCategory;
  title: string;
  amountVnd: number;
  expenseDate: Date;
  note: string | null;
  mealId: string | null;
  mealName: string | null;
  mealPeriod: MealPeriod | null;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}) => ({
  ...expense,
  expenseDate: expense.expenseDate.toISOString().slice(0, 10),
  createdAt: expense.createdAt.toISOString(),
  updatedAt: expense.updatedAt.toISOString(),
});

export const getExpenses = async (
  req: Request,
  res: Response
): Promise<void> => {
  const userId = req.user?.id;
  const scope = readScope(req.query.scope);
  const month = readMonth(req.query.month);
  if (!userId) {
    res
      .status(401)
      .json({ success: false, message: "Phiên đăng nhập không hợp lệ" });
    return;
  }
  if (!scope || !month) {
    res.status(400).json({
      success: false,
      message: "Phạm vi hoặc tháng không hợp lệ.",
    });
    return;
  }
  try {
    const owner = await resolveOwner(userId, scope);
    if (!owner) {
      res
        .status(404)
        .json({ success: false, message: "Bạn chưa thuộc hộ gia đình nào." });
      return;
    }
    const items = await prisma.expense.findMany({
      where: {
        scope,
        ownerUserId: owner.ownerUserId,
        householdId: owner.householdId,
        expenseDate: { gte: month.start, lt: month.end },
      },
      orderBy: [{ expenseDate: "desc" }, { createdAt: "desc" }],
    });
    const categories = Object.values(ExpenseCategory).map((category) => ({
      category,
      totalAmountVnd: items
        .filter((item) => item.category === category)
        .reduce((total, item) => total + item.amountVnd, 0),
    }));
    res.status(200).json({
      success: true,
      data: {
        month: req.query.month,
        items: items.map(serializeExpense),
        totalAmountVnd: items.reduce(
          (total, item) => total + item.amountVnd,
          0
        ),
        categories,
      },
    });
  } catch (error) {
    console.error("GET EXPENSES ERROR:", error);
    res
      .status(500)
      .json({ success: false, message: "Không thể tải khoản chi." });
  }
};

export const createExpense = async (
  req: Request,
  res: Response
): Promise<void> => {
  const userId = req.user?.id;
  const scope = readScope(req.body?.scope);
  const fields = readExpenseFields(req.body);
  if (!userId) {
    res
      .status(401)
      .json({ success: false, message: "Phiên đăng nhập không hợp lệ" });
    return;
  }
  if (!scope || !fields) {
    res
      .status(400)
      .json({ success: false, message: "Thông tin khoản chi không hợp lệ." });
    return;
  }
  try {
    const owner = await resolveOwner(userId, scope);
    if (!owner) {
      res
        .status(404)
        .json({ success: false, message: "Bạn chưa thuộc hộ gia đình nào." });
      return;
    }
    const meal = fields.mealId
      ? await prisma.meal.findUnique({
          where: { id: fields.mealId },
          select: { id: true, name: true, category: true },
        })
      : null;
    if (fields.mealId && !meal) {
      res
        .status(404)
        .json({ success: false, message: "Không tìm thấy món ăn." });
      return;
    }
    const item = await prisma.expense.create({
      data: {
        ...fields,
        scope: owner.scope,
        source: meal ? ExpenseSource.MEAL : ExpenseSource.MANUAL,
        mealId: meal?.id ?? null,
        mealName: meal?.name ?? null,
        mealPeriod:
          meal?.category === MealType.LUNCH ||
          meal?.category === MealType.DINNER
            ? meal.category
            : null,
        ownerUserId: owner.ownerUserId,
        householdId: owner.householdId,
        createdByUserId: userId,
      },
    });
    res.status(201).json({ success: true, data: serializeExpense(item) });
  } catch (error) {
    console.error("CREATE EXPENSE ERROR:", error);
    res
      .status(500)
      .json({ success: false, message: "Không thể lưu khoản chi." });
  }
};

export const updateExpense = async (
  req: Request,
  res: Response
): Promise<void> => {
  const userId = req.user?.id;
  const scope = readScope(req.body?.scope);
  const fields = readExpenseFields(req.body);
  if (!userId) {
    res
      .status(401)
      .json({ success: false, message: "Phiên đăng nhập không hợp lệ" });
    return;
  }
  if (!scope || !fields || typeof req.params.id !== "string") {
    res
      .status(400)
      .json({ success: false, message: "Thông tin khoản chi không hợp lệ." });
    return;
  }
  try {
    const owner = await resolveOwner(userId, scope);
    if (!owner) {
      res
        .status(404)
        .json({ success: false, message: "Bạn chưa thuộc hộ gia đình nào." });
      return;
    }
    const existing = await prisma.expense.findFirst({
      where: {
        id: req.params.id,
        scope,
        ownerUserId: owner.ownerUserId,
        householdId: owner.householdId,
      },
      select: { id: true },
    });
    if (!existing) {
      res
        .status(404)
        .json({ success: false, message: "Không tìm thấy khoản chi." });
      return;
    }
    const meal = fields.mealId
      ? await prisma.meal.findUnique({
          where: { id: fields.mealId },
          select: { id: true, name: true, category: true },
        })
      : null;
    if (fields.mealId && !meal) {
      res
        .status(404)
        .json({ success: false, message: "Không tìm thấy món ăn." });
      return;
    }
    const item = await prisma.expense.update({
      where: { id: existing.id },
      data: {
        ...fields,
        source: meal ? ExpenseSource.MEAL : ExpenseSource.MANUAL,
        mealId: meal?.id ?? null,
        mealName: meal?.name ?? null,
        mealPeriod:
          meal?.category === MealType.LUNCH ||
          meal?.category === MealType.DINNER
            ? meal.category
            : null,
      },
    });
    res.status(200).json({ success: true, data: serializeExpense(item) });
  } catch (error) {
    console.error("UPDATE EXPENSE ERROR:", error);
    res
      .status(500)
      .json({ success: false, message: "Không thể cập nhật khoản chi." });
  }
};

export const deleteExpense = async (
  req: Request,
  res: Response
): Promise<void> => {
  const userId = req.user?.id;
  const scope = readScope(req.query.scope ?? req.body?.scope);
  if (!userId) {
    res
      .status(401)
      .json({ success: false, message: "Phiên đăng nhập không hợp lệ" });
    return;
  }
  if (!scope || typeof req.params.id !== "string") {
    res
      .status(400)
      .json({
        success: false,
        message: "Phạm vi hoặc khoản chi không hợp lệ.",
      });
    return;
  }
  try {
    const owner = await resolveOwner(userId, scope);
    if (!owner) {
      res
        .status(404)
        .json({ success: false, message: "Bạn chưa thuộc hộ gia đình nào." });
      return;
    }
    const existing = await prisma.expense.findFirst({
      where: {
        id: req.params.id,
        scope,
        ownerUserId: owner.ownerUserId,
        householdId: owner.householdId,
      },
      select: { id: true },
    });
    if (!existing) {
      res
        .status(404)
        .json({ success: false, message: "Không tìm thấy khoản chi." });
      return;
    }
    await prisma.expense.delete({ where: { id: existing.id } });
    res.status(200).json({ success: true });
  } catch (error) {
    console.error("DELETE EXPENSE ERROR:", error);
    res
      .status(500)
      .json({ success: false, message: "Không thể xóa khoản chi." });
  }
};

export const getMealBudgets = async (
  req: Request,
  res: Response
): Promise<void> => {
  const userId = req.user?.id;
  const scope = readScope(req.query.scope);
  if (!userId) {
    res
      .status(401)
      .json({ success: false, message: "Phiên đăng nhập không hợp lệ" });
    return;
  }
  if (!scope) {
    res.status(400).json({ success: false, message: "Phạm vi không hợp lệ." });
    return;
  }
  try {
    const owner = await resolveOwner(userId, scope);
    if (!owner) {
      res
        .status(404)
        .json({ success: false, message: "Bạn chưa thuộc hộ gia đình nào." });
      return;
    }
    const items = await prisma.mealBudget.findMany({
      where: { ownerUserId: owner.ownerUserId, householdId: owner.householdId },
      orderBy: { mealPeriod: "asc" },
    });
    res.status(200).json({ success: true, data: items });
  } catch (error) {
    console.error("GET MEAL BUDGETS ERROR:", error);
    res
      .status(500)
      .json({ success: false, message: "Không thể tải ngân sách bữa ăn." });
  }
};

export const upsertMealBudget = async (
  req: Request,
  res: Response
): Promise<void> => {
  const userId = req.user?.id;
  const scope = readScope(req.body?.scope);
  const mealPeriod = req.body?.mealPeriod;
  const limitVnd = req.body?.limitVnd;
  if (!userId) {
    res
      .status(401)
      .json({ success: false, message: "Phiên đăng nhập không hợp lệ" });
    return;
  }
  if (
    !scope ||
    (mealPeriod !== MealPeriod.LUNCH && mealPeriod !== MealPeriod.DINNER) ||
    typeof limitVnd !== "number" ||
    !Number.isSafeInteger(limitVnd) ||
    limitVnd < 1 ||
    limitVnd > 2_000_000_000
  ) {
    res
      .status(400)
      .json({ success: false, message: "Ngân sách bữa ăn không hợp lệ." });
    return;
  }
  try {
    const owner = await resolveOwner(userId, scope);
    if (!owner) {
      res
        .status(404)
        .json({ success: false, message: "Bạn chưa thuộc hộ gia đình nào." });
      return;
    }
    const item = owner.ownerUserId
      ? await prisma.mealBudget.upsert({
          where: {
            ownerUserId_mealPeriod: {
              ownerUserId: owner.ownerUserId,
              mealPeriod,
            },
          },
          create: {
            ownerUserId: owner.ownerUserId,
            mealPeriod,
            limitVnd,
            updatedByUserId: userId,
          },
          update: { limitVnd, updatedByUserId: userId },
        })
      : await prisma.mealBudget.upsert({
          where: {
            householdId_mealPeriod: {
              householdId: owner.householdId!,
              mealPeriod,
            },
          },
          create: {
            householdId: owner.householdId,
            mealPeriod,
            limitVnd,
            updatedByUserId: userId,
          },
          update: { limitVnd, updatedByUserId: userId },
        });
    res.status(200).json({ success: true, data: item });
  } catch (error) {
    console.error("UPSERT MEAL BUDGET ERROR:", error);
    res
      .status(500)
      .json({ success: false, message: "Không thể lưu ngân sách bữa ăn." });
  }
};

export const deleteMealBudget = async (
  req: Request,
  res: Response
): Promise<void> => {
  const userId = req.user?.id;
  const scope = readScope(req.query.scope ?? req.body?.scope);
  const mealPeriod = req.params.mealPeriod;
  if (!userId) {
    res
      .status(401)
      .json({ success: false, message: "Phiên đăng nhập không hợp lệ" });
    return;
  }
  if (
    !scope ||
    (mealPeriod !== MealPeriod.LUNCH && mealPeriod !== MealPeriod.DINNER)
  ) {
    res
      .status(400)
      .json({ success: false, message: "Bữa hoặc phạm vi không hợp lệ." });
    return;
  }
  try {
    const owner = await resolveOwner(userId, scope);
    if (!owner) {
      res
        .status(404)
        .json({ success: false, message: "Bạn chưa thuộc hộ gia đình nào." });
      return;
    }
    await prisma.mealBudget.deleteMany({
      where: {
        mealPeriod,
        ownerUserId: owner.ownerUserId,
        householdId: owner.householdId,
      },
    });
    res.status(200).json({ success: true });
  } catch (error) {
    console.error("DELETE MEAL BUDGET ERROR:", error);
    res
      .status(500)
      .json({ success: false, message: "Không thể xóa ngân sách." });
  }
};
