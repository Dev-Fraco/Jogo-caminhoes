import { loadSettings, type Settings } from '../settings/settings';

/**
 * Som do jogo, gerado na hora (sem arquivos), no espírito dos jogos de futebol do PlayStation 1:
 * música de menu em tom maior com melodia de onda quadrada, baixo, bumbo e caixa; efeitos de "blip" de 8 bits; apito de árbitro e torcida.
 */
export type Sfx = 'click' | 'goal' | 'whistle' | 'cash' | 'error' | 'whoosh' | 'notify' | 'unlock' | 'back';

export const noteFreq = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

/** Progressão de 8 compassos (dó maior): raiz do baixo e acorde. */
export const PROGRESSION: { bass: number; chord: number[] }[] = [
  { bass: 48, chord: [60, 64, 67] }, // C
  { bass: 45, chord: [57, 60, 64] }, // Am
  { bass: 41, chord: [60, 65, 69] }, // F
  { bass: 43, chord: [59, 62, 67] }, // G
  { bass: 48, chord: [60, 64, 67] }, // C
  { bass: 40, chord: [59, 64, 67] }, // Em
  { bass: 41, chord: [60, 65, 69] }, // F
  { bass: 43, chord: [59, 62, 67] }, // G
];
export const BPM = 126;
/** Quais colcheias do compasso o baixo toca em oitava alta (padrão "pula-pula" de 8 passos). */
export const ARP = [0, 1, 0, 1, 0, 1, 0, 1];
/** Melodia: 8 colcheias por compasso (nota MIDI ou null = pausa). */
export const MELODY: (number | null)[][] = [
  [76, 76, 79, 76, 72, 74, 76, null],
  [76, 76, 81, 76, 72, 76, 74, null],
  [77, 77, 81, 77, 72, 77, 81, null],
  [79, 77, 76, 74, 76, 74, 72, null],
  [79, 79, 84, 79, 76, 79, 84, null],
  [79, 79, 83, 79, 76, 79, 83, null],
  [81, 81, 84, 81, 77, 81, 84, null],
  [83, 81, 79, 77, 74, 77, 79, null],
];

export function volumes(s: Settings) {
  const m = s.audio.muted ? 0 : s.audio.master / 100;
  return { music: m * (s.audio.music / 100) * 0.16, sfx: m * (s.audio.sfx / 100) * 0.5 };
}

class AudioSys {
  private ctx: AudioContext | null = null;
  private musicGain!: GainNode;
  private sfxGain!: GainNode;
  private crowdGain!: GainNode;
  private crowdSrc: AudioBufferSourceNode | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextBar = 0;
  private bar = 0;
  private wantMusic = false;
  private ducked = false;
  private settings: Settings | null = null;

  /** Cria o áudio na primeira interação do usuário (exigência dos navegadores e do celular). */
  unlock() {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.musicGain = this.ctx.createGain(); this.musicGain.connect(this.ctx.destination);
      this.sfxGain = this.ctx.createGain(); this.sfxGain.connect(this.ctx.destination);
      this.crowdGain = this.ctx.createGain(); this.crowdGain.gain.value = 0; this.crowdGain.connect(this.ctx.destination);
      this.refresh();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    if (this.wantMusic) this.startLoop();
  }

  /** Relê o volume das configurações (chamado quando elas são salvas). */
  refresh(s: Settings = loadSettings()) {
    this.settings = s;
    if (!this.ctx) return;
    const v = volumes(s);
    this.musicGain.gain.setTargetAtTime(v.music * (this.ducked ? 0.2 : 1), this.ctx.currentTime, 0.08);
    this.sfxGain.gain.setTargetAtTime(v.sfx, this.ctx.currentTime, 0.05);
  }

  setMusic(on: boolean) {
    this.wantMusic = on;
    if (on) this.startLoop(); else this.stopLoop();
  }

  /** Baixa a música (durante a partida) para a torcida aparecer. */
  duck(on: boolean) { this.ducked = on; this.refresh(this.settings ?? loadSettings()); }

  suspend(hidden: boolean) {
    if (!this.ctx) return;
    if (hidden) void this.ctx.suspend(); else void this.ctx.resume();
  }

  private tone(freq: number, t: number, dur: number, type: OscillatorType, vol: number, dest: AudioNode, glideTo?: number, cutoff?: number, attack = 0.004) {
    const c = this.ctx!;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.setValueAtTime(vol, t + Math.max(attack, dur * 0.6));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    if (cutoff) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff; o.connect(f); f.connect(g); } else o.connect(g);
    g.connect(dest);
    o.start(t); o.stop(t + dur + 0.05);
  }

  private noise(t: number, dur: number, vol: number, dest: AudioNode, from = 800, to = 800, type: BiquadFilterType = 'bandpass') {
    const c = this.ctx!;
    const buf = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate * dur)), c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(from, t); f.frequency.exponentialRampToValueAtTime(Math.max(40, to), t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(dest);
    src.start(t);
  }

  /** Apito de árbitro com a "bolinha" (tremolo rápido). */
  private whistle(t: number, dur: number, dest: AudioNode) {
    const c = this.ctx!;
    const o = c.createOscillator(), g = c.createGain(), lfo = c.createOscillator(), depth = c.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(2800, t); o.frequency.linearRampToValueAtTime(3150, t + dur * 0.2); o.frequency.linearRampToValueAtTime(2950, t + dur);
    lfo.type = 'square'; lfo.frequency.value = 26; depth.gain.value = 0.4;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 0.02); g.gain.setValueAtTime(0.5, t + dur - 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    lfo.connect(depth); depth.connect(g.gain);
    o.connect(g); g.connect(dest);
    o.start(t); lfo.start(t); o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
    this.noise(t, dur, 0.1, dest, 3200, 3300);
  }

  sfx(name: Sfx) {
    const c = this.ctx;
    if (!c || c.state !== 'running') return;
    const t = c.currentTime, o = this.sfxGain;
    const sq = (m: number, at: number, d: number, v = 0.28) => this.tone(noteFreq(m), t + at, d, 'square', v, o, undefined, 6000);
    switch (name) {
      case 'click': sq(93, 0, 0.03, 0.22); sq(89, 0.03, 0.04, 0.2); break; // "ti-tu" do cursor do menu
      case 'back': sq(84, 0, 0.04, 0.22); sq(77, 0.04, 0.06, 0.2); break;
      case 'unlock': sq(84, 0, 0.06); sq(88, 0.07, 0.06); sq(91, 0.14, 0.14); break;
      case 'notify': sq(88, 0, 0.09); sq(93, 0.1, 0.16); break;
      case 'cash': sq(95, 0, 0.07, 0.24); sq(100, 0.07, 0.3, 0.26); break;
      case 'error': this.tone(150, t, 0.16, 'square', 0.3, o, 110, 1500); this.tone(110, t + 0.16, 0.22, 'square', 0.3, o, 80, 1200); break;
      case 'whoosh': this.noise(t, 0.5, 0.5, o, 300, 3500); break;
      case 'whistle': this.whistle(t, 0.25, o); this.whistle(t + 0.34, 0.7, o); break;
      case 'goal': {
        [72, 76, 79, 84, 79, 84, 88].forEach((m, i) => sq(m, i * 0.075, 0.12, 0.26)); // fanfarra de gol
        this.noise(t, 1.6, 0.8, o, 600, 1500); // a torcida explode
        break;
      }
    }
  }

  /** Torcida do estádio (ruído suave e contínuo) durante a partida. */
  crowd(on: boolean) {
    const c = this.ctx;
    if (!c) return;
    if (!on) { this.crowdGain.gain.setTargetAtTime(0, c.currentTime, 0.3); window.setTimeout(() => { try { this.crowdSrc?.stop(); } catch { /* já parou */ } this.crowdSrc = null; }, 900); return; }
    if (!this.crowdSrc) {
      const buf = c.createBuffer(1, c.sampleRate * 3, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (0.7 + 0.3 * Math.sin(i / 9000));
      const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 650; f.Q.value = 0.6;
      src.connect(f); f.connect(this.crowdGain); src.start();
      this.crowdSrc = src;
    }
    const v = this.settings ? volumes(this.settings).sfx : 0.3;
    this.crowdGain.gain.setTargetAtTime(v * 0.22, c.currentTime, 0.4);
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
    const i = this.bar % PROGRESSION.length;
    const ch = PROGRESSION[i];
    const beat = barLen / 4, step = barLen / 8;
    const m = this.musicGain;
    // melodia (onda quadrada) — a 2ª metade da música repete uma oitava mais "aberta" com mais volume
    MELODY[i].forEach((n, k) => { if (n !== null) this.tone(noteFreq(n), t + k * step, step * 0.85, 'square', 0.16, m, undefined, 4200); });
    // baixo triangular saltitante: raiz e oitava
    ARP.forEach((hi, k) => this.tone(noteFreq(ch.bass + (hi ? 12 : 0)), t + k * step, step * 0.8, 'triangle', 0.5, m));
    // acorde em semínimas curtas (contratempo)
    for (let b = 0; b < 4; b++) if (b % 2 === 1) ch.chord.forEach((n) => this.tone(noteFreq(n - 12), t + b * beat + step, step * 0.7, 'square', 0.05, m, undefined, 2500));
    // bateria: bumbo (1 e 3), caixa (2 e 4), chimbal (colcheias)
    for (const b of [0, 2]) this.tone(140, t + b * beat, 0.12, 'sine', 0.8, m, 45);
    for (const b of [1, 3]) this.noise(t + b * beat, 0.11, 0.38, m, 2200, 1500);
    for (let k = 0; k < 8; k++) this.noise(t + k * step, 0.04, 0.12, m, 8000, 9000, 'highpass');
  }
}

export const audio = new AudioSys();
