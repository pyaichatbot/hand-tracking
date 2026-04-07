import { useEffect, useRef, type MutableRefObject } from 'react';
import { useHandTrackingStore } from '../store/handTrackingStore';

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

// EMA smoother stored per hand×landmark key
type SmoothMap = Map<string, { x: number; y: number }>;

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

export default function FaceHudOverlay({ videoRef }: FaceHudOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const smoothRef = useRef<SmoothMap>(new Map());

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
      const time = performance.now() * 0.0018;
      const smooth = smoothRef.current;

      // Evict smooth entries for hands that are no longer present
      const activeKeys = new Set(hands.flatMap((h) =>
        h.landmarks.map((_, i) => `${h.handedness}_${i}`)
      ));
      for (const key of smooth.keys()) {
        if (!activeKeys.has(key)) smooth.delete(key);
      }

      ctx.clearRect(0, 0, width, height);

      // Subtle face scan lines — light enough not to obscure the face
      if (face) {
        const box = face.boundingBox;
        const cx = width - (box.xMin + box.width * 0.5);
        const cy = box.yMin + box.height * 0.38;
        const bw = Math.max(box.width * 1.35, width * 0.20);

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

      // Inter-hand arcs — drawn when both hands are present
      // Connect corresponding landmark rows between left and right hands
      if (hands.length === 2) {
        const hA = hands[0];
        const hB = hands[1];

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
