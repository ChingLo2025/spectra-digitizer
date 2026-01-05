import type { Rect } from "../types";

export async function loadImageBitmap(file: File): Promise<ImageBitmap> {
  // Use createImageBitmap when available; fall back to Image element decode.
  if ("createImageBitmap" in window) {
    try {
      return await createImageBitmap(file);
    } catch {
      // fallthrough to Image decode
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return await createImageBitmap(img);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function cropImageData(bitmap: ImageBitmap, rect: Rect): ImageData {
  const w = Math.max(1, Math.round(rect.w));
  const h = Math.max(1, Math.round(rect.h));
  const x = Math.round(rect.x);
  const y = Math.round(rect.y);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D context not available");

  ctx.drawImage(bitmap, x, y, w, h, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}
