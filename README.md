# Spectra Digitizer

Digitize plotted spectra or curves from an image: select regions of interest (ROIs), auto-detect axes and ticks, calibrate pixel coordinates to real data, trace the curve with seed points, and export the sampled points as CSV.

## Quick start

1. Install dependencies: `npm install`
2. Run the dev server: `npm run dev`
3. Open the app, then follow the workflow below.

## Workflow at a glance

```
Upload image
  ↓
Draw Plot ROI
  ↓
Draw X axis ROI  →  Draw Y axis ROI
          ↓
     Auto Detect axes & ticks
          ↓
Enter calibration numbers & click ticks (X1 → X2 → Y1 → Y2)
          ↓
       Build Calibration
          ↓
Pick Seeds S1–S3 → adjust Threshold / Mode / MaxJump → Retrace
          ↓
   Preview chart & Download CSV
```

## Detailed steps & controls

1. **Upload an image**
   - Supported types: PNG or JPEG.
   - Uploading resets the session state (clears ROIs, calibration, and curve points).
   - File name is reused as the CSV base name when exporting.

2. **Plot ROI**
   - Drag a rectangle on the *Original Image* canvas to isolate the plot area.
   - Committing a new ROI clears prior axis picks, calibration, and curve seeds.

3. **Axis ROIs**
   - Switch to **Select X Axis ROI** or **Select Y Axis ROI**, then drag rectangles on the *ROI Image* canvas around each axis line plus ticks.
   - Both X and Y axis ROIs must be set before auto detection.

4. **Auto Detect axes and ticks**
   - Click **Auto Detect** to locate axis lines and tick candidates inside the ROIs.
   - If successful, the app switches to calibration mode and resets prior tick picks and curve seeds.

5. **Calibration picks & numeric inputs**
   - Numeric fields: **x1, x2, y1, y2** — enter the real-world values that correspond to the picked ticks.
   - **Reverse X** checkbox: keep pixel order but flip X when mapping to data values.
   - In the *ROI Image* canvas (calibration mode), click ticks in order: **X1 → X2 → Y1 → Y2**. The app snaps to the nearest detected tick within a small radius.
   - Clear picks anytime with **Clear Calib Picks**.

6. **Build Calibration**
   - Enabled only when all four tick picks and all four numeric values are present.
   - Computes a pixel-to-data mapper and a blacklist that masks axes/ticks so curve tracing ignores them.
   - After building, the app is marked **calibrated** and seeds/points reset.

7. **Curve extraction**
   - Click **Pick Seeds** to enter curve mode, then click exactly three seed points (S1–S3) along the target curve.
   - The app measures the averaged color of the seeds, traces connected pixels with that color profile, and converts pixel coordinates to sorted data points (X sorting respects **Reverse X**).
   - Controls (enabled after 3 seeds and color pick):
     - **Threshold** (1–200): sensitivity to color similarity; lower is stricter.
     - **Mode**: `centerline` (follow thin center) or `median` (median across thickness).
     - **MaxJump**: maximum allowed pixel gap between traced steps to continue the curve.
   - Use **Retrace** after adjusting controls to recompute points with the latest settings.
   - **Clear Seeds** removes seed points and traced data.

8. **Preview & export**
   - The *Data Preview Chart* renders traced data points immediately.
   - **Download CSV** exports the current points as `<image-name>.csv` (or `spectra_digitized.csv` if unnamed).

## Keyboard/mouse basics

- Drawing ROIs and picking points are mouse-driven.
- No keyboard shortcuts are required; all actions are button- or click-based.

## Troubleshooting tips

- **Auto Detect failed**: verify both axis ROIs tightly enclose the axes and ticks; retry after adjusting ROI sizes.
- **Cannot Build Calibration**: ensure all four numeric values and all four tick picks are set.
- **Tracing stops early**: try increasing **Threshold** or **MaxJump**; if it wanders off-curve, decrease them.
- **Reversed X data**: toggle **Reverse X** and retrace or rebuild to flip ordering during mapping.
