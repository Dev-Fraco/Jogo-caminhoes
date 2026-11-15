import { useRef, useState } from 'react';
import { CALC_START, calcPress, type CalcKey, type CalcState } from '../engine/calculator';
import { connOf, phoneOf, toggleConn, updatePhoneSettings, type Conn } from '../engine/phone';
import type { GameState } from '../engine/types';
import { loadSettings, saveSettings } from '../settings/settings';

interface Props { game: GameState; onChange: (g: GameState) => void; onClose: () => void; onCalc: () => void; canCalc: boolean }

/** Painel rápido do celular (puxe a tela para baixo): Wi-Fi, dados móveis, modo avião, calculadora, brilho e volume. */
export function QuickPanel({ game, onChange, onClose, onCalc, canCalc }: Props) {
  const c = connOf(game);
  const s = phoneOf(game).settings;
  const [vol, setVol] = useState(() => { const a = loadSettings().audio; return a.muted ? 0 : a.master; });
  const startY = useRef<number | null>(null);
  const setVolume = (v: number) => {
    setVol(v);
    const cur = loadSettings();
    saveSettings({ ...cur, audio: { ...cur.audio, master: v, muted: v === 0 } });
  };
  const tile = (key: Conn, icon: string, label: string, sub: string) => (
    <button key={key} className={`qs-tile ${c[key] ? 'on' : ''}`} aria-pressed={c[key]} onClick={() => onChange(toggleConn(game, key))}>
      <span aria-hidden="true">{icon}</span><b>{label}</b><small>{sub}</small>
    </button>
  );
  return (
    <div className="qs-wrap" role="dialog" aria-label="Painel rápido" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="qs" onPointerDown={(e) => { startY.current = e.clientY; }} onPointerUp={(e) => { if (startY.current !== null && startY.current - e.clientY > 50) onClose(); startY.current = null; }}>
        <div className="qs-grid">
          {tile('wifi', '📶', 'Wi-Fi', c.wifi ? 'Ligado' : 'Desligado')}
          {tile('mobileData', '📡', 'Dados móveis', c.mobileData ? 'Ligado' : 'Desligado')}
          {tile('airplane', '✈️', 'Modo avião', c.airplane ? 'Ligado' : 'Desligado')}
          <button className="qs-tile" disabled={!canCalc} onClick={() => { onClose(); onCalc(); }}><span aria-hidden="true">🧮</span><b>Calculadora</b><small>{canCalc ? 'Abrir' : 'Desbloqueie'}</small></button>
        </div>
        <label className="qs-slider"><span aria-hidden="true">☀️</span><input type="range" min={30} max={100} value={s.brightness} aria-label="Brilho" onChange={(e) => onChange(updatePhoneSettings(game, { brightness: Number(e.target.value) }))} /><b>{s.brightness}%</b></label>
        <label className="qs-slider"><span aria-hidden="true">{vol === 0 ? '🔇' : '🔊'}</span><input type="range" min={0} max={100} value={vol} aria-label="Volume" onChange={(e) => setVolume(Number(e.target.value))} /><b>{vol}%</b></label>
        <button className="qs-handle" onClick={onClose} aria-label="Fechar painel"><i /></button>
      </div>
    </div>
  );
}

/** Calculadora do celular. */
export function CalcApp() {
  const [st, setSt] = useState<CalcState>(CALC_START);
  const keys: CalcKey[][] = [['C', '±', '%', '÷'], ['7', '8', '9', '×'], ['4', '5', '6', '-'], ['1', '2', '3', '+'], ['⌫', '0', ',', '=']];
  return (
    <div className="ph-app-screen calc">
      <h2>🧮 Calculadora</h2>
      <output className="calc-out" aria-live="polite">{st.display}</output>
      <div className="calc-keys">
        {keys.flat().map((k) => <button key={k} className={`${'÷×-+='.includes(k) ? 'op' : k === 'C' ? 'clr' : ''}`} onClick={() => setSt(calcPress(st, k))} aria-label={k === '⌫' ? 'Apagar' : k}>{k}</button>)}
      </div>
    </div>
  );
}
