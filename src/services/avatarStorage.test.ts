import assert from "node:assert/strict";
import test from "node:test";
import {
  AvatarImageError,
  decodeAvatarImage,
  removeStoredAvatar,
} from "./avatarStorage.js";

test("avatar validation accepts supported image signatures", () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff]).toString("base64");
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).toString("base64");
  const webp = Buffer.from("RIFF0000WEBP", "ascii").toString("base64");

  assert.deepEqual(decodeAvatarImage(jpeg), {
    image: Buffer.from([0xff, 0xd8, 0xff]),
    extension: "jpg",
    contentType: "image/jpeg",
  });
  assert.equal(decodeAvatarImage(png).contentType, "image/png");
  assert.equal(decodeAvatarImage(webp).contentType, "image/webp");
});

test("avatar validation rejects invalid encodings and unsupported formats", () => {
  assert.throws(() => decodeAvatarImage("not base64!"), AvatarImageError);
  assert.throws(
    () => decodeAvatarImage(Buffer.from("GIF89a", "ascii").toString("base64")),
    AvatarImageError,
  );
});

test("avatar validation rejects images over 512 KB", () => {
  const oversizedImage = Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff]),
    Buffer.alloc(512 * 1024 - 2),
  ]);
  assert.throws(
    () => decodeAvatarImage(oversizedImage.toString("base64")),
    /512 KB/,
  );
});

test("avatar cleanup ignores database-backed avatar URLs", async () => {
  await assert.doesNotReject(
    removeStoredAvatar("/api/auth/profile/avatar/user_123?v=123"),
  );
});
