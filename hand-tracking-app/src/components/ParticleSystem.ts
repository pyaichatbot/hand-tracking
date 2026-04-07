import * as THREE from 'three';

const PARTICLE_COLORS = [0x00ff88, 0x00ffff, 0xff00ff, 0xffff00];

interface ParticleData {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
}

export class ParticleSystem {
  private particles: ParticleData[] = [];
  private geometry: THREE.BufferGeometry;
  private material: THREE.PointsMaterial;
  public mesh: THREE.Points;
  private maxParticles: number;
  private positions: Float32Array;

  constructor(maxParticles: number = 200) {
    this.maxParticles = maxParticles;

    this.positions = new Float32Array(maxParticles * 3);
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));

    this.material = new THREE.PointsMaterial({
      size: 0.008,
      sizeAttenuation: true,
      color: 0x00ff88,
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

      this.particles.push({
        x: position.x,
        y: position.y,
        z: position.z,
        vx: (Math.random() - 0.5) * 0.02,
        vy: (Math.random() - 0.5) * 0.02,
        vz: (Math.random() - 0.5) * 0.01,
        life: 1.5 + Math.random() * 1.5,
      });
    }
  }

  update(dt: number) {
    this.particles = this.particles.filter((p) => {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vy -= 0.002 * dt; // gravity
      p.life -= dt;
      return p.life > 0;
    });

    // Update buffer
    for (let i = 0; i < this.maxParticles; i++) {
      if (i < this.particles.length) {
        this.positions[i * 3] = this.particles[i].x;
        this.positions[i * 3 + 1] = this.particles[i].y;
        this.positions[i * 3 + 2] = this.particles[i].z;
      } else {
        this.positions[i * 3] = 0;
        this.positions[i * 3 + 1] = 0;
        this.positions[i * 3 + 2] = -999; // offscreen
      }
    }
    this.geometry.attributes.position.needsUpdate = true;

    // Cycle color
    const colorIdx = Math.floor(performance.now() / 500) % PARTICLE_COLORS.length;
    this.material.color.setHex(PARTICLE_COLORS[colorIdx]);
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
