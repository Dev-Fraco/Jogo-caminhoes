import { ClubBadge } from './ClubBadge';
import { assignSlots, teamRatings } from '../engine/squad';
import type { ClubInfo, Position, TeamState } from '../engine/types';

const ORDER: Position[] = ['GK', 'DEF', 'MID', 'ATT'];
const POS: Record<Position, string> = { GK: 'GOL', DEF: 'DEF', MID: 'MEI', ATT: 'ATA' };

function Side({ club, team, mine }: { club: ClubInfo; team: TeamState; mine: boolean }) {
  const xi = assignSlots(team).sort((a, b) => ORDER.indexOf(a.player.pos) - ORDER.indexOf(b.player.pos));
  const r = teamRatings(team);
  return (
    <div className={`lc-side${mine ? ' lc-mine' : ''}`}>
      <ClubBadge club={club} size={40} />
      <strong className="lc-name">{club.name}</strong>
      <small>{team.formation} · força {Math.round(r.overall)}</small>
      <ol className="lc-list">
        {xi.map(({ player: p }) => (
          <li key={p.id}><span className="lc-pos">{POS[p.pos]}</span><span className="lc-pl">{p.name}</span><b>{Math.round(p.strength)}</b></li>
        ))}
      </ol>
    </div>
  );
}

/** Antes da partida: as duas escalações lado a lado. */
export function LineupCompare({ home, away, homeTeam, awayTeam, userId, onStart }: { home: ClubInfo; away: ClubInfo; homeTeam: TeamState; awayTeam: TeamState; userId: string; onStart: () => void }) {
  return (
    <section className="lc" aria-label="Escalações da partida">
      <h3>Escalações</h3>
      <div className="lc-grid">
        <Side club={home} team={homeTeam} mine={home.id === userId} />
        <Side club={away} team={awayTeam} mine={away.id === userId} />
      </div>
      <button className="primary lc-go" onClick={onStart}>▶ Iniciar</button>
    </section>
  );
}
