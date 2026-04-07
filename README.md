# Hand Tracking AR

A real-time augmented reality hand-tracking app built with React, Three.js and MediaPipe. Point your webcam at your hands and interact with a holographic sphere using gestures — rally it like a ball, throw it, and watch it react to your movements.

![Tech Stack](https://img.shields.io/badge/React-18-61dafb?logo=react) ![Three.js](https://img.shields.io/badge/Three.js-0.170-black?logo=three.js) ![MediaPipe](https://img.shields.io/badge/MediaPipe-0.10.18-blue) ![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178c6?logo=typescript) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## Features

- **Live hand skeleton** — full 21-landmark skeleton with per-finger colour coding for up to 2 hands simultaneously
- **Inter-hand arcs** — when both hands are in frame, coloured arcs connect matching fingertips
- **Holographic sphere** — pinch to summon a glowing Three.js orb with bloom and particle effects
- **Physics ball game** — once active, the ball behaves like a real object: gravity, air resistance, wall bounces
- **Badminton-style play** — hit the ball with open palms; both hands are independent paddles with impulse physics
- **Fist to dismiss** — close your fist for ~0.7 s to dismiss the sphere

---

## Gestures

| Gesture | Action |
|---|---|
| Pinch (thumb + index, hold ~0.4 s) | Summon the holographic ball |
| Open palm — swipe at ball | Hit the ball (harder swipe = harder hit) |
| Both hands open | Rally the ball between two hands |
| Fist (hold ~0.7 s) | Dismiss the ball |

---

## Tech Stack

| Layer | Library |
|---|---|
| UI framework | React 18 + TypeScript |
| 3D rendering | Three.js 0.170 + UnrealBloom post-processing |
| Hand tracking | MediaPipe Tasks Vision 0.10.18 (WASM, runs in-browser) |
| State | Zustand 5 |
| Styling | Tailwind CSS 3 |
| Build | Vite 6 + vite-plugin-glsl |

---

## Project Structure

```
hand-tracking-app/
├── src/
│   ├── components/
│   │   ├── Scene3D.tsx        # Three.js renderer — ball physics, bloom, particles
│   │   ├── FaceHudOverlay.tsx # Canvas overlay — hand skeleton + inter-hand arcs
│   │   ├── VideoCanvas.tsx    # Webcam feed
│   │   ├── UIOverlay.tsx      # HUD labels / debug info
│   │   └── ParticleSystem.ts  # GPU particle emitter
│   ├── hooks/
│   │   ├── useHandTracking.ts # MediaPipe inference loop
│   │   └── useInteraction.ts  # Gesture state machine (pinch, fist)
│   ├── shaders/               # GLSL vertex + fragment shaders for the orb
│   ├── store/
│   │   └── handTrackingStore.ts  # Zustand global state
│   ├── utils/
│   │   ├── gestures.ts        # Pinch / fist / open-hand detection with hysteresis
│   │   └── distance.ts        # 3D maths helpers
│   └── types.ts
└── specs/                     # Architecture and implementation notes
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- A webcam
- A browser that supports WebAssembly and `getUserMedia` (Chrome / Edge recommended)

### Install & run

```bash
cd hand-tracking-app
npm install
npm run dev
```

Open `http://localhost:5173`, allow camera access, and hold up your hands.

### Build for production

```bash
npm run build
npm run preview
```

---

## How It Works

1. **MediaPipe** runs entirely in-browser via WASM — no server needed
2. Each frame, 21 landmarks per hand are normalised to `[0, 1]` by MediaPipe
3. `FaceHudOverlay` draws the skeleton on a `<canvas>` using `mix-blend-mode: screen`
4. `Scene3D` converts the same landmarks directly to Three.js world coordinates (`landmarkToWorld`) each rAF tick — no store round-trip lag
5. The ball is always in full physics simulation; hands act as paddles via impulse-based collision response

---

## Browser Notes

- Camera permission is required
- HTTPS is required in production (MediaPipe WASM needs a secure context)
- Tested on Chrome 124+ / Edge 124+

---

## Author

**Praveen Yellamaraju** — [@pyaichatbot](https://github.com/pyaichatbot)

Repository: <https://github.com/pyaichatbot/hand-tracking>

---

## License

MIT © 2026 Praveen Yellamaraju — see [LICENSE](LICENSE) for details.
