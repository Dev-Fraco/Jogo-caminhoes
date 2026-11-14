import { loadSettings, type Settings } from '../settings/settings';

/** Som do jogo, gerado na hora (sem arquivos): efeitos e uma música de fundo em loop. */
export type Sfx = 'click' | 'goal' | 'whistle' | 'cash' | 'error' | 'whoosh' | 'notify' | 'unlock';

export const noteFreq = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

/** Progressão da música (Am – F – C – G), 4 tempos por compasso: baixo, acorde e arpejo em notas MIDI. */
export const PROGRESSION: { bass: number; chord: number[] }[] = [
  { bass: 45, chord: [57, 60, 64] },
  { bass: 41, chord: [57, 60, 65] },
  { bass: 48, chord: [55, 60, 64] },
  { bass: 43, chord: [55, 59, 62] },
];
export const BPM = 96;
/** Notas do arpejo (índices do acorde) em colcheias, 8 por compasso. */
export const ARP = [0, 1, 2, 1, 0, 1, 2, 1];

export function volumes(s: Settings) {
  const m = s.audio.muted ? 0 : s.audio.master / 100;
  return { music: m * (s.audio.music / 100) * 0.18, sfx: m * (s.audio.sfx / 100) * 0.5 };
}

class AudioSys {
  private ctx: AudioContext | null = null;
  private musicGain!: GainNode;
  private sfxGain!: GainNode;
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextBar = 0;
  private bar = 0;
  private wantMusic = false;

  /** Cria o áudio na primeira interação do usuário (exigência dos navegadores e do celular). */
  unlock() {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.musicGain = this.ctx.createGain(); this.musicGain.connect(this.ctx.destination);
      this.sfxGain = this.ctx.createGain(); this.sfxGain.connect(this.ctx.destination);
      this.refresh();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    if (this.wantMusic) this.startLoop();
  }

  /** Relê o volume das configurações (chamado quando elas são salvas). */
  refresh(s: Settings = loadSettings()) {
    if (!this.ctx) return;
    const v = volumes(s);
    this.musicGain.gain.setTargetAtTime(v.music, this.ctx.currentTime, 0.05);
    this.sfxGain.gain.setTargetAtTime(v.sfx, this.ctx.currentTime, 0.05);
  }

  setMusic(on: boolean) {
    this.wantMusic = on;
    if (on) this.startLoop(); else this.stopLoop();
  }

  suspend(hidden: boolean) {
    if (!this.ctx) return;
    if (hidden) void this.ctx.suspend(); else void this.ctx.resume();
  }

  private tone(freq: number, t: number, dur: number, type: OscillatorType, vol: number, dest: AudioNode, glideTo?: number) {
    const c = this.ctx!;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + 0.05);
  }

  private noise(t: number, dur: number, vol: number, dest: AudioNode, from = 800, to = 800) {
    const c = this.ctx!;
    const buf = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate * dur)), c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.setValueAtTime(from, t); f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(dest);
    src.start(t);
  }

  sfx(name: Sfx) {
    const c = this.ctx;
    if (!c || c.state !== 'running') return;
    const t = c.currentTime, o = this.sfxGain;
    switch (name) {
      case 'click': this.tone(880, t, 0.06, 'square', 0.25, o); break;
      case 'unlock': this.tone(660, t, 0.1, 'triangle', 0.4, o); this.tone(990, t + 0.09, 0.14, 'triangle', 0.4, o); break;
      case 'notify': this.tone(1175, t, 0.1, 'sine', 0.4, o); this.tone(1568, t + 0.12, 0.18, 'sine', 0.4, o); break;
      case 'cash': this.tone(1320, t, 0.08, 'triangle', 0.4, o); this.tone(1760, t + 0.08, 0.3, 'triangle', 0.4, o); break;
      case 'error': this.tone(180, t, 0.25, 'sawtooth', 0.3, o, 120); break;
      case 'whoosh': this.noise(t, 0.5, 0.6, o, 300, 3000); break;
      case 'whistle': this.tone(2900, t, 0.35, 'sine', 0.35, o, 3100); this.tone(3000, t + 0.4, 0.5, 'sine', 0.35, o, 2800); break;
      case 'goal': {
        this.noise(t, 1.6, 0.9, o, 500, 1400); // torcida
        [60, 64, 67, 72].forEach((m, i) => this.tone(noteFreq(m + 12), t + i * 0.09, 0.4, 'triangle', 0.3, o));
        break;
      }
    }
  }

  private startLoop() {
    if (!this.ctx || this.timer) return;
    const barLen = (60 / BPM) * 4;
    this.nextBar = this.ctx.currentTime + 0.1;
    const schedule = () => {
      const c = this.ctx!;
      while (this.nextBar < c.currentTime + 0.6) { this.playBar(this.nextBar, barLen); this.nextBar += barLen; this.bar++; }
    };
    schedule();
    this.timer = setInterval(schedule, 250);
  }

  private stopLoop() { if (this.timer) { clearInterval(this.timer); this.timer = null; } }

  private playBar(t: number, barLen: number) {
    const ch = PROGRESSION[this.bar % PROGRESSION.length];
    const step = barLen / 8;
    const m = this.musicGain;
    this.tone(noteFreq(ch.bass - 12), t, barLen * 0.95, 'sine', 0.5, m); // baixo
    ch.chord.forEach((n) => this.tone(noteFreq(n), t, barLen * 0.98, 'triangle', 0.12, m)); // pad
    ARP.forEach((idx, i) => this.tone(noteFreq(ch.chord[idx] + 12), t + i * step, step * 1.6, 'sine', 0.3, m)); // arpejo
  }
}

export const audio = new AudioSys();
