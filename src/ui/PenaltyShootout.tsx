import { useEffect, useMemo, useState } from 'react';
import { audio } from '../audio/audio';
import type { ClubInfo, PenKick } from '../engine/types';
import { ClubBadge } from './ClubBadge';

type Spot = 'tl' | 'tr' | 'bl' | 'br' | 'c';
const SPOTS: Spot[] = ['tl', 'tr', 'bl', 'br', 'c'];
const TARGET: Record<string, [number, number]> = { tl: [14, 18], tr: [86, 18], bl: [14, 74], br: [86, 74], c: [50, 46], 'wide-l': [-8, 40], 'wide-r': [108, 40], over: [50, -34] };
const hash = (s: string) => { let h = 7; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };

interface Step { side: 'home' | 'away'; kick: PenKick; n: number; spot: string; outcome: 'goal' | 'saved' | 'wide'; dive: 'l' | 'r' | 'c' }

/** Monta a ordem das cobranças (casa, fora, casa, fora...) com o destino de cada bola e o salto do goleiro. */
function buildSteps(home: PenKick[], away: PenKick[]): Step[] {
  const steps: Step[] = [];
  const total = Math.max(home.length, away.length);
  for (let i = 0; i < total; i++) {
    for (const side of ['home', 'away'] as const) {
      const kick = (side === 'home' ? home : away)[i];
      if (!kick) continue;
      const h = hash(`${side}${i}${kick.name}`);
      let spot: string = SPOTS[h % SPOTS.length];
      let outcome: Step['outcome'] = 'goal';
      if (!kick.scored) { outcome = h % 5 < 3 ? 'saved' : 'wide'; if (outcome === 'wide') spot = ['wide-l', 'wide-r', 'over'][h % 3]; }
      const side_ = spot.endsWith('l') || spot === 'tl' || spot === 'bl' ? 'l' : spot === 'c' ? 'c' : 'r';
      // goleiro: defende indo no canto; no gol vai para o lado errado (ou fica no meio)
      const dive: Step['dive'] = outcome === 'saved' ? side_ : outcome === 'goal' ? (side_ === 'l' ? 'r' : side_ === 'r' ? 'l' : (h % 2 ? 'l' : 'r')) : (h % 2 ? 'l' : 'r');
      steps.push({ side, kick, n: i + 1, spot, outcome, dive });
    }
  }
  return steps;
}

const PREP = 1300, FLIGHT = 800, RESULT = 1100;

/** Disputa de pênaltis animada: o batedor se prepara, a bola vai para um canto, o goleiro pula e aparece se foi gol, defesa ou pra fora. */
export function PenaltyShootout({ home, away, kicks, userSide, onDone }: { home: ClubInfo; away: ClubInfo; kicks: { home: PenKick[]; away: PenKick[] }; userSide: 'home' | 'away'; onDone: () => void }) {
  const steps = useMemo(() => buildSteps(kicks.home, kicks.away), [kicks]);
  const [i, setI] = useState(0);
  const [stage, setStage] = useState<'prep' | 'kick' | 'result'>('prep');
  const [fast, setFast] = useState(false);
  const [done, setDone] = useState(false);
  const mult = fast ? 0.45 : 1;
  const cur = steps[Math.min(i, steps.length - 1)];

  useEffect(() => {
    if (done) return;
    const ms = (stage === 'prep' ? PREP : stage === 'kick' ? FLIGHT : RESULT) * mult;
    const t = window.setTimeout(() => {
      if (stage === 'prep') setStage('kick');
      else if (stage === 'kick') {
        setStage('result');
        audio.sfx(cur.outcome === 'goal' ? 'goal' : 'error');
      } else if (i + 1 >= steps.length) setDone(true);
      else { setI(i + 1); setStage('prep'); }
    }, ms);
    return () => window.clearTimeout(t);
  }, [stage, i, done, steps.length, mult, cur.outcome]);

  // marcadores até a cobrança atual (a atual só conta depois do resultado)
  const upto = (side: 'home' | 'away') => steps.filter((s, idx) => s.side === side && (idx < i || done || (idx === i && stage === 'result')));
  const score = (side: 'home' | 'away') => upto(side).filter((s) => s.kick.scored).length;
  const [tx, ty] = TARGET[cur.spot];
  const flying = stage !== 'prep';
  const club = cur.side === 'home' ? home : away;
  const mine = cur.side === userSide;
  const marks = (side: 'home' | 'away') => {
    const list = side === 'home' ? kicks.home : kicks.away;
    const n = Math.max(5, list.length);
    const done_ = upto(side);
    return Array.from({ length: n }, (_, k) => { const s = done_[k]; return s ? (s.kick.scored ? 'ok' : 'no') : 'wait'; });
  };

  return (
    <div className="pk" role="region" aria-label="Disputa de pênaltis">
      <h3 className="pk-title">⚽ Disputa de pênaltis</h3>
      <div className="pk-score"><span><ClubBadge club={home} size={28} /> {score('home')}</span><i>x</i><span>{score('away')} <ClubBadge club={away} size={28} /></span></div>
      <div className="pk-marks" aria-hidden="true">
        {(['home', 'away'] as const).map((side) => <div key={side}>{marks(side).map((m, k) => <b key={k} className={m}>{m === 'ok' ? '●' : m === 'no' ? '✕' : '○'}</b>)}</div>)}
      </div>

      <div className="pk-field" aria-live="polite">
        <div className="pk-goal">
          <div className="pk-net" />
          <div className={`pk-keeper ${flying ? `dive-${cur.dive}` : ''}`} aria-hidden="true"><i /><b /></div>
          <div className="pk-ball" aria-hidden="true" style={{ left: flying ? `${tx}%` : '50%', top: flying ? `${ty}%` : '210%', transform: `translate(-50%, -50%) scale(${flying ? 0.62 : 1.5})`, transitionDuration: `${FLIGHT * mult}ms` }}>⚽</div>
        </div>
        <div className={`pk-shooter ${stage}`} aria-hidden="true"><span style={{ background: club.primaryColor, borderColor: club.secondaryColor }} /></div>
      </div>

      <p className={`pk-say ${stage === 'result' ? cur.outcome : ''} ${mine ? 'me' : 'op'}`} role="status">
        {stage === 'prep' && <><b>{cur.kick.name || 'O batedor'}</b> ({club.shortName}) se prepara para bater…</>}
        {stage === 'kick' && <><b>{cur.kick.name || 'O batedor'}</b> corre para a bola…</>}
        {stage === 'result' && (cur.outcome === 'goal' ? <>GOOOL! {cur.kick.name && <small>{cur.kick.name} converte!</small>}</> : cur.outcome === 'saved' ? <>DEFENDEU! <small>O goleiro pegou a cobrança de {cur.kick.name}.</small></> : <>PRA FORA! <small>{cur.kick.name} isolou a bola.</small></>)}
      </p>

      <div className="pk-ctrl">
        {!done && <button className="btn" onClick={() => setFast(!fast)} aria-pressed={fast}>{fast ? '⏩ Rápido' : '▶ Normal'}</button>}
        {!done && <button className="btn" onClick={() => setDone(true)}>⏭ Pular</button>}
        {done && <p className="pk-end"><b>{score('home') > score('away') ? home.name : away.name}</b> vence nos pênaltis por {Math.max(score('home'), score('away'))} a {Math.min(score('home'), score('away'))}.</p>}
        {done && <button className="primary" onClick={onDone}>Continuar</button>}
      </div>
    </div>
  );
}
