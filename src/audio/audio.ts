import { loadSettings, type Settings } from '../settings/settings';

/** Som do jogo, gerado na hora (sem arquivos): efeitos e uma música de fundo em loop. */
export type Sfx = 'click' | 'goal' | 'whistle' | 'cash' | 'error' | 'whoosh' | 'notify' | 'unlock';

export const noteFreq = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

/** Progressão da música (Am – F – C – G), 4 tempos por compasso: baixo, acorde e arpejo em notas MIDI. */
export const PROGRESSION: { bass: number; chord: number[] }[] = [
  { bass: 50, chord: [62, 65, 69] }, // Ré menor
  { bass: 46, chord: [58, 62, 65] }, // Sib
  { bass: 41, chord: [57, 60, 65] }, // Fá
  { bass: 48, chord: [60, 64, 67] }, // Dó
];
export const BPM = 112;
/** Notas do arpejo (índices do acorde, 3 = oitava acima) em colcheias, 8 por compasso: estilo synthwave. */
export const ARP = [0, 2, 1, 2, 0, 2, 3, 2];

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

  private tone(freq: number, t: number, dur: number, type: OscillatorType, vol: number, dest: AudioNode, glideTo?: number, cutoff?: number, attack = 0.02) {
    const c = this.ctx!;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    if (cutoff) {
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(cutoff, t); f.frequency.exponentialRampToValueAtTime(Math.max(120, cutoff * 0.35), t + dur);
      o.connect(f); f.connect(g);
    } else o.connect(g);
    g.connect(dest);
    o.start(t); o.stop(t + dur + 0.05);
  }

  /** Apito de árbitro: tom agudo com a "bolinha" (tremolo rápido) e um sopro. */
  private whistle(t: number, dur: number, dest: AudioNode) {
    const c = this.ctx!;
    const o = c.createOscillator(), g = c.createGain(), lfo = c.createOscillator(), depth = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(2750, t); o.frequency.linearRampToValueAtTime(3050, t + dur * 0.25); o.frequency.linearRampToValueAtTime(2900, t + dur);
    lfo.type = 'sine'; lfo.frequency.value = 38; depth.gain.value = 0.35;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 0.03); g.gain.setValueAtTime(0.5, t + dur - 0.06); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    lfo.connect(depth); depth.connect(g.gain);
    o.connect(g); g.connect(dest);
    o.start(t); lfo.start(t); o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
    this.noise(t, dur, 0.12, dest, 3000, 3200);
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
      case 'click': this.tone(1900, t, 0.035, 'triangle', 0.3, o); this.tone(2850, t + 0.03, 0.05, 'sine', 0.22, o); break; // "tique" digital
      case 'unlock': this.tone(300, t, 0.28, 'sine', 0.35, o, 1500); this.tone(1800, t + 0.22, 0.12, 'triangle', 0.3, o); break;
      case 'notify': [1319, 1760, 2349].forEach((f, i) => this.tone(f, t + i * 0.09, 0.14, 'sine', 0.32, o)); break;
      case 'cash': this.tone(1568, t, 0.07, 'square', 0.18, o, undefined, 6000); this.tone(2093, t + 0.07, 0.28, 'triangle', 0.35, o); break;
      case 'error': this.tone(220, t, 0.18, 'sawtooth', 0.28, o, 110, 1200); this.tone(165, t + 0.17, 0.25, 'sawtooth', 0.28, o, 90, 1000); break;
      case 'whoosh': this.noise(t, 0.6, 0.6, o, 250, 4200); this.tone(200, t, 0.6, 'sine', 0.2, o, 1200); break;
      case 'whistle': this.whistle(t, 0.28, o); this.whistle(t + 0.38, 0.75, o); break;
      case 'goal': {
        this.noise(t, 1.8, 0.9, o, 500, 1500); // torcida
        [60, 64, 67, 72, 76].forEach((m, i) => this.tone(noteFreq(m + 12), t + i * 0.08, 0.35, 'sawtooth', 0.2, o, undefined, 5000));
        this.whistle(t + 0.05, 0.3, o);
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
    const beat = barLen / 4, step = barLen / 8;
    const m = this.musicGain;
    // pulso do baixo em colcheias (serrilhado filtrado) + bumbo nos tempos 1 e 3 + chimbal nos contratempos
    for (let i = 0; i < 8; i++) this.tone(noteFreq(ch.bass), t + i * step, step * 0.9, 'sawtooth', 0.42, m, undefined, 520, 0.01);
    for (const b of [0, 2]) this.tone(120, t + b * beat, 0.16, 'sine', 0.9, m, 38);
    for (let i = 0; i < 4; i++) this.noise(t + i * beat + step, 0.05, 0.22, m, 7000, 9000);
    // pad suave
    ch.chord.forEach((n) => this.tone(noteFreq(n), t, barLen * 0.98, 'sine', 0.12, m, undefined, undefined, 0.25));
    // arpejo brilhante
    ARP.forEach((idx, i) => this.tone(noteFreq(ch.chord[idx % 3] + 12 + (idx === 3 ? 12 : 0)), t + i * step, step * 1.4, 'square', 0.1, m, undefined, 3200, 0.008));
  }
}

export const audio = new AudioSys();
