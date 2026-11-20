import { Newspaper } from './Newspaper';
import { SalaryCard } from './SalaryCard';
import { useState } from 'react';
import { fixturesOfRound, leagueNameOf, seasonOutcome, slotsOf, userDivision } from '../engine/game';
import { estadualOfUser, estadualRanking, estadualSummary, stepLabel } from '../engine/estadual';
import { userInCup } from '../engine/cup';
import { pendingEvent } from '../engine/events';
import { CONTINENTALS, COMPS, mundialStepName, stepName, userIn } from '../engine/continental';
import { hooks } from '../engine/hooks';
import { clubOf } from '../engine/lookup';
import type { GameState, MatchResult } from '../engine/types';
import { PROMOTED_STRONG_CHANCE } from '../engine/ai';
import { firingWarning } from '../engine/game';
import { ClubBadge } from './ClubBadge';
import { nextUserMatchDay, userPlaysNextSlot } from '../engine/advance';
import { calOf, daysToMatch, formatDayLong, formatDayShort, isMatchDay, matchTimeOf, nextMatchDay } from '../engine/calendar';
import { ScreenTitle } from './FmParts';
import { divisionTable } from '../engine/game';
import { isGroups, userGroupRows } from '../engine/groups';

interface Props {
  game: GameState; onChange: (g: GameState) => void; last: MatchResult[]; over: boolean;
  onPlay: () => void; onSeeTables: () => void; onSeeResults: () => void; onNextSeason: () => void; onEditLineup: () => void; onAdvance: () => void; onAdvanceToMatch: () => void; onTab: (t: 'squad' | 'table' | 'transfers' | 'profile') => void; onNews: () => void; onSeeHist: () => void; onSeeOffers: () => void;
}

/** Resultado do estadual (para quem joga fora da pirâmide). */
function EstadualResult({ game }: { game: GameState }) {
  const mine = estadualOfUser(game);
  if (!mine) return <p>Temporada encerrada.</p>;
  const pos = estadualRanking(game, mine.div).indexOf(game.userClubId) + 1;
  return <p>No <b>{mine.comp.name}</b>{mine.divIndex ? ' (Série B)' : ''} você terminou em <b>{pos}º</b> lugar.</p>;
}

/** Aviso de fim de estadual: campeão, sua posição e (para clubes fora da pirâmide) se a vaga na Série D veio. */
function EstadualNotice({ game, onChange }: { game: GameState; onChange: (g: GameState) => void }) {
  const s = game.estadual && !game.estadual.ack ? estadualSummary(game) : undefined;
  if (!s || !game.estadual) return null;
  const champ = clubOf(game, s.championId).name;
  return (
    <div className="card center" role="alert">
      <h2>🏁 {s.compName} encerrado!</h2>
      <p>🏆 Campeão: <b>{champ}</b>{s.runnerUpId && s.playoff ? <> · Vice: <b>{clubOf(game, s.runnerUpId).name}</b></> : null}</p>
      <p>{s.pos === 1 ? <b>Você é o campeão! 🎉</b> : <>Você terminou em <b>{s.pos}º</b> de {s.size} clubes{s.divName !== 'Série A' ? ` (${s.divName})` : ''}.</>}</p>
      {s.outside && (s.serieD
        ? <p className="outcome promoted">✅ Classificado para a Série D! Você sobe na virada da temporada.</p>
        : <p className="outcome relegated">❌ Não classificado para a Série D. {s.divName === 'Série A' ? 'Só sobem os 2 primeiros do estado (e o melhor clube fora das Séries A–D).' : 'A vaga é só para a Série A do estadual: suba de divisão e tente de novo.'}</p>)}
      <button className="primary" onClick={() => onChange({ ...game, estadual: { ...game.estadual!, ack: true } })}>Entendi</button>
    </div>
  );
}

/** Início: próxima partida, escalação, humor (equipe, dirigentes e torcida), propostas e resultados da rodada. */
export function Home({ game, onChange, last, over, onPlay, onSeeTables, onSeeResults, onNextSeason, onEditLineup, onAdvance, onAdvanceToMatch }: Props) {
  const name = (id: string) => clubOf(game, id).name;
  const [open, setOpen] = useState<string | null>(null);
  const division = userDivision(game);

  if (over) {
    const out = seasonOutcome(game);
    const mine = out.moves.find((m) => m.divisionId === out.userDivisionId)!;
    const nextName = game.divisions.find((d) => d.id === out.nextDivisionId)?.name ?? 'Estadual';
    const msg = out.movement === 'promoted' ? `🔼 Acesso conquistado! Você sobe para a ${nextName}.`
      : out.movement === 'relegated' ? `🔽 Rebaixado. Você cai para a ${nextName}.`
      : out.userPosition === 1 && game.divisions[0].id === division.id ? `🏆 CAMPEÃO — ${leagueNameOf(game).toUpperCase()}!` : 'Você permanece na divisão.';
    return (
      <>
        <EstadualNotice game={game} onChange={onChange} />
        <div className="card center">
          <h2>Temporada {game.season} encerrada</h2>
          {division.format === 'outside' ? <EstadualResult game={game} /> : <p>Você terminou em <b>{out.userPosition}º</b> lugar na {division.name}.</p>}
          <p className={`outcome ${out.movement}`}>{msg}</p>
          {firingWarning(game) && <p className="un-warn" role="alert">⚠️ {firingWarning(game)} Ao virar a temporada você será demitido.</p>}
          {out.movement === 'promoted' && <p className="hint">🎲 Ao virar a temporada, a diretoria sorteia o investimento: {Math.round(PROMOTED_STRONG_CHANCE * 100)}% de chance de investimento forte (boa chance de se manter na divisão) e {100 - Math.round(PROMOTED_STRONG_CHANCE * 100)}% de investimento pequeno (risco de cair de novo).</p>}
          <div className="over-actions">
            <button className="btn" onClick={onSeeTables}>📊 Ver tabelas de todas as divisões</button>
            <button className="btn" onClick={onSeeResults}>📋 Ver todos os resultados</button>
          </div>
          <button className="primary" onClick={onNextSeason}>Próxima temporada</button>
        </div>
        <SalaryCard key={game.season} game={game} onChange={onChange} />
        {[game.cup, game.lib, game.sula, game.ucl, game.mundial, game.superMundial, game.regionais?.nordeste, game.regionais?.verde].some((c) => c?.championId) && (
          <section>
            <h3>Campeões das copas</h3>
            <ul className="list">
              {[['🏆', game.cup], ['🌎', game.lib], ['🌴', game.sula], ['⭐', game.ucl], ['🌍', game.mundial], ['🌐', game.superMundial], ['🌵', game.regionais?.nordeste], ['🌳', game.regionais?.verde]].map(([icon, c]) => { const k = c as { id: string; name: string; championId?: string } | undefined; return k?.championId ? <li key={k.id}><div className="row"><span className="grow">{icon as string} {k.name}</span><b>{name(k.championId)}</b></div></li> : null; })}
            </ul>
          </section>
        )}
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
  const shown = last.filter((r) => r.divisionId === division.id || [game.cup?.id, game.lib?.id, game.sula?.id, game.ucl?.id, game.mundial?.id, game.superMundial?.id, game.regionais?.nordeste?.id, game.regionais?.verde?.id].includes(r.divisionId));
  const tableRows = division.format === 'outside' ? [] : (isGroups(division) ? userGroupRows(game, division) : undefined) ?? divisionTable(game, division.id);
  const myPos = tableRows.findIndex((r) => r.clubId === game.userClubId);
  const miniRows = [0, 1, 2].filter((i) => i < tableRows.length).map((i) => ({ r: tableRows[i], pos: i + 1 })).concat(myPos > 2 ? [{ r: tableRows[myPos], pos: myPos + 1 }] : []);

  const rawLabel = (ev ? ev.label.replace(/^\S+\s/, '') : game.estadual?.due ? `${estadualOfUser(game)?.comp.name ?? 'Estadual'} · ${stepLabel(game.estadual, game.estadual.step)}` : `${division.name} · Rodada ${Math.min(game.round, game.totalRounds)} de ${game.totalRounds}`);
  const cut = rawLabel.lastIndexOf(' · ');
  const compTitle = cut > 0 ? rawLabel.slice(0, cut) : rawLabel, compSub = cut > 0 ? rawLabel.slice(cut + 3) : '';
  const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
  const plays = userPlaysNextSlot(game), mineDay = nextUserMatchDay(game); // a próxima data do calendário é sua? se não, quando é o seu próximo jogo

  return (
    <>
      <EstadualNotice game={game} onChange={onChange} />
      <div className="card mk-card home2-match">
        <div className="home2-comp">
          <span className="home2-trophy" aria-hidden="true">🏆</span>
          <div><b>{compTitle}</b>{compSub && <small>{compSub}</small>}</div>
        </div>
        {next ? (
          <div className="home2-vs">
            <div><ClubBadge club={clubOf(game, next.homeId)} size={78} /><b>{name(next.homeId)}</b></div>
            <span className="vs">X</span>
            <div><ClubBadge club={clubOf(game, next.awayId)} size={78} /><b>{name(next.awayId)}</b></div>
          </div>
        ) : <p className="hint" style={{ textAlign: 'center' }}>Seu clube não joga nesta rodada.</p>}
        <div className="home2-when">
          <span>📅 {cap(formatDayLong(plays || mineDay === undefined ? nextMatchDay(game) : mineDay))}</span>
          <span>🕒 {matchTimeOf(plays || mineDay === undefined ? nextMatchDay(game) : mineDay)}</span>
        </div>
        {!isMatchDay(game) && (plays || mineDay === undefined
          ? <p className="cal-next" style={{ textAlign: 'center' }}>Hoje: <b>{formatDayShort(calOf(game).day)}</b> · {mineDay === undefined ? 'seu clube não tem mais jogos marcados nesta temporada' : `${next || ev ? 'jogo' : 'rodada'} ${daysToMatch(game) === 1 ? 'amanhã' : `em ${daysToMatch(game)} dias`}`}</p>
          : <p className="cal-next" style={{ textAlign: 'center' }}>Hoje: <b>{formatDayShort(calOf(game).day)}</b> · seu próximo jogo: <b>{formatDayShort(mineDay)}</b> ({mineDay - calOf(game).day === 1 ? 'amanhã' : `em ${mineDay - calOf(game).day} dias`}); até lá só jogam outros clubes</p>)}
        {isMatchDay(game) && !plays && <p className="cal-next" style={{ textAlign: 'center' }}>{mineDay === undefined ? 'Nesta data só jogam outros clubes e o seu não tem mais jogos marcados nesta temporada.' : `Nesta data só jogam outros clubes. Seu próximo jogo: ${formatDayShort(mineDay)}.`}</p>}
        {!ev && COMPS.map((k) => { const c = game[k], cfg = CONTINENTALS[k]; if (!c) return null; const mine = c.groups.some((gr) => gr.clubIds.includes(game.userClubId)); return mine || c.championId ? <small key={k} className="cup-line">{c.championId ? `${cfg.icon} ${c.name}: campeão ${name(c.championId)}` : userIn(game, k) ? `${cfg.icon} ${c.name}: ${stepName(k, c)} em breve` : `${cfg.icon} ${c.name}: seu clube foi eliminado`}</small> : null; })}
        {!ev && game.mundial && <small className="cup-line">{game.mundial.championId ? `🌍 ${game.mundial.name}: campeão ${name(game.mundial.championId)}` : `🌍 ${game.mundial.name}: ${mundialStepName(game.mundial)}`}</small>}
        {!ev && game.superMundial && <small className="cup-line">{game.superMundial.championId ? `🌐 ${game.superMundial.name}: campeão ${name(game.superMundial.championId)}` : `🌐 ${game.superMundial.name}: ${(hooks.superStepName(game.superMundial) || 'em andamento')}`}</small>}
        {game.cup && !ev && <small className="cup-line">{game.cup.championId ? `🏆 ${game.cup.name}: campeão ${name(game.cup.championId)}` : userInCup(game) ? `🏆 ${game.cup.name}: você está na ${game.cup.rounds[game.cup.roundIndex].name}` : `🏆 ${game.cup.name}: seu clube já foi eliminado`}</small>}
      </div>
      <div className="home2-actions">
        {isMatchDay(game)
          ? (plays || over
            ? <button className="primary home2-go" onClick={() => { setOpen(null); onPlay(); }}><span aria-hidden="true">▶</span> {next || ev ? 'Iniciar partida' : 'Simular a rodada'}</button>
            : <button className="primary home2-go" onClick={() => { setOpen(null); onAdvanceToMatch(); }}><span aria-hidden="true">⏭</span> {mineDay === undefined ? 'Avançar até o fim da temporada' : 'Avançar até o seu próximo jogo'}</button>)
          : <button className="primary home2-go" onClick={onAdvance}><span aria-hidden="true">⏭</span> Avançar 1 dia</button>}
        <button className="btn home2-lineup" onClick={onEditLineup}><span aria-hidden="true">📋</span> Editar escalação</button>
      </div>
      {!isMatchDay(game) && <button className="btn home2-wide" onClick={onAdvanceToMatch}>⏩ {plays ? 'Ir até o dia do jogo' : mineDay === undefined ? 'Avançar até o fim da temporada' : 'Ir até o seu próximo jogo'}</button>}
      {tableRows.length > 0 && (
        <section className="fm-panel">
          <ScreenTitle icon="🏆" title="Classificação" right={<span className="fm-chip">{division.name}</span>} />
          <table className="fm-mini">
            <thead><tr><th>Pos</th><th className="l">Clube</th><th>Pts</th><th>J</th><th>V</th><th>E</th><th>D</th></tr></thead>
            <tbody>
              {miniRows.map(({ r, pos }) => (
                <tr key={r.clubId} className={r.clubId === game.userClubId ? 'mine' : ''}>
                  <td>{pos}</td><td className="l"><span><ClubBadge club={clubOf(game, r.clubId)} size={26} />{name(r.clubId)}</span></td><td><b>{r.points}</b></td><td>{r.played}</td><td>{r.won}</td><td>{r.drawn}</td><td>{r.lost}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="primary fm-wide" onClick={onSeeTables}>📊 Ver tabela completa <i aria-hidden="true">›</i></button>
        </section>
      )}
      <Newspaper game={game} />
      {shown.length > 0 && (
        <section>
          <h3>{shown[0].divisionId === division.id ? `Resultados da rodada ${shown[0].round}` : `${[game.cup, game.lib, game.sula, game.ucl, game.mundial, game.superMundial, game.regionais?.nordeste, game.regionais?.verde].find((c) => c?.id === shown[0].divisionId)?.name ?? 'Copa'} — resultados`}</h3>
          <ul className="list">
            {shown.map((r) => {
              const key = `${r.round}-${r.homeId}`;
              const mine = r.homeId === game.userClubId || r.awayId === game.userClubId;
              return (
                <li key={key}>
                  <button className={`row res-row ${mine ? 'mine' : ''}`} onClick={() => mine && setOpen(open === key ? null : key)}>
                    <span className="res-team r"><span className="res-name">{name(r.homeId)}</span><ClubBadge club={clubOf(game, r.homeId)} size={28} /></span>
                    <b className="score">{r.homeGoals} - {r.awayGoals}</b>
                    <span className="res-team"><ClubBadge club={clubOf(game, r.awayId)} size={28} /><span className="res-name">{name(r.awayId)}</span></span>
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
