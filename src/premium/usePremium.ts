import { useEffect, useState } from 'react';
import { loadExtras } from './loader';

/** Estado do pacote dos extras: 'loading' (carregando), 'on' (liberado) ou 'off' (Premium necessário). */
export type ExtrasState = 'loading' | 'on' | 'off';
let cached: ExtrasState = 'loading';
const listeners = new Set<(s: ExtrasState) => void>();
const set = (s: ExtrasState) => { cached = s; listeners.forEach((f) => f(s)); };
let started = false;
const start = () => { if (started) return; started = true; loadExtras().then(() => set('on')).catch(() => set('off')); };

export function useExtras(): ExtrasState {
  const [s, setS] = useState<ExtrasState>(cached);
  useEffect(() => { listeners.add(setS); start(); setS(cached); return () => { listeners.delete(setS); }; }, []);
  return s;
}
/** Tenta de novo (depois de assinar). */
export function recheckExtras(): void { started = false; cached = 'loading'; start(); }
