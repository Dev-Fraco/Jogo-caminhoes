import { useMemo } from 'react';
import type { ClubInfo, FormationId, MatchEvent } from '../engine/types';
import { kitColors, PITCH_H, PITCH_W, playState, positionsOf } from './pitch';

/**
 * Campo visto de cima com os 22 bonecos: eles se movem conforme os lances da narração (ataques, defesas, escanteios, gols).
 * É só visual; o resultado da partida já está decidido pelo motor.
 */
export function PitchSim({ home, away, homeFormation, awayFormation, events, minute, speed, userSide }: {
  home: ClubInfo; away: ClubInfo; homeFormation: FormationId; awayFormation: FormationId; events: MatchEvent[]; minute: number; speed: number; userSide: 'home' | 'away';
}) {
  const tick = Math.floor(minute * 2); // a cada meio minuto de jogo os bonecos se reposicionam
  const st = useMemo(() => playState(events, Math.floor(minute), tick), [events, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const hp = useMemo(() => positionsOf('home', homeFormation, st, tick), [homeFormation, st, tick]);
  const ap = useMemo(() => positionsOf('away', awayFormation, st, tick), [awayFormation, st, tick]);
  const [hc, ac] = kitColors(home, away);
  const dur = Math.max(0.12, Math.min(0.45, 0.45 / speed));
  const move = { transition: `transform ${dur}s ease-out` } as const;
  const fig = (p: { x: number; y: number }, color: string, key: string, gk: boolean, mine: boolean) => (
    <g key={key} style={{ ...move, transform: `translate(${p.x}px, ${p.y}px)` }}>
      <ellipse cx="0" cy="1.6" rx="1.7" ry="0.7" fill="#000" opacity=".25" />
      <path d="M-1.5 1.3 L-0.7 -0.6 L0.7 -0.6 L1.5 1.3 Z" fill={gk ? '#ffd23f' : color} stroke="#0008" strokeWidth=".15" />
      <circle cx="0" cy="-1.6" r="0.95" fill="#f0c9a0" stroke="#0008" strokeWidth=".15" />
      <path d="M-0.95 -1.8 A0.95 0.95 0 0 1 0.95 -1.8 Z" fill={gk ? '#a07800' : '#0006'} />
      {mine && <circle cx="0" cy="0" r="2.4" fill="none" stroke="#fff" strokeWidth=".18" opacity=".7" />}
    </g>
  );
  return (
    <div className="pitch" aria-hidden="true">
      <svg viewBox={`0 0 ${PITCH_W} ${PITCH_H}`} preserveAspectRatio="xMidYMid meet">
        <defs><pattern id="grass" width="10" height={PITCH_H} patternUnits="userSpaceOnUse"><rect width="5" height={PITCH_H} fill="#1f7a3a" /><rect x="5" width="5" height={PITCH_H} fill="#238a41" /></pattern></defs>
        <rect width={PITCH_W} height={PITCH_H} fill="url(#grass)" />
        <g fill="none" stroke="#fff" strokeOpacity=".75" strokeWidth=".35">
          <rect x="1" y="1" width={PITCH_W - 2} height={PITCH_H - 2} />
          <line x1="50" y1="1" x2="50" y2={PITCH_H - 1} /><circle cx="50" cy="32" r="7" />
          <rect x="1" y="17" width="12" height="30" /><rect x="1" y="24.5" width="4.5" height="15" />
          <rect x={PITCH_W - 13} y="17" width="12" height="30" /><rect x={PITCH_W - 5.5} y="24.5" width="4.5" height="15" />
        </g>
        <rect x="-1" y="27" width="2" height="10" fill="#fff" opacity=".6" /><rect x={PITCH_W - 1} y="27" width="2" height="10" fill="#fff" opacity=".6" />
        {hp.map((p, i) => fig(p, hc, `h${i}`, i === 0, userSide === 'home' && st.possession === 'home' && i === st.carrier))}
        {ap.map((p, i) => fig(p, ac, `a${i}`, i === 0, userSide === 'away' && st.possession === 'away' && i === st.carrier))}
        <g style={{ ...move, transform: `translate(${st.ball.x}px, ${st.ball.y}px)` }}>
          <ellipse cx="0" cy="0.9" rx="0.9" ry="0.4" fill="#000" opacity=".3" /><circle cx="0" cy="0" r="0.95" fill="#fff" stroke="#111" strokeWidth=".2" />
        </g>
        {st.goalNow && <text x="50" y="34" textAnchor="middle" fontSize="9" fontWeight="800" fill="#fff" stroke="#000" strokeWidth=".4" className="pitch-goal">GOOOL!</text>}
      </svg>
    </div>
  );
}
