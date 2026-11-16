// Hostile AI: rushers charge, marksmen hold long sightlines, grenadiers lob.
// Enemies take cover, peek, fire bursts, reposition and flank.
import * as THREE from 'three';
import { clamp, lerp, angleLerp, rand, randPick, aabbOverlapCircle } from './utils.js';

export const TYPES = {
  rusher: { hp: 50, speed: 4.6, color: 0x8a3a20, accent: 0xff7a2a, damage: 6, burst: 5, burstGap: 1.0, accuracy: 0.22, score: 100, range: 26, label: 'RAIDER' },
  marksman: { hp: 60, speed: 2.6, color: 0x3d4a5c, accent: 0x7ab8ff, damage: 18, burst: 2, burstGap: 2.4, accuracy: 0.52, score: 150, range: 55, label: 'DEADEYE' },
  grenadier: { hp: 85, speed: 3.0, color: 0x44592f, accent: 0x9fe870, damage: 8, burst: 3, burstGap: 1.8, accuracy: 0.28, score: 200, range: 34, label: 'BOOMER' },
};

function segBlocked(a, b, colliders) {
  for (let i = 1; i < 12; i++) {
    const t = i / 12;
    const x = lerp(a.x, b.x, t), y = lerp(a.y, b.y, t), z = lerp(a.z, b.z, t);
    for (const c of colliders) {
      if (y < c.h && x > c.minX && x < c.maxX && z > c.minZ && z < c.maxZ) return true;
    }
  }
  return false;
}

export class Enemy {
  constructor(ctx, type, x, z, rng) {
    this.ctx = ctx; this.type = type; this.cfg = TYPES[type];
    this.rng = rng;
    this.hp = this.cfg.hp; this.alive = true; this.deadT = 0;
    this.pos = new THREE.Vector3(x, 0, z);
    this.yaw = 0; this.speed = this.cfg.speed;
    this.state = 'advance';
    this.cover = null; this.repositionT = rand(rng, 3, 6);
    this.burstLeft = 0; this.shotT = 0; this.burstT = rand(rng, 0.5, 1.5);
    this.nadeT = rand(rng, 2, 4);
    this.flashT = 0; this.walkPhase = rng() * 6;
    this.group = this._build();
    this.group.position.copy(this.pos);
    this.ctx.enemyRoot.add(this.group);
    this._muzzle = new THREE.Object3D();
    this._muzzle.position.set(0.3, 1.35, -0.5);
    this.group.add(this._muzzle);
    this._muzzleWorld = new THREE.Vector3();
  }
  _build() {
    const g = new THREE.Group();
    const c = this.cfg.color, a = this.cfg.accent;
    const body = new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x22252a, roughness: 0.8 });
    const glow = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: a, emissiveIntensity: 1.4 });
    const add = (geo, m, x, y, z, part) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.userData.enemy = this;
      if (part) mesh.userData.part = part;
      g.add(mesh); return mesh;
    };
    const bulky = this.type === 'grenadier' ? 1.25 : this.type === 'rusher' ? 0.9 : 1;
    // legs
    this.legL = add(new THREE.BoxGeometry(0.16, 0.8, 0.18), dark, -0.11, 0.4, 0, 'body');
    this.legR = add(new THREE.BoxGeometry(0.16, 0.8, 0.18), dark, 0.11, 0.4, 0, 'body');
    // torso + vest
    add(new THREE.BoxGeometry(0.52 * bulky, 0.62, 0.3), body, 0, 1.12, 0, 'body');
    add(new THREE.BoxGeometry(0.56 * bulky, 0.4, 0.34), dark, 0, 1.12, 0, 'body');
    add(new THREE.BoxGeometry(0.2, 0.08, 0.05), glow, 0, 1.28, 0.18, 'body'); // chest light
    // head + visor
    this.headMesh = add(new THREE.BoxGeometry(0.3, 0.3, 0.3), body, 0, 1.62, 0, 'head');
    add(new THREE.BoxGeometry(0.32, 0.08, 0.05), glow, 0, 1.64, 0.16, 'head');
    // arms + rifle
    this.armL = add(new THREE.BoxGeometry(0.13, 0.55, 0.15), body, -0.3, 1.15, -0.1, 'body');
    this.armR = add(new THREE.BoxGeometry(0.13, 0.55, 0.15), body, 0.3, 1.15, -0.1, 'body');
    const gunLen = this.type === 'marksman' ? 1.1 : 0.8;
    add(new THREE.BoxGeometry(0.07, 0.1, gunLen), dark, 0.22, 1.3, -0.35, 'body');
    if (this.type === 'grenadier') add(new THREE.BoxGeometry(0.4, 0.5, 0.2), dark, 0, 1.15, 0.22, 'body'); // pack
    // health bar (two planes, billboarded)
    this.barBg = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.09), new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.85, depthWrite: false }));
    this.barBg.position.y = 2.0;
    this.barBg.raycast = () => {};
    this.barFg = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 0.06), new THREE.MeshBasicMaterial({ color: 0xff4444, depthWrite: false }));
    this.barFg.position.set(0, 2.0, 0.005);
    this.barFg.raycast = () => {};
    g.add(this.barBg); g.add(this.barFg);
    this._bodyMat = body;
    return g;
  }
  eyePos() { return new THREE.Vector3(this.pos.x, 1.55, this.pos.z); }
  _losTo(p) {
    return !segBlocked(this.eyePos(), p, this.ctx.world.colliders);
  }
  _moveToward(tx, tz, dt) {
    const dx = tx - this.pos.x, dz = tz - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.2) return true;
    const step = Math.min(d, this.speed * dt);
    const nx = this.pos.x + (dx / d) * step;
    const nz = this.pos.z + (dz / d) * step;
    const w = this.ctx.world;
    const blocked = (x, z) => {
      if (Math.abs(x) > w.bounds || Math.abs(z) > w.bounds) return true;
      for (const c of w.colliders) if (aabbOverlapCircle(c, x, z, 0.5)) return true;
      return false;
    };
    if (!blocked(nx, this.pos.z)) this.pos.x = nx;
    if (!blocked(this.pos.x, nz)) this.pos.z = nz;
    this.walkPhase += dt * 9;
    const sw = Math.sin(this.walkPhase) * 0.35;
    this.legL.rotation.x = sw; this.legR.rotation.x = -sw;
    this.armL.rotation.x = -0.4 + sw * 0.2; this.armR.rotation.x = -0.4 - sw * 0.2;
    return d < 0.6;
  }
  _pickCover(playerPos) {
    const pts = this.ctx.world.coverPoints;
    const cands = [];
    for (const p of pts) {
      const dP = Math.hypot(p.x - playerPos.x, p.z - playerPos.z);
      const dM = Math.hypot(p.x - this.pos.x, p.z - this.pos.z);
      if (dP < 9 || dP > this.cfg.range) continue;
      cands.push({ p, score: dM + Math.abs(dP - 18) * 0.5 + this.rng() * 6 });
    }
    if (!cands.length) return null;
    cands.sort((a, b) => a.score - b.score);
    return cands[0].p;
  }
  _fireOnce(player) {
    const muzzle = this._muzzleWorld;
    this._muzzle.getWorldPosition(muzzle);
    const chest = new THREE.Vector3(player.pos.x, player.pos.y + player.eyeH - 0.35, player.pos.z);
    const dist = muzzle.distanceTo(chest);
    let acc = this.cfg.accuracy * (1 - dist / (this.cfg.range * 1.6));
    if (player.sprinting) acc *= 0.8;
    if (player.crouching) acc *= 0.85;
    const hit = this.rng() < clamp(acc, 0.03, 0.6);
    const end = chest.clone();
    if (!hit) { end.x += (this.rng() - 0.5) * 3; end.y += (this.rng() - 0.5) * 2; end.z += (this.rng() - 0.5) * 3; }
    this.ctx.effects.tracer(muzzle, end, 0xff5544);
    this.ctx.effects.muzzle(muzzle, end.clone().sub(muzzle).normalize());
    this.ctx.sfx.enemyShot(dist);
    this.ctx.stats.enemyShots += 1;
    if (hit) player.damage(this.cfg.damage, this.pos);
  }
  _lobGrenade(player) {
    const from = this.eyePos();
    const to = new THREE.Vector3(player.pos.x, 0, player.pos.z);
    const dist = from.distanceTo(to);
    const t = clamp(dist / 16, 0.7, 1.6);
    const vel = new THREE.Vector3((to.x - from.x) / t, (0.5 * 9.8 * t * t + (0 - from.y)) / t + 2.2, (to.z - from.z) / t);
    this.ctx.grenades.push({ pos: from.clone(), vel, t: 0, fuse: t + 0.55, ring: null, target: to.clone() });
    this.ctx.stats.grenadesThrown += 1;
    this.ctx.sfx.beep();
  }
  damage(amount, head, player) {
    if (!this.alive) return false;
    this.hp -= amount;
    this.flashT = 0.12;
    this._bodyMat.emissive = new THREE.Color(0x881111);
    this._bodyMat.emissiveIntensity = 0.9;
    const frac = Math.max(0, this.hp / this.cfg.hp);
    this.barFg.scale.x = frac;
    if (this.hp <= 0) {
      this.alive = false; this.deadT = 0;
      this.barBg.visible = false; this.barFg.visible = false;
      this.ctx.onEnemyKilled(this, head, player);
      return true;
    }
    // getting shot makes them reposition
    this.repositionT = Math.min(this.repositionT, 0.8);
    return false;
  }
  update(dt, player, time) {
    if (!this.alive) {
      this.deadT += dt;
      const k = Math.min(1, this.deadT / 0.45);
      this.group.rotation.z = k * Math.PI / 2 * 0.9;
      if (this.deadT > 2.2) this.group.position.y = -((this.deadT - 2.2) * 0.5);
      return this.deadT < 3.2;
    }
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) { this._bodyMat.emissiveIntensity = 0; }
    }
    const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    const targetYaw = Math.atan2(dx, dz);
    this.yaw = angleLerp(this.yaw, targetYaw, 1 - Math.exp(-8 * dt));
    this.group.rotation.y = this.yaw;
    this.group.position.set(this.pos.x, this.pos.y, this.pos.z);
    // health bar faces camera
    this.barBg.quaternion.copy(this.ctx.camera.quaternion);
    this.barFg.quaternion.copy(this.ctx.camera.quaternion);
    const los = this._losTo(new THREE.Vector3(player.pos.x, player.pos.y + player.eyeH - 0.3, player.pos.z));
    const pPos = player.pos;
    this.repositionT -= dt;
    if (this.type === 'rusher' && dist < 17) {
      // charge, strafing while firing
      const strafe = Math.sin(time * 1.7 + this.walkPhase) * 0.6;
      const px = -dz / (dist || 1), pz = dx / (dist || 1);
      this._moveToward(pPos.x + px * strafe, pPos.z + pz * strafe, dt);
      this.burstT -= dt;
      if (los && this.burstT <= 0 && dist < 20) { this.burstLeft = this.cfg.burst; this.burstT = this.cfg.burstGap; }
    } else if (this.type === 'grenadier' && dist > 10 && dist < 32) {
      this.nadeT -= dt;
      if (los && this.nadeT <= 0) { this._lobGrenade(player); this.nadeT = rand(this.rng, 4, 6.5); }
      if (!this.cover || this.repositionT <= 0) { this.cover = this._pickCover(pPos); this.repositionT = rand(this.rng, 4, 7); }
      if (this.cover) this._moveToward(this.cover.x, this.cover.z, dt);
      this.burstT -= dt;
      if (los && this.burstT <= 0 && dist < 24) { this.burstLeft = 2; this.burstT = this.cfg.burstGap; }
    } else {
      if (!this.cover || this.repositionT <= 0 || dist > this.cfg.range * 0.9) {
        this.cover = this._pickCover(pPos);
        this.repositionT = rand(this.rng, 4, 7);
      }
      if (this.cover) {
        const arrived = this._moveToward(this.cover.x, this.cover.z, dt);
        if (arrived && los) {
          this.burstT -= dt;
          if (this.burstT <= 0) { this.burstLeft = this.cfg.burst; this.burstT = this.cfg.burstGap; }
        }
      } else if (los) {
        this.burstT -= dt;
        if (this.burstT <= 0) { this.burstLeft = this.cfg.burst; this.burstT = this.cfg.burstGap; }
      }
    }
    // fire burst
    if (this.burstLeft > 0) {
      this.shotT -= dt;
      if (this.shotT <= 0) {
        this.shotT = 0.13;
        this.burstLeft -= 1;
        if (los) this._fireOnce(player);
      }
    }
    return true;
  }
}

export class EnemyManager {
  constructor(ctx) {
    this.ctx = ctx;
    this.list = [];
    this.grenades = [];
    ctx.grenades = this.grenades;
    // grenade visuals pool
    this._nadeGeo = new THREE.SphereGeometry(0.16, 10, 8);
    this._nadeMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xff2222, emissiveIntensity: 0.8 });
    this._ringGeo = new THREE.RingGeometry(0.9, 1.1, 24);
    this._ringMat = new THREE.MeshBasicMaterial({ color: 0xff3333, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
  }
  reset() {
    for (const e of this.list) this.ctx.enemyRoot.remove(e.group);
    this.list = [];
    for (const g of this.grenades) { if (g.mesh) this.ctx.scene.remove(g.mesh); if (g.ring) this.ctx.scene.remove(g.ring); }
    this.grenades = [];
    this.ctx.grenades = this.grenades;
  }
  spawnRound(round, rng) {
    const count = Math.min(3 + round * 2, 10);
    const spots = [...this.ctx.world.spawnPoints];
    const player = this.ctx.player;
    for (let i = 0; i < count; i++) {
      let type = 'rusher';
      const r = rng();
      if (round >= 2 && r < 0.25) type = 'grenadier';
      else if (r < 0.45) type = 'marksman';
      else if (r < 0.8) type = 'rusher';
      else type = 'marksman';
      // pick a spawn far from the player
      let sp = null;
      for (let tries = 0; tries < 8; tries++) {
        const cand = spots.splice(Math.floor(rng() * spots.length), 1)[0];
        if (!cand) break;
        if (Math.hypot(cand[0] - player.pos.x, cand[1] - player.pos.z) > 14) { sp = cand; break; }
        if (!sp) sp = cand;
      }
      if (!sp) sp = [rand(rng, -26, 26), rand(rng, -28, -10)];
      this.list.push(new Enemy(this.ctx, type, sp[0], sp[1], rng));
    }
  }
  aliveCount() { return this.list.filter((e) => e.alive).length; }
  update(dt, player, time) {
    this.list = this.list.filter((e) => {
      const keep = e.update(dt, player, time);
      if (!keep) this.ctx.enemyRoot.remove(e.group);
      return keep;
    });
    // grenades
    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const g = this.grenades[i];
      if (!g.mesh) {
        g.mesh = new THREE.Mesh(this._nadeGeo, this._nadeMat);
        g.mesh.castShadow = true;
        this.ctx.scene.add(g.mesh);
        g.ring = new THREE.Mesh(this._ringGeo, this._ringMat.clone());
        g.ring.rotation.x = -Math.PI / 2;
        g.ring.position.set(g.target.x, 0.06, g.target.z);
        this.ctx.scene.add(g.ring);
      }
      g.t += dt;
      g.vel.y -= 9.8 * dt;
      g.pos.addScaledVector(g.vel, dt);
      if (g.pos.y < 0.16) { g.pos.y = 0.16; g.vel.y *= -0.35; g.vel.x *= 0.7; g.vel.z *= 0.7; }
      g.mesh.position.copy(g.pos);
      g.ring.material.opacity = 0.5 + 0.3 * Math.sin(g.t * 12);
      if (g.t >= g.fuse) {
        const p = g.pos.clone();
        this.ctx.scene.remove(g.mesh);
        this.ctx.scene.remove(g.ring);
        this.grenades.splice(i, 1);
        this.ctx.effects.explosion(p);
        this.ctx.sfx.explosion();
        const d = Math.hypot(player.pos.x - p.x, player.pos.z - p.z);
        if (d < 3) player.damage(45, p);
        else if (d < 6.5) player.damage(22, p);
      }
    }
  }
}
