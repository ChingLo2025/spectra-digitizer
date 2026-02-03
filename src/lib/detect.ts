import type { AutoDetectResult, Line, Point, Rect } from "../types";

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function grayAt(data: Uint8ClampedArray, idx: number): number {
  const r = data[idx];
  const g = data[idx + 1];
  const b = data[idx + 2];
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function computeThreshold(roi: ImageData, rect: Rect): number {
  const { data, width } = roi;
  let mn = 255,
    mx = 0;
  const x0 = clamp(Math.floor(rect.x), 0, roi.width - 1);
  const y0 = clamp(Math.floor(rect.y), 0, roi.height - 1);
  const x1 = clamp(Math.floor(rect.x + rect.w), 0, roi.width);
  const y1 = clamp(Math.floor(rect.y + rect.h), 0, roi.height);

  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const idx = (y * width + x) * 4;
      const g = grayAt(data, idx);
      if (g < mn) mn = g;
      if (g > mx) mx = g;
    }
  }
  return (mn + mx) / 2;
}

function makeLineHorizontal(y: number): Line {
  return { p: { x: 0, y }, v: { x: 1, y: 0 } };
}
function makeLineVertical(x: number): Line {
  return { p: { x, y: 0 }, v: { x: 0, y: 1 } };
}

function cluster1D(values: number[], gap = 3): number[] {
  if (values.length === 0) return [];
  values.sort((a, b) => a - b);
  const out: number[] = [];
  let sum = values[0];
  let count = 1;
  for (let i = 1; i < values.length; i++) {
    const v = values[i];
    if (v - values[i - 1] <= gap) {
      sum += v;
      count++;
    } else {
      out.push(sum / count);
      sum = v;
      count = 1;
    }
  }
  out.push(sum / count);
  return out;
}

export function detectAxesAndTicksTwoRois(args: {
  roi: ImageData;
  axisRoiX: Rect;
  axisRoiY: Rect;
}): AutoDetectResult {
  const { roi, axisRoiX, axisRoiY } = args;
  const w = roi.width;
  const h = roi.height;
  const data = roi.data;

  // --- Detect x-axis y position via row projection in axisRoiX
  const thrX = computeThreshold(roi, axisRoiX);
  const xRowSum = new Array(Math.floor(axisRoiX.h)).fill(0);
  for (let yy = 0; yy < Math.floor(axisRoiX.h); yy++) {
    const y = clamp(Math.floor(axisRoiX.y) + yy, 0, h - 1);
    let sum = 0;
    for (let x = clamp(Math.floor(axisRoiX.x), 0, w - 1); x < clamp(Math.floor(axisRoiX.x + axisRoiX.w), 0, w); x++) {
      const idx = (y * w + x) * 4;
      if (grayAt(data, idx) < thrX) sum++;
    }
    xRowSum[yy] = sum;
  }
  let bestRow = 0;
  for (let i = 1; i < xRowSum.length; i++) if (xRowSum[i] > xRowSum[bestRow]) bestRow = i;
  const xAxisY = clamp(Math.floor(axisRoiX.y) + bestRow, 0, h - 1);

  // --- Detect y-axis x position via col projection in axisRoiY
  const thrY = computeThreshold(roi, axisRoiY);
  const yColSum = new Array(Math.floor(axisRoiY.w)).fill(0);
  for (let xx = 0; xx < Math.floor(axisRoiY.w); xx++) {
    const x = clamp(Math.floor(axisRoiY.x) + xx, 0, w - 1);
    let sum = 0;
    for (let y = clamp(Math.floor(axisRoiY.y), 0, h - 1); y < clamp(Math.floor(axisRoiY.y + axisRoiY.h), 0, h); y++) {
      const idx = (y * w + x) * 4;
      if (grayAt(data, idx) < thrY) sum++;
    }
    yColSum[xx] = sum;
  }
  let bestCol = 0;
  for (let i = 1; i < yColSum.length; i++) if (yColSum[i] > yColSum[bestCol]) bestCol = i;
  const yAxisX = clamp(Math.floor(axisRoiY.x) + bestCol, 0, w - 1);

  const xAxisLine = makeLineHorizontal(xAxisY);
  const yAxisLine = makeLineVertical(yAxisX);

  // --- Tick detection (very lightweight)
  const tickPointsX: Point[] = [];
  const tickPointsY: Point[] = [];

  const band = 2;
  const minLen = 3;
  const axisBand = 1;

  // x-axis ticks: vertical extension near xAxisY
  const xCandidates: number[] = [];
  {
    const x0 = clamp(Math.floor(axisRoiX.x), 0, w - 1);
    const x1 = clamp(Math.floor(axisRoiX.x + axisRoiX.w), 0, w);
    for (let x = x0; x < x1; x++) {
      // Allow a small vertical band when the axis line is faint.
      let axisDark = false;
      for (let yy = xAxisY - axisBand; yy <= xAxisY + axisBand; yy++) {
        if (yy < 0 || yy >= h) continue;
        const idx0 = (yy * w + x) * 4;
        if (grayAt(data, idx0) < thrX) {
          axisDark = true;
          break;
        }
      }
      if (!axisDark) continue;

      // Count vertical dark pixels above/below axis outside small band
      let up = 0;
      for (let y = xAxisY - band - 1; y >= 0; y--) {
        const idx = (y * w + x) * 4;
        if (grayAt(data, idx) < thrX) up++;
        else break;
        if (up > 30) break;
      }
      let down = 0;
      for (let y = xAxisY + band + 1; y < h; y++) {
        const idx = (y * w + x) * 4;
        if (grayAt(data, idx) < thrX) down++;
        else break;
        if (down > 30) break;
      }
      if (Math.max(up, down) >= minLen) xCandidates.push(x);
    }
    const clustered = cluster1D(xCandidates, 4);
    for (const cx of clustered) tickPointsX.push({ x: cx, y: xAxisY });
  }

  // y-axis ticks: horizontal extension near yAxisX
  const yCandidates: number[] = [];
  {
    const y0 = clamp(Math.floor(axisRoiY.y), 0, h - 1);
    const y1 = clamp(Math.floor(axisRoiY.y + axisRoiY.h), 0, h);
    for (let y = y0; y < y1; y++) {
      let axisDark = false;
      for (let xx = yAxisX - axisBand; xx <= yAxisX + axisBand; xx++) {
        if (xx < 0 || xx >= w) continue;
        const idx0 = (y * w + xx) * 4;
        if (grayAt(data, idx0) < thrY) {
          axisDark = true;
          break;
        }
      }
      if (!axisDark) continue;

      let left = 0;
      for (let x = yAxisX - band - 1; x >= 0; x--) {
        const idx = (y * w + x) * 4;
        if (grayAt(data, idx) < thrY) left++;
        else break;
        if (left > 30) break;
      }
      let right = 0;
      for (let x = yAxisX + band + 1; x < w; x++) {
        const idx = (y * w + x) * 4;
        if (grayAt(data, idx) < thrY) right++;
        else break;
        if (right > 30) break;
      }
      if (Math.max(left, right) >= minLen) yCandidates.push(y);
    }
    const clustered = cluster1D(yCandidates, 4);
    for (const cy of clustered) tickPointsY.push({ x: yAxisX, y: cy });
  }

  return { xAxisLine, yAxisLine, tickPointsX, tickPointsY };
}
