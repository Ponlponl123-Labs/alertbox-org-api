export interface ProcessedImage {
  buffer: Buffer;
  mime: string;
  extension: string;
}

export async function processAvatar(buffer: Buffer): Promise<ProcessedImage> {
  const processed = await new Bun.Image(buffer)
    .resize(256, 256)
    .webp({ quality: 100 })
    .bytes();

  return {
    buffer: Buffer.from(processed),
    mime: "image/webp",
    extension: "webp",
  };
}

export async function processBanner(buffer: Buffer): Promise<ProcessedImage> {
  const processed = await new Bun.Image(buffer)
    .resize(2400, 800)
    .webp({ quality: 100 })
    .bytes();

  return {
    buffer: Buffer.from(processed),
    mime: "image/webp",
    extension: "webp",
  };
}
