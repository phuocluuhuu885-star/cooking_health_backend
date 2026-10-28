import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import "dotenv/config";
type ChatMessage = {
    id: string;
    householdId: string;
    senderUserId: string | null;
    content: string;
    createdAt: string;
    sender: {
        id: string;
        fullName: string | null;
    } | null;
};
type ChatAck<T> = (response: {
    success: true;
    data: T;
} | {
    success: false;
    message: string;
}) => void;
type ClientToServerEvents = {
    "chat:join": (payload: {
        householdId: string;
    }, acknowledge: ChatAck<{
        householdId: string;
    }>) => void;
    "chat:leave": () => void;
    "chat:send": (payload: {
        content: string;
    }, acknowledge: ChatAck<ChatMessage>) => void;
};
type ServerToClientEvents = {
    "chat:ready": (payload: {
        householdId: string;
    }) => void;
    "chat:message": (message: ChatMessage) => void;
};
type SocketData = {
    userId: string;
    householdId: string | undefined;
};
export declare const attachHouseholdChatSocket: (httpServer: HttpServer) => Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
export {};
//# sourceMappingURL=householdChatSocket.d.ts.map