import type { Request, Response, NextFunction } from "express";

const getAdminEmails = (): Set<string> =>
  new Set(
    (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );

export const requireAdmin = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const adminEmails = getAdminEmails();
  if (adminEmails.size === 0) {
    res.status(503).json({
      success: false,
      code: "ADMIN_ACCESS_NOT_CONFIGURED",
      message: "Chưa cấu hình tài khoản quản trị trên máy chủ.",
    });
    return;
  }

  if (!req.user || !adminEmails.has(req.user.email.toLowerCase())) {
    res.status(403).json({
      success: false,
      code: "ADMIN_ACCESS_REQUIRED",
      message: "Tài khoản này không có quyền quản trị.",
    });
    return;
  }

  next();
};
