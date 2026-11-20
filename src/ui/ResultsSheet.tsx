import { useEffect, useRef } from 'react';
import { estadualOfUser, ESTADUAL_ID, stepLabel } from '../engine/estadual';
import { clubOf } from '../engine/lookup';
import type { GameState, MatchResult } from '../engine/types';

interface Row { home: string; away: string; hg: number; ag: number; pens?: [number, number]; mine: boolean }
interface Group { key: string; title: string; rows: Row[]; main: boolean }

/** Resultados de todos os jogos que aconteceram junto com o seu: campeonato (todas as divisões), estadual, copa e torneios. */
function groupsOf(game: GameState, results: MatchResult[]): Group[] {
  const me = game.userClubId;
  const name = (id: string) => clubOf(game, id).name;
  const rowOf = (r: MatchResult): Row => ({ home: name(r.homeId), away: name(r.awayId), hg: r.homeGoals, ag: r.awayGoals, pens: r.pens, mine: r.homeId === me || r.awayId === me });
  const ids = [...new Set(results.map((r) => r.divisionId))];
  const out: Group[] = [];
  for (const id of ids) {
    const mine = results.filter((r) => r.divisionId === id).some((r) => r.homeId === me || r.awayId === me);
    const rs = results.filter((r) => r.divisionId === id);
    const round = rs[0].round;
    const div = game.divisions.find((d) => d.id === id);
    if (div) { out.push({ key: id, title: `${div.name} · Rodada ${round}`, rows: rs.map(rowOf), main: mine }); continue; }
    if (id === ESTADUAL_ID && game.estadual) { // todos os jogos da rodada na divisão do seu estadual
      const m = estadualOfUser(game);
      if (m) {
        const rows = m.div.matches.filter((x) => x[0] === round).map((x): Row => ({ home: name(m.div.clubIds[x[1]]), away: name(m.div.clubIds[x[2]]), hg: x[3], ag: x[4], mine: m.div.clubIds[x[1]] === me || m.div.clubIds[x[2]] === me }));
        out.push({ key: id, title: `${m.comp.name}${m.divIndex ? ' (Série B)' : ''} · ${stepLabel(game.estadual, round)}`, rows: rows.length ? rows : rs.map(rowOf), main: mine });
        continue;
      }
    }
    if (game.cup && id === game.cup.id) {
      const rd = game.cup.rounds[round - 1];
      const rows = rd ? rd.ties.filter((t) => t.homeGoals !== undefined).map((t): Row => ({ home: name(t.homeId), away: name(t.awayId), hg: t.homeGoals!, ag: t.awayGoals!, pens: t.pens, mine: t.homeId === me || t.awayId === me })) : [];
      out.push({ key: id, title: `${game.cup.name} · ${rd?.name ?? `Fase ${round}`}`, rows: rows.length ? rows : rs.map(rowOf), main: mine });
      continue;
    }
    const comp = [game.lib, game.sula, game.ucl, game.mundial, game.superMundial].find((c) => c?.id === id);
    out.push({ key: id, title: `${comp?.name ?? 'Competição'} · jogo ${round}`, rows: rs.map(rowOf), main: mine });
  }
  return out.sort((a, b) => Number(b.main) - Number(a.main));
}

export function ResultsSheet({ game, results, onClose }: { game: GameState; results: MatchResult[]; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { box.current?.focus(); }, []);
  const groups = groupsOf(game, results);
  if (!groups.length) return null;
  const list = (g: Group) => (
    <ul className="list">
      {g.rows.map((r, i) => (
        <li key={i} className={r.mine ? 'row mine' : 'row'}>
          <span className="grow right">{r.home}</span>
          <b className="score">{r.hg} - {r.ag}{r.pens ? <small> ({r.pens[0]}-{r.pens[1]})</small> : null}</b>
          <span className="grow">{r.away}</span>
        </li>
      ))}
    </ul>
  );
  return (
    <div className="ps-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ps" ref={box} role="dialog" aria-modal="true" aria-labelledby="rs-title" tabIndex={-1} onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}>
        <h2 id="rs-title" style={{ marginTop: 0 }}>📋 Resultados de todos os jogos</h2>
        {groups.map((g, i) => (
          i === 0
            ? <section key={g.key}><h3>{g.title}</h3>{list(g)}</section>
            : <details key={g.key}><summary><b>{g.title}</b> <small>({g.rows.length} jogos)</small></summary>{list(g)}</details>
        ))}
        <button className="primary" onClick={onClose} style={{ marginTop: 12 }}>Continuar</button>
      </div>
    </div>
  );
}
