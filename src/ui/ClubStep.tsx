import { getClubs, type ClubData } from '../data/clubs';
import { getCountry, getDivision, getLeague } from '../data/world';
import { EXPECTATION_LABEL, formatBudget } from '../newgame/format';
import type { WorldSelection } from '../newgame/state';
import { ClubBadge } from './ClubBadge';
import './clubstep.css';

const Stars = ({ n }: { n: number }) => (
  <span className="cc-stars" role="img" aria-label={`Reputação ${n} de 5`}>
    {[1, 2, 3, 4, 5].map((i) => <span key={i} className={i <= n ? 'on' : ''}>{i <= n ? '★' : '☆'}</span>)}
  </span>
);

const PinIcon = () => (
  <svg className="cc-ico" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M8 1a5 5 0 0 0-5 5c0 3.6 5 9 5 9s5-5.4 5-9a5 5 0 0 0-5-5Zm0 7a2 2 0 1 1 0-4 2 2 0 0 1 0 4Z" /></svg>
);

interface Props { world: WorldSelection; selected: ClubData | null; onSelect: (club: ClubData) => void }

/** Etapa 3 — Escolha do Clube: grade de cartões com os clubes da divisão escolhida na Etapa 2. */
export function ClubStep({ world, selected, onSelect }: Props) {
  const clubs = getClubs(world.divisionId);
  const country = getCountry(world.countryId);
  const league = getLeague(world.countryId, world.leagueId);
  const division = getDivision(world.countryId, world.leagueId, world.divisionId);

  return (
    <div>
      <p className="cc-context">
        <span aria-hidden="true">{country?.flag}</span> {country?.name} › {league?.name} › <strong>{division?.name}</strong>
        {clubs.length > 0 && <em>{clubs.length} clubes</em>}
      </p>

      {clubs.length === 0 ? (
        <div className="nw-soon">
          <h2>Sem clubes ainda</h2>
          <p className="nw-soon-sub">Os clubes desta divisão ainda não foram cadastrados. Volte e escolha outra divisão.</p>
          <p className="nw-soon-tag">Em breve</p>
        </div>
      ) : (
        <div className="cc-grid" role="radiogroup" aria-label="Clube">
          {clubs.map((c) => (
            <label key={c.id} className="cc">
              <input type="radio" name="nw-club" value={c.id} checked={selected?.id === c.id} onChange={() => onSelect(c)} />
              <span className="cc-body">
                <span className="cc-top">
                  <ClubBadge club={c} size={60} />
                  <span className="cc-title">
                    <span className="cc-name">{c.name}</span>
                    <span className="cc-short">{c.shortName}</span>
                  </span>
                </span>
                <span className="cc-venue"><PinIcon />{c.stadium} · {c.city}</span>
                <span className="cc-meta">
                  <span className="cc-budget"><small>Orçamento</small>{formatBudget(c.budget)}</span>
                  <span className={`cc-exp ${c.boardExpectation}`} title="Meta da diretoria">{EXPECTATION_LABEL[c.boardExpectation]}</span>
                  <Stars n={c.reputation} />
                </span>
                <span className="cc-check" aria-hidden="true">✓</span>
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
