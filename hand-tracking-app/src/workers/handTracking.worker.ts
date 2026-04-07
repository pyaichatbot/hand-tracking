import {
  HandLandmarker,
  FaceDetector,
  FilesetResolver,
} from '@mediapipe/tasks-vision';
import type { Hand, Face, DetectionResult } from '../types';

let handLandmarker: HandLandmarker | null = null;
let faceDetector: FaceDetector | null = null;
let running = true;
let lastFrameTime = 0;
let frameCount = 0;
let fpsAccumulator = 0;
let currentFps = 0;

async function init() {
  try {
    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm',
    );

    const delegates: Array<'GPU' | 'CPU'> = ['GPU', 'CPU'];
    let lastError: unknown = null;

    for (const delegate of delegates) {
      try {
        handLandmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
            delegate,
          },
          runningMode: 'VIDEO',
          numHands: 2,
          minHandDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });

        faceDetector = await FaceDetector.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite',
            delegate,
          },
          runningMode: 'VIDEO',
          minDetectionConfidence: 0.5,
        });

        self.postMessage({ type: 'ready', delegate });
        return;
      } catch (error) {
        lastError = error;
        handLandmarker = null;
        faceDetector = null;
      }
    }

    throw lastError ?? new Error('Failed to initialize MediaPipe tasks');
  } catch (error) {
    self.postMessage({
      type: 'error',
      stage: 'init',
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

function processFrame(bitmap: ImageBitmap, timestamp: number) {
  try {
    if (!handLandmarker || !faceDetector || !running) return;

    const start = performance.now();

    const handResults = handLandmarker.detectForVideo(bitmap, timestamp);
    const faceResults = faceDetector.detectForVideo(bitmap, timestamp);

    const latency = performance.now() - start;

    // FPS calculation
    frameCount++;
    fpsAccumulator += performance.now() - lastFrameTime;
    lastFrameTime = performance.now();
    if (fpsAccumulator >= 1000) {
      currentFps = frameCount;
      frameCount = 0;
      fpsAccumulator = 0;
    }

    // Convert hand results
    const hands: Hand[] = (handResults.landmarks ?? []).map((lm, i) => ({
      landmarks: lm.map((pt) => ({
        x: pt.x,
        y: pt.y,
        z: pt.z,
        confidence: 1,
      })),
      handedness:
        handResults.handedness?.[i]?.[0]?.categoryName === 'Left'
          ? ('Left' as const)
          : ('Right' as const),
      confidence: handResults.handedness?.[i]?.[0]?.score ?? 0,
    }));

    // Convert face results
    let face: Face | null = null;
    if (faceResults.detections && faceResults.detections.length > 0) {
      const d = faceResults.detections[0];
      const bb = d.boundingBox;
      if (bb) {
        face = {
          boundingBox: {
            xMin: bb.originX,
            yMin: bb.originY,
            width: bb.width,
            height: bb.height,
          },
          confidence: d.categories?.[0]?.score ?? 0,
        };
      }
    }

    const result: DetectionResult = {
      hands,
      face,
      fps: currentFps,
      latency,
      timestamp: performance.now(),
      degraded: latency > 150,
    };

    self.postMessage({ type: 'result', data: result });
  } catch (error) {
    self.postMessage({
      type: 'error',
      stage: 'process-frame',
      message: error instanceof Error ? error.message : String(error),
    });
  } finally {
    bitmap.close();
  }
}

self.onmessage = (event: MessageEvent) => {
  const { type, bitmap, timestamp } = event.data;

  switch (type) {
    case 'init':
      init();
      break;
    case 'frame':
      processFrame(bitmap, timestamp);
      break;
    case 'pause':
      running = false;
      break;
    case 'resume':
      running = true;
      break;
  }
};
