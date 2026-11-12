import "dotenv/config";
import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
} from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { Prisma, PrismaClient } from "../generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

const PUSH_CHECK_INTERVAL_MS = 15 * 1000;
const MAX_PUSH_ATTEMPTS = 5;
const BATCH_SIZE = 30;
const RETRY_DELAYS_MS = [
  15_000,
  60_000,
  5 * 60_000,
  30 * 60_000,
  2 * 60 * 60_000,
];

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});
const prisma = new PrismaClient({ adapter });

const createFirebaseApp = () => {
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (serviceAccount) {
    let credentials: Record<string, unknown>;
    try {
      credentials = JSON.parse(serviceAccount) as Record<string, unknown>;
    } catch (error) {
      throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON", {
        cause: error,
      });
    }
    return initializeApp({ credential: cert(credentials) });
  }
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return initializeApp({ credential: applicationDefault() });
  }
  return null;
};

const firebaseApp = getApps()[0] ?? createFirebaseApp();

const toFcmData = (value: Prisma.JsonValue): Record<string, string> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      typeof item === "string" ? item : JSON.stringify(item),
    ]),
  );
};

const getRetryTime = (attemptCount: number) => {
  const delay =
    RETRY_DELAYS_MS[Math.min(attemptCount - 1, RETRY_DELAYS_MS.length - 1)] ??
    2 * 60 * 60_000;
  return new Date(Date.now() + delay);
};

const sendPendingPushNotifications = async () => {
  if (!firebaseApp) {
    return;
  }
  const now = new Date();
  const pending = await prisma.householdNotification.findMany({
    where: {
      pushSentAt: null,
      pushFailedAt: null,
      pushAttemptCount: { lt: MAX_PUSH_ATTEMPTS },
      pushNextAttemptAt: { lte: now },
    },
    orderBy: [{ pushNextAttemptAt: "asc" }, { createdAt: "asc" }],
    take: BATCH_SIZE,
    select: {
      id: true,
      userId: true,
      title: true,
      body: true,
      data: true,
      pushAttemptCount: true,
    },
  });

  for (const notification of pending) {
    const attemptCount = notification.pushAttemptCount + 1;
    const claim = await prisma.householdNotification.updateMany({
      where: {
        id: notification.id,
        pushSentAt: null,
        pushFailedAt: null,
        pushAttemptCount: notification.pushAttemptCount,
        pushNextAttemptAt: { lte: now },
      },
      data: {
        pushAttemptCount: attemptCount,
        pushNextAttemptAt: getRetryTime(attemptCount),
      },
    });
    if (claim.count !== 1) {
      continue;
    }

    try {
      const deviceTokens = await prisma.pushDeviceToken.findMany({
        where: { userId: notification.userId },
        select: { id: true, token: true, platform: true },
      });
      if (deviceTokens.length === 0) {
        await prisma.householdNotification.update({
          where: { id: notification.id },
          data: { pushSentAt: new Date() },
        });
        continue;
      }

      const invalidTokenIds: string[] = [];
      const failures: string[] = [];
      for (const platform of ["ANDROID", "IOS"] as const) {
        const platformTokens = deviceTokens.filter(
          (deviceToken) => deviceToken.platform === platform,
        );
        if (platformTokens.length === 0) {
          continue;
        }
        const response = await getMessaging(firebaseApp).sendEachForMulticast({
          tokens: platformTokens.map(({ token }) => token),
          notification: {
            title: notification.title,
            body: notification.body,
          },
          data: {
            ...toFcmData(notification.data),
            notificationId: notification.id,
          },
          ...(platform === "ANDROID"
            ? {
                android: {
                  priority: "high" as const,
                  notification: { channelId: "mealcraft_general" },
                },
              }
            : {
                apns: {
                  payload: {
                    aps: {
                      sound: "default",
                    },
                  },
                },
              }),
        });
        response.responses.forEach((result, index) => {
          if (result.success) {
            return;
          }
          const deviceToken = platformTokens[index];
          if (!deviceToken) {
            failures.push("messaging/unknown-token-response");
            return;
          }
          const code = result.error?.code ?? "unknown";
          if (
            code === "messaging/invalid-registration-token" ||
            code === "messaging/registration-token-not-registered"
          ) {
            invalidTokenIds.push(deviceToken.id);
          } else {
            failures.push(code);
          }
        });
      }
      if (invalidTokenIds.length > 0) {
        await prisma.pushDeviceToken.deleteMany({
          where: { id: { in: invalidTokenIds } },
        });
      }

      if (failures.length > 0) {
        if (attemptCount >= MAX_PUSH_ATTEMPTS) {
          await prisma.householdNotification.update({
            where: { id: notification.id },
            data: { pushFailedAt: new Date() },
          });
        }
        console.error(
          attemptCount >= MAX_PUSH_ATTEMPTS
            ? "FCM delivery retries exhausted"
            : "FCM delivery failed; will retry",
          {
            notificationId: notification.id,
            attemptCount,
            errorCodes: failures,
          },
        );
        continue;
      }
      await prisma.householdNotification.update({
        where: { id: notification.id },
        data: { pushSentAt: new Date() },
      });
    } catch (error) {
      console.error("Failed to deliver household push notification", {
        notificationId: notification.id,
        attemptCount,
        error,
      });
      if (attemptCount >= MAX_PUSH_ATTEMPTS) {
        await prisma.householdNotification.update({
          where: { id: notification.id },
          data: { pushFailedAt: new Date() },
        });
      }
    }
  }
};

const runPushNotificationWorker = async () => {
  try {
    await sendPendingPushNotifications();
  } catch (error) {
    console.error("Failed to process pending push notifications", error);
  }
};

export const startPushNotificationWorker = () => {
  if (!firebaseApp) {
    console.warn(
      "Firebase Admin credentials are not configured; push delivery is disabled",
    );
    return;
  }
  void runPushNotificationWorker();
  const interval = setInterval(() => {
    void runPushNotificationWorker();
  }, PUSH_CHECK_INTERVAL_MS);
  interval.unref();
};
