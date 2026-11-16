// IRONLINE — tactical breach FPS. Orchestrator: loop, rounds, objectives, screens.
import * as THREE from 'three';
import { mulberry32, clamp, rand } from './utils.js';
import { buildWorld } from './world.js';
import { Player } from './player.js';
import { EnemyManager, Enemy, TYPES } from './enemies.js';
import { Effects } from './effects.js';
import { Sfx } from './audio.js';
import { Hud } from './hud.js';
import { Input } from './input.js';

const params = new URLSearchParams(location.search);
const SEED = parseInt(params.get('seed') || '0', 10) || (Math.random() * 1e9) | 0;
const SHOT = params.get('shot') || null;
const LOWFX = params.get('fx') === 'low';
const rng = mulberry32(SEED);
const TOTAL_ROUNDS = 3;
const HIGH_KEY = 'ironline_high';

const canvasHost = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = !LOWFX;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
canvasHost.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0e14);
scene.fog = new THREE.FogExp2(0x0b0e14, 0.009);
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.08, 220);
camera.rotation.order = 'YXZ';
scene.add(camera);

// Lights
scene.add(new THREE.HemisphereLight(0x2a3a55, 0x1a140e, 1.25));
const moon = new THREE.DirectionalLight(0x9db8e8, 1.9);
moon.position.set(-30, 42, -18);
moon.castShadow = true;
moon.shadow.mapSize.set(1024, 1024);
moon.shadow.camera.left = -40; moon.shadow.camera.right = 40;
moon.shadow.camera.top = 40; moon.shadow.camera.bottom = -40;
moon.shadow.camera.far = 120;
scene.add(moon);
scene.add(new THREE.AmbientLight(0x223044, 0.7));
// Small warm fill light on the camera so the rifle and near cover stay readable.
const fill = new THREE.PointLight(0xffe0b0, 2.5, 5, 1.5);
fill.position.set(0.3, 0.2, 0.2);
camera.add(fill);

const world = buildWorld(scene, rng);
const effects = new Effects(scene);
const sfx = new Sfx();
const hud = new Hud();
const input = new Input(renderer.domElement);
const enemyRoot = new THREE.Group();
scene.add(enemyRoot);

const ctx = {
  scene, camera, world, effects, sfx, hud, enemyRoot,
  shootTargets: [world.group, enemyRoot],
  time: 0, grenades: [],
  stats: { enemyShots: 0, grenadesThrown: 0 },
  onEnemyKilled: (enemy, head, player) => onEnemyKilled(enemy, head, player),
  onPlayerDeath: () => onPlayerDeath(),
};
const player = new Player(ctx);
ctx.player = player;
const enemies = new EnemyManager(ctx);

const game = {
  state: 'menu', // menu | playing | paused | over | win
  round: 1,
  phase: 'combat', // combat | hack | exfil
  score: 0,
  roundTime: 0,
  hackT: 0, exfilT: 0,
  pickups: [],
  high: parseInt(localStorage.getItem(HIGH_KEY) || '0', 10) || 0,
};

function setPhase(p) {
  game.phase = p;
  if (p === 'combat') hud.setObjective('ELIMINATE ALL HOSTILES');
  if (p === 'hack') { hud.setObjective('HACK THE RELAY — HOLD E'); hud.banner('SECTOR CLEAR', 'Move to the relay and hold E to hack it'); sfx.hackDone(); }
  if (p === 'exfil') { hud.setObjective('REACH EXTRACTION'); hud.banner('RELAY HACKED', 'Get to the extraction pad'); }
}

function startRound(n) {
  game.round = n;
  game.phase = 'combat';
  game.roundTime = 0;
  game.hackT = 0; game.exfilT = 0;
  hud.setRound(n, TOTAL_ROUNDS);
  setPhase('combat');
  enemies.spawnRound(n, rng);
  hud.banner('ROUND ' + n, n === 1 ? 'Clear the sector, hack the relay, extract' : 'Hostiles reinforced — clear the sector');
  sfx.roundStart();
}

function startGame() {
  enemies.reset();
  clearPickups();
  player.reset(world.playerStart.x, world.playerStart.z, world.playerStart.yaw);
  game.score = 0;
  hud.setScore(0);
  hud.setAmmo(player.mag, player.reserve, false);
  hud.setHealth(player.hp, player.maxHp);
  hud.setMarkers({ x: world.relayPos.x, z: world.relayPos.z }, { x: world.exfilPos.x, z: world.exfilPos.z });
  game.state = 'playing';
  hud.show(null);
  hud.el.startHigh.textContent = game.high > 0 ? 'BEST SCORE ' + game.high : '';
  startRound(1);
}

function onEnemyKilled(enemy, head, pl) {
  const pts = enemy.cfg.score + (head ? 50 : 0);
  game.score += pts;
  hud.setScore(game.score);
  hud.killfeed(`${enemy.cfg.label} DOWN  +${pts}${head ? ' HEADSHOT' : ''}`);
  hud.ping(enemy.pos, pl.pos, pl.yaw);
  if (rng() < 0.35) spawnPickup(enemy.pos.x, enemy.pos.z);
}

function spawnPickup(x, z) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 0.25, 0.3),
    new THREE.MeshStandardMaterial({ color: 0x1a3a1a, emissive: 0x33cc44, emissiveIntensity: 1.2 })
  );
  m.position.set(x, 0.2, z);
  m.castShadow = true;
  scene.add(m);
  game.pickups.push({ mesh: m, t: 0 });
}
function clearPickups() {
  for (const p of game.pickups) scene.remove(p.mesh);
  game.pickups = [];
}

function onPlayerDeath() {
  game.state = 'over';
  sfx.defeat();
  input.exitLock();
  const acc = player.shotsFired ? Math.round(player.shotsHit / player.shotsFired * 100) : 0;
  hud.setStats(hud.el.overStats,
    `SCORE <b>${game.score}</b> &nbsp;·&nbsp; ROUND ${game.round} &nbsp;·&nbsp; KILLS ${player.kills} &nbsp;·&nbsp; ACCURACY ${acc}%`);
  hud.show('over');
}

function onVictory() {
  game.state = 'win';
  sfx.victory();
  input.exitLock();
  const timeBonus = Math.max(0, 300 - Math.floor(game.roundTime) * 2);
  game.score += 500 + timeBonus;
  hud.setScore(game.score);
  if (game.score > game.high) {
    game.high = game.score;
    localStorage.setItem(HIGH_KEY, String(game.high));
  }
  const acc = player.shotsFired ? Math.round(player.shotsHit / player.shotsFired * 100) : 0;
  hud.setStats(hud.el.winStats,
    `FINAL SCORE <b>${game.score}</b> &nbsp;·&nbsp; KILLS ${player.kills} &nbsp;·&nbsp; ACCURACY ${acc}% &nbsp;·&nbsp; BEST ${game.high}`);
  hud.show('win');
}

function roundComplete() {
  game.score += 500;
  hud.setScore(game.score);
  player.heal(50);
  player.addAmmo(60);
  if (game.round >= TOTAL_ROUNDS) { onVictory(); return; }
  startRound(game.round + 1);
}

// Input events
input.onKey = (code, down) => {
  if (!down) return;
  if (code === 'KeyR') {
    if (game.state === 'over' || game.state === 'win') { startGame(); input.requestLock(); }
    else if (game.state === 'playing') player.startReload();
  }
  if (code === 'KeyP') {
    if (game.state === 'playing') { game.state = 'paused'; hud.show('pause'); input.exitLock(); }
    else if (game.state === 'paused') { game.state = 'playing'; hud.show(null); input.requestLock(); }
  }
  if (code === 'KeyM') { sfx.ensure(); sfx.setMuted(!sfx.muted); hud.killfeed(sfx.muted ? 'SOUND MUTED' : 'SOUND ON'); }
};
input.onMouseDown = (btn) => {
  if (game.state === 'playing' && btn === 0 && !input.locked) input.requestLock();
};
input.onLockChange = (locked) => {
  if (!locked && game.state === 'playing' && !SHOT) { game.state = 'paused'; hud.show('pause'); }
};
document.getElementById('deploy-btn').addEventListener('click', () => {
  sfx.ensure();
  startGame();
  input.requestLock();
});
document.getElementById('resume-btn').addEventListener('click', () => {
  game.state = 'playing'; hud.show(null); input.requestLock();
});
document.getElementById('restart-btn').addEventListener('click', () => {
  startGame(); input.requestLock();
});
document.getElementById('again-btn').addEventListener('click', () => {
  startGame(); input.requestLock();
});
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// Objective phases
function updateObjective(dt) {
  if (game.state !== 'playing') return;
  const p = player.pos;
  if (game.phase === 'combat') {
    if (enemies.aliveCount() === 0) setPhase('hack');
    return;
  }
  if (game.phase === 'hack') {
    const d = Math.hypot(p.x - world.relayPos.x, p.z - world.relayPos.z);
    if (d < 3.5) {
      hud.setInteract('HOLD  E  —  HACK RELAY');
      if (input.down('KeyE')) {
        game.hackT += dt / 3;
        hud.setHack(game.hackT);
        if (Math.random() < dt * 6) sfx.hackTick();
        if (game.hackT >= 1) { hud.setHack(null); hud.setInteract(null); setPhase('exfil'); }
      } else {
        game.hackT = Math.max(0, game.hackT - dt / 2);
        hud.setHack(game.hackT > 0 ? game.hackT : null);
      }
    } else {
      hud.setInteract(null);
      hud.setHack(null);
      game.hackT = Math.max(0, game.hackT - dt / 2);
    }
    return;
  }
  if (game.phase === 'exfil') {
    const d = Math.hypot(p.x - world.exfilPos.x, p.z - world.exfilPos.z);
    if (d < 3.2) {
      hud.setInteract('EXTRACTING…');
      game.exfilT += dt;
      hud.setHack(Math.min(1, game.exfilT / 2));
      if (game.exfilT >= 2) { hud.setHack(null); hud.setInteract(null); roundComplete(); }
    } else {
      hud.setInteract(null);
      hud.setHack(null);
      game.exfilT = 0;
    }
  }
}

function updatePickups(dt) {
  for (let i = game.pickups.length - 1; i >= 0; i--) {
    const pk = game.pickups[i];
    pk.t += dt;
    pk.mesh.rotation.y += dt * 2;
    pk.mesh.position.y = 0.2 + Math.sin(pk.t * 3) * 0.06;
    if (Math.hypot(player.pos.x - pk.mesh.position.x, player.pos.z - pk.mesh.position.z) < 1.3) {
      player.addAmmo(30);
      hud.killfeed('AMMO +30');
      scene.remove(pk.mesh);
      game.pickups.splice(i, 1);
    } else if (pk.t > 25) {
      scene.remove(pk.mesh);
      game.pickups.splice(i, 1);
    }
  }
}

// Demo / screenshot modes
function applyShotMode() {
  if (!SHOT) return;
  if (SHOT === 'start') { hud.show('start'); return; }
  if (SHOT === 'play') {
    startGame();
    // Stage a visible firefight for the screenshot: clear the far spawns,
    // place hostiles mid-range in front of the player, settle the scene.
    enemies.reset();
    const staged = [
      ['rusher', -5, -6], ['marksman', 5, -12], ['grenadier', 10, -4], ['rusher', -11, -12],
    ];
    for (const [t, x, z] of staged) enemies.list.push(new Enemy(ctx, t, x, z, rng));
    player.reset(0, 10, Math.PI);
    for (let i = 0; i < 90; i++) {
      ctx.time += 1 / 60;
      player.update(1 / 60, input, ctx.time);
      enemies.update(1 / 60, player, ctx.time);
    }
    player.hp = player.maxHp;
    player.yaw = Math.PI + 0.1; player.pitch = 0.01;
    return;
  }
  if (SHOT === 'end') {
    player.hp = 0; player.alive = false;
    game.score = 1240;
    hud.setScore(1240);
    const acc = 41;
    hud.setStats(hud.el.overStats, `SCORE <b>1240</b> &nbsp;·&nbsp; ROUND 2 &nbsp;·&nbsp; KILLS 7 &nbsp;·&nbsp; ACCURACY ${acc}%`);
    game.state = 'over';
    hud.show('over');
  }
}

// Test hook (used by the local play-test script only)
window.__fps = {
  game, player, enemies, input, hud, world, ctx,
  state: () => ({ state: game.state, phase: game.phase, round: game.round, hp: player.hp, mag: player.mag, reserve: player.reserve, score: game.score, alive: enemies.aliveCount(), kills: player.kills, enemyShots: ctx.stats.enemyShots, grenades: ctx.stats.grenadesThrown, pos: [player.pos.x, player.pos.z], yaw: player.yaw }),
  start: () => { startGame(); },
  restart: () => { startGame(); },
  look: (yaw, pitch) => { player.yaw = yaw; player.pitch = pitch; },
  fire: () => { input.firing = true; setTimeout(() => { input.firing = false; }, 120); },
  shootOnce: () => { player.fireT = 0; player.shoot(); },
  reload: () => player.startReload(),
  setHealth: (n) => { player.hp = n; },
  damage: (n) => player.damage(n, player.pos.clone().add(new THREE.Vector3(5, 0, 0))),
  teleport: (x, z, yaw) => { player.pos.set(x, 0, z); if (yaw !== undefined) player.yaw = yaw; },
  spawnEnemy: (type, x, z) => {
    const e = new Enemy(ctx, type || 'rusher', x ?? 0, z ?? -10, rng);
    enemies.list.push(e);
    return e;
  },
};

// Main loop
const clock = new THREE.Clock();
let firstFrame = true;
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);
  ctx.time += dt;
  if (game.state === 'playing') {
    game.roundTime += dt;
    player.update(dt, input, ctx.time);
    enemies.update(dt, player, ctx.time);
    updateObjective(dt);
    updatePickups(dt);
    // crosshair spread from bloom + movement
    const spread = 6 + player.bloom * 220 + (player.sprinting ? 6 : 0) + (player.aiming ? -3 : 0);
    hud.setSpread(clamp(spread, 4, 26));
  }
  world.update(dt);
  effects.update(dt);
  hud.update(dt, player.yaw, player.pos);
  if (firstFrame) { firstFrame = false; applyShotMode(); }
  renderer.render(scene, camera);
}
hud.setHealth(100, 100);
hud.setAmmo(30, 150, false);
hud.setScore(0);
hud.setRound(1, TOTAL_ROUNDS);
hud.setObjective('ELIMINATE ALL HOSTILES');
hud.show('start');
if (game.high > 0) hud.el.startHigh.textContent = 'BEST SCORE ' + game.high;
loop();
