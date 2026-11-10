import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";
import { generateToken } from "../utils.ts/jwt.js";
import { ActivityLevel, Gender, Goal } from "../generated/prisma/client.js";
import { calculateHealthMetrics } from "../services/healthService.js";
import {
  AvatarImageError,
  removeStoredAvatar,
  saveAvatarImage,
} from "../services/avatarStorage.js";
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({
  adapter,
});

const BCRYPT_SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS ?? 10);

export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const email = String(req.body?.email ?? "")
      .trim()
      .toLowerCase();

    const password = String(req.body?.password ?? "");
    const fullName = String(req.body?.fullName ?? "").trim();

    if (!email || !password || !fullName) {
      res.status(400).json({
        success: false,
        message: "Vui lòng điền đầy đủ email, mật khẩu và họ tên",
      });
      return;
    }

    if (password.length < 6) {
      res.status(400).json({
        success: false,
        message: "Mật khẩu phải có tối thiểu 6 ký tự",
      });
      return;
    }

    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existingUser) {
      res.status(409).json({
        success: false,
        message: "Email đã được đăng ký",
      });
      return;
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

    const user = await prisma.user.create({
      data: {
        email,
        password: passwordHash,
        fullName,
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        healthProfileCompleted: true,
        createdAt: true,
      },
    });

    res.status(201).json({
      success: true,
      message: "Đăng ký tài khoản thành công",
      data: {
        user,
      },
    });
  } catch (error: unknown) {
    console.error("Register API Error:", error);

    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      res.status(409).json({
        success: false,
        message: "Email đã được đăng ký",
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ nội bộ trong quá trình đăng ký",
    });
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const email = String(req.body?.email ?? "")
      .trim()
      .toLowerCase();

    const password = String(req.body?.password ?? "");

    if (!email || !password) {
      res.status(400).json({
        success: false,
        message: "Email và mật khẩu là bắt buộc",
      });
      return;
    }

    const user = await prisma.user.findUnique({
      where: {
        email,
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        password: true,
        avatarUrl: true,
        createdAt: true,
        isActive: true,
        healthProfile: true,
      },
    });

    if (!user) {
      res.status(401).json({
        success: false,
        message: "Email hoặc mật khẩu không đúng",
      });
      return;
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      res.status(401).json({
        success: false,
        message: "Email hoặc mật khẩu không đúng",
      });
      return;
    }

    if (!user.isActive) {
      res.status(403).json({
        success: false,
        code: "ACCOUNT_DISABLED",
        message: "Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên.",
      });
      return;
    }

    const accessToken = generateToken(user.id, user.email);

    res.status(200).json({
      success: true,
      message: "Đăng nhập thành công",
      data: {
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          avatar: user.avatarUrl,
          accessToken,
          createdAt: user.createdAt,
          healthProfile: user.healthProfile,
        },
      },
    });
  } catch (error) {
    console.error("Login API Error:", error);

    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ nội bộ trong quá trình đăng nhập",
    });
  }
};

export const changePassword = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.id;

    const currentPassword = String(req.body?.currentPassword ?? "");

    const newPassword = String(req.body?.newPassword ?? "");

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "Phiên đăng nhập không hợp lệ",
      });
      return;
    }

    if (!currentPassword || !newPassword) {
      res.status(400).json({
        success: false,
        message: "Vui lòng nhập mật khẩu hiện tại và mật khẩu mới",
      });
      return;
    }

    if (newPassword.length < 6) {
      res.status(400).json({
        success: false,
        message: "Mật khẩu mới phải có tối thiểu 6 ký tự",
      });
      return;
    }

    if (currentPassword === newPassword) {
      res.status(400).json({
        success: false,
        message: "Mật khẩu mới không được trùng mật khẩu hiện tại",
      });
      return;
    }

    const user = await prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        id: true,
        password: true,
      },
    });

    if (!user) {
      res.status(404).json({
        success: false,
        message: "Người dùng không tồn tại",
      });
      return;
    }
    const isCurrentPasswordValid = await bcrypt.compare(
      currentPassword,
      user.password,
    );

    if (!isCurrentPasswordValid) {
      res.status(400).json({
        success: false,
        message: "Mật khẩu hiện tại không chính xác",
      });
      return;
    }

    const newPasswordHash = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);

    await prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        password: newPasswordHash,
      },
    });

    res.status(200).json({
      success: true,
      message: "Đổi mật khẩu thành công",
    });
  } catch (error) {
    console.error("Change Password Error:", error);

    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ nội bộ",
    });
  }
};

export const deleteAccount = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const userId = req.user?.id;
  const password = String(req.body?.password ?? "");
  if (!userId) {
    res.status(401).json({
      success: false,
      message: "Phiên đăng nhập không hợp lệ",
    });
    return;
  }
  if (!password) {
    res.status(400).json({
      success: false,
      message: "Vui lòng nhập mật khẩu để xác nhận xóa tài khoản",
    });
    return;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { password: true, avatarUrl: true },
    });
    if (!user) {
      res.status(404).json({
        success: false,
        message: "Tài khoản không tồn tại",
      });
      return;
    }
    if (!(await bcrypt.compare(password, user.password))) {
      res.status(400).json({
        success: false,
        message: "Mật khẩu xác nhận không chính xác",
      });
      return;
    }

    await prisma.$transaction(async (transaction) => {
      const membership = await transaction.householdMember.findUnique({
        where: { userId },
        include: {
          household: {
            include: {
              members: { orderBy: [{ joinedAt: "asc" }, { id: "asc" }] },
            },
          },
        },
      });

      if (membership?.role === "ADMIN") {
        const nextAdmin = membership.household.members.find(
          (member) => member.userId !== userId,
        );
        if (nextAdmin) {
          await transaction.householdMember.update({
            where: { id: nextAdmin.id },
            data: { role: "ADMIN" },
          });
        } else {
          await transaction.household.delete({
            where: { id: membership.householdId },
          });
        }
      }

      await transaction.user.delete({ where: { id: userId } });
    });

    let warning: string | undefined;
    try {
      await removeStoredAvatar(user.avatarUrl);
    } catch (error) {
      console.error("Failed to remove avatar after account deletion", error);
      warning = "Không thể xóa ảnh đại diện đã lưu. Vui lòng liên hệ hỗ trợ.";
    }

    res.status(200).json({
      success: true,
      message: warning || "Tài khoản và dữ liệu liên quan đã được xóa",
      ...(warning ? { warning } : {}),
    });
  } catch (error) {
    console.error("Failed to delete account", error);
    res.status(500).json({
      success: false,
      message: "Không thể xóa tài khoản lúc này. Vui lòng thử lại.",
    });
  }
};

export const updatePersonalInfo = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({
      success: false,
      message: "Phiên đăng nhập không hợp lệ",
    });
    return;
  }

  const fullName =
    typeof req.body?.fullName === "string" ? req.body.fullName.trim() : "";
  if (fullName.length < 2 || fullName.length > 80) {
    res.status(400).json({
      success: false,
      message: "Họ tên cần từ 2 đến 80 ký tự",
    });
    return;
  }

  try {
    const user = await prisma.user.update({
      where: { id: userId },
      data: { fullName },
      select: {
        id: true,
        email: true,
        fullName: true,
        avatarUrl: true,
      },
    });

    res.status(200).json({
      success: true,
      message: "Cập nhật thông tin cá nhân thành công",
      data: {
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          avatar: user.avatarUrl,
        },
      },
    });
  } catch (error) {
    console.error("Update Personal Info Error:", error);
    res.status(500).json({
      success: false,
      message: "Không thể cập nhật thông tin cá nhân",
    });
  }
};

export const updateAvatar = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({
      success: false,
      message: "Phiên đăng nhập không hợp lệ",
    });
    return;
  }

  let newAvatarUrl: string | null = null;
  try {
    newAvatarUrl = await saveAvatarImage(req.body?.imageBase64);
    const previousUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { avatarUrl: true },
    });
    const user = await prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: newAvatarUrl },
      select: {
        id: true,
        email: true,
        fullName: true,
        avatarUrl: true,
      },
    });

    if (previousUser?.avatarUrl) {
      removeStoredAvatar(previousUser.avatarUrl).catch((error) => {
        console.error("Failed to remove replaced avatar", error);
      });
    }

    res.status(200).json({
      success: true,
      message: "Cập nhật ảnh đại diện thành công",
      data: {
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          avatar: user.avatarUrl,
        },
      },
    });
  } catch (error) {
    if (newAvatarUrl) {
      await removeStoredAvatar(newAvatarUrl).catch((cleanupError) => {
        console.error("Failed to clean up an uncommitted avatar", cleanupError);
      });
    }
    if (error instanceof AvatarImageError) {
      res.status(400).json({ success: false, message: error.message });
      return;
    }
    console.error("Update Avatar Error:", error);
    res.status(500).json({
      success: false,
      message: "Không thể cập nhật ảnh đại diện",
    });
  }
};

export const updateHealthProfile = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "Phiên đăng nhập không hợp lệ",
      });
      return;
    }

    const age = Number(req.body?.age);
    const heightCm = Number(req.body?.heightCm);
    const weightKg = Number(req.body?.weightKg);

    const gender = req.body?.gender as Gender;
    const activityLevel = req.body?.activityLevel as ActivityLevel;
    const goal = req.body?.goal as Goal;
    const allowFamilyNutritionPlanning = req.body?.allowFamilyNutritionPlanning;

    if (
      allowFamilyNutritionPlanning !== undefined &&
      typeof allowFamilyNutritionPlanning !== "boolean"
    ) {
      res.status(400).json({
        success: false,
        message: "Tùy chọn chia sẻ hồ sơ trong gia đình không hợp lệ",
      });
      return;
    }

    if (
      !Number.isFinite(age) ||
      !Number.isFinite(heightCm) ||
      !Number.isFinite(weightKg)
    ) {
      res.status(400).json({
        success: false,
        message: "Thông tin cơ thể không hợp lệ",
      });
      return;
    }

    if (age < 13 || age > 100) {
      res.status(400).json({
        success: false,
        message: "Tuổi không hợp lệ",
      });
      return;
    }

    if (heightCm < 100 || heightCm > 250) {
      res.status(400).json({
        success: false,
        message: "Chiều cao không hợp lệ",
      });
      return;
    }

    if (weightKg < 25 || weightKg > 300) {
      res.status(400).json({
        success: false,
        message: "Cân nặng không hợp lệ",
      });
      return;
    }

    if (!Object.values(Gender).includes(gender)) {
      res.status(400).json({
        success: false,
        message: "Giới tính không hợp lệ",
      });
      return;
    }

    if (!Object.values(ActivityLevel).includes(activityLevel)) {
      res.status(400).json({
        success: false,
        message: "Mức độ vận động không hợp lệ",
      });
      return;
    }

    if (!Object.values(Goal).includes(goal)) {
      res.status(400).json({
        success: false,
        message: "Mục tiêu không hợp lệ",
      });
      return;
    }

    const metrics = calculateHealthMetrics({
      age,
      gender,
      heightCm,
      weightKg,
      activityLevel,
      goal,
    });

    const healthProfile = await prisma.$transaction(async (tx) => {
      const profile = await tx.healthProfile.upsert({
        where: {
          userId,
        },
        create: {
          userId,
          age,
          gender,
          heightCm,
          weightKg,
          activityLevel,
          goal,
          ...(typeof allowFamilyNutritionPlanning === "boolean"
            ? { allowFamilyNutritionPlanning }
            : {}),
          ...metrics,
        },
        update: {
          age,
          gender,
          heightCm,
          weightKg,
          activityLevel,
          goal,
          ...(typeof allowFamilyNutritionPlanning === "boolean"
            ? { allowFamilyNutritionPlanning }
            : {}),
          ...metrics,
        },
      });

      await tx.healthProfileHistory.create({
        data: {
          userId,
          weightKg,
          bmi: metrics.bmi,
          measuredAt: new Date(),
        },
      });

      await tx.user.update({
        where: {
          id: userId,
        },
        data: {
          healthProfileCompleted: true,
        },
      });

      return profile;
    });

    res.status(200).json({
      success: true,
      message: "Cập nhật thông tin sức khỏe thành công",
      data: {
        healthProfile,
      },
    });
  } catch (error) {
    console.error("Update Health Profile Error:", error);

    res.status(500).json({
      success: false,
      message: "Không thể cập nhật thông tin sức khỏe",
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

export const getHealthProfileHistory = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({
      success: false,
      message: "Phiên đăng nhập không hợp lệ",
    });
    return;
  }

  try {
    const history = await prisma.healthProfileHistory.findMany({
      where: { userId },
      orderBy: [{ measuredAt: "desc" }, { id: "desc" }],
      take: 100,
      select: {
        id: true,
        weightKg: true,
        bmi: true,
        measuredAt: true,
      },
    });
    res.status(200).json({
      success: true,
      data: { history: history.reverse() },
    });
  } catch (error) {
    console.error("Failed to load health profile history", error);
    res.status(500).json({
      success: false,
      message: "Không thể tải lịch sử cân nặng và BMI",
    });
  }
};
