import { useEffect, useRef, useState } from 'react';
import { recordHall } from '../engine/hall';
import { newObserverWorld, simLeagues, simulateOneYear } from '../engine/sim';
import type { GameState } from '../engine/types';
import { HistoryView } from './HistoryView';
import { Screen } from './Screen';

const PRESETS = [1, 3, 5, 10, 20, 30];

/** Simular Anos: sem treinador e sem escolher time. Escolha a liga e quantos anos simular e acompanhe campeões e classificações de cada ano. */
export function SimYears({ onBack, onHall }: { onBack: () => void; onHall: () => void }) {
  const leagues = simLeagues();
  const [league, setLeague] = useState(leagues[0].countryId + '|' + leagues[0].leagueId);
  const [years, setYears] = useState(5);
  const [world, setWorld] = useState<GameState | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const cancel = useRef(false);
  useEffect(() => () => { cancel.current = true; }, []);

  const run = (start: GameState, n: number) => {
    cancel.current = false;
    let g = start;
    let done = 0;
    setProgress({ done: 0, total: n });
    const step = () => {
      if (cancel.current) return;
      g = simulateOneYear(g);
      done++;
      setProgress({ done, total: n });
      if (done < n) { window.setTimeout(step, 20); return; } // um ano por vez, para a tela não travar
      recordHall(g);
      setWorld(g); setProgress(null);
    };
    window.setTimeout(step, 20);
  };

  const start = () => {
    const [c, l] = league.split('|');
    run(newObserverWorld(c, l), years);
  };

  if (progress) {
    return (
      <Screen title="Simular Anos" onBack={() => { cancel.current = true; setProgress(null); }}>
        <div className="card center" role="status">
          <h2>Simulando…</h2>
          <p>Ano {Math.min(progress.done + 1, progress.total)} de {progress.total}</p>
          <div className="mo-bar"><i className="good" style={{ width: `${(progress.done / progress.total) * 100}%` }} /></div>
        </div>
      </Screen>
    );
  }

  if (world) {
    return (
      <Screen title="Simular Anos" onBack={onBack}>
        <div className="card center">
          <small>{world.leagueName}</small>
          <h2>{world.history.length} {world.history.length === 1 ? 'ano simulado' : 'anos simulados'}</h2>
          <p className="hint">Toque em um ano para ver a classificação de cada divisão.</p>
          <div className="un-btns" style={{ flexDirection: 'row', justifyContent: 'center' }}>
            {[1, 5, 10].map((n) => <button key={n} className="btn main" onClick={() => run(world, n)}>+{n} {n === 1 ? 'ano' : 'anos'}</button>)}
          </div>
          <button className="btn home-lineup" onClick={onHall}>🏅 Salão de campeões</button>
          <button className="btn home-lineup" onClick={() => setWorld(null)}>Nova simulação</button>
        </div>
        <HistoryView game={world} />
      </Screen>
    );
  }

  return (
    <Screen title="Simular Anos" onBack={onBack}>
      <div className="card">
        <p style={{ margin: 0 }}>Veja o futebol rolar sozinho: todos os clubes são controlados pela IA, sem treinador. Os campeões de cada ano ficam guardados no <b>Salão de campeões</b>.</p>
      </div>
      <section>
        <h3>Liga</h3>
        <div className="card">
          <select aria-label="Liga" value={league} onChange={(e) => setLeague(e.target.value)} style={{ margin: 0, width: '100%' }}>
            {leagues.map((l) => <option key={l.countryId + l.leagueId} value={l.countryId + '|' + l.leagueId}>{l.label}</option>)}
          </select>
        </div>
      </section>
      <section>
        <h3>Quantos anos simular</h3>
        <div className="card">
          <div className="chips" role="radiogroup" aria-label="Anos">
            {PRESETS.map((n) => <button key={n} role="radio" aria-checked={years === n} className={years === n ? 'on' : ''} onClick={() => setYears(n)}>{n}</button>)}
          </div>
          <label className="ng-lbl" htmlFor="sy-years">Ou escolha entre 1 e 50: <b>{years}</b></label>
          <input id="sy-years" type="range" min={1} max={50} value={years} onChange={(e) => setYears(Number(e.target.value))} style={{ width: '100%' }} />
        </div>
      </section>
      <button className="primary" onClick={start}>▶ Simular {years} {years === 1 ? 'ano' : 'anos'}</button>
      <button className="btn home-lineup" onClick={onHall}>🏅 Salão de campeões</button>
    </Screen>
  );
}
