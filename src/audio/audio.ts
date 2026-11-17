import { loadSettings, type Settings } from '../settings/settings';
import { sounds, type SoundId } from './sounds';

/**
 * Som do jogo, gerado na hora (sem arquivos), no espírito dos jogos de futebol do PlayStation 1:
 * música de menu em tom maior com melodia de onda quadrada, baixo, bumbo e caixa; efeitos de "blip" de 8 bits; apito de árbitro e torcida.
 */
export type Sfx = 'click' | 'goal' | 'concede' | 'whistle' | 'cash' | 'error' | 'whoosh' | 'notify' | 'unlock' | 'back';

/** Qual arquivo toca em cada evento do jogo. */
const SFX_FILE: Record<Sfx, SoundId | undefined> = {
  click: 'click', back: 'transition', whoosh: 'transition',
  error: 'error', notify: 'notify', cash: 'notify', unlock: 'notify',
  whistle: 'whistle', goal: 'goalCheer', concede: undefined,
};

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
  return { music: m * (s.audio.music / 100) * 0.16, sfx: m * (s.audio.sfx / 100) * 0.5 };
}

class AudioSys {
  private ctx: AudioContext | null = null;
  private musicGain!: GainNode;
  private sfxGain!: GainNode;
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextBar = 0;
  private bar = 0;
  private wantMusic = false;
  private ducked = false;
  private settings: Settings | null = null;

  /** Cria o áudio na primeira interação do usuário (exigência dos navegadores e do celular). */
  unlock() {
    sounds.unlock();
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
    this.settings = s;
    sounds.refresh(s);
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
    sounds.suspend(hidden);
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

  /** Cantos da torcida em loop durante a partida. */
  chants(on: boolean) { sounds.loop('chants', on); }

  /** Efeito sonoro de um evento do jogo: toca o ARQUIVO combinado (ver sounds.ts); evento sem arquivo fica mudo. */
  sfx(name: Sfx) {
    const id = SFX_FILE[name];
    if (id) sounds.play(id);
  }

  /** Aplausos de gol: a festa da torcida (e, se o arquivo existir, a explosão em gol decisivo). */
  celebrate(decisive = false) { sounds.play('goalCheer'); if (decisive) sounds.play('roar'); }
  /** Chute de bola (mudo enquanto o arquivo não existir). */
  kick() { sounds.play('kick'); }
  /** Para todos os sons de partida (torcida, cantos, festa). */
  stopMatch() { sounds.stopAll(); }

  /** Ambiente de torcida durante a partida (arquivo em loop; não reinicia a cada atualização). */
  crowd(on: boolean) { sounds.loop('ambience', on); }

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
