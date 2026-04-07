import type { Vector3D } from '../types';

export class ExponentialSmoothingFilter {
  private alpha: number;
  private smoothedValue: Vector3D | null = null;

  constructor(alpha: number = 0.4) {
    this.alpha = alpha;
  }

  filter(rawValue: Vector3D): Vector3D {
    if (!this.smoothedValue) {
      this.smoothedValue = { ...rawValue };
      return this.smoothedValue;
    }

    this.smoothedValue = {
      x: this.alpha * rawValue.x + (1 - this.alpha) * this.smoothedValue.x,
      y: this.alpha * rawValue.y + (1 - this.alpha) * this.smoothedValue.y,
      z: this.alpha * rawValue.z + (1 - this.alpha) * this.smoothedValue.z,
    };

    return { ...this.smoothedValue };
  }

  reset() {
    this.smoothedValue = null;
  }
}

export class KalmanFilter {
  private q: number;
  private r: number;
  private x: Vector3D;
  private p: number;
  private k: number;

  constructor(q: number = 0.1, r: number = 0.5) {
    this.q = q;
    this.r = r;
    this.x = { x: 0, y: 0, z: 0 };
    this.p = 1;
    this.k = 0;
  }

  filter(measurement: Vector3D): Vector3D {
    this.p = this.p + this.q;
    this.k = this.p / (this.p + this.r);
    this.x.x += this.k * (measurement.x - this.x.x);
    this.x.y += this.k * (measurement.y - this.x.y);
    this.x.z += this.k * (measurement.z - this.x.z);
    this.p = (1 - this.k) * this.p;
    return { ...this.x };
  }
}
