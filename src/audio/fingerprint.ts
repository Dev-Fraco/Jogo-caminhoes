import { loadSettings } from '../settings/settings';
import { volumes } from './audio';

/** Som do leitor de digital (arquivo em public/sounds): toca enquanto o dedo está no sensor, ao entrar no celular ou pagar com a digital. */
const FILE = './sounds/freesound_community-digital-91828.mp3';
let el: HTMLAudioElement | null = null;

/** Volume do som: o de efeitos das Opções (com o geral e o mudo); 0 = não toca. */
export const fingerVolume = (): number => Math.min(1, volumes(loadSettings()).sfx * 2);

export function fingerSoundStart() {
  if (typeof Audio === 'undefined') return;
  const v = fingerVolume(); if (v <= 0) return;
  try {
    if (!el) { el = new Audio(FILE); el.preload = 'auto'; }
    el.volume = v; el.currentTime = 0;
    const p = el.play() as Promise<void> | undefined; if (p && typeof p.catch === 'function') p.catch(() => { /* bloqueado pelo navegador: sem som */ });
  } catch { /* sem áudio */ }
}
/** Soltou o dedo antes da leitura terminar: o som para. */
export function fingerSoundStop() { try { el?.pause(); if (el) el.currentTime = 0; } catch { /* nada a parar */ } }
