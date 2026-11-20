import { STANCES, STANCE_LIST } from '../engine/match';
import type { Stance } from '../engine/types';

/** Escolha da postura do time (posse, contra-ataque, agressivo, cauteloso ou equilibrado), com a explicação do que muda no jogo. */
export function StancePicker({ value, onPick, title = 'Postura do time' }: { value: Stance; onPick: (s: Stance) => void; title?: string }) {
  const cur = STANCES[value];
  return (
    <section className="stance" aria-label={title}>
      <h3>{title}</h3>
      <div className="stance-grid" role="radiogroup" aria-label={title}>
        {STANCE_LIST.map((s) => (
          <button key={s} type="button" role="radio" aria-checked={value === s} className={value === s ? 'on' : ''} onClick={() => onPick(s)}>
            <span className="st-ico" aria-hidden="true">{STANCES[s].icon}</span><span>{STANCES[s].label}</span>
          </button>
        ))}
      </div>
      <p className="hint stance-desc" role="status">{cur.icon} {cur.desc}</p>
    </section>
  );
}
