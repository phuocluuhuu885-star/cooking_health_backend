import { Prisma, PrismaClient } from "../generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  createHouseholdNotifications,
  getMealPeriodLabel,
} from "./householdNotificationService.js";
import "dotenv/config";

const HOUSEHOLD_TIME_ZONE = "Asia/Ho_Chi_Minh";
const POLL_CHECK_INTERVAL_MS = 30 * 1000;

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});
const schedulerPrisma = new PrismaClient({ adapter });

type DatabaseClient = PrismaClient | Prisma.TransactionClient;

export const getHouseholdDateKey = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: HOUSEHOLD_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts.map(({ type, value }) => [type, value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
};

const getPollCloseTime = (dateKey: string, time: string) =>
  new Date(`${dateKey}T${time}:00+07:00`);

export const ensureHouseholdMealPoll = async (
  database: DatabaseClient,
  householdId: string,
  dateKey: string,
  mealPeriod: "LUNCH" | "DINNER",
) => {
  const household = await database.household.findUniqueOrThrow({
    where: { id: householdId },
    select: { lunchPollCloseTime: true, dinnerPollCloseTime: true },
  });
  const closeTime =
    mealPeriod === "LUNCH"
      ? household.lunchPollCloseTime
      : household.dinnerPollCloseTime;
  const poll = await database.householdMealPoll.upsert({
    where: {
      householdId_dateKey_mealPeriod: { householdId, dateKey, mealPeriod },
    },
    update: {},
    create: {
      householdId,
      dateKey,
      mealPeriod,
      closesAt: getPollCloseTime(dateKey, closeTime),
    },
  });

  if (!poll.closedAt) {
    const existingMeals = await database.householdPlannedMeal.findMany({
      where: { householdId, dateKey, mealPeriod },
      select: { mealId: true, addedByUserId: true, servings: true },
    });
    if (existingMeals.length > 0) {
      await database.householdMealPollOption.createMany({
        data: existingMeals.map((meal) => ({
          pollId: poll.id,
          mealId: meal.mealId,
          proposedByUserId: meal.addedByUserId,
          servings: meal.servings,
        })),
        skipDuplicates: true,
      });
    }
  }

  return poll;
};

export const finalizeHouseholdMealPoll = async (
  database: PrismaClient,
  pollId: string,
  now = new Date(),
  force = false,
) =>
  database.$transaction(
    async (transaction) => {
      const poll = await transaction.householdMealPoll.findUnique({
        where: { id: pollId },
      });
      if (!poll || poll.closedAt || (!force && poll.closesAt > now)) {
        return false;
      }
      const completedPeriod = await transaction.mealCompletion.findFirst({
        where: {
          householdId: poll.householdId,
          dateKey: poll.dateKey,
          mealPeriod: poll.mealPeriod,
        },
        select: { id: true },
      });
      const claim = await transaction.householdMealPoll.updateMany({
        where: {
          id: pollId,
          closedAt: null,
          ...(force ? {} : { closesAt: { lte: now } }),
        },
        data: { closedAt: now },
      });
      if (claim.count !== 1) {
        return false;
      }
      if (completedPeriod) {
        return true;
      }

      const [householdMembers, options] = await Promise.all([
        transaction.householdMember.findMany({
          where: { householdId: poll.householdId },
          select: { userId: true },
        }),
        transaction.householdMealPollOption.findMany({
          where: { pollId },
          include: {
            votes: { select: { userId: true, agrees: true } },
            meal: { select: { name: true } },
          },
        }),
      ]);
      const memberIds = new Set(
        householdMembers.map((member) => member.userId),
      );
      const memberCount = householdMembers.length;
      let acceptedCount = 0;
      let rejectedCount = 0;
      const acceptedMealNames: string[] = [];

      for (const option of options) {
        const activeVotes = option.votes.filter((vote) =>
          memberIds.has(vote.userId),
        );
        const agrees = activeVotes.filter((vote) => vote.agrees).length;
        const disagrees = activeVotes.filter((vote) => !vote.agrees).length;
        const unvoted = memberCount - activeVotes.length;
        await transaction.householdMealPollOption.update({
          where: { id: option.id },
          data: {
            finalAgreeCount: agrees,
            finalDisagreeCount: disagrees,
            finalUnvotedCount: unvoted,
          },
        });
        if (agrees > disagrees + unvoted) {
          acceptedCount += 1;
          acceptedMealNames.push(option.meal.name);
          await transaction.householdPlannedMeal.upsert({
            where: {
              householdId_dateKey_mealPeriod_mealId: {
                householdId: poll.householdId,
                dateKey: poll.dateKey,
                mealPeriod: poll.mealPeriod,
                mealId: option.mealId,
              },
            },
            update: { servings: option.servings },
            create: {
              householdId: poll.householdId,
              addedByUserId: option.proposedByUserId,
              mealId: option.mealId,
              dateKey: poll.dateKey,
              mealPeriod: poll.mealPeriod,
              servings: option.servings,
            },
          });
        } else {
          rejectedCount += 1;
          await transaction.householdPlannedMeal.deleteMany({
            where: {
              householdId: poll.householdId,
              dateKey: poll.dateKey,
              mealPeriod: poll.mealPeriod,
              mealId: option.mealId,
            },
          });
        }
      }

      if (options.length > 0) {
        const formattedDate = poll.dateKey.split("-").reverse().join("/");
        await createHouseholdNotifications(transaction, {
          householdId: poll.householdId,
          eventKey: `${poll.id}:closed`,
          type: "POLL_CLOSED",
          title: `Bình chọn ${getMealPeriodLabel(poll.mealPeriod)} đã kết thúc`,
          body:
            acceptedCount > 0
              ? `Ngày ${formattedDate}: ${acceptedMealNames.slice(0, 3).join(", ")}${acceptedCount > 3 ? ` và ${acceptedCount - 3} món khác` : ""} được chọn; ${rejectedCount} món không được chọn.`
              : `Ngày ${formattedDate}: không có món nào được chọn vào thực đơn.`,
          data: {
            householdId: poll.householdId,
            date: poll.dateKey,
            mealPeriod: poll.mealPeriod,
          },
        });
      }

      return true;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );

const closeDuePolls = async (now: Date) => {
  const duePolls = await schedulerPrisma.householdMealPoll.findMany({
    where: {
      closedAt: null,
      closesAt: { lte: now },
      options: { some: {} },
    },
    select: { id: true },
  });
  for (const poll of duePolls) {
    await finalizeHouseholdMealPoll(schedulerPrisma, poll.id, now);
  }
};

const runHouseholdMealPollScheduler = async () => {
  try {
    const now = new Date();
    const dateKey = getHouseholdDateKey(now);
    const households = await schedulerPrisma.household.findMany({
      select: { id: true },
    });
    for (const household of households) {
      await Promise.all(
        (["LUNCH", "DINNER"] as const).map((mealPeriod) =>
          ensureHouseholdMealPoll(
            schedulerPrisma,
            household.id,
            dateKey,
            mealPeriod,
          ),
        ),
      );
    }
    await closeDuePolls(now);
  } catch (error: unknown) {
    console.error("Failed to update household meal polls", error);
  }
};

export const startHouseholdMealPollScheduler = () => {
  void runHouseholdMealPollScheduler();
  const interval = setInterval(() => {
    void runHouseholdMealPollScheduler();
  }, POLL_CHECK_INTERVAL_MS);
  interval.unref();
};
