import { unlink } from "node:fs/promises";
import { resolve } from "node:path";

const MAX_AVATAR_BYTES = 512 * 1024;
export const avatarUploadDirectory = resolve(
  process.cwd(),
  "uploads",
  "avatars",
);

export class AvatarImageError extends Error {}

const getAvatarImageFormat = (image: Buffer) => {
  if (
    image.length >= 3 &&
    image[0] === 0xff &&
    image[1] === 0xd8 &&
    image[2] === 0xff
  ) {
    return { extension: "jpg", contentType: "image/jpeg" };
  }
  if (
    image.length >= 8 &&
    image.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ) {
    return { extension: "png", contentType: "image/png" };
  }
  if (
    image.length >= 12 &&
    image.toString("ascii", 0, 4) === "RIFF" &&
    image.toString("ascii", 8, 12) === "WEBP"
  ) {
    return { extension: "webp", contentType: "image/webp" };
  }
  return null;
};

export const decodeAvatarImage = (
  encodedImage: unknown,
): { image: Buffer; extension: string; contentType: string } => {
  if (
    typeof encodedImage !== "string" ||
    encodedImage.length === 0 ||
    encodedImage.length > Math.ceil((MAX_AVATAR_BYTES * 4) / 3) + 4 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(encodedImage)
  ) {
    throw new AvatarImageError("Ảnh đại diện không hợp lệ.");
  }

  const image = Buffer.from(encodedImage, "base64");
  if (image.length === 0 || image.length > MAX_AVATAR_BYTES) {
    throw new AvatarImageError("Ảnh đại diện phải nhỏ hơn 512 KB.");
  }
  const format = getAvatarImageFormat(image);
  if (!format) {
    throw new AvatarImageError("Chỉ chấp nhận ảnh JPEG, PNG hoặc WebP.");
  }
  return { image, ...format };
};

export const removeStoredAvatar = async (
  avatarUrl: string | null | undefined,
): Promise<void> => {
  const fileName = avatarUrl?.match(
    /^\/uploads\/avatars\/([a-f0-9-]+\.(?:jpg|png|webp))$/i,
  )?.[1];
  if (!fileName) return;
  await unlink(resolve(avatarUploadDirectory, fileName)).catch((error) => {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return;
    }
    throw error;
  });
};
