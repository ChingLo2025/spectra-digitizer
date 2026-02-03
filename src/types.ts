export type Point = { x: number; y: number }; // ROI coords unless stated
export type Rect = { x: number; y: number; w: number; h: number };

export type Line = { p: Point; v: { x: number; y: number } }; // point + direction (unit)

export type AutoDetectResult = {
  xAxisLine: Line;
  yAxisLine: Line;
  tickPointsX: Point[];
  tickPointsY: Point[];
};

export type CalibrationState = {
  pxX1?: Point;
  pxX2?: Point;
  pxY1?: Point;
  pxY2?: Point;
  x1?: number;
  x2?: number;
  y1?: number;
  y2?: number;
  reverseX: boolean;
  pixelToData?: (p: Point) => { X: number; Y: number };
  isBlacklistedPixel?: (p: Point) => boolean;
};

export type CurveState = {
  seeds: Point[]; // len >= 0
  seedTarget: number;
  pickedColor?: { r: number; g: number; b: number };
  threshold: number;
  mode: "centerline" | "median";
  maxJump: number;
  points?: Array<{ X: number; Y: number }>;
};

export type AppState = {
  image: {
    file?: File;
    bitmap?: ImageBitmap;
    width: number;
    height: number;
  };

  plotRoi?: Rect;           // original image coords
  roiImageData?: ImageData; // cropped Plot ROI (ROI coords space)

  axisRoiX?: Rect; // ROI coords
  axisRoiY?: Rect; // ROI coords

  autoDetect?: AutoDetectResult;

  calibration: CalibrationState;
  curve: CurveState;
};

export const initialState: AppState = {
  image: { width: 0, height: 0 },
  calibration: { reverseX: false },
  curve: { seeds: [], seedTarget: 3, threshold: 45, mode: "centerline", maxJump: 20 },
};
