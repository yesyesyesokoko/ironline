// Player: first-person movement, rifle, health/ammo. Wired by main.js via ctx.
import * as THREE from 'three';
import { clamp, damp, lerp, aabbOverlapCircle } from './utils.js';

const EYE_STAND = 1.7, EYE_CROUCH = 1.12;
const MAG = 30;

export class Player {
  constructor(ctx) {
    this.ctx = ctx; // { scene, camera, world, effects, sfx, hud, shootTargets, onKill, onPlayerDeath }
    this.pos = new THREE.Vector3(0, 0, 20);
    this.yaw = Math.PI; this.pitch = 0;
    this.velY = 0; this.grounded = true;
    this.hp = 100; this.maxHp = 100;
    this.mag = MAG; this.reserve = 150;
    this.reloading = false; this.reloadT = 0;
    this.fireT = 0; this.bloom = 0;
    this.crouching = false; this.sprinting = false; this.aiming = false;
    this.eyeH = EYE_STAND;
    this.recoilPitch = 0; this.recoilYaw = 0;
    this.lastDamageT = -99; this.alive = true;
    this.kills = 0; this.shotsFired = 0; this.shotsHit = 0;
    this._buildGun();
  }
  _buildGun() {
    const g = new THREE.Group();
    const dark = new THREE.MeshStandardMaterial({ color: 0x1c1f22, roughness: 0.45, metalness: 0.7 });
    const mid = new THREE.MeshStandardMaterial({ color: 0x3a3f45, roughness: 0.5, metalness: 0.6 });
    const accent = new THREE.MeshStandardMaterial({ color: 0x8a6a20, roughness: 0.5, metalness: 0.5 });
    const add = (geo, m, x, y, z) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, z);
      g.add(mesh); return mesh;
    };
    add(new THREE.BoxGeometry(0.07, 0.11, 0.55), dark, 0, 0, -0.1);            // receiver
    add(new THREE.CylinderGeometry(0.025, 0.025, 0.42, 8), dark, 0, 0.01, -0.5).rotation.x = Math.PI / 2; // barrel
    add(new THREE.BoxGeometry(0.05, 0.05, 0.3), mid, 0, -0.01, -0.42);          // handguard
    add(new THREE.BoxGeometry(0.04, 0.09, 0.12), dark, 0, -0.09, 0.05);         // grip
    add(new THREE.BoxGeometry(0.05, 0.13, 0.06), dark, 0, -0.11, -0.12);        // magazine
    add(new THREE.BoxGeometry(0.03, 0.06, 0.1), mid, 0, 0.085, -0.05);          // sight
    add(new THREE.BoxGeometry(0.02, 0.03, 0.02), accent, 0, 0.1, -0.28);        // front post
    add(new THREE.BoxGeometry(0.09, 0.03, 0.2), mid, 0, -0.02, 0.18);          // stock
    this.muzzle = new THREE.Object3D();
    this.muzzle.position.set(0, 0.01, -0.72);
    g.add(this.muzzle);
    this.gun = g;
    this.gunBase = new THREE.Vector3(0.28, -0.26, -0.5);
    this.gunAds = new THREE.Vector3(0, -0.155, -0.42);
    g.position.copy(this.gunBase);
    this.ctx.camera.add(g);
    this.gunKick = 0;
  }
  reset(x, z, yaw) {
    this.pos.set(x, 0, z); this.yaw = yaw; this.pitch = 0;
    this.hp = this.maxHp; this.mag = MAG; this.reserve = 150;
    this.reloading = false; this.alive = true; this.bloom = 0;
    this.kills = 0; this.shotsFired = 0; this.shotsHit = 0;
    this.lastDamageT = -99;
  }
  eyePos() { return new THREE.Vector3(this.pos.x, this.pos.y + this.eyeH, this.pos.z); }
  forward() {
    return new THREE.Vector3(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
  }
  update(dt, input, time) {
    if (!this.alive) return;
    // Look
    const look = input.consumeLook();
    const sens = this.aiming ? 0.0012 : 0.0021;
    this.yaw -= look.dx * sens;
    this.pitch = clamp(this.pitch - look.dy * sens, -1.45, 1.45);
    // Recoil recovery
    this.recoilPitch = damp(this.recoilPitch, 0, 9, dt);
    this.recoilYaw = damp(this.recoilYaw, 0, 9, dt);
    this.bloom = damp(this.bloom, 0, 6, dt);
    // Stance
    this.crouching = input.down('KeyC') || input.down('ControlLeft');
    const targetEye = this.crouching ? EYE_CROUCH : EYE_STAND;
    this.eyeH = damp(this.eyeH, targetEye, 12, dt);
    this.aiming = input.aiming && !this.reloading;
    this.sprinting = (input.down('ShiftLeft') || input.down('ShiftRight')) && !this.crouching && !this.aiming;
    // Move
    const ax = input.axis();
    const speed = this.crouching ? 2.6 : this.aiming ? 3.1 : this.sprinting && ax.z < 0 ? 8.0 : 5.2;
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    let mx = (ax.x * cos - ax.z * sin);
    let mz = (ax.x * sin + ax.z * cos);
    const len = Math.hypot(mx, mz) || 1;
    if (ax.x || ax.z) { mx /= len; mz /= len; }
    const moving = !!(ax.x || ax.z);
    this._move(mx * speed * dt, 0);
    this._move(0, mz * speed * dt);
    // Jump / gravity
    if (input.down('Space') && this.grounded) { this.velY = 5.4; this.grounded = false; }
    this.velY -= 16 * dt;
    this.pos.y += this.velY * dt;
    if (this.pos.y <= 0) { this.pos.y = 0; this.velY = 0; this.grounded = true; }
    // Head bob
    const bob = moving && this.grounded ? Math.sin(time * (this.sprinting ? 13 : 9)) * (this.crouching ? 0.02 : 0.035) : 0;
    // Camera
    const cam = this.ctx.camera;
    cam.position.set(this.pos.x, this.pos.y + this.eyeH + bob, this.pos.z);
    cam.rotation.order = 'YXZ';
    cam.rotation.y = this.yaw + this.recoilYaw;
    cam.rotation.x = this.pitch + this.recoilPitch;
    cam.rotation.z = 0;
    const targetFov = this.aiming ? 52 : 72;
    if (Math.abs(cam.fov - targetFov) > 0.1) { cam.fov = damp(cam.fov, targetFov, 12, dt); cam.updateProjectionMatrix(); }
    // Gun pose
    this.gunKick = damp(this.gunKick, 0, 14, dt);
    const gp = this.aiming ? this.gunAds : this.gunBase;
    this.gun.position.x = damp(this.gun.position.x, gp.x, 14, dt);
    this.gun.position.y = damp(this.gun.position.y, gp.y + bob * 0.5, 14, dt);
    this.gun.position.z = gp.z + this.gunKick;
    this.gun.rotation.x = this.gunKick * 1.4;
    // Health regen after 6s calm
    if (time - this.lastDamageT > 6 && this.hp < this.maxHp && this.hp > 0) {
      this.hp = Math.min(this.maxHp, this.hp + 6 * dt);
    }
    // Fire
    this.fireT -= dt;
    if (input.firing && this.fireT <= 0 && !this.reloading) this.shoot();
    // Reload
    if (this.reloading) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) {
        const need = MAG - this.mag;
        const take = Math.min(need, this.reserve);
        this.mag += take; this.reserve -= take;
        this.reloading = false;
        this.ctx.hud.setAmmo(this.mag, this.reserve, false);
      }
    }
    this.ctx.hud.setHealth(this.hp, this.maxHp);
  }
  shoot() {
    if (this.mag <= 0) {
      this.ctx.sfx.dryClick();
      this.fireT = 0.25;
      this.startReload();
      return;
    }
    this.mag -= 1;
    this.shotsFired += 1;
    this.fireT = 1 / 9;
    this.bloom = Math.min(0.045, this.bloom + 0.005);
    this.recoilPitch += 0.011 + Math.random() * 0.004;
    this.recoilYaw += (Math.random() - 0.5) * 0.006;
    this.gunKick = 0.09;
    this.ctx.sfx.shot();
    const spread = (this.aiming ? 0.004 : 0.014) + this.bloom;
    const dir = this.forward();
    dir.x += (Math.random() - 0.5) * spread * 2;
    dir.y += (Math.random() - 0.5) * spread * 2;
    dir.z += (Math.random() - 0.5) * spread * 2;
    dir.normalize();
    const origin = this.eyePos();
    const rc = new THREE.Raycaster(origin, dir, 0.1, 120);
    const hits = rc.intersectObjects(this.ctx.shootTargets, true);
    const muzzleWorld = new THREE.Vector3();
    this.muzzle.getWorldPosition(muzzleWorld);
    this.ctx.effects.muzzle(muzzleWorld, dir);
    let end = origin.clone().addScaledVector(dir, 60);
    if (hits.length) {
      const h = hits[0];
      end = h.point.clone();
      this.ctx.effects.burst(h.point, 5, 0xffcc66, 3, 6, 0.35);
      const ud = h.object.userData;
      if (ud.enemy) {
        const head = ud.part === 'head';
        const dmg = head ? 68 : 34;
        this.shotsHit += 1;
        const killed = ud.enemy.damage(dmg, head, this);
        this.ctx.hud.hitmarker(killed);
        this.ctx.sfx.hit();
        if (killed) { this.ctx.sfx.kill(); this.kills += 1; }
      }
    }
    this.ctx.effects.tracer(muzzleWorld, end);
    this.ctx.hud.setAmmo(this.mag, this.reserve, this.mag <= 6);
  }
  startReload() {
    if (this.reloading || this.mag >= MAG || this.reserve <= 0) return;
    this.reloading = true;
    this.reloadT = 1.8;
    this.ctx.sfx.reload();
    this.ctx.hud.setAmmo(this.mag, this.reserve, false);
  }
  damage(amount, fromPos) {
    if (!this.alive) return;
    this.hp -= amount;
    this.lastDamageT = this.ctx.time;
    this.ctx.sfx.hurt();
    this.ctx.hud.damageFlash(fromPos, this.eyePos(), this.yaw);
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      this.ctx.onPlayerDeath();
    }
  }
  addAmmo(n) { this.reserve = Math.min(300, this.reserve + n); this.ctx.hud.setAmmo(this.mag, this.reserve, this.mag <= 6); }
  heal(n) { this.hp = Math.min(this.maxHp, this.hp + n); }
  _move(dx, dz) {
    const r = 0.45;
    const w = this.ctx.world;
    let nx = this.pos.x + dx;
    let nz = this.pos.z + dz;
    const blocked = (x, z) => {
      if (Math.abs(x) > w.bounds || Math.abs(z) > w.bounds) return true;
      for (const c of w.colliders) {
        if (aabbOverlapCircle(c, x, z, r)) return true;
      }
      return false;
    };
    if (!blocked(nx, this.pos.z)) this.pos.x = nx;
    if (!blocked(this.pos.x, nz)) this.pos.z = nz;
  }
}
