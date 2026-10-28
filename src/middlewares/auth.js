import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../utils.ts/jwt.js';
export const authenticate = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            res.status(401).json({
                success: false,
                message: 'Chưa xác thực',
            });
            return;
        }
        const token = authHeader.substring(7);
        const decoded = jwt.verify(token, JWT_SECRET);
        if (typeof decoded !== 'object' ||
            decoded === null ||
            !('sub' in decoded) ||
            typeof decoded.sub !== 'string' ||
            !('email' in decoded) ||
            typeof decoded.email !== 'string') {
            res.status(401).json({
                success: false,
                message: 'Token không hợp lệ',
            });
            return;
        }
        const user = {
            id: decoded.sub,
            email: decoded.email,
        };
        req.user = user;
        next();
    }
    catch (error) {
        console.error('Authentication Error:', error);
        res.status(401).json({
            success: false,
            message: 'Token không hợp lệ hoặc đã hết hạn',
        });
    }
};
export const optionalAuthenticate = (req, res, next) => {
    if (!req.headers.authorization) {
        next();
        return;
    }
    authenticate(req, res, next);
};
//# sourceMappingURL=auth.js.map