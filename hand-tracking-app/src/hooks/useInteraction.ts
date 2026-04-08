import { useEffect, useRef } from 'react';
import html2canvas from 'html2canvas';
import { useHandTrackingStore } from '../store/handTrackingStore';
import { classifyGesture } from '../utils/gestures';
import { distance3d } from '../utils/distance';
import { GestureType, type Hand, type Vector3D } from '../types';

const PINCH_HOLD_MS = 240;  // Faster launch response while still filtering accidental pinches
const OPEN_HAND_LAUNCH_MS = 300;
const FIST_CLOSE_MS = 360;
const HOLOGRAM_IDLE_TIMEOUT_MS = 1200;
const INTERACTION_RADIUS = 0.32;
const SCREENSHOT_HOLD_MS = 140;
const SCREENSHOT_COOLDOWN_MS = 1600;

function dist2d(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function isPhotoSnapPose(hand: Hand): boolean {
  const lm = hand.landmarks;
  if (lm.length < 21) return false;
  const palmWidth = dist2d(lm[5], lm[17]);
  if (!Number.isFinite(palmWidth) || palmWidth < 0.04) return false;

  const thumbPinkyClose = dist2d(lm[4], lm[20]) / palmWidth < 0.55;
  if (!thumbPinkyClose) return false;

  // Keep the other fingertips away from the thumb so this does not overlap with fire-cluster pose.
  const thumbIndex = dist2d(lm[4], lm[8]) / palmWidth;
  const thumbMiddle = dist2d(lm[4], lm[12]) / palmWidth;
  const thumbRing = dist2d(lm[4], lm[16]) / palmWidth;
  return thumbIndex > 0.85 && thumbMiddle > 0.92 && thumbRing > 0.90;
}

function areAllFingertipsClustered(hand: Hand): boolean {
  const lm = hand.landmarks;
  if (lm.length < 21) return false;
  const palmWidth = dist2d(lm[5], lm[17]);
  if (!Number.isFinite(palmWidth) || palmWidth < 0.04) return false;
  const tips = [4, 8, 12, 16, 20];
  for (let i = 0; i < tips.length; i++) {
    for (let j = i + 1; j < tips.length; j++) {
      const d = dist2d(lm[tips[i]], lm[tips[j]]) / palmWidth;
      if (d > 0.72) return false;
    }
  }
  return true;
}

function isWebShootPose(hand: Hand): boolean {
  const lm = hand.landmarks;
  if (lm.length < 21) return false;
  const wrist = lm[0];
  const palmWidth = dist2d(lm[5], lm[17]);
  if (!Number.isFinite(palmWidth) || palmWidth < 0.04) return false;

  const tipFromWrist = (idx: number) => dist2d(wrist, lm[idx]) / palmWidth;
  const indexOpen = tipFromWrist(8) > 1.72;
  const pinkyOpen = tipFromWrist(20) > 1.60;
  const middleClosed = tipFromWrist(12) < 1.42;
  const ringClosed = tipFromWrist(16) < 1.45;

  return indexOpen && pinkyOpen && middleClosed && ringClosed;
}

async function captureStageScreenshot(): Promise<void> {
  const stage = document.getElementById('app-stage');
  if (!stage) {
    window.dispatchEvent(new CustomEvent('holo:screenshot', { detail: { ok: false, reason: 'missing-stage' } }));
    return;
  }

  try {
    const stageWidth = Math.max(1, Math.round(stage.clientWidth));
    const stageHeight = Math.max(1, Math.round(stage.clientHeight));
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    const out = document.createElement('canvas');
    out.width = Math.round(stageWidth * scale);
    out.height = Math.round(stageHeight * scale);
    const ctx = out.getContext('2d');
    if (!ctx) {
      window.dispatchEvent(new CustomEvent('holo:screenshot', { detail: { ok: false, reason: 'no-context' } }));
      return;
    }

    ctx.scale(scale, scale);

    const video = stage.querySelector('video') as HTMLVideoElement | null;
    if (video && video.videoWidth > 0 && video.videoHeight > 0 && video.readyState >= 2) {
      const srcW = video.videoWidth;
      const srcH = video.videoHeight;
      const srcAspect = srcW / srcH;
      const dstAspect = stageWidth / stageHeight;

      let sx = 0;
      let sy = 0;
      let sw = srcW;
      let sh = srcH;

      if (srcAspect > dstAspect) {
        sw = srcH * dstAspect;
        sx = (srcW - sw) / 2;
      } else {
        sh = srcW / dstAspect;
        sy = (srcH - sh) / 2;
      }

      // Match the mirrored camera presentation in the app.
      ctx.save();
      ctx.translate(stageWidth, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, stageWidth, stageHeight);
      ctx.restore();
    } else {
      ctx.fillStyle = '#03100d';
      ctx.fillRect(0, 0, stageWidth, stageHeight);
    }

    const canvases = Array.from(stage.querySelectorAll('canvas')) as HTMLCanvasElement[];
    for (const layer of canvases) {
      if (layer.width <= 0 || layer.height <= 0) continue;

      const style = window.getComputedStyle(layer);
      const parentStyle = layer.parentElement ? window.getComputedStyle(layer.parentElement) : null;
      const blend = style.mixBlendMode !== 'normal'
        ? style.mixBlendMode
        : (parentStyle?.mixBlendMode && parentStyle.mixBlendMode !== 'normal' ? parentStyle.mixBlendMode : 'source-over');
      const opacity = Number.parseFloat(style.opacity || '1');

      ctx.save();
      ctx.globalCompositeOperation = blend as GlobalCompositeOperation;
      ctx.globalAlpha = Number.isFinite(opacity) ? Math.max(0, Math.min(opacity, 1)) : 1;
      ctx.drawImage(layer, 0, 0, stageWidth, stageHeight);
      ctx.restore();
    }

    const hud = stage.querySelector('.z-30.pointer-events-none') as HTMLElement | null;
    if (hud) {
      const hudCanvas = await html2canvas(hud, {
        backgroundColor: null,
        useCORS: true,
        logging: false,
        scale,
      });
      ctx.drawImage(hudCanvas, 0, 0, stageWidth, stageHeight);
    }

    out.toBlob((blob) => {
      if (!blob) {
        window.dispatchEvent(new CustomEvent('holo:screenshot', { detail: { ok: false, reason: 'blob-null' } }));
        return;
      }

      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = `holo-snap-${stamp}.png`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 5000);

      window.dispatchEvent(new CustomEvent('holo:screenshot', { detail: { ok: true, fileName } }));
    }, 'image/png');
  } catch {
    window.dispatchEvent(new CustomEvent('holo:screenshot', { detail: { ok: false, reason: 'capture-failed' } }));
  }
}

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
  const openHandsStartedAtRef = useRef<number | null>(null);
  const hologramActiveRef = useRef(false);
  const lastHandsSeenAtRef = useRef(0);
  const fistStartedAtRef = useRef<number | null>(null);
  const screenshotStartedAtRef = useRef<number | null>(null);
  const screenshotArmedRef = useRef(false);
  const lastScreenshotAtRef = useRef(0);

  useEffect(() => {
    const now = performance.now();
    const faceAnchor = { x: 0.5, y: 0.42, z: 0 };
    const trackingLive = mode === 'running' || mode === 'degraded';

    if (!trackingLive) {
      pinchStartedAtRef.current = null;
      openHandsStartedAtRef.current = null;
      hologramActiveRef.current = false;
      screenshotStartedAtRef.current = null;
      screenshotArmedRef.current = false;
      updateInteraction({
        proximityToSphere: 0,
        gestureType: GestureType.NONE,
        handsInFrame: 0,
        isInteracting: false,
        effectMode: 'face-scan',
        pinchProgress: 0,
        hologramIntensity: 0,
        anchor: faceAnchor,
        powerMode: 'none',
        powerHand: null,
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
    const openHandCount = gestureResults.filter((gesture) => gesture.type === GestureType.OPEN_HAND).length;
    const hasOpenHand = gestureResults.some((gesture) => gesture.type === GestureType.OPEN_HAND);
    const hasFist = gestureResults.some((gesture) => gesture.type === GestureType.FIST);
    const hasTwoOpenHands = openHandCount >= 2;
    const fireHand = hands.find((hand) => areAllFingertipsClustered(hand));
    const webHand = hands.find((hand) => isWebShootPose(hand));
    const hasPowerGesture = Boolean(fireHand || webHand);
    const hasScreenshotGesture = !hasPowerGesture && hands.some((hand) => isPhotoSnapPose(hand));
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
      if (now - fistStartedAtRef.current > FIST_CLOSE_MS) {
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

    if (hasScreenshotGesture) {
      if (screenshotStartedAtRef.current === null) screenshotStartedAtRef.current = now;
      const heldLongEnough = now - screenshotStartedAtRef.current >= SCREENSHOT_HOLD_MS;
      const cooldownReady = now - lastScreenshotAtRef.current >= SCREENSHOT_COOLDOWN_MS;
      if (heldLongEnough && cooldownReady && !screenshotArmedRef.current) {
        screenshotArmedRef.current = true;
        lastScreenshotAtRef.current = now;
        void captureStageScreenshot();
      }
    } else {
      screenshotStartedAtRef.current = null;
      screenshotArmedRef.current = false;
    }

    // Alternative launch path: both hands fully open for a short hold.
    if (!hologramActiveRef.current && hasTwoOpenHands) {
      if (openHandsStartedAtRef.current === null) openHandsStartedAtRef.current = now;
      if (now - openHandsStartedAtRef.current >= OPEN_HAND_LAUNCH_MS) {
        hologramActiveRef.current = true;
      }
    } else if (!hasTwoOpenHands) {
      openHandsStartedAtRef.current = null;
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
    const openHandsProgress = openHandsStartedAtRef.current
      ? Math.min((now - openHandsStartedAtRef.current) / OPEN_HAND_LAUNCH_MS, 1)
      : 0;
    const launchProgress = Math.max(pinchProgress, openHandsProgress);
    const hologramActive = hologramActiveRef.current;
    const hologramIntensity = hologramActive
      ? Math.min(1, 0.7 + (hasPinch ? 0.25 : 0) + (hasOpenHand ? 0.08 : 0))
      : launchProgress * 0.35;

    // When pinching: anchor is exact pinch midpoint; otherwise: midpoint of palms
    const activeAnchor = (hologramActive && pinchMidpoint) ? pinchMidpoint : midpoint;
    const proximityAnchor = hologramActive ? activeAnchor : faceAnchor;
    const proximity = 1 - Math.min(distance3d(midpoint, proximityAnchor) / INTERACTION_RADIUS, 1);
    const gestureType =
      gestureResults.find((gesture) => gesture.type !== GestureType.NONE)?.type ??
      GestureType.NONE;
    const scaleFromHands = hologramActive
      ? 0.9 + Math.max(0, Math.min((handSpread - 0.16) * 2.6, 0.85))
      : 0.82 + launchProgress * 0.12;

    updateInteraction({
      proximityToSphere: proximity,
      gestureType,
      handsInFrame: hands.length,
      isInteracting: hologramActive,
      effectMode: hologramActive ? 'hologram' : 'face-scan',
      pinchProgress: launchProgress,
      hologramIntensity,
      anchor: activeAnchor,
      powerMode: fireHand ? 'fire' : (webHand ? 'web' : 'none'),
      powerHand: fireHand?.handedness ?? webHand?.handedness ?? null,
    });

    updateVisuals({
      sphereGlowIntensity: hologramActive ? 1.25 + hologramIntensity * 1.8 : 0.28 + launchProgress * 0.3,
      sphereScale: scaleFromHands,
      gridOpacity: hologramActive ? 0.2 : 0.72,
    });
  }, [hands, mode, updateInteraction, updateVisuals]);
}
