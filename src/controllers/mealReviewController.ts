import type { Request, Response } from "express";
import { Prisma, PrismaClient } from "../generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});
const prisma = new PrismaClient({ adapter });
const PAGE_SIZE = 30;

export const getMealReviewSummaries = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const rawMealIds = req.query.mealIds;
  if (typeof rawMealIds !== "string") {
    res.status(400).json({
      success: false,
      message: "Danh sách món ăn không hợp lệ",
    });
    return;
  }

  const mealIds = [...new Set(rawMealIds.split(",").filter(Boolean))];
  if (
    mealIds.length === 0 ||
    mealIds.length > 100 ||
    mealIds.some((id) => id.length > 100)
  ) {
    res.status(400).json({
      success: false,
      message: "Yêu cầu từ 1 đến 100 món ăn",
    });
    return;
  }

  try {
    const aggregates = await prisma.mealReview.groupBy({
      by: ["mealId"],
      where: { mealId: { in: mealIds } },
      _avg: { rating: true },
      _count: { _all: true },
    });
    const aggregateByMealId = new Map(
      aggregates.map((item) => [
        item.mealId,
        {
          averageRating: item._avg.rating ?? 0,
          total: item._count._all,
        },
      ]),
    );
    res.status(200).json({
      success: true,
      data: mealIds.map((mealId) => ({
        mealId,
        averageRating: aggregateByMealId.get(mealId)?.averageRating ?? 0,
        total: aggregateByMealId.get(mealId)?.total ?? 0,
      })),
    });
  } catch (error) {
    console.error("Failed to load meal review summaries", error);
    res.status(500).json({
      success: false,
      message: "Không thể tải tổng quan đánh giá",
    });
  }
};

const parsePositiveInteger = (value: unknown, fallback: number) => {
  if (value === undefined) {
    return fallback;
  }
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    return null;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
};

export const getMealReviews = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const mealId = typeof req.params.id === "string" ? req.params.id : "";
  const offset = parsePositiveInteger(req.query.offset, 0);
  if (!mealId || offset === null || offset > 10000) {
    res.status(400).json({
      success: false,
      message: "Thông tin yêu cầu đánh giá không hợp lệ",
    });
    return;
  }

  try {
    const meal = await prisma.meal.findUnique({
      where: { id: mealId },
      select: { id: true },
    });
    if (!meal) {
      res.status(404).json({
        success: false,
        message: "Không tìm thấy món ăn",
      });
      return;
    }

    const where = { mealId };
    const [reviews, total, aggregate, myReview] = await Promise.all([
      prisma.mealReview.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: offset,
        take: PAGE_SIZE,
        select: {
          id: true,
          rating: true,
          comment: true,
          createdAt: true,
          user: { select: { fullName: true } },
        },
      }),
      prisma.mealReview.count({ where }),
      prisma.mealReview.aggregate({
        where,
        _avg: { rating: true },
      }),
      req.user
        ? prisma.mealReview.findUnique({
            where: { mealId_userId: { mealId, userId: req.user.id } },
            select: { id: true, rating: true, comment: true, createdAt: true },
          })
        : Promise.resolve(null),
    ]);

    res.status(200).json({
      success: true,
      data: {
        reviews: reviews.map((review) => ({
          id: review.id,
          rating: review.rating,
          comment: review.comment,
          createdAt: review.createdAt.toISOString(),
          userName: review.user.fullName || "Thành viên",
        })),
        total,
        averageRating: aggregate._avg.rating ?? 0,
        myReview: myReview
          ? { ...myReview, createdAt: myReview.createdAt.toISOString() }
          : null,
        hasMore: offset + reviews.length < total,
      },
    });
  } catch (error) {
    console.error("Failed to load meal reviews", error);
    res.status(500).json({
      success: false,
      message: "Không thể tải đánh giá món ăn",
    });
  }
};

export const createMealReview = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const mealId = typeof req.params.id === "string" ? req.params.id : "";
  const userId = req.user?.id;
  const { rating, comment } = req.body ?? {};
  if (!mealId || !userId) {
    res.status(401).json({
      success: false,
      message: "Vui lòng đăng nhập để đánh giá món ăn",
    });
    return;
  }
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    res.status(400).json({
      success: false,
      message: "Số sao đánh giá phải là số nguyên từ 1 đến 5",
    });
    return;
  }
  if (
    comment !== undefined &&
    comment !== null &&
    (typeof comment !== "string" || comment.trim().length > 1000)
  ) {
    res.status(400).json({
      success: false,
      message: "Bình luận không được vượt quá 1000 ký tự",
    });
    return;
  }

  try {
    const review = await prisma.mealReview.create({
      data: {
        mealId,
        userId,
        rating,
        comment: typeof comment === "string" ? comment.trim() || null : null,
      },
      select: {
        id: true,
        rating: true,
        comment: true,
        createdAt: true,
      },
    });
    res.status(201).json({
      success: true,
      message: "Đã gửi đánh giá",
      data: { ...review, createdAt: review.createdAt.toISOString() },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      res.status(409).json({
        success: false,
        message: "Bạn đã đánh giá món ăn này và không thể gửi lại",
      });
      return;
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2003"
    ) {
      res.status(404).json({
        success: false,
        message: "Không tìm thấy món ăn",
      });
      return;
    }
    console.error("Failed to create meal review", error);
    res.status(500).json({
      success: false,
      message: "Không thể gửi đánh giá",
    });
  }
};
