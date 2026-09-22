import sharp from "sharp";

let cached: Buffer | null = null;

export async function minimalJpegBuffer(): Promise<Buffer> {
  if (cached) return cached;
  cached = await sharp({
    create: { width: 32, height: 32, channels: 3, background: { r: 200, g: 100, b: 50 } },
  })
    .jpeg()
    .toBuffer();
  return cached;
}
