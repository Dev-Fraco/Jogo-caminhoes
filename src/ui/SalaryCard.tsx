import { useState } from 'react';
import { audio } from '../audio/audio';
import { coachSalary } from '../engine/finance';
import { chanceLabel, defendSalary, negotiateRaise, raiseChance, RAISE_STEPS, salaryNegotiated, standingOf, STANDING_LABEL } from '../engine/salary';
import type { GameState } from '../engine/types';
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

/** Fim da temporada: negociar o salário com o clube (aumento se foi bem, risco de corte se foi rebaixado). */
export function SalaryCard({ game, onChange }: { game: GameState; onChange: (g: GameState) => void }) {
  const standing = standingOf(game);
  const steps = RAISE_STEPS[standing];
  const [pct, setPct] = useState(steps[Math.min(1, steps.length - 1)] ?? 0);
  const done = salaryNegotiated(game);
  const [msg, setMsg] = useState<string | null>(null);
  const monthly = coachSalary(game) / 12;
  const chance = steps.length ? raiseChance(game, pct) : 0;

  const ask = () => {
    const r = negotiateRaise(game, pct);
    if (!r.ok) { setMsg(r.error); audio.sfx('error'); return; }
    setMsg(r.text); onChange(r.state); audio.sfx(r.pct > 0 ? 'cash' : 'error');
  };
  const defend = () => {
    const r = defendSalary(game);
    if (!r.ok) { setMsg(r.error); audio.sfx('error'); return; }
    setMsg(r.text); onChange(r.state); audio.sfx(r.result === 'accepted' ? 'cash' : 'error');
  };

  return (
    <section className="card salary-card">
      <h3>💼 Negociar o salário</h3>
      <div className="row"><span className="grow">Seu salário agora</span><b>{brl(monthly)}/mês</b></div>
      <p className={`hint standing-${standing}`}>{STANDING_LABEL[standing]}</p>
      {done ? (
        <p className="hint" role="status">✔ {game.salaryNeg?.text ?? 'Negociação feita nesta temporada.'}</p>
      ) : standing === 'bad' ? (
        <>
          <p className="hint">Se você não fizer nada, há 55% de chance de cortarem de 10% a 20% do seu salário. Tentar manter dá 50% de chance de livrar o corte (se falhar, ele vem na certa).</p>
          <button className="btn" onClick={defend}>🤝 Tentar manter o salário</button>
        </>
      ) : (
        <>
          <div className="chips" role="radiogroup" aria-label="Aumento pedido">
            {steps.map((s) => <button key={s} role="radio" aria-checked={pct === s} className={pct === s ? 'on' : ''} onClick={() => setPct(s)}>+{s}%</button>)}
          </div>
          <p className="hint">Novo salário se aceitarem: <b>{brl(monthly * (1 + pct / 100))}/mês</b> · chance: <b>{chanceLabel(chance)}</b> ({Math.round(chance * 100)}%). Pedir demais pode ser recusado e irritar a diretoria. Só dá para negociar uma vez por temporada.</p>
          <button className="primary" onClick={ask}>Pedir aumento de {pct}%</button>
        </>
      )}
      {msg && !done && <p className="hint" role="status">{msg}</p>}
    </section>
  );
}
