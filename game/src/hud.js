// HUD: DOM readouts, canvas compass, damage direction, kill feed, screens.
import { clamp } from './utils.js';

function $(id) { return document.getElementById(id); }
function wrapPi(a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }

export class Hud {
  constructor() {
    this.el = {
      healthFill: $('health-fill'), healthNum: $('health-num'),
      ammoMag: $('ammo-mag'), ammoRes: $('ammo-res'), ammoBox: $('ammo'),
      score: $('score'), round: $('round'), objective: $('objective'),
      crosshair: $('crosshair'), hitmarker: $('hitmarker'),
      vignette: $('vignette'), dmgdir: $('dmgdir'), killfeed: $('killfeed'),
      banner: $('banner'), bannerTitle: $('banner-title'), bannerSub: $('banner-sub'),
      compass: $('compass'), interact: $('interact'), hackRing: $('hack-ring'),
      start: $('screen-start'), pause: $('screen-pause'),
      over: $('screen-over'), win: $('screen-win'),
      overStats: $('over-stats'), winStats: $('win-stats'),
      highScore: $('high-score'), startHigh: $('start-high'),
    };
    this.ctx2d = this.el.compass.getContext('2d');
    this._hitT = 0; this._bannerT = 0; this._dmgT = 0;
    this._pings = []; // {bearing, t}
    this._objective = null; // {x,z,label,color}
    this._exfil = null;
  }
  setHealth(hp, max) {
    const f = clamp(hp / max, 0, 1);
    this.el.healthFill.style.width = (f * 100).toFixed(0) + '%';
    this.el.healthNum.textContent = Math.ceil(hp);
    this.el.healthFill.style.background = f > 0.5 ? '#7ac74f' : f > 0.25 ? '#f0a830' : '#e04040';
    this.el.vignette.style.opacity = f < 0.35 ? String((0.35 - f) * 2.2) : '0';
  }
  setAmmo(mag, res, low) {
    this.el.ammoMag.textContent = mag;
    this.el.ammoRes.textContent = res;
    this.el.ammoBox.classList.toggle('low', !!low);
  }
  setScore(s) { this.el.score.textContent = s; }
  setRound(r, total) { this.el.round.textContent = 'ROUND ' + r + ' / ' + total; }
  setObjective(text) { this.el.objective.textContent = text; }
  setSpread(px) { this.el.crosshair.style.setProperty('--sp', px + 'px'); }
  hitmarker(kill) {
    this.el.hitmarker.classList.add('on');
    this.el.hitmarker.classList.toggle('kill', !!kill);
    this._hitT = kill ? 0.22 : 0.12;
  }
  damageFlash(fromPos, eyePos, yaw) {
    const dx = fromPos.x - eyePos.x, dz = fromPos.z - eyePos.z;
    const worldAng = Math.atan2(dx, dz);
    const rel = wrapPi(worldAng - (yaw + Math.PI));
    this.el.dmgdir.style.transform = `translate(-50%,-50%) rotate(${(-rel * 180 / Math.PI).toFixed(0)}deg)`;
    this.el.dmgdir.style.opacity = '1';
    this._dmgT = 0.6;
  }
  killfeed(text) {
    const d = document.createElement('div');
    d.className = 'feed-line';
    d.textContent = text;
    this.el.killfeed.prepend(d);
    while (this.el.killfeed.children.length > 4) this.el.killfeed.lastChild.remove();
    setTimeout(() => d.remove(), 4500);
  }
  banner(title, sub = '') {
    this.el.bannerTitle.textContent = title;
    this.el.bannerSub.textContent = sub;
    this.el.banner.classList.add('show');
    this._bannerT = 2.6;
  }
  setInteract(text) {
    this.el.interact.textContent = text || '';
    this.el.interact.style.opacity = text ? '1' : '0';
  }
  setHack(frac) {
    if (frac === null) { this.el.hackRing.style.opacity = '0'; return; }
    this.el.hackRing.style.opacity = '1';
    this.el.hackRing.style.background =
      `conic-gradient(#f0a830 ${(frac * 360).toFixed(0)}deg, rgba(20,22,26,0.85) 0deg)`;
  }
  setMarkers(objective, exfil) { this._objective = objective; this._exfil = exfil; }
  ping(worldPos, playerPos, yaw) {
    const dx = worldPos.x - playerPos.x, dz = worldPos.z - playerPos.z;
    const rel = wrapPi(Math.atan2(dx, dz) - (yaw + Math.PI));
    this._pings.push({ rel, t: 1.2 });
  }
  drawCompass(yaw) {
    const c = this.el.compass, g = this.ctx2d;
    const W = c.width, H = c.height;
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(10,12,14,0.55)';
    g.fillRect(0, 0, W, H);
    const pxPerRad = W / (Math.PI * 0.9);
    const drawAt = (rel, draw) => {
      const x = W / 2 + rel * pxPerRad;
      if (x < -20 || x > W + 20) return;
      draw(x);
    };
    for (let deg = 0; deg < 360; deg += 15) {
      const a = deg * Math.PI / 180;
      const rel = wrapPi(a - (yaw + Math.PI));
      drawAt(rel, (x) => {
        g.strokeStyle = 'rgba(233,230,223,0.5)';
        g.beginPath(); g.moveTo(x, deg % 45 === 0 ? 6 : 12); g.lineTo(x, 18); g.stroke();
        if (deg % 90 === 0) {
          g.fillStyle = '#e9e6df'; g.font = 'bold 11px system-ui';
          g.textAlign = 'center';
          g.fillText(['N', 'E', 'S', 'W'][deg / 90], x, 30);
        }
      });
    }
    const marker = (pos, color, shape) => {
      if (!pos) return;
      const dx = pos.x, dz = pos.z;
      const rel = wrapPi(Math.atan2(dx, dz) - (yaw + Math.PI));
      drawAt(rel, (x) => {
        g.fillStyle = color;
        if (shape === 'diamond') {
          g.beginPath(); g.moveTo(x, 4); g.lineTo(x + 5, 10); g.lineTo(x, 16); g.lineTo(x - 5, 10); g.fill();
        } else {
          g.beginPath(); g.arc(x, 10, 4, 0, Math.PI * 2); g.fill();
        }
      });
    };
    if (this._objective) marker({ x: this._objective.x, z: this._objective.z }, '#f0a830', 'diamond');
    if (this._exfil) marker({ x: this._exfil.x, z: this._exfil.z }, '#7ac74f', 'circle');
    this._pings = this._pings.filter((p) => p.t > 0);
    for (const p of this._pings) {
      drawAt(p.rel, (x) => {
        g.fillStyle = `rgba(255,60,60,${clamp(p.t, 0, 1)})`;
        g.beginPath(); g.moveTo(x, 20); g.lineTo(x + 5, 28); g.lineTo(x - 5, 28); g.fill();
      });
    }
    g.fillStyle = '#f0a830';
    g.beginPath(); g.moveTo(W / 2 - 5, 0); g.lineTo(W / 2 + 5, 0); g.lineTo(W / 2, 6); g.fill();
  }
  show(name) {
    for (const k of ['start', 'pause', 'over', 'win']) this.el[k].classList.toggle('show', k === name);
  }
  setStats(el, stats) { el.innerHTML = stats; }
  update(dt, yaw, playerPos) {
    if (this._hitT > 0) { this._hitT -= dt; if (this._hitT <= 0) this.el.hitmarker.classList.remove('on', 'kill'); }
    if (this._bannerT > 0) { this._bannerT -= dt; if (this._bannerT <= 0) this.el.banner.classList.remove('show'); }
    if (this._dmgT > 0) { this._dmgT -= dt; if (this._dmgT <= 0) this.el.dmgdir.style.opacity = '0'; }
    for (const p of this._pings) p.t -= dt;
    // compass markers need player-relative positions
    const obj = this._objective ? { x: this._objective.x - playerPos.x, z: this._objective.z - playerPos.z } : null;
    const exf = this._exfil ? { x: this._exfil.x - playerPos.x, z: this._exfil.z - playerPos.z } : null;
    const saveO = this._objective, saveE = this._exfil;
    this._objective = obj ? { ...saveO, x: obj.x, z: obj.z } : null;
    this._exfil = exf ? { ...saveE, x: exf.x, z: exf.z } : null;
    this.drawCompass(yaw);
    this._objective = saveO; this._exfil = saveE;
  }
}
