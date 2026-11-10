import type { Request, Response } from "express";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  ActivityLevel,
  Gender,
  Goal,
  Prisma,
  PrismaClient,
} from "../generated/prisma/client.js";
import { calculateHealthMetrics } from "../services/healthService.js";
import { calculateNutritionSummary } from "../services/mealNutritionService.js";
import "dotenv/config";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});
const prisma = new PrismaClient({ adapter });

type Nutrition = {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

const emptyNutrition = (): Nutrition => ({
  calories: 0,
  proteinG: 0,
  carbsG: 0,
  fatG: 0,
});

const readNutrition = (value: Prisma.JsonValue): Nutrition | null => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const nutrition = value as Prisma.JsonObject;
  const { calories, proteinG, carbsG, fatG } = nutrition;
  if (
    typeof calories !== "number" ||
    typeof proteinG !== "number" ||
    typeof carbsG !== "number" ||
    typeof fatG !== "number"
  ) {
    return null;
  }
  return { calories, proteinG, carbsG, fatG };
};

const readNutritionSnapshot = (value: Prisma.JsonValue): Nutrition | null => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const snapshot = value as Prisma.JsonObject;
  const total = snapshot.total;
  return total && typeof total === "object" && !Array.isArray(total)
    ? readNutrition(total)
    : readNutrition(value);
};

const addNutrition = (total: Nutrition, addition: Nutrition | null) => {
  if (!addition) return;
  total.calories += addition.calories;
  total.proteinG += addition.proteinG;
  total.carbsG += addition.carbsG;
  total.fatG += addition.fatG;
};

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

const getVietnamDayRange = (dateKey: string) => {
  const start = new Date(`${dateKey}T00:00:00.000+07:00`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
};

const isDateKey = (value: unknown): value is string => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
};

const getAdminMembership = async (userId: string) =>
  prisma.householdMember.findFirst({
    where: { userId, role: "ADMIN" },
    select: { householdId: true },
  });

const getAuthorizedMember = async (
  householdId: string,
  userId: string,
  memberId: string,
) =>
  prisma.householdMember.findFirst({
    where: { householdId, userId: memberId },
    select: {
      userId: true,
      role: true,
      user: {
        select: {
          id: true,
          fullName: true,
          email: true,
          healthProfile: true,
        },
      },
    },
  });

const getDailyActivity = async (userIds: string[], date: string) => {
  const { start, end } = getVietnamDayRange(date);
  const [
    manualMeals,
    scannedMeals,
    completions,
    personalMeals,
    householdMeals,
    waterEntries,
    walkingWorkouts,
  ] = await Promise.all([
    prisma.consumedMealEntry.findMany({
      where: { userId: { in: userIds }, consumedAt: { gte: start, lt: end } },
      select: { userId: true, nutritionSummary: true },
    }),
    prisma.scannedConsumedMealEntry.findMany({
      where: { userId: { in: userIds }, dateKey: date },
      select: { userId: true, nutritionSummary: true },
    }),
    prisma.mealCompletion.findMany({
      where: { userId: { in: userIds }, completedAt: { gte: start, lt: end } },
      select: {
        userId: true,
        householdId: true,
        scopeKey: true,
        dateKey: true,
        mealPeriod: true,
        nutritionSummary: true,
      },
    }),
    prisma.plannedMeal.findMany({
      where: {
        userId: { in: userIds },
        isConsumed: true,
        consumedAt: { gte: start, lt: end },
      },
      include: { meal: { include: { ingredients: true } } },
    }),
    prisma.householdPlannedMeal.findMany({
      where: {
        consumedByUserId: { in: userIds },
        isConsumed: true,
        consumedAt: { gte: start, lt: end },
      },
      include: { meal: { include: { ingredients: true } } },
    }),
    prisma.waterIntakeEntry.findMany({
      where: { userId: { in: userIds }, consumedAt: { gte: start, lt: end } },
      select: { userId: true, amountMl: true },
    }),
    prisma.walkingWorkout.findMany({
      where: { userId: { in: userIds }, startedAt: { gte: start, lt: end } },
      select: {
        userId: true,
        steps: true,
        distanceMeters: true,
        durationSeconds: true,
        caloriesBurned: true,
      },
    }),
  ]);
  const activity = new Map(
    userIds.map(userId => [
      userId,
      {
        nutrition: emptyNutrition(),
        waterMl: 0,
        walking: {
          steps: 0,
          distanceMeters: 0,
          durationSeconds: 0,
          caloriesBurned: 0,
        },
      },
    ]),
  );
  const completedPersonalPeriods = new Set(
    completions
      .filter(completion => completion.scopeKey === "PERSONAL")
      .map(completion => `${completion.userId}:${completion.dateKey}:${completion.mealPeriod}`),
  );
  const completedHouseholdPeriods = new Set(
    completions
      .filter(completion => completion.scopeKey !== "PERSONAL")
      .map(
        completion =>
          `${completion.userId}:${completion.householdId}:${completion.dateKey}:${completion.mealPeriod}`,
      ),
  );

  for (const entry of manualMeals) {
    const target = activity.get(entry.userId);
    if (target) {
      addNutrition(target.nutrition, readNutritionSnapshot(entry.nutritionSummary));
    }
  }
  for (const entry of scannedMeals) {
    const target = activity.get(entry.userId);
    if (target) {
      addNutrition(target.nutrition, readNutritionSnapshot(entry.nutritionSummary));
    }
  }
  for (const entry of completions) {
    const target = activity.get(entry.userId);
    if (target) addNutrition(target.nutrition, readNutrition(entry.nutritionSummary));
  }
  for (const entry of personalMeals) {
    if (completedPersonalPeriods.has(`${entry.userId}:${entry.dateKey}:${entry.mealPeriod}`)) {
      continue;
    }
    const target = activity.get(entry.userId);
    if (!target) continue;
    const nutrition = calculateNutritionSummary(entry.meal, entry.servings);
    if (nutrition) addNutrition(target.nutrition, nutrition.total);
  }
  for (const entry of householdMeals) {
    if (
      completedHouseholdPeriods.has(
        `${entry.consumedByUserId}:${entry.householdId}:${entry.dateKey}:${entry.mealPeriod}`,
      )
    ) {
      continue;
    }
    const target = entry.consumedByUserId
      ? activity.get(entry.consumedByUserId)
      : undefined;
    if (!target) continue;
    const nutrition = calculateNutritionSummary(entry.meal, entry.servings);
    if (nutrition) addNutrition(target.nutrition, nutrition.total);
  }
  for (const entry of waterEntries) {
    const target = activity.get(entry.userId);
    if (target) target.waterMl += entry.amountMl;
  }
  for (const entry of walkingWorkouts) {
    const target = activity.get(entry.userId);
    if (!target) continue;
    target.walking.steps += entry.steps;
    target.walking.distanceMeters += entry.distanceMeters;
    target.walking.durationSeconds += entry.durationSeconds;
    target.walking.caloriesBurned += entry.caloriesBurned ?? 0;
  }
  return activity;
};

export const getHouseholdHealthOverview = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ success: false, message: "Vui lòng đăng nhập" });
    return;
  }
  try {
    const membership = await getAdminMembership(userId);
    if (!membership) {
      res.status(403).json({ success: false, message: "Chỉ quản trị viên gia đình mới có thể xem dữ liệu sức khỏe" });
      return;
    }
    const date = isDateKey(req.query.date)
      ? req.query.date
      : getVietnamDateKey(new Date());
    if (req.query.date !== undefined && !isDateKey(req.query.date)) {
      res.status(400).json({ success: false, message: "Ngày không hợp lệ" });
      return;
    }
    const members = await prisma.householdMember.findMany({
      where: { householdId: membership.householdId },
      orderBy: { joinedAt: "asc" },
      select: {
        userId: true,
        role: true,
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
            healthProfile: true,
          },
        },
      },
    });
    const visibleMembers = members.filter(
      member =>
        member.userId === userId ||
        member.user.healthProfile?.allowFamilyHealthManagement === true,
    );
    const dailyActivity = await getDailyActivity(
      visibleMembers.map(member => member.userId),
      date,
    );
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({
      success: true,
      data: {
        date,
        members: members.map(member => {
          const canView =
            member.userId === userId ||
            member.user.healthProfile?.allowFamilyHealthManagement === true;
          const activity = canView
            ? dailyActivity.get(member.userId)
            : undefined;
          return {
            userId: member.userId,
            role: member.role,
            name: member.user.fullName || member.user.email,
            shared: canView,
            canUpdate:
              member.userId !== userId &&
              member.user.healthProfile?.allowFamilyHealthManagement === true,
            profile: canView ? member.user.healthProfile : null,
            daily: activity
              ? {
                  ...activity,
                  nutrition: {
                    calories: Math.round(activity.nutrition.calories),
                    proteinG: Math.round(activity.nutrition.proteinG * 10) / 10,
                    carbsG: Math.round(activity.nutrition.carbsG * 10) / 10,
                    fatG: Math.round(activity.nutrition.fatG * 10) / 10,
                  },
                }
              : null,
          };
        }),
      },
    });
  } catch (error) {
    console.error("Failed to load household health overview", error);
    res.status(500).json({ success: false, message: "Không thể tải theo dõi sức khỏe gia đình" });
  }
};

export const getHouseholdMemberHealth = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const userId = req.user?.id;
  const memberId =
    typeof req.params.memberId === "string" ? req.params.memberId : "";
  if (!userId) {
    res.status(401).json({ success: false, message: "Vui lòng đăng nhập" });
    return;
  }
  if (!memberId) {
    res.status(400).json({ success: false, message: "Thành viên không hợp lệ" });
    return;
  }
  const date = req.query.date === undefined ? getVietnamDateKey(new Date()) : req.query.date;
  if (!isDateKey(date)) {
    res.status(400).json({ success: false, message: "Ngày không hợp lệ" });
    return;
  }
  try {
    const membership = await getAdminMembership(userId);
    if (!membership) {
      res.status(403).json({ success: false, message: "Chỉ quản trị viên gia đình mới có thể xem dữ liệu sức khỏe" });
      return;
    }
    const member = await getAuthorizedMember(
      membership.householdId,
      userId,
      memberId,
    );
    if (!member) {
      res.status(404).json({ success: false, message: "Không tìm thấy thành viên trong gia đình" });
      return;
    }
    if (
      member.userId !== userId &&
      !member.user.healthProfile?.allowFamilyHealthManagement
    ) {
      res.status(403).json({ success: false, message: "Thành viên chưa cho phép chia sẻ hồ sơ sức khỏe" });
      return;
    }
    const [activityMap, history] = await Promise.all([
      getDailyActivity([member.userId], date),
      prisma.healthProfileHistory.findMany({
        where: { userId: member.userId },
        orderBy: [{ measuredAt: "desc" }, { id: "desc" }],
        take: 100,
        select: {
          id: true,
          weightKg: true,
          bmi: true,
          measuredAt: true,
          recordedByUserId: true,
        },
      }),
    ]);
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({
      success: true,
      data: {
        date,
        member: {
          userId: member.userId,
          role: member.role,
          name: member.user.fullName || member.user.email,
          profile: member.user.healthProfile,
          canUpdate:
            member.userId !== userId &&
            member.user.healthProfile?.allowFamilyHealthManagement === true,
        },
        daily: activityMap.get(member.userId),
        weightHistory: history,
      },
    });
  } catch (error) {
    console.error("Failed to load household member health", error);
    res.status(500).json({ success: false, message: "Không thể tải hồ sơ sức khỏe thành viên" });
  }
};

export const updateHouseholdMemberHealth = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const userId = req.user?.id;
  const memberId =
    typeof req.params.memberId === "string" ? req.params.memberId : "";
  if (!userId) {
    res.status(401).json({ success: false, message: "Vui lòng đăng nhập" });
    return;
  }
  if (!memberId || userId === memberId) {
    res.status(400).json({ success: false, message: "Thành viên cần cập nhật không hợp lệ" });
    return;
  }

  const age = Number(req.body?.age);
  const heightCm = Number(req.body?.heightCm);
  const weightKg = Number(req.body?.weightKg);
  const gender = req.body?.gender as Gender;
  const activityLevel = req.body?.activityLevel as ActivityLevel;
  const goal = req.body?.goal as Goal;
  if (
    !Number.isInteger(age) ||
    age < 13 ||
    age > 100 ||
    !Number.isFinite(heightCm) ||
    heightCm < 100 ||
    heightCm > 250 ||
    !Number.isFinite(weightKg) ||
    weightKg < 25 ||
    weightKg > 300 ||
    !Object.values(Gender).includes(gender) ||
    !Object.values(ActivityLevel).includes(activityLevel) ||
    !Object.values(Goal).includes(goal)
  ) {
    res.status(400).json({ success: false, message: "Thông tin sức khỏe không hợp lệ" });
    return;
  }

  try {
    const metrics = calculateHealthMetrics({
      age,
      gender,
      heightCm,
      weightKg,
      activityLevel,
      goal,
    });
    const result = await prisma.$transaction(async tx => {
      const membership = await tx.householdMember.findFirst({
        where: { userId, role: "ADMIN" },
        select: { householdId: true },
      });
      if (!membership) return { status: 403 as const };
      const member = await tx.householdMember.findFirst({
        where: { householdId: membership.householdId, userId: memberId },
        select: {
          userId: true,
          user: {
            select: {
              healthProfile: {
                select: { allowFamilyHealthManagement: true },
              },
            },
          },
        },
      });
      if (!member) return { status: 404 as const };
      if (!member.user.healthProfile?.allowFamilyHealthManagement) {
        return { status: 403 as const };
      }
      const profile = await tx.healthProfile.upsert({
        where: { userId: memberId },
        create: {
          userId: memberId,
          age,
          gender,
          heightCm,
          weightKg,
          activityLevel,
          goal,
          allowFamilyHealthManagement: true,
          ...metrics,
        },
        update: {
          age,
          gender,
          heightCm,
          weightKg,
          activityLevel,
          goal,
          ...metrics,
        },
      });
      await tx.healthProfileHistory.create({
        data: {
          userId: memberId,
          weightKg,
          bmi: metrics.bmi,
          recordedByUserId: userId,
        },
      });
      await tx.user.update({
        where: { id: memberId },
        data: { healthProfileCompleted: true },
      });
      return { status: 200 as const, healthProfile: profile };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if (result.status === 403) {
      res.status(403).json({
        success: false,
        message: "Chỉ quản trị viên được phép cập nhật và thành viên phải cho phép chia sẻ hồ sơ",
      });
      return;
    }
    if (result.status === 404) {
      res.status(404).json({
        success: false,
        message: "Không tìm thấy thành viên trong gia đình",
      });
      return;
    }
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({
      success: true,
      message: "Cập nhật thông tin sức khỏe thành công",
      data: { healthProfile: result.healthProfile },
    });
  } catch (error) {
    console.error("Failed to update household member health", error);
    res.status(500).json({ success: false, message: "Không thể cập nhật thông tin sức khỏe" });
  }
};
