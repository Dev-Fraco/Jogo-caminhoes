import { useState } from 'react';
import { fixturesOfRound, PROMOTION_SLOTS, RELEGATION_SLOTS, seasonOutcome, userDivision } from '../engine/game';
import type { GameState, MatchResult } from '../engine/types';

interface Props { game: GameState; last: MatchResult[]; onPlay: () => void; onNextSeason: () => void; over: boolean }

export function Matches({ game, last, onPlay, onNextSeason, over }: Props) {
  const name = (id: string) => game.clubs[id].name;
  const [open, setOpen] = useState<string | null>(null);
  const division = userDivision(game);

  if (over) {
    const out = seasonOutcome(game);
    const mine = out.moves.find((m) => m.divisionId === out.userDivisionId)!;
    const nextName = game.divisions.find((d) => d.id === out.nextDivisionId)!.name;
    const msg = out.movement === 'promoted' ? `🔼 Acesso conquistado! Você sobe para a ${nextName}.`
      : out.movement === 'relegated' ? `🔽 Rebaixado. Você cai para a ${nextName}.`
      : out.userPosition === 1 && game.divisions[0].id === division.id ? '🏆 CAMPEÃO BRASILEIRO!' : 'Você permanece na divisão.';
    return (
      <>
        <div className="card center">
          <h2>Temporada {game.season} encerrada</h2>
          <p>Você terminou em <b>{out.userPosition}º</b> lugar na {division.name}.</p>
          <p className={`outcome ${out.movement}`}>{msg}</p>
          <button className="primary" onClick={onNextSeason}>Próxima temporada</button>
        </div>
        <section>
          <h3>Campeões</h3>
          <ul className="list">
            {out.moves.map((m, i) => (
              <li key={m.divisionId}><div className="row"><span className="grow">{game.divisions[i].name}</span><b>🏆 {name(m.table[0].clubId)}</b></div></li>
            ))}
          </ul>
        </section>
        <section>
          <h3>Acesso e rebaixamento na {division.name}</h3>
          <div className="card moves">
            {mine.promoted.length > 0 && <p><b>Sobem ({PROMOTION_SLOTS}):</b> {mine.promoted.map(name).join(', ')}</p>}
            {mine.relegated.length > 0 && <p><b>Descem ({RELEGATION_SLOTS}):</b> {mine.relegated.map(name).join(', ')}</p>}
          </div>
        </section>
      </>
    );
  }

  const next = fixturesOfRound(game, game.round, division.id).find((f) => f.homeId === game.userClubId || f.awayId === game.userClubId);
  const shown = last.filter((r) => r.divisionId === division.id);

  return (
    <>
      <div className="card center">
        <small>{division.name} · Rodada {game.round} de {game.totalRounds}</small>
        {next && <h2>{name(next.homeId)} <span className="vs">x</span> {name(next.awayId)}</h2>}
        <button className="primary" onClick={() => { setOpen(null); onPlay(); }}>▶ Jogar rodada</button>
      </div>
      {shown.length > 0 && (
        <section>
          <h3>Resultados da rodada {shown[0].round}</h3>
          <ul className="list">
            {shown.map((m) => {
              const key = `${m.round}-${m.homeId}`;
              const mine = m.homeId === game.userClubId || m.awayId === game.userClubId;
              return (
                <li key={key}>
                  <button className={`row ${mine ? 'mine' : ''}`} onClick={() => mine && setOpen(open === key ? null : key)}>
                    <span className="grow right">{name(m.homeId)}</span>
                    <b className="score">{m.homeGoals} - {m.awayGoals}</b>
                    <span className="grow">{name(m.awayId)}</span>
                  </button>
                  {open === key && (
                    <ul className="events">
                      {m.events.map((e, i) => <li key={i} className={e.type}><b>{e.minute}'</b> {e.text}</li>)}
                      {m.events.length === 0 && <li>Sem lances relevantes.</li>}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </>
  );
}
