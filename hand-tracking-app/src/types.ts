export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

export interface Landmark extends Vector3D {
  confidence: number;
}

export interface Hand {
  landmarks: Landmark[];
  handedness: 'Left' | 'Right';
  confidence: number;
}

export interface Face {
  boundingBox: {
    xMin: number;
    yMin: number;
    width: number;
    height: number;
  };
  confidence: number;
}

export enum GestureType {
  OPEN_HAND = 'open_hand',
  PINCH = 'pinch',
  POINT = 'point',
  FIST = 'fist',
  PEACE = 'peace',
  NONE = 'none',
}

export interface GestureResult {
  type: GestureType;
  confidence: number;
  duration: number;
}

export interface InteractionState {
  proximityToSphere: number;
  gestureType: GestureType;
  handsInFrame: number;
  isInteracting: boolean;
  effectMode: 'face-scan' | 'hologram';
  pinchProgress: number;
  hologramIntensity: number;
  anchor: Vector3D;
}

export type AppMode =
  | 'booting'
  | 'ready'
  | 'permission-prompt'
  | 'running'
  | 'paused'
  | 'degraded'
  | 'camera-error'
  | 'unsupported'
  | 'fatal-error';

export interface DetectionResult {
  hands: Hand[];
  face: Face | null;
  fps: number;
  latency: number;
  timestamp: number;
  degraded: boolean;
}
