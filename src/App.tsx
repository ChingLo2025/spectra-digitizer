import { useState } from "react";
import OriginalImageCanvas from "./components/OriginalImageCanvas";
import RoiWorkCanvas from "./components/RoiWorkCanvas";
import DataChartCanvas from "./components/DataChartCanvas";

import { initialState, type AppState, type Rect, type Point } from "./types";
import { loadImageBitmap, cropImageData } from "./lib/image";
import { detectAxesAndTicksTwoRois } from "./lib/detect";
import { buildPixelToDataMapper } from "./lib/calibration";
import { buildBlacklist } from "./lib/blacklist";
import { computeAverageColor, traceCurveWithSeeds, mapAndSort } from "./lib/curve";
import { toCsv, downloadText } from "./lib/export";

type AxisMode = "x" | "y";
type InteractionMode = "axis" | "calibration" | "curve";
type CalibStage = "X1" | "X2" | "Y1" | "Y2" | "done";
type Step = 1 | 2 | 3 | 4 | 5;

function dist2(a: Point, b: Point) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function nearestWithin(p: Point, pts: Point[], radius: number): Point | null {
  const r2 = radius * radius;
  let best: Point | null = null;
  let bestD = Infinity;
  for (const q of pts) {
    const d = dist2(p, q);
    if (d < bestD) {
      bestD = d;
      best = q;
    }
  }
  if (best && bestD <= r2) return best;
  return null;
}

export default function App() {
  const [state, setState] = useState<AppState>(initialState);

  const [error, setError] = useState<string | null>(null);

  const [axisMode, setAxisMode] = useState<AxisMode>("x");
  const [interactionMode, setInteractionMode] = useState<InteractionMode>("axis");
  const [calibStage, setCalibStage] = useState<CalibStage>("X1");
  const [step, setStep] = useState<Step>(1);

  const hasPlotRoi = !!state.roiImageData;
  const canAutoDetect = !!state.roiImageData && !!state.axisRoiX && !!state.axisRoiY;
  const hasAutoDetect = !!state.autoDetect;

  const canBuildCalibration =
    !!state.calibration.pxX1 &&
    !!state.calibration.pxX2 &&
    !!state.calibration.pxY1 &&
    !!state.calibration.pxY2 &&
    Number.isFinite(state.calibration.x1) &&
    Number.isFinite(state.calibration.x2) &&
    Number.isFinite(state.calibration.y1) &&
    Number.isFinite(state.calibration.y2);

  const calibrationReady = !!state.calibration.pixelToData;
  const canPickSeeds = calibrationReady && !!state.roiImageData && !!state.autoDetect;
  const seedTarget = state.curve.seedTarget;
  const seedsReady = state.curve.seeds.length === seedTarget && seedTarget >= 3;

  async function onUpload(file?: File) {
    setError(null);
    if (!file) return;

    try {
      const bitmap = await loadImageBitmap(file);
      state.image.bitmap?.close?.();

      setAxisMode("x");
      setInteractionMode("axis");
      setCalibStage("X1");
      setStep(2);

      setState({
        image: { file, bitmap, width: bitmap.width, height: bitmap.height },
        plotRoi: undefined,
        roiImageData: undefined,
        axisRoiX: undefined,
        axisRoiY: undefined,
        autoDetect: undefined,
        calibration: { reverseX: false },
        curve: { seeds: [], seedTarget: 3, threshold: 45, mode: "centerline", maxJump: 20 },
      });
    } catch (e: any) {
      setError(e?.message ?? "Failed to load image.");
    }
  }

  function onPlotRoiCommit(rect: Rect) {
    const bmp = state.image.bitmap;
    if (!bmp) return;

    try {
      const roiImageData = cropImageData(bmp, rect);

      setAxisMode("x");
      setInteractionMode("axis");
      setCalibStage("X1");
      setStep(3);

      setState((prev) => ({
        ...prev,
        plotRoi: rect,
        roiImageData,
        axisRoiX: undefined,
        axisRoiY: undefined,
        autoDetect: undefined,
        calibration: { ...prev.calibration, pxX1: undefined, pxX2: undefined, pxY1: undefined, pxY2: undefined, pixelToData: undefined, isBlacklistedPixel: undefined },
        curve: { ...prev.curve, seeds: [], pickedColor: undefined, points: undefined },
      }));
    } catch (e: any) {
      setError(e?.message ?? "Failed to crop ROI.");
    }
  }

  function onCommitAxisRoi(mode: AxisMode, rect: Rect) {
    setState((prev) => ({
      ...prev,
      autoDetect: undefined,
      axisRoiX: mode === "x" ? rect : prev.axisRoiX,
      axisRoiY: mode === "y" ? rect : prev.axisRoiY,
    }));
  }

  function onAutoDetect() {
    if (!state.roiImageData || !state.axisRoiX || !state.axisRoiY) return;
    setError(null);

    try {
      const result = detectAxesAndTicksTwoRois({
        roi: state.roiImageData,
        axisRoiX: state.axisRoiX,
        axisRoiY: state.axisRoiY,
      });

      setCalibStage("X1");
      setInteractionMode("calibration");

      setState((prev) => ({
        ...prev,
        autoDetect: result,
        calibration: {
          ...prev.calibration,
          // keep reverseX & numeric inputs if already entered
          pixelToData: undefined,
          isBlacklistedPixel: undefined,
          pxX1: undefined,
          pxX2: undefined,
          pxY1: undefined,
          pxY2: undefined,
        },
        curve: { ...prev.curve, seeds: [], pickedColor: undefined, points: undefined },
      }));
    } catch (e: any) {
      setError(e?.message ?? "Auto Detect failed.");
    }
  }

  function clearCalibrationPicks() {
    setCalibStage("X1");
    setState((prev) => ({
      ...prev,
      calibration: {
        ...prev.calibration,
        pxX1: undefined,
        pxX2: undefined,
        pxY1: undefined,
        pxY2: undefined,
        pixelToData: undefined,
        isBlacklistedPixel: undefined,
      },
      curve: { ...prev.curve, seeds: [], pickedColor: undefined, points: undefined },
    }));
  }

  function updateNumber(key: "x1" | "x2" | "y1" | "y2", v: string) {
    const n = v.trim() === "" ? undefined : Number(v);
    setState((prev) => ({
      ...prev,
      calibration: {
        ...prev.calibration,
        [key]: Number.isFinite(n as any) ? (n as number) : undefined,
        pixelToData: undefined,
        isBlacklistedPixel: undefined,
      },
      curve: { ...prev.curve, points: undefined },
    }));
  }

  function toggleReverseX(v: boolean) {
    setState((prev) => ({
      ...prev,
      calibration: { ...prev.calibration, reverseX: v },
      curve: { ...prev.curve, points: undefined },
    }));
  }

  function buildCalibration() {
    setError(null);
    if (!canBuildCalibration) return;

    try {
      const c = state.calibration;
      const mapper = buildPixelToDataMapper({
        pxX1: c.pxX1!,
        pxX2: c.pxX2!,
        pxY1: c.pxY1!,
        pxY2: c.pxY2!,
        x1: c.x1!,
        x2: c.x2!,
        y1: c.y1!,
        y2: c.y2!,
      });

      const blackFn = state.autoDetect
        ? buildBlacklist({
            xAxisLine: state.autoDetect.xAxisLine,
            yAxisLine: state.autoDetect.yAxisLine,
            tickPointsX: state.autoDetect.tickPointsX,
            tickPointsY: state.autoDetect.tickPointsY,
            axisBand: 4,
            tickRadius: 6,
          })
        : () => false;

      setState((prev) => ({
        ...prev,
        calibration: { ...prev.calibration, pixelToData: mapper, isBlacklistedPixel: blackFn },
        curve: { ...prev.curve, seeds: [], pickedColor: undefined, points: undefined },
      }));
    } catch (e: any) {
      setError(e?.message ?? "Failed to build calibration.");
    }
  }

  // Click handler (Step 4 or Step 5 depending on mode)
  function onClickRoiPoint(p: Point) {
    // Step 5: seeds
    if (interactionMode === "curve") {
      if (!state.roiImageData) return;
      if (!state.calibration.pixelToData) return;
      if (!state.calibration.isBlacklistedPixel) return;

      setState((prev) => {
        const curv = prev.curve;
        if (curv.seeds.length >= curv.seedTarget) return prev;

        const seeds = [...curv.seeds, p];

        if (seeds.length === curv.seedTarget) {
          const pickedColor = computeAverageColor(prev.roiImageData!, seeds);

          const pxPts = traceCurveWithSeeds({
            roi: prev.roiImageData!,
            seeds,
            pickedColor,
            threshold: curv.threshold,
            mode: curv.mode,
            maxJump: curv.maxJump,
            isBlacklistedPixel: prev.calibration.isBlacklistedPixel!,
          });

          const dataPts = mapAndSort(pxPts, prev.calibration.pixelToData!, prev.calibration.reverseX);

          return { ...prev, curve: { ...curv, seeds, pickedColor, points: dataPts } };
        }

        return { ...prev, curve: { ...curv, seeds, points: undefined } };
      });

      return;
    }

    // Step 4: calibration picking
    if (!state.autoDetect) return;

    const radius = 14;

    if (calibStage === "X1" || calibStage === "X2") {
      const picked = nearestWithin(p, state.autoDetect.tickPointsX, radius);
      if (!picked) return;

      setState((prev) => ({
        ...prev,
        calibration: {
          ...prev.calibration,
          pxX1: calibStage === "X1" ? picked : prev.calibration.pxX1,
          pxX2: calibStage === "X2" ? picked : prev.calibration.pxX2,
          pixelToData: undefined,
          isBlacklistedPixel: undefined,
        },
        curve: { ...prev.curve, points: undefined },
      }));
      setCalibStage(calibStage === "X1" ? "X2" : "Y1");
      return;
    }

    if (calibStage === "Y1" || calibStage === "Y2") {
      const picked = nearestWithin(p, state.autoDetect.tickPointsY, radius);
      if (!picked) return;

      setState((prev) => ({
        ...prev,
        calibration: {
          ...prev.calibration,
          pxY1: calibStage === "Y1" ? picked : prev.calibration.pxY1,
          pxY2: calibStage === "Y2" ? picked : prev.calibration.pxY2,
          pixelToData: undefined,
          isBlacklistedPixel: undefined,
        },
        curve: { ...prev.curve, points: undefined },
      }));
      setCalibStage(calibStage === "Y1" ? "Y2" : "done");
    }
  }

  function startPickSeeds() {
    if (!canPickSeeds) return;
    setInteractionMode("curve");
    setState((prev) => ({
      ...prev,
      curve: { ...prev.curve, seeds: [], pickedColor: undefined, points: undefined },
    }));
  }

  function clearSeeds() {
    setState((prev) => ({
      ...prev,
      curve: { ...prev.curve, seeds: [], pickedColor: undefined, points: undefined },
    }));
  }

  function retraceNow(next?: Partial<AppState["curve"]>) {
    if (!state.roiImageData) return;
    if (!state.calibration.pixelToData) return;
    if (!state.calibration.isBlacklistedPixel) return;

    const curv = { ...state.curve, ...(next ?? {}) };
    if (curv.seeds.length < 3 || !curv.pickedColor) return;

    try {
      const pxPts = traceCurveWithSeeds({
        roi: state.roiImageData,
        seeds: curv.seeds,
        pickedColor: curv.pickedColor,
        threshold: curv.threshold,
        mode: curv.mode,
        maxJump: curv.maxJump,
        isBlacklistedPixel: state.calibration.isBlacklistedPixel,
      });

      const dataPts = mapAndSort(pxPts, state.calibration.pixelToData, state.calibration.reverseX);

      setState((prev) => ({
        ...prev,
        curve: { ...prev.curve, ...curv, points: dataPts },
      }));
    } catch (e: any) {
      setError(e?.message ?? "Trace failed.");
    }
  }

  function setThreshold(v: number) {
    setState((prev) => ({ ...prev, curve: { ...prev.curve, threshold: v } }));
    retraceNow({ threshold: v });
  }

  function setMode(m: "centerline" | "median") {
    setState((prev) => ({ ...prev, curve: { ...prev.curve, mode: m } }));
    retraceNow({ mode: m });
  }

  function setMaxJump(v: number) {
    setState((prev) => ({ ...prev, curve: { ...prev.curve, maxJump: v } }));
    retraceNow({ maxJump: v });
  }

  function setSeedTarget(value: number) {
    const safe = Number.isFinite(value) ? Math.floor(value) : 3;
    const next = Math.max(3, Math.min(1000, safe));
    setState((prev) => ({
      ...prev,
      curve: { ...prev.curve, seedTarget: next, seeds: [], pickedColor: undefined, points: undefined },
    }));
    if (interactionMode === "curve") {
      setInteractionMode("curve");
    }
  }

  function goStep(nextStep: Step) {
    setStep(nextStep);
    if (nextStep === 3) {
      setInteractionMode("axis");
    }
    if (nextStep === 4) {
      setInteractionMode("calibration");
    }
    if (nextStep === 5) {
      setInteractionMode("curve");
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">SpectraDigitizer-new</div>
        <div className="upload">
          <input type="file" accept="image/png,image/jpeg" onChange={(e) => onUpload(e.target.files?.[0])} />
        </div>
      </header>

      {error && <div className="error">{error}</div>}

      <div className="stepper">
        <div className={`step ${step === 1 ? "active" : ""}`}>1. 上傳檔案</div>
        <div className={`step ${step === 2 ? "active" : ""}`}>2. 拉 ROI</div>
        <div className={`step ${step === 3 ? "active" : ""}`}>3. 拉 Axis-ROI</div>
        <div className={`step ${step === 4 ? "active" : ""}`}>4. Autodetect 與座標軸校正</div>
        <div className={`step ${step === 5 ? "active" : ""}`}>5. Pick seeds 與 Curve Extraction</div>
      </div>

      {step === 1 && (
        <div className="main single">
          <section className="panel">
            <div className="panelTitle">上傳檔案</div>
            <div className="panelBody">
              <div className="muted" style={{ padding: "8px 12px" }}>
                請使用右上角的「Choose File」上傳圖檔後開始。完成後會自動進入下一步。
              </div>
            </div>
          </section>
        </div>
      )}

      {step === 2 && (
        <div className="main single">
          <section className="panel">
            <div className="panelTitle">拉 ROI <span className="sub">(點一下開始、點第二下結束)</span></div>
            <div className="panelBody">
              <OriginalImageCanvas
                bitmap={state.image.bitmap}
                width={state.image.width}
                height={state.image.height}
                plotRoi={state.plotRoi}
                onPlotRoiCommit={onPlotRoiCommit}
              />
            </div>
            <div className="stepActions">
              <button className="btn" onClick={() => goStep(1)}>上一步</button>
              <button className="btn" disabled={!hasPlotRoi} onClick={() => goStep(3)}>下一步</button>
            </div>
          </section>
        </div>
      )}

      {step === 3 && (
        <div className="main single">
          <section className="panel">
            <div className="panelTitle">拉 Axis-ROI <span className="sub">(點一下開始、點第二下結束)</span></div>
            <div className="btnRow">
              <button className="btn" disabled={!hasPlotRoi} onClick={() => setAxisMode("x")}>
                Select X Axis ROI {axisMode === "x" ? <span className="pill">active</span> : null}
              </button>
              <button className="btn" disabled={!hasPlotRoi} onClick={() => setAxisMode("y")}>
                Select Y Axis ROI {axisMode === "y" ? <span className="pill">active</span> : null}
              </button>
            </div>
            <div className="panelBody">
              <RoiWorkCanvas
                roi={state.roiImageData}
                axisRoiX={state.axisRoiX}
                axisRoiY={state.axisRoiY}
                axisMode={axisMode}
                onCommitAxisRoi={onCommitAxisRoi}
                autoDetect={state.autoDetect}
                interactionMode="axis"
                calibStage={calibStage}
                calibPoints={state.calibration}
                onClickRoiPoint={onClickRoiPoint}
                seedPoints={state.curve.seeds}
                seedTarget={seedTarget}
              />
            </div>
            <div className="stepActions">
              <button className="btn" onClick={() => goStep(2)}>上一步</button>
              <button className="btn" disabled={!canAutoDetect} onClick={() => goStep(4)}>下一步</button>
            </div>
          </section>
        </div>
      )}

      {step === 4 && (
        <div className="main single">
          <section className="panel">
            <div className="panelTitle">Autodetect 與座標軸校正</div>
            <div className="btnRow">
              <button className="btn" disabled={!canAutoDetect} onClick={onAutoDetect}>Auto Detect</button>
              <button className="btn" disabled={!hasAutoDetect} onClick={clearCalibrationPicks}>清除校正點</button>
              <button className="btn" disabled={!canBuildCalibration} onClick={buildCalibration}>Build Calibration</button>
            </div>
            <div className="panelBody">
              <RoiWorkCanvas
                roi={state.roiImageData}
                axisRoiX={state.axisRoiX}
                axisRoiY={state.axisRoiY}
                axisMode={axisMode}
                onCommitAxisRoi={onCommitAxisRoi}
                autoDetect={state.autoDetect}
                interactionMode="calibration"
                calibStage={calibStage}
                calibPoints={state.calibration}
                onClickRoiPoint={onClickRoiPoint}
                seedPoints={state.curve.seeds}
                seedTarget={seedTarget}
              />
            </div>
            <div className="panelBody" style={{ paddingTop: 0 }}>
              <div className="muted" style={{ padding: "10px 12px" }}>
                依序點選 X1 → X2 → Y1 → Y2 後，按「Build Calibration」。
              </div>
              <div className="controlsGrid">
                <div className="field">
                  <label>x1</label>
                  <input type="number" value={state.calibration.x1 ?? ""} onChange={(e) => updateNumber("x1", e.target.value)} />
                </div>
                <div className="field">
                  <label>x2</label>
                  <input type="number" value={state.calibration.x2 ?? ""} onChange={(e) => updateNumber("x2", e.target.value)} />
                </div>
                <div className="field">
                  <label>y1</label>
                  <input type="number" value={state.calibration.y1 ?? ""} onChange={(e) => updateNumber("y1", e.target.value)} />
                </div>
                <div className="field">
                  <label>y2</label>
                  <input type="number" value={state.calibration.y2 ?? ""} onChange={(e) => updateNumber("y2", e.target.value)} />
                </div>
              </div>
              <div className="field" style={{ padding: "6px 12px" }}>
                <label style={{ width: 80 }}>Reverse X</label>
                <input type="checkbox" checked={state.calibration.reverseX} onChange={(e) => toggleReverseX(e.target.checked)} />
                <span className="muted" style={{ opacity: 0.8 }}>sort later</span>
              </div>
            </div>
            <div className="stepActions">
              <button className="btn" onClick={() => goStep(3)}>上一步</button>
              <button className="btn" disabled={!calibrationReady} onClick={() => goStep(5)}>下一步</button>
            </div>
          </section>
        </div>
      )}

      {step === 5 && (
        <div className="bottom">
          <section className="panel">
            <div className="panelTitle">Pick seeds 與 Curve Extraction</div>
            <div className="btnRow">
              <button className="btn" disabled={!canPickSeeds} onClick={startPickSeeds}>重新開始選 Seeds</button>
              <button className="btn" disabled={state.curve.seeds.length === 0} onClick={clearSeeds}>清除 Seeds</button>
            </div>
            <div className="panelBody">
              <RoiWorkCanvas
                roi={state.roiImageData}
                axisRoiX={state.axisRoiX}
                axisRoiY={state.axisRoiY}
                axisMode={axisMode}
                onCommitAxisRoi={onCommitAxisRoi}
                autoDetect={state.autoDetect}
                interactionMode="curve"
                calibStage={calibStage}
                calibPoints={state.calibration}
                onClickRoiPoint={onClickRoiPoint}
                seedPoints={state.curve.seeds}
                seedTarget={seedTarget}
              />
            </div>
            <div className="stepActions">
              <button className="btn" onClick={() => goStep(4)}>上一步</button>
            </div>
          </section>

          <section className="panel controlsPanel">
            <div className="panelTitle">
              控制台 {calibrationReady ? <span className="pill">calibrated</span> : null}{" "}
              {state.curve.points ? <span className="pill">traced</span> : null}
            </div>
            <div className="panelBody" style={{ overflow: "auto" }}>
              <div className="muted" style={{ padding: "8px 12px" }}>
                先選 Seeds（至少 3 個），完成後會自動抽取曲線。
              </div>

              <div className="field">
                <label style={{ width: 80 }}>Seed 數量</label>
                <input
                  type="number"
                  min={3}
                  max={1000}
                  value={seedTarget}
                  onChange={(e) => setSeedTarget(Number(e.target.value))}
                />
              </div>

              <div className="field">
                <label style={{ width: 80 }}>Threshold</label>
                <input
                  type="range"
                  min={1}
                  max={200}
                  value={state.curve.threshold}
                  onChange={(e) => setThreshold(Number(e.target.value))}
                  disabled={!seedsReady}
                />
                <span className="pill">{state.curve.threshold}</span>
              </div>

              <div className="field">
                <label style={{ width: 80 }}>Mode</label>
                <select value={state.curve.mode} onChange={(e) => setMode(e.target.value as any)} disabled={!seedsReady}>
                  <option value="centerline">centerline</option>
                  <option value="median">median</option>
                </select>
              </div>

              <div className="field">
                <label style={{ width: 80 }}>MaxJump</label>
                <input
                  type="number"
                  value={state.curve.maxJump}
                  onChange={(e) => setMaxJump(Number(e.target.value))}
                  disabled={!seedsReady}
                />
              </div>

              <div className="btnRow">
                <button className="btn" disabled={!seedsReady || !state.curve.pickedColor} onClick={() => retraceNow()}>
                  Retrace
                </button>
                <button
                  className="btn"
                  disabled={!state.curve.points || state.curve.points.length === 0}
                  onClick={() => {
                    const pts = state.curve.points ?? [];
                    const csv = toCsv(pts);
                    const base = state.image.file?.name?.replace(/\.[^.]+$/, "") || "spectra_digitized";
                    downloadText(`${base}.csv`, csv, "text/csv;charset=utf-8");
                  }}
                >
                  Download CSV
                </button>
              </div>

              <div className="muted" style={{ padding: "0 12px 12px 12px" }}>
                Seeds: {state.curve.seeds.length}/{seedTarget} {seedsReady ? "✅" : "❌"}<br />
                PickedColor: {state.curve.pickedColor ? `rgb(${state.curve.pickedColor.r},${state.curve.pickedColor.g},${state.curve.pickedColor.b})` : "—"}<br />
                Points: {state.curve.points ? state.curve.points.length : 0}
              </div>

              <div className="panel subPanel">
                <div className="panelTitle">Data Preview Chart</div>
                <div className="panelBody" style={{ padding: 0 }}>
                  <div style={{ height: 220 }}>
                    <DataChartCanvas points={state.curve.points} />
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
