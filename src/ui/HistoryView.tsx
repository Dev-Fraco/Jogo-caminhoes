import { useState } from 'react';
import { isSeasonOver, seasonSummary } from '../engine/game';
import { anyClubName } from '../engine/market';
import type { GameState, SeasonSummary } from '../engine/types';

/** Campeões de todas as divisões e copas, ano a ano, com a classificação final de cada divisão. */
export function HistoryView({ game }: { game: GameState }) {
  // a temporada que acabou de terminar (ainda não virou) aparece primeiro
  const preview = isSeasonOver(game) && !game.history.some((h) => h.season === game.season) ? [seasonSummary(game)] : [];
  const list = [...game.history, ...preview].reverse();
  const [open, setOpen] = useState<number | null>(list[0]?.season ?? null);
  const [div, setDiv] = useState(0);
  const name = (id: string) => anyClubName(game, id);
  if (list.length === 0) return <div className="card center"><p className="hint">Nenhuma temporada encerrada ainda. Os campeões aparecem aqui quando cada temporada terminar.</p></div>;

  const cups = (h: SeasonSummary) => [
    h.cupChampionId && ['🏆', game.cup?.name ?? 'Copa do Brasil', h.cupChampionId],
    h.libChampionId && ['🌎', 'Libertadores', h.libChampionId],
    h.sulaChampionId && ['🌴', 'Sul-Americana', h.sulaChampionId],
    h.uclChampionId && ['⭐', 'Champions League', h.uclChampionId],
    h.mundialChampionId && ['🌍', 'Mundial de Clubes', h.mundialChampionId],
  ].filter(Boolean) as [string, string, string][];

  return (
    <div className="hv">
      {list.map((h) => {
        const isOpen = open === h.season;
        const table = h.tables?.[div];
        return (
          <section key={h.season} className="hv-year">
            <button className="hv-head" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : h.season)}>
              <b>Temporada {h.season}</b><span>{isOpen ? '▲' : '▼'}</span>
            </button>
            <ul className="hv-champs">
              {h.divisions.map((d, i) => <li key={d.id}><span>{game.divisions[i]?.name ?? d.id}</span><b>🏆 {name(d.championId)}</b></li>)}
              {cups(h).map(([icon, n, id]) => <li key={n} className="cup"><span>{icon} {n}</span><b>{name(id)}</b></li>)}
            </ul>
            {isOpen && h.estadualChampions && (
              <details className="hv-est">
                <summary>🏟️ Campeões dos estaduais ({h.estadualChampions.length})</summary>
                <ul className="hv-champs">
                  {h.estadualChampions.map((c) => <li key={c.uf}><span>{c.name.replace('Campeonato ', '')}</span><b>{c.divisions.map((d) => `${d.championId ? name(d.championId) : ''}${c.divisions.length > 1 ? ` (${d.name.replace('Série ', '')})` : ''}`).join(' · ')}</b></li>)}
                </ul>
              </details>
            )}
            {isOpen && h.tables && (
              <div className="hv-table">
                <div className="chips" role="tablist" aria-label="Divisão">
                  {h.tables.map((t, i) => <button key={t.id} role="tab" aria-selected={i === div} className={i === div ? 'on' : ''} onClick={() => setDiv(i)}>{game.divisions[i]?.name ?? t.id}</button>)}
                </div>
                {table && (
                  <table className="tb">
                    <thead><tr><th>#</th><th className="l">Clube</th><th>PTS</th><th>J</th><th>SG</th></tr></thead>
                    <tbody>
                      {table.rows.map(([id, pts, played, gd], i) => (
                        <tr key={id} className={id === game.userClubId && !game.observer ? 'mine' : ''}>
                          <td><span className="pos">{i + 1}</span></td>
                          <td className="l"><div className="team"><span className="dot" style={{ background: game.clubs[id]?.primaryColor ?? '#888', color: game.clubs[id]?.primaryColor ?? '#888' }} /><span className="cname">{name(id)}</span></div></td>
                          <td><span className="pts">{pts}</span></td><td className="sub">{played}</td><td className="sub">{gd > 0 ? `+${gd}` : gd}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

/** Títulos que o treinador já ganhou, por competição. */
export function TrophyRoom({ game }: { game: GameState }) {
  const titles = game.titles ?? [];
  const by = new Map<string, typeof titles>();
  for (const t of titles) by.set(t.competition, [...(by.get(t.competition) ?? []), t]);
  const jobs = game.jobs ?? [];
  return (
    <div className="hv">
      <div className="card center"><small>Títulos do treinador</small><h2>{titles.length}</h2><p className="hint">{game.coach.name}</p></div>
      {titles.length === 0 && <div className="card center"><p className="hint">Você ainda não ganhou nenhum título. Seja campeão de uma divisão, da copa ou de uma competição continental.</p></div>}
      {[...by.entries()].map(([comp, ts]) => (
        <section key={comp}>
          <h3>{comp} <em className="hv-n">{ts.length}x</em></h3>
          <ul className="list">
            {ts.slice().reverse().map((t, i) => <li key={i}><div className="row"><span className="grow">🏆 {t.clubName}</span><b>{t.season}</b></div></li>)}
          </ul>
        </section>
      ))}
      {jobs.length > 0 && (
        <section>
          <h3>Clubes pelos quais passou</h3>
          <ul className="list">
            {jobs.map((j, i) => <li key={i}><div className="row"><span className="grow">{anyClubName(game, j.clubId)}<small>{j.fromSeason}{j.toSeason ? ` – ${j.toSeason}` : ' – atual'}{j.ended ? ` · ${j.ended}` : ''}</small></span></div></li>)}
          </ul>
        </section>
      )}
    </div>
  );
}
