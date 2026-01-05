import { useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import type { AutoDetectResult, CalibrationState, Point, Rect } from "../types";

type AxisMode = "x" | "y";
type InteractionMode = "axis" | "calibration" | "curve";
type CalibStage = "X1" | "X2" | "Y1" | "Y2" | "done";

type Props = {
  roi?: ImageData;
  axisRoiX?: Rect;
  axisRoiY?: Rect;
  axisMode: AxisMode;
  onCommitAxisRoi: (mode: AxisMode, rect: Rect) => void;
  autoDetect?: AutoDetectResult;
  interactionMode: InteractionMode;
  calibStage: CalibStage;
  calibPoints: CalibrationState;
  onClickRoiPoint: (p: Point) => void;
  seedPoints: Point[];
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

function drawPoint(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

export default function RoiWorkCanvas(props: Props) {
  const {
    roi,
    axisRoiX,
    axisRoiY,
    axisMode,
    onCommitAxisRoi,
    autoDetect,
    interactionMode,
    calibStage,
    calibPoints,
    onClickRoiPoint,
    seedPoints,
  } = props;

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

      if (!roi) {
        ctx.fillStyle = "rgba(233,238,246,0.75)";
        ctx.font = "13px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
        ctx.fillText("Select Plot ROI first (Step 2).", 12, 22);
        ctx.restore();
        return;
      }

      const vp = getViewport(cw, ch, roi.width, roi.height);

      // draw ROI image
      const imgCanvas = document.createElement("canvas");
      imgCanvas.width = roi.width;
      imgCanvas.height = roi.height;
      const ictx = imgCanvas.getContext("2d");
      if (ictx) {
        ictx.putImageData(roi, 0, 0);
        ctx.drawImage(imgCanvas, vp.ox, vp.oy, vp.dw, vp.dh);
      }

      const toCanvas = (p: { x: number; y: number }) => ({
        x: vp.ox + p.x * vp.scale,
        y: vp.oy + p.y * vp.scale,
      });

      // Axis ROI rectangles
      if (axisRoiX) {
        ctx.strokeStyle = "rgba(0,180,255,0.9)";
        ctx.lineWidth = 2;
        ctx.strokeRect(
          vp.ox + axisRoiX.x * vp.scale,
          vp.oy + axisRoiX.y * vp.scale,
          axisRoiX.w * vp.scale,
          axisRoiX.h * vp.scale
        );
      }
      if (axisRoiY) {
        ctx.strokeStyle = "rgba(255,180,0,0.9)";
        ctx.lineWidth = 2;
        ctx.strokeRect(
          vp.ox + axisRoiY.x * vp.scale,
          vp.oy + axisRoiY.y * vp.scale,
          axisRoiY.w * vp.scale,
          axisRoiY.h * vp.scale
        );
      }

      // dragging rectangle when selecting axis ROI
      if (drag.dragging && interactionMode === "axis") {
        const x = Math.min(drag.x0, drag.x1);
        const y = Math.min(drag.y0, drag.y1);
        const w2 = Math.abs(drag.x1 - drag.x0);
        const h2 = Math.abs(drag.y1 - drag.y0);

        ctx.strokeStyle = axisMode === "x" ? "rgba(0,180,255,0.9)" : "rgba(255,180,0,0.9)";
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(x, y, w2, h2);
        ctx.setLineDash([]);
      }

      // Auto detect overlay
      if (autoDetect) {
        // axis lines
        ctx.strokeStyle = "rgba(255,255,255,0.65)";
        ctx.lineWidth = 1.5;

        ctx.beginPath();
        ctx.moveTo(vp.ox, vp.oy + autoDetect.xAxisLine.p.y * vp.scale);
        ctx.lineTo(vp.ox + vp.dw, vp.oy + autoDetect.xAxisLine.p.y * vp.scale);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(vp.ox + autoDetect.yAxisLine.p.x * vp.scale, vp.oy);
        ctx.lineTo(vp.ox + autoDetect.yAxisLine.p.x * vp.scale, vp.oy + vp.dh);
        ctx.stroke();

        // ticks
        ctx.fillStyle = "rgba(0,255,255,0.9)";
        for (const p of autoDetect.tickPointsX) {
          const c = toCanvas(p);
          drawPoint(ctx, c.x, c.y, 3.5);
        }
        ctx.fillStyle = "rgba(255,255,0,0.9)";
        for (const p of autoDetect.tickPointsY) {
          const c = toCanvas(p);
          drawPoint(ctx, c.x, c.y, 3.5);
        }
      }

      // Calibration picks
      const label = (txt: string, p: Point, color: string) => {
        const c = toCanvas(p);
        ctx.fillStyle = color;
        drawPoint(ctx, c.x, c.y, 5);
        ctx.font = "12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
        ctx.fillText(txt, c.x + 6, c.y - 6);
      };

      if (calibPoints.pxX1) label("X1", calibPoints.pxX1, "rgba(0,255,180,0.95)");
      if (calibPoints.pxX2) label("X2", calibPoints.pxX2, "rgba(0,255,180,0.95)");
      if (calibPoints.pxY1) label("Y1", calibPoints.pxY1, "rgba(0,255,180,0.95)");
      if (calibPoints.pxY2) label("Y2", calibPoints.pxY2, "rgba(0,255,180,0.95)");

      // Seeds
      if (seedPoints.length > 0) {
        ctx.fillStyle = "rgba(255,0,200,0.9)";
        for (let i = 0; i < seedPoints.length; i++) {
          const s = seedPoints[i];
          const c = toCanvas(s);
          drawPoint(ctx, c.x, c.y, 5);
          ctx.font = "12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
          ctx.fillText(`S${i + 1}`, c.x + 6, c.y - 6);
        }
      }

      // UI hint
      ctx.fillStyle = "rgba(233,238,246,0.75)";
      ctx.font = "12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
      if (interactionMode === "axis") {
        ctx.fillText(`Drag to set ${axisMode.toUpperCase()} Axis ROI`, 12, 18);
      } else if (interactionMode === "calibration") {
        ctx.fillText(`Click tick candidates in order: ${calibStage}`, 12, 18);
      } else {
        ctx.fillText(`Click curve 3 times to pick seeds`, 12, 18);
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
  }, [roi, axisRoiX, axisRoiY, axisMode, autoDetect, interactionMode, calibStage, calibPoints, seedPoints, drag]);

  function canvasToRoi(e: ReactMouseEvent<HTMLCanvasElement>, cw: number, ch: number) {
    if (!roi) return null;
    const vp = getViewport(cw, ch, roi.width, roi.height);
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;

    const rx = (cx - vp.ox) / vp.scale;
    const ry = (cy - vp.oy) / vp.scale;
    return { rx, ry, vp, cx, cy };
  }

  function onDown(e: ReactMouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas || !roi) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    if (interactionMode !== "axis") return;

    const cw = parent.clientWidth;
    const ch = parent.clientHeight;

    const t = canvasToRoi(e, cw, ch);
    if (!t) return;

    if (t.rx < 0 || t.ry < 0 || t.rx > roi.width || t.ry > roi.height) return;
    setDrag({ dragging: true, x0: t.cx, y0: t.cy, x1: t.cx, y1: t.cy });
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

  function onUp(e: ReactMouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas || !roi) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    const cw = parent.clientWidth;
    const ch = parent.clientHeight;

    if (interactionMode === "axis" && drag.dragging) {
      const vp = getViewport(cw, ch, roi.width, roi.height);

      const x0 = Math.min(drag.x0, drag.x1);
      const y0 = Math.min(drag.y0, drag.y1);
      const x1 = Math.max(drag.x0, drag.x1);
      const y1 = Math.max(drag.y0, drag.y1);

      const rx0 = clamp((x0 - vp.ox) / vp.scale, 0, roi.width);
      const ry0 = clamp((y0 - vp.oy) / vp.scale, 0, roi.height);
      const rx1 = clamp((x1 - vp.ox) / vp.scale, 0, roi.width);
      const ry1 = clamp((y1 - vp.oy) / vp.scale, 0, roi.height);

      const rectRoi = { x: rx0, y: ry0, w: rx1 - rx0, h: ry1 - ry0 };
      if (rectRoi.w >= 2 && rectRoi.h >= 2) onCommitAxisRoi(axisMode, rectRoi);

      setDrag((d) => ({ ...d, dragging: false }));
      return;
    }

    // Click mode: calibration / curve
    const t = canvasToRoi(e, cw, ch);
    if (!t) return;
    if (t.rx < 0 || t.ry < 0 || t.rx > roi.width || t.ry > roi.height) return;

    if (interactionMode !== "axis") {
      onClickRoiPoint({ x: t.rx, y: t.ry });
    }
  }

  return (
    <canvas
      ref={canvasRef}
      className="canvas"
      onMouseDown={onDown}
      onMouseMove={onMove}
      onMouseUp={onUp}
      onMouseLeave={onUp}
    />
  );
}
