import { useState } from 'react';
import { fixturesOfRound, leagueNameOf, seasonOutcome, slotsOf, userDivision } from '../engine/game';
import { estadualOfUser, estadualRanking, estadualSummary, stepLabel } from '../engine/estadual';
import { userInCup } from '../engine/cup';
import { pendingEvent } from '../engine/events';
import { CONTINENTALS, COMPS, mundialStepName, stepName, userIn } from '../engine/continental';
import { clubOf } from '../engine/lookup';
import { moodLabel } from '../engine/morale';
import type { GameState, MatchResult } from '../engine/types';
import { PROMOTED_STRONG_CHANCE } from '../engine/ai';
import { declineOffer, offerClub, resign } from '../engine/jobs';
import { acceptAnyOffer } from '../engine/abroad';
import { firingWarning } from '../engine/game';
import { ClubBadge } from './ClubBadge';
import { isInjured, roundsLeft } from '../engine/injuries';
import { stadiumOf } from '../engine/stadium';
import { calOf, daysToMatch, formatDay, formatDayLong, formatDayShort, isMatchDay, matchTimeOf, nextMatchDay } from '../engine/calendar';
import { SalaryCard } from './SalaryCard';
import { FmCard, Jersey, ScreenTitle, StatStrip, SubTabs } from './FmParts';
import { transferFeed } from '../engine/news';
import { divisionTable } from '../engine/game';
import { isGroups, userGroupRows } from '../engine/groups';
import { brl } from './Stadium';
import { EXPECTATION_LABEL, formatBudget } from '../newgame/format';

interface Props {
  game: GameState; onChange: (g: GameState) => void; last: MatchResult[]; over: boolean;
  onPlay: () => void; onSkip: (years: number) => void; onSeeTables: () => void; onSeeResults: () => void; onNextSeason: () => void; onEditLineup: () => void; onFinance: () => void; onStadium: () => void; onCalendar: () => void; onAdvance: () => void; onAdvanceToMatch: () => void; onTab: (t: 'squad' | 'table' | 'transfers' | 'profile') => void; onNews: () => void; onSeeHist: () => void; onSeeOffers: () => void;
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
export function Home({ game, onChange, last, over, onPlay, onSkip, onSeeTables, onSeeResults, onNextSeason, onEditLineup, onFinance, onStadium, onCalendar, onSeeOffers, onTab, onNews, onSeeHist, onAdvance, onAdvanceToMatch }: Props) {
  const name = (id: string) => clubOf(game, id).name;
  const [open, setOpen] = useState<string | null>(null);
  const [askSkip, setAskSkip] = useState(false);
  const [skipYears, setSkipYears] = useState(1);
  const [askLeave, setAskLeave] = useState(false);
  const [askJob, setAskJob] = useState<string | null>(null);
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
        {[game.cup, game.lib, game.sula, game.ucl, game.mundial].some((c) => c?.championId) && (
          <section>
            <h3>Campeões das copas</h3>
            <ul className="list">
              {[['🏆', game.cup], ['🌎', game.lib], ['🌴', game.sula], ['⭐', game.ucl], ['🌍', game.mundial]].map(([icon, c]) => { const k = c as { id: string; name: string; championId?: string } | undefined; return k?.championId ? <li key={k.id}><div className="row"><span className="grow">{icon as string} {k.name}</span><b>{name(k.championId)}</b></div></li> : null; })}
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
  const shown = last.filter((r) => r.divisionId === division.id || [game.cup?.id, game.lib?.id, game.sula?.id, game.ucl?.id, game.mundial?.id].includes(r.divisionId));
  const expectation = game.clubs[game.userClubId].boardExpectation;
  const m = game.morale;
  const recent = game.results.filter((r) => r.homeId === game.userClubId || r.awayId === game.userClubId).slice(-3).reverse();
  const tableRows = division.format === 'outside' ? [] : (isGroups(division) ? userGroupRows(game, division) : undefined) ?? divisionTable(game, division.id);
  const myPos = tableRows.findIndex((r) => r.clubId === game.userClubId);
  const miniRows = [0, 1, 2].filter((i) => i < tableRows.length).map((i) => ({ r: tableRows[i], pos: i + 1 })).concat(myPos > 2 ? [{ r: tableRows[myPos], pos: myPos + 1 }] : []);
  const feed = transferFeed(game, 3);
  const gate = stadiumOf(game).log[0];
  const gateNow = gate && gate.season === game.season && gate.round === game.round - 1 && last.length > 0 ? gate : undefined; // jogo em casa que acabou de acontecer

  const hurt = game.teams[game.userClubId]?.players.filter((p) => isInjured(game, p.id)).sort((a, b) => roundsLeft(game, b.id) - roundsLeft(game, a.id)) ?? [];
  const rawLabel = (ev ? ev.label.replace(/^\S+\s/, '') : game.estadual?.due ? `${estadualOfUser(game)?.comp.name ?? 'Estadual'} · ${stepLabel(game.estadual, game.estadual.step)}` : `${division.name} · Rodada ${Math.min(game.round, game.totalRounds)} de ${game.totalRounds}`);
  const cut = rawLabel.lastIndexOf(' · ');
  const compTitle = cut > 0 ? rawLabel.slice(0, cut) : rawLabel, compSub = cut > 0 ? rawLabel.slice(cut + 3) : '';
  const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

  return (
    <>
      <EstadualNotice game={game} onChange={onChange} />
      <div className="home2-top">
        <div className="mk-card home2-pill"><span aria-hidden="true">💵</span><b>{formatBudget(game.budgets[game.userClubId])}</b></div>
        <div className="mk-card home2-pill"><span aria-hidden="true">📅</span><span><small>Temporada {game.season}</small><b>{formatDay(calOf(game).day)}</b></span></div>
      </div>
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
          <span>📅 {cap(formatDayLong(nextMatchDay(game)))}</span>
          <span>🕒 {matchTimeOf(nextMatchDay(game))}</span>
        </div>
        {!isMatchDay(game) && <p className="cal-next" style={{ textAlign: 'center' }}>Hoje: <b>{formatDayShort(calOf(game).day)}</b> · {next || ev ? 'jogo' : 'rodada'} {daysToMatch(game) === 1 ? 'amanhã' : `em ${daysToMatch(game)} dias`}</p>}
        {!ev && COMPS.map((k) => { const c = game[k], cfg = CONTINENTALS[k]; if (!c) return null; const mine = c.groups.some((gr) => gr.clubIds.includes(game.userClubId)); return mine || c.championId ? <small key={k} className="cup-line">{c.championId ? `${cfg.icon} ${c.name}: campeão ${name(c.championId)}` : userIn(game, k) ? `${cfg.icon} ${c.name}: ${stepName(k, c)} em breve` : `${cfg.icon} ${c.name}: seu clube foi eliminado`}</small> : null; })}
        {!ev && game.mundial && <small className="cup-line">{game.mundial.championId ? `🌍 ${game.mundial.name}: campeão ${name(game.mundial.championId)}` : `🌍 ${game.mundial.name}: ${mundialStepName(game.mundial)}`}</small>}
        {game.cup && !ev && <small className="cup-line">{game.cup.championId ? `🏆 ${game.cup.name}: campeão ${name(game.cup.championId)}` : userInCup(game) ? `🏆 ${game.cup.name}: você está na ${game.cup.rounds[game.cup.roundIndex].name}` : `🏆 ${game.cup.name}: seu clube já foi eliminado`}</small>}
      </div>
      {hurt.length > 0 && <button className="mk-card home2-hurt" onClick={() => onTab('squad')}>🤕 <b>{hurt.length} {hurt.length === 1 ? 'lesionado' : 'lesionados'}</b> · {hurt.slice(0, 3).map((p) => `${p.name} (${roundsLeft(game, p.id)})`).join(', ')}{hurt.length > 3 ? '…' : ''}</button>}
      <div className="home2-actions">
        {isMatchDay(game)
          ? <button className="primary home2-go" onClick={() => { setOpen(null); onPlay(); }}><span aria-hidden="true">▶</span> {next || ev ? 'Iniciar partida' : 'Simular a rodada'}</button>
          : <button className="primary home2-go" onClick={onAdvance}><span aria-hidden="true">⏭</span> Avançar 1 dia</button>}
        <button className="btn home2-lineup" onClick={onEditLineup}><span aria-hidden="true">📋</span> Editar escalação</button>
      </div>
      {!isMatchDay(game) && <button className="btn home2-wide" onClick={onAdvanceToMatch}>⏩ Ir até o dia do jogo</button>}
      <div className="home2-grid">
        <button className="mk-card" onClick={() => onTab('transfers')}><span aria-hidden="true">🔁</span>Transferências</button>
        <button className="mk-card" onClick={onFinance}><span aria-hidden="true">💰</span>Finanças</button>
        <button className="mk-card" onClick={onStadium}><span aria-hidden="true">🏟️</span>Estádio</button>
        <button className="mk-card" onClick={() => onTab('profile')}><span aria-hidden="true">🧑‍💼</span>Treinador</button>
        <button className="mk-card" onClick={() => setAskSkip(true)}><span aria-hidden="true">⏭</span>Pular temporada</button>
        <button className="mk-card" onClick={onCalendar}><span aria-hidden="true">🗓️</span>Calendário</button>
      </div>
        {askSkip && (
          <div className="skip-ask mk-card" role="alert">
            <p>Quantos anos pular? Todos os jogos de todas as divisões, as copas e o Mundial serão simulados, inclusive os do seu clube. No fim você vê os campeões de cada ano.</p>
            <div className="chips" role="radiogroup" aria-label="Anos para pular">
              {[1, 2, 3, 4, 5].map((n) => <button key={n} role="radio" aria-checked={skipYears === n} className={skipYears === n ? 'on' : ''} onClick={() => setSkipYears(n)}>{n} {n === 1 ? 'ano' : 'anos'}</button>)}
            </div>
            <p className="hint">Boletos em aberto serão pagos automaticamente com o seu saldo do banco, se houver. Contratos de jogadores que terminarem no período serão encerrados.</p>
            <button className="primary" onClick={() => { setAskSkip(false); onSkip(skipYears); }}>Pular {skipYears} {skipYears === 1 ? 'ano' : 'anos'}</button>
            <button className="btn" onClick={() => setAskSkip(false)}>Cancelar</button>
          </div>
        )}

      <section className="fm-hero">
        <Jersey club={game.clubs[game.userClubId]} />
        <div className="fm-hero-r">
          <h2>ELENCO</h2>
          <StatStrip game={game} compact />
          <button className="primary fm-wide" onClick={() => onTab('squad')}>👥 Ver meu elenco <i aria-hidden="true">›</i></button>
        </div>
      </section>
      {tableRows.length > 0 && (
        <section className="fm-panel">
          <ScreenTitle icon="🏆" title="Competições" right={<span className="fm-chip">{division.name}</span>} />
          <SubTabs items={[{ icon: '☰', label: 'Tabela', on: true, onClick: onSeeTables }, { icon: '⚽', label: 'Jogos', onClick: onSeeResults }, { icon: '🏅', label: 'Campeões', onClick: onSeeHist }]} />
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
      <section className="fm-panel">
        <ScreenTitle icon="🔁" title="Transferências" />
        <SubTabs items={[{ icon: '🛒', label: 'Mercado', on: true, onClick: () => onTab('transfers') }, { icon: '📄', label: `Propostas${game.offers.length ? ` (${game.offers.length})` : ''}`, onClick: onSeeOffers }, { icon: '📰', label: 'Notícias', onClick: onNews }]} />
        <ul className="fm-feed">
          {feed.length === 0 && <li className="fm-empty">Nenhuma transferência ainda. Os clubes negociam durante a temporada.</li>}
          {feed.map((n, i) => <li key={i} className={n.mine ? 'mine' : ''}><span aria-hidden="true">{n.mine ? '⭐' : '🔁'}</span><span>{n.text}</span></li>)}
        </ul>
        <button className="primary fm-wide" onClick={() => onTab('transfers')}>🔎 Abrir mercado <i aria-hidden="true">›</i></button>
      </section>
      {recent.length > 0 && (
        <FmCard icon="🏆" title="Últimos jogos" action="Ver tabela" onAction={() => onTab('table')}>
          <ul className="fm-games">
            {recent.map((r, i) => (
              <li key={i}><span className="fm-team"><ClubBadge club={clubOf(game, r.homeId)} size={30} /><small>{name(r.homeId)}</small></span><b className="fm-score">{r.homeGoals} - {r.awayGoals}</b><span className="fm-team"><ClubBadge club={clubOf(game, r.awayId)} size={30} /><small>{name(r.awayId)}</small></span></li>
            ))}
          </ul>
        </FmCard>
      )}

      {game.offers.length > 0 && (
        <button className="home-offers" onClick={onSeeOffers}>
          📨 Você tem <b>{game.offers.length}</b> {game.offers.length === 1 ? 'proposta' : 'propostas'} por jogadores <span>Ver propostas ›</span>
        </button>
      )}

      {(game.jobOffers ?? []).length > 0 && (
        <section>
          <h3>Propostas de emprego</h3>
          <ul className="un-list">
            {(game.jobOffers ?? []).map((o) => {
              const c = offerClub(game, o);
              return (
                <li key={o.clubId} className="un-offer">
                  <ClubBadge club={c} size={40} />
                  <div className="grow"><b>{c.name}</b><small>{o.foreign ? `🌍 ${o.foreign.countryName} · ${o.foreign.leagueName} · ` : ''}Reputação {'★'.repeat(c.reputation)} · meta: {EXPECTATION_LABEL[c.boardExpectation]}</small></div>
                  {askJob === o.clubId ? (
                    <div className="un-btns"><button className="btn main" onClick={() => { const r = acceptAnyOffer(game, o.clubId); if (r.ok) onChange(r.state); setAskJob(null); }}>Confirmar saída</button><button className="btn" onClick={() => setAskJob(null)}>Voltar</button></div>
                  ) : (
                    <div className="un-btns"><button className="btn main" onClick={() => setAskJob(o.clubId)}>Aceitar</button><button className="btn" onClick={() => onChange(declineOffer(game, o.clubId))}>Recusar</button></div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
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

      {gateNow && (
        <div className="card center st-last">🏟️ Público: <b>{gateNow.attendance.toLocaleString('pt-BR')}</b> de {gateNow.capacity.toLocaleString('pt-BR')} · ingresso {brl(gateNow.price)} · renda <b>{formatBudget(gateNow.revenue)}</b></div>
      )}
      {shown.length > 0 && (
        <section>
          <h3>{shown[0].divisionId === division.id ? `Resultados da rodada ${shown[0].round}` : `${[game.cup, game.lib, game.sula, game.ucl, game.mundial].find((c) => c?.id === shown[0].divisionId)?.name ?? 'Copa'} — resultados`}</h3>
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
      <section>
        <h3>Carreira</h3>
        {!askLeave ? <button className="btn" onClick={() => setAskLeave(true)}>🧳 Pedir demissão</button> : (
          <div className="skip-ask" role="alert">
            <p>Pedir demissão do {game.clubs[game.userClubId].name}? Você fica sem clube e sem indenização, mas pode receber propostas de outros clubes.</p>
            <button className="primary" onClick={() => { setAskLeave(false); onChange(resign(game)); }}>Sim, pedir demissão</button>
            <button className="btn" onClick={() => setAskLeave(false)}>Cancelar</button>
          </div>
        )}
      </section>
    </>
  );
}
