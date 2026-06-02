import { mkdir, writeFile, unlink } from "node:fs/promises";
import { join, dirname } from "node:path";
import { existsSync } from "node:fs";

const STORAGE_PATH = process.env.STORAGE_PATH || join(process.cwd(), "uploads");
const CDN_BASE_URL = process.env.CDN_BASE_URL || "https://static.alertbox.org";

export async function saveProfileImage(
  uid: string,
  type: "avatar" | "banner",
  filename: string,
  buffer: Buffer,
): Promise<{ path: string; url: string }> {
  const timestamp = Date.now();
  const ext = "webp";
  const nameOnly = filename.split(".")[0];
  const finalFilename = `${nameOnly}.${timestamp}.${ext}`;

  const relativePath = join("u", uid, type, finalFilename);
  const fullPath = join(STORAGE_PATH, relativePath);

  await mkdir(dirname(fullPath), { recursive: true });

  await writeFile(fullPath, buffer);

  return {
    path: relativePath,
    url: `${CDN_BASE_URL}/u/${uid}/${type}/${finalFilename}`,
  };
}

export async function deleteProfileImage(url: string): Promise<void> {
  if (!url.includes(CDN_BASE_URL)) return;

  const relativePath = url.replace(`${CDN_BASE_URL}/`, "");
  const fullPath = join(STORAGE_PATH, relativePath);

  if (existsSync(fullPath)) {
    await unlink(fullPath);
  }
}
