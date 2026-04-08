import { useEffect, useState } from 'react';
import { useHandTrackingStore } from '../store/handTrackingStore';

export default function UIOverlay() {
  const mode = useHandTrackingStore((s) => s.mode);
  const fps = useHandTrackingStore((s) => s.fps);
  const latency = useHandTrackingStore((s) => s.latency);
  const errorMessage = useHandTrackingStore((s) => s.errorMessage);
  const showDebug = useHandTrackingStore((s) => s.showDebug);
  const interaction = useHandTrackingStore((s) => s.interaction);
  const face = useHandTrackingStore((s) => s.face);

  const isHologram = interaction.effectMode === 'hologram';
  const gesture = interaction.gestureType;
  const launchPct = Math.round(interaction.pinchProgress * 100);
  const facePct = Math.round((face?.confidence ?? 0) * 100);
  const powerLabel = interaction.powerMode === 'fire'
    ? 'FIRE POWER'
    : interaction.powerMode === 'web'
      ? 'WEB POWER'
      : null;
  const [snapToast, setSnapToast] = useState<string | null>(null);

  useEffect(() => {
    const onSnap = (event: Event) => {
      const custom = event as CustomEvent<{ ok?: boolean }>;
      const ok = Boolean(custom.detail?.ok);
      setSnapToast(ok ? 'Screenshot saved' : 'Screenshot failed');
      window.setTimeout(() => setSnapToast(null), 1400);
    };

    window.addEventListener('holo:screenshot', onSnap as EventListener);
    return () => window.removeEventListener('holo:screenshot', onSnap as EventListener);
  }, []);

  return (
    <div className="absolute inset-0 z-30 pointer-events-none">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(115,255,210,0.04),transparent_42%),linear-gradient(to_bottom,rgba(3,15,13,0.12),rgba(1,7,6,0.35))]" />

      {showDebug && (
        <>
          <div className="absolute left-5 top-5 rounded-full border border-neon-green/30 bg-black/45 px-3 py-1 text-[10px] uppercase tracking-[0.32em] text-neon-green/90">
            {mode}
          </div>
          <div className="absolute right-5 top-5 rounded-full border border-neon-green/20 bg-black/35 px-3 py-1 text-[10px] uppercase tracking-[0.28em] text-neon-green/60">
            FPS {fps} · LAT {latency.toFixed(0)}ms · {gesture}
          </div>
          <div className="absolute bottom-5 left-5 rounded-2xl border border-neon-green/20 bg-black/45 px-4 py-3 font-mono text-[10px] text-neon-green/80">
            <p>Hands: {interaction.handsInFrame}</p>
            <p>Mode: {interaction.effectMode}</p>
            <p>Pinch: {interaction.pinchProgress.toFixed(2)}</p>
            <p>Holo: {interaction.hologramIntensity.toFixed(2)}</p>
          </div>
        </>
      )}

      {mode === 'running' || mode === 'degraded' || mode === 'paused' ? (
        <>
          <div className="absolute left-4 top-4 rounded-full border border-neon-green/20 bg-black/20 px-3 py-1 text-[9px] uppercase tracking-[0.38em] text-neon-green/50">
            {isHologram ? 'field protocol' : 'scan protocol'}
          </div>
          <div className="absolute right-4 top-4 rounded-full border border-neon-green/20 bg-black/20 px-3 py-1 text-[9px] uppercase tracking-[0.28em] text-neon-green/55">
            {face ? `face lock ${facePct}%` : 'face searching'}
          </div>
          <div className="absolute left-1/2 top-[6.5%] -translate-x-1/2 rounded-full border border-neon-green/20 bg-black/20 px-4 py-1 text-[9px] uppercase tracking-[0.3em] text-neon-green/60">
            Photo: touch thumb + pinky
          </div>
          <div className="absolute left-1/2 top-[3%] -translate-x-1/2 rounded-full border border-neon-green/20 bg-black/20 px-4 py-1 text-[9px] uppercase tracking-[0.28em] text-neon-green/58">
            Fire: all fingertips touch | Web: middle+ring closed
          </div>

          {powerLabel ? (
            <div className="absolute left-1/2 top-[18%] -translate-x-1/2 rounded-full border border-[#ffe3a2]/35 bg-black/30 px-5 py-1 text-[10px] uppercase tracking-[0.36em] text-[#ffeab9] shadow-[0_0_24px_rgba(255,160,60,0.25)]">
              {powerLabel}
            </div>
          ) : null}

          {isHologram ? (
            <>
              <div className="absolute bottom-8 left-1/2 -translate-x-1/2 rounded-full border border-neon-green/30 bg-black/25 px-8 py-2 text-[10px] uppercase tracking-[0.45em] text-[#b8ffe9] shadow-[0_0_24px_rgba(115,255,210,0.25)]">
                ANTIGRAVITY FIELD ACTIVE
              </div>
              <div className="absolute left-1/2 top-[10%] -translate-x-1/2 rounded-full border border-neon-green/20 bg-black/25 px-5 py-1 text-[9px] uppercase tracking-[0.34em] text-neon-green/55">
                Close: hold fist briefly
              </div>
              <HudTag className="left-[24%] top-[44%]" text="LFT ZONE" />
              <HudTag className="right-[18%] top-[39%]" text="FLUX ARC" />
            </>
          ) : (
            <>
              <div className="absolute left-1/2 top-[10%] -translate-x-1/2 text-[10px] uppercase tracking-[0.48em] text-neon-green/45">
                launch: pinch and hold or open both hands
              </div>
              <div className="absolute left-1/2 top-[14%] -translate-x-1/2 rounded-full border border-neon-green/20 bg-black/20 px-4 py-1 text-[9px] uppercase tracking-[0.28em] text-neon-green/60">
                Arming {launchPct}%
              </div>
            </>
          )}
        </>
      ) : null}

      {mode === 'permission-prompt' && <CenterMessage text="Waiting for camera permission…" />}
      {mode === 'camera-error' && (
        <CenterMessage text="Camera not available. Check permissions and HTTPS." detail={errorMessage} />
      )}
      {mode === 'fatal-error' && (
        <CenterMessage text="Detection failed to initialize. Try reloading." detail={errorMessage} />
      )}
      {mode === 'booting' && <CenterMessage text="Initializing holographic field…" />}

      {snapToast ? (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 rounded-full border border-[#b8ffe9]/30 bg-black/40 px-5 py-2 text-[10px] uppercase tracking-[0.35em] text-[#c8fff1] shadow-[0_0_24px_rgba(120,255,210,0.25)]">
          {snapToast}
        </div>
      ) : null}
    </div>
  );
}

function HudTag({ className, text }: { className: string; text: string }) {
  return (
    <div className={`absolute rounded-md border border-[#b0fff0]/25 bg-black/15 px-3 py-1 font-mono text-[9px] uppercase tracking-[0.4em] text-[#b8ffe9]/75 ${className}`}>
      {text}
    </div>
  );
}

function CenterMessage({ text, detail }: { text: string; detail?: string | null }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="max-w-xl rounded-2xl border border-neon-green/25 bg-black/80 px-8 py-4 text-sm tracking-wide text-neon-green shadow-[0_0_32px_rgba(0,255,136,0.12)]">
        <div>{text}</div>
        {detail ? (
          <div className="mt-2 text-xs text-neon-green/70 normal-case tracking-normal break-words">
            {detail}
          </div>
        ) : null}
      </div>
    </div>
  );
}
