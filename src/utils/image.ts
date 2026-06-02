import sharp from "sharp";

export interface ProcessedImage {
  buffer: Buffer;
  mime: string;
  extension: string;
}

export async function processAvatar(buffer: Buffer): Promise<ProcessedImage> {
  const processed = await sharp(buffer)
    .resize(256, 256, {
      fit: "cover",
      position: "center",
    })
    .webp({ quality: 80, effort: 6 })
    .toBuffer();

  return {
    buffer: processed,
    mime: "image/webp",
    extension: "webp",
  };
}

export async function processBanner(buffer: Buffer): Promise<ProcessedImage> {
  const processed = await sharp(buffer)
    .resize(1200, 400, {
      fit: "cover",
      position: "center",
    })
    .webp({ quality: 80, effort: 6 })
    .toBuffer();

  return {
    buffer: processed,
    mime: "image/webp",
    extension: "webp",
  };
}
