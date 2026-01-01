
export interface BlobPoint {
  x: number;
  y: number;
  id: number;
  width: number;
  height: number;
  timestamp: number;
}

export interface Trajectory {
  id: number;
  points: { x: number; y: number; timestamp: number }[];
  active: boolean;
  color: string;
}

export interface TrackingParams {
  threshold: number;
  minArea: number;
  maxArea: number;
  persistence: number; // frames to keep ID if lost
  blur: number;
  showBoxes: boolean;
  showCentroids: boolean;
  showTrajectories: boolean;
}

export interface ProcessingStats {
  frameCount: number;
  processedCount: number;
  fps: number;
  blobsCount: number;
  elapsedTime: number;
}

export interface TimeSeriesData {
  timestamp: number;
  count: number;
}
