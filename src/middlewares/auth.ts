import jwt from 'jsonwebtoken';
import type {
  Request,
  Response,
  NextFunction,
} from 'express';
import type { AuthUser } from '../auth/authUser.js';
import { JWT_SECRET } from '../utils.ts/jwt.js';

export const authenticate = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
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

    if (
      typeof decoded !== 'object' ||
      decoded === null ||
      !('sub' in decoded) ||
      typeof decoded.sub !== 'string' ||
      !('email' in decoded) ||
      typeof decoded.email !== 'string'
    ) {
      res.status(401).json({
        success: false,
        message: 'Token không hợp lệ',
      });
      return;
    }

    const user: AuthUser = {
      id: decoded.sub,
      email: decoded.email,
    };

    req.user = user;

    next();
  } catch (error) {
    console.error('Authentication Error:', error);

    res.status(401).json({
      success: false,
      message: 'Token không hợp lệ hoặc đã hết hạn',
    });
  }
};

export const optionalAuthenticate = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  if (!req.headers.authorization) {
    next();
    return;
  }
  authenticate(req, res, next);
};