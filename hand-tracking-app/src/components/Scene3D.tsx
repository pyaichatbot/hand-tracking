import { useEffect, useRef, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { useHandTrackingStore } from '../store/handTrackingStore';
import { ParticleSystem } from './ParticleSystem';
import glowVert from '../shaders/glowSphere.vert';
import glowFrag from '../shaders/glowSphere.frag';

interface Scene3DProps {
  videoRef: MutableRefObject<HTMLVideoElement | null>;
}

export default function Scene3D({ videoRef }: Scene3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(48, container.clientWidth / container.clientHeight, 0.01, 20);
    camera.position.z = 2.2;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(
      new UnrealBloomPass(
        new THREE.Vector2(container.clientWidth, container.clientHeight),
        0.95,
        0.75,
        0.15,
      ),
    );

    const orbGroup = new THREE.Group();
    scene.add(orbGroup);

    const orbGeometry = new THREE.IcosahedronGeometry(0.58, 8);
    const orbMaterial = new THREE.ShaderMaterial({
      vertexShader: glowVert,
      fragmentShader: glowFrag,
      uniforms: {
        uTime: { value: 0 },
        uGlowIntensity: { value: 0 },
        uColor: { value: new THREE.Color('#78ffd6') },
      },
      transparent: true,
      wireframe: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const orb = new THREE.Mesh(orbGeometry, orbMaterial);
    orbGroup.add(orb);

    const coreGeometry = new THREE.SphereGeometry(0.42, 24, 24);
    const coreMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#73ffd3'),
      transparent: true,
      opacity: 0.12,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const core = new THREE.Mesh(coreGeometry, coreMaterial);
    orbGroup.add(core);

    const haloGeometry = new THREE.RingGeometry(0.66, 0.72, 96);
    const haloMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#a9fff1'),
      transparent: true,
      opacity: 0.25,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const halo = new THREE.Mesh(haloGeometry, haloMaterial);
    halo.rotation.x = Math.PI / 2.3;
    orbGroup.add(halo);

    const particleSystem = new ParticleSystem(260);
    scene.add(particleSystem.mesh);

    const clock = new THREE.Clock();
    let frameId = 0;
    let spawnAccumulator = 0;
    let hologramMix = 0;

    // ── Ball state (always in physics flight when game active) ──────────────
    let ballX = 0, ballY = 0;
    let ballVelX = 0, ballVelY = 0;
    let rotVelX = 0, rotVelY = 0;
    let wasHologram = false;
    let gameActive = false;

    // Per-hand palm velocity (up to 2 hands, indexed 0/1)
    const prevPalmX = [0, 0];
    const prevPalmY = [0, 0];
    const palmVelX  = [0, 0];
    const palmVelY  = [0, 0];
    const palmInitialized = [false, false];

    // FOV=48°, z=2.2 → visible half-height≈0.979, half-width≈1.741
    // World range: X ∈ [-1.53, 1.53], Y ∈ [-0.86, 0.86]
    const landmarkToWorld = (nx: number, ny: number) => ({
      wx: (nx - 0.5) * -3.06,
      wy: -(ny - 0.5) * 1.72,
    });

    const palmWorld = (hand: { landmarks: Array<{x:number;y:number;z:number}> }) => {
      const p = hand.landmarks[9];  // palm center
      return landmarkToWorld(p.x, p.y);
    };

    // Physics constants
    const GRAVITY       = 2.0;   // world units/s²
    const HIT_RADIUS    = 0.28;  // world units — paddle hit zone
    const RESTITUTION   = 0.82;  // energy kept on wall bounce
    const SPEED_CAP     = 7.0;   // max ball speed
    const BOUNDS_X      = 1.35;
    const BOUNDS_Y_TOP  =  0.82;
    const BOUNDS_Y_BOT  = -0.82;

    const animate = () => {
      frameId = requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 0.05);
      const elapsed = clock.getElapsedTime();
      const state = useHandTrackingStore.getState();
      const { interaction, sphereGlowIntensity, mode, hands } = state;
      const trackingLive = mode === 'running' || mode === 'degraded';
      const isHologram = interaction.effectMode === 'hologram';

      // ── Visibility: stay lit the whole time hologram is active ───────────────
      const targetMix = trackingLive && isHologram ? 1.0 : 0;
      hologramMix += (targetMix - hologramMix) * Math.min(1, dt * 6);
      const visibleMix = Math.max(0, Math.min(1, hologramMix));

      // ── Activate / reset ball ─────────────────────────────────────────────────
      if (isHologram && !wasHologram) {
        // Spawn ball at first hand or screen centre
        if (hands.length > 0) {
          const w = palmWorld(hands[0]);
          ballX = w.wx; ballY = w.wy;
        } else {
          ballX = 0; ballY = 0.2;
        }
        // Small upward kick so it's immediately in play
        ballVelX = (Math.random() - 0.5) * 1.0;
        ballVelY = 1.8;
        rotVelX = 0; rotVelY = 0;
        palmInitialized[0] = false;
        palmInitialized[1] = false;
        gameActive = true;
      }
      if (!isHologram) gameActive = false;
      wasHologram = isHologram;

      // ── Per-hand palm velocity (smooth) ──────────────────────────────────────
      hands.forEach((hand, i) => {
        if (i >= 2) return;
        const { wx, wy } = palmWorld(hand);
        if (!palmInitialized[i]) {
          prevPalmX[i] = wx; prevPalmY[i] = wy;
          palmVelX[i] = 0;  palmVelY[i] = 0;
          palmInitialized[i] = true;
        } else {
          const rawVx = (wx - prevPalmX[i]) / Math.max(dt, 0.001);
          const rawVy = (wy - prevPalmY[i]) / Math.max(dt, 0.001);
          palmVelX[i] = palmVelX[i] * 0.45 + rawVx * 0.55;
          palmVelY[i] = palmVelY[i] * 0.45 + rawVy * 0.55;
          prevPalmX[i] = wx; prevPalmY[i] = wy;
        }
      });
      // Reset velocity for hands that have left the frame
      if (hands.length < 2) { palmVelX[1] = 0; palmVelY[1] = 0; palmInitialized[1] = false; }
      if (hands.length < 1) { palmVelX[0] = 0; palmVelY[0] = 0; palmInitialized[0] = false; }

      // ── Ball physics ──────────────────────────────────────────────────────────
      if (gameActive) {
        // --- Paddle collision for each hand ---
        hands.forEach((hand, i) => {
          if (i >= 2) return;
          const { wx, wy } = palmWorld(hand);
          const dx = ballX - wx;
          const dy = ballY - wy;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < HIT_RADIUS && dist > 0.001) {
            // Push ball out of overlap
            const nx = dx / dist;
            const ny = dy / dist;
            ballX = wx + nx * HIT_RADIUS;
            ballY = wy + ny * HIT_RADIUS;

            // Compute relative velocity along collision normal
            const relVx = ballVelX - palmVelX[i];
            const relVy = ballVelY - palmVelY[i];
            const vRel  = relVx * nx + relVy * ny;

            // Only apply impulse if surfaces are approaching
            if (vRel < 0) {
              const j = -(1.0 + RESTITUTION) * vRel;
              ballVelX += j * nx;
              ballVelY += j * ny;
            }

            // Add palm velocity transfer (the "smash")
            const palmSpeed = Math.sqrt(palmVelX[i] ** 2 + palmVelY[i] ** 2);
            ballVelX += palmVelX[i] * 0.55;
            ballVelY += palmVelY[i] * 0.55;

            // Cap speed
            const spd = Math.sqrt(ballVelX ** 2 + ballVelY ** 2);
            if (spd > SPEED_CAP) { ballVelX *= SPEED_CAP / spd; ballVelY *= SPEED_CAP / spd; }

            // Spin proportional to hit
            rotVelY += palmVelX[i] * 12;
            rotVelX -= palmVelY[i] * 12;
            rotVelX += palmSpeed * (Math.random() - 0.5) * 4;
          }
        });

        // --- Gravity + air damping ---
        ballVelY -= GRAVITY * dt;
        const damp = Math.pow(0.994, dt * 60);
        ballVelX *= damp;
        ballVelY *= damp;

        // --- Integrate ---
        ballX += ballVelX * dt;
        ballY += ballVelY * dt;

        // --- Wall / floor / ceiling bounces ---
        if (ballY < BOUNDS_Y_BOT) {
          ballY = BOUNDS_Y_BOT;
          ballVelY  =  Math.abs(ballVelY)  * RESTITUTION;
          ballVelX *= 0.88;
          rotVelX  += ballVelX * 6;
        }
        if (ballY > BOUNDS_Y_TOP) {
          ballY = BOUNDS_Y_TOP;
          ballVelY  = -Math.abs(ballVelY)  * RESTITUTION;
        }
        if (ballX < -BOUNDS_X) {
          ballX = -BOUNDS_X;
          ballVelX  =  Math.abs(ballVelX)  * RESTITUTION;
          rotVelY  -= ballVelY * 4;
        }
        if (ballX > BOUNDS_X) {
          ballX = BOUNDS_X;
          ballVelX  = -Math.abs(ballVelX)  * RESTITUTION;
          rotVelY  += ballVelY * 4;
        }

        orbGroup.position.set(ballX, ballY, -0.25);
      }

      // --- Rotation: base auto-spin + angular momentum ---
      const spinDecay = Math.pow(0.92, dt * 60);
      rotVelX *= spinDecay;
      rotVelY *= spinDecay;
      orb.rotation.y += dt * (0.3 + visibleMix * 0.5) + rotVelY * dt;
      orb.rotation.x += dt * 0.15 + rotVelX * dt;
      halo.rotation.z += dt * 0.65;

      // --- Scale & opacity ---
      orbGroup.visible = visibleMix > 0.02;
      orbGroup.scale.setScalar(0.28);
      halo.scale.setScalar(0.9 + visibleMix * 0.24);
      halo.position.z = 0.02 + visibleMix * 0.02;

      orbMaterial.uniforms.uTime.value = elapsed;
      orbMaterial.uniforms.uGlowIntensity.value = sphereGlowIntensity * Math.max(0.45, visibleMix);
      coreMaterial.opacity = 0.10 + visibleMix * 0.18;
      haloMaterial.opacity = 0.14 + visibleMix * 0.22;

      // Particles only in hologram mode
      spawnAccumulator += dt;
      if (trackingLive && isHologram && spawnAccumulator > 0.04) {
        spawnAccumulator = 0;
        particleSystem.spawn(
          {
            x: orbGroup.position.x + (Math.random() - 0.5) * 0.55,
            y: orbGroup.position.y + (Math.random() - 0.5) * 0.55,
            z: -0.1 + (Math.random() - 0.5) * 0.12,
          },
          6,
        );
      }

      particleSystem.mesh.visible = visibleMix > 0.02;
      particleSystem.material.opacity = 0.2 + visibleMix * 0.8;
      particleSystem.update(dt);

      composer.render();
    };

    animate();

    const handleResize = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
      composer.setSize(width, height);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('resize', handleResize);
      particleSystem.dispose();
      orbGeometry.dispose();
      orbMaterial.dispose();
      coreGeometry.dispose();
      coreMaterial.dispose();
      haloGeometry.dispose();
      haloMaterial.dispose();
      composer.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [videoRef]);

  return <div ref={containerRef} className="absolute inset-0 z-20 pointer-events-none" style={{ mixBlendMode: 'screen' }} />;
}
