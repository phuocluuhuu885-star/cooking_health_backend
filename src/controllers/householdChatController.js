import { PrismaClient } from "../generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";
const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });
const MAX_MESSAGE_LENGTH = 2000;
const DEFAULT_PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 50;
const getMember = (userId) => prisma.householdMember.findUnique({
    where: { userId },
    select: { householdId: true, joinedAt: true },
});
const getUnreadCount = async (householdId, userId, joinedAt) => {
    const readState = await prisma.householdChatReadState.findUnique({
        where: { householdId_userId: { householdId, userId } },
        select: { lastReadAt: true },
    });
    return prisma.householdChatMessage.count({
        where: {
            householdId,
            createdAt: { gt: readState?.lastReadAt ?? joinedAt },
            senderUserId: { not: userId },
        },
    });
};
export const getHouseholdChatMessages = async (req, res) => {
    const userId = req.user?.id;
    if (!userId) {
        res.status(401).json({
            success: false,
            message: "Phiên đăng nhập không hợp lệ",
        });
        return;
    }
    const rawLimit = req.query.limit;
    const limit = rawLimit === undefined
        ? DEFAULT_PAGE_SIZE
        : typeof rawLimit === "string"
            ? Number(rawLimit)
            : Number.NaN;
    const beforeValue = req.query.before;
    const beforeIdValue = req.query.beforeId;
    const before = typeof beforeValue === "string" ? new Date(beforeValue) : undefined;
    const beforeId = typeof beforeIdValue === "string" ? beforeIdValue : undefined;
    if (!Number.isInteger(limit) ||
        limit < 1 ||
        limit > MAX_PAGE_SIZE ||
        (beforeValue !== undefined &&
            (typeof beforeValue !== "string" ||
                !before ||
                Number.isNaN(before.getTime()) ||
                !beforeId ||
                !beforeId.trim())) ||
        (beforeValue === undefined && beforeIdValue !== undefined)) {
        res.status(400).json({
            success: false,
            message: "Phân trang tin nhắn không hợp lệ",
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
        const [messages, unreadCount] = await Promise.all([
            prisma.householdChatMessage.findMany({
                where: {
                    householdId: member.householdId,
                    ...(before && beforeId
                        ? {
                            OR: [
                                { createdAt: { lt: before } },
                                { createdAt: before, id: { lt: beforeId } },
                            ],
                        }
                        : {}),
                },
                orderBy: [{ createdAt: "desc" }, { id: "desc" }],
                take: limit + 1,
                select: {
                    id: true,
                    householdId: true,
                    content: true,
                    createdAt: true,
                    senderUserId: true,
                    sender: { select: { id: true, fullName: true } },
                },
            }),
            getUnreadCount(member.householdId, userId, member.joinedAt),
        ]);
        const hasMore = messages.length > limit;
        const page = hasMore ? messages.slice(0, limit) : messages;
        res.status(200).json({
            success: true,
            data: {
                messages: page.reverse(),
                hasMore,
                unreadCount,
            },
        });
    }
    catch (error) {
        console.error("Failed to load household chat messages", error);
        res.status(500).json({
            success: false,
            message: "Không thể tải tin nhắn gia đình",
        });
    }
};
export const getHouseholdChatUnreadCount = async (req, res) => {
    const userId = req.user?.id;
    if (!userId) {
        res.status(401).json({
            success: false,
            message: "Phiên đăng nhập không hợp lệ",
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
        const unreadCount = await getUnreadCount(member.householdId, userId, member.joinedAt);
        res.status(200).json({ success: true, data: { unreadCount } });
    }
    catch (error) {
        console.error("Failed to load household chat unread count", error);
        res.status(500).json({
            success: false,
            message: "Không thể tải số tin nhắn chưa đọc",
        });
    }
};
export const markHouseholdChatRead = async (req, res) => {
    const userId = req.user?.id;
    if (!userId) {
        res.status(401).json({
            success: false,
            message: "Phiên đăng nhập không hợp lệ",
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
        const readAt = new Date();
        await prisma.householdChatReadState.upsert({
            where: {
                householdId_userId: {
                    householdId: member.householdId,
                    userId,
                },
            },
            create: {
                householdId: member.householdId,
                userId,
                lastReadAt: readAt,
            },
            update: { lastReadAt: readAt },
        });
        res.status(200).json({
            success: true,
            data: { lastReadAt: readAt.toISOString(), unreadCount: 0 },
        });
    }
    catch (error) {
        console.error("Failed to mark household chat as read", error);
        res.status(500).json({
            success: false,
            message: "Không thể cập nhật trạng thái đã đọc",
        });
    }
};
//# sourceMappingURL=householdChatController.js.map