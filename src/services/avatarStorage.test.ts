import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import {
  AvatarImageError,
  avatarUploadDirectory,
  decodeAvatarImage,
  removeStoredAvatar,
  saveAvatarImage,
} from "./avatarStorage.js";

test("avatar validation accepts supported image signatures", () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff]).toString("base64");
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).toString("base64");
  const webp = Buffer.from("RIFF0000WEBP", "ascii").toString("base64");

  assert.equal(decodeAvatarImage(jpeg).extension, "jpg");
  assert.equal(decodeAvatarImage(png).extension, "png");
  assert.equal(decodeAvatarImage(webp).extension, "webp");
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

test("avatar files are stored under the public avatar directory", async () => {
  const image = Buffer.from([0xff, 0xd8, 0xff, 0x00]);
  const avatarUrl = await saveAvatarImage(image.toString("base64"));
  const fileName = avatarUrl.split("/").at(-1);
  assert.ok(fileName);

  try {
    assert.deepEqual(
      await readFile(resolve(avatarUploadDirectory, fileName)),
      image,
    );
  } finally {
    await removeStoredAvatar(avatarUrl);
  }
});
