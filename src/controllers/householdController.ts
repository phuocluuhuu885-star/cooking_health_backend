import { randomBytes } from "node:crypto";
import type { Request, Response } from "express";
import {
  HouseholdRole,
  MealPeriod,
  Prisma,
  PrismaClient,
} from "../generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { calculateNutritionSummary } from "../services/mealNutritionService.js";
import { estimateMealPrice } from "../services/mealPriceEstimateService.js";
import { createMealCompletionSnapshot } from "../services/mealCompletionService.js";
import {
  ensureHouseholdMealPoll,
  finalizeHouseholdMealPoll,
  getHouseholdDateKey,
} from "../services/householdMealPollService.js";
import {
  createHouseholdNotifications,
  getMealPeriodLabel,
} from "../services/householdNotificationService.js";
import { getOrCreateCommunityMealPlanCopy } from "../services/communityMealPlanCopy.js";
import "dotenv/config";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({ adapter });

const getDateKey = (value: unknown): string | null => {
  if (value === undefined) {
    return getHouseholdDateKey();
  }
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
    ? value
    : null;
};

const getHouseholdTimeKey = (date: Date) => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts.map(({ type, value }) => [type, value])
  );
  return `${values.hour}:${values.minute}`;
};

const isMealPeriod = (value: unknown): value is MealPeriod =>
  typeof value === "string" &&
  Object.values(MealPeriod).some((period) => period === value);

const getMember = (userId: string, householdId?: string) =>
  prisma.householdMember.findFirst({
    where: { userId, ...(householdId ? { householdId } : {}) },
    include: { household: true },
  });

const householdInclude = {
  members: {
    orderBy: { joinedAt: "asc" as const },
    include: {
      user: { select: { id: true, fullName: true, email: true } },
    },
  },
};

const isUniqueConstraintError = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === "P2002";

const recordHouseholdMealVote = async (
  householdId: string,
  dateKey: string,
  mealPeriod: MealPeriod,
  mealId: string,
  userId: string,
  agrees: boolean
) => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (transaction) => {
          const poll = await transaction.householdMealPoll.findUnique({
            where: {
              householdId_dateKey_mealPeriod: {
                householdId,
                dateKey,
                mealPeriod,
              },
            },
            select: { id: true, closedAt: true, closesAt: true },
          });
          if (!poll) {
            return { error: "POLL_NOT_FOUND" as const };
          }
          const household = await transaction.household.findUnique({
            where: { id: householdId },
            select: { mealVotingEnabled: true },
          });
          if (!household?.mealVotingEnabled) {
            return { error: "POLL_DISABLED" as const };
          }
          if (poll.closedAt || poll.closesAt <= new Date()) {
            return { error: "POLL_CLOSED" as const, pollId: poll.id };
          }
          const [membership, completion, option] = await Promise.all([
            transaction.householdMember.findFirst({
              where: { householdId, userId },
              select: { id: true },
            }),
            transaction.mealCompletion.findFirst({
              where: { householdId, dateKey, mealPeriod },
              select: { id: true },
            }),
            transaction.householdMealPollOption.findFirst({
              where: { pollId: poll.id, mealId },
              select: { id: true },
            }),
          ]);
          if (!membership) {
            return { error: "NOT_MEMBER" as const };
          }
          if (completion) {
            return { error: "PERIOD_COMPLETED" as const, pollId: poll.id };
          }
          if (!option) {
            return { error: "OPTION_NOT_FOUND" as const };
          }
          const vote = await transaction.householdMealVote.upsert({
            where: { optionId_userId: { optionId: option.id, userId } },
            update: { agrees },
            create: { optionId: option.id, userId, agrees },
            select: { agrees: true, updatedAt: true },
          });
          return { vote };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034" &&
        attempt < 2
      ) {
        continue;
      }
      throw error;
    }
  }
  throw new Error("Could not serialize household meal vote");
};

export const getCurrentHousehold = async (
  req: Request,
  res: Response
): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) {
    res
      .status(401)
      .json({ success: false, message: "Phiên đăng nhập không hợp lệ" });
    return;
  }
  try {
    const member = await prisma.householdMember.findUnique({
      where: { userId },
      include: {
        household: { include: householdInclude },
      },
    });
    res.status(200).json({
      success: true,
      data: member
        ? {
            ...member.household,
            currentMemberId: userId,
            currentRole: member.role,
          }
        : null,
    });
  } catch (error) {
    console.error("Failed to load current household", error);
    res.status(500).json({ success: false, message: "Không thể tải gia đình" });
  }
};

export const updateHouseholdMealVoting = async (
  req: Request,
  res: Response
): Promise<void> => {
  const userId = req.user?.id;
  const enabled = req.body?.enabled;
  if (!userId) {
    res.status(401).json({
      success: false,
      message: "Phiên đăng nhập không hợp lệ",
    });
    return;
  }
  if (typeof enabled !== "boolean") {
    res.status(400).json({
      success: false,
      message: "Trạng thái bình chọn không hợp lệ",
    });
    return;
  }

  try {
    const member = await getMember(userId);
    if (!member) {
      res.status(404).json({
        success: false,
        message: "Bạn chưa thuộc gia đình nào",
      });
      return;
    }
    if (member.role !== HouseholdRole.ADMIN) {
      res.status(403).json({
        success: false,
        message: "Chỉ quản trị viên được bật hoặc tắt bình chọn",
      });
      return;
    }

    await prisma.$transaction(async (transaction) => {
      if (!enabled) {
        const openPolls = await transaction.householdMealPoll.findMany({
          where: {
            householdId: member.householdId,
            dateKey: { gte: getHouseholdDateKey() },
            closedAt: null,
          },
          include: {
            options: {
              select: {
                mealId: true,
                proposedByUserId: true,
                servings: true,
              },
            },
          },
        });
        for (const poll of openPolls) {
          for (const option of poll.options) {
            await transaction.householdPlannedMeal.upsert({
              where: {
                householdId_dateKey_mealPeriod_mealId: {
                  householdId: member.householdId,
                  dateKey: poll.dateKey,
                  mealPeriod: poll.mealPeriod,
                  mealId: option.mealId,
                },
              },
              update: { servings: option.servings },
              create: {
                householdId: member.householdId,
                addedByUserId: option.proposedByUserId,
                mealId: option.mealId,
                dateKey: poll.dateKey,
                mealPeriod: poll.mealPeriod,
                servings: option.servings,
              },
            });
          }
        }
      }
      await transaction.household.update({
        where: { id: member.householdId },
        data: { mealVotingEnabled: enabled },
      });
    });

    res.status(200).json({
      success: true,
      data: { mealVotingEnabled: enabled },
    });
  } catch (error) {
    console.error("Failed to update household meal voting setting", error);
    res.status(500).json({
      success: false,
      message: "Không thể cập nhật trạng thái bình chọn",
    });
  }
};

export const createHousehold = async (
  req: Request,
  res: Response
): Promise<void> => {
  const userId = req.user?.id;
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  if (!userId) {
    res
      .status(401)
      .json({ success: false, message: "Phiên đăng nhập không hợp lệ" });
    return;
  }
  if (name.length < 2 || name.length > 60) {
    res
      .status(400)
      .json({ success: false, message: "Tên gia đình cần từ 2 đến 60 ký tự" });
    return;
  }

  try {
    const household = await prisma.household.create({
      data: {
        name,
        members: { create: { userId, role: HouseholdRole.ADMIN } },
      },
      include: householdInclude,
    });
    res.status(201).json({
      success: true,
      data: {
        ...household,
        currentMemberId: userId,
        currentRole: HouseholdRole.ADMIN,
      },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      res
        .status(409)
        .json({ success: false, message: "Bạn đã thuộc một gia đình" });
      return;
    }
    console.error("Failed to create household", error);
    res.status(500).json({ success: false, message: "Không thể tạo gia đình" });
  }
};

export const createHouseholdInvitation = async (
  req: Request,
  res: Response
): Promise<void> => {
  const userId = req.user?.id;
  const householdId = String(req.params.id ?? "");
  if (!userId) {
    res
      .status(401)
      .json({ success: false, message: "Phiên đăng nhập không hợp lệ" });
    return;
  }
  try {
    const member = await getMember(userId, householdId);
    if (!member) {
      res
        .status(404)
        .json({ success: false, message: "Không tìm thấy gia đình" });
      return;
    }
    if (member.role !== HouseholdRole.ADMIN) {
      res.status(403).json({
        success: false,
        message: "Chỉ quản trị viên được mời thành viên",
      });
      return;
    }

    const code = randomBytes(6).toString("hex").toUpperCase();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const invitation = await prisma.householdInvitation.create({
      data: { householdId, createdByUserId: userId, code, expiresAt },
      select: { code: true, expiresAt: true, maxUses: true },
    });
    res.status(201).json({ success: true, data: invitation });
  } catch (error) {
    console.error("Failed to create household invitation", error);
    res.status(500).json({ success: false, message: "Không thể tạo mã mời" });
  }
};

export const joinHousehold = async (
  req: Request,
  res: Response
): Promise<void> => {
  const userId = req.user?.id;
  const code =
    typeof req.body?.code === "string"
      ? req.body.code.trim().toUpperCase()
      : "";
  if (!userId) {
    res
      .status(401)
      .json({ success: false, message: "Phiên đăng nhập không hợp lệ" });
    return;
  }
  if (!/^[A-F0-9]{12}$/.test(code)) {
    res.status(400).json({ success: false, message: "Mã mời không hợp lệ" });
    return;
  }

  try {
    const existingMember = await prisma.householdMember.findUnique({
      where: { userId },
    });
    if (existingMember) {
      res
        .status(409)
        .json({ success: false, message: "Bạn đã thuộc một gia đình" });
      return;
    }
    const invitation = await prisma.householdInvitation.findUnique({
      where: { code },
    });
    if (
      !invitation ||
      invitation.expiresAt <= new Date() ||
      invitation.uses >= invitation.maxUses
    ) {
      res.status(404).json({
        success: false,
        message: "Mã mời không tồn tại hoặc đã hết hạn",
      });
      return;
    }

    const result = await prisma.$transaction(async (transaction) => {
      const currentMembership = await transaction.householdMember.findUnique({
        where: { userId },
      });
      if (currentMembership) {
        return { error: "ALREADY_MEMBER" as const };
      }
      const claimed = await transaction.householdInvitation.updateMany({
        where: {
          id: invitation.id,
          expiresAt: { gt: new Date() },
          uses: { lt: invitation.maxUses },
        },
        data: { uses: { increment: 1 } },
      });
      if (claimed.count !== 1) {
        return { error: "INVITATION_UNAVAILABLE" as const };
      }
      await transaction.householdMember.create({
        data: { householdId: invitation.householdId, userId },
      });
      return {
        household: await transaction.household.findUniqueOrThrow({
          where: { id: invitation.householdId },
          include: householdInclude,
        }),
      };
    });

    if ("error" in result) {
      res.status(result.error === "ALREADY_MEMBER" ? 409 : 404).json({
        success: false,
        message:
          result.error === "ALREADY_MEMBER"
            ? "Bạn đã thuộc một gia đình"
            : "Mã mời không tồn tại hoặc đã hết hạn",
      });
      return;
    }
    res.status(200).json({
      success: true,
      data: {
        ...result.household,
        currentMemberId: userId,
        currentRole: HouseholdRole.MEMBER,
      },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      res
        .status(409)
        .json({ success: false, message: "Bạn đã thuộc một gia đình" });
      return;
    }
    console.error("Failed to join household", error);
    res
      .status(500)
      .json({ success: false, message: "Không thể tham gia gia đình" });
  }
};

export const removeHouseholdMember = async (
  req: Request,
  res: Response
): Promise<void> => {
  const userId = req.user?.id;
  const householdId = String(req.params.id ?? "");
  const memberId = String(req.params.memberId ?? "");
  if (!userId) {
    res
      .status(401)
      .json({ success: false, message: "Phiên đăng nhập không hợp lệ" });
    return;
  }
  try {
    const admin = await getMember(userId, householdId);
    if (!admin) {
      res
        .status(404)
        .json({ success: false, message: "Không tìm thấy gia đình" });
      return;
    }
    if (admin.role !== HouseholdRole.ADMIN) {
      res.status(403).json({
        success: false,
        message: "Chỉ quản trị viên được xóa thành viên",
      });
      return;
    }
    if (memberId === userId) {
      res.status(400).json({
        success: false,
        message: "Quản trị viên cần rời gia đình thay vì tự xóa",
      });
      return;
    }
    const removed = await prisma.householdMember.deleteMany({
      where: { householdId, userId: memberId },
    });
    if (removed.count !== 1) {
      res
        .status(404)
        .json({ success: false, message: "Không tìm thấy thành viên" });
      return;
    }
    res
      .status(200)
      .json({ success: true, message: "Đã xóa thành viên khỏi gia đình" });
  } catch (error) {
    console.error("Failed to remove household member", error);
    res
      .status(500)
      .json({ success: false, message: "Không thể xóa thành viên" });
  }
};

export const leaveHousehold = async (
  req: Request,
  res: Response
): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) {
    res
      .status(401)
      .json({ success: false, message: "Phiên đăng nhập không hợp lệ" });
    return;
  }
  try {
    const result = await prisma.$transaction(async (transaction) => {
      const member = await transaction.householdMember.findUnique({
        where: { userId },
        include: {
          household: { include: { members: { orderBy: { joinedAt: "asc" } } } },
        },
      });
      if (!member) {
        return { error: "NOT_MEMBER" as const };
      }
      if (
        member.role === HouseholdRole.ADMIN &&
        member.household.members.length > 1
      ) {
        const nextAdmin = member.household.members.find(
          (item) => item.userId !== userId
        );
        if (nextAdmin) {
          await transaction.householdMember.update({
            where: { id: nextAdmin.id },
            data: { role: HouseholdRole.ADMIN },
          });
        }
      }
      await transaction.householdMember.delete({ where: { id: member.id } });
      if (
        member.role === HouseholdRole.ADMIN &&
        member.household.members.length === 1
      ) {
        await transaction.household.delete({
          where: { id: member.householdId },
        });
      }
      return { success: true as const };
    });
    if ("error" in result) {
      res
        .status(404)
        .json({ success: false, message: "Bạn chưa thuộc gia đình nào" });
      return;
    }
    res.status(200).json({ success: true, message: "Đã rời gia đình" });
  } catch (error) {
    console.error("Failed to leave household", error);
    res.status(500).json({ success: false, message: "Không thể rời gia đình" });
  }
};

export const getHouseholdMealPlan = async (
  req: Request,
  res: Response
): Promise<void> => {
  const userId = req.user?.id;
  const dateKey = getDateKey(req.query.date);
  if (!userId) {
    res
      .status(401)
      .json({ success: false, message: "Phiên đăng nhập không hợp lệ" });
    return;
  }
  if (!dateKey) {
    res
      .status(400)
      .json({ success: false, message: "Ngày phải đúng định dạng YYYY-MM-DD" });
    return;
  }
  try {
    const member = await getMember(userId);
    if (!member) {
      res
        .status(404)
        .json({ success: false, message: "Bạn chưa thuộc gia đình nào" });
      return;
    }
    const pollPeriods = [MealPeriod.LUNCH, MealPeriod.DINNER] as const;
    const currentDateKey = getHouseholdDateKey();
    const completions = await prisma.mealCompletion.findMany({
      where: { householdId: member.householdId, dateKey },
      select: { userId: true, mealPeriod: true, completedAt: true },
    });
    const completedPeriods = new Set(
      completions.map((completion) => completion.mealPeriod)
    );
    const polls = member.household.mealVotingEnabled
      ? dateKey >= currentDateKey
        ? await Promise.all(
            pollPeriods.map(async (mealPeriod) => {
              const poll = await ensureHouseholdMealPoll(
                prisma,
                member.householdId,
                dateKey,
                mealPeriod
              );
              await finalizeHouseholdMealPoll(
                prisma,
                poll.id,
                new Date(),
                completions.some(
                  (completion) => completion.mealPeriod === mealPeriod
                )
              );
              return completedPeriods.has(mealPeriod) ? null : poll.id;
            })
          ).then((pollIds) =>
            pollIds.filter((pollId): pollId is string => pollId !== null)
          )
        : (
            await prisma.householdMealPoll.findMany({
              where: { householdId: member.householdId, dateKey },
              select: { id: true, mealPeriod: true },
            })
          )
            .filter((poll) => !completedPeriods.has(poll.mealPeriod))
            .map((poll) => poll.id)
      : [];
    if (dateKey < currentDateKey) {
      const historicalPolls = await prisma.householdMealPoll.findMany({
        where: { id: { in: polls }, closedAt: null },
        select: { id: true, mealPeriod: true },
      });
      await Promise.all(
        historicalPolls.map((poll) =>
          finalizeHouseholdMealPoll(
            prisma,
            poll.id,
            new Date(),
            completions.some(
              (completion) => completion.mealPeriod === poll.mealPeriod
            )
          )
        )
      );
    }
    const [plannedMeals, pollDetails, householdMembers] = await Promise.all([
      prisma.householdPlannedMeal.findMany({
        where: { householdId: member.householdId, dateKey },
        include: {
          meal: { include: { ingredients: true } },
          addedBy: { select: { id: true, fullName: true } },
          consumedBy: { select: { id: true, fullName: true } },
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.householdMealPoll.findMany({
        where: { id: { in: polls } },
        include: {
          options: {
            include: {
              meal: {
                select: {
                  id: true,
                  name: true,
                  description: true,
                  imageUrl: true,
                  category: true,
                  communitySourceId: true,
                  servings: true,
                  ingredients: { select: { name: true, amountG: true } },
                },
              },
              proposedBy: { select: { id: true, fullName: true } },
              votes: { select: { userId: true, agrees: true } },
            },
            orderBy: { createdAt: "asc" },
          },
        },
      }),
      prisma.householdMember.findMany({
        where: { householdId: member.householdId },
        select: { userId: true },
      }),
    ]);
    const householdMemberIds = new Set(
      householdMembers.map((householdMember) => householdMember.userId)
    );
    const householdMemberCount = householdMembers.length;
    const ownCompletions = new Map(
      completions
        .filter((completion) => completion.userId === userId)
        .map((completion) => [completion.mealPeriod, completion.completedAt])
    );
    const lockedPeriods = new Set(
      completions.map((completion) => completion.mealPeriod)
    );
    const meals = {
      LUNCH: {
        items: [] as object[],
        nutritionSummary: { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
        estimatedPrice: { minVnd: 0, maxVnd: 0 },
        unavailableNutritionItems: 0,
        isCompleted: ownCompletions.has(MealPeriod.LUNCH),
        completedAt: ownCompletions.get(MealPeriod.LUNCH) ?? null,
        isLocked: lockedPeriods.has(MealPeriod.LUNCH),
        poll: null as object | null,
      },
      DINNER: {
        items: [] as object[],
        nutritionSummary: { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
        estimatedPrice: { minVnd: 0, maxVnd: 0 },
        unavailableNutritionItems: 0,
        isCompleted: ownCompletions.has(MealPeriod.DINNER),
        completedAt: ownCompletions.get(MealPeriod.DINNER) ?? null,
        isLocked: lockedPeriods.has(MealPeriod.DINNER),
        poll: null as object | null,
      },
    };
    const pollByPeriod = new Map(
      pollDetails.map((poll) => [poll.mealPeriod, poll])
    );
    pollPeriods.forEach((mealPeriod) => {
      const poll = pollByPeriod.get(mealPeriod);
      if (!poll) {
        return;
      }
      meals[mealPeriod].poll = {
        closesAt: poll.closesAt,
        closedAt: poll.closedAt,
        options: poll.options.map((option) => {
          const activeVotes = option.votes.filter((vote) =>
            householdMemberIds.has(vote.userId)
          );
          const agrees =
            poll.closedAt && option.finalAgreeCount !== null
              ? option.finalAgreeCount
              : activeVotes.filter((vote) => vote.agrees).length;
          const disagrees =
            poll.closedAt && option.finalDisagreeCount !== null
              ? option.finalDisagreeCount
              : activeVotes.filter((vote) => !vote.agrees).length;
          const unvoted =
            poll.closedAt && option.finalUnvotedCount !== null
              ? option.finalUnvotedCount
              : householdMemberCount - activeVotes.length;
          return {
            id: option.id,
            mealId: option.mealId,
            servings: option.servings,
            createdAt: option.createdAt,
            proposedBy: option.proposedBy,
            meal: {
              id: option.meal.id,
              name: option.meal.name,
              description: option.meal.description,
              imageUrl: option.meal.imageUrl,
              category: option.meal.category,
              communityMealId: option.meal.communitySourceId,
            },
            estimatedPrice: estimateMealPrice(option.meal, option.servings),
            agrees,
            disagrees,
            unvoted,
            myVote:
              activeVotes.find((vote) => vote.userId === userId)?.agrees ??
              null,
            outcome: poll.closedAt
              ? agrees > disagrees + unvoted
                ? "ACCEPTED"
                : "REJECTED"
              : null,
          };
        }),
      };
    });
    plannedMeals.forEach((plannedMeal) => {
      const nutritionSummary = calculateNutritionSummary(
        plannedMeal.meal,
        plannedMeal.servings
      );
      const estimatedPrice = estimateMealPrice(
        plannedMeal.meal,
        plannedMeal.servings
      );
      const period = meals[plannedMeal.mealPeriod];
      period.items.push({
        id: plannedMeal.id,
        servings: plannedMeal.servings,
        addedAt: plannedMeal.createdAt,
        isConsumed: plannedMeal.isConsumed,
        consumedAt: plannedMeal.consumedAt,
        consumedBy: plannedMeal.consumedBy,
        addedBy: plannedMeal.addedBy,
        meal: {
          id: plannedMeal.meal.id,
          name: plannedMeal.meal.name,
          description: plannedMeal.meal.description,
          imageUrl: plannedMeal.meal.imageUrl,
          category: plannedMeal.meal.category,
          communityMealId: plannedMeal.meal.communitySourceId,
        },
        nutritionSummary,
        estimatedPrice,
      });
      period.estimatedPrice.minVnd += estimatedPrice.minVnd;
      period.estimatedPrice.maxVnd += estimatedPrice.maxVnd;
      if (!nutritionSummary) {
        period.unavailableNutritionItems += 1;
      } else {
        period.nutritionSummary.calories += nutritionSummary.total.calories;
        period.nutritionSummary.proteinG += nutritionSummary.total.proteinG;
        period.nutritionSummary.carbsG += nutritionSummary.total.carbsG;
        period.nutritionSummary.fatG += nutritionSummary.total.fatG;
      }
    });
    Object.values(meals).forEach((period) => {
      period.nutritionSummary.calories = Math.round(
        period.nutritionSummary.calories
      );
      period.nutritionSummary.proteinG =
        Math.round(period.nutritionSummary.proteinG * 10) / 10;
      period.nutritionSummary.carbsG =
        Math.round(period.nutritionSummary.carbsG * 10) / 10;
      period.nutritionSummary.fatG =
        Math.round(period.nutritionSummary.fatG * 10) / 10;
    });
    res.status(200).json({
      success: true,
      data: { householdId: member.householdId, date: dateKey, meals },
    });
  } catch (error) {
    console.error("Failed to load household meal plan", error);
    res
      .status(500)
      .json({ success: false, message: "Không thể tải thực đơn gia đình" });
  }
};

export const updateHouseholdMealPollDeadline = async (
  req: Request,
  res: Response
): Promise<void> => {
  const userId = req.user?.id;
  const dateKey = getDateKey(req.body?.date);
  const mealPeriod = req.body?.mealPeriod;
  const closesAtValue = req.body?.closesAt;
  const closesAt =
    typeof closesAtValue === "string" ? new Date(closesAtValue) : null;

  if (!userId) {
    res.status(401).json({
      success: false,
      message: "Phiên đăng nhập không hợp lệ",
    });
    return;
  }
  if (
    !dateKey ||
    !isMealPeriod(mealPeriod) ||
    !closesAt ||
    Number.isNaN(closesAt.getTime()) ||
    closesAt <= new Date() ||
    getHouseholdDateKey(closesAt) < dateKey
  ) {
    res.status(400).json({
      success: false,
      message: "Ngày, bữa ăn hoặc thời hạn bình chọn không hợp lệ",
    });
    return;
  }

  try {
    const member = await getMember(userId);
    if (!member) {
      res.status(404).json({
        success: false,
        message: "Bạn chưa thuộc gia đình nào",
      });
      return;
    }
    if (member.role !== HouseholdRole.ADMIN) {
      res.status(403).json({
        success: false,
        message: "Chỉ quản trị viên được thay đổi giờ đóng bình chọn",
      });
      return;
    }
    if (!member.household.mealVotingEnabled) {
      res.status(409).json({
        success: false,
        message: "Bình chọn món đang được tắt cho gia đình này",
      });
      return;
    }
    if (dateKey < getHouseholdDateKey()) {
      res.status(409).json({
        success: false,
        message: "Không thể thay đổi bình chọn cho ngày đã qua",
      });
      return;
    }

    const poll = await ensureHouseholdMealPoll(
      prisma,
      member.householdId,
      dateKey,
      mealPeriod
    );
    await finalizeHouseholdMealPoll(prisma, poll.id);
    const closeTime = getHouseholdTimeKey(closesAt);
    const result = await prisma.$transaction(async (transaction) => {
      const [currentPoll, completion] = await Promise.all([
        transaction.householdMealPoll.findUnique({
          where: { id: poll.id },
          select: { id: true, closedAt: true, closesAt: true },
        }),
        transaction.mealCompletion.findFirst({
          where: {
            householdId: member.householdId,
            dateKey,
            mealPeriod,
          },
          select: { id: true },
        }),
      ]);
      await transaction.household.update({
        where: { id: member.householdId },
        data:
          mealPeriod === MealPeriod.LUNCH
            ? { lunchPollCloseTime: closeTime }
            : { dinnerPollCloseTime: closeTime },
      });
      const futurePolls = await transaction.householdMealPoll.findMany({
        where: {
          householdId: member.householdId,
          mealPeriod,
          dateKey: { gt: getHouseholdDateKey() },
          closedAt: null,
        },
        select: { id: true, dateKey: true },
      });
      for (const futurePoll of futurePolls) {
        await transaction.householdMealPoll.update({
          where: { id: futurePoll.id },
          data: {
            closesAt: new Date(`${futurePoll.dateKey}T${closeTime}:00+07:00`),
          },
        });
      }
      if (currentPoll && !currentPoll.closedAt && !completion) {
        const updated = await transaction.householdMealPoll.updateMany({
          where: { id: poll.id, closedAt: null },
          data: { closesAt },
        });
        if (updated.count === 1) {
          return { closesAt, closeTime, currentPollUpdated: true };
        }
      }
      return {
        closesAt: currentPoll?.closesAt ?? closesAt,
        closeTime,
        currentPollUpdated: false,
      };
    });

    res.status(200).json({
      success: true,
      data: {
        date: dateKey,
        mealPeriod,
        closesAt: result.closesAt.toISOString(),
        defaultCloseTime: result.closeTime,
        currentPollUpdated: result.currentPollUpdated,
      },
    });
  } catch (error: unknown) {
    console.error("UPDATE HOUSEHOLD MEAL POLL DEADLINE ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Không thể cập nhật thời hạn bình chọn",
    });
  }
};

export const addMealToHouseholdPlan = async (
  req: Request,
  res: Response
): Promise<void> => {
  const userId = req.user?.id;
  const submittedMealId =
    typeof req.body?.mealId === "string" ? req.body.mealId.trim() : "";
  const communityMealId =
    typeof req.body?.communityMealId === "string"
      ? req.body.communityMealId.trim()
      : "";
  let mealId = submittedMealId;
  const mealPeriod = req.body?.mealPeriod;
  const dateKey = getDateKey(req.body?.date);
  const servingsValue = req.body?.servings ?? 1;
  const servings =
    typeof servingsValue === "number" ? servingsValue : Number.NaN;
  if (!userId) {
    res
      .status(401)
      .json({ success: false, message: "Phiên đăng nhập không hợp lệ" });
    return;
  }
  if (Boolean(submittedMealId) === Boolean(communityMealId)) {
    res.status(400).json({ success: false, message: "Mã món ăn không hợp lệ" });
    return;
  }
  if (!isMealPeriod(mealPeriod)) {
    res.status(400).json({
      success: false,
      message: "Bữa ăn chỉ được là LUNCH hoặc DINNER",
    });
    return;
  }
  if (!dateKey || !Number.isFinite(servings) || servings <= 0) {
    res
      .status(400)
      .json({ success: false, message: "Ngày hoặc số khẩu phần không hợp lệ" });
    return;
  }
  try {
    const member = await getMember(userId);
    if (!member) {
      res
        .status(404)
        .json({ success: false, message: "Bạn chưa thuộc gia đình nào" });
      return;
    }
    if (dateKey < getHouseholdDateKey()) {
      res.status(409).json({
        success: false,
        message: "Không thể đề xuất món cho ngày đã qua",
      });
      return;
    }
    if (communityMealId) {
      const communityMealCopyId = await prisma.$transaction((transaction) =>
        getOrCreateCommunityMealPlanCopy(transaction, communityMealId),
      );
      if (!communityMealCopyId) {
        res.status(404).json({
          success: false,
          message: "Không tìm thấy món cộng đồng đã được duyệt",
        });
        return;
      }
      mealId = communityMealCopyId;
    }
    const meal = communityMealId
      ? await prisma.meal.findUnique({
          where: { id: mealId },
          include: { ingredients: true },
        })
      : await prisma.meal.findFirst({
          where: { id: mealId, isPublished: true },
          include: { ingredients: true },
        });
    if (!meal) {
      res
        .status(404)
        .json({ success: false, message: "Không tìm thấy món ăn" });
      return;
    }
    if (!member.household.mealVotingEnabled) {
      const result = await prisma.$transaction(async (transaction) => {
        const completion = await transaction.mealCompletion.findFirst({
          where: { householdId: member.householdId, dateKey, mealPeriod },
          select: { id: true },
        });
        if (completion) {
          return { error: "PERIOD_COMPLETED" as const };
        }
        const plannedMeal = await transaction.householdPlannedMeal.upsert({
          where: {
            householdId_dateKey_mealPeriod_mealId: {
              householdId: member.householdId,
              dateKey,
              mealPeriod,
              mealId,
            },
          },
          update: { servings },
          create: {
            householdId: member.householdId,
            addedByUserId: userId,
            mealId,
            dateKey,
            mealPeriod,
            servings,
          },
          select: { id: true, createdAt: true },
        });
        await createHouseholdNotifications(transaction, {
          householdId: member.householdId,
          excludeUserId: userId,
          eventKey: `${dateKey}:${mealPeriod}:meal-plan-added:${mealId}`,
          type: "MEAL_PLAN_UPDATED",
          title: "Thực đơn gia đình đã được cập nhật",
          body: `${meal.name} đã được thêm trực tiếp vào ${getMealPeriodLabel(
            mealPeriod
          )} ngày ${dateKey.split("-").reverse().join("/")}.`,
          data: { householdId: member.householdId, date: dateKey, mealPeriod },
        });
        return { plannedMeal };
      });
      if ("error" in result) {
        res.status(409).json({
          success: false,
          message: "Bữa ăn đã được xác nhận và không thể thay đổi",
        });
        return;
      }
      res.status(201).json({
        success: true,
        data: {
          id: result.plannedMeal.id,
          date: dateKey,
          mealPeriod,
          servings,
          proposedAt: result.plannedMeal.createdAt,
          addedDirectlyToPlan: true,
          closesAt: null,
          meal: {
            id: meal.id,
            name: meal.name,
            description: meal.description,
            imageUrl: meal.imageUrl,
            category: meal.category,
            communityMealId: meal.communitySourceId,
          },
          nutritionSummary: calculateNutritionSummary(meal, servings),
        },
      });
      return;
    }
    const poll = await ensureHouseholdMealPoll(
      prisma,
      member.householdId,
      dateKey,
      mealPeriod
    );
    await finalizeHouseholdMealPoll(prisma, poll.id);
    let option:
      | {
          option: { id: string; createdAt: Date };
          plannedMeal: null;
          closesAt: Date;
        }
      | {
          option: null;
          plannedMeal: { id: string; createdAt: Date };
          closesAt: Date;
        }
      | { error: "POLL_CLOSED" | "PERIOD_COMPLETED" };
    for (let attempt = 0; ; attempt += 1) {
      try {
        option = await prisma.$transaction(
          async (transaction) => {
            const currentPoll =
              await transaction.householdMealPoll.findUniqueOrThrow({
                where: { id: poll.id },
                select: { id: true, closedAt: true, closesAt: true },
              });
            const completion = await transaction.mealCompletion.findFirst({
              where: {
                householdId: member.householdId,
                dateKey,
                mealPeriod,
              },
              select: { id: true },
            });
            if (completion) {
              return { error: "PERIOD_COMPLETED" as const };
            }
            if (currentPoll.closedAt || currentPoll.closesAt <= new Date()) {
              const plannedMeal = await transaction.householdPlannedMeal.create(
                {
                  data: {
                    householdId: member.householdId,
                    addedByUserId: userId,
                    mealId,
                    dateKey,
                    mealPeriod,
                    servings,
                  },
                  select: { id: true, createdAt: true },
                }
              );
              await createHouseholdNotifications(transaction, {
                householdId: member.householdId,
                excludeUserId: userId,
                eventKey: `${poll.id}:plan-added:${mealId}`,
                type: "MEAL_PLAN_UPDATED",
                title: "Thực đơn gia đình đã được cập nhật",
                body: `${
                  meal.name
                } đã được thêm trực tiếp vào ${getMealPeriodLabel(
                  mealPeriod
                )} ngày ${dateKey.split("-").reverse().join("/")}.`,
                data: {
                  householdId: member.householdId,
                  date: dateKey,
                  mealPeriod,
                },
              });
              return {
                option: null,
                plannedMeal,
                closesAt: currentPoll.closesAt,
              };
            }
            const existingOptionCount =
              await transaction.householdMealPollOption.count({
                where: { pollId: currentPoll.id },
              });
            const createdOption =
              await transaction.householdMealPollOption.create({
                data: {
                  pollId: poll.id,
                  mealId,
                  proposedByUserId: userId,
                  servings,
                },
                select: { id: true, createdAt: true },
              });
            await createHouseholdNotifications(transaction, {
              householdId: member.householdId,
              excludeUserId: userId,
              eventKey: `${poll.id}:meal-added:${mealId}`,
              type: existingOptionCount === 0 ? "POLL_OPENED" : "MEAL_ADDED",
              title:
                existingOptionCount === 0
                  ? "Bình chọn món ăn đã mở"
                  : "Có món mới trong bình chọn",
              body: `${meal.name} được thêm vào ${getMealPeriodLabel(
                mealPeriod
              )} ngày ${dateKey.split("-").reverse().join("/")}.`,
              data: {
                householdId: member.householdId,
                date: dateKey,
                mealPeriod,
              },
            });
            return {
              option: createdOption,
              plannedMeal: null,
              closesAt: currentPoll.closesAt,
            };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
        );
        break;
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2034" &&
          attempt < 2
        ) {
          continue;
        }
        throw error;
      }
    }
    if ("error" in option) {
      if (option.error === "POLL_CLOSED") {
        await finalizeHouseholdMealPoll(prisma, poll.id);
        res.status(409).json({
          success: false,
          message: "Đã hết giờ bình chọn cho bữa ăn này",
        });
      } else {
        await finalizeHouseholdMealPoll(prisma, poll.id, new Date(), true);
        res.status(409).json({
          success: false,
          message: "Bữa ăn đã được xác nhận và không thể thay đổi",
        });
      }
      return;
    }
    res.status(201).json({
      success: true,
      data: {
        id: option.option?.id ?? option.plannedMeal?.id,
        date: dateKey,
        mealPeriod,
        servings,
        proposedAt: option.option?.createdAt ?? option.plannedMeal?.createdAt,
        addedDirectlyToPlan: Boolean(option.plannedMeal),
        closesAt: option.closesAt,
        meal: {
          id: meal.id,
          name: meal.name,
          description: meal.description,
          imageUrl: meal.imageUrl,
          category: meal.category,
        },
        nutritionSummary: calculateNutritionSummary(meal, servings),
      },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      res.status(409).json({
        success: false,
        message: "Món này đã được đề xuất cho bữa ăn",
      });
      return;
    }
    console.error("Failed to propose meal to household poll", error);
    res.status(500).json({
      success: false,
      message: "Không thể đề xuất món cho gia đình",
    });
  }
};

export const voteForHouseholdMeal = async (
  req: Request,
  res: Response
): Promise<void> => {
  const userId = req.user?.id;
  const mealId =
    typeof req.body?.mealId === "string" ? req.body.mealId.trim() : "";
  const dateKey = getDateKey(req.body?.date);
  const mealPeriod = req.body?.mealPeriod;
  const agrees = req.body?.agrees;
  if (!userId) {
    res
      .status(401)
      .json({ success: false, message: "Phiên đăng nhập không hợp lệ" });
    return;
  }
  if (!mealId || !dateKey || !isMealPeriod(mealPeriod)) {
    res.status(400).json({
      success: false,
      message: "Món ăn, ngày hoặc bữa ăn không hợp lệ",
    });
    return;
  }
  if (typeof agrees !== "boolean") {
    res.status(400).json({
      success: false,
      message: "Phiếu bầu phải là đồng ý hoặc không đồng ý",
    });
    return;
  }

  try {
    const member = await getMember(userId);
    if (!member) {
      res
        .status(404)
        .json({ success: false, message: "Bạn chưa thuộc gia đình nào" });
      return;
    }
    if (dateKey < getHouseholdDateKey()) {
      res.status(409).json({
        success: false,
        message: "Bình chọn cho ngày này đã kết thúc",
      });
      return;
    }
    if (!member.household.mealVotingEnabled) {
      res.status(409).json({
        success: false,
        message: "Bình chọn món đang được tắt cho gia đình này",
      });
      return;
    }
    const poll = await ensureHouseholdMealPoll(
      prisma,
      member.householdId,
      dateKey,
      mealPeriod
    );
    await finalizeHouseholdMealPoll(prisma, poll.id);
    const result = await recordHouseholdMealVote(
      member.householdId,
      dateKey,
      mealPeriod,
      mealId,
      userId,
      agrees
    );
    if ("error" in result) {
      if (result.error === "POLL_DISABLED") {
        res.status(409).json({
          success: false,
          message: "Bình chọn món đang được tắt cho gia đình này",
        });
      } else if (result.error === "POLL_CLOSED") {
        await finalizeHouseholdMealPoll(prisma, result.pollId);
        res.status(409).json({
          success: false,
          message: "Bình chọn cho bữa ăn này đã kết thúc",
        });
      } else if (result.error === "PERIOD_COMPLETED") {
        await finalizeHouseholdMealPoll(
          prisma,
          result.pollId,
          new Date(),
          true
        );
        res.status(409).json({
          success: false,
          message: "Bữa ăn đã được xác nhận và không thể thay đổi",
        });
      } else {
        res.status(404).json({
          success: false,
          message:
            result.error === "OPTION_NOT_FOUND"
              ? "Không tìm thấy món được đề xuất cho bữa này"
              : "Bạn chưa thuộc gia đình này",
        });
      }
      return;
    }
    res.status(200).json({ success: true, data: result.vote });
  } catch (error) {
    console.error("Failed to vote for household meal", error);
    res.status(500).json({
      success: false,
      message: "Không thể ghi nhận phiếu bình chọn",
    });
  }
};

export const updateHouseholdMealConsumption = async (
  req: Request,
  res: Response
): Promise<void> => {
  const userId = req.user?.id;
  const isConsumed = req.body?.isConsumed;
  const plannedMealId = String(req.params.id ?? "");
  if (!userId) {
    res
      .status(401)
      .json({ success: false, message: "Phiên đăng nhập không hợp lệ" });
    return;
  }
  if (!plannedMealId || typeof isConsumed !== "boolean") {
    res
      .status(400)
      .json({ success: false, message: "Mã món hoặc trạng thái không hợp lệ" });
    return;
  }
  try {
    const member = await getMember(userId);
    if (!member) {
      res
        .status(404)
        .json({ success: false, message: "Bạn chưa thuộc gia đình nào" });
      return;
    }
    let plannedMeal = await prisma.householdPlannedMeal.findFirst({
      where: { id: plannedMealId, householdId: member.householdId },
      select: { dateKey: true, mealPeriod: true },
    });
    if (!plannedMeal) {
      res.status(404).json({
        success: false,
        message: "Không tìm thấy món trong thực đơn gia đình",
      });
      return;
    }
    if (
      member.household.mealVotingEnabled &&
      plannedMeal.dateKey >= getHouseholdDateKey()
    ) {
      const poll = await ensureHouseholdMealPoll(
        prisma,
        member.householdId,
        plannedMeal.dateKey,
        plannedMeal.mealPeriod
      );
      if (!poll.closedAt && poll.closesAt > new Date()) {
        res.status(409).json({
          success: false,
          message: "Chỉ có thể xác nhận món sau khi bình chọn kết thúc",
        });
        return;
      }
      await finalizeHouseholdMealPoll(prisma, poll.id);
      plannedMeal = await prisma.householdPlannedMeal.findFirst({
        where: { id: plannedMealId, householdId: member.householdId },
        select: { dateKey: true, mealPeriod: true },
      });
      if (!plannedMeal) {
        res.status(404).json({
          success: false,
          message: "Món này đã bị loại khỏi thực đơn sau bình chọn",
        });
        return;
      }
    }
    const completion = await prisma.mealCompletion.findFirst({
      where: {
        householdId: member.householdId,
        dateKey: plannedMeal.dateKey,
        mealPeriod: plannedMeal.mealPeriod,
      },
      select: { id: true },
    });
    if (completion) {
      res.status(409).json({
        success: false,
        message: "Bữa ăn đã được xác nhận và không thể thay đổi",
      });
      return;
    }
    const consumedAt = isConsumed ? new Date() : null;
    const updated = await prisma.householdPlannedMeal.updateMany({
      where: { id: plannedMealId, householdId: member.householdId },
      data: {
        isConsumed,
        consumedAt,
        consumedByUserId: isConsumed ? userId : null,
      },
    });
    if (updated.count !== 1) {
      res.status(404).json({
        success: false,
        message: "Không tìm thấy món trong thực đơn gia đình",
      });
      return;
    }
    res.status(200).json({
      success: true,
      data: { id: plannedMealId, isConsumed, consumedAt },
    });
  } catch (error) {
    console.error("Failed to update household meal consumption", error);
    res.status(500).json({
      success: false,
      message: "Không thể cập nhật trạng thái món ăn",
    });
  }
};

export const completeHouseholdMeal = async (
  req: Request,
  res: Response
): Promise<void> => {
  const userId = req.user?.id;
  const dateKey = getDateKey(req.body?.date);
  const mealPeriod = req.body?.mealPeriod;
  if (!userId) {
    res.status(401).json({
      success: false,
      message: "Phiên đăng nhập không hợp lệ",
    });
    return;
  }
  if (!dateKey || !isMealPeriod(mealPeriod)) {
    res.status(400).json({
      success: false,
      message: "Ngày hoặc bữa ăn không hợp lệ",
    });
    return;
  }
  try {
    const member = await getMember(userId);
    if (!member) {
      res
        .status(404)
        .json({ success: false, message: "Bạn chưa thuộc gia đình nào" });
      return;
    }
    const now = new Date();
    if (member.household.mealVotingEnabled) {
      let poll = await prisma.householdMealPoll.findUnique({
        where: {
          householdId_dateKey_mealPeriod: {
            householdId: member.householdId,
            dateKey,
            mealPeriod,
          },
        },
      });
      if (!poll && dateKey >= getHouseholdDateKey()) {
        poll = await ensureHouseholdMealPoll(
          prisma,
          member.householdId,
          dateKey,
          mealPeriod
        );
      }
      if (poll) {
        if (!poll.closedAt && poll.closesAt > now) {
          res.status(409).json({
            success: false,
            message: "Chỉ có thể hoàn thành bữa sau khi bình chọn kết thúc",
          });
          return;
        }
        await finalizeHouseholdMealPoll(prisma, poll.id, now);
      }
    }
    const plannedMeals = await prisma.householdPlannedMeal.findMany({
      where: {
        householdId: member.householdId,
        dateKey,
        mealPeriod,
      },
      include: { meal: { include: { ingredients: true } } },
      orderBy: { createdAt: "asc" },
    });
    if (plannedMeals.length === 0) {
      res.status(400).json({
        success: false,
        message: "Bữa ăn chưa có món nào để hoàn thành",
      });
      return;
    }
    const scopeKey = member.householdId;
    const snapshot = createMealCompletionSnapshot(plannedMeals);
    const completion = await prisma.mealCompletion.create({
      data: {
        userId,
        householdId: member.householdId,
        scopeKey,
        dateKey,
        mealPeriod,
        items: snapshot.items as Prisma.InputJsonValue,
        nutritionSummary: snapshot.nutritionSummary as Prisma.InputJsonValue,
        consumedItems: snapshot.consumedItems,
        unavailableNutritionItems: snapshot.unavailableNutritionItems,
      },
    });
    res.status(201).json({
      success: true,
      data: {
        date: dateKey,
        mealPeriod,
        completedAt: completion.completedAt,
        ...snapshot,
      },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      res.status(409).json({
        success: false,
        message: "Bạn đã xác nhận hoàn thành bữa ăn này",
      });
      return;
    }
    console.error("Failed to complete household meal", error);
    res
      .status(500)
      .json({ success: false, message: "Không thể hoàn thành bữa ăn" });
  }
};

export const deleteHouseholdPlannedMeal = async (
  req: Request,
  res: Response
): Promise<void> => {
  const userId = req.user?.id;
  const plannedMealId = String(req.params.id ?? "");
  if (!userId) {
    res
      .status(401)
      .json({ success: false, message: "Phiên đăng nhập không hợp lệ" });
    return;
  }
  try {
    const member = await getMember(userId);
    if (!member) {
      res
        .status(404)
        .json({ success: false, message: "Bạn chưa thuộc gia đình nào" });
      return;
    }
    const plannedMeal = await prisma.householdPlannedMeal.findFirst({
      where: { id: plannedMealId, householdId: member.householdId },
      select: { dateKey: true, mealPeriod: true, mealId: true },
    });
    if (!plannedMeal) {
      res.status(404).json({
        success: false,
        message: "Không tìm thấy món trong thực đơn gia đình",
      });
      return;
    }
    if (plannedMeal.dateKey < getHouseholdDateKey()) {
      res.status(409).json({
        success: false,
        message: "Bình chọn cho ngày này đã kết thúc",
      });
      return;
    }
    if (!member.household.mealVotingEnabled) {
      const completion = await prisma.mealCompletion.findFirst({
        where: {
          householdId: member.householdId,
          dateKey: plannedMeal.dateKey,
          mealPeriod: plannedMeal.mealPeriod,
        },
        select: { id: true },
      });
      if (completion) {
        res.status(409).json({
          success: false,
          message: "Bữa ăn đã được xác nhận và không thể thay đổi",
        });
        return;
      }
      const deleted = await prisma.householdPlannedMeal.deleteMany({
        where: { id: plannedMealId, householdId: member.householdId },
      });
      if (deleted.count !== 1) {
        res.status(404).json({
          success: false,
          message: "Không tìm thấy món trong thực đơn gia đình",
        });
        return;
      }
      res.status(200).json({
        success: true,
        message: "Đã xóa món khỏi thực đơn gia đình",
      });
      return;
    }
    const poll = await ensureHouseholdMealPoll(
      prisma,
      member.householdId,
      plannedMeal.dateKey,
      plannedMeal.mealPeriod
    );
    await finalizeHouseholdMealPoll(prisma, poll.id);
    const result = await recordHouseholdMealVote(
      member.householdId,
      plannedMeal.dateKey,
      plannedMeal.mealPeriod,
      plannedMeal.mealId,
      userId,
      false
    );
    if ("error" in result) {
      if (result.error === "POLL_CLOSED") {
        await finalizeHouseholdMealPoll(prisma, result.pollId);
        res.status(409).json({
          success: false,
          message: "Bình chọn cho bữa ăn này đã kết thúc",
        });
      } else {
        res.status(409).json({
          success: false,
          message:
            result.error === "PERIOD_COMPLETED"
              ? "Bữa ăn đã được xác nhận và không thể thay đổi"
              : "Không tìm thấy món trong danh sách bình chọn",
        });
      }
      return;
    }
    res.status(200).json({
      success: true,
      message: "Đã ghi nhận phiếu không đồng ý",
    });
  } catch (error) {
    console.error("Failed to vote against household planned meal", error);
    res.status(500).json({
      success: false,
      message: "Không thể ghi nhận phiếu không đồng ý",
    });
  }
};
