import type { Request, Response } from "express";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "../generated/prisma/client.js";
import "dotenv/config";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});
const prisma = new PrismaClient({ adapter });

const getQueryString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const getAdminUsers = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const page = Number(getQueryString(req.query.page) ?? "1");
  const limit = Number(getQueryString(req.query.limit) ?? "20");
  const search = getQueryString(req.query.search)?.trim() ?? "";
  const status = getQueryString(req.query.status) ?? "all";

  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 50 ||
    !Number.isSafeInteger((page - 1) * limit) ||
    search.length > 100 ||
    !["all", "active", "disabled"].includes(status)
  ) {
    res.status(400).json({
      success: false,
      message: "Tham số tìm kiếm hoặc phân trang không hợp lệ.",
    });
    return;
  }

  const where: Prisma.UserWhereInput = search
    ? {
        OR: [
          { email: { contains: search, mode: "insensitive" } },
          { fullName: { contains: search, mode: "insensitive" } },
        ],
        ...(status !== "all" ? { isActive: status === "active" } : {}),
      }
    : status !== "all"
      ? { isActive: status === "active" }
      : {};

  try {
    const [data, totalItems] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          fullName: true,
          healthProfileCompleted: true,
          isActive: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.user.count({ where }),
    ]);
    const totalPages = Math.ceil(totalItems / limit);
    res.status(200).json({
      success: true,
      data,
      pagination: {
        totalItems,
        currentPage: page,
        pageSize: limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    console.error("GET ADMIN USERS ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Không thể tải danh sách người dùng.",
    });
  }
};

export const setAdminUserActive = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { id } = req.params;
  const isActive = isRecord(req.body) ? req.body.isActive : undefined;

  if (typeof id !== "string" || !id || typeof isActive !== "boolean") {
    res.status(400).json({
      success: false,
      message: "Trạng thái tài khoản không hợp lệ.",
    });
    return;
  }
  if (id === req.user?.id && !isActive) {
    res.status(400).json({
      success: false,
      code: "CANNOT_DISABLE_SELF",
      message: "Bạn không thể tự khóa tài khoản đang đăng nhập.",
    });
    return;
  }

  try {
    const user = await prisma.user.update({
      where: { id },
      data: { isActive },
      select: {
        id: true,
        email: true,
        fullName: true,
        isActive: true,
      },
    });
    res.status(200).json({ success: true, data: user });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      res.status(404).json({
        success: false,
        message: "Không tìm thấy người dùng.",
      });
      return;
    }
    console.error("SET ADMIN USER STATUS ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Không thể cập nhật trạng thái tài khoản.",
    });
  }
};
