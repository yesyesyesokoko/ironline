// Synthesized sound effects only — no audio files, pure WebAudio.
export class Sfx {
  constructor() {
    this.ctx = null; this.master = null; this.muted = false;
    this._noise = null;
  }
  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this._noise = buf;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 0.5; }
  _noiseBurst(dur, filterFreq, gain, type = 'lowpass', when = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + when;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noise; src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + dur + 0.02);
  }
  _tone(freq, dur, gain, type = 'square', slideTo = null, when = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  shot() { this._noiseBurst(0.09, 1800, 0.5); this._tone(160, 0.08, 0.35, 'sine', 60); }
  enemyShot(dist = 20) {
    const g = Math.max(0.04, 0.22 - dist * 0.006);
    this._noiseBurst(0.08, 900, g); this._tone(120, 0.07, g * 0.6, 'sine', 55);
  }
  dryClick() { this._tone(1400, 0.03, 0.12, 'square'); }
  reload() {
    this._noiseBurst(0.03, 3000, 0.18, 'bandpass', 0);
    this._noiseBurst(0.03, 2200, 0.18, 'bandpass', 0.45);
    this._noiseBurst(0.04, 3500, 0.22, 'bandpass', 1.15);
  }
  hit() { this._tone(1500, 0.05, 0.16, 'square'); }
  kill() { this._tone(880, 0.07, 0.18, 'square'); this._tone(1320, 0.09, 0.18, 'square', null, 0.07); }
  hurt() { this._tone(90, 0.18, 0.4, 'sine', 45); this._noiseBurst(0.12, 500, 0.2); }
  explosion() {
    this._noiseBurst(0.7, 400, 0.7); this._tone(70, 0.6, 0.6, 'sine', 30);
  }
  beep() { this._tone(1050, 0.08, 0.15, 'square'); }
  hackTick() { this._tone(1900, 0.04, 0.1, 'square'); }
  hackDone() { this._tone(660, 0.08, 0.16, 'square'); this._tone(990, 0.12, 0.16, 'square', null, 0.08); }
  roundStart() { this._tone(440, 0.12, 0.15, 'square'); this._tone(660, 0.16, 0.15, 'square', null, 0.12); }
  victory() { [523, 659, 784, 1047].forEach((f, i) => this._tone(f, 0.18, 0.16, 'triangle', null, i * 0.13)); }
  defeat() { [392, 330, 262, 196].forEach((f, i) => this._tone(f, 0.22, 0.16, 'triangle', null, i * 0.16)); }
}
