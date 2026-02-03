import type { Point } from "../types";

export function computeAverageColor(roi: ImageData, seeds: Point[]): { r: number; g: number; b: number } {
  if (seeds.length < 1) throw new Error("Need at least 1 seed to compute average color");
  const { data, width, height } = roi;

  let sr = 0, sg = 0, sb = 0;
  for (const s of seeds) {
    const x = Math.max(0, Math.min(width - 1, Math.round(s.x)));
    const y = Math.max(0, Math.min(height - 1, Math.round(s.y)));
    const idx = (y * width + x) * 4;
    sr += data[idx];
    sg += data[idx + 1];
    sb += data[idx + 2];
  }
  return { r: Math.round(sr / seeds.length), g: Math.round(sg / seeds.length), b: Math.round(sb / seeds.length) };
}

function distRgb2(a: { r: number; g: number; b: number }, r: number, g: number, b: number) {
  const dr = a.r - r;
  const dg = a.g - g;
  const db = a.b - b;
  return dr * dr + dg * dg + db * db;
}

type Run = { ymin: number; ymax: number; ys: number[] };

function buildRuns(ys: number[]): Run[] {
  if (ys.length === 0) return [];
  ys.sort((a, b) => a - b);
  const runs: Run[] = [];
  let cur: Run = { ymin: ys[0], ymax: ys[0], ys: [ys[0]] };
  for (let i = 1; i < ys.length; i++) {
    const y = ys[i];
    if (y <= cur.ymax + 1) {
      cur.ymax = y;
      cur.ys.push(y);
    } else {
      runs.push(cur);
      cur = { ymin: y, ymax: y, ys: [y] };
    }
  }
  runs.push(cur);
  return runs;
}

function runRepY(run: Run, mode: "centerline" | "median") {
  if (mode === "centerline") return (run.ymin + run.ymax) / 2;
  const mid = Math.floor(run.ys.length / 2);
  return run.ys[mid];
}

function traceDirection(args: {
  roi: ImageData;
  pickedColor: { r: number; g: number; b: number };
  threshold: number;
  mode: "centerline" | "median";
  maxJump: number;
  isBlacklistedPixel: (p: Point) => boolean;
  xStart: number;
  yStart: number;
  dir: 1 | -1;
}): Point[] {
  const { roi, pickedColor, threshold, mode, maxJump, isBlacklistedPixel, xStart, yStart, dir } = args;
  const { data, width, height } = roi;
  const thr2 = threshold * threshold;

  const pts: Point[] = [];
  let yPrev = yStart;
  let yPrev2: number | null = null;

  for (let x = xStart; x >= 0 && x < width; x += dir) {
    // collect candidate ys for this column
    const ys: number[] = [];
    for (let y = 0; y < height; y++) {
      const p = { x, y };
      if (isBlacklistedPixel(p)) continue;
      const idx = (y * width + x) * 4;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2];
      if (distRgb2(pickedColor, r, g, b) <= thr2) ys.push(y);
    }

    const runs = buildRuns(ys);
    if (runs.length === 0) {
      // allow a small gap? MVP: stop.
      break;
    }

    const yPred = yPrev2 === null ? yPrev : yPrev + (yPrev - yPrev2);

    let bestY = runRepY(runs[0], mode);
    let bestD = Math.abs(bestY - yPred);

    for (let i = 1; i < runs.length; i++) {
      const ry = runRepY(runs[i], mode);
      const d = Math.abs(ry - yPred);
      if (d < bestD) {
        bestD = d;
        bestD = d;
        bestY = ry;
      }
    }

    if (bestD > maxJump) break;

    const yChosen = bestY;
    pts.push({ x, y: yChosen });

    yPrev2 = yPrev;
    yPrev = yChosen;
  }

  return pts;
}

export function traceCurveWithSeeds(args: {
  roi: ImageData;
  seeds: Point[];
  pickedColor: { r: number; g: number; b: number };
  threshold: number;
  mode: "centerline" | "median";
  maxJump: number;
  isBlacklistedPixel: (p: Point) => boolean;
}): Point[] {
  const { roi, seeds } = args;
  if (seeds.length < 3) throw new Error("Need at least 3 seeds");
  const seedsSorted = [...seeds].sort((a, b) => a.x - b.x);
  const mid = seedsSorted[Math.floor(seedsSorted.length / 2)];

  const xStart = Math.max(0, Math.min(roi.width - 1, Math.round(mid.x)));
  const yStart = Math.max(0, Math.min(roi.height - 1, Math.round(mid.y)));

  const right = traceDirection({ ...args, xStart, yStart, dir: 1 });
  const left = traceDirection({ ...args, xStart: xStart - 1, yStart, dir: -1 });

  return [...left.reverse(), { x: xStart, y: yStart }, ...right];
}

export function mapAndSort(
  pointsPx: Point[],
  pixelToData: (p: Point) => { X: number; Y: number },
  reverseX: boolean
): Array<{ X: number; Y: number }> {
  const out = pointsPx
    .map((p) => pixelToData(p))
    .filter((p) => Number.isFinite(p.X) && Number.isFinite(p.Y));

  out.sort((a, b) => a.X - b.X);
  if (reverseX) out.reverse();
  return out;
}
