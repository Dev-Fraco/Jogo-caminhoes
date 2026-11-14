import { useState } from 'react';
import { getCountry, getDivision, getLeague } from '../data/world';
import { EXPECTATION_LABEL, formatBudget } from '../newgame/format';
import {
  DIFFICULTIES, GAME_MODES, NATIONALITIES, REPUTATIONS, SAVE_NAME_MAX, suggestSaveName, validateSetup,
  type GameSetup, type NewGameState,
} from '../newgame/state';
import { ClubBadge } from './ClubBadge';
import './setupstep.css';

const LockIcon = () => (
  <svg className="sp-lock" viewBox="0 0 16 16" width="22" height="22" aria-hidden="true">
    <path fill="currentColor" d="M8 1a3.5 3.5 0 0 0-3.5 3.5V6H4a1.5 1.5 0 0 0-1.5 1.5v6A1.5 1.5 0 0 0 4 15h8a1.5 1.5 0 0 0 1.5-1.5v-6A1.5 1.5 0 0 0 12 6h-.5V4.5A3.5 3.5 0 0 0 8 1Zm2 5H6V4.5a2 2 0 1 1 4 0V6Z" />
  </svg>
);

/** Resumo de tudo o que foi escolhido nas etapas anteriores e nesta. */
function Summary({ state }: { state: NewGameState }) {
  const { coach, world, club, setup } = state;
  const country = getCountry(world.countryId);
  const league = getLeague(world.countryId, world.leagueId);
  const division = getDivision(world.countryId, world.leagueId, world.divisionId);
  const nat = NATIONALITIES.find((n) => n.id === coach.nationality);
  const rep = REPUTATIONS.find((r) => r.id === coach.reputation);
  const diff = DIFFICULTIES.find((d) => d.id === setup.difficulty);
  const mode = GAME_MODES.find((m) => m.id === setup.mode);

  return (
    <div className="sp-summary" aria-label="Resumo da seleção">
      <h3>Resumo</h3>
      <dl>
        <div><dt>Treinador</dt><dd><strong>{coach.name.trim()}</strong><small>{nat?.label} · {rep?.label}</small></dd></div>
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
        <div><dt>Dificuldade</dt><dd><strong>{diff?.label}</strong></dd></div>
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
        <fieldset className="nw-field sp-set">
          <legend>Dificuldade</legend>
          <div className="sp-diff" role="radiogroup" aria-label="Dificuldade">
            {DIFFICULTIES.map((d) => (
              <label key={d.id} className="nw-pick">
                <input type="radio" name="nw-difficulty" value={d.id} checked={setup.difficulty === d.id} onChange={() => onChange({ ...setup, difficulty: d.id })} />
                <span className="nw-pick-body">
                  <span className="nw-pips sp-pips" aria-hidden="true">{[1, 2, 3, 4].map((i) => <i key={i} className={i <= d.level ? 'on' : ''} />)}</span>
                  <strong>{d.label}</strong>
                  <small>{d.description}</small>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="nw-field sp-set">
          <legend>Modo de jogo</legend>
          <div className="sp-modes" role="radiogroup" aria-label="Modo de jogo">
            {GAME_MODES.map((m) => (
              <label key={m.id} className={`nw-pick${m.locked ? ' sp-locked' : ''}`} title={m.locked ? 'Recurso Premium: indisponível por enquanto' : undefined}>
                <input type="radio" name="nw-mode" value={m.id} checked={setup.mode === m.id} disabled={m.locked}
                  aria-describedby={m.locked ? 'sp-premium-note' : undefined} onChange={() => onChange({ ...setup, mode: m.id })} />
                <span className="nw-pick-body nw-row">
                  {m.locked && <LockIcon />}
                  <span className="nw-grow"><strong>{m.label}</strong><small>{m.description}</small></span>
                  {m.locked && <span className="sp-premium">Premium</span>}
                </span>
              </label>
            ))}
          </div>
          <p id="sp-premium-note" className="sp-note">Dinheiro Infinito é um recurso Premium e ainda não está disponível.</p>
        </fieldset>

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
