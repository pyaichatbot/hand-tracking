# Hand-Tracking App - Architecture & Code Patterns

## 🏗️ Module Architecture

### 1. Hand Detection Module (Core Input)

```typescript
// hooks/useHandTracking.ts

interface HandTrackingConfig {
  minDetectionConfidence: number;  // 0.5-0.9
  minTrackingConfidence: number;   // 0.5-0.9
  maxNumHands: 2;
}

interface Hand {
  landmarks: Array<{
    x: number;      // 0-1 normalized
    y: number;      // 0-1 normalized
    z: number;      // depth estimate
    confidence: number;
  }>;
  handedness: 'Left' | 'Right';
  confidence: number;
}

interface Face {
  boundingBox: {
    xMin: number;
    yMin: number;
    width: number;
    height: number;
  };
  confidence: number;
}

export const useHandTracking = (config: HandTrackingConfig) => {
  const [hands, setHands] = useState<Hand[]>([]);
  const [face, setFace] = useState<Face | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [fps, setFps] = useState(0);
  const [latency, setLatency] = useState(0);
  const [mode, setMode] = useState<
    'booting' | 'permission-prompt' | 'running' | 'paused' | 'degraded' | 'error'
  >('booting');
  const lastDetectionAtRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let worker: Worker | null = null;
    let stream: MediaStream | null = null;

    const initializeDetection = async () => {
      try {
        setMode('permission-prompt');
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });

        if (cancelled) return;

        worker = new Worker(new URL('../workers/handTracking.worker.ts', import.meta.url), {
          type: 'module',
        });

        worker.onmessage = (event) => {
          if (cancelled) return;

          const { hands, face, fps, latency, timestamp, degraded } = event.data;
          setHands(hands);
          setFace(face);
          setFps(fps);
          setLatency(latency);
          lastDetectionAtRef.current = timestamp;
          setMode(degraded ? 'degraded' : 'running');
        };

        worker.onerror = () => {
          if (!cancelled) setMode('error');
        };

        setIsInitialized(true);
      } catch {
        if (!cancelled) setMode('error');
      }
    };

    initializeDetection();

    const handleVisibilityChange = () => {
      if (document.hidden) {
        setMode('paused');
        worker?.postMessage({ type: 'pause' });
        return;
      }

      worker?.postMessage({ type: 'resume' });
      setMode((current) => (current === 'paused' ? 'running' : current));
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      worker?.terminate();
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    const staleTimer = window.setInterval(() => {
      if (!lastDetectionAtRef.current) return;
      if (performance.now() - lastDetectionAtRef.current > 250) {
        setHands([]);
        setFace(null);
      }
    }, 100);

    return () => window.clearInterval(staleTimer);
  }, []);

  return {
    hands,
    face,
    isInitialized,
    fps,
    latency,
    mode,
  };
};
```

### 2. Smoothing Module (Input Filtering)

```typescript
// utils/smoothing.ts

interface Vector3D {
  x: number;
  y: number;
  z: number;
}

/**
 * Exponential Moving Average Filter
 * Reduces jitter from raw hand detection
 * 
 * alpha = 0.1: Heavy smoothing (lag)
 * alpha = 0.5: Medium smoothing (recommended)
 * alpha = 0.9: Light smoothing (responsive)
 */
export class ExponentialSmoothingFilter {
  private alpha: number;
  private smoothedValue: Vector3D | null = null;

  constructor(alpha: number = 0.4) {
    this.alpha = alpha;
  }

  filter(rawValue: Vector3D): Vector3D {
    if (!this.smoothedValue) {
      this.smoothedValue = { ...rawValue };
      return this.smoothedValue;
    }

    this.smoothedValue = {
      x: this.alpha * rawValue.x + (1 - this.alpha) * this.smoothedValue.x,
      y: this.alpha * rawValue.y + (1 - this.alpha) * this.smoothedValue.y,
      z: this.alpha * rawValue.z + (1 - this.alpha) * this.smoothedValue.z,
    };

    return this.smoothedValue;
  }

  reset() {
    this.smoothedValue = null;
  }
}

/**
 * Kalman Filter (More sophisticated)
 * Better for noisy sensor data
 */
export class KalmanFilter {
  private q: number;  // Process noise
  private r: number;  // Measurement noise
  private x: Vector3D;  // State estimate
  private p: number;  // Estimate error
  private k: number;  // Kalman gain

  constructor(q: number = 0.1, r: number = 0.5) {
    this.q = q;
    this.r = r;
    this.x = { x: 0, y: 0, z: 0 };
    this.p = 1;
    this.k = 0;
  }

  filter(measurement: Vector3D): Vector3D {
    // Prediction
    this.p = this.p + this.q;

    // Update
    this.k = this.p / (this.p + this.r);
    this.x.x += this.k * (measurement.x - this.x.x);
    this.x.y += this.k * (measurement.y - this.x.y);
    this.x.z += this.k * (measurement.z - this.x.z);
    this.p = (1 - this.k) * this.p;

    return { ...this.x };
  }
}
```

### 3. Gesture Recognition Module

```typescript
// utils/gestures.ts

export enum GestureType {
  OPEN_HAND = 'open_hand',
  PINCH = 'pinch',
  POINT = 'point',
  FIST = 'fist',
  PEACE = 'peace',
  NONE = 'none',
}

interface GestureResult {
  type: GestureType;
  confidence: number;
  duration: number;  // milliseconds
}

export class GestureRecognizer {
  private readonly PINCH_THRESHOLD = 0.03;  // 3cm
  private readonly OPEN_THRESHOLD = 0.08;   // 8cm
  private readonly POINT_THRESHOLD = 0.05;  // fingertip distance

  /**
   * Detect pinch (thumb + index finger together)
   */
  detectPinch(hand: Hand): boolean {
    const thumb = hand.landmarks[4];    // Thumb tip
    const index = hand.landmarks[8];    // Index tip

    const distance = this.distance3d(thumb, index);
    const confidence = thumb.confidence * index.confidence;

    return distance < this.PINCH_THRESHOLD && confidence > 0.7;
  }

  /**
   * Detect open hand (all fingers spread)
   */
  detectOpenHand(hand: Hand): boolean {
    const thumbTip = hand.landmarks[4];
    const pinkyTip = hand.landmarks[20];
    const spread = this.distance3d(thumbTip, pinkyTip);

    return spread > this.OPEN_THRESHOLD;
  }

  /**
   * Detect pointing (index extended, others folded)
   */
  detectPoint(hand: Hand): boolean {
    const indexTip = hand.landmarks[8];
    const middleTip = hand.landmarks[12];
    const ringTip = hand.landmarks[16];

    const indexDistance = this.distance3d(
      hand.landmarks[6],
      indexTip
    );
    const otherDistance = Math.min(
      this.distance3d(hand.landmarks[10], middleTip),
      this.distance3d(hand.landmarks[14], ringTip)
    );

    return indexDistance > otherDistance * 1.2;
  }

  /**
   * Classify gesture from hand landmarks
   */
  classify(hand: Hand): GestureResult {
    const baseConfidence = hand.confidence;

    if (this.detectPinch(hand)) {
      return {
        type: GestureType.PINCH,
        confidence: baseConfidence,
        duration: 0,
      };
    }

    if (this.detectOpenHand(hand)) {
      return {
        type: GestureType.OPEN_HAND,
        confidence: baseConfidence,
        duration: 0,
      };
    }

    if (this.detectPoint(hand)) {
      return {
        type: GestureType.POINT,
        confidence: baseConfidence,
        duration: 0,
      };
    }

    return {
      type: GestureType.NONE,
      confidence: 0,
      duration: 0,
    };
  }

  private distance3d(
    p1: { x: number; y: number; z: number },
    p2: { x: number; y: number; z: number }
  ): number {
    return Math.sqrt(
      (p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2 + (p1.z - p2.z) ** 2
    );
  }
}
```

### 4. Three.js Scene Module

```typescript
// hooks/useThreeScene.ts

export const useThreeScene = (containerRef: React.RefObject<HTMLDivElement>) => {
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Scene Setup
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Camera (perspective matching webcam)
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;
    const fov = 75;
    const camera = new THREE.PerspectiveCamera(
      fov,
      width / height,
      0.1,
      1000
    );
    camera.position.z = 0.5;
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);

    const rimLight = new THREE.DirectionalLight(0x00ff88, 0.5);
    rimLight.position.set(1, 1, 1);
    scene.add(rimLight);

    // Animation loop
    const animate = () => {
      frameRef.current = requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    animate();

    const handleContextLost = (event: Event) => {
      event.preventDefault();
    };

    const handleResize = () => {
      if (!containerRef.current) return;
      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };

    renderer.domElement.addEventListener('webglcontextlost', handleContextLost);
    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      containerRef.current?.removeChild(renderer.domElement);
    };
  }, [containerRef]);

  return {
    scene: sceneRef.current,
    camera: cameraRef.current,
    renderer: rendererRef.current,
  };
};
```

### 5. Particle System Module

```typescript
// components/ParticleSystem.ts

export class ParticleSystem {
  private particles: Particle[] = [];
  private geometry: THREE.BufferGeometry;
  private material: THREE.PointsMaterial;
  private mesh: THREE.Points;
  private maxParticles: number;

  constructor(scene: THREE.Scene, maxParticles: number = 200) {
    this.maxParticles = maxParticles;

    // Geometry (reuse for all particles)
    this.geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(maxParticles * 3);
    this.geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(positions, 3)
    );

    // Material (instanced)
    this.material = new THREE.PointsMaterial({
      size: 3,
      sizeAttenuation: true,
      color: 0x00ff88,
      transparent: true,
    });

    this.mesh = new THREE.Points(this.geometry, this.material);
    scene.add(this.mesh);
  }

  /**
   * Spawn particles at position
   */
  spawn(
    position: { x: number; y: number; z: number },
    count: number = 10,
    color?: number
  ) {
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= this.maxParticles) {
        this.particles.shift();  // Remove oldest
      }

      const particle = new Particle(
        position,
        {
          x: (Math.random() - 0.5) * 2,
          y: (Math.random() - 0.5) * 2,
          z: (Math.random() - 0.5) * 1,
        },
        color || this.randomColor()
      );

      this.particles.push(particle);
    }
  }

  /**
   * Update particle positions and remove dead ones
   */
  update(deltaTime: number) {
    this.particles = this.particles.filter((p) => {
      p.update(deltaTime);
      return p.alive;
    });

    // Update geometry
    const positions = this.geometry.attributes.position.array as Float32Array;
    this.particles.forEach((p, i) => {
      positions[i * 3] = p.position.x;
      positions[i * 3 + 1] = p.position.y;
      positions[i * 3 + 2] = p.position.z;
    });
    this.geometry.attributes.position.needsUpdate = true;
  }

  private randomColor(): number {
    const colors = [0x00ff88, 0x00ffff, 0xff00ff, 0xffff00];
    return colors[Math.floor(Math.random() * colors.length)];
  }
}

class Particle {
  position: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number };
  life: number = 2.0;  // seconds
  color: number;
  alive: boolean = true;

  constructor(
    position: { x: number; y: number; z: number },
    velocity: { x: number; y: number; z: number },
    color: number
  ) {
    this.position = { ...position };
    this.velocity = { ...velocity };
    this.color = color;
  }

  update(deltaTime: number) {
    // Physics
    this.position.x += this.velocity.x * deltaTime;
    this.position.y += this.velocity.y * deltaTime;
    this.position.z += this.velocity.z * deltaTime;

    // Gravity
    this.velocity.y -= 0.2 * deltaTime;

    // Life decay
    this.life -= deltaTime;
    this.alive = this.life > 0;
  }
}
```

### 6. Interaction Engine

```typescript
// hooks/useInteraction.ts

interface InteractionState {
  proximityToSphere: number;  // 0-1
  gestureType: GestureType;
  handsInFrame: number;
  isInteracting: boolean;
}

export const useInteraction = (hands: Hand[]) => {
  const [state, setState] = useState<InteractionState>({
    proximityToSphere: 0,
    gestureType: GestureType.NONE,
    handsInFrame: 0,
    isInteracting: false,
  });

  const gestureRecognizer = useMemo(() => new GestureRecognizer(), []);
  const spherePosition = { x: 0.5, y: 0.5, z: 0 };
  const distance3d = (
    p1: { x: number; y: number; z: number },
    p2: { x: number; y: number; z: number }
  ) =>
    Math.sqrt(
      (p1.x - p2.x) ** 2 +
      (p1.y - p2.y) ** 2 +
      (p1.z - p2.z) ** 2
    );

  useEffect(() => {
    if (!hands.length) {
      setState((s) => ({
        ...s,
        handsInFrame: 0,
        isInteracting: false,
      }));
      return;
    }

    let maxProximity = 0;
    let totalGestureConfidence = 0;
    let gestureTypes: GestureType[] = [];

    hands.forEach((hand) => {
      // Calculate proximity
      const handCenter = hand.landmarks[9];  // Middle finger base
      const proximity = distance3d(handCenter, spherePosition);
      const intensity = Math.max(0, 1 - proximity / 0.5);
      maxProximity = Math.max(maxProximity, intensity);

      // Detect gesture
      const gesture = gestureRecognizer.classify(hand);
      if (gesture.type !== GestureType.NONE) {
        gestureTypes.push(gesture.type);
        totalGestureConfidence += gesture.confidence;
      }
    });

    setState({
      proximityToSphere: maxProximity,
      gestureType:
        gestureTypes.length > 0
          ? gestureTypes[0]
          : GestureType.NONE,
      handsInFrame: hands.length,
      isInteracting: maxProximity > 0.25,
    });
  }, [hands, gestureRecognizer]);

  return state;
};
```

**Production notes:**
- Keep detection and rendering loops decoupled. Rendering should interpolate the latest accepted state, not wait on inference.
- Gesture transitions should add hysteresis and a minimum hold duration to avoid threshold chatter.
- Any detector result older than 250ms should be treated as stale and ignored by the interaction layer.

### 7. State Management (Zustand Store)

```typescript
// store/handTrackingStore.ts

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
  isRunning: boolean;
  
  // Actions
  updateHands: (hands: Hand[]) => void;
  updateFace: (face: Face | null) => void;
  updateInteraction: (interaction: InteractionState) => void;
  updateVisuals: (visuals: Partial<VisualState>) => void;
  updateMetrics: (fps: number, latency: number) => void;
  start: () => void;
  stop: () => void;
}

export const useHandTrackingStore = create<HandTrackingStore>((set) => ({
  hands: [],
  face: null,
  interaction: {
    proximityToSphere: 0,
    gestureType: GestureType.NONE,
    handsInFrame: 0,
    isInteracting: false,
  },
  sphereScale: 1,
  sphereGlowIntensity: 0.8,
  gridOpacity: 0.7,
  fps: 0,
  latency: 0,
  isRunning: false,

  updateHands: (hands) => set({ hands }),
  updateFace: (face) => set({ face }),
  updateInteraction: (interaction) => set({ interaction }),
  updateVisuals: (visuals) =>
    set((state) => ({
      sphereScale: visuals.sphereScale ?? state.sphereScale,
      sphereGlowIntensity:
        visuals.sphereGlowIntensity ?? state.sphereGlowIntensity,
      gridOpacity: visuals.gridOpacity ?? state.gridOpacity,
    })),
  updateMetrics: (fps, latency) => set({ fps, latency }),
  start: () => set({ isRunning: true }),
  stop: () =>
    set({
      isRunning: false,
      hands: [],
      face: null,
      interaction: {
        proximityToSphere: 0,
        gestureType: GestureType.NONE,
        handsInFrame: 0,
        isInteracting: false,
      },
    }),
}));
```

---

## 🎨 Custom Shader Examples

### Glow Sphere Vertex Shader

```glsl
// shaders/glowSphere.vert

uniform float uTime;
uniform float uGlowIntensity;

varying vec3 vNormal;
varying vec3 vPosition;
varying float vGlow;

void main() {
  vNormal = normalize(normalMatrix * normal);
  vPosition = vec3(modelViewMatrix * vec4(position, 1.0));
  
  // Glow based on angle to camera
  vGlow = pow(abs(dot(vNormal, normalize(vPosition))), 1.5);
  vGlow *= uGlowIntensity;
  
  gl_Position = projectionMatrix * vec4(vPosition, 1.0);
}
```

### Glow Sphere Fragment Shader

```glsl
// shaders/glowSphere.frag

uniform vec3 uColor;
uniform float uTime;

varying vec3 vNormal;
varying vec3 vPosition;
varying float vGlow;

void main() {
  // Base color
  vec3 color = uColor;
  
  // Add emission
  vec3 emissive = uColor * vGlow;
  
  // Fresnel effect
  vec3 viewDir = normalize(-vPosition);
  float fresnel = pow(1.0 - dot(vNormal, viewDir), 2.0);
  
  // Combine
  vec3 finalColor = color + emissive * fresnel;
  
  gl_FragColor = vec4(finalColor, 0.85);
}
```

### Scan Lines Fragment Shader

```glsl
// shaders/scanLines.frag

uniform float uTime;
uniform float uLineCount;
uniform vec3 uColor;

varying vec2 vUv;

void main() {
  // Create horizontal scan lines
  float line = mod(vUv.y * uLineCount + uTime * 2.0, 1.0);
  float scanLine = smoothstep(0.0, 0.1, line) * smoothstep(0.3, 0.1, line);
  
  // Add slight wave
  float wave = sin(vUv.x * 3.14 + uTime) * 0.1;
  scanLine += wave;
  
  vec3 color = uColor * scanLine;
  
  gl_FragColor = vec4(color, 0.7);
}
```

---

## 📊 Component Hierarchy

```
App
├─ VideoCanvas (Webcam Feed)
├─ Scene3D
│  ├─ GlowingSphere
│  ├─ GridOverlay
│  ├─ ParticleSystem
│  └─ HandSkeleton
├─ UIOverlay
│  ├─ FPSCounter
│  ├─ LatencyDisplay
│  ├─ StatusLabels
│  └─ DebugInfo (conditional)
└─ PresentationControls (conditional)
```

---

## 🔄 Data Flow Example (Single Frame)

```
1. MediaPipe Detection (Worker)
   Input: WebGL texture from camera
   Output: {
     hands: [Hand, Hand],
     face: Face,
     timestamp: 1234567890
   }

2. Smoothing Filter
   Input: Raw hand landmarks
   Output: Smoothed landmarks (α=0.4)

3. Gesture Recognition
   Input: Smoothed landmarks
   Output: { type: PINCH, confidence: 0.92 }

4. Interaction Engine
   Input: Hands + Gestures
   Output: InteractionState {
     proximityToSphere: 0.75,
     gestureType: PINCH,
     isInteracting: true
   }

5. State Update (Zustand)
   Update store with new hand data

6. React Re-render
   Components read from store
   Trigger Three.js updates

7. Three.js Animation
   Update:
   - Sphere scale (based on proximity)
   - Sphere glow (based on gesture)
   - Particle spawn rate
   - Grid animation

8. WebGL Render
   Render to canvas
```

---

## 🧪 Testing Pattern (Jest + React Testing Library)

```typescript
// __tests__/gestures.test.ts

describe('GestureRecognizer', () => {
  let recognizer: GestureRecognizer;

  beforeEach(() => {
    recognizer = new GestureRecognizer();
  });

  describe('detectPinch', () => {
    it('should detect pinch when thumb and index are close', () => {
      const hand = createMockHand({
        landmarks: [
          // ... 21 landmarks
          { x: 0.5, y: 0.5, z: 0, confidence: 0.9 },  // thumb
          { x: 0.51, y: 0.5, z: 0, confidence: 0.9 },  // index (3cm away)
        ],
      });

      const result = recognizer.detectPinch(hand);
      expect(result).toBe(true);
    });

    it('should not detect pinch when fingers are spread', () => {
      const hand = createMockHand({
        landmarks: [
          { x: 0.4, y: 0.5, z: 0, confidence: 0.9 },   // thumb
          { x: 0.7, y: 0.5, z: 0, confidence: 0.9 },   // index (30cm away)
        ],
      });

      const result = recognizer.detectPinch(hand);
      expect(result).toBe(false);
    });
  });
});
```

---

## 🎯 Performance Optimization Patterns

### Pattern 1: Object Pooling (Particles)

```typescript
class ParticlePool {
  private available: Particle[] = [];
  private inUse: Particle[] = [];

  get(position: Vector3D): Particle {
    const particle = this.available.pop() || new Particle();
    particle.reset(position);
    this.inUse.push(particle);
    return particle;
  }

  update() {
    this.inUse = this.inUse.filter((p) => {
      if (p.alive) {
        p.update();
        return true;
      } else {
        this.available.push(p);
        return false;
      }
    });
  }
}
```

### Pattern 2: Async Hand Detection (Web Worker)

```typescript
// HandDetectionWorker.ts
self.onmessage = async (event: MessageEvent) => {
  const { imageData } = event.data;

  // Run MediaPipe (doesn't block main thread)
  const results = await detector.detectHands(imageData);

  self.postMessage({ hands: results.hands });
};
```

### Pattern 3: Instanced Rendering (Multiple Objects)

```typescript
// Create 100 particles with single draw call
const geometry = new THREE.BufferGeometry();
const positions = new Float32Array(/* ... */);
const colors = new Float32Array(/* ... */);

const instancedGeometry = new THREE.InstancedBufferGeometry();
instancedGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
instancedGeometry.setAttribute(
  'color',
  new THREE.InstancedBufferAttribute(colors, 3)
);

const material = new THREE.RawShaderMaterial({
  vertexShader: instancedVertexShader,
  fragmentShader: instancedFragmentShader,
});

const mesh = new THREE.Mesh(instancedGeometry, material);
```

---

## 📋 Configuration Management

```typescript
// config/constants.ts

export const HAND_TRACKING_CONFIG = {
  // Detection
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.5,
  maxNumHands: 2,

  // Rendering
  renderResolution: { width: 1280, height: 720 },
  targetFPS: 30,

  // Smoothing
  smoothingAlpha: 0.4,

  // Gesture
  pinchThreshold: 0.03,
  openHandThreshold: 0.08,

  // Visual
  sphereRadius: 20,  // cm
  particleCount: 200,
  gridLineCount: 18,

  // Performance
  useWorkers: true,
  enableDebug: false,
};

export const COLORS = {
  neonGreen: '#00FF88',
  cyan: '#00FFFF',
  magenta: '#FF00FF',
  yellow: '#FFFF00',
  darkBG: '#0A0A0A',
};
```

---

**This architecture ensures:**
- ✓ Separation of concerns (detection, rendering, interaction)
- ✓ Reusable modules and hooks
- ✓ Performance optimization (workers, pooling, instancing)
- ✓ Type safety (TypeScript throughout)
- ✓ Testability (pure functions, mockable dependencies)
- ✓ Scalability (easy to add new gestures or visual effects)
