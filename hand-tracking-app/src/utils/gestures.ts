import type { Hand } from '../types';
import { GestureType } from '../types';
import type { GestureResult } from '../types';

// Use 2D-only distance for pinch — Z from MediaPipe is unreliable
function dist2d(lm1: { x: number; y: number }, lm2: { x: number; y: number }): number {
  return Math.sqrt((lm1.x - lm2.x) ** 2 + (lm1.y - lm2.y) ** 2);
}

// Hysteresis state keyed by handedness ('Left'|'Right') — hand objects are recreated each frame
// so WeakMap would lose state. Plain Map with stable string keys is correct here.
const pinchActive = new Map<string, boolean>();

function detectPinch(hand: Hand): boolean {
  const thumb = hand.landmarks[4];
  const index = hand.landmarks[8];
  const d = dist2d(thumb, index);
  const wasActive = pinchActive.get(hand.handedness) ?? false;
  const threshold = wasActive ? 0.075 : 0.05; // hysteresis: enter at 0.05, release at 0.075
  const active = d < threshold;
  pinchActive.set(hand.handedness, active);
  return active;
}

function detectFist(hand: Hand): boolean {
  // All fingertips curl close to the wrist — closed fist
  const wrist = hand.landmarks[0];
  const tips = [4, 8, 12, 16, 20];
  const avgTipDist = tips.reduce((s, i) => s + dist2d(wrist, hand.landmarks[i]), 0) / tips.length;
  return avgTipDist < 0.14;
}

function detectOpenHand(hand: Hand): boolean {
  // All 4 finger tips spread from wrist
  const wrist = hand.landmarks[0];
  const tips = [4, 8, 12, 16, 20];
  const avgTipDist = tips.reduce((s, i) => s + dist2d(wrist, hand.landmarks[i]), 0) / tips.length;
  return avgTipDist > 0.25;
}

function detectPoint(hand: Hand): boolean {
  const indexDist = dist2d(hand.landmarks[5], hand.landmarks[8]);
  const middleDist = dist2d(hand.landmarks[9], hand.landmarks[12]);
  const ringDist   = dist2d(hand.landmarks[13], hand.landmarks[16]);
  return indexDist > Math.min(middleDist, ringDist) * 1.3;
}

export function classifyGesture(hand: Hand): GestureResult {
  const base = hand.confidence;
  if (detectPinch(hand)) return { type: GestureType.PINCH, confidence: base, duration: 0 };
  if (detectFist(hand)) return { type: GestureType.FIST, confidence: base, duration: 0 };
  if (detectOpenHand(hand)) return { type: GestureType.OPEN_HAND, confidence: base, duration: 0 };
  if (detectPoint(hand)) return { type: GestureType.POINT, confidence: base, duration: 0 };
  return { type: GestureType.NONE, confidence: 0, duration: 0 };
}
