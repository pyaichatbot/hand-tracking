import { useEffect, useRef } from 'react';
import { useHandTrackingStore } from '../store/handTrackingStore';
import { classifyGesture } from '../utils/gestures';
import { distance3d } from '../utils/distance';
import { GestureType, type Hand, type Vector3D } from '../types';

const PINCH_HOLD_MS = 400;  // Hold pinch for 400ms to trigger hologram — prevents accidental activation
const HOLOGRAM_IDLE_TIMEOUT_MS = 1500;
const INTERACTION_RADIUS = 0.32;

function getHandAnchor(hand: Hand): Vector3D {
  const palm = hand.landmarks[9] ?? hand.landmarks[0];
  return {
    x: palm.x,
    y: palm.y,
    z: palm.z,
  };
}

export function useInteraction() {
  const hands = useHandTrackingStore((s) => s.hands);
  const mode = useHandTrackingStore((s) => s.mode);
  const updateInteraction = useHandTrackingStore((s) => s.updateInteraction);
  const updateVisuals = useHandTrackingStore((s) => s.updateVisuals);

  const pinchStartedAtRef = useRef<number | null>(null);
  const hologramActiveRef = useRef(false);
  const lastHandsSeenAtRef = useRef(0);
  const fistStartedAtRef = useRef<number | null>(null);

  useEffect(() => {
    const now = performance.now();
    const faceAnchor = { x: 0.5, y: 0.42, z: 0 };
    const trackingLive = mode === 'running' || mode === 'degraded';

    if (!trackingLive) {
      pinchStartedAtRef.current = null;
      hologramActiveRef.current = false;
      updateInteraction({
        proximityToSphere: 0,
        gestureType: GestureType.NONE,
        handsInFrame: 0,
        isInteracting: false,
        effectMode: 'face-scan',
        pinchProgress: 0,
        hologramIntensity: 0,
        anchor: faceAnchor,
      });
      updateVisuals({
        sphereGlowIntensity: 0,
        sphereScale: 1,
        gridOpacity: 0.72,
      });
      return;
    }

    const anchors = hands.map(getHandAnchor);
    const midpoint =
      anchors.length === 2
        ? {
            x: (anchors[0].x + anchors[1].x) / 2,
            y: (anchors[0].y + anchors[1].y) / 2,
            z: (anchors[0].z + anchors[1].z) / 2,
          }
        : anchors[0] ?? faceAnchor;

    const gestureResults = hands.map((hand) => classifyGesture(hand));
    const hasPinch = gestureResults.some((gesture) => gesture.type === GestureType.PINCH);
    const hasOpenHand = gestureResults.some((gesture) => gesture.type === GestureType.OPEN_HAND);
    const hasFist = gestureResults.some((gesture) => gesture.type === GestureType.FIST);
    const handSpread =
      anchors.length >= 2 ? distance3d(anchors[0], anchors[1]) : 0.2;

    // Use pinch midpoint (thumb+index tips) as anchor when pinching — much more accurate
    const pinchingHandIdx = gestureResults.findIndex((g) => g.type === GestureType.PINCH);
    const pinchMidpoint: Vector3D | null = pinchingHandIdx >= 0 ? (() => {
      const ph = hands[pinchingHandIdx];
      return {
        x: (ph.landmarks[4].x + ph.landmarks[8].x) / 2,
        y: (ph.landmarks[4].y + ph.landmarks[8].y) / 2,
        z: (ph.landmarks[4].z + ph.landmarks[8].z) / 2,
      };
    })() : null;

    if (hands.length > 0) {
      lastHandsSeenAtRef.current = now;
    }

    // Fist gesture to dismiss hologram
    if (hologramActiveRef.current && hasFist) {
      if (fistStartedAtRef.current === null) fistStartedAtRef.current = now;
      if (now - fistStartedAtRef.current > 700) {
        hologramActiveRef.current = false;
        fistStartedAtRef.current = null;
      }
    } else {
      fistStartedAtRef.current = null;
    }

    if (hasPinch) {
      if (pinchStartedAtRef.current === null) pinchStartedAtRef.current = now;
      const holdMs = now - pinchStartedAtRef.current;
      if (holdMs >= PINCH_HOLD_MS) {
        hologramActiveRef.current = true;
      }
    } else {
      pinchStartedAtRef.current = null;
    }

    if (
      hologramActiveRef.current &&
      hands.length === 0 &&
      now - lastHandsSeenAtRef.current > HOLOGRAM_IDLE_TIMEOUT_MS
    ) {
      hologramActiveRef.current = false;
    }

    const pinchProgress = pinchStartedAtRef.current
      ? Math.min((now - pinchStartedAtRef.current) / PINCH_HOLD_MS, 1)
      : 0;
    const hologramActive = hologramActiveRef.current;
    const hologramIntensity = hologramActive
      ? Math.min(1, 0.7 + (hasPinch ? 0.25 : 0) + (hasOpenHand ? 0.08 : 0))
      : pinchProgress * 0.35;

    // When pinching: anchor is exact pinch midpoint; otherwise: midpoint of palms
    const activeAnchor = (hologramActive && pinchMidpoint) ? pinchMidpoint : midpoint;
    const proximityAnchor = hologramActive ? activeAnchor : faceAnchor;
    const proximity = 1 - Math.min(distance3d(midpoint, proximityAnchor) / INTERACTION_RADIUS, 1);
    const gestureType =
      gestureResults.find((gesture) => gesture.type !== GestureType.NONE)?.type ??
      GestureType.NONE;
    const scaleFromHands = hologramActive
      ? 0.9 + Math.max(0, Math.min((handSpread - 0.16) * 2.6, 0.85))
      : 0.82 + pinchProgress * 0.12;

    updateInteraction({
      proximityToSphere: proximity,
      gestureType,
      handsInFrame: hands.length,
      isInteracting: hologramActive,
      effectMode: hologramActive ? 'hologram' : 'face-scan',
      pinchProgress,
      hologramIntensity,
      anchor: activeAnchor,
    });

    updateVisuals({
      sphereGlowIntensity: hologramActive ? 1.25 + hologramIntensity * 1.8 : 0.28 + pinchProgress * 0.3,
      sphereScale: scaleFromHands,
      gridOpacity: hologramActive ? 0.2 : 0.72,
    });
  }, [hands, mode, updateInteraction, updateVisuals]);
}
