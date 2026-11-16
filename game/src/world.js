// The compound: a walled night yard with crates, barriers, containers and a relay.
// Exports: buildWorld(scene, rng) -> { colliders, coverPoints, spawnPoints, relay, exfil, bounds, update(dt,t) }
import * as THREE from 'three';
import { rand } from './utils.js';

const ARENA = 34; // half-size of the playable square

function mat(color, rough = 0.9, metal = 0.05) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
}
function box(w, h, d, color, x, y, z, rough) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, rough));
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

export function buildWorld(scene, rng) {
  const colliders = []; // {minX,maxX,minZ,maxZ,h}
  const coverPoints = []; // {x,z,dir} spots an enemy can stand behind
  const group = new THREE.Group();
  scene.add(group);

  // Ground: dark asphalt with a painted grid feel via two tones.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(ARENA * 2 + 24, ARENA * 2 + 24), mat(0x23262b, 1));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
  group.add(ground);
  // Painted lane strips
  for (let i = -2; i <= 2; i++) {
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.35, ARENA * 2), mat(0x3a3f45, 1));
    strip.rotation.x = -Math.PI / 2;
    strip.position.set(i * 12, 0.01, 0);
    strip.receiveShadow = true;
    group.add(strip);
  }

  // Perimeter walls
  const wallH = 4.2, wallT = 0.8;
  const wallCols = [0x2e343c, 0x333a42];
  const walls = [
    [0, -ARENA - wallT / 2, ARENA * 2 + 2, wallT],
    [0, ARENA + wallT / 2, ARENA * 2 + 2, wallT],
    [-ARENA - wallT / 2, 0, wallT, ARENA * 2 + 2],
    [ARENA + wallT / 2, 0, wallT, ARENA * 2 + 2],
  ];
  walls.forEach(([x, z, w, d], i) => {
    const m = box(w, wallH, d, wallCols[i % 2], x, wallH / 2, z);
    group.add(m);
    colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, h: wallH });
  });
  // Wall top trim (hazard yellow)
  [[0, -ARENA, ARENA * 2, 0.3], [0, ARENA, ARENA * 2, 0.3]].forEach(([x, z, w, d]) => {
    const m = box(w, 0.12, d, 0xb98a1e, x, wallH + 0.06, z);
    group.add(m);
  });

  // Crates (cover). Each crate: mesh + collider + 2 cover points on the centre-facing sides.
  const crateCols = [0x5a4a33, 0x4a5a33, 0x54423a, 0x3d4a55];
  const crateSpots = [
    [-14, -10, 2.2, 1.4, 1.4], [-6, -16, 2.6, 1.6, 1.6], [4, -12, 2.2, 1.4, 1.4],
    [14, -16, 2.6, 1.6, 1.6], [-18, 2, 2.4, 1.5, 1.5], [-8, -2, 2.0, 1.3, 1.3],
    [8, -4, 2.4, 1.5, 1.5], [18, 6, 2.2, 1.4, 1.4], [-12, 12, 2.6, 1.6, 1.6],
    [0, 8, 2.0, 1.3, 1.3], [10, 14, 2.4, 1.5, 1.5], [20, -6, 2.0, 1.3, 1.3],
    [-22, -18, 2.2, 1.4, 1.4], [22, 18, 2.6, 1.6, 1.6], [-4, 20, 2.2, 1.4, 1.4],
  ];
  crateSpots.forEach(([x, z, w, h, d], i) => {
    const c = crateCols[i % crateCols.length];
    const m = box(w, h, d, c, x, h / 2, z);
    m.rotation.y = (i % 3) * 0.12;
    group.add(m);
    // lid rim
    const rim = box(w + 0.08, 0.1, d + 0.08, 0x2c2f33, x, h + 0.05, z);
    group.add(rim);
    colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, h });
    // cover points: stand on the two sides facing arena centre
    const dx = -x, dz = -z, len = Math.hypot(dx, dz) || 1;
    const nx = dx / len, nz = dz / len;
    coverPoints.push({ x: x + nx * (w / 2 + 0.9), z: z + nz * (d / 2 + 0.9), dir: Math.atan2(nx, nz) });
    coverPoints.push({ x: x - nx * (w / 2 + 0.9), z: z - nz * (d / 2 + 0.9), dir: Math.atan2(-nx, -nz) });
  });

  // Shipping containers (big cover + verticality)
  const contSpots = [[-24, 10, 6, 2.6, 2.6, 0], [24, -12, 6, 2.6, 2.6, Math.PI / 2], [16, 22, 6, 2.6, 2.6, 0]];
  contSpots.forEach(([x, z, w, h, d, ry], i) => {
    const c = [0x7a3b2e, 0x2e5a7a, 0x5a6e2e][i];
    const m = box(w, h, d, c, x, h / 2, z);
    m.rotation.y = ry;
    group.add(m);
    // ribbed doors
    for (let k = -2; k <= 2; k++) {
      const rib = box(0.08, h - 0.3, 0.12, 0x22262b, x + (ry === 0 ? k * 1.1 : 0), h / 2, z + (ry === 0 ? d / 2 + 0.03 : k * 1.1));
      group.add(rib);
    }
    const hw = ry === 0 ? w / 2 : d / 2, hd = ry === 0 ? d / 2 : w / 2;
    colliders.push({ minX: x - hw, maxX: x + hw, minZ: z - hd, maxZ: z + hd, h });
    coverPoints.push({ x: x, z: z + hd + 1.0, dir: 0 });
    coverPoints.push({ x: x, z: z - hd - 1.0, dir: Math.PI });
  });

  // Low concrete barriers (crouch cover)
  const barSpots = [[-10, 6, 3.2, 1.1], [6, 4, 3.2, 1.1], [2, -20, 3.2, 1.1], [-2, -6, 3.2, 1.1], [14, 2, 3.2, 1.1]];
  barSpots.forEach(([x, z, w, h], i) => {
    const m = box(w, h, 0.7, 0x6a6f75, x, h / 2, z);
    m.rotation.y = (i % 2) * Math.PI / 2;
    group.add(m);
    const d = 0.35;
    colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d, maxZ: z + d, h });
    coverPoints.push({ x: x, z: z + 1.2, dir: 0 });
  });

  // Central relay tower (the hack objective) — north side
  const relay = new THREE.Group();
  relay.position.set(0, 0, -24);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 7, 8), mat(0x3a4048, 0.6, 0.4));
  mast.position.y = 3.5; mast.castShadow = true;
  relay.add(mast);
  const dish = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 0.15, 16), mat(0x8a8f96, 0.4, 0.7));
  dish.position.y = 7.2; dish.rotation.x = 0.5; dish.castShadow = true;
  relay.add(dish);
  const panel = box(1.6, 1.1, 0.5, 0x2a2e33, 0, 0.9, 0.6);
  relay.add(panel);
  const screenMat = new THREE.MeshStandardMaterial({ color: 0x0a0f0a, emissive: 0x22ff66, emissiveIntensity: 1.6 });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.7), screenMat);
  screen.position.set(0, 0.95, 0.87);
  relay.add(screen);
  const beaconMat = new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff2222, emissiveIntensity: 2 });
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), beaconMat);
  beacon.position.y = 7.9;
  relay.add(beacon);
  group.add(relay);
  colliders.push({ minX: -1, maxX: 1, minZ: -25, maxZ: -23, h: 7 });
  const relayLight = new THREE.PointLight(0xff3333, 12, 18, 1.8);
  relayLight.position.set(0, 8, -24);
  group.add(relayLight);

  // Extraction pad — south side, helipad ring
  const exfil = new THREE.Group();
  exfil.position.set(0, 0, 26);
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 0.15, 24), mat(0x2e3238, 0.8));
  pad.position.y = 0.08; pad.receiveShadow = true;
  exfil.add(pad);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffcc33 });
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.6, 3.0, 32), ringMat);
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.17;
  exfil.add(ring);
  const hMat = new THREE.MeshBasicMaterial({ color: 0xffcc33 });
  const hBar = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.4), hMat);
  hBar.rotation.x = -Math.PI / 2; hBar.position.y = 0.17;
  exfil.add(hBar);
  const hBar2 = hBar.clone(); hBar2.rotation.z = Math.PI / 2;
  exfil.add(hBar2);
  group.add(exfil);

  // Watchtowers with floodlights (visual anchors + light)
  const towerLights = [];
  [[-28, -28], [28, 28]].forEach(([x, z]) => {
    const t = new THREE.Group();
    t.position.set(x, 0, z);
    for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const leg = box(0.25, 6, 0.25, 0x3a4048, lx, 3, lz);
      t.add(leg);
    }
    const cab = box(2.6, 2.2, 2.6, 0x39404a, 0, 7, 0);
    t.add(cab);
    const roof = box(3.0, 0.2, 3.0, 0x22262b, 0, 8.2, 0);
    t.add(roof);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xffe9a8, emissiveIntensity: 3 }));
    lamp.position.set(0, 6.2, 1.4);
    t.add(lamp);
    const pl = new THREE.PointLight(0xffdf9e, 60, 30, 1.7);
    pl.position.set(0, 6, 1.6);
    t.add(pl);
    towerLights.push(pl);
    group.add(t);
    colliders.push({ minX: x - 1.4, maxX: x + 1.4, minZ: z - 1.4, maxZ: z + 1.4, h: 8 });
  });

  // Scattered barrels
  for (let i = 0; i < 10; i++) {
    const x = rand(rng, -28, 28), z = rand(rng, -28, 28);
    if (Math.abs(x) < 5 && Math.abs(z + 24) < 4) continue;
    if (Math.abs(x) < 5 && Math.abs(z - 26) < 5) continue;
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.1, 10),
      mat([0x7a5a2e, 0x4a6e3a, 0x6e3a3a][i % 3], 0.7, 0.3));
    b.position.set(x, 0.55, z);
    b.castShadow = true;
    group.add(b);
    colliders.push({ minX: x - 0.45, maxX: x + 0.45, minZ: z - 0.45, maxZ: z + 0.45, h: 1.1 });
  }

  // Spawn points (far side, near relay) and player start (south, near exfil)
  const spawnPoints = [
    [-26, -26], [0, -28], [26, -26], [-28, -8], [28, -8],
    [-20, -22], [20, -22], [-28, 14], [28, 14], [0, -18],
  ];
  const playerStart = { x: 0, z: 20, yaw: Math.PI }; // facing north toward the relay

  // Blinking relay beacon
  let blinkT = 0;
  function update(dt) {
    blinkT += dt;
    const on = (blinkT % 1.2) < 0.7;
    beaconMat.emissiveIntensity = on ? 2.5 : 0.2;
    relayLight.intensity = on ? 12 : 2;
    ringMat.color.setHex(((blinkT % 1.0) < 0.5) ? 0xffcc33 : 0xcc9933);
  }

  return {
    group, colliders, coverPoints, spawnPoints, playerStart,
    relayPos: new THREE.Vector3(0, 1, -24),
    exfilPos: new THREE.Vector3(0, 0.2, 26),
    bounds: ARENA, update,
  };
}
