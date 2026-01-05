import { useEffect, useRef } from "react";

type Props = {
  points?: Array<{ X: number; Y: number }>;
};

function niceTicks(min: number, max: number, n = 5) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (Math.abs(max - min) < 1e-12) return [min];

  const span = max - min;
  const step0 = span / Math.max(1, n - 1);
  const mag = Math.pow(10, Math.floor(Math.log10(Math.abs(step0))));
  const norm = step0 / mag;

  let step = 1 * mag;
  if (norm >= 2) step = 2 * mag;
  if (norm >= 5) step = 5 * mag;
  if (norm >= 10) step = 10 * mag;

  const start = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + step * 0.5; v += step) ticks.push(v);
  return ticks;
}

export default function DataChartCanvas({ points }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      const w = parent.clientWidth;
      const h = parent.clientHeight;
      const dpr = window.devicePixelRatio || 1;

      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      ctx.save();
      ctx.scale(dpr, dpr);

      ctx.fillStyle = "rgba(255,255,255,0.02)";
      ctx.fillRect(0, 0, w, h);

      if (!points || points.length < 2) {
        ctx.fillStyle = "rgba(233,238,246,0.75)";
        ctx.font = "13px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
        ctx.fillText("No curve data yet (Step 5).", 12, 22);
        ctx.restore();
        return;
      }

      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const p of points) {
        if (!Number.isFinite(p.X) || !Number.isFinite(p.Y)) continue;
        minX = Math.min(minX, p.X); maxX = Math.max(maxX, p.X);
        minY = Math.min(minY, p.Y); maxY = Math.max(maxY, p.Y);
      }
      if (!Number.isFinite(minX) || !Number.isFinite(minY) || Math.abs(maxX - minX) < 1e-12 || Math.abs(maxY - minY) < 1e-12) {
        ctx.fillStyle = "rgba(233,238,246,0.75)";
        ctx.font = "13px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
        ctx.fillText("Insufficient data range to plot.", 12, 22);
        ctx.restore();
        return;
      }

      const padL = 46, padR = 14, padT = 12, padB = 28;
      const plotW = Math.max(1, w - padL - padR);
      const plotH = Math.max(1, h - padT - padB);

      const xToPx = (x: number) => padL + ((x - minX) / (maxX - minX)) * plotW;
      const yToPx = (y: number) => padT + (1 - (y - minY) / (maxY - minY)) * plotH;

      const xt = niceTicks(minX, maxX, 6);
      const yt = niceTicks(minY, maxY, 5);

      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.lineWidth = 1;

      for (const t of xt) {
        const x = xToPx(t);
        ctx.beginPath();
        ctx.moveTo(x, padT);
        ctx.lineTo(x, padT + plotH);
        ctx.stroke();
      }

      for (const t of yt) {
        const y = yToPx(t);
        ctx.beginPath();
        ctx.moveTo(padL, y);
        ctx.lineTo(padL + plotW, y);
        ctx.stroke();
      }

      ctx.strokeStyle = "rgba(255,255,255,0.18)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(padL, padT);
      ctx.lineTo(padL, padT + plotH);
      ctx.lineTo(padL + plotW, padT + plotH);
      ctx.stroke();

      ctx.fillStyle = "rgba(233,238,246,0.75)";
      ctx.font = "11px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";

      for (const t of yt) {
        const y = yToPx(t);
        ctx.fillText(String(+t.toPrecision(6)), 6, y + 4);
      }
      for (const t of xt) {
        const x = xToPx(t);
        const s = String(+t.toPrecision(6));
        ctx.fillText(s, x - ctx.measureText(s).width / 2, padT + plotH + 18);
      }

      ctx.strokeStyle = "rgba(233,238,246,0.9)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();

      let started = false;
      for (const p of points) {
        if (!Number.isFinite(p.X) || !Number.isFinite(p.Y)) continue;
        const x = xToPx(p.X);
        const y = yToPx(p.Y);
        if (!started) { ctx.moveTo(x, y); started = true; }
        else { ctx.lineTo(x, y); }
      }
      ctx.stroke();

      ctx.fillStyle = "rgba(233,238,246,0.65)";
      ctx.font = "11px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
      ctx.fillText(`Points: ${points.length}`, w - 90, 18);

      ctx.restore();
    };

    draw();

    let raf = 0;
    let lastW = parent.clientWidth;
    let lastH = parent.clientHeight;

    const tick = () => {
      const w = parent.clientWidth;
      const h = parent.clientHeight;
      if (w !== lastW || h !== lastH) {
        lastW = w;
        lastH = h;
        draw();
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [points]);

  return <canvas ref={canvasRef} />;
}
