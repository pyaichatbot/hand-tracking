import type { Hand } from '../types';
import { GestureType } from '../types';
import type { GestureResult } from '../types';
import { distance3d } from './distance';

const PINCH_THRESHOLD = 0.03;
const OPEN_THRESHOLD = 0.08;

function detectPinch(hand: Hand): boolean {
  const thumb = hand.landmarks[4];
  const index = hand.landmarks[8];
  const dist = distance3d(thumb, index);
  return dist < PINCH_THRESHOLD && thumb.confidence * index.confidence > 0.49;
}

function detectOpenHand(hand: Hand): boolean {
  const thumbTip = hand.landmarks[4];
  const pinkyTip = hand.landmarks[20];
  return distance3d(thumbTip, pinkyTip) > OPEN_THRESHOLD;
}

function detectPoint(hand: Hand): boolean {
  const indexDist = distance3d(hand.landmarks[6], hand.landmarks[8]);
  const middleDist = distance3d(hand.landmarks[10], hand.landmarks[12]);
  const ringDist = distance3d(hand.landmarks[14], hand.landmarks[16]);
  return indexDist > Math.min(middleDist, ringDist) * 1.2;
}

export function classifyGesture(hand: Hand): GestureResult {
  const base = hand.confidence;

  if (detectPinch(hand)) {
    return { type: GestureType.PINCH, confidence: base, duration: 0 };
  }
  if (detectOpenHand(hand)) {
    return { type: GestureType.OPEN_HAND, confidence: base, duration: 0 };
  }
  if (detectPoint(hand)) {
    return { type: GestureType.POINT, confidence: base, duration: 0 };
  }
  return { type: GestureType.NONE, confidence: 0, duration: 0 };
}
