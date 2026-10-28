import jwt from "jsonwebtoken";
import { Server } from "socket.io";
import { PrismaClient } from "../generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { JWT_SECRET } from "../utils.ts/jwt.js";
import "dotenv/config";
const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });
const MAX_MESSAGE_LENGTH = 2000;
export const attachHouseholdChatSocket = (httpServer) => {
    const io = new Server(httpServer, { cors: { origin: "*" } });
    io.use((socket, next) => {
        const token = socket.handshake.auth.token;
        if (typeof token !== "string") {
            next(new Error("Phiên đăng nhập không hợp lệ"));
            return;
        }
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            if (typeof decoded !== "object" ||
                decoded === null ||
                !("sub" in decoded) ||
                typeof decoded.sub !== "string" ||
                !decoded.sub) {
                next(new Error("Token không hợp lệ"));
                return;
            }
            socket.data.userId = decoded.sub;
            next();
        }
        catch {
            next(new Error("Token không hợp lệ hoặc đã hết hạn"));
        }
    });
    io.on("connection", (socket) => {
        socket.data.householdId = undefined;
        const userRoom = `user:${socket.data.userId}`;
        void socket.join(userRoom);
        socket.on("chat:join", async (payload, acknowledge) => {
            if (typeof acknowledge !== "function") {
                return;
            }
            const householdId = typeof payload?.householdId === "string"
                ? payload.householdId.trim()
                : "";
            if (!householdId) {
                acknowledge({
                    success: false,
                    message: "Mã gia đình không hợp lệ",
                });
                return;
            }
            try {
                const member = await prisma.householdMember.findFirst({
                    where: { householdId, userId: socket.data.userId },
                    select: { householdId: true },
                });
                if (!member) {
                    socket.data.householdId = undefined;
                    acknowledge({
                        success: false,
                        message: "Bạn không còn là thành viên của gia đình này",
                    });
                    return;
                }
                socket.data.householdId = member.householdId;
                acknowledge({
                    success: true,
                    data: { householdId: member.householdId },
                });
                socket.emit("chat:ready", { householdId: member.householdId });
            }
            catch (error) {
                console.error("Failed to authorize household chat socket", error);
                acknowledge({
                    success: false,
                    message: "Không thể tham gia phòng chat",
                });
            }
        });
        socket.on("chat:leave", () => {
            socket.data.householdId = undefined;
        });
        socket.on("chat:send", async (payload, acknowledge) => {
            if (typeof acknowledge !== "function") {
                return;
            }
            const householdId = socket.data.householdId;
            const normalizedContent = typeof payload?.content === "string" ? payload.content.trim() : "";
            if (!householdId) {
                acknowledge({
                    success: false,
                    message: "Hãy tham gia phòng chat gia đình trước",
                });
                return;
            }
            if (!normalizedContent || normalizedContent.length > MAX_MESSAGE_LENGTH) {
                acknowledge({
                    success: false,
                    message: "Tin nhắn không được để trống và tối đa 2000 ký tự",
                });
                return;
            }
            try {
                const member = await prisma.householdMember.findFirst({
                    where: { householdId, userId: socket.data.userId },
                    select: { householdId: true },
                });
                if (!member) {
                    socket.data.householdId = undefined;
                    acknowledge({
                        success: false,
                        message: "Bạn không còn là thành viên của gia đình này",
                    });
                    return;
                }
                const message = await prisma.householdChatMessage.create({
                    data: {
                        householdId,
                        senderUserId: socket.data.userId,
                        content: normalizedContent,
                    },
                    select: {
                        id: true,
                        householdId: true,
                        senderUserId: true,
                        content: true,
                        createdAt: true,
                        sender: { select: { id: true, fullName: true } },
                    },
                });
                const payload = {
                    ...message,
                    createdAt: message.createdAt.toISOString(),
                };
                const currentMembers = await prisma.householdMember.findMany({
                    where: { householdId },
                    select: { userId: true },
                });
                currentMembers.forEach(({ userId }) => {
                    io.to(`user:${userId}`).emit("chat:message", payload);
                });
                acknowledge({ success: true, data: payload });
            }
            catch (error) {
                console.error("Failed to send household chat message", error);
                acknowledge({
                    success: false,
                    message: "Không thể gửi tin nhắn. Vui lòng thử lại.",
                });
            }
        });
    });
    return io;
};
//# sourceMappingURL=householdChatSocket.js.map