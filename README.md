# Spectra Digitizer

A web-based React + TypeScript tool that turns plotted spectra/curves in images into downloadable, calibrated data. The flow below mirrors the in-app steps.

## Quick Flow

```
Upload image
   ↓
Select Plot ROI (crop plot region)
   ↓
Select X/Y Axis ROIs → Auto Detect axes & ticks
   ↓
Enter real axis values (x1, x2, y1, y2) → Build calibration
   ↓
Pick 3 seeds on the curve → Auto trace
   ↓
Review chart → Download CSV
```

## Detailed Workflow

### 1) Upload
- **Action:** Upload a `png` or `jpeg` file of the plot.
- **Result:** Image loads and state resets (ROIs, calibration, seeds).

### 2) Plot ROI (Region of Interest)
- **Action:** Drag a rectangle over the plot area in the **Original Image** panel.
- **Result:** The cropped ROI becomes the working image for all later steps.
- **Tip:** Re-selecting the plot ROI clears axis ROIs, auto-detect results, calibration picks, and seeds.

### 3) Axis ROIs
- **Action:** Choose **Select X Axis ROI** (or **Y Axis ROI**) and drag a rectangle that tightly covers each axis line plus ticks.
- **Result:** Saved rectangles for X and Y axes, used for auto-detection.
- **Requirement:** Both X and Y axis ROIs must be set before auto-detect.

### 4) Auto Detect Axes & Ticks
- **Action:** Click **Auto Detect** (enabled once both axis ROIs exist).
- **Result:** The app finds X/Y axis lines and tick candidates within the selected ROIs.
- **What’s detected:** Axis lines, X tick points, Y tick points.
- **Note:** Any previous calibration or seeds are cleared when auto-detect runs.

### 5) Calibration Inputs (numeric)
- **Fields:** `x1`, `x2`, `y1`, `y2` — the real-world values that correspond to picked ticks.
- **Reverse X:** Checkbox to flip X ordering when mapping pixels to data (useful for plots with decreasing X).
- **Editing:** Changing values clears computed calibration and traced points (to avoid stale results).

### 6) Pick Calibration Ticks (guided order)
- **Prerequisite:** Auto-detect is complete.
- **Mode:** Switch to **Pick Calibration** if needed.
- **Click order:** X1 → X2 → Y1 → Y2 (prompts advance automatically).
- **Snapping:** Each click snaps to the nearest detected tick within a small radius.
- **Clear:** **Clear Calib Picks** resets tick selections and computed calibration.

### 7) Build Calibration
- **Action:** Click **Build Calibration** (enabled when X1/X2/Y1/Y2 and x1/x2/y1/y2 are all set).
- **Result:** Computes pixel→data mapping for both axes and builds a blacklist to ignore axis lines/ticks during tracing.
- **After build:** Seeds and traced points reset to ensure tracing uses the new calibration.

### 8) Curve Seeds & Auto Trace
- **Prerequisites:** Calibration ready, ROI available, and auto-detect present.
- **Action:** Click **Pick Seeds**, then click **three distinct points on the target curve** within the ROI.
- **Result:** On the third seed, the app:
  - Samples the curve color around the seeds.
  - Traces the curve pixels (respecting the blacklist) using the current settings.
  - Maps traced pixels to calibrated (x, y) data and sorts them.
- **Clear Seeds:** Removes seeds and traced points so you can re-pick.

### 9) Trace Controls (refine without re-seeding)
- **Threshold (1–200):** Sensitivity for color matching; higher = stricter.
- **Mode:** `centerline` (default) or `median` for the traced path.
- **MaxJump:** Maximum pixel jump allowed between successive trace steps.
- **Retrace:** Re-run tracing with the current seeds and settings (no need to re-pick seeds).

### 10) Preview & Export
- **Data Preview Chart:** Shows the traced (x, y) pairs.
- **Download CSV:** Enabled when points exist. File name is derived from the uploaded image (e.g., `your-image.csv`).

## Behavior Notes
- Changing plot ROI, running auto-detect, clearing calibration, or changing numeric calibration inputs removes previously traced points to avoid stale data.
- Calibration and tracing expect three seeds exactly; fewer seeds will not trigger tracing.
- Reverse X only affects final data ordering (helpful when the original plot is mirrored).

## Scripts
- `npm run dev` — Start Vite dev server with HMR.
- `npm run build` — Type-check then build.
- `npm run lint` — ESLint all files.
- `npm run preview` — Preview the production build.
