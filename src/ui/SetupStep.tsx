import { useState } from 'react';
import { getCountry, getDivision, getLeague } from '../data/world';
import { EXPECTATION_LABEL, formatBudget } from '../newgame/format';
import {
  CHALLENGES, GAME_MODES, NATIONALITIES, SAVE_NAME_MAX, suggestSaveName, validateSetup,
  type GameSetup, type NewGameState,
} from '../newgame/state';
import { ClubBadge } from './ClubBadge';
import './setupstep.css';

/** Resumo de tudo o que foi escolhido nas etapas anteriores e nesta. */
function Summary({ state }: { state: NewGameState }) {
  const { coach, world, club, setup } = state;
  const country = getCountry(world.countryId);
  const league = getLeague(world.countryId, world.leagueId);
  const division = getDivision(world.countryId, world.leagueId, world.divisionId);
  const nat = NATIONALITIES.find((n) => n.id === coach.nationality);
  const diff = CHALLENGES.find((d) => d.id === coach.challenge);
  const mode = GAME_MODES.find((m) => m.id === setup.mode);

  return (
    <div className="sp-summary" aria-label="Resumo da seleção">
      <h3>Resumo</h3>
      <dl>
        <div><dt>Treinador</dt><dd><strong>{coach.name.trim()}</strong><small>{nat?.label}</small></dd></div>
        <div><dt>País / Liga / Divisão</dt><dd><strong><span aria-hidden="true">{country?.flag}</span> {country?.name}</strong><small>{league?.name} › {division?.name}</small></dd></div>
        <div className="sp-club">
          <dt>Clube</dt>
          <dd>
            {club && <ClubBadge club={club} size={44} />}
            <span>
              <strong>{club?.name}</strong>
              {club && <small>{club.stadium} · {formatBudget(club.budget)} · Meta: {EXPECTATION_LABEL[club.boardExpectation]}</small>}
            </span>
          </dd>
        </div>
        <div><dt>Desafio</dt><dd><strong>{diff?.label}</strong><small>{diff?.description}</small></dd></div>
        <div><dt>Modo de jogo</dt><dd><strong>{mode?.label}</strong></dd></div>
        <div><dt>Nome do save</dt><dd><strong className="sp-savename">{setup.saveName.trim() || '—'}</strong></dd></div>
      </dl>
    </div>
  );
}

interface Props { state: NewGameState; onChange: (setup: GameSetup) => void }

/** Etapa 4 — Confirmação: dificuldade, modo de jogo, nome do save e resumo antes de iniciar. */
export function SetupStep({ state, onChange }: Props) {
  const { setup, club, coach } = state;
  const [touched, setTouched] = useState(false);
  const errors = validateSetup(setup);
  const suggestion = club ? suggestSaveName(coach.name, club.name) : '';
  const len = setup.saveName.trim().length;

  return (
    <div className="sp-layout">
      <div className="sp-form">
        <div className="nw-field sp-set">
          <label htmlFor="nw-save">Nome do save</label>
          <input
            id="nw-save" type="text" autoComplete="off" value={setup.saveName} aria-invalid={touched && !!errors.saveName} aria-describedby="nw-save-msg"
            className={touched && errors.saveName ? 'bad' : ''}
            onChange={(e) => onChange({ ...setup, saveName: e.target.value, saveNameEdited: true })}
            onBlur={() => setTouched(true)}
          />
          <div id="nw-save-msg" className="nw-msg">
            {touched && errors.saveName ? <span className="nw-error" role="alert">{errors.saveName}</span>
              : setup.saveNameEdited && setup.saveName !== suggestion
                ? <button type="button" className="sp-link" onClick={() => onChange({ ...setup, saveName: suggestion, saveNameEdited: false })}>Usar sugestão: {suggestion}</button>
                : <span className="nw-hint">Sugestão automática: Treinador - Clube - temporada</span>}
            <span className={`nw-count ${len > SAVE_NAME_MAX ? 'bad' : ''}`}>{len}/{SAVE_NAME_MAX}</span>
          </div>
        </div>
      </div>

      <Summary state={state} />
    </div>
  );
}
