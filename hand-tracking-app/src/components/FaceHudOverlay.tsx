import { useEffect, useRef, type MutableRefObject } from 'react';
import { useHandTrackingStore } from '../store/handTrackingStore';
import type { Hand } from '../types';

interface FaceHudOverlayProps {
  videoRef: MutableRefObject<HTMLVideoElement | null>;
}

// Per-finger segment color: [lineColor, tipColor]
const FINGER_STYLE: Record<number, { line: string; tip: string }> = {
  0: { line: 'rgba(0,220,255,0.9)',   tip: 'rgba(0,240,255,1)'   }, // wrist → cyan
  1: { line: 'rgba(0,220,255,0.9)',   tip: 'rgba(0,240,255,1)'   }, // thumb
  2: { line: 'rgba(0,220,255,0.9)',   tip: 'rgba(0,240,255,1)'   },
  3: { line: 'rgba(0,220,255,0.9)',   tip: 'rgba(0,240,255,1)'   },
  4: { line: 'rgba(0,220,255,0.9)',   tip: 'rgba(120,255,230,1)' }, // thumb tip
  5: { line: 'rgba(0,255,136,0.9)',   tip: 'rgba(0,255,136,1)'   }, // index
  6: { line: 'rgba(0,255,136,0.9)',   tip: 'rgba(0,255,136,1)'   },
  7: { line: 'rgba(0,255,136,0.9)',   tip: 'rgba(0,255,136,1)'   },
  8: { line: 'rgba(0,255,136,0.9)',   tip: 'rgba(160,255,190,1)' }, // index tip
  9: { line: 'rgba(255,255,255,0.8)', tip: 'rgba(255,255,255,1)' }, // middle
  10:{ line: 'rgba(255,255,255,0.8)', tip: 'rgba(255,255,255,1)' },
  11:{ line: 'rgba(255,255,255,0.8)', tip: 'rgba(255,255,255,1)' },
  12:{ line: 'rgba(255,255,255,0.8)', tip: 'rgba(230,255,245,1)' }, // middle tip
  13:{ line: 'rgba(185,80,255,0.9)',  tip: 'rgba(185,80,255,1)'  }, // ring
  14:{ line: 'rgba(185,80,255,0.9)',  tip: 'rgba(185,80,255,1)'  },
  15:{ line: 'rgba(185,80,255,0.9)',  tip: 'rgba(185,80,255,1)'  },
  16:{ line: 'rgba(185,80,255,0.9)',  tip: 'rgba(210,140,255,1)' }, // ring tip
  17:{ line: 'rgba(255,60,200,0.9)',  tip: 'rgba(255,60,200,1)'  }, // pinky
  18:{ line: 'rgba(255,60,200,0.9)',  tip: 'rgba(255,60,200,1)'  },
  19:{ line: 'rgba(255,60,200,0.9)',  tip: 'rgba(255,60,200,1)'  },
  20:{ line: 'rgba(255,60,200,0.9)',  tip: 'rgba(255,160,230,1)' }, // pinky tip
};

// Finger connection groups → use the base landmark's color
const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],         // thumb
  [0, 5], [5, 6], [6, 7], [7, 8],         // index
  [0, 9], [9, 10], [10, 11], [11, 12],    // middle
  [0, 13], [13, 14], [14, 15], [15, 16],  // ring
  [0, 17], [17, 18], [18, 19], [19, 20],  // pinky
  [5, 9], [9, 13], [13, 17],              // palm
];

const PALM_COLOR = 'rgba(0,255,180,0.55)';
const TIPS = new Set([4, 8, 12, 16, 20]);

function dist2d(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function isHandFullyOpen(hand: Hand): boolean {
  const lm = hand.landmarks;
  const wrist = lm[0];
  if (!wrist || lm.length < 21) return false;

  // Normalize thresholds by palm width so this works across different camera distances.
  const palmWidth = dist2d(lm[5], lm[17]);
  if (!Number.isFinite(palmWidth) || palmWidth < 0.05) return false;

  const longFingers: [number, number, number][] = [
    [8, 7, 5],
    [12, 11, 9],
    [16, 15, 13],
    [20, 19, 17],
  ];
  const longFingersExtended = longFingers.every(([tipIdx, pipIdx, mcpIdx]) => {
    const tipDist = dist2d(wrist, lm[tipIdx]);
    const pipDist = dist2d(wrist, lm[pipIdx]);
    const mcpDist = dist2d(wrist, lm[mcpIdx]);
    return tipDist > mcpDist * 1.18 && tipDist > pipDist * 1.10;
  });
  if (!longFingersExtended) return false;

  // Thumb often has more orientation variance, so use a gentler extension rule.
  const thumbOpen = dist2d(wrist, lm[4]) > dist2d(wrist, lm[2]) * 1.08;
  if (!thumbOpen) return false;

  const avgTipDist = [4, 8, 12, 16, 20].reduce((sum, idx) => sum + dist2d(wrist, lm[idx]), 0) / 5;
  if (avgTipDist / palmWidth < 1.9) return false;

  const adjacentTipPairs: [number, number][] = [[4, 8], [8, 12], [12, 16], [16, 20]];
  const minAdjSpread = Math.min(...adjacentTipPairs.map(([a, b]) => dist2d(lm[a], lm[b])));
  return minAdjSpread / palmWidth > 0.28;
}

function getOpenBridgeIndices(hand: Hand): Set<number> {
  const lm = hand.landmarks;
  const wrist = lm[0];
  if (!wrist || lm.length < 21) return new Set<number>();

  const open = new Set<number>();
  const palmWidth = dist2d(lm[5], lm[17]);
  if (!Number.isFinite(palmWidth) || palmWidth < 0.05) return open;

  const fingerChains: Array<{ chain: number[]; mcp: number; pip: number; tip: number; ratio: number }> = [
    { chain: [1, 2, 3, 4], mcp: 2, pip: 3, tip: 4, ratio: 1.08 },   // thumb
    { chain: [5, 6, 7, 8], mcp: 5, pip: 7, tip: 8, ratio: 1.18 },   // index
    { chain: [9, 10, 11, 12], mcp: 9, pip: 11, tip: 12, ratio: 1.18 }, // middle
    { chain: [13, 14, 15, 16], mcp: 13, pip: 15, tip: 16, ratio: 1.16 }, // ring
    { chain: [17, 18, 19, 20], mcp: 17, pip: 19, tip: 20, ratio: 1.14 }, // pinky
  ];

  for (const f of fingerChains) {
    const tipDist = dist2d(wrist, lm[f.tip]);
    const pipDist = dist2d(wrist, lm[f.pip]);
    const mcpDist = dist2d(wrist, lm[f.mcp]);
    const longEnough = tipDist > mcpDist * f.ratio && tipDist > pipDist * 1.08;
    const spreadEnough = tipDist / palmWidth > (f.tip === 4 ? 1.35 : 1.55);
    if (longEnough && spreadEnough) {
      f.chain.forEach((idx) => open.add(idx));
    }
  }

  if (isHandFullyOpen(hand)) {
    open.add(0);
  }

  return open;
}

function drawFirePower(
  ctx: CanvasRenderingContext2D,
  hand: Hand,
  width: number,
  height: number,
  time: number,
  motion: { vx: number; vy: number; speed: number } | null,
): void {
  const palm = hand.landmarks[9] ?? hand.landmarks[0];
  const px = width - palm.x * width;
  const py = palm.y * height;
  const palmPx = dist2d(
    { x: width - hand.landmarks[5].x * width, y: hand.landmarks[5].y * height },
    { x: width - hand.landmarks[17].x * width, y: hand.landmarks[17].y * height },
  );
  const baseR = Math.max(18, palmPx * 0.42);
  const speed = motion?.speed ?? 0;
  const moveBoost = Math.min(1, speed / 560);

  const driftX = -(motion?.vx ?? 0) * 0.018;
  const driftY = -1 - (motion?.vy ?? 0) * 0.012;
  const driftLen = Math.max(0.001, Math.sqrt(driftX * driftX + driftY * driftY));
  const fx = driftX / driftLen;
  const fy = driftY / driftLen;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  const aura = ctx.createRadialGradient(px, py, 0, px, py, baseR * (2.9 + moveBoost * 0.7));
  aura.addColorStop(0, 'rgba(255,255,210,0.96)');
  aura.addColorStop(0.18, 'rgba(255,196,90,0.86)');
  aura.addColorStop(0.45, 'rgba(255,120,18,0.58)');
  aura.addColorStop(0.8, 'rgba(255,44,0,0.26)');
  aura.addColorStop(1, 'rgba(255,20,0,0)');
  ctx.fillStyle = aura;
  ctx.beginPath();
  ctx.arc(px, py, baseR * (2.9 + moveBoost * 0.7), 0, Math.PI * 2);
  ctx.fill();

  // White-hot inner core near palm to increase realism.
  const core = ctx.createRadialGradient(px, py, 0, px, py, baseR * 0.75);
  core.addColorStop(0, 'rgba(255,255,245,0.98)');
  core.addColorStop(0.4, 'rgba(255,232,150,0.75)');
  core.addColorStop(1, 'rgba(255,180,40,0)');
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(px, py, baseR * 0.75, 0, Math.PI * 2);
  ctx.fill();

  const fingerTips = [4, 8, 12, 16, 20];
  for (let i = 0; i < fingerTips.length; i++) {
    const tip = hand.landmarks[fingerTips[i]];
    const tx = width - tip.x * width;
    const ty = tip.y * height;
    for (let k = 0; k < 3; k++) {
      const phase = time * (10.5 + k * 1.8) + i * 1.3 + k * 2.1;
      const flameLen = baseR * (1.45 + moveBoost * 1.15 + Math.sin(phase) * 0.22 + k * 0.16);
      const jitter = Math.sin(phase * 1.6) * baseR * (0.26 + k * 0.08);

      const ex = tx + fx * flameLen + jitter;
      const ey = ty + fy * flameLen + Math.cos(phase * 1.1) * baseR * 0.22;
      const cx = tx + fx * flameLen * 0.55 + jitter * 0.7;
      const cy = ty + fy * flameLen * 0.35;

      const grad = ctx.createLinearGradient(tx, ty, ex, ey);
      grad.addColorStop(0, 'rgba(255,255,220,0.92)');
      grad.addColorStop(0.25, 'rgba(255,198,80,0.9)');
      grad.addColorStop(0.6, 'rgba(255,110,14,0.6)');
      grad.addColorStop(1, 'rgba(255,20,0,0)');
      ctx.strokeStyle = grad;
      ctx.lineWidth = Math.max(2.2, baseR * (0.19 - k * 0.03));
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.quadraticCurveTo(cx, cy, ex, ey);
      ctx.stroke();
    }
  }

  // Embers pushed by flame direction and hand movement.
  const emberCount = 16;
  for (let i = 0; i < emberCount; i++) {
    const t = time * 1.9 + i * 0.47;
    const radial = baseR * (0.5 + (i % 5) * 0.18);
    const spawnX = px + Math.cos(t * 1.8 + i) * radial * 0.45;
    const spawnY = py + Math.sin(t * 1.6 + i) * radial * 0.26;
    const travel = baseR * (1.9 + (i % 4) * 0.35 + moveBoost * 1.1);
    const ex = spawnX + fx * travel + Math.sin(t * 2.5) * 5;
    const ey = spawnY + fy * travel + Math.cos(t * 2.2) * 4;
    const dotR = 1.2 + (i % 3) * 0.8;

    const eGrad = ctx.createLinearGradient(spawnX, spawnY, ex, ey);
    eGrad.addColorStop(0, 'rgba(255,255,220,0.85)');
    eGrad.addColorStop(0.5, 'rgba(255,180,65,0.55)');
    eGrad.addColorStop(1, 'rgba(255,50,0,0)');
    ctx.strokeStyle = eGrad;
    ctx.lineWidth = dotR;
    ctx.beginPath();
    ctx.moveTo(spawnX, spawnY);
    ctx.lineTo(ex, ey);
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,238,170,0.85)';
    ctx.beginPath();
    ctx.arc(spawnX, spawnY, dotR * 0.55, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawWebPower(
  ctx: CanvasRenderingContext2D,
  hand: Hand,
  width: number,
  height: number,
  time: number,
  motion: { vx: number; vy: number; speed: number } | null,
): void {
  const lm = hand.landmarks;
  const wrist = lm[0];
  const k5 = lm[5];
  const k9 = lm[9];
  const k13 = lm[13];
  const k17 = lm[17];

  // Emit from fist center (wrist + base knuckles), not from fingertip.
  const sx = (width - wrist.x * width + width - k5.x * width + width - k9.x * width + width - k13.x * width + width - k17.x * width) / 5;
  const sy = (wrist.y * height + k5.y * height + k9.y * height + k13.y * height + k17.y * height) / 5;

  // Base forward direction from wrist toward knuckle line center.
  const baseTargetX = (width - k5.x * width + width - k9.x * width + width - k13.x * width + width - k17.x * width) / 4;
  const baseTargetY = (k5.y * height + k9.y * height + k13.y * height + k17.y * height) / 4;
  let dirX = baseTargetX - (width - wrist.x * width);
  let dirY = baseTargetY - (wrist.y * height);

  // Blend in hand motion for responsive spray steering.
  if (motion) {
    dirX += motion.vx * 0.18;
    dirY += motion.vy * 0.18;
  }

  if (dirX * dirX + dirY * dirY < 0.001) {
    dirX = 0;
    dirY = -1;
  }

  const len = Math.max(1, Math.sqrt(dirX * dirX + dirY * dirY));
  const nx = dirX / len;
  const ny = dirY / len;
  const px = -ny;
  const py = nx;
  const speedBoost = Math.min((motion?.speed ?? 0) / 620, 1);
  const shootLen = 230 + speedBoost * 130 + Math.sin(time * 8) * 26;

  const palmSpan = dist2d(
    { x: width - k5.x * width, y: k5.y * height },
    { x: width - k17.x * width, y: k17.y * height },
  );
  const mouthR = Math.max(8, palmSpan * 0.18);

  const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, mouthR * 2.8);
  glow.addColorStop(0, 'rgba(235,252,255,0.85)');
  glow.addColorStop(0.5, 'rgba(165,232,255,0.35)');
  glow.addColorStop(1, 'rgba(140,220,255,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(sx, sy, mouthR * 2.8, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(220,250,255,0.96)';
  ctx.lineWidth = Math.max(2.8, mouthR * 0.28);
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(sx + nx * shootLen * 0.22, sy + ny * shootLen * 0.22);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(210,248,255,0.82)';
  ctx.lineWidth = 2.2;
  for (let i = -2; i <= 2; i++) {
    const spread = i * (mouthR * 0.9);
    ctx.beginPath();
    ctx.moveTo(sx + px * spread, sy + py * spread);
    ctx.quadraticCurveTo(
      sx + nx * (shootLen * 0.45) + px * spread * 1.8,
      sy + ny * (shootLen * 0.45) + py * spread * 1.8,
      sx + nx * shootLen + px * spread * 2.4,
      sy + ny * shootLen + py * spread * 2.4,
    );
    ctx.stroke();
  }

  for (let i = 0; i < 5; i++) {
    const t = (i + 1) / 6;
    const cx = sx + nx * shootLen * t;
    const cy = sy + ny * shootLen * t;
    const r = 8 + i * 3;
    ctx.strokeStyle = `rgba(215,250,255,${0.62 - i * 0.09})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(cx + px * r, cy + py * r);
    ctx.lineTo(cx - px * r, cy - py * r);
    ctx.stroke();
  }
}

// EMA smoother stored per hand×landmark key
type SmoothMap = Map<string, { x: number; y: number }>;
type MotionMap = Map<string, { x: number; y: number; vx: number; vy: number; t: number }>;

// Max pixel jump before resetting EMA — prevents stale wrong-hand state bleeding through
const JUMP_RESET_PX = 180;

function emaSmooth(map: SmoothMap, key: string, rawX: number, rawY: number, alpha: number): { x: number; y: number } {
  const prev = map.get(key);
  if (!prev) {
    const v = { x: rawX, y: rawY };
    map.set(key, v);
    return v;
  }
  // If the position jumped too far, the hand probably disappeared and reappeared — reset
  const dx = rawX - prev.x;
  const dy = rawY - prev.y;
  if (dx * dx + dy * dy > JUMP_RESET_PX * JUMP_RESET_PX) {
    prev.x = rawX;
    prev.y = rawY;
    return prev;
  }
  prev.x = alpha * rawX + (1 - alpha) * prev.x;
  prev.y = alpha * rawY + (1 - alpha) * prev.y;
  return prev;
}

function updateMotion(
  map: MotionMap,
  key: string,
  x: number,
  y: number,
  nowMs: number,
): { vx: number; vy: number; speed: number } {
  const prev = map.get(key);
  if (!prev) {
    map.set(key, { x, y, vx: 0, vy: 0, t: nowMs });
    return { vx: 0, vy: 0, speed: 0 };
  }

  const dt = Math.max((nowMs - prev.t) / 1000, 0.001);
  const rawVx = (x - prev.x) / dt;
  const rawVy = (y - prev.y) / dt;
  prev.vx = prev.vx * 0.45 + rawVx * 0.55;
  prev.vy = prev.vy * 0.45 + rawVy * 0.55;
  prev.x = x;
  prev.y = y;
  prev.t = nowMs;

  return {
    vx: prev.vx,
    vy: prev.vy,
    speed: Math.sqrt(prev.vx * prev.vx + prev.vy * prev.vy),
  };
}

export default function FaceHudOverlay({ videoRef }: FaceHudOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const smoothRef = useRef<SmoothMap>(new Map());
  const motionRef = useRef<MotionMap>(new Map());

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let frameId = 0;

    const draw = () => {
      frameId = requestAnimationFrame(draw);

      const video = videoRef.current;
      if (!video || video.readyState < 2) return;

      const width = video.videoWidth || canvas.clientWidth || 1280;
      const height = video.videoHeight || canvas.clientHeight || 720;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      const { hands, face, interaction } = useHandTrackingStore.getState();
      const nowMs = performance.now();
      const time = nowMs * 0.0018;
      const smooth = smoothRef.current;
      const motion = motionRef.current;
      const handMotion = new Map<string, { vx: number; vy: number; speed: number }>();

      // Evict smooth entries for hands that are no longer present
      const activeKeys = new Set(hands.flatMap((h) =>
        h.landmarks.map((_, i) => `${h.handedness}_${i}`)
      ));
      for (const key of smooth.keys()) {
        if (!activeKeys.has(key)) smooth.delete(key);
      }
      for (const key of motion.keys()) {
        if (!hands.some((h) => h.handedness === key)) motion.delete(key);
      }

      ctx.clearRect(0, 0, width, height);

      // Subtle face scan lines — light enough not to obscure the face
      if (face) {
        const box = face.boundingBox;
        const cx = width - (box.xMin + box.width * 0.5);
        const cy = box.yMin + box.height * 0.38;
        const bw = Math.max(box.width * 1.35, width * 0.20);
        const bh = Math.max(box.height * 1.25, height * 0.18);

        for (let i = -3; i <= 4; i++) {
          const offset = i * 12 + Math.sin(time * 1.2 + i * 0.7) * 3;
          const isBright = i === 0;
          ctx.strokeStyle = `rgba(107,255,179,${isBright ? 0.18 : 0.07})`;
          ctx.lineWidth = isBright ? 2 : 0.8;
          ctx.beginPath();
          ctx.moveTo(cx - bw * 0.6, cy + offset);
          ctx.lineTo(cx + bw * 0.6, cy + offset);
          ctx.stroke();
        }

        // Corner brackets only — no filled rectangle over face
        const bx = cx - bw * 0.52;
        const by = cy - box.height * 0.42;
        const bxr = cx + bw * 0.52;
        const byb = cy + box.height * 0.52;
        const arm = Math.min(bw, box.height) * 0.14;
        ctx.strokeStyle = 'rgba(107,255,179,0.45)';
        ctx.lineWidth = 1.8;
        const corners: [number, number, number, number, number, number][] = [
          [bx, by + arm, bx, by, bx + arm, by],
          [bxr - arm, by, bxr, by, bxr, by + arm],
          [bxr, byb - arm, bxr, byb, bxr - arm, byb],
          [bx + arm, byb, bx, byb, bx, byb - arm],
        ];
        corners.forEach(([x1, y1, x2, y2, x3, y3]) => {
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.lineTo(x3, y3);
          ctx.stroke();
        });

        // Face orbit arcs + dots to visually lock onto the face region.
        const ringR = Math.max(bw * 0.36, bh * 0.46);
        ctx.strokeStyle = 'rgba(120,255,210,0.26)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(cx, cy, ringR, Math.PI * 0.15, Math.PI * 0.88);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx, cy, ringR, Math.PI * 1.12, Math.PI * 1.86);
        ctx.stroke();

        const dots = 12;
        for (let i = 0; i < dots; i++) {
          const t = time * 1.35 + i * (Math.PI * 2 / dots);
          const r = ringR + Math.sin(time * 1.7 + i) * 2;
          const x = cx + Math.cos(t) * r;
          const y = cy + Math.sin(t) * (r * 0.62);
          const dotR = i % 3 === 0 ? 2.3 : 1.5;
          ctx.fillStyle = i % 2 === 0 ? 'rgba(132,255,217,0.95)' : 'rgba(185,255,240,0.7)';
          ctx.beginPath();
          ctx.arc(x, y, dotR, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Hand skeleton with per-finger colors and in-render EMA smoothing
      hands.forEach((hand) => {
        // Key by handedness so swapped ordering between frames doesn't corrupt smoothing
        const hKey = hand.handedness; // 'Left' | 'Right'
        const alpha = 0.65;
        const pts = hand.landmarks.map((lm, lIdx) => {
          const rawX = width - lm.x * width;
          const rawY = lm.y * height;
          return emaSmooth(smooth, `${hKey}_${lIdx}`, rawX, rawY, alpha);
        });
        handMotion.set(hKey, updateMotion(motion, hKey, pts[9].x, pts[9].y, nowMs));

        // Draw bones with per-finger color
        ctx.lineWidth = 2.2;
        ctx.shadowBlur = 0;
        for (const [a, b] of HAND_CONNECTIONS) {
          const isPalm = (a >= 5 && b >= 5 && a <= 17 && b <= 17) && [5,9,13,17].includes(a);
          const color = isPalm ? PALM_COLOR : (FINGER_STYLE[a]?.line ?? 'rgba(0,255,136,0.8)');
          ctx.strokeStyle = color;
          ctx.beginPath();
          ctx.moveTo(pts[a].x, pts[a].y);
          ctx.lineTo(pts[b].x, pts[b].y);
          ctx.stroke();
        }

        // Draw joints
        ctx.shadowBlur = 0;
        pts.forEach((pt, idx) => {
          const style = FINGER_STYLE[idx];
          const isTip = TIPS.has(idx);
          const r = isTip ? 6 : 3.8;

          // Soft outer glow (no shadowBlur for perf — just a radial gradient circle)
          const glowR = r * 3.5;
          const grad = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, glowR);
          const baseColor = style?.tip ?? 'rgba(0,255,136,1)';
          // Extract rgb from the rgba string for gradient
          const glowColor = baseColor.replace(/[\d.]+\)$/, '0.35)');
          const glowEdge  = baseColor.replace(/[\d.]+\)$/, '0)');
          grad.addColorStop(0, baseColor);
          grad.addColorStop(0.3, glowColor);
          grad.addColorStop(1, glowEdge);
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, glowR, 0, Math.PI * 2);
          ctx.fill();

          // Solid bright dot
          ctx.fillStyle = style?.tip ?? 'rgba(0,255,136,1)';
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
          ctx.fill();
        });
      });

      if (interaction.powerMode !== 'none' && interaction.powerHand) {
        const powerHand = hands.find((h) => h.handedness === interaction.powerHand) ?? null;
        if (powerHand) {
          if (interaction.powerMode === 'fire') {
            drawFirePower(ctx, powerHand, width, height, time, handMotion.get(powerHand.handedness) ?? null);
          } else if (interaction.powerMode === 'web') {
            drawWebPower(ctx, powerHand, width, height, time, handMotion.get(powerHand.handedness) ?? null);
          }
        }
      }

      // Inter-hand arcs — drawn per finger, only for fingers open on both hands
      // Connect corresponding landmark rows between left and right hands
      if (hands.length === 2) {
        const hA = hands[0];
        const hB = hands[1];
        const openA = getOpenBridgeIndices(hA);
        const openB = getOpenBridgeIndices(hB);

        // Which landmark indices to connect across: tips, PIPs, MCPs, base knuckles, wrist
        const BRIDGE_ROWS: { indices: number[]; color: string; width: number }[] = [
          { indices: [4, 8, 12, 16, 20],   color: 'rgba(0,255,120,0.90)', width: 2.2 }, // fingertips
          { indices: [3, 7, 11, 15, 19],   color: 'rgba(0,255,160,0.65)', width: 1.6 }, // DIP
          { indices: [2, 6, 10, 14, 18],   color: 'rgba(0,230,200,0.50)', width: 1.2 }, // PIP
          { indices: [1, 5,  9, 13, 17],   color: 'rgba(0,200,230,0.40)', width: 1.0 }, // MCP
          { indices: [0],                  color: 'rgba(0,180,255,0.30)', width: 1.0 }, // wrist
        ];

        for (const row of BRIDGE_ROWS) {
          for (const idx of row.indices) {
            if (!(openA.has(idx) && openB.has(idx))) continue;

            const pa = { x: width - hA.landmarks[idx].x * width, y: hA.landmarks[idx].y * height };
            const pb = { x: width - hB.landmarks[idx].x * width, y: hB.landmarks[idx].y * height };

            // Smooth these too
            const sa = emaSmooth(smooth, `${hA.handedness}_${idx}`, pa.x, pa.y, 0.65);
            const sb = emaSmooth(smooth, `${hB.handedness}_${idx}`, pb.x, pb.y, 0.65);

            // Quadratic bezier — control point pulled slightly upward for a gentle arc
            const midX = (sa.x + sb.x) / 2;
            const midY = (sa.y + sb.y) / 2;
            const span = Math.abs(sb.x - sa.x);
            const cpY = midY - span * 0.08; // subtle upward bow

            ctx.strokeStyle = row.color;
            ctx.lineWidth = row.width;
            ctx.beginPath();
            ctx.moveTo(sa.x, sa.y);
            ctx.quadraticCurveTo(midX, cpY, sb.x, sb.y);
            ctx.stroke();
          }
        }
      }

      // Full-screen scanline overlay in hologram mode
      if (interaction.effectMode === 'hologram' && interaction.hologramIntensity > 0.1) {
        const alpha = 0.06 + interaction.hologramIntensity * 0.08;
        ctx.strokeStyle = `rgba(120,255,210,${alpha})`;
        ctx.lineWidth = 0.8;
        for (let y = 0; y < height; y += 5) {
          ctx.beginPath();
          ctx.moveTo(0, y + Math.sin(time + y * 0.004) * 0.4);
          ctx.lineTo(width, y + Math.sin(time + y * 0.004) * 0.4);
          ctx.stroke();
        }
      }
    };

    draw();

    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [videoRef]);

  return <canvas ref={canvasRef} className="absolute inset-0 z-10 h-full w-full object-cover pointer-events-none mix-blend-screen" />;
}
