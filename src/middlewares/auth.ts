import jwt from 'jsonwebtoken';
import type {
  Request,
  Response,
  NextFunction,
} from 'express';
import type { AuthUser } from '../auth/authUser.js';
import { JWT_SECRET } from '../utils.ts/jwt.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import 'dotenv/config';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});
const prisma = new PrismaClient({ adapter });

export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  let userId: string;
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        code: 'TOKEN_MISSING',
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
        code: 'TOKEN_INVALID',
        message: 'Token không hợp lệ',
      });
      return;
    }
    userId = decoded.sub;
    userId = decoded.sub;
  } catch (error) {
    console.error('Authentication Error:', error);
    const tokenExpired =
      error instanceof Error && error.name === 'TokenExpiredError';

    res.status(401).json({
      success: false,
      code: tokenExpired ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID',
      message: 'Token không hợp lệ hoặc đã hết hạn',
    });
    return;
  }

  try {
    const account = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, isActive: true },
    });
    if (!account || !account.isActive) {
      res.status(401).json({
        success: false,
        code: account ? 'ACCOUNT_DISABLED' : 'ACCOUNT_NOT_FOUND',
        message: 'Tài khoản không tồn tại hoặc đã bị khóa.',
      });
      return;
    }

    const user: AuthUser = {
      id: account.id,
      email: account.email,
    };
    req.user = user;
    next();
  } catch (error) {
    console.error('Authentication Account Check Error:', error);
    res.status(503).json({
      success: false,
      code: 'ACCOUNT_STATUS_UNAVAILABLE',
      message: 'Không thể xác minh trạng thái tài khoản.',
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