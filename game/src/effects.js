// Tracers, muzzle flash, impact sparks, explosions, floating damage text.
import * as THREE from 'three';
import { clamp } from './utils.js';

function flashTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,240,180,1)');
  grad.addColorStop(0.35, 'rgba(255,160,40,0.9)');
  grad.addColorStop(1, 'rgba(255,80,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.tracers = [];
    this.particles = [];
    this._flashTex = flashTexture();
    // Tracer pool
    this._tracerGeo = new THREE.BufferGeometry();
    this._tracerGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    for (let i = 0; i < 14; i++) {
      const m = new THREE.LineBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending });
      const line = new THREE.Line(this._tracerGeo.clone(), m);
      line.frustumCulled = false;
      line.visible = false;
      scene.add(line);
      this.tracers.push({ line, life: 0 });
    }
    this._tracerIdx = 0;
    // Muzzle flash light (shared, moves to the shooter)
    this.flashLight = new THREE.PointLight(0xffc266, 0, 14, 1.8);
    scene.add(this.flashLight);
    // Muzzle flash quad pool
    this._flashes = [];
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(0.55, 0.55),
        new THREE.MeshBasicMaterial({ map: this._flashTex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })
      );
      m.visible = false;
      scene.add(m);
      this._flashes.push({ mesh: m, life: 0 });
    }
    this._flashIdx = 0;
    // Particle pool (sparks / smoke / explosion debris)
    this._pGeo = new THREE.BufferGeometry();
    this._pGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
    for (let i = 0; i < 60; i++) {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(0.07, 0.07, 0.07),
        new THREE.MeshBasicMaterial({ color: 0xffcc66, transparent: true, opacity: 0 })
      );
      m.visible = false;
      scene.add(m);
      this.particles.push({ mesh: m, vel: new THREE.Vector3(), life: 0, max: 1, grav: 0 });
    }
    this._pIdx = 0;
    // Explosion flash light
    this.boomLight = new THREE.PointLight(0xff7722, 0, 26, 1.6);
    scene.add(this.boomLight);
  }
  tracer(from, to, color = 0xffd27a) {
    const t = this.tracers[this._tracerIdx++ % this.tracers.length];
    const pos = t.line.geometry.attributes.position;
    pos.setXYZ(0, from.x, from.y, from.z);
    pos.setXYZ(1, to.x, to.y, to.z);
    pos.needsUpdate = true;
    t.line.material.color.setHex(color);
    t.line.material.opacity = 0.95;
    t.line.visible = true;
    t.life = 0.09;
  }
  muzzle(pos, dir) {
    const f = this._flashes[this._flashIdx++ % this._flashes.length];
    f.mesh.position.copy(pos);
    f.mesh.lookAt(pos.clone().add(dir));
    f.mesh.rotation.z = Math.random() * Math.PI;
    f.mesh.material.opacity = 1;
    f.mesh.visible = true;
    f.life = 0.05;
    this.flashLight.position.copy(pos);
    this.flashLight.intensity = 26;
  }
  burst(pos, n, color, speed = 4, grav = 9, life = 0.5) {
    for (let i = 0; i < n; i++) {
      const p = this.particles[this._pIdx++ % this.particles.length];
      p.mesh.position.copy(pos);
      p.vel.set((Math.random() - 0.5) * speed, Math.random() * speed * 0.7, (Math.random() - 0.5) * speed);
      p.mesh.material.color.setHex(color);
      p.mesh.material.opacity = 1;
      p.mesh.visible = true;
      p.life = p.max = life * (0.5 + Math.random() * 0.5);
      p.grav = grav;
    }
  }
  explosion(pos) {
    this.burst(pos, 26, 0xff8833, 9, 7, 0.8);
    this.burst(pos, 14, 0xffcc66, 5, 4, 0.6);
    this.burst(pos, 10, 0x666666, 2.5, -1.5, 1.4);
    this.boomLight.position.copy(pos).y += 1;
    this.boomLight.intensity = 120;
  }
  update(dt) {
    for (const t of this.tracers) {
      if (t.life > 0) {
        t.life -= dt;
        t.line.material.opacity = Math.max(0, t.life / 0.09) * 0.95;
        if (t.life <= 0) t.line.visible = false;
      }
    }
    for (const f of this._flashes) {
      if (f.life > 0) {
        f.life -= dt;
        f.mesh.material.opacity = Math.max(0, f.life / 0.05);
        if (f.life <= 0) f.mesh.visible = false;
      }
    }
    this.flashLight.intensity = Math.max(0, this.flashLight.intensity - dt * 400);
    this.boomLight.intensity = Math.max(0, this.boomLight.intensity - dt * 260);
    for (const p of this.particles) {
      if (p.life > 0) {
        p.life -= dt;
        p.vel.y -= p.grav * dt;
        p.mesh.position.addScaledVector(p.vel, dt);
        p.mesh.material.opacity = clamp(p.life / p.max, 0, 1);
        p.mesh.rotation.x += dt * 6; p.mesh.rotation.y += dt * 8;
        if (p.life <= 0) p.mesh.visible = false;
      }
    }
  }
}
