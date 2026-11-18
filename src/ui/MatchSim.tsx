import { useEffect, useRef, useState } from 'react';
import { isHighlight, matchStats } from '../engine/matchstats';
import type { ClubInfo, MatchEvent, MatchResult } from '../engine/types';
import { ClubBadge } from './ClubBadge';

/** Duração da animação da simulação (o jogo já foi calculado: aqui só se revela a linha do tempo). */
export const SIM_MS = 6000;
const ICON: Partial<Record<MatchEvent['type'], string>> = { goal: '⚽', foul: '🅿️', var: '📺', yellow: '🟨', red: '🟥', injury: '🤕', tactic: '🔄', halftime: '⏸️', fulltime: '🏁' };

const ROWS: { k: 'shots' | 'onTarget' | 'saves' | 'fouls' | 'yellow' | 'red' | 'corners' | 'offsides' | 'penalties' | 'varReviews' | 'injuries' | 'changes'; label: string }[] = [
  { k: 'shots', label: 'Finalizações' }, { k: 'onTarget', label: 'No alvo' }, { k: 'saves', label: 'Defesas do goleiro' }, { k: 'fouls', label: 'Faltas' },
  { k: 'yellow', label: 'Cartões amarelos' }, { k: 'red', label: 'Cartões vermelhos' }, { k: 'corners', label: 'Escanteios' }, { k: 'offsides', label: 'Impedimentos' }, { k: 'penalties', label: 'Pênaltis a favor' }, { k: 'varReviews', label: 'Revisões do VAR' }, { k: 'injuries', label: 'Lesões' }, { k: 'changes', label: 'Mudanças táticas' },
];

/** Simulação da partida inteira: escudos, barra de tempo, gols e lances aparecendo e, no fim, placar e estatísticas. Usa o MESMO resultado da partida assistida. */
export function MatchSim({ home, away, result, userSide, onFinish }: { home: ClubInfo; away: ClubInfo; result: MatchResult; userSide: 'home' | 'away'; onFinish: () => void }) {
  const reduce = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const [minute, setMinute] = useState(reduce ? 90 : 0);
  const done = minute >= 90;
  const startRef = useRef(0);

  useEffect(() => {
    if (done) return;
    let raf = 0; startRef.current = performance.now() - (minute / 90) * SIM_MS;
    const tick = (now: number) => { const m = Math.min(90, ((now - startRef.current) / SIM_MS) * 90); setMinute(m); if (m < 90) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [done]); // eslint-disable-line react-hooks/exhaustive-deps

  const m = Math.floor(minute);
  const shown = result.events.filter((e) => e.minute <= m && isHighlight(e));
  const st = matchStats(result.events, done ? 999 : m);
  const goals = done ? [result.homeGoals, result.awayGoals] : [st.home.goals, st.away.goals];
  const mine = (e: MatchEvent) => e.side === userSide;

  return (
    <section className="ms" aria-label="Simulação da partida">
      <div className="lm-board">
        <div className="lm-side"><ClubBadge club={home} size={44} /><strong>{home.name}</strong></div>
        <div className="lm-score" aria-live="polite"><b>{goals[0]}</b><span>x</span><b>{goals[1]}</b></div>
        <div className="lm-side r"><ClubBadge club={away} size={44} /><strong>{away.name}</strong></div>
      </div>
      <div className="lm-clock">
        <span className="lm-min">{done ? 90 : m}'</span>
        <div className="lm-track" role="progressbar" aria-valuemin={0} aria-valuemax={90} aria-valuenow={done ? 90 : m} aria-label="Progresso da simulação">
          <i style={{ width: `${(minute / 90) * 100}%` }} /><b className="lm-half" style={{ left: '50%' }} />
        </div>
      </div>
      {!done && <button className="btn lm-pause ms-skip" onClick={() => setMinute(90)}>⏭ Ir direto ao final</button>}
      <ol className="lm-feed ms-feed" aria-label="Lances da partida">
        {shown.length === 0 && <li className="lm-empty">Bola rolando…</li>}
        {[...shown].reverse().map((e, i) => (
          <li key={`${e.minute}-${i}-${e.type}-${e.text}`} className={`${e.type} ${e.type === 'goal' ? (mine(e) ? 'me' : 'op') : ''}`}>
            <span className="lm-m">{e.minute}'</span><span className="lm-i" aria-hidden="true">{ICON[e.type]}</span><span className="lm-t">{e.text}</span>
          </li>
        ))}
      </ol>
      {done && (
        <div className="ms-end">
          <div className="lm-final">
            <p>Fim de jogo! <b>{home.name} {result.homeGoals} x {result.awayGoals} {away.name}</b>{result.pens && <> · pênaltis {result.pens[0]} x {result.pens[1]}</>}</p>
          </div>
          <table className="ms-stats" aria-label="Estatísticas da partida">
            <thead><tr><th>{home.shortName}</th><th /><th>{away.shortName}</th></tr></thead>
            <tbody>{ROWS.map((r) => <tr key={r.k}><td>{st.home[r.k]}</td><th scope="row">{r.label}</th><td>{st.away[r.k]}</td></tr>)}</tbody>
          </table>
          <button className="primary" onClick={onFinish}>Continuar</button>
        </div>
      )}
    </section>
  );
}
