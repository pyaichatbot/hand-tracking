import { useEffect, useMemo } from 'react';
import { useHandTrackingStore } from '../store/handTrackingStore';
import { classifyGesture } from '../utils/gestures';
import { distance3d } from '../utils/distance';
import { GestureType } from '../types';

const SPHERE_CENTER = { x: 0.5, y: 0.5, z: 0 };

export function useInteraction() {
  const hands = useHandTrackingStore((s) => s.hands);
  const updateInteraction = useHandTrackingStore((s) => s.updateInteraction);
  const updateVisuals = useHandTrackingStore((s) => s.updateVisuals);

  const spherePos = useMemo(() => SPHERE_CENTER, []);

  useEffect(() => {
    if (!hands.length) {
      updateInteraction({
        proximityToSphere: 0,
        gestureType: GestureType.NONE,
        handsInFrame: 0,
        isInteracting: false,
      });
      updateVisuals({ sphereGlowIntensity: 0.5, sphereScale: 1 });
      return;
    }

    let maxProximity = 0;
    const gestureTypes: GestureType[] = [];

    hands.forEach((hand) => {
      const handCenter = hand.landmarks[9]; // middle finger base
      const dist = distance3d(handCenter, spherePos);
      const intensity = Math.max(0, 1 - dist / 0.5);
      maxProximity = Math.max(maxProximity, intensity);

      const gesture = classifyGesture(hand);
      if (gesture.type !== GestureType.NONE) {
        gestureTypes.push(gesture.type);
      }
    });

    updateInteraction({
      proximityToSphere: maxProximity,
      gestureType: gestureTypes[0] ?? GestureType.NONE,
      handsInFrame: hands.length,
      isInteracting: maxProximity > 0.25,
    });

    // Map proximity to visual parameters
    const glowIntensity = 0.5 + maxProximity * 1.5;
    const scale = 1 + maxProximity * 0.3;
    updateVisuals({ sphereGlowIntensity: glowIntensity, sphereScale: scale });
  }, [hands, spherePos, updateInteraction, updateVisuals]);
}
