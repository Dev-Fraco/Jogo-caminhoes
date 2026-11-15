import { useState } from 'react';
import { applicationOdds, applyForJob, coachLevel, declineOffer, offerClub } from '../engine/jobs';
import { acceptAnyOffer } from '../engine/abroad';
import type { GameState } from '../engine/types';
import { EXPECTATION_LABEL } from '../newgame/format';
import { ClubBadge } from './ClubBadge';
import { calOf, daysToMatch, formatDayLong, formatDayShort, isMatchDay, nextMatchDay } from '../engine/calendar';

interface Props { game: GameState; over: boolean; onChange: (g: GameState) => void; onPlay: () => void; onAdvance: () => void; onAdvanceToMatch: () => void; onSkip: (years: number) => void; onNextSeason: () => void; onSeeTables: () => void }

const ODDS_CLASS = { Alta: 'good', Média: 'mid', Baixa: 'bad', 'Muito baixa': 'bad' } as const;
const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n);

/** Sem clube: propostas de emprego, candidaturas e o tempo passando (rodadas e temporadas) até ser contratado. */
export function Unemployed({ game, over, onChange, onPlay, onAdvance, onAdvanceToMatch, onSkip, onNextSeason, onSeeTables }: Props) {
  const [div, setDiv] = useState(0);
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);
  const info = game.firedInfo;
  const former = info ? game.clubs[info.clubId]?.name : undefined;
  const offers = game.jobOffers ?? [];
  const divName = (id: string) => game.divisions.find((d) => d.clubIds.includes(id))?.name ?? '';
  const clubs = [...game.divisions[div].clubIds].sort((a, b) => game.clubs[b].reputation - game.clubs[a].reputation);

  const accept = (clubId: string) => {
    const r = acceptAnyOffer(game, clubId);
    if (r.ok) onChange(r.state); else setNotice({ text: r.error, ok: false });
  };
  const apply = (clubId: string) => {
    const r = applyForJob(game, clubId);
    if (!r.ok) { setNotice({ text: r.error, ok: false }); return; }
    onChange(r.state); setNotice({ text: r.text, ok: r.accepted });
  };

  return (
    <>
      <div className="card center un-top">
        <small>{info?.resigned ? 'Você pediu demissão' : 'Você foi demitido'}</small>
        <h2>Sem clube</h2>
        {former && <p>{info?.resigned ? `Você deixou o ${former}.` : `O ${former} dispensou o seu trabalho.`}</p>}
        {info && !info.resigned && <p className="hint">“{info.reason}”</p>}
        <p className="un-lvl">Nível de treinador <b>{coachLevel(game)}</b>/6 · pontos de carreira <b>{game.coachPoints ?? 0}</b></p>
        {!over ? (
          <>
            <small>📅 {formatDayLong(calOf(game).day)}</small>
            {isMatchDay(game) ? <button className="primary" onClick={onPlay}>▶ Simular a rodada</button> : (
              <>
                <p className="cal-next">Próxima rodada: <b>{formatDayShort(nextMatchDay(game))}</b> · {daysToMatch(game) === 1 ? 'amanhã' : `em ${daysToMatch(game)} dias`}</p>
                <button className="primary" onClick={onAdvance}>⏭ Avançar 1 dia</button>
                <button className="btn home-lineup" onClick={onAdvanceToMatch}>⏩ Ir até o dia da rodada</button>
              </>
            )}
            <button className="btn home-lineup" onClick={() => onSkip(1)}>⏭ Pular temporada</button>
          </>
        ) : (
          <>
            <p className="outcome">Temporada {game.season} encerrada.</p>
            <button className="primary" onClick={onNextSeason}>Próxima temporada</button>
            <button className="btn home-lineup" onClick={onSeeTables}>📊 Ver tabelas e resultados</button>
          </>
        )}
      </div>

      {notice && <p className={`tf-notice ${notice.ok ? '' : 'err'}`} role="status">{notice.text}</p>}

      <section>
        <h3>Propostas de emprego ({offers.length})</h3>
        {offers.length === 0 && <p className="hint">Nenhuma proposta por enquanto. Os clubes procuram treinadores a cada rodada, e novas propostas chegam na virada de temporada. Você também pode se candidatar abaixo.</p>}
        <ul className="un-list">
          {offers.map((o) => {
            const c = offerClub(game, o);
            return (
              <li key={o.clubId} className="un-offer">
                <ClubBadge club={c} size={44} />
                <div className="grow"><b>{c.name}</b><small>{o.foreign ? `🌍 ${o.foreign.countryName} · ${o.foreign.leagueName} · ${o.foreign.divisionName}` : divName(o.clubId)} · {stars(c.reputation)} · meta: {EXPECTATION_LABEL[c.boardExpectation]}</small></div>
                <div className="un-btns"><button className="btn main" onClick={() => accept(o.clubId)}>Aceitar</button><button className="btn" onClick={() => onChange(declineOffer(game, o.clubId))}>Recusar</button></div>
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <h3>Candidatar-se a um clube</h3>
        <p className="hint">Uma candidatura por rodada. Clubes maiores que o seu nível quase nunca aceitam.</p>
        <div className="chips" role="tablist" aria-label="Divisão">
          {game.divisions.map((d, i) => <button key={d.id} role="tab" aria-selected={i === div} className={i === div ? 'on' : ''} onClick={() => setDiv(i)}>{d.name}</button>)}
        </div>
        <ul className="un-list">
          {clubs.map((id) => {
            const c = game.clubs[id];
            const odds = applicationOdds(game, id);
            const blocked = info?.clubId === id && game.season - info.season <= 1;
            return (
              <li key={id}>
                <ClubBadge club={c} size={36} />
                <div className="grow"><b>{c.name}</b><small>{stars(c.reputation)} · meta: {EXPECTATION_LABEL[c.boardExpectation]}</small></div>
                <span className={`un-odds ${ODDS_CLASS[odds.label]}`}>{blocked ? 'Recusou' : `${odds.label} ${odds.pct}%`}</span>
                <button className="btn" disabled={blocked} onClick={() => apply(id)}>Candidatar</button>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
