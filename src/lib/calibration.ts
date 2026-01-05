import type { Point } from "../types";

function sub(a: Point, b: Point): Point {
  return { x: a.x - b.x, y: a.y - b.y };
}

function dot(a: Point, b: Point): number {
  return a.x * b.x + a.y * b.y;
}

function norm(a: Point): number {
  return Math.hypot(a.x, a.y);
}

function normalize(a: Point): Point {
  const n = norm(a);
  if (n < 1e-9) throw new Error("Zero-length vector in calibration");
  return { x: a.x / n, y: a.y / n };
}

export function buildPixelToDataMapper(args: {
  pxX1: Point;
  pxX2: Point;
  pxY1: Point;
  pxY2: Point;
  x1: number;
  x2: number;
  y1: number;
  y2: number;
}): (p: Point) => { X: number; Y: number } {
  const vx = normalize(sub(args.pxX2, args.pxX1));
  const vy = normalize(sub(args.pxY2, args.pxY1));

  const dx = sub(args.pxX2, args.pxX1);
  const dy = sub(args.pxY2, args.pxY1);

  const sxDen = dot(dx, vx);
  const syDen = dot(dy, vy);

  if (Math.abs(sxDen) < 1e-9 || Math.abs(syDen) < 1e-9) {
    throw new Error("Invalid calibration points (denominator too small)");
  }

  const sx = (args.x2 - args.x1) / sxDen;
  const sy = (args.y2 - args.y1) / syDen;

  return (p: Point) => {
    const px = sub(p, args.pxX1);
    const py = sub(p, args.pxY1);

    const X = args.x1 + sx * dot(px, vx);
    const Y = args.y1 + sy * dot(py, vy);
    return { X, Y };
  };
}
