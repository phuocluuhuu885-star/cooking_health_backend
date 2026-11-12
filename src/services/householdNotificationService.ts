import type { Prisma, PrismaClient } from "../generated/prisma/client.js";

type DatabaseClient = PrismaClient | Prisma.TransactionClient;

type HouseholdNotificationInput = {
  householdId: string;
  eventKey: string;
  type: string;
  title: string;
  body: string;
  data: Prisma.InputJsonValue;
  excludeUserId?: string;
};

export const createHouseholdNotifications = async (
  database: DatabaseClient,
  notification: HouseholdNotificationInput,
) => {
  const members = await database.householdMember.findMany({
    where: {
      householdId: notification.householdId,
      ...(notification.excludeUserId
        ? { userId: { not: notification.excludeUserId } }
        : {}),
    },
    select: { userId: true },
  });
  if (members.length === 0) {
    return;
  }
  await database.householdNotification.createMany({
    data: members.map(({ userId }) => ({
      householdId: notification.householdId,
      userId,
      eventKey: notification.eventKey,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      data: notification.data,
      pushSentAt: null,
    })),
    skipDuplicates: true,
  });
};

export const getMealPeriodLabel = (mealPeriod: "LUNCH" | "DINNER") =>
  mealPeriod === "LUNCH" ? "bữa trưa" : "bữa tối";
