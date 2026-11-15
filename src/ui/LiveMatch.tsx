import { useEffect, useMemo, useRef, useState } from 'react';
import type { ClubInfo, FormationId, MatchEvent, MatchResult, TeamState } from '../engine/types';
import { TacticsSheet } from './TacticsSheet';
import type { Tactic } from '../engine/match';
import { PitchSim } from './PitchSim';
import { audio } from '../audio/audio';
import { ClubBadge } from './ClubBadge';
import { PenaltyShootout } from './PenaltyShootout';

export const SPEEDS = [1, 2, 4, 8] as const;
export type Speed = (typeof SPEEDS)[number];
/** Em 1x uma partida de 90 minutos dura 45 segundos (meio segundo por minuto de jogo). As outras velocidades dividem esse tempo. */
export const MS_PER_MINUTE_AT_1X = 500;
export const INTRO_MS = 3600;

const ICON: Record<MatchEvent['type'], string> = { kickoff: '⏱️', tactic: '🔄', injury: '🤕', goal: '⚽', yellow: '🟨', red: '🟥', foul: '🦵', save: '🧤', miss: '🎯', corner: '🚩', halftime: '⏸️', fulltime: '🏁' };

/** Placar [casa, fora] até o minuto indicado. */
export function scoreAt(events: MatchEvent[], minute: number): [number, number] {
  let s: [number, number] = [0, 0];
  for (const e of events) if (e.minute <= minute && e.score) s = e.score;
  return s;
}

interface Props {
  home: ClubInfo; away: ClubInfo; result: MatchResult; userSide: 'home' | 'away';
  divisionName: string; stadium: string; onFinish: () => void;
  /** Formações para desenhar os bonecos (padrão 4-4-2). */
  homeFormation?: FormationId; awayFormation?: FormationId;
  /** Seu time (com as mudanças já feitas) e como aplicar uma nova mudança tática. */
  userTeam?: TeamState; unavailable?: Set<string>; tacticsUsed?: number; onTactic?: (t: Tactic) => void;
}

/** Partida ao vivo: animação de entrada, relógio de 0 a 90 minutos, placar e narração dos lances com o nome dos jogadores. */
export function LiveMatch({ home, away, result, userSide, divisionName, stadium, onFinish, homeFormation = '4-4-2', awayFormation = '4-4-2', userTeam, unavailable, tacticsUsed = 0, onTactic }: Props) {
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const [phase, setPhase] = useState<'intro' | 'play' | 'pens' | 'done'>(reduce ? 'play' : 'intro');
  const [speed, setSpeed] = useState<Speed>(1);
  const [paused, setPaused] = useState(false);
  const [tactics, setTactics] = useState(false);
  const [minute, setMinute] = useState(0);
  const speedRef = useRef(speed); speedRef.current = speed;

  // animação de entrada
  useEffect(() => {
    if (phase !== 'intro') return;
    const t = window.setTimeout(() => setPhase('play'), INTRO_MS);
    return () => window.clearTimeout(t);
  }, [phase]);

  // relógio da partida
  useEffect(() => {
    if (phase !== 'play' || paused) return;
    let raf = 0, last = performance.now();
    const tick = (now: number) => {
      const dt = now - last; last = now;
      setMinute((m) => {
        const n = Math.min(90, m + (dt / MS_PER_MINUTE_AT_1X) * speedRef.current);
        if (n >= 90) setPhase(result.penKicks ? 'pens' : 'done');
        return n;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, paused]);

  // som: apito inicial/final e festa a cada gol
  const goalsSeen = useRef(0);
  useEffect(() => { if (phase === 'play') audio.sfx('whistle'); if (phase === 'done') audio.sfx('whistle'); }, [phase]);
  // torcida durante a partida; a música baixa
  useEffect(() => { audio.duck(true); audio.crowd(true); return () => { audio.crowd(false); audio.duck(false); }; }, []);
  const shown = useMemo(() => result.events.filter((e) => e.minute <= Math.floor(minute)), [result.events, minute]);
  const [hg, ag] = scoreAt(result.events, Math.floor(minute));
  const goalCount = shown.filter((e) => e.type === 'goal').length;
  useEffect(() => {
    if (goalCount > goalsSeen.current) { const last = shown.filter((e) => e.type === 'goal').pop(); audio.sfx(last && last.side !== userSide ? 'concede' : 'goal'); } // gol seu: festa; gol sofrido: vaia
    goalsSeen.current = goalCount;
  }, [goalCount]); // eslint-disable-line react-hooks/exhaustive-deps
  // cantos da torcida (ligados por padrão; o botão 🎺 desliga)
  const [chants, setChants] = useState(() => { try { return localStorage.getItem('vr-chants') !== '0'; } catch { return true; } });
  useEffect(() => { audio.chants(chants && phase === 'play' && !paused); return () => audio.chants(false); }, [chants, phase, paused]);
  const toggleChants = () => { const n = !chants; setChants(n); try { localStorage.setItem('vr-chants', n ? '1' : '0'); } catch { /* sem armazenamento */ } };
  const goals = result.events.filter((e) => e.type === 'goal');
  const skip = () => { setMinute(90); setPhase(result.penKicks ? 'pens' : 'done'); };
  const feed = [...shown].reverse();
  const mine = (e: MatchEvent) => e.side === userSide;

  if (phase === 'intro') {
    return (
      <div className="lm-intro" role="status" aria-label={`${home.name} contra ${away.name}`}>
        <small>{divisionName} · Rodada {result.round}</small>
        <div className="lm-vs">
          <div className="lm-team l"><ClubBadge club={home} size={88} /><strong>{home.name}</strong></div>
          <span className="lm-x">X</span>
          <div className="lm-team r"><ClubBadge club={away} size={88} /><strong>{away.name}</strong></div>
        </div>
        <p className="lm-stadium">🏟️ {stadium}</p>
        <p className="lm-count" aria-hidden="true"><span>3</span><span>2</span><span>1</span><span>Bola rolando!</span></p>
        <button className="btn lm-skipintro" onClick={() => setPhase('play')}>Pular apresentação</button>
      </div>
    );
  }

  return (
    <div className="lm">
      <div className="lm-board">
        <div className="lm-side"><ClubBadge club={home} size={44} /><strong>{home.name}</strong></div>
        <div className="lm-score" aria-live="off"><b>{hg}</b><span>x</span><b>{ag}</b></div>
        <div className="lm-side r"><ClubBadge club={away} size={44} /><strong>{away.name}</strong></div>
      </div>

      <div className="lm-clock">
        <span className="lm-min" aria-label={`Minuto ${Math.floor(minute)}`}>{phase === 'play' ? Math.floor(minute) : 90}'</span>
        <div className="lm-track" role="progressbar" aria-valuemin={0} aria-valuemax={90} aria-valuenow={Math.floor(minute)} aria-label="Tempo de jogo">
          <i style={{ width: `${(minute / 90) * 100}%` }} />
          <b className="lm-half" style={{ left: '50%' }} />
          {goals.filter((g) => g.minute <= Math.floor(minute)).map((g, i) => <em key={i} className={g.side === userSide ? 'me' : 'op'} style={{ left: `${(g.minute / 90) * 100}%` }} title={`${g.minute}' ${g.player}`}>⚽</em>)}
        </div>
      </div>

      {tactics && userTeam && onTactic && <TacticsSheet team={userTeam} unavailable={unavailable} minute={Math.floor(minute)} score={[hg, ag]} side={userSide} used={tacticsUsed} onClose={() => { setTactics(false); setPaused(false); }} onApply={(t) => { onTactic(t); setTactics(false); setPaused(false); }} />}
      {phase !== 'pens' && <PitchSim home={home} away={away} homeFormation={homeFormation} awayFormation={awayFormation} events={result.events} minute={phase === 'play' ? minute : 90} speed={speed} userSide={userSide} />}

      {phase === 'pens' && result.penKicks ? (
        <PenaltyShootout home={home} away={away} kicks={result.penKicks} userSide={userSide} onDone={() => setPhase('done')} />
      ) : phase === 'play' ? (
        <div className="lm-ctrl">
          <div className="lm-speeds" role="group" aria-label="Velocidade do tempo">
            {SPEEDS.map((s) => <button key={s} className={speed === s ? 'on' : ''} aria-pressed={speed === s} onClick={() => setSpeed(s)}>{s}x</button>)}
          </div>
          <button className="btn lm-pause" onClick={() => setPaused((p) => !p)} aria-pressed={paused}>{paused ? '▶ Continuar' : '⏸ Pausar'}</button>
          {userTeam && onTactic && <button className="btn lm-pause lm-tac" onClick={() => { setPaused(true); setTactics(true); }}>⚙️ Formação</button>}
          <button className="btn lm-pause" onClick={toggleChants} aria-pressed={chants} aria-label="Cantos da torcida">{chants ? '🎺 Cantos: sim' : '🎺 Cantos: não'}</button>
          <button className="btn lm-pause" onClick={skip}>⏭ Pular</button>
        </div>
      ) : (
        <div className="lm-final">
          <p>Fim de jogo! <b>{home.name} {result.homeGoals} x {result.awayGoals} {away.name}</b>{result.pens && <> · pênaltis {result.pens[0]} x {result.pens[1]}</>}</p>
          <button className="primary" onClick={onFinish}>Continuar</button>
        </div>
      )}

      <ol className="lm-feed" aria-label="Narração da partida" tabIndex={0}>
        {feed.length === 0 && <li className="lm-empty">Aguardando o apito inicial…</li>}
        {feed.map((e, i) => (
          <li key={`${e.minute}-${i}-${e.type}-${e.text}`} className={`${e.type} ${e.type === 'goal' ? (mine(e) ? 'me' : 'op') : ''}`}>
            <span className="lm-m">{e.minute}'</span><span className="lm-i" aria-hidden="true">{ICON[e.type]}</span><span className="lm-t">{e.text}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
