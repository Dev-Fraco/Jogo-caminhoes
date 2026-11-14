import { useEffect, useRef } from 'react';
import { COUNTRY_ORDER, getCountry, getDivision, getLeague, isPrincipal, WORLD_DATA } from '../data/world';
import { validateWorld, type WorldSelection } from '../newgame/state';
import './worldstep.css';

interface Props {
  world: WorldSelection;
  onChange: (w: WorldSelection) => void;
  /** Já tentou avançar? Só então as mensagens de erro aparecem. */
  attempted: boolean;
  /** Muda a cada tentativa de avançar com erro; leva o foco ao primeiro campo inválido. */
  focusTick: number;
}

/** Etapa 2 — Mundo: país → liga → divisão. Trocar o país limpa liga e divisão; trocar a liga limpa a divisão. */
export function WorldStep({ world, onChange, attempted, focusTick }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const country = getCountry(world.countryId);
  const league = getLeague(world.countryId, world.leagueId);
  const division = getDivision(world.countryId, world.leagueId, world.divisionId);
  const errors = attempted ? validateWorld(world) : {};

  useEffect(() => {
    if (focusTick) root.current?.querySelector<HTMLInputElement>('[data-err="true"] input')?.focus();
  }, [focusTick]);

  return (
    <div ref={root}>
      <fieldset className="nw-field nw-ws-set" data-err={!!errors.country}>
        <legend>País</legend>
        <div className="nw-countries" role="radiogroup" aria-label="País">
          {COUNTRY_ORDER.map((id) => (
            <label key={id} className="nw-pick nw-country">
              <input type="radio" name="nw-country" value={id} checked={world.countryId === id}
                onChange={() => onChange({ countryId: id, leagueId: '', divisionId: '' })} />
              <span className="nw-pick-body">
                <span className="nw-flag" aria-hidden="true">{WORLD_DATA[id].flag}</span>
                <strong>{WORLD_DATA[id].name}</strong>
              </span>
            </label>
          ))}
        </div>
        <div className="nw-msg">{errors.country && <span className="nw-error" role="alert">{errors.country}</span>}</div>
      </fieldset>

      <div className="nw-ws-two">
        <fieldset className={`nw-field nw-ws-set ${country ? '' : 'locked'}`} data-err={!!errors.league} disabled={!country}>
          <legend>Liga</legend>
          <div className="nw-ws-list" role="radiogroup" aria-label="Liga">
            {country ? country.leagues.map((l) => (
              <label key={l.id} className="nw-pick">
                <input type="radio" name="nw-league" value={l.id} checked={world.leagueId === l.id}
                  onChange={() => onChange({ ...world, leagueId: l.id, divisionId: '' })} />
                <span className="nw-pick-body nw-row">
                  <span className="nw-grow"><strong>{l.name}</strong><small>{l.description}</small></span>
                </span>
              </label>
            )) : <p className="nw-ws-hint">Escolha um país para ver as ligas.</p>}
          </div>
          <div className="nw-msg">{errors.league && <span className="nw-error" role="alert">{errors.league}</span>}</div>
        </fieldset>

        <fieldset className={`nw-field nw-ws-set ${league ? '' : 'locked'}`} data-err={!!errors.division} disabled={!league}>
          <legend>Divisão</legend>
          <div className="nw-ws-list" role="radiogroup" aria-label="Divisão">
            {league ? league.divisions.map((d) => (
              <label key={d.id} className="nw-pick">
                <input type="radio" name="nw-division" value={d.id} checked={world.divisionId === d.id}
                  onChange={() => onChange({ ...world, divisionId: d.id })} />
                <span className="nw-pick-body nw-row">
                  <span className="nw-grow"><strong>{d.name}</strong>{d.alias && <small>{d.alias}</small>}</span>
                  {isPrincipal(league, d) && <span className="nw-badge">Principal</span>}
                  <span className="nw-teams">{d.teams} times</span>
                </span>
              </label>
            )) : <p className="nw-ws-hint">Escolha uma liga para ver as divisões.</p>}
          </div>
          <div className="nw-msg">{errors.division && <span className="nw-error" role="alert">{errors.division}</span>}</div>
        </fieldset>
      </div>

      <div className={`nw-summary ${division ? 'ok' : ''}`} role="status" aria-live="polite">
        {country ? (
          <>
            <span className="nw-flag" aria-hidden="true">{country.flag}</span>{' '}
            <span>{country.name}</span>
            {league && <>{' '}<i aria-hidden="true">›</i>{' '}<span>{league.name}</span></>}
            {league && division && <>{' '}<i aria-hidden="true">›</i>{' '}<span>{division.name} ({division.teams} times)</span></>}
          </>
        ) : <span className="nw-ws-hint">Sua seleção aparece aqui: país › liga › divisão.</span>}
      </div>
    </div>
  );
}
