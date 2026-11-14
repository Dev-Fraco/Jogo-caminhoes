import { useState } from 'react';
import { fixturesOfRound } from '../engine/game';
import { computeTable } from '../engine/table';
import type { GameState, MatchResult } from '../engine/types';

interface Props { game: GameState; last: MatchResult[]; onPlay: () => void; onNewSeason: () => void; over: boolean }

export function Matches({ game, last, onPlay, onNewSeason, over }: Props) {
  const name = (id: string) => game.clubs.find((c) => c.id === id)!.name;
  const [open, setOpen] = useState<string | null>(null);

  if (over) {
    const table = computeTable(game.clubs, game.results);
    const pos = table.findIndex((r) => r.clubId === game.userClubId) + 1;
    return (
      <div className="card center">
        <h2>🏆 Temporada {game.season} encerrada</h2>
        <p>Campeão: <b>{name(table[0].clubId)}</b></p>
        <p>Seu clube terminou em <b>{pos}º</b> lugar{pos === 1 ? ' — CAMPEÃO!' : pos > table.length - 4 ? ' — na zona de rebaixamento.' : '.'}</p>
        <button className="primary" onClick={onNewSeason}>Começar nova temporada</button>
      </div>
    );
  }

  const next = fixturesOfRound(game, game.round).find((f) => f.homeId === game.userClubId || f.awayId === game.userClubId);
  const shown = last.length ? last : [];

  return (
    <>
      <div className="card center">
        <small>Rodada {game.round} de {game.totalRounds}</small>
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
                  <button className={`row ${mine ? 'mine' : ''}`} onClick={() => setOpen(open === key ? null : key)}>
                    <span className="grow right">{name(m.homeId)}</span>
                    <b className="score">{m.homeGoals} - {m.awayGoals}</b>
                    <span className="grow">{name(m.awayId)}</span>
                  </button>
                  {open === key && (
                    <ul className="events">
                      {m.events.filter((e) => e.type !== 'chance' || mine).map((e, i) => (
                        <li key={i} className={e.type}><b>{e.minute}'</b> {e.text}</li>
                      ))}
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
