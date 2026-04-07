import { useRef, useEffect, MutableRefObject } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { useHandTrackingStore } from '../store/handTrackingStore';
import { ExponentialSmoothingFilter } from '../utils/smoothing';
import { normalizedToClip } from '../utils/distance';
import { ParticleSystem } from './ParticleSystem';
import glowVert from '../shaders/glowSphere.vert';
import glowFrag from '../shaders/glowSphere.frag';
import scanVert from '../shaders/scanLines.vert';
import scanFrag from '../shaders/scanLines.frag';

// Skeleton connection map per the MediaPipe hand standard
const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],       // thumb
  [0, 5], [5, 6], [6, 7], [7, 8],       // index
  [0, 9], [9, 10], [10, 11], [11, 12],  // middle
  [0, 13], [13, 14], [14, 15], [15, 16], // ring
  [0, 17], [17, 18], [18, 19], [19, 20], // pinky
  [5, 9], [9, 13], [13, 17],             // palm
];

interface Scene3DProps {
  videoRef: MutableRefObject<HTMLVideoElement | null>;
}

export default function Scene3D({ videoRef }: Scene3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    // === Scene ===
    const scene = new THREE.Scene();

    // === Camera ===
    const camera = new THREE.PerspectiveCamera(75, width / height, 0.01, 100);
    camera.position.z = 0.5;

    // === Renderer ===
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    // === Post-processing (Bloom) ===
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(width, height),
      1.0, // strength
      0.4, // radius
      0.85, // threshold
    );
    composer.addPass(bloomPass);

    // === Lighting ===
    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const rimLight = new THREE.DirectionalLight(0x00ff88, 0.5);
    rimLight.position.set(1, 1, 1);
    scene.add(rimLight);

    // === Glowing Sphere ===
    const sphereGeometry = new THREE.IcosahedronGeometry(0.1, 4);
    const sphereMaterial = new THREE.ShaderMaterial({
      vertexShader: glowVert,
      fragmentShader: glowFrag,
      uniforms: {
        uTime: { value: 0 },
        uGlowIntensity: { value: 0.8 },
        uColor: { value: new THREE.Color(0x00ff88) },
      },
      transparent: true,
      wireframe: true,
      side: THREE.DoubleSide,
    });
    const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
    scene.add(sphere);

    // === Grid Scan Lines ===
    const gridGeometry = new THREE.PlaneGeometry(0.8, 0.8);
    const gridMaterial = new THREE.ShaderMaterial({
      vertexShader: scanVert,
      fragmentShader: scanFrag,
      uniforms: {
        uTime: { value: 0 },
        uLineCount: { value: 18 },
        uColor: { value: new THREE.Color(0x00ff88) },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const gridMesh = new THREE.Mesh(gridGeometry, gridMaterial);
    gridMesh.position.z = 0.01;
    scene.add(gridMesh);

    // === Particle System ===
    const particleSystem = new ParticleSystem(200);
    scene.add(particleSystem.mesh);

    // === Hand Skeleton Lines ===
    const skeletonGroup = new THREE.Group();
    scene.add(skeletonGroup);

    // Joint markers (small spheres at each landmark)
    const jointGeometry = new THREE.SphereGeometry(0.003, 8, 8);
    const jointMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ff88,
      transparent: true,
      opacity: 0.8,
    });

    // Smoothing filters for hand positions (one per landmark per hand, lazy init)
    const smoothingFilters: ExponentialSmoothingFilter[][] = [];

    // Clock
    const clock = new THREE.Clock();
    let spawnAccumulator = 0;

    // Animation frame ref
    let frameRef: number;

    const animate = () => {
      frameRef = requestAnimationFrame(animate);
      const dt = clock.getDelta();
      const elapsed = clock.getElapsedTime();

      // Read store state
      const state = useHandTrackingStore.getState();
      const { hands, sphereScale, sphereGlowIntensity, showGrid } = state;

      // === Update sphere ===
      sphereMaterial.uniforms.uTime.value = elapsed;
      sphereMaterial.uniforms.uGlowIntensity.value = sphereGlowIntensity;
      sphere.scale.setScalar(sphereScale);
      sphere.rotation.y += 0.005 + (state.interaction.isInteracting ? 0.01 : 0);
      sphere.rotation.x += 0.002;

      // === Update grid ===
      gridMaterial.uniforms.uTime.value = elapsed;
      gridMesh.visible = showGrid;

      // === Update hand skeleton ===
      // Clear previous skeleton
      while (skeletonGroup.children.length) {
        const child = skeletonGroup.children[0];
        skeletonGroup.remove(child);
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
        }
        if (child instanceof THREE.Line) {
          child.geometry.dispose();
        }
      }

      hands.forEach((hand, hIdx) => {
        // Ensure smoothing filters exist
        if (!smoothingFilters[hIdx]) {
          smoothingFilters[hIdx] = hand.landmarks.map(
            () => new ExponentialSmoothingFilter(0.4),
          );
        }

        const smoothedLandmarks = hand.landmarks.map((lm, lIdx) => {
          if (!smoothingFilters[hIdx][lIdx]) {
            smoothingFilters[hIdx][lIdx] = new ExponentialSmoothingFilter(0.4);
          }
          return smoothingFilters[hIdx][lIdx].filter(lm);
        });

        // Convert to Three.js coords
        const positions = smoothedLandmarks.map((lm) => {
          const { cx, cy } = normalizedToClip(lm.x, lm.y);
          return new THREE.Vector3(cx * 0.35, cy * 0.35, -(lm.z || 0) * 0.1);
        });

        // Draw joints
        positions.forEach((pos) => {
          const joint = new THREE.Mesh(jointGeometry, jointMaterial);
          joint.position.copy(pos);
          skeletonGroup.add(joint);
        });

        // Draw connections
        for (const [a, b] of HAND_CONNECTIONS) {
          const lineGeometry = new THREE.BufferGeometry().setFromPoints([
            positions[a],
            positions[b],
          ]);
          const lineMaterial = new THREE.LineBasicMaterial({
            color: 0x00ff88,
            transparent: true,
            opacity: 0.7,
          });
          const line = new THREE.Line(lineGeometry, lineMaterial);
          skeletonGroup.add(line);
        }

        // Spawn particles from fingertips
        spawnAccumulator += dt;
        if (spawnAccumulator > 0.05) {
          spawnAccumulator = 0;
          const tips = [4, 8, 12, 16, 20];
          tips.forEach((tipIdx) => {
            const tp = positions[tipIdx];
            particleSystem.spawn({ x: tp.x, y: tp.y, z: tp.z }, 2);
          });
        }
      });

      // Reset filters for hands that left frame
      if (hands.length < smoothingFilters.length) {
        smoothingFilters.length = hands.length;
      }

      // === Update particles ===
      particleSystem.update(dt);

      // === Render ===
      composer.render();
    };

    animate();

    // === Handle context loss ===
    const handleContextLost = (event: Event) => {
      event.preventDefault();
    };
    const handleContextRestored = () => {
      renderer.setSize(width, height);
    };
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', handleContextRestored);

    // === Handle resize ===
    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      composer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      cancelAnimationFrame(frameRef);
      renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', handleContextRestored);
      window.removeEventListener('resize', handleResize);
      particleSystem.dispose();
      sphereGeometry.dispose();
      sphereMaterial.dispose();
      gridGeometry.dispose();
      gridMaterial.dispose();
      jointGeometry.dispose();
      jointMaterial.dispose();
      renderer.dispose();
      composer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [videoRef]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 z-10"
      style={{ pointerEvents: 'none' }}
    />
  );
}
