import { useEffect, useRef, useCallback } from 'react';
import {
  FaceDetector,
  FilesetResolver,
  HandLandmarker,
} from '@mediapipe/tasks-vision';
import { useHandTrackingStore } from '../store/handTrackingStore';
import type { DetectionResult, Face, Hand } from '../types';

const DETECTOR_INIT_TIMEOUT_MS = 10000;
const CAMERA_START_TIMEOUT_MS = 10000;
const WASM_ROOT =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm';
const HAND_MODEL_ASSET =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const FACE_MODEL_ASSET =
  'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';

export function useHandTracking() {
  const {
    setMode,
    setErrorMessage,
    updateHands,
    updateFace,
    updateMetrics,
  } = useHandTrackingStore();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  const faceDetectorRef = useRef<FaceDetector | null>(null);
  const rafRef = useRef<number>(0);
  const lastDetectionRef = useRef<number>(0);
  const frameCountRef = useRef(0);
  const fpsWindowStartRef = useRef(0);
  const fpsRef = useRef(0);

  const cleanup = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    handLandmarkerRef.current?.close();
    handLandmarkerRef.current = null;
    faceDetectorRef.current?.close();
    faceDetectorRef.current = null;
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }
    videoRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const initVisionTasks = useCallback(async () => {
    const vision = await FilesetResolver.forVisionTasks(WASM_ROOT);
    let lastError: unknown = null;

    for (const delegate of ['GPU', 'CPU'] as const) {
      try {
        const handLandmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: HAND_MODEL_ASSET,
            delegate,
          },
          runningMode: 'VIDEO',
          numHands: 2,
          minHandDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });

        const faceDetector = await FaceDetector.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: FACE_MODEL_ASSET,
            delegate,
          },
          runningMode: 'VIDEO',
          minDetectionConfidence: 0.5,
        });

        handLandmarkerRef.current = handLandmarker;
        faceDetectorRef.current = faceDetector;
        return;
      } catch (error) {
        lastError = error;
        handLandmarkerRef.current?.close();
        handLandmarkerRef.current = null;
        faceDetectorRef.current?.close();
        faceDetectorRef.current = null;
      }
    }

    throw lastError ?? new Error('Failed to initialize MediaPipe tasks');
  }, []);

  useEffect(() => {
    let cancelled = false;
    let processing = false;

    const sendFrames = () => {
      if (cancelled || !videoRef.current || !handLandmarkerRef.current || !faceDetectorRef.current) {
        return;
      }

      if (!processing && videoRef.current.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        processing = true;

        try {
          const start = performance.now();
          const timestamp = start;
          const handResults = handLandmarkerRef.current.detectForVideo(videoRef.current, timestamp);
          const faceResults = faceDetectorRef.current.detectForVideo(videoRef.current, timestamp);
          const latency = performance.now() - start;

          if (!fpsWindowStartRef.current) fpsWindowStartRef.current = start;
          frameCountRef.current += 1;
          if (start - fpsWindowStartRef.current >= 1000) {
            fpsRef.current = frameCountRef.current;
            frameCountRef.current = 0;
            fpsWindowStartRef.current = start;
          }

          const hands: Hand[] = (handResults.landmarks ?? []).map((landmarks, index) => ({
            landmarks: landmarks.map((point) => ({
              x: point.x,
              y: point.y,
              z: point.z,
              confidence: 1,
            })),
            handedness:
              handResults.handedness?.[index]?.[0]?.categoryName === 'Left'
                ? 'Left'
                : 'Right',
            confidence: handResults.handedness?.[index]?.[0]?.score ?? 0,
          }));

          let face: Face | null = null;
          const detection = faceResults.detections?.[0];
          const boundingBox = detection?.boundingBox;
          if (boundingBox) {
            face = {
              boundingBox: {
                xMin: boundingBox.originX,
                yMin: boundingBox.originY,
                width: boundingBox.width,
                height: boundingBox.height,
              },
              confidence: detection?.categories?.[0]?.score ?? 0,
            };
          }

          const result: DetectionResult = {
            hands,
            face,
            fps: fpsRef.current,
            latency,
            timestamp,
            degraded: latency > 150,
          };

          updateHands(result.hands);
          updateFace(result.face);
          updateMetrics(result.fps, result.latency);
          lastDetectionRef.current = performance.now();
          setErrorMessage(null);
          setMode(result.degraded ? 'degraded' : 'running');
        } catch (error) {
          console.error('Hand tracking frame processing failed', error);
          setErrorMessage(error instanceof Error ? error.message : String(error));
          setMode('fatal-error');
          cleanup();
          return;
        } finally {
          processing = false;
        }
      }

      rafRef.current = requestAnimationFrame(sendFrames);
    };

    const start = async () => {
      setMode('permission-prompt');
      setErrorMessage(null);

      let stream: MediaStream;
      try {
        stream = await Promise.race([
          navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: 'user',
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
            audio: false,
          }),
          new Promise<MediaStream>((_, reject) => {
            window.setTimeout(
              () => reject(new Error('Timed out waiting for camera stream')),
              CAMERA_START_TIMEOUT_MS,
            );
          }),
        ]);
      } catch (error) {
        console.error('Camera startup failed', error);
        setErrorMessage(error instanceof Error ? error.message : String(error));
        if (!cancelled) setMode('camera-error');
        return;
      }

      if (cancelled) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = stream;
      setMode('booting');
      setErrorMessage(null);

      try {
        const video = document.createElement('video');
        video.srcObject = stream;
        video.autoplay = true;
        video.playsInline = true;
        video.muted = true;
        await video.play();
        if (cancelled) return;
        videoRef.current = video;

        await Promise.race([
          initVisionTasks(),
          new Promise<never>((_, reject) => {
            window.setTimeout(
              () => reject(new Error('Timed out initializing MediaPipe tasks')),
              DETECTOR_INIT_TIMEOUT_MS,
            );
          }),
        ]);

        if (cancelled) return;

        setMode('running');
        setErrorMessage(null);
        sendFrames();
      } catch (error) {
        console.error('Detector initialization failed', error);
        setErrorMessage(error instanceof Error ? error.message : String(error));
        if (!cancelled) setMode('fatal-error');
        cleanup();
      }
    };

    start();

    const staleTimer = window.setInterval(() => {
      if (lastDetectionRef.current && performance.now() - lastDetectionRef.current > 250) {
        updateHands([]);
        updateFace(null);
      }
    }, 100);

    const onVisibility = () => {
      if (document.hidden) {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        setMode('paused');
      } else if (
        videoRef.current &&
        handLandmarkerRef.current &&
        faceDetectorRef.current
      ) {
        setMode('running');
        sendFrames();
      }
    };

    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(staleTimer);
      document.removeEventListener('visibilitychange', onVisibility);
      cleanup();
    };
  }, [cleanup, initVisionTasks, setErrorMessage, setMode, updateFace, updateHands, updateMetrics]);

  return videoRef;
}
