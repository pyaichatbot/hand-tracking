import { create } from 'zustand';
import type { Hand, Face, InteractionState, AppMode } from '../types';
import { GestureType } from '../types';

interface HandTrackingStore {
  // Hand data
  hands: Hand[];
  face: Face | null;

  // Interaction
  interaction: InteractionState;

  // Visual state
  sphereScale: number;
  sphereGlowIntensity: number;
  gridOpacity: number;

  // Metadata
  fps: number;
  latency: number;
  mode: AppMode;
  errorMessage: string | null;

  // Debug
  showDebug: boolean;
  showGrid: boolean;

  // Actions
  updateHands: (hands: Hand[]) => void;
  updateFace: (face: Face | null) => void;
  updateInteraction: (interaction: InteractionState) => void;
  updateVisuals: (visuals: Partial<{ sphereScale: number; sphereGlowIntensity: number; gridOpacity: number }>) => void;
  updateMetrics: (fps: number, latency: number) => void;
  setMode: (mode: AppMode) => void;
  setErrorMessage: (errorMessage: string | null) => void;
  toggleDebug: () => void;
  toggleGrid: () => void;
  reset: () => void;
}

const initialInteraction: InteractionState = {
  proximityToSphere: 0,
  gestureType: GestureType.NONE,
  handsInFrame: 0,
  isInteracting: false,
};

export const useHandTrackingStore = create<HandTrackingStore>((set) => ({
  hands: [],
  face: null,
  interaction: initialInteraction,
  sphereScale: 1,
  sphereGlowIntensity: 0.8,
  gridOpacity: 0.7,
  fps: 0,
  latency: 0,
  mode: 'booting',
  errorMessage: null,
  showDebug: false,
  showGrid: true,

  updateHands: (hands) => set({ hands }),
  updateFace: (face) => set({ face }),
  updateInteraction: (interaction) => set({ interaction }),
  updateVisuals: (visuals) =>
    set((state) => ({
      sphereScale: visuals.sphereScale ?? state.sphereScale,
      sphereGlowIntensity: visuals.sphereGlowIntensity ?? state.sphereGlowIntensity,
      gridOpacity: visuals.gridOpacity ?? state.gridOpacity,
    })),
  updateMetrics: (fps, latency) => set({ fps, latency }),
  setMode: (mode) => set({ mode }),
  setErrorMessage: (errorMessage) => set({ errorMessage }),
  toggleDebug: () => set((s) => ({ showDebug: !s.showDebug })),
  toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
  reset: () =>
    set({
      hands: [],
      face: null,
      interaction: initialInteraction,
      sphereScale: 1,
      sphereGlowIntensity: 0.8,
      gridOpacity: 0.7,
      fps: 0,
      latency: 0,
      errorMessage: null,
    }),
}));
