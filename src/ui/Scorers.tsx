import { useState } from 'react';
import { ClubBadge } from './ClubBadge';
import { clubOf } from '../engine/lookup';
import { competitionName, currentScorers, scorerCompetitions } from '../engine/scorers';
import type { GameState } from '../engine/types';

/** Artilharia: escolha a competição (divisões, estaduais, copa, continentais, Mundial) e a temporada (atual ou anteriores). */
export function ScorersView({ game }: { game: GameState }) {
  const comps = scorerCompetitions(game);
  const mine = game.divisions.find((d) => d.clubIds.includes(game.userClubId))?.id;
  const [comp, setComp] = useState<string>(comps.find((c) => c.id === mine)?.id ?? comps[0]?.id ?? '');
  const seasons = [game.season, ...[...game.history].reverse().map((h) => h.season)];
  const [season, setSeason] = useState<number>(game.season);
  if (!comps.length) return <section className="card"><h3>⚽ Artilharia</h3><p className="hint">Ainda não houve gols nesta temporada. A artilharia aparece depois das primeiras rodadas.</p></section>;
  const rows: [string, string, number][] = season === game.season
    ? currentScorers(game, comp, 20)
    : (game.history.find((h) => h.season === season)?.topScorers?.find((t) => t.divisionId === comp)?.rows ?? []);
  const club = (id: string) => { try { return clubOf(game, id); } catch { return undefined; } };
  return (
    <section className="card" aria-label="Artilharia">
      <h3>⚽ Artilharia · {competitionName(game, comp)}</h3>
      <div className="row" style={{ gap: 8, margin: '8px 0' }}>
        <select aria-label="Competição" className="grow" value={comp} onChange={(e) => setComp(e.target.value)}>
          {comps.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select aria-label="Temporada" value={season} onChange={(e) => setSeason(Number(e.target.value))}>
          {seasons.map((s) => <option key={s} value={s}>{s === game.season ? `${s} (atual)` : s}</option>)}
        </select>
      </div>
      {rows.length === 0 ? <p className="hint">Sem gols registrados nesta competição nesta temporada.</p> : (
        <ol className="list" style={{ listStyle: 'none', padding: 0 }}>
          {rows.map(([name, clubId, goals], i) => {
            const c = club(clubId);
            return (
              <li key={`${name}-${clubId}`}><div className="row">
                <b style={{ width: 28 }}>{i + 1}º</b>
                {c && <ClubBadge club={c} size={26} />}
                <span className="grow">{name}<small>{c?.name ?? clubId}{clubId === game.userClubId ? ' · seu clube' : ''}</small></span>
                <b>{goals} {goals === 1 ? 'gol' : 'gols'}</b>
              </div></li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
