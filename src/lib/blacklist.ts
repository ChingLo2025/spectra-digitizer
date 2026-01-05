import type { Line, Point } from "../types";

function distancePointToLine(p: Point, line: Line): number {
  // line.v is expected to be unit length.
  const dx = p.x - line.p.x;
  const dy = p.y - line.p.y;
  // 2D cross magnitude
  return Math.abs(dx * line.v.y - dy * line.v.x);
}

function minDistance(p: Point, pts: Point[]): number {
  let best = Infinity;
  for (const q of pts) {
    const dx = p.x - q.x;
    const dy = p.y - q.y;
    const d = Math.hypot(dx, dy);
    if (d < best) best = d;
  }
  return best;
}

export function buildBlacklist(args: {
  xAxisLine: Line;
  yAxisLine: Line;
  tickPointsX: Point[];
  tickPointsY: Point[];
  axisBand: number;
  tickRadius: number;
}): (p: Point) => boolean {
  const ticks = [...args.tickPointsX, ...args.tickPointsY];
  const axisBand = args.axisBand;
  const tickRadius = args.tickRadius;

  return (p: Point) => {
    if (distancePointToLine(p, args.xAxisLine) < axisBand) return true;
    if (distancePointToLine(p, args.yAxisLine) < axisBand) return true;
    if (ticks.length > 0 && minDistance(p, ticks) < tickRadius) return true;
    return false;
  };
}
