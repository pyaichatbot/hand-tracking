import * as THREE from 'three';

// Per-particle RGB palette matching reference: white, pink, purple, orange, neon-green, cyan
const PALETTE: [number, number, number][] = [
  [1.0, 1.0, 1.0],   // white
  [1.0, 0.18, 0.82],  // hot pink
  [0.6, 0.18, 1.0],   // purple
  [1.0, 0.58, 0.0],   // orange
  [0.0, 1.0, 0.53],   // neon green
  [0.0, 0.95, 1.0],   // cyan
];

interface ParticleData {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  r: number;
  g: number;
  b: number;
}

export class ParticleSystem {
  private particles: ParticleData[] = [];
  private geometry: THREE.BufferGeometry;
  public material: THREE.PointsMaterial;
  public mesh: THREE.Points;
  private maxParticles: number;
  private positions: Float32Array;
  private colors: Float32Array;

  constructor(maxParticles: number = 200) {
    this.maxParticles = maxParticles;

    this.positions = new Float32Array(maxParticles * 3);
    this.colors = new Float32Array(maxParticles * 3);

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));

    this.material = new THREE.PointsMaterial({
      size: 0.016,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.mesh = new THREE.Points(this.geometry, this.material);
  }

  spawn(position: { x: number; y: number; z: number }, count: number = 10) {
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= this.maxParticles) {
        this.particles.shift();
      }

      const [r, g, b] = PALETTE[Math.floor(Math.random() * PALETTE.length)];

      this.particles.push({
        x: position.x,
        y: position.y,
        z: position.z,
        vx: (Math.random() - 0.5) * 0.022,
        vy: (Math.random() - 0.5) * 0.022,
        vz: (Math.random() - 0.5) * 0.012,
        life: 1.8 + Math.random() * 1.8,
        r,
        g,
        b,
      });
    }
  }

  update(dt: number) {
    this.particles = this.particles.filter((p) => {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vy -= 0.003 * dt; // gentle gravity
      p.life -= dt;
      return p.life > 0;
    });

    for (let i = 0; i < this.maxParticles; i++) {
      if (i < this.particles.length) {
        const p = this.particles[i];
        this.positions[i * 3] = p.x;
        this.positions[i * 3 + 1] = p.y;
        this.positions[i * 3 + 2] = p.z;
        this.colors[i * 3] = p.r;
        this.colors[i * 3 + 1] = p.g;
        this.colors[i * 3 + 2] = p.b;
      } else {
        this.positions[i * 3 + 2] = -999; // push offscreen
      }
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}

