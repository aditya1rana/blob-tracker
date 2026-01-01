
import { BlobPoint, TrackingParams, Trajectory } from '../types';

/**
 * Advanced Blob Tracking Engine (Client-side POC)
 * Simulates sophisticated computer vision pipeline.
 */
export class BlobTracker {
  private trajectories: Map<number, Trajectory> = new Map();
  private nextId = 0;
  private colors = [
    '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', 
    '#ec4899', '#06b6d4', '#f97316', '#a855f7', '#14b8a6'
  ];

  constructor() {}

  /**
   * Simple ID persistence tracking using Euclidean distance.
   * In a real system, this would use Kalman Filter or SORT.
   */
  public update(currentBlobs: Partial<BlobPoint>[], timestamp: number, params: TrackingParams): Trajectory[] {
    const matchedIds = new Set<number>();
    const newTrajectories: Trajectory[] = [];

    currentBlobs.forEach((blob) => {
      let bestMatch: Trajectory | null = null;
      let minDistance = Infinity;

      this.trajectories.forEach((traj) => {
        if (traj.active && !matchedIds.has(traj.id)) {
          const lastPoint = traj.points[traj.points.length - 1];
          const dist = Math.sqrt(
            Math.pow(blob.x! - lastPoint.x, 2) + Math.pow(blob.y! - lastPoint.y, 2)
          );

          if (dist < params.persistence * 50 && dist < minDistance) {
            minDistance = dist;
            bestMatch = traj;
          }
        }
      });

      if (bestMatch) {
        (bestMatch as Trajectory).points.push({ x: blob.x!, y: blob.y!, timestamp });
        if ((bestMatch as Trajectory).points.length > 50) (bestMatch as Trajectory).points.shift();
        matchedIds.add((bestMatch as Trajectory).id);
      } else {
        const id = this.nextId++;
        const newTraj: Trajectory = {
          id,
          points: [{ x: blob.x!, y: blob.y!, timestamp }],
          active: true,
          color: this.colors[id % this.colors.length]
        };
        this.trajectories.set(id, newTraj);
        matchedIds.add(id);
      }
    });

    // Deactivate old trajectories
    this.trajectories.forEach((traj) => {
      if (!matchedIds.has(traj.id)) {
        traj.active = false;
      }
    });

    return Array.from(this.trajectories.values());
  }

  public reset() {
    this.trajectories.clear();
    this.nextId = 0;
  }
}
