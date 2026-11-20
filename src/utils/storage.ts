import { mkdir, writeFile, unlink } from "node:fs/promises";
import { join, dirname, resolve, sep } from "node:path";
import { existsSync } from "node:fs";

const STORAGE_PATH = resolve(process.env.STORAGE_PATH || join(process.cwd(), "public", "uploads"));
const CDN_BASE_URL = process.env.CDN_BASE_URL || "http://127.0.0.1:3001/public/uploads";

export async function saveProfileImage(
  uid: string,
  type: "avatar" | "banner",
  filename: string,
  buffer: Buffer,
): Promise<{ path: string; url: string }> {
  const cleanUid = uid.replace(/[^a-zA-Z0-9_-]/g, "");
  const cleanName = filename.split(".")[0].replace(/[^a-zA-Z0-9_-]/g, "");
  const timestamp = Date.now();
  const ext = "webp";
  const finalFilename = `${cleanName || "file"}.${timestamp}.${ext}`;

  const relativePath = join("u", cleanUid, type, finalFilename);
  const fullPath = resolve(STORAGE_PATH, relativePath);

  if (!fullPath.startsWith(STORAGE_PATH + sep)) {
    throw new Error("Invalid storage destination");
  }

  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, buffer);

  return {
    path: relativePath,
    url: `${CDN_BASE_URL}/u/${cleanUid}/${type}/${finalFilename}`,
  };
}

export async function deleteProfileImage(url: string): Promise<void> {
  if (!url || typeof url !== "string" || !url.startsWith(`${CDN_BASE_URL}/`)) return;

  const relativePath = url.slice(CDN_BASE_URL.length + 1);
  const fullPath = resolve(STORAGE_PATH, relativePath);

  if (!fullPath.startsWith(STORAGE_PATH + sep)) {
    return;
  }

  if (existsSync(fullPath)) {
    await unlink(fullPath);
  }
}
