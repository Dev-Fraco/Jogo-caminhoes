import { loadSettings, type Settings } from '../settings/settings';

/**
 * Efeitos sonoros a partir de ARQUIVOS (pasta public/sounds). Tudo passa por aqui: um lugar só decide qual arquivo toca,
 * em que volume, se pode sobrepor outro e quando para. Se um arquivo não existe (`file: null`), o efeito fica MUDO:
 * nenhum outro som é usado no lugar.
 */
export type SoundId = 'error' | 'notify' | 'transition' | 'click' | 'kick' | 'whistle' | 'goalCheer' | 'chants' | 'ambience' | 'roar';

export interface SoundDef {
  /** nome do arquivo em public/sounds; `null` = arquivo ainda não enviado (o efeito não toca) */
  file: string | null;
  /** volume deste efeito (0 a 1), multiplicado pelo volume geral e pelo de efeitos */
  volume: number;
  loop?: boolean;
  /** tempo mínimo entre duas execuções (evita sobreposição/exagero) */
  cooldownMs: number;
  /** corta o arquivo depois deste tempo (com fade) — arquivos longos com vários toques */
  maxMs?: number;
}

export const SOUNDS: Record<SoundId, SoundDef> = {
  error:      { file: 'lesiakower-error-mistake-sound-effect-incorrect-answer-437420.mp3', volume: 0.7, cooldownMs: 400 },
  notify:     { file: 'freesound_community-digital-91828.mp3', volume: 0.7, cooldownMs: 250 },
  transition: { file: 'lolo_s-down-474082.mp3', volume: 0.6, cooldownMs: 250 },
  click:      { file: 'liecio-menu_beep_short_snap-533778.mp3', volume: 0.5, cooldownMs: 60 },
  kick:       { file: null /* faltando: freesound_community-soccer-ball-kick-37625.mp3 */, volume: 0.8, cooldownMs: 350 },
  whistle:    { file: 'freesound_community-metal-whistle-6121.mp3', volume: 0.55, cooldownMs: 1500, maxMs: 1350 },
  goalCheer:  { file: 'arunangshubanerjee-live-football-match-stadium-crowd-cheering-563439.mp3', volume: 0.7, cooldownMs: 6000, maxMs: 7000 },
  chants:     { file: 'magiaz-torcida2-333439.mp3', volume: 0.3, loop: true, cooldownMs: 0 },
  ambience:   { file: 'freesound_community-football-crowd-3-69245.mp3', volume: 0.35, loop: true, cooldownMs: 0 },
  roar:       { file: null /* faltando: mrmark81-stadium-roar-concert-for-hire-message-me-471943.mp3 */, volume: 0.75, cooldownMs: 8000, maxMs: 6000 },
};

/** Arquivos que o jogo espera e ainda não existem (para relatar, nunca para substituir). */
export const missingSounds = (): SoundId[] => (Object.keys(SOUNDS) as SoundId[]).filter((k) => !SOUNDS[k].file);

type AudioLike = Pick<HTMLAudioElement, 'play' | 'pause' | 'currentTime' | 'volume' | 'loop' | 'paused'>;

class SoundBank {
  private els = new Map<SoundId, AudioLike>();
  private last = new Map<SoundId, number>();
  private cut = new Map<SoundId, ReturnType<typeof setTimeout>>();
  private wantLoop = new Set<SoundId>();
  private unlocked = false;
  private hidden = false;
  private settings: Settings | null = null;
  /** efeitos que NÃO podem tocar ao mesmo tempo (o novo substitui o anterior) */
  private static EXCLUSIVE: SoundId[][] = [['goalCheer', 'roar']];

  /** Chamado no primeiro toque do usuário (o navegador só libera áudio depois dele). */
  unlock() { this.unlocked = true; }

  private cfg(): Settings { return this.settings ?? (this.settings = loadSettings()); }

  /** Volume final de um efeito (0 se os efeitos estão desligados ou o jogo está mudo). */
  level(id: SoundId, s: Settings = this.cfg()): number {
    const a = s.audio;
    if (a.muted || a.sfxEnabled === false) return 0;
    return Math.min(1, (a.master / 100) * (a.sfx / 100) * SOUNDS[id].volume);
  }

  private el(id: SoundId): AudioLike | undefined {
    const def = SOUNDS[id];
    if (!def.file || typeof Audio === 'undefined') return undefined;
    let e = this.els.get(id);
    if (!e) {
      e = new Audio(`./sounds/${def.file}`);
      (e as HTMLAudioElement).preload = 'auto';
      e.loop = !!def.loop;
      this.els.set(id, e);
    }
    return e;
  }

  private start(id: SoundId, e: AudioLike) {
    try { e.currentTime = 0; } catch { /* ainda não carregou */ }
    try { const p = e.play() as Promise<void> | undefined; if (p && typeof p.catch === 'function') p.catch(() => { /* bloqueado: ignora */ }); } catch { /* sem áudio */ }
    const t = this.cut.get(id); if (t) clearTimeout(t);
    const max = SOUNDS[id].maxMs;
    if (max) this.cut.set(id, setTimeout(() => this.stop(id), max));
  }

  /** Toca um efeito curto. Retorna true se tocou. */
  play(id: SoundId): boolean {
    const def = SOUNDS[id];
    if (!this.unlocked || def.loop) return false;
    const vol = this.level(id);
    if (vol <= 0) return false;
    const e = this.el(id);
    if (!e) return false;                                       // arquivo ausente: silêncio
    const now = Date.now();
    if (now - (this.last.get(id) ?? -1e9) < def.cooldownMs) return false;
    for (const g of SoundBank.EXCLUSIVE) if (g.includes(id)) for (const o of g) if (o !== id) this.stop(o);
    this.last.set(id, now);
    e.volume = vol;
    this.start(id, e);
    return true;
  }

  /** Liga/desliga um som em loop (torcida, cantos). Só toca enquanto estiver ligado. */
  loop(id: SoundId, on: boolean) {
    if (!SOUNDS[id].loop) return;
    if (!on) { this.wantLoop.delete(id); this.stop(id); return; }
    if (this.wantLoop.has(id)) return;                          // já está ligado: não reinicia a cada atualização
    this.wantLoop.add(id);
    this.applyLoop(id);
  }

  private applyLoop(id: SoundId) {
    if (!this.unlocked || this.hidden || !this.wantLoop.has(id)) return;
    const e = this.el(id);
    if (!e) return;
    const v = this.level(id);
    if (v <= 0) return;
    e.volume = v;
    if (e.paused) this.start(id, e);
  }

  stop(id: SoundId) {
    const t = this.cut.get(id); if (t) { clearTimeout(t); this.cut.delete(id); }
    const e = this.els.get(id);
    if (!e) return;
    try { e.pause(); e.currentTime = 0; } catch { /* nada a parar */ }
  }

  /** Para tudo (sair da partida, mudo...). */
  stopAll() { this.wantLoop.clear(); for (const id of this.els.keys()) this.stop(id); }

  /** Os efeitos de partida (torcida, cantos, festa) ligados agora. */
  playing(): SoundId[] { return [...this.els.entries()].filter(([, e]) => !e.paused).map(([k]) => k); }

  /** Relê volume/ligado das configurações. */
  refresh(s: Settings = loadSettings()) {
    this.settings = s;
    for (const [id, e] of this.els) {
      const v = this.level(id, s);
      e.volume = v;
      if (v <= 0 && !e.paused) { try { e.pause(); } catch { /* ok */ } }
    }
    for (const id of this.wantLoop) this.applyLoop(id);         // voltou a ter volume: retoma o loop
  }

  /** App em segundo plano: pausa os loops; ao voltar, retoma os que ainda estão ligados. */
  suspend(hidden: boolean) {
    this.hidden = hidden;
    if (hidden) { for (const id of this.wantLoop) { try { this.els.get(id)?.pause(); } catch { /* ok */ } } }
    else for (const id of this.wantLoop) this.applyLoop(id);
  }
}

export const sounds = new SoundBank();
