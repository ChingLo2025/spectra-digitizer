import { useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import type { Rect } from "../types";

type Props = {
  bitmap?: ImageBitmap;
  width: number;
  height: number;
  plotRoi?: Rect;
  onPlotRoiCommit: (rect: Rect) => void;
};

type Viewport = { scale: number; ox: number; oy: number; dw: number; dh: number };

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function getViewport(canvasW: number, canvasH: number, imgW: number, imgH: number): Viewport {
  const scale = Math.min(canvasW / imgW, canvasH / imgH);
  const dw = imgW * scale;
  const dh = imgH * scale;
  const ox = (canvasW - dw) / 2;
  const oy = (canvasH - dh) / 2;
  return { scale, ox, oy, dw, dh };
}

export default function OriginalImageCanvas({ bitmap, width, height, plotRoi, onPlotRoiCommit }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [drag, setDrag] = useState<{
    dragging: boolean;
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  }>({ dragging: false, x0: 0, y0: 0, x1: 0, y1: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      const cw = parent.clientWidth;
      const ch = parent.clientHeight;
      const dpr = window.devicePixelRatio || 1;

      canvas.width = Math.max(1, Math.floor(cw * dpr));
      canvas.height = Math.max(1, Math.floor(ch * dpr));
      canvas.style.width = `${cw}px`;
      canvas.style.height = `${ch}px`;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.scale(dpr, dpr);

      ctx.fillStyle = "rgba(10,12,18,0.35)";
      ctx.fillRect(0, 0, cw, ch);

      if (bitmap) {
        const vp = getViewport(cw, ch, width, height);
        ctx.drawImage(bitmap, vp.ox, vp.oy, vp.dw, vp.dh);

        // existing ROI
        if (plotRoi) {
          ctx.strokeStyle = "rgba(0,255,180,0.9)";
          ctx.lineWidth = 2;
          ctx.strokeRect(
            vp.ox + plotRoi.x * vp.scale,
            vp.oy + plotRoi.y * vp.scale,
            plotRoi.w * vp.scale,
            plotRoi.h * vp.scale
          );
        }

        // dragging rect
        if (drag.dragging) {
          const x = Math.min(drag.x0, drag.x1);
          const y = Math.min(drag.y0, drag.y1);
          const w2 = Math.abs(drag.x1 - drag.x0);
          const h2 = Math.abs(drag.y1 - drag.y0);

          ctx.strokeStyle = "rgba(0,255,180,0.9)";
          ctx.lineWidth = 2;
          ctx.setLineDash([6, 4]);
          ctx.strokeRect(x, y, w2, h2);
          ctx.setLineDash([]);
        }
      } else {
        ctx.fillStyle = "rgba(233,238,246,0.75)";
        ctx.font = "13px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
        ctx.fillText("Upload an image to begin.", 12, 22);
      }

      ctx.restore();
    };

    draw();

    let raf = 0;
    const tick = () => {
      draw();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [bitmap, width, height, plotRoi, drag]);

  function canvasToImage(e: ReactMouseEvent<HTMLCanvasElement>, cw: number, ch: number) {
    if (!bitmap) return null;
    const vp = getViewport(cw, ch, width, height);
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;

    const ix = (cx - vp.ox) / vp.scale;
    const iy = (cy - vp.oy) / vp.scale;
    return { ix, iy, vp, cx, cy };
  }

  function onDown(e: ReactMouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas || !bitmap) return;
    const parent = canvas.parentElement;
    if (!parent) return;
    const cw = parent.clientWidth;
    const ch = parent.clientHeight;
    const t = canvasToImage(e, cw, ch);
    if (!t) return;

    // only start drag if click inside image area
    if (t.ix < 0 || t.iy < 0 || t.ix > width || t.iy > height) return;

    if (!drag.dragging) {
      setDrag({ dragging: true, x0: t.cx, y0: t.cy, x1: t.cx, y1: t.cy });
      return;
    }

    const vp = getViewport(cw, ch, width, height);

    const x0 = Math.min(drag.x0, t.cx);
    const y0 = Math.min(drag.y0, t.cy);
    const x1 = Math.max(drag.x0, t.cx);
    const y1 = Math.max(drag.y0, t.cy);

    // Convert to image coords
    const ix0 = clamp((x0 - vp.ox) / vp.scale, 0, width);
    const iy0 = clamp((y0 - vp.oy) / vp.scale, 0, height);
    const ix1 = clamp((x1 - vp.ox) / vp.scale, 0, width);
    const iy1 = clamp((y1 - vp.oy) / vp.scale, 0, height);

    const rectImg = { x: ix0, y: iy0, w: ix1 - ix0, h: iy1 - iy0 };
    if (rectImg.w >= 2 && rectImg.h >= 2) onPlotRoiCommit(rectImg);

    setDrag((d) => ({ ...d, dragging: false, x1: t.cx, y1: t.cy }));
  }

  function onMove(e: ReactMouseEvent<HTMLCanvasElement>) {
    if (!drag.dragging) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    setDrag((d) => ({ ...d, x1: cx, y1: cy }));
  }

  return (
    <canvas
      ref={canvasRef}
      className="canvas"
      onMouseDown={onDown}
      onMouseMove={onMove}
    />
  );
}
