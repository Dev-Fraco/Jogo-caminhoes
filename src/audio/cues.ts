/** Sinais de som da partida: o campo (world.ts) avisa o que aconteceu, no instante certo, e o áudio toca. Assim o som acompanha a animação em qualquer velocidade. */
export type WhistleType = 'classic' | 'electronic' | 'sharp';
export const WHISTLE_TYPES: { id: WhistleType; label: string }[] = [{ id: 'classic', label: 'Clássico (com bolinha)' }, { id: 'electronic', label: 'Eletrônico' }, { id: 'sharp', label: 'Agudo' }];

export type WhistleKind = 'start' | 'foul' | 'half' | 'end' | 'penalty' | 'offside' | 'restart';
/** Toques de cada apito: instante (s) e duração (s). Início: um longo; falta: um curto; intervalo: dois longos; fim: três; pênalti: um bem longo; impedimento: um médio. */
export const WHISTLE_PATTERNS: Record<WhistleKind, { at: number; dur: number }[]> = {
  start: [{ at: 0, dur: 0.9 }],
  foul: [{ at: 0, dur: 0.32 }],
  half: [{ at: 0, dur: 0.6 }, { at: 0.8, dur: 0.6 }],
  end: [{ at: 0, dur: 0.6 }, { at: 0.85, dur: 0.6 }, { at: 1.7, dur: 0.95 }],
  penalty: [{ at: 0, dur: 1.1 }],
  offside: [{ at: 0, dur: 0.5 }],
  restart: [{ at: 0, dur: 0.3 }],
};

export type Cue =
  | { k: 'whistle'; v: WhistleKind }
  | { k: 'kick'; p: number }      // chute na bola (p = velocidade da bola, m/s)
  | { k: 'post' }                 // bola na trave ou no travessão
  | { k: 'net'; p: number }       // bola na rede
  | { k: 'cheer'; big: boolean }  // torcida comemora
  | { k: 'groan' }                // torcida reclama/vaia
  | { k: 'oh' }                   // reação a uma grande chance
  | { k: 'murmur' };              // torcida inquieta (VAR)
