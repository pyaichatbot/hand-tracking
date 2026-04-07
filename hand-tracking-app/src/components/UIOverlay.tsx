import { useHandTrackingStore } from '../store/handTrackingStore';
import { GestureType } from '../types';

export default function UIOverlay() {
  const mode = useHandTrackingStore((s) => s.mode);
  const fps = useHandTrackingStore((s) => s.fps);
  const latency = useHandTrackingStore((s) => s.latency);
  const errorMessage = useHandTrackingStore((s) => s.errorMessage);
  const showDebug = useHandTrackingStore((s) => s.showDebug);
  const interaction = useHandTrackingStore((s) => s.interaction);

  const isInteracting = interaction.isInteracting;
  const gesture = interaction.gestureType;

  return (
    <div className="absolute inset-0 z-20 pointer-events-none">
      {/* Status bar */}
      <div className="absolute top-0 left-0 right-0 flex justify-between items-center px-4 py-2 bg-black/40">
        <div className="flex items-center gap-4 text-xs text-neon-green">
          <span>FPS: {fps}</span>
          <span>LAT: {latency.toFixed(0)}ms</span>
          <span className="uppercase">{mode}</span>
        </div>
        <div className="text-xs text-neon-green/60">
          [D] Debug &middot; [G] Grid &middot; [F] Fullscreen &middot; [R] Reset
        </div>
      </div>

      {/* Interaction label */}
      {isInteracting && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2 text-neon-green text-sm uppercase tracking-[0.3em] animate-pulse">
          ANTIGRAVITY FIELD ACTIVE
        </div>
      )}

      {/* Gesture indicator */}
      {gesture !== GestureType.NONE && (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 text-neon-cyan text-xs uppercase tracking-widest">
          Gesture: {gesture}
        </div>
      )}

      {/* Debug panel */}
      {showDebug && (
        <div className="absolute bottom-4 left-4 bg-black/70 text-neon-green text-[10px] p-3 rounded font-mono space-y-1">
          <p>Hands: {interaction.handsInFrame}</p>
          <p>Proximity: {interaction.proximityToSphere.toFixed(2)}</p>
          <p>Gesture: {interaction.gestureType}</p>
          <p>FPS: {fps}</p>
          <p>Latency: {latency.toFixed(1)}ms</p>
          <p>Mode: {mode}</p>
        </div>
      )}

      {/* Error / permission states */}
      {mode === 'permission-prompt' && (
        <CenterMessage text="Waiting for camera permission…" />
      )}
      {mode === 'camera-error' && (
        <CenterMessage text="Camera not available. Check permissions and HTTPS." detail={errorMessage} />
      )}
      {mode === 'fatal-error' && (
        <CenterMessage text="Detection failed to initialize. Try reloading." detail={errorMessage} />
      )}
      {mode === 'booting' && <CenterMessage text="Initializing…" />}
    </div>
  );
}

function CenterMessage({ text, detail }: { text: string; detail?: string | null }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="bg-black/80 text-neon-green px-8 py-4 rounded text-sm tracking-wide max-w-xl">
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
