import { useEffect, useState } from 'react';
import { loadExtras } from './loader';

/** Estado do pacote dos extras: 'loading' (carregando), 'on' (liberado), 'off' (Premium necessário) ou 'error' (o Premium está ativo, mas o conteúdo não carregou: sem internet, pacote da Play indisponível...). */
export type ExtrasState = 'loading' | 'on' | 'off' | 'error';
let lastError = '';
/** Código do último erro de carregamento do pacote (para mostrar ao jogador e ajudar no suporte). */
export const extrasError = (): string => lastError;
let cached: ExtrasState = 'loading';
const listeners = new Set<(s: ExtrasState) => void>();
const set = (s: ExtrasState) => { cached = s; listeners.forEach((f) => f(s)); };
let started = false;
const start = () => { if (started) return; started = true; loadExtras().then(() => { lastError = ''; set('on'); }).catch((e: unknown) => { const m = e instanceof Error ? e.message : String(e); if (m === 'premium-required') { lastError = ''; set('off'); } else { lastError = m; set('error'); } }); };

export function useExtras(): ExtrasState {
  const [s, setS] = useState<ExtrasState>(cached);
  useEffect(() => { listeners.add(setS); start(); setS(cached); return () => { listeners.delete(setS); }; }, []);
  return s;
}
/** Tenta de novo (depois de assinar). */
export function recheckExtras(): void { started = false; cached = 'loading'; start(); }
