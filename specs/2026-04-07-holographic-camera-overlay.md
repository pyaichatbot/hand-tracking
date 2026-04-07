# Holographic Camera Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the hand-tracking demo from a black-background debug scene into a camera-first AR-style experience with a face-scan default state and a pinch/hold-triggered hologram mode.

**Architecture:** Keep the live camera as the base layer, draw face-scan HUD graphics in a 2D overlay, and reserve Three.js for the translucent hologram orb and particles. Use a small interaction state machine to latch hologram mode for a short interval after a stable pinch/hold.

**Tech Stack:** React, TypeScript, Zustand, MediaPipe Tasks Vision, Canvas 2D, Three.js

---

### Task 1: Layered Camera Composite

**Files:**
- Modify: `hand-tracking-app/src/App.tsx`
- Modify: `hand-tracking-app/src/components/VideoCanvas.tsx`
- Create: `hand-tracking-app/src/components/FaceHudOverlay.tsx`

- [ ] Replace the debug-scene composition with a camera-first layered stack.
- [ ] Keep the live mirrored camera visible at all times.
- [ ] Add a 2D HUD overlay for face scan lines and fingertip accents.

### Task 2: Interaction State Machine

**Files:**
- Modify: `hand-tracking-app/src/types.ts`
- Modify: `hand-tracking-app/src/store/handTrackingStore.ts`
- Modify: `hand-tracking-app/src/hooks/useInteraction.ts`

- [ ] Extend interaction state with `face-scan` and `hologram` modes.
- [ ] Add stable pinch/hold activation and a latched hologram timeout.
- [ ] Drive visual intensity from the interaction state instead of always-on debug rendering.

### Task 3: Hologram Visual Layer

**Files:**
- Modify: `hand-tracking-app/src/components/Scene3D.tsx`
- Modify: `hand-tracking-app/src/components/ParticleSystem.ts`

- [ ] Render a translucent orb and bloom only during hologram mode.
- [ ] Anchor the orb compositionally near the face/hands rather than in an isolated scene.
- [ ] Keep particles and orb additive so the person remains visible underneath.

### Task 4: HUD and Failure Presentation

**Files:**
- Modify: `hand-tracking-app/src/components/UIOverlay.tsx`
- Modify: `hand-tracking-app/src/hooks/useHandTracking.ts`

- [ ] Replace the always-on debug status bar with cinematic HUD labels.
- [ ] Preserve debug visibility behind the debug toggle only.
- [ ] Surface real startup errors in the UI instead of generic fatal states.

### Task 5: Verification

**Files:**
- Verify: `hand-tracking-app`

- [ ] Run `npm run lint`
- [ ] Run `npm run build`
- [ ] Verify the app in-browser: camera visible by default, face-scan in idle, hologram on pinch/hold
