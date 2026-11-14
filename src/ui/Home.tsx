import { useState } from 'react';
import { fixturesOfRound, PROMOTION_SLOTS, RELEGATION_SLOTS, seasonOutcome, userDivision } from '../engine/game';
import { moodLabel } from '../engine/morale';
import type { GameState, MatchResult } from '../engine/types';
import { EXPECTATION_LABEL } from '../newgame/format';

interface Props {
  game: GameState; last: MatchResult[]; over: boolean;
  onPlay: () => void; onNextSeason: () => void; onEditLineup: () => void; onSeeOffers: () => void;
}

function Meter({ label, value, note }: { label: string; value: number; note?: string }) {
  const tone = value >= 60 ? 'good' : value >= 40 ? 'mid' : 'bad';
  return (
    <div className="mo">
      <div className="mo-head"><span>{label}</span><b>{moodLabel(value)} <em>{value}</em></b></div>
      <div className="mo-bar" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value} aria-valuetext={`${moodLabel(value)}, ${value} de 100`}>
        <i className={tone} style={{ width: `${value}%` }} />
      </div>
      {note && <small>{note}</small>}
    </div>
  );
}

/** Início: próxima partida, escalação, humor (equipe, dirigentes e torcida), propostas e resultados da rodada. */
export function Home({ game, last, over, onPlay, onNextSeason, onEditLineup, onSeeOffers }: Props) {
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
  const expectation = game.clubs[game.userClubId].boardExpectation;
  const m = game.morale;

  return (
    <>
      <div className="card center">
        <small>{division.name} · Rodada {game.round} de {game.totalRounds}</small>
        {next && <h2>{name(next.homeId)} <span className="vs">x</span> {name(next.awayId)}</h2>}
        <button className="primary" onClick={() => { setOpen(null); onPlay(); }}>▶ Iniciar partida</button>
        <button className="btn home-lineup" onClick={onEditLineup}>Editar escalação</button>
      </div>

      {game.offers.length > 0 && (
        <button className="home-offers" onClick={onSeeOffers}>
          📨 Você tem <b>{game.offers.length}</b> {game.offers.length === 1 ? 'proposta' : 'propostas'} por jogadores <span>Ver propostas ›</span>
        </button>
      )}

      <section>
        <h3>Moral</h3>
        <div className="card mo-card">
          <Meter label="Equipe" value={m.team} note="Influencia o desempenho do time em campo." />
          <Meter label="Dirigentes" value={m.board} note={`Meta da diretoria: ${EXPECTATION_LABEL[expectation]}.`} />
          <Meter label="Torcida" value={m.fans} note="Reage aos resultados, principalmente em casa." />
        </div>
      </section>

      {shown.length > 0 && (
        <section>
          <h3>Resultados da rodada {shown[0].round}</h3>
          <ul className="list">
            {shown.map((r) => {
              const key = `${r.round}-${r.homeId}`;
              const mine = r.homeId === game.userClubId || r.awayId === game.userClubId;
              return (
                <li key={key}>
                  <button className={`row ${mine ? 'mine' : ''}`} onClick={() => mine && setOpen(open === key ? null : key)}>
                    <span className="grow right">{name(r.homeId)}</span>
                    <b className="score">{r.homeGoals} - {r.awayGoals}</b>
                    <span className="grow">{name(r.awayId)}</span>
                  </button>
                  {open === key && (
                    <ul className="events">
                      {r.events.map((e, i) => <li key={i} className={e.type}><b>{e.minute}'</b> {e.text}</li>)}
                      {r.events.length === 0 && <li>Sem lances relevantes.</li>}
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
