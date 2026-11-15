import { useEffect, useState } from 'react';
import { formatDayLong, formatDayShort, fromDay, MONTHS, toDay } from '../engine/calendar';
import { upcomingMatches } from '../engine/upcoming';
import type { GameState } from '../engine/types';
import { clubOf } from '../engine/lookup';

const WD = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

/** Calendário que aparece ao avançar o dia: marca o dia de hoje, anima a passagem para o outro dia e mostra os jogos (adversários) dos dias. */
export function DayCalendar({ game, from, to, onClose }: { game: GameState; from: number; to: number; onClose: () => void }) {
  const [shown, setShown] = useState(from);
  const matches = upcomingMatches(game, 14);
  const byDay = new Map(matches.map((m) => [m.day, m]));
  const arrived = shown >= to;

  useEffect(() => {
    if (shown >= to) return;
    const t = window.setTimeout(() => setShown((d) => d + 1), to - from > 3 ? 260 : 650);
    return () => window.clearTimeout(t);
  }, [shown, to, from]);

  const { y, m } = fromDay(shown);
  const first = fromDay(toDay(y, m, 1)).wd;
  const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: dim }, (_, i) => i + 1)];
  const todayMatch = byDay.get(to);
  const name = (id: string) => clubOf(game, id).name;
  const short = (id: string) => clubOf(game, id).shortName;
  const next = matches.find((x) => x.day >= to);

  return (
    <div className="phone-gate" role="dialog" aria-modal="true" aria-label="Calendário">
      <div className="daycal">
        <header><b>{MONTHS[m - 1]} de {y}</b><small>{arrived ? 'Hoje' : 'Passando o tempo…'}</small></header>
        <div className="daycal-grid" role="grid" aria-label={`${MONTHS[m - 1]} de ${y}`}>
          {WD.map((w, i) => <span key={i} className="wd">{w}</span>)}
          {cells.map((d, i) => {
            if (d === null) return <span key={i} />;
            const day = toDay(y, m, d);
            const match = byDay.get(day);
            const cls = ['cell', day === shown ? 'today' : '', day < shown ? 'past' : '', match && day >= shown ? 'match' : ''].join(' ');
            return (
              <span key={i} className={cls} role="gridcell" aria-current={day === shown ? 'date' : undefined}>
                <b>{d}</b>
                {match && day >= shown && <em title={`${name(match.homeId)} x ${name(match.awayId)}`}>{match.home ? '🏠' : '✈️'} {short(match.home ? match.awayId : match.homeId)}</em>}
              </span>
            );
          })}
        </div>
        <p className="daycal-day">📅 {formatDayLong(shown)}</p>
        {arrived && (todayMatch
          ? <p className="daycal-match">⚽ Hoje tem jogo! <b>{name(todayMatch.homeId)} x {name(todayMatch.awayId)}</b><small>{todayMatch.label}</small></p>
          : next ? <p className="daycal-next">Próximo jogo: <b>{formatDayShort(next.day)}</b> contra <b>{name(next.home ? next.awayId : next.homeId)}</b> ({next.home ? 'em casa' : 'fora'})</p> : <p className="daycal-next">Sem jogos marcados.</p>)}
        {arrived && matches.length > 0 && (
          <ul className="daycal-list" aria-label="Próximos jogos">
            {matches.slice(0, 5).map((x, i) => <li key={i}><b>{formatDayShort(x.day)}</b><span>{x.home ? 'vs' : '@'} {name(x.home ? x.awayId : x.homeId)}<small>{x.label}</small></span></li>)}
          </ul>
        )}
        <button className="primary" onClick={onClose} disabled={!arrived}>{arrived ? 'Continuar' : '…'}</button>
      </div>
    </div>
  );
}

