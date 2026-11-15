import { useState } from 'react';
import { calOf, formatDayShort, fromDay, MONTHS } from '../engine/calendar';
import { clubOf } from '../engine/lookup';
import { upcomingMatches } from '../engine/upcoming';
import type { GameState } from '../engine/types';
import { ClubBadge } from './ClubBadge';
import { ScreenTitle } from './FmParts';

interface Row { day: number; home: boolean; oppId: string; label: string; score?: string; res?: 'w' | 'd' | 'l' }

/** Calendário da temporada: todos os jogos do seu clube, os já disputados (com placar) e os próximos (com data). */
export function CalendarScreen({ game, onBack }: { game: GameState; onBack: () => void }) {
  const [tab, setTab] = useState<'next' | 'played'>('next');
  const me = game.userClubId;
  const next: Row[] = upcomingMatches(game, 120).map((m) => ({ day: m.day, home: m.home, oppId: m.home ? m.awayId : m.homeId, label: m.label }));
  const played: Row[] = (game.played ?? []).filter((x) => x.season === game.season).map((x) => {
    const home = x.homeId === me;
    const gf = home ? x.homeGoals : x.awayGoals, ga = home ? x.awayGoals : x.homeGoals;
    const pw = x.pens ? (home ? x.pens[0] > x.pens[1] : x.pens[1] > x.pens[0]) : undefined;
    const res: Row['res'] = gf > ga ? 'w' : gf < ga ? 'l' : pw === undefined ? 'd' : pw ? 'w' : 'l';
    return { day: x.day, home, oppId: home ? x.awayId : x.homeId, label: x.label, score: `${gf} x ${ga}${x.pens ? ` (pên. ${home ? x.pens[0] : x.pens[1]}-${home ? x.pens[1] : x.pens[0]})` : ''}`, res };
  }).reverse();
  const rows = tab === 'next' ? next : played;
  const groups: { key: string; title: string; items: Row[] }[] = [];
  for (const r of rows) {
    const { y, m } = fromDay(r.day);
    const key = `${y}-${m}`;
    let gr = groups[groups.length - 1];
    if (!gr || gr.key !== key) { gr = { key, title: `${MONTHS[m - 1][0].toUpperCase()}${MONTHS[m - 1].slice(1)} de ${y}`, items: [] }; groups.push(gr); }
    gr.items.push(r);
  }
  const w = played.filter((r) => r.res === 'w').length, d = played.filter((r) => r.res === 'd').length, l = played.filter((r) => r.res === 'l').length;
  const today = calOf(game).day;
  return (
    <>
      <ScreenTitle icon="📅" title="Calendário" />
      <div className="card">
        <div className="chips" role="tablist" aria-label="Jogos">
          <button role="tab" aria-selected={tab === 'next'} className={tab === 'next' ? 'on' : ''} onClick={() => setTab('next')}>Próximos ({next.length})</button>
          <button role="tab" aria-selected={tab === 'played'} className={tab === 'played' ? 'on' : ''} onClick={() => setTab('played')}>Jogados ({played.length})</button>
        </div>
        <p className="hint" style={{ margin: '8px 0 0' }}>Temporada {game.season} · hoje {formatDayShort(today)}{played.length > 0 ? ` · campanha: ${w}V ${d}E ${l}D` : ''}</p>
      </div>
      {groups.length === 0 && <div className="card"><p className="hint" style={{ margin: 0 }}>{tab === 'next' ? 'Sem jogos marcados no momento.' : 'Nenhum jogo disputado ainda nesta temporada.'}</p></div>}
      {groups.map((gr) => (
        <section key={gr.key}>
          <h3>{gr.title}</h3>
          <ul className="list">
            {gr.items.map((r, i) => {
              const c = clubOf(game, r.oppId);
              return (
                <li key={i} className="row cal-row">
                  <b className="cal-date">{formatDayShort(r.day)}</b>
                  <ClubBadge club={c} size={26} />
                  <span className="grow"><b>{r.home ? '🏠' : '✈️'} {c.name}</b><small style={{ display: 'block' }}>{r.label}</small></span>
                  {r.score && <b className={`cal-score ${r.res}`}>{r.score}</b>}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <p className="hint">Jogos de copa, mata-mata e torneios continentais aparecem aqui depois do sorteio.</p>
      <button className="btn" onClick={onBack}>‹ Voltar ao Início</button>
    </>
  );
}
