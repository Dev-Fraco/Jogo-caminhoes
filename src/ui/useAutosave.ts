import { useEffect, useRef, useState } from 'react';
import { Autosaver } from '../engine/autosave';
import { onSaveResult, saveGame, takeLoadNotice } from '../engine/save';
import type { GameState } from '../engine/types';

/** Salva a carreira nos momentos certos, grava o que estiver pendente quando o aplicativo vai para segundo plano e avisa falhas e recuperações. */
export function useAutosave(game: GameState | null) {
  const saver = useRef<Autosaver>();
  if (!saver.current) saver.current = new Autosaver();
  const [failure, setFailure] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(() => takeLoadNotice());
  useEffect(() => { onSaveResult((o) => setFailure(o.ok ? null : o.message)); return () => onSaveResult(null); }, []);
  useEffect(() => { if (game) saver.current!.update(game); }, [game]);
  useEffect(() => {
    const flush = () => { saver.current!.flush(); };
    const vis = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('pagehide', flush); window.addEventListener('beforeunload', flush); document.addEventListener('visibilitychange', vis);
    return () => { window.removeEventListener('pagehide', flush); window.removeEventListener('beforeunload', flush); document.removeEventListener('visibilitychange', vis); };
  }, []);
  return {
    failure, notice,
    dismiss: () => setNotice(null),
    retry: () => { if (game) { const o = saveGame(game, { urgent: true }); setFailure(o.ok ? null : o.message); } },
    /** Depois de carregar outro save dentro do app: mostra o aviso de recuperação, se houve. */
    checkNotice: () => { const n = takeLoadNotice(); if (n) setNotice(n); },
  };
}
