import { useEffect, useRef, useState } from 'react';
import { applyWorld, CHALLENGE_DIFFICULTY, CHALLENGE_REPUTATION, CHALLENGES, challengeWorld, createNewGameState, isWizardComplete, lockedWorld, NAME_MAX, NATIONALITIES, STEPS, syncSaveName, validateCoach, type ChallengeId, type CoachProfile, type NewGameState } from '../newgame/state';
import { Backdrop } from './Backdrop';
import type { ClubData } from '../data/clubs';
import { ClubStep } from './ClubStep';
import { SetupStep } from './SetupStep';
import { SquadSheet } from './SquadSheet';
import { WorldStep } from './WorldStep';
import './newgame.css';

type Touched = { name?: boolean; nationality?: boolean; challenge?: boolean };

/** Etapa 1 — Perfil do Treinador. */
function CoachStep({ coach, onChange, touched, setTouched, refs }: {
  coach: CoachProfile;
  onChange: (c: CoachProfile) => void;
  touched: Touched;
  setTouched: (t: Touched) => void;
  refs: { name: React.RefObject<HTMLInputElement>; nat: React.RefObject<HTMLSelectElement>; rep: React.RefObject<HTMLDivElement> };
}) {
  const errors = validateCoach(coach);
  const err = (k: keyof Touched) => (touched[k] ? errors[k] : undefined);
  const touch = (k: keyof Touched) => setTouched({ ...touched, [k]: true });
  const len = coach.name.trim().length;

  return (
    <>
      <div className="nw-grid2">
        <div className="nw-field">
          <label htmlFor="nw-name">Nome do treinador</label>
          <input
            id="nw-name" ref={refs.name} type="text" autoComplete="off" placeholder="Ex.: Carlos Almeida"
            value={coach.name} aria-invalid={!!err('name')} aria-describedby="nw-name-msg"
            className={err('name') ? 'bad' : ''}
            onChange={(e) => onChange({ ...coach, name: e.target.value })}
            onBlur={() => touch('name')}
          />
          <div id="nw-name-msg" className="nw-msg">
            {err('name') ? <span className="nw-error" role="alert">{err('name')}</span> : <span className="nw-hint">2 a {NAME_MAX} caracteres</span>}
            <span className={`nw-count ${len > NAME_MAX ? 'bad' : ''}`}>{len}/{NAME_MAX}</span>
          </div>
        </div>

        <div className="nw-field">
          <label htmlFor="nw-nat">Nacionalidade</label>
          <select
            id="nw-nat" ref={refs.nat} value={coach.nationality} aria-invalid={!!err('nationality')} aria-describedby="nw-nat-msg"
            className={err('nationality') ? 'bad' : ''}
            onChange={(e) => onChange({ ...coach, nationality: e.target.value })}
            onBlur={() => touch('nationality')}
          >
            <option value="" disabled>Selecione a nacionalidade</option>
            {NATIONALITIES.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
          </select>
          <div id="nw-nat-msg" className="nw-msg">{err('nationality') && <span className="nw-error" role="alert">{err('nationality')}</span>}</div>
        </div>
      </div>

      <fieldset className="nw-field nw-rep-set" aria-describedby="nw-rep-msg">
        <legend>Desafio</legend>
        <div className="nw-rep" role="radiogroup" aria-label="Desafio" ref={refs.rep}>
          {CHALLENGES.map((r) => (
            <label key={r.id} className="nw-rep-card">
              <input
                type="radio" name="nw-challenge" value={r.id} checked={coach.challenge === r.id}
                onChange={() => { onChange({ ...coach, challenge: r.id as ChallengeId, reputation: CHALLENGE_REPUTATION[r.id as ChallengeId] }); touch('challenge'); }}
              />
              <span className="nw-rep-body">
                <span className="nw-pips" aria-hidden="true">
                  {[1, 2, 3, 4, 5].map((i) => <i key={i} className={i <= r.level ? 'on' : ''} />)}
                </span>
                <strong>{r.label}</strong>
                <small>{r.description}</small>
              </span>
            </label>
          ))}
        </div>
        <div id="nw-rep-msg" className="nw-msg">{err('challenge') && <span className="nw-error" role="alert">{err('challenge')}</span>}</div>
      </fieldset>
    </>
  );
}

/** Etapas 2–4: placeholders. Para implementar uma etapa, troque o retorno do case correspondente. */
function PlaceholderStep({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="nw-soon">
      <h2>{title}</h2>
      {subtitle && <p className="nw-soon-sub">{subtitle}</p>}
      <p className="nw-soon-tag">Em breve</p>
    </div>
  );
}

export function NewGame({ onBack, onStart, hasSave }: { onBack: () => void; onStart: (state: NewGameState) => void; hasSave: boolean }) {
  // Estado do assistente: guarda tudo que for preenchido e é preservado ao navegar entre etapas.
  const [state, setState] = useState<NewGameState>(createNewGameState);
  const [index, setIndex] = useState(0);
  const [touched, setTouched] = useState<Touched>({});
  const [worldAttempted, setWorldAttempted] = useState(false);
  const [worldFocus, setWorldFocus] = useState(0);
  const [viewing, setViewing] = useState<ClubData | null>(null); // clube com o elenco aberto
  const opener = useRef<HTMLElement | null>(null);
  const refs = { name: useRef<HTMLInputElement>(null), nat: useRef<HTMLSelectElement>(null), rep: useRef<HTMLDivElement>(null) };

  // Escolher o desafio ajusta a dificuldade e o mundo (Lendário e Criar clube vão direto para os estaduais; Difícil só Série B e C)
  const changeCoach = (coach: CoachProfile) => setState((s) => {
    let next: NewGameState = { ...s, coach };
    if (coach.challenge !== s.coach.challenge && coach.challenge) {
      next = { ...next, setup: { ...next.setup, difficulty: CHALLENGE_DIFFICULTY[coach.challenge] }, club: null };
      const lock = lockedWorld(coach.challenge);
      const rule = challengeWorld(coach.challenge);
      if (lock) next = { ...next, world: lock };
      else if (rule && (!rule.countries.includes(next.world.countryId) || !rule.divisions.includes(next.world.divisionId))) next = { ...next, world: { countryId: 'BR', leagueId: 'brasileirao', divisionId: '' } };
    }
    return next;
  });
  const step = STEPS[index];
  const last = index === STEPS.length - 1;
  // Placeholders bloqueiam o Avançar; na escolha do clube ele só libera depois de selecionar um clube.
  // Na confirmação, o botão vira "Iniciar Jogo" e só libera com tudo preenchido.
  const canAdvance = step.implemented && (step.id !== 'club' || step.isValid(state)) && (step.id !== 'confirm' || isWizardComplete(state));
  const footNote = !step.implemented ? 'Em breve'
    : step.id === 'club' && !canAdvance ? 'Selecione um clube para continuar'
    : step.id === 'confirm' && !canAdvance ? 'Preencha todos os campos para iniciar'
    : step.id === 'confirm' && hasSave ? 'Já existe uma carreira salva: ela será substituída (faça um backup em Opções para guardá-la)' : '';

  // Ao chegar na confirmação, preenche a sugestão do nome do save (se o jogador ainda não editou).
  useEffect(() => {
    if (step.id === 'confirm') setState((s) => syncSaveName(s));
  }, [step.id]);

  const focusFirstError = () => {
    const e = validateCoach(state.coach);
    if (e.name) refs.name.current?.focus();
    else if (e.nationality) refs.nat.current?.focus();
    else if (e.challenge) refs.rep.current?.querySelector<HTMLInputElement>('input')?.focus();
  };

  const next = () => {
    if (!canAdvance) return;
    if (!step.isValid(state)) {
      if (step.id === 'coach') {
        setTouched({ name: true, nationality: true, challenge: true });
        focusFirstError();
      } else if (step.id === 'world') {
        setWorldAttempted(true);
        setWorldFocus((n) => n + 1);
      }
      return;
    }
    if (last && !isWizardComplete(state)) return;
    const clean: NewGameState = { ...state, coach: { ...state.coach, name: state.coach.name.trim() }, setup: { ...state.setup, saveName: state.setup.saveName.trim() } };
    setState(clean);
    if (last) {
      onStart(clean); // cria a carreira e abre o jogo
    } else setIndex(index + 1);
  };
  const back = () => (index === 0 ? onBack() : setIndex(index - 1));

  // O indicador de etapas permite voltar e também visitar etapas à frente, desde que as etapas já implementadas antes dela estejam válidas.
  const canJump = (i: number) => i <= index || STEPS.slice(0, i).every((s) => !s.implemented || s.isValid(state));

  return (
    <div className="menu nw">
      <Backdrop />
      <div className="nw-shell">
        <div className="nw-top">
          <div className="nw-kicker">Novo Jogo</div>
          <h1>Etapa {index + 1} de {STEPS.length} — {step.title}</h1>
          <ol className="nw-steps" aria-label="Etapas">
            {STEPS.map((s, i) => {
              const state_ = i === index ? 'current' : i < index ? 'done' : '';
              return (
                <li key={s.id} className={state_}>
                  <button type="button" disabled={!canJump(i)} aria-current={i === index ? 'step' : undefined} onClick={() => setIndex(i)}>
                    <span className="nw-dot">{i < index ? '✓' : i + 1}</span>
                    <span className="nw-steplabel">{s.title}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>

        <main className="nw-body">
          <section className="nw-card" aria-labelledby="nw-title">
            <h2 id="nw-title" className="nw-sr">{step.title}</h2>
            {step.id === 'coach' ? (
              <CoachStep coach={state.coach} onChange={changeCoach} touched={touched} setTouched={setTouched} refs={refs} />
            ) : step.id === 'world' ? (
              <WorldStep challenge={state.coach.challenge} world={state.world} onChange={(world) => setState(applyWorld(state, world))} attempted={worldAttempted} focusTick={worldFocus} />
            ) : step.id === 'club' ? (
              <ClubStep challenge={state.coach.challenge} world={state.world} selected={state.club} onSelect={(club) => setState({ ...state, club })} onViewSquad={(club, el) => { opener.current = el; setViewing(club); }} />
            ) : step.id === 'confirm' ? (
              <SetupStep state={state} onChange={(setup) => setState({ ...state, setup })} />
            ) : (
              <PlaceholderStep title={step.title} subtitle={step.subtitle} />
            )}
          </section>
        </main>

        <footer className="nw-foot">
          <button type="button" className="nw-btn" onClick={back}>Voltar</button>
          <div className="nw-foot-note" role="status">{footNote}</div>
          <button type="button" className="nw-btn go" onClick={next} disabled={!canAdvance}>{last ? 'Iniciar Jogo' : 'Avançar'}</button>
        </footer>
      </div>

      {viewing && (
        <SquadSheet
          club={viewing}
          chosen={state.club?.id === viewing.id}
          onChoose={() => { setState({ ...state, club: viewing }); setViewing(null); }}
          onClose={() => { setViewing(null); opener.current?.focus(); }}
        />
      )}
    </div>
  );
}
