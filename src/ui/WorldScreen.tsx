import { useEffect, useMemo, useState } from 'react';
import { COUNTRY_ORDER } from '../data/world';
import { clubInfoOf } from '../engine/market';
import { ensureWorld, REGION, worldDivisions, worldRound, worldTable, worldTick, worldTotalRounds, type WorldDiv } from '../engine/wleagues';
import { userDivision } from '../engine/game';
import type { ClubInfo, GameState } from '../engine/types';
import { ClubBadge } from './ClubBadge';
import { Screen } from './Screen';

type Filter = 'todas' | 'america' | 'europa';
const FILTERS: { id: Filter; label: string }[] = [{ id: 'todas', label: '🌍 Todas' }, { id: 'america', label: '🌎 América' }, { id: 'europa', label: '🌍 Europa' }];

function Game({ game, h, a, hg, ag }: { game: GameState; h: string; a: string; hg: number; ag: number }) {
  const hc = clubInfoOf(game, h), ac = clubInfoOf(game, a);
  if (!hc || !ac) return null;
  return (
    <li className="res-row wd-game">
      <span className="res-team r"><span className="res-name">{hc.name}</span><ClubBadge club={hc} size={26} /></span>
      <b className="score">{hg} - {ag}</b>
      <span className="res-team"><ClubBadge club={ac} size={26} /><span className="res-name">{ac.name}</span></span>
    </li>
  );
}

function LeagueCard({ game, d, open, onToggle }: { game: GameState; d: WorldDiv; open: boolean; onToggle: () => void }) {
  const w = game.world!, played = w.played[d.id] ?? 0, total = worldTotalRounds(game, d.id);
  const [round, setRound] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const rows = useMemo(() => (played ? worldTable(game, d.id) : []), [game.world, d.id, played]); // eslint-disable-line react-hooks/exhaustive-deps
  const leader = rows[0] ? clubInfoOf(game, rows[0].clubId) : undefined;
  const shown = Math.min(Math.max(1, round ?? played), Math.max(1, played));
  const last = w.champs.filter((c) => c.div === d.id).slice(-1)[0];
  return (
    <section className="card wd-card">
      <button className="wd-head" onClick={onToggle} aria-expanded={open}>
        <span className="wd-flag" aria-hidden="true">{d.flag}</span>
        <span className="grow"><b>{d.countryName} · {d.name}</b><small>{played ? `Rodada ${played}/${total}` : 'Ainda sem jogos'}{leader ? ` · líder: ${leader.name}` : ''}</small></span>
        <span aria-hidden="true">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="wd-body">
          {played === 0 ? <p className="hint">A liga começa junto com o seu campeonato.</p> : (
            <>
              <div className="wd-nav" role="group" aria-label="Rodada">
                <button className="btn" disabled={shown <= 1} onClick={() => setRound(shown - 1)} aria-label="Rodada anterior">‹</button>
                <b>Rodada {shown}</b>
                <button className="btn" disabled={shown >= played} onClick={() => setRound(shown + 1)} aria-label="Próxima rodada">›</button>
                <button className={`btn ${table ? 'on' : ''}`} aria-pressed={table} onClick={() => setTable(!table)}>📊 Tabela</button>
              </div>
              {!table ? (
                <ul className="list wd-list">{worldRound(game, d.id, shown).map((m, i) => <Game key={i} game={game} h={m.homeId} a={m.awayId} hg={m.homeGoals} ag={m.awayGoals} />)}</ul>
              ) : (
                <table className="fm-mini wd-table">
                  <thead><tr><th>Pos</th><th className="l">Clube</th><th>Pts</th><th>J</th><th>V</th><th>E</th><th>D</th><th>SG</th></tr></thead>
                  <tbody>
                    {rows.map((r, i) => { const c = clubInfoOf(game, r.clubId) as ClubInfo; return <tr key={r.clubId}><td>{i + 1}</td><td className="l"><span><ClubBadge club={c} size={22} />{c.name}</span></td><td><b>{r.points}</b></td><td>{r.played}</td><td>{r.won}</td><td>{r.drawn}</td><td>{r.lost}</td><td>{r.gd > 0 ? `+${r.gd}` : r.gd}</td></tr>; })}
                  </tbody>
                </table>
              )}
              {last && <small className="hint">Campeão {last.season}: {clubInfoOf(game, last.club)?.name}</small>}
            </>
          )}
        </div>
      )}
    </section>
  );
}

/** Mundo: resultados e tabelas de todas as ligas do jogo (América e Europa) junto com o seu campeonato. */
export function WorldScreen({ game, onChange, onBack }: { game: GameState; onChange: (g: GameState) => void; onBack: () => void }) {
  const [filter, setFilter] = useState<Filter>('todas');
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => { if (!game.world && !game.observer) onChange(worldTick(ensureWorld(game))); }, [game.world]); // eslint-disable-line react-hooks/exhaustive-deps
  const division = userDivision(game);
  const mine = game.results.filter((r) => r.divisionId === division.id && r.round === game.round - 1);
  const divs = game.world ? worldDivisions(game).filter((d) => filter === 'todas' || REGION[d.countryId] === filter) : [];
  const order = (d: WorldDiv) => COUNTRY_ORDER.indexOf(d.countryId as never) * 10 + d.tier;
  return (
    <Screen title="Mundo" onBack={onBack}>
      <div className="chips" role="tablist" aria-label="Região">
        {FILTERS.map((f) => <button key={f.id} role="tab" aria-selected={filter === f.id} className={filter === f.id ? 'on' : ''} onClick={() => setFilter(f.id)}>{f.label}</button>)}
      </div>
      {(filter === 'todas' || filter === 'america' || filter === 'europa') && (
        <section className="card wd-card">
          <div className="wd-head static"><span className="wd-flag" aria-hidden="true">⭐</span><span className="grow"><b>Seu campeonato · {division.name}</b><small>{mine.length ? `Resultados da rodada ${game.round - 1}` : 'Os resultados aparecem depois da primeira rodada'}</small></span></div>
          {mine.length > 0 && <ul className="list wd-list">{mine.map((m, i) => <Game key={i} game={game} h={m.homeId} a={m.awayId} hg={m.homeGoals} ag={m.awayGoals} />)}</ul>}
        </section>
      )}
      {!game.world && <p className="hint">Montando as ligas do mundo…</p>}
      {[...divs].sort((a, b) => order(a) - order(b)).map((d) => <LeagueCard key={d.id} game={game} d={d} open={open === d.id} onToggle={() => setOpen(open === d.id ? null : d.id)} />)}
    </Screen>
  );
}
