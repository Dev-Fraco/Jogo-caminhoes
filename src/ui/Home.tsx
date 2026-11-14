import { useState } from 'react';
import { fixturesOfRound, leagueNameOf, seasonOutcome, slotsOf, userDivision } from '../engine/game';
import { userInCup } from '../engine/cup';
import { pendingEvent } from '../engine/events';
import { CONTINENTALS, COMPS, mundialStepName, stepName, userIn } from '../engine/continental';
import { clubOf } from '../engine/lookup';
import { moodLabel } from '../engine/morale';
import type { GameState, MatchResult } from '../engine/types';
import { PROMOTED_STRONG_CHANCE } from '../engine/ai';
import { EXPECTATION_LABEL } from '../newgame/format';

interface Props {
  game: GameState; last: MatchResult[]; over: boolean;
  onPlay: () => void; onNextSeason: () => void; onEditLineup: () => void; onFinance: () => void; onSeeOffers: () => void;
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
export function Home({ game, last, over, onPlay, onNextSeason, onEditLineup, onFinance, onSeeOffers }: Props) {
  const name = (id: string) => clubOf(game, id).name;
  const [open, setOpen] = useState<string | null>(null);
  const division = userDivision(game);

  if (over) {
    const out = seasonOutcome(game);
    const mine = out.moves.find((m) => m.divisionId === out.userDivisionId)!;
    const nextName = game.divisions.find((d) => d.id === out.nextDivisionId)!.name;
    const msg = out.movement === 'promoted' ? `🔼 Acesso conquistado! Você sobe para a ${nextName}.`
      : out.movement === 'relegated' ? `🔽 Rebaixado. Você cai para a ${nextName}.`
      : out.userPosition === 1 && game.divisions[0].id === division.id ? `🏆 CAMPEÃO — ${leagueNameOf(game).toUpperCase()}!` : 'Você permanece na divisão.';
    return (
      <>
        <div className="card center">
          <h2>Temporada {game.season} encerrada</h2>
          <p>Você terminou em <b>{out.userPosition}º</b> lugar na {division.name}.</p>
          <p className={`outcome ${out.movement}`}>{msg}</p>
          {out.movement === 'promoted' && <p className="hint">🎲 Ao virar a temporada, a diretoria sorteia o investimento: {Math.round(PROMOTED_STRONG_CHANCE * 100)}% de chance de investimento forte (boa chance de se manter na divisão) e {100 - Math.round(PROMOTED_STRONG_CHANCE * 100)}% de investimento pequeno (risco de cair de novo).</p>}
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
            {mine.promoted.length > 0 && <p><b>Sobem ({slotsOf(game)}):</b> {mine.promoted.map(name).join(', ')}</p>}
            {mine.relegated.length > 0 && <p><b>Descem ({slotsOf(game)}):</b> {mine.relegated.map(name).join(', ')}</p>}
          </div>
        </section>
      </>
    );
  }

  const ev = pendingEvent(game);
  const next = ev ? ev.match : fixturesOfRound(game, game.round, division.id).find((f) => f.homeId === game.userClubId || f.awayId === game.userClubId);
  const shown = last.filter((r) => r.divisionId === division.id || [game.cup?.id, game.lib?.id, game.ucl?.id, game.mundial?.id].includes(r.divisionId));
  const expectation = game.clubs[game.userClubId].boardExpectation;
  const m = game.morale;

  return (
    <>
      <div className="card center">
        <small>{ev ? ev.label : `${division.name} · Rodada ${Math.min(game.round, game.totalRounds)} de ${game.totalRounds}`}</small>
        {next && <h2>{name(next.homeId)} <span className="vs">x</span> {name(next.awayId)}</h2>}
        <button className="primary" onClick={() => { setOpen(null); onPlay(); }}>▶ Iniciar partida</button>
        {!ev && COMPS.map((k) => { const c = game[k], cfg = CONTINENTALS[k]; if (!c) return null; const mine = c.groups.some((gr) => gr.clubIds.includes(game.userClubId)); return mine || c.championId ? <small key={k} className="cup-line">{c.championId ? `${cfg.icon} ${c.name}: campeão ${name(c.championId)}` : userIn(game, k) ? `${cfg.icon} ${c.name}: ${stepName(k, c)} em breve` : `${cfg.icon} ${c.name}: seu clube foi eliminado`}</small> : null; })}
        {!ev && game.mundial && <small className="cup-line">{game.mundial.championId ? `🌍 ${game.mundial.name}: campeão ${name(game.mundial.championId)}` : `🌍 ${game.mundial.name}: ${mundialStepName(game.mundial)}`}</small>}
        {game.cup && !ev && <small className="cup-line">{game.cup.championId ? `🏆 ${game.cup.name}: campeão ${name(game.cup.championId)}` : userInCup(game) ? `🏆 ${game.cup.name}: você está na ${game.cup.rounds[game.cup.roundIndex].name}` : `🏆 ${game.cup.name}: seu clube já foi eliminado`}</small>}
        <button className="btn home-lineup" onClick={onEditLineup}>Editar escalação</button>
        <button className="btn home-lineup" onClick={onFinance}>💰 Finanças e salários</button>
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

      {game.news.length > 0 && (
        <section>
          <h3>Notícias</h3>
          <div className="card">
            <ul className="news">
              {game.news.slice(0, 5).map((n, i) => <li key={i} className={n.tone}>{n.text}<small>Temporada {n.season} · rodada {n.round}</small></li>)}
            </ul>
          </div>
        </section>
      )}

      {shown.length > 0 && (
        <section>
          <h3>{shown[0].divisionId === division.id ? `Resultados da rodada ${shown[0].round}` : `${[game.cup, game.lib, game.ucl, game.mundial].find((c) => c?.id === shown[0].divisionId)?.name ?? 'Copa'} — resultados`}</h3>
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
