import { useEffect, useCallback } from 'react';
import { useHandTrackingStore } from '../store/handTrackingStore';

export function usePresentationControls() {
  const toggleDebug = useHandTrackingStore((s) => s.toggleDebug);
  const toggleGrid = useHandTrackingStore((s) => s.toggleGrid);
  const reset = useHandTrackingStore((s) => s.reset);

  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      switch (e.key.toLowerCase()) {
        case 'f':
          if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
          } else {
            document.exitFullscreen();
          }
          break;
        case 'd':
          toggleDebug();
          break;
        case 'g':
          toggleGrid();
          break;
        case 'r':
          reset();
          break;
        case ' ':
          e.preventDefault();
          break;
      }
    },
    [toggleDebug, toggleGrid, reset],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleKey]);
}
