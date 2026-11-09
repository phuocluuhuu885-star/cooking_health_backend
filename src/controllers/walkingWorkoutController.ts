import type { Request, Response } from "express";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  Prisma,
  PrismaClient,
  WalkingWorkoutStatus,
} from "../generated/prisma/client.js";
import {
  calculateWalkingEnergy,
  getActiveDurationSeconds,
  isValidClientSessionId,
  isValidWeight,
  WALKING_CALCULATION_METHOD,
  WALKING_SOURCE,
} from "../services/walkingWorkoutService.js";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});
const prisma = new PrismaClient({ adapter });
const MAX_STEPS = 1_000_000;
const MAX_DISTANCE_METERS = 100_000;

const acquireTransactionLock = async (
  tx: Prisma.TransactionClient,
  key: string,
): Promise<void> => {
  await tx.$queryRaw`
    SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text AS "locked"
  `;
};

const lockWorkout = async (
  tx: Prisma.TransactionClient,
  workoutId: string,
): Promise<void> => {
  await acquireTransactionLock(tx, `walking-workout-id:${workoutId}`);
};

const getUserId = (req: Request, res: Response): string | null => {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ success: false, message: "Vui lòng đăng nhập" });
    return null;
  }
  return userId;
};

const replyInvalid = (res: Response, message: string): void => {
  res.status(400).json({ success: false, message });
};

const serializeWorkout = (workout: {
  id: string;
  clientSessionId: string;
  startedAt: Date;
  endedAt: Date | null;
  lastActiveAt: Date;
  pausedAt: Date | null;
  durationSeconds: number;
  pausedDurationSeconds: number;
  steps: number;
  distanceMeters: number;
  caloriesBurned: number | null;
  activeCalories: number | null;
  averageSpeed: number | null;
  weightKgAtWorkout: number | null;
  metValue: number | null;
  calculationMethod: string | null;
  source: string;
  status: WalkingWorkoutStatus;
  createdAt: Date;
  updatedAt: Date;
}) => ({
  ...workout,
  startedAt: workout.startedAt.toISOString(),
  endedAt: workout.endedAt?.toISOString() ?? null,
  lastActiveAt: workout.lastActiveAt.toISOString(),
  pausedAt: workout.pausedAt?.toISOString() ?? null,
  createdAt: workout.createdAt.toISOString(),
  updatedAt: workout.updatedAt.toISOString(),
});

export const startWalkingWorkout = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const userId = getUserId(req, res);
  if (!userId) return;
  const { clientSessionId, weightKg } = req.body ?? {};
  if (!isValidClientSessionId(clientSessionId)) {
    replyInvalid(res, "Mã phiên đi bộ không hợp lệ");
    return;
  }
  if (weightKg !== undefined && !isValidWeight(weightKg)) {
    replyInvalid(res, "Cân nặng phải nằm trong khoảng 25 đến 300 kg");
    return;
  }

  try {
    const result = await prisma.$transaction(async tx => {
      await acquireTransactionLock(tx, `walking-workout:${userId}`);
      const existingRequest = await tx.walkingWorkout.findUnique({
        where: { userId_clientSessionId: { userId, clientSessionId } },
      });
      if (existingRequest) {
        return { workout: existingRequest, created: false };
      }

      const activeWorkout = await tx.walkingWorkout.findFirst({
        where: {
          userId,
          status: {
            in: [WalkingWorkoutStatus.IN_PROGRESS, WalkingWorkoutStatus.PAUSED],
          },
        },
      });
      if (activeWorkout) {
        return { workout: activeWorkout, created: false };
      }

      const profile = await tx.healthProfile.findUnique({
        where: { userId },
        select: { weightKg: true },
      });
      const workout = await tx.walkingWorkout.create({
        data: {
          userId,
          clientSessionId,
          startedAt: new Date(),
          lastActiveAt: new Date(),
          weightKgAtWorkout: weightKg ?? profile?.weightKg ?? null,
          source: WALKING_SOURCE,
        },
      });
      return { workout, created: true };
    });

    res.status(result.created ? 201 : 200).json({
      success: true,
      data: { workout: serializeWorkout(result.workout) },
    });
  } catch (error) {
    console.error("Failed to start walking workout", error);
    res.status(500).json({
      success: false,
      message: "Không thể bắt đầu buổi đi bộ",
    });
  }
};

export const updateWalkingWorkoutProgress = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const userId = getUserId(req, res);
  if (!userId) return;
  const workoutId = typeof req.params.id === "string" ? req.params.id : "";
  const { steps, distanceMeters } = req.body ?? {};
  if (
    !workoutId ||
    !Number.isSafeInteger(steps) ||
    steps < 0 ||
    steps > MAX_STEPS ||
    typeof distanceMeters !== "number" ||
    !Number.isFinite(distanceMeters) ||
    distanceMeters < 0 ||
    distanceMeters > MAX_DISTANCE_METERS
  ) {
    replyInvalid(res, "Số bước hoặc quãng đường không hợp lệ");
    return;
  }

  try {
    const result = await prisma.$transaction(async tx => {
      await lockWorkout(tx, workoutId);
      const workout = await tx.walkingWorkout.findFirst({
        where: { id: workoutId, userId },
      });
      if (!workout) return { status: 404 as const };
      if (workout.status !== WalkingWorkoutStatus.IN_PROGRESS) {
        return { status: 409 as const };
      }

      const now = new Date();
      const maxElapsedSeconds = Math.max(
        0,
        (now.getTime() - workout.lastActiveAt.getTime()) / 1000,
      );
      if (
        steps < workout.steps ||
        distanceMeters < workout.distanceMeters ||
        steps - workout.steps > maxElapsedSeconds * 5 + 120 ||
        distanceMeters - workout.distanceMeters > maxElapsedSeconds * 6 + 30
      ) {
        return { status: 400 as const };
      }

      const durationSeconds = getActiveDurationSeconds({
        startedAt: workout.startedAt,
        now,
        pausedDurationSeconds: workout.pausedDurationSeconds,
        pausedAt: null,
      });
      const energy = calculateWalkingEnergy(
        workout.weightKgAtWorkout,
        durationSeconds,
        distanceMeters,
        steps,
      );
      const updated = await tx.walkingWorkout.update({
        where: { id: workoutId },
        data: {
          steps,
          distanceMeters,
          durationSeconds,
          lastActiveAt: now,
          ...energy,
          calculationMethod: WALKING_CALCULATION_METHOD,
        },
      });
      return { status: 200 as const, workout: updated };
    });
    if (result.status === 404) {
      res.status(404).json({ success: false, message: "Không tìm thấy buổi đi bộ" });
      return;
    }
    if (result.status === 409) {
      res.status(409).json({
        success: false,
        message: "Chỉ có thể cập nhật buổi đi bộ đang diễn ra",
      });
      return;
    }
    if (result.status === 400) {
      replyInvalid(res, "Dữ liệu tiến trình vượt quá giới hạn hợp lý");
      return;
    }
    res.status(200).json({
      success: true,
      data: { workout: serializeWorkout(result.workout) },
    });
  } catch (error) {
    console.error("Failed to update walking workout progress", error);
    res.status(500).json({
      success: false,
      message: "Không thể cập nhật tiến trình đi bộ",
    });
  }
};

export const pauseWalkingWorkout = async (
  req: Request,
  res: Response,
): Promise<void> => {
  await updateWorkoutStatus(req, res, "pause");
};

export const resumeWalkingWorkout = async (
  req: Request,
  res: Response,
): Promise<void> => {
  await updateWorkoutStatus(req, res, "resume");
};

const updateWorkoutStatus = async (
  req: Request,
  res: Response,
  action: "pause" | "resume",
): Promise<void> => {
  const userId = getUserId(req, res);
  if (!userId) return;
  const workoutId = typeof req.params.id === "string" ? req.params.id : "";
  if (!workoutId) {
    replyInvalid(res, "Mã buổi đi bộ không hợp lệ");
    return;
  }

  try {
    const now = new Date();
    const workout = await prisma.$transaction(async tx => {
      await lockWorkout(tx, workoutId);
      const current = await tx.walkingWorkout.findFirst({
        where: { id: workoutId, userId },
      });
      if (!current) return null;

      if (
        action === "pause" &&
        current.status === WalkingWorkoutStatus.PAUSED
      ) {
        return current;
      }
      if (
        action === "resume" &&
        current.status === WalkingWorkoutStatus.IN_PROGRESS
      ) {
        return current;
      }
      if (
        (action === "pause" &&
          current.status !== WalkingWorkoutStatus.IN_PROGRESS) ||
        (action === "resume" &&
          (current.status !== WalkingWorkoutStatus.PAUSED || !current.pausedAt))
      ) {
        throw new Error("INVALID_WORKOUT_TRANSITION");
      }

      if (action === "pause") {
        const stoppedAt =
          now.getTime() - current.lastActiveAt.getTime() > 45_000
            ? current.lastActiveAt
            : now;
        const durationSeconds = getActiveDurationSeconds({
          startedAt: current.startedAt,
          now: stoppedAt,
          pausedDurationSeconds: current.pausedDurationSeconds,
          pausedAt: null,
        });
        const energy = calculateWalkingEnergy(
          current.weightKgAtWorkout,
          durationSeconds,
          current.distanceMeters,
          current.steps,
        );
        return tx.walkingWorkout.update({
          where: { id: workoutId },
          data: {
            status: WalkingWorkoutStatus.PAUSED,
            pausedAt: stoppedAt,
            lastActiveAt: stoppedAt,
            durationSeconds,
            ...energy,
            calculationMethod: WALKING_CALCULATION_METHOD,
          },
        });
      }

      const pausedSeconds = Math.max(
        0,
        Math.floor((now.getTime() - current.pausedAt!.getTime()) / 1000),
      );
      return tx.walkingWorkout.update({
        where: { id: workoutId },
        data: {
          status: WalkingWorkoutStatus.IN_PROGRESS,
          pausedAt: null,
          pausedDurationSeconds: current.pausedDurationSeconds + pausedSeconds,
          lastActiveAt: now,
        },
      });
    });

    if (!workout) {
      res.status(404).json({ success: false, message: "Không tìm thấy buổi đi bộ" });
      return;
    }
    res.status(200).json({
      success: true,
      data: { workout: serializeWorkout(workout) },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_WORKOUT_TRANSITION") {
      res.status(409).json({
        success: false,
        message: "Trạng thái buổi đi bộ không cho phép thao tác này",
      });
      return;
    }
    console.error("Failed to change walking workout status", error);
    res.status(500).json({
      success: false,
      message: "Không thể cập nhật trạng thái buổi đi bộ",
    });
  }
};

export const finishWalkingWorkout = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const userId = getUserId(req, res);
  if (!userId) return;
  const workoutId = typeof req.params.id === "string" ? req.params.id : "";
  if (!workoutId) {
    replyInvalid(res, "Mã buổi đi bộ không hợp lệ");
    return;
  }

  try {
    const now = new Date();
    const workout = await prisma.$transaction(async tx => {
      await lockWorkout(tx, workoutId);
      const current = await tx.walkingWorkout.findFirst({
        where: { id: workoutId, userId },
      });
      if (!current) return null;
      if (current.status === WalkingWorkoutStatus.FINISHED) return current;

      const durationSeconds = getActiveDurationSeconds({
        startedAt: current.startedAt,
        now,
        pausedDurationSeconds: current.pausedDurationSeconds,
        pausedAt:
          current.status === WalkingWorkoutStatus.PAUSED
            ? current.pausedAt
            : null,
      });
      const energy = calculateWalkingEnergy(
        current.weightKgAtWorkout,
        durationSeconds,
        current.distanceMeters,
        current.steps,
      );
      return tx.walkingWorkout.update({
        where: { id: workoutId },
        data: {
          status: WalkingWorkoutStatus.FINISHED,
          endedAt: now,
          pausedAt: null,
          pausedDurationSeconds:
            current.pausedDurationSeconds +
            (current.status === WalkingWorkoutStatus.PAUSED && current.pausedAt
              ? Math.max(
                  0,
                  Math.floor(
                    (now.getTime() - current.pausedAt.getTime()) / 1000,
                  ),
                )
              : 0),
          durationSeconds,
          ...energy,
          calculationMethod: WALKING_CALCULATION_METHOD,
        },
      });
    });

    if (!workout) {
      res.status(404).json({ success: false, message: "Không tìm thấy buổi đi bộ" });
      return;
    }
    res.status(200).json({
      success: true,
      data: { workout: serializeWorkout(workout) },
    });
  } catch (error) {
    console.error("Failed to finish walking workout", error);
    res.status(500).json({
      success: false,
      message: "Không thể kết thúc buổi đi bộ",
    });
  }
};

export const getActiveWalkingWorkout = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const userId = getUserId(req, res);
  if (!userId) return;
  try {
    const workout = await prisma.walkingWorkout.findFirst({
      where: {
        userId,
        status: {
          in: [WalkingWorkoutStatus.IN_PROGRESS, WalkingWorkoutStatus.PAUSED],
        },
      },
      orderBy: { startedAt: "desc" },
    });
    res.status(200).json({
      success: true,
      data: { workout: workout ? serializeWorkout(workout) : null },
    });
  } catch (error) {
    console.error("Failed to load active walking workout", error);
    res.status(500).json({
      success: false,
      message: "Không thể tải buổi đi bộ đang hoạt động",
    });
  }
};

export const getWalkingWorkout = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const userId = getUserId(req, res);
  if (!userId) return;
  const workoutId = typeof req.params.id === "string" ? req.params.id : "";
  if (!workoutId) {
    replyInvalid(res, "Mã buổi đi bộ không hợp lệ");
    return;
  }
  try {
    const workout = await prisma.walkingWorkout.findFirst({
      where: { id: workoutId, userId },
    });
    if (!workout) {
      res.status(404).json({ success: false, message: "Không tìm thấy buổi đi bộ" });
      return;
    }
    res.status(200).json({
      success: true,
      data: { workout: serializeWorkout(workout) },
    });
  } catch (error) {
    console.error("Failed to load walking workout", error);
    res.status(500).json({
      success: false,
      message: "Không thể tải chi tiết buổi đi bộ",
    });
  }
};

export const getWalkingWorkoutHistory = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const userId = getUserId(req, res);
  if (!userId) return;
  const parseInteger = (value: unknown, fallback: number) => {
    if (value === undefined) return fallback;
    if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
  };
  const page = parseInteger(req.query.page, 1);
  const pageSize = parseInteger(req.query.pageSize, 20);
  if (
    page === null ||
    page < 1 ||
    pageSize === null ||
    pageSize < 1 ||
    pageSize > 50
  ) {
    replyInvalid(res, "Phân trang không hợp lệ");
    return;
  }
  const from = req.query.from;
  const to = req.query.to;
  if (
    (from !== undefined && typeof from !== "string") ||
    (to !== undefined && typeof to !== "string")
  ) {
    replyInvalid(res, "Khoảng thời gian không hợp lệ");
    return;
  }
  const fromDate = typeof from === "string" ? new Date(from) : null;
  const toDate = typeof to === "string" ? new Date(to) : null;
  if (
    (fromDate && !Number.isFinite(fromDate.getTime())) ||
    (toDate && !Number.isFinite(toDate.getTime())) ||
    (fromDate && toDate && fromDate >= toDate)
  ) {
    replyInvalid(res, "Khoảng thời gian không hợp lệ");
    return;
  }

  try {
    const where: Prisma.WalkingWorkoutWhereInput = {
      userId,
      ...(fromDate || toDate
        ? {
            startedAt: {
              ...(fromDate ? { gte: fromDate } : {}),
              ...(toDate ? { lt: toDate } : {}),
            },
          }
        : {}),
    };
    const [workouts, total] = await Promise.all([
      prisma.walkingWorkout.findMany({
        where,
        orderBy: [{ startedAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.walkingWorkout.count({ where }),
    ]);
    res.status(200).json({
      success: true,
      data: {
        workouts: workouts.map(serializeWorkout),
        page,
        pageSize,
        total,
        hasMore: page * pageSize < total,
      },
    });
  } catch (error) {
    console.error("Failed to load walking workout history", error);
    res.status(500).json({
      success: false,
      message: "Không thể tải lịch sử đi bộ",
    });
  }
};

export const getWalkingDailySummary = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const userId = getUserId(req, res);
  if (!userId) return;
  const from = req.query.from;
  const to = req.query.to;
  if (typeof from !== "string" || typeof to !== "string") {
    replyInvalid(res, "Cần truyền thời điểm bắt đầu và kết thúc ngày");
    return;
  }
  const fromDate = new Date(from);
  const toDate = new Date(to);
  const rangeMs = toDate.getTime() - fromDate.getTime();
  if (
    !Number.isFinite(rangeMs) ||
    rangeMs <= 0 ||
    rangeMs > 32 * 24 * 60 * 60 * 1000
  ) {
    replyInvalid(res, "Khoảng thời gian tổng kết không hợp lệ");
    return;
  }

  try {
    const totals = await prisma.walkingWorkout.aggregate({
      where: {
        userId,
        status: WalkingWorkoutStatus.FINISHED,
        startedAt: { gte: fromDate, lt: toDate },
      },
      _sum: {
        steps: true,
        distanceMeters: true,
        durationSeconds: true,
        caloriesBurned: true,
        activeCalories: true,
      },
      _count: { _all: true },
    });
    res.status(200).json({
      success: true,
      data: {
        from: fromDate.toISOString(),
        to: toDate.toISOString(),
        workoutCount: totals._count._all,
        steps: totals._sum.steps ?? 0,
        distanceMeters: totals._sum.distanceMeters ?? 0,
        durationSeconds: totals._sum.durationSeconds ?? 0,
        caloriesBurned: totals._sum.caloriesBurned,
        activeCalories: totals._sum.activeCalories,
      },
    });
  } catch (error) {
    console.error("Failed to load walking daily summary", error);
    res.status(500).json({
      success: false,
      message: "Không thể tải tổng kết đi bộ trong ngày",
    });
  }
};
