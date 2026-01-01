
export interface FeaturePoint {
  x: number;
  y: number;
  vx: number; // velocity x
  vy: number; // velocity y
  score: number;
  id: number;
  age: number;
}

export interface RawBlob {
  x: number;
  y: number;
  w: number;
  h: number;
  area: number;
  pointCount: number;
}

/**
 * Advanced Feature-Based Computer Vision Engine
 * Implements Sparse Optical Flow and Corner Detection.
 * 1. Corner Detection: Identifies high-gradient pixels (Shi-Tomasi / Harris style).
 * 2. Optical Flow: Patch-based matching (SAD) to find displacement.
 * 3. Clustering: Groups points with similar motion vectors.
 */
export class CVEngine {
  private width: number;
  private height: number;
  private prevGray: Uint8ClampedArray | null = null;
  private activeFeatures: FeaturePoint[] = [];
  private nextFeatureId = 0;
  private patchSize = 7; // Size of the template patch
  private searchWindow = 15; // Search area for motion

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  public process(frameData: Uint8ClampedArray, threshold: number): { blobs: RawBlob[], features: FeaturePoint[] } {
    const gray = this.toGrayscale(frameData);
    
    if (!this.prevGray) {
      this.prevGray = gray;
      this.detectNewFeatures(gray, threshold);
      return { blobs: [], features: this.activeFeatures };
    }

    // 1. Track existing features using Sparse Optical Flow (SAD matching)
    const trackedFeatures: FeaturePoint[] = [];
    for (const f of this.activeFeatures) {
      const match = this.findMatch(f, this.prevGray, gray);
      if (match) {
        trackedFeatures.push({
          ...f,
          x: match.nx,
          y: match.ny,
          vx: match.nx - f.x,
          vy: match.ny - f.y,
          age: f.age + 1
        });
      }
    }

    // 2. Replenish lost features
    this.activeFeatures = trackedFeatures;
    if (this.activeFeatures.length < 50) {
      this.detectNewFeatures(gray, threshold);
    }

    // 3. Cluster moving features into blobs
    const blobs = this.clusterFeatures();

    this.prevGray = gray;
    return { blobs, features: this.activeFeatures };
  }

  private toGrayscale(data: Uint8ClampedArray): Uint8ClampedArray {
    const gray = new Uint8ClampedArray(this.width * this.height);
    for (let i = 0; i < gray.length; i++) {
      gray[i] = (data[i * 4] * 0.299 + data[i * 4 + 1] * 0.587 + data[i * 4 + 2] * 0.114);
    }
    return gray;
  }

  /**
   * Simple Corner Detector: Finds pixels with high local variance in gradients
   */
  private detectNewFeatures(gray: Uint8ClampedArray, threshold: number) {
    const stride = 15; // Grid spacing for new features
    for (let y = stride; y < this.height - stride; y += stride) {
      for (let x = stride; x < this.width - stride; x += stride) {
        if (this.activeFeatures.length >= 200) return;

        // Check if area is already tracked
        if (this.activeFeatures.some(f => Math.abs(f.x - x) < 10 && Math.abs(f.y - y) < 10)) continue;

        // Simple corner response: Sum of squared differences with neighbors
        const idx = y * this.width + x;
        let score = 0;
        const p = gray[idx];
        score += Math.abs(p - gray[idx - 1]);
        score += Math.abs(p - gray[idx + 1]);
        score += Math.abs(p - gray[idx - this.width]);
        score += Math.abs(p - gray[idx + this.width]);

        if (score > threshold * 2) {
          this.activeFeatures.push({
            x, y, vx: 0, vy: 0, score, id: this.nextFeatureId++, age: 0
          });
        }
      }
    }
  }

  /**
   * Patch matching using Sum of Absolute Differences (SAD)
   */
  private findMatch(f: FeaturePoint, prev: Uint8ClampedArray, curr: Uint8ClampedArray) {
    let bestSAD = Infinity;
    let bestX = f.x;
    let bestY = f.y;
    const halfP = Math.floor(this.patchSize / 2);
    const halfS = Math.floor(this.searchWindow / 2);

    for (let dy = -halfS; dy <= halfS; dy++) {
      for (let dx = -halfS; dx <= halfS; dx++) {
        const nx = f.x + dx;
        const ny = f.y + dy;

        if (nx < halfP || nx >= this.width - halfP || ny < halfP || ny >= this.height - halfP) continue;

        let sad = 0;
        for (let py = -halfP; py <= halfP; py++) {
          for (let px = -halfP; px <= halfP; px++) {
            const pVal = prev[(f.y + py) * this.width + (f.x + px)];
            const cVal = curr[(ny + py) * this.width + (nx + px)];
            sad += Math.abs(pVal - cVal);
          }
        }

        if (sad < bestSAD) {
          bestSAD = sad;
          bestX = nx;
          bestY = ny;
        }
      }
    }

    // Only accept if movement is clear and match is good
    if (bestSAD < 5000) {
      return { nx: bestX, ny: bestY };
    }
    return null;
  }

  private clusterFeatures(): RawBlob[] {
    const moving = this.activeFeatures.filter(f => (Math.abs(f.vx) + Math.abs(f.vy)) > 0.2);
    const blobs: RawBlob[] = [];
    const visited = new Set<number>();

    for (const f of moving) {
      if (visited.has(f.id)) continue;

      let minX = f.x, maxX = f.x, minY = f.y, maxY = f.y;
      const group = [f];
      visited.add(f.id);

      // Simple proximity and velocity grouping
      for (const other of moving) {
        if (visited.has(other.id)) continue;
        const dist = Math.sqrt(Math.pow(f.x - other.x, 2) + Math.pow(f.y - other.y, 2));
        const vDist = Math.sqrt(Math.pow(f.vx - other.vx, 2) + Math.pow(f.vy - other.vy, 2));

        if (dist < 60 && vDist < 2) {
          group.push(other);
          visited.add(other.id);
          minX = Math.min(minX, other.x);
          maxX = Math.max(maxX, other.x);
          minY = Math.min(minY, other.y);
          maxY = Math.max(maxY, other.y);
        }
      }

      if (group.length >= 3) {
        blobs.push({
          x: minX - 10,
          y: minY - 10,
          w: (maxX - minX) + 20,
          h: (maxY - minY) + 20,
          area: (maxX - minX) * (maxY - minY),
          pointCount: group.length
        });
      }
    }

    return blobs;
  }

  public reset() {
    this.prevGray = null;
    this.activeFeatures = [];
    this.nextFeatureId = 0;
  }
}
