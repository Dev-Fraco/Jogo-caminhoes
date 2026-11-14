import { useRef, useState, type CSSProperties } from 'react';
import { applyWorld, createNewGameState, NAME_MAX, NATIONALITIES, REPUTATIONS, STEPS, validateCoach, type CoachProfile, type NewGameState } from '../newgame/state';
import { Backdrop } from './Backdrop';
import { ClubStep } from './ClubStep';
import { WorldStep } from './WorldStep';
import { WALLPAPER_URL } from './MainMenu';
import './newgame.css';

type Touched = { name?: boolean; nationality?: boolean; reputation?: boolean };

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
        <legend>Reputação inicial</legend>
        <div className="nw-rep" role="radiogroup" aria-label="Reputação inicial" ref={refs.rep}>
          {REPUTATIONS.map((r) => (
            <label key={r.id} className="nw-rep-card">
              <input
                type="radio" name="nw-rep" value={r.id} checked={coach.reputation === r.id}
                onChange={() => { onChange({ ...coach, reputation: r.id }); touch('reputation'); }}
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
        <div id="nw-rep-msg" className="nw-msg">{err('reputation') && <span className="nw-error" role="alert">{err('reputation')}</span>}</div>
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

export function NewGame({ onBack }: { onBack: () => void }) {
  // Estado do assistente: guarda tudo que for preenchido e é preservado ao navegar entre etapas.
  const [state, setState] = useState<NewGameState>(createNewGameState);
  const [index, setIndex] = useState(0);
  const [touched, setTouched] = useState<Touched>({});
  const [worldAttempted, setWorldAttempted] = useState(false);
  const [worldFocus, setWorldFocus] = useState(0);
  const refs = { name: useRef<HTMLInputElement>(null), nat: useRef<HTMLSelectElement>(null), rep: useRef<HTMLDivElement>(null) };

  const step = STEPS[index];
  const last = index === STEPS.length - 1;
  // Placeholders bloqueiam o Avançar; na escolha do clube ele só libera depois de selecionar um clube.
  const canAdvance = step.implemented && (step.id !== 'club' || step.isValid(state));
  const footNote = !step.implemented ? 'Em breve' : step.id === 'club' && !canAdvance ? 'Selecione um clube para continuar' : '';

  const focusFirstError = () => {
    const e = validateCoach(state.coach);
    if (e.name) refs.name.current?.focus();
    else if (e.nationality) refs.nat.current?.focus();
    else if (e.reputation) refs.rep.current?.querySelector<HTMLInputElement>('input')?.focus();
  };

  const next = () => {
    if (!canAdvance) return;
    if (!step.isValid(state)) {
      if (step.id === 'coach') {
        setTouched({ name: true, nationality: true, reputation: true });
        focusFirstError();
      } else if (step.id === 'world') {
        setWorldAttempted(true);
        setWorldFocus((n) => n + 1);
      }
      return;
    }
    const clean: NewGameState = { ...state, coach: { ...state.coach, name: state.coach.name.trim() } };
    setState(clean);
    if (last) console.log('[Novo Jogo] estado do assistente', clean); // por enquanto só registra
    else setIndex(index + 1);
  };
  const back = () => (index === 0 ? onBack() : setIndex(index - 1));

  // O indicador de etapas permite voltar e também visitar etapas à frente, desde que as etapas já implementadas antes dela estejam válidas.
  const canJump = (i: number) => i <= index || STEPS.slice(0, i).every((s) => !s.implemented || s.isValid(state));

  return (
    <div className="menu nw" style={{ '--menu-wallpaper': `url(${WALLPAPER_URL})` } as CSSProperties}>
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
              <CoachStep coach={state.coach} onChange={(coach) => setState({ ...state, coach })} touched={touched} setTouched={setTouched} refs={refs} />
            ) : step.id === 'world' ? (
              <WorldStep world={state.world} onChange={(world) => setState(applyWorld(state, world))} attempted={worldAttempted} focusTick={worldFocus} />
            ) : step.id === 'club' ? (
              <ClubStep world={state.world} selected={state.club} onSelect={(club) => setState({ ...state, club })} />
            ) : (
              <PlaceholderStep title={step.title} subtitle={step.subtitle} />
            )}
          </section>
        </main>

        <footer className="nw-foot">
          <button type="button" className="nw-btn" onClick={back}>Voltar</button>
          <div className="nw-foot-note" role="status">{footNote}</div>
          <button type="button" className="nw-btn go" onClick={next} disabled={!canAdvance}>Avançar</button>
        </footer>
      </div>
    </div>
  );
}
