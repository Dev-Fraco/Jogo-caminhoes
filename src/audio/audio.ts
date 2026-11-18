import { loadSettings, type Settings } from '../settings/settings';
import { WHISTLE_PATTERNS, type Cue, type WhistleKind, type WhistleType } from './cues';

/**
 * Som do jogo, gerado na hora (sem arquivos), no espírito dos jogos de futebol do PlayStation 1:
 * música de menu em tom maior com melodia de onda quadrada, baixo, bumbo e caixa; efeitos de "blip" de 8 bits; apito de árbitro e torcida.
 */
export type Sfx = 'click' | 'goal' | 'concede' | 'whistle' | 'cash' | 'error' | 'whoosh' | 'notify' | 'unlock' | 'back';

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

/** Vogais (formantes F1/F2 em Hz) para as vozes sintetizadas da torcida. */
export const VOWELS = { a: [800, 1200], e: [450, 2000], o: [500, 900], u: [300, 700] } as const;
export type Vowel = keyof typeof VOWELS;

/**
 * Canto da torcida (original, feito no jogo): "ô-lê ô-lê ô-lê ô-lê", "ô-lê ô-lê ô-lá". Cada sílaba: nota MIDI, duração em tempos e vogal.
 * Dois compassos de 4 tempos por frase; o bumbo bate nos tempos 1 e 3 e as palmas nos tempos 2 e 4.
 */
export const CHANT_BPM = 104;
export const CHANT: { midi: number; beats: number; vowel: Vowel }[] = [
  { midi: 62, beats: 0.5, vowel: 'o' }, { midi: 67, beats: 0.5, vowel: 'e' }, { midi: 62, beats: 0.5, vowel: 'o' }, { midi: 67, beats: 0.5, vowel: 'e' },
  { midi: 62, beats: 0.5, vowel: 'o' }, { midi: 67, beats: 0.5, vowel: 'e' }, { midi: 62, beats: 0.5, vowel: 'o' }, { midi: 67, beats: 0.5, vowel: 'e' },
  { midi: 65, beats: 0.5, vowel: 'o' }, { midi: 69, beats: 0.5, vowel: 'e' }, { midi: 65, beats: 0.5, vowel: 'o' }, { midi: 69, beats: 0.5, vowel: 'e' },
  { midi: 62, beats: 0.5, vowel: 'o' }, { midi: 67, beats: 0.5, vowel: 'e' }, { midi: 62, beats: 1, vowel: 'a' },
];

export function volumes(s: Settings) {
  const m = s.audio.muted ? 0 : s.audio.master / 100;
  return {
    music: m * (s.audio.music / 100) * 0.16, sfx: m * (s.audio.sfx / 100) * 0.5,
    /** partida: torcida (ambiente e reações), efeitos (chute, trave, rede) e apito do árbitro, cada um com o seu volume */
    crowd: m * ((s.audio.crowd ?? 80) / 100) * 0.5, matchfx: m * ((s.audio.matchfx ?? 80) / 100) * 0.6, whistle: m * ((s.audio.whistle ?? 80) / 100) * 0.55,
  };
}

class AudioSys {
  private ctx: AudioContext | null = null;
  private musicGain!: GainNode;
  private sfxGain!: GainNode;
  private crowdGain!: GainNode;
  private crowdSrc: AudioBufferSourceNode | null = null;
  private chantGain!: GainNode;
  private fxGain!: GainNode;
  private whistleGain!: GainNode;
  private reactGain!: GainNode;
  private lastCue = new Map<string, number>();
  private crowdBase = 0.1;
  private chantTimer: ReturnType<typeof setInterval> | null = null;
  private chantNext = 0;
  private chantOn = false;
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
      this.chantGain = this.ctx.createGain(); this.chantGain.gain.value = 0; this.chantGain.connect(this.ctx.destination);
      this.fxGain = this.ctx.createGain(); this.fxGain.connect(this.ctx.destination);
      this.whistleGain = this.ctx.createGain(); this.whistleGain.connect(this.ctx.destination);
      this.reactGain = this.ctx.createGain(); this.reactGain.connect(this.ctx.destination);
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
    this.chantGain.gain.setTargetAtTime(this.chantOn ? v.crowd * 0.6 : 0, this.ctx.currentTime, 0.2);
    this.fxGain.gain.setTargetAtTime(v.matchfx, this.ctx.currentTime, 0.05);
    this.whistleGain.gain.setTargetAtTime(v.whistle, this.ctx.currentTime, 0.05);
    this.reactGain.gain.setTargetAtTime(v.crowd, this.ctx.currentTime, 0.05);
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

  /** Voz de torcida: 3 ondas serra levemente desafinadas passando por dois filtros de vogal. */
  private voice(freq: number, t: number, dur: number, vowel: Vowel, vol: number, dest: AudioNode, glideTo?: number) {
    const c = this.ctx!;
    const [f1, f2] = VOWELS[vowel];
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.06, dur * 0.3)); g.gain.setValueAtTime(vol, t + dur * 0.65); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    for (const [f, q, k] of [[f1, 5, 1], [f2, 8, 0.6]] as const) {
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
      const mix = c.createGain(); mix.gain.value = k; bp.connect(mix); mix.connect(g);
      for (const det of [-9, 0, 9]) {
        const o = c.createOscillator(); o.type = 'sawtooth'; o.detune.value = det + (Math.random() - 0.5) * 8;
        o.frequency.setValueAtTime(freq, t); if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
        o.connect(bp); o.start(t); o.stop(t + dur + 0.05);
      }
    }
    g.connect(dest);
  }

  /** Gol do seu time: a torcida explode (rugido, "aaaah" subindo e palmas). */
  private cheer(t: number, o: AudioNode) {
    this.noise(t, 2.6, 0.9, o, 500, 1500); this.noise(t + 0.2, 2.2, 0.5, o, 1500, 700);
    for (const base of [196, 247, 294, 330]) this.voice(base * (0.97 + Math.random() * 0.06), t + Math.random() * 0.1, 1.7, 'a', 0.22, o, base * 1.35);
    for (let i = 0; i < 14; i++) this.noise(t + 0.4 + i * 0.11 + Math.random() * 0.05, 0.05, 0.2, o, 3500, 4500, 'highpass'); // palmas
  }

  /** Gol sofrido: "uuuuh" grave e descendo, murmúrio abafado e assobios de vaia. */
  private groan(t: number, o: AudioNode) {
    this.noise(t, 2.0, 0.35, o, 400, 200, 'lowpass');
    for (const base of [150, 180, 220]) this.voice(base * (0.97 + Math.random() * 0.06), t + Math.random() * 0.15, 1.5, 'u', 0.25, o, base * 0.68);
    this.voice(170, t + 0.1, 1.3, 'o', 0.12, o, 120);
    for (let i = 0; i < 5; i++) { // assobios (vaia)
      const at = t + 0.5 + i * 0.22 + Math.random() * 0.12;
      this.tone(2400 + Math.random() * 500, at, 0.5, 'sine', 0.07, o, 2900 + Math.random() * 400);
    }
  }

  /** Canto da torcida em loop durante a partida (ligue com `chants(true)`). */
  chants(on: boolean) {
    this.chantOn = on;
    this.refresh(this.settings ?? loadSettings());
    if (!this.ctx) return;
    if (!on) { if (this.chantTimer) { clearInterval(this.chantTimer); this.chantTimer = null; } return; }
    if (this.chantTimer) return;
    const beat = 60 / CHANT_BPM, barLen = beat * 4;
    this.chantNext = this.ctx.currentTime + 0.2;
    const schedule = () => {
      const c = this.ctx!;
      while (this.chantNext < c.currentTime + 0.8) {
        const t0 = this.chantNext; let at = 0;
        for (const syl of CHANT) {
          const dur = syl.beats * beat;
          for (const m of [syl.midi - 12, syl.midi, syl.midi + 12]) this.voice(noteFreq(m) * (0.99 + Math.random() * 0.02), t0 + at * beat, dur * 0.9, syl.vowel, 0.1, this.chantGain);
          at += syl.beats;
        }
        for (let b = 0; b < 8; b++) { // 2 compassos de percussão: bumbo (tempos 1 e 3) e palmas (2 e 4)
          const bt = t0 + b * beat;
          if (b % 2 === 0) this.tone(120, bt, 0.16, 'sine', 0.7, this.chantGain, 45); else for (let k = 0; k < 3; k++) this.noise(bt + k * 0.012, 0.05, 0.25, this.chantGain, 2800, 3600, 'highpass');
        }
        this.chantNext += barLen * 2;
      }
    };
    schedule();
    this.chantTimer = setInterval(schedule, 300);
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
        this.cheer(t, o); // a torcida explode de alegria
        break;
      }
      case 'concede': this.groan(t, o); break; // gol sofrido: murmúrio, "uuuh" e vaia
    }
  }

  /** Apito do árbitro (o tipo vem das configurações): um toque com "bolinha", eletrônico ou agudo. */
  private whistleBlast(t: number, dur: number, type: WhistleType, dest: AudioNode) {
    const c = this.ctx!;
    const env = c.createGain(); env.gain.setValueAtTime(0.0001, t); env.gain.exponentialRampToValueAtTime(0.9, t + 0.025); env.gain.setValueAtTime(0.9, t + Math.max(0.03, dur - 0.06)); env.gain.exponentialRampToValueAtTime(0.0001, t + dur); env.connect(dest);
    const trill = (hz: number, depth: number) => { const lfo = c.createOscillator(), d = c.createGain(); lfo.type = 'square'; lfo.frequency.value = hz; d.gain.value = depth; lfo.connect(d); d.connect(env.gain); lfo.start(t); lfo.stop(t + dur + 0.05); };
    const osc = (type2: OscillatorType, f0: number, f1: number, vol: number, to: AudioNode = env) => { const o = c.createOscillator(), g = c.createGain(); o.type = type2; o.frequency.setValueAtTime(f0, t); o.frequency.linearRampToValueAtTime(f1, t + dur * 0.25); g.gain.value = vol; o.connect(g); g.connect(to); o.start(t); o.stop(t + dur + 0.05); };
    if (type === 'classic') { osc('triangle', 2800, 3100, 0.55); osc('sine', 2810, 3120, 0.25); trill(26, 0.35); this.noise(t, dur, 0.08, dest, 3200, 3300); }       // apito de bolinha: tom com trinado rápido
    else if (type === 'electronic') { osc('sine', 3300, 3300, 0.5); osc('sine', 3318, 3318, 0.3); const v = c.createOscillator(), vg = c.createGain(); v.frequency.value = 6; vg.gain.value = 30; v.connect(vg); v.start(t); v.stop(t + dur + 0.05); } // tom limpo com leve batimento
    else { osc('square', 3800, 3950, 0.22); osc('triangle', 4150, 4250, 0.3); trill(34, 0.25); this.noise(t, dur, 0.06, dest, 4200, 4400); }               // apito agudo e metálico
  }

  /** Toca um apito completo (os toques de cada tipo de apito estão em cues.ts). */
  refWhistle(kind: WhistleKind, type: WhistleType = this.settings?.audio.whistleType ?? 'classic') {
    const c = this.ctx;
    if (!c || c.state !== 'running') return;
    const t = c.currentTime + 0.01;
    for (const b of WHISTLE_PATTERNS[kind]) this.whistleBlast(t + b.at, b.dur, type, this.whistleGain);
  }
  /** Para o jogador ouvir o apito escolhido nas Opções. */
  previewWhistle(type: WhistleType) { this.refWhistle('foul', type); }

  /** A torcida se agita por um instante (reação a um lance): sobe o volume e volta ao normal. */
  private swell(amount: number, secs: number) {
    const c = this.ctx; if (!c || !this.crowdSrc) return;
    const g = this.crowdGain.gain, now = c.currentTime;
    g.cancelScheduledValues(now); g.setTargetAtTime(this.crowdBase * (1 + amount), now, 0.12); g.setTargetAtTime(this.crowdBase, now + secs, 0.9);
  }

  /** Reação do campo (chute, trave, rede, torcida...) no instante em que acontece. `speed` = velocidade da partida (em 3x/4x os chutes comuns ficam em silêncio para não virar ruído). */
  cue(q: Cue, speed = 1) {
    const c = this.ctx;
    if (!c || c.state !== 'running') return;
    const now = c.currentTime, t = now + 0.005;
    const gap = (k: string, s: number) => { const last = this.lastCue.get(k) ?? -9; if (now - last < s) return false; this.lastCue.set(k, now); return true; };
    switch (q.k) {
      case 'whistle': this.refWhistle(q.v); break;
      case 'kick': if (speed > 2 && q.p < 16) break; if (!gap('kick', 0.12)) break; { const v = Math.min(1, Math.max(0.3, q.p / 26)); this.tone(150, t, 0.11, 'sine', 0.9 * v, this.fxGain, 52); this.noise(t, 0.03, 0.5 * v, this.fxGain, 2500, 1200, 'highpass'); } break;
      case 'post': if (!gap('post', 0.25)) break; for (const [f, v] of [[820, 0.5], [1570, 0.3], [2430, 0.18]] as const) this.tone(f, t, 0.7, 'sine', v, this.fxGain); this.noise(t, 0.02, 0.6, this.fxGain, 4000, 2000, 'highpass'); break;
      case 'net': if (!gap('net', 0.4)) break; this.noise(t, 0.55, 0.45 * Math.min(1, q.p / 20 + 0.4), this.fxGain, 1400, 300); this.tone(90, t, 0.2, 'sine', 0.4, this.fxGain, 60); break;
      case 'cheer': if (!gap('cheer', 1.5)) break; { const k = this.ctx!.createGain(); k.gain.value = q.big ? 1 : 0.5; k.connect(this.reactGain); this.cheer(t, k); this.swell(q.big ? 0.9 : 0.4, q.big ? 4.5 : 2); } break;
      case 'groan': if (!gap('groan', 1.5)) break; { const k = this.ctx!.createGain(); k.gain.value = 0.8; k.connect(this.reactGain); this.groan(t, k); } break;
      case 'oh': if (!gap('oh', 1.2)) break; { const k = this.ctx!.createGain(); k.gain.value = 0.7; k.connect(this.reactGain); for (const base of [196, 247, 294]) this.voice(base * (0.97 + Math.random() * 0.06), t, 1.2, 'o', 0.2, k, base * 1.3); this.noise(t, 1.2, 0.25, k, 600, 1200); this.swell(0.5, 1.6); } break;
      case 'murmur': if (!gap('murmur', 3)) break; { const k = this.ctx!.createGain(); k.gain.value = 0.6; k.connect(this.reactGain); this.noise(t, 2.4, 0.3, k, 500, 300, 'lowpass'); } break;
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
    this.crowdBase = (this.settings ? volumes(this.settings).crowd : 0.3) * 0.28;
    this.crowdGain.gain.setTargetAtTime(this.crowdBase, c.currentTime, 0.4);
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
