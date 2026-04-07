import type { Vector3D } from '../types';

export function distance3d(p1: Vector3D, p2: Vector3D): number {
  return Math.sqrt(
    (p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2 + (p1.z - p2.z) ** 2,
  );
}

export function lerp3d(a: Vector3D, b: Vector3D, t: number): Vector3D {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  };
}

/** Convert normalized [0,1] hand coordinate to Three.js clip space [-1,1] */
export function normalizedToClip(x: number, y: number): { cx: number; cy: number } {
  return {
    cx: (x - 0.5) * 2,
    cy: -(y - 0.5) * 2,
  };
}
