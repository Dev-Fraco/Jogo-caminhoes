import { useEffect, useRef, useState } from 'react';
import { MAX_TACTIC_CHANGES, attackBias, type Tactic } from '../engine/match';
import { autoLineup, spotOf } from '../engine/squad';
import { FORMATIONS, SPOT_SHORT, type FormationId, type Position, type TeamState } from '../engine/types';

const POS_LABEL: Record<Position, string> = { GK: 'Goleiro', DEF: 'Defensores', MID: 'Meias', ATT: 'Atacantes' };
const ORDER: Position[] = ['GK', 'DEF', 'MID', 'ATT'];
const hint = (f: FormationId) => { const b = attackBias(f); return b > 0.4 ? 'ataca mais' : b < -0.4 ? 'defende mais' : 'equilibrado'; };

/** Mudança de formação e de jogadores durante a partida. O resultado vale do minuto atual em diante. */
export function TacticsSheet({ team, minute, score, side, used, unavailable, onApply, onClose }: {
  team: TeamState; unavailable?: Set<string>; minute: number; score: [number, number]; side: 'home' | 'away'; used: number; onApply: (t: Tactic) => void; onClose: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [formation, setFormation] = useState<FormationId>(team.formation);
  const [lineup, setLineup] = useState<string[]>(team.lineup);
  const [pick, setPick] = useState<string | null>(null); // titular escolhido para sair
  useEffect(() => { box.current?.focus(); }, []);
  const byId = new Map(team.players.map((p) => [p.id, p]));
  const mine = side === 'home' ? score[0] - score[1] : score[1] - score[0];
  const changed = formation !== team.formation || lineup.some((id, i) => id !== team.lineup[i]) || lineup.length !== team.lineup.length;
  const left = MAX_TACTIC_CHANGES - used;
  const pickFormation = (f: FormationId) => { setFormation(f); setLineup(autoLineup(team.players, f, unavailable)); setPick(null); };
  const swapIn = (inId: string) => { if (!pick) return; setLineup(lineup.map((id) => (id === pick ? inId : id))); setPick(null); };
  const picked = pick ? byId.get(pick) : undefined;
  const bench = team.players.filter((p) => !lineup.includes(p.id) && !unavailable?.has(p.id)); // lesionado não entra
  const need = FORMATIONS[formation];
  const countOf = (pos: Position) => lineup.filter((id) => byId.get(id)?.pos === pos).length;
  const valid = countOf('GK') === 1 && countOf('DEF') === need.DEF && countOf('MID') === need.MID && countOf('ATT') === need.ATT;
  const tip = mine < 0 ? 'Você está perdendo: atacar mais costuma render gols.' : mine > 0 ? 'Você está ganhando: fechar o time ajuda a segurar o resultado.' : 'Empate: qualquer mudança é uma aposta.';

  return (
    <div className="ps-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ps ts" ref={box} role="dialog" aria-modal="true" aria-labelledby="ts-title" tabIndex={-1} onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}>
        <div className="ps-head"><div className="grow"><h2 id="ts-title">⚙️ Formação · {minute}'</h2><p>{tip}</p><p>Mudanças restantes: <b>{left}/{MAX_TACTIC_CHANGES}</b> · mexer toda hora desorganiza o time.</p></div><button className="ps-x" aria-label="Fechar" onClick={onClose}>✕</button></div>

        <div className="ts-forms" role="radiogroup" aria-label="Formação">
          {(Object.keys(FORMATIONS) as FormationId[]).map((f) => (
            <button key={f} role="radio" aria-checked={formation === f} className={formation === f ? 'on' : ''} onClick={() => pickFormation(f)}>{f}<small>{hint(f)}</small></button>
          ))}
        </div>

        {ORDER.map((pos) => (
          <section key={pos} className="ts-pos">
            <h3>{POS_LABEL[pos]}</h3>
            <ul>
              {lineup.map((id) => byId.get(id)!).filter((p) => p.pos === pos).map((p) => (
                <li key={p.id}><button className={pick === p.id ? 'on' : ''} aria-pressed={pick === p.id} onClick={() => setPick(pick === p.id ? null : p.id)}><b>{p.strength}</b> <em className="ts-spot">{SPOT_SHORT[spotOf(p)]}</em> {p.name}</button></li>
              ))}
            </ul>
            {picked && picked.pos === pos && (
              <div className="ts-bench" aria-label={`Reservas (${POS_LABEL[pos]})`}>
                <small>Tocar em um reserva para trocar com {picked.name}:</small>
                <ul>{bench.filter((p) => p.pos === pos).map((p) => <li key={p.id}><button onClick={() => swapIn(p.id)}><b>{p.strength}</b> <em className="ts-spot">{SPOT_SHORT[spotOf(p)]}</em> {p.name}</button></li>)}{bench.filter((p) => p.pos === pos).length === 0 && <li className="hint">Sem reservas nessa posição.</li>}</ul>
              </div>
            )}
          </section>
        ))}

        {!valid && <p className="un-warn">A escalação precisa ter 1 goleiro, {need.DEF} defensores, {need.MID} meias e {need.ATT} atacantes.</p>}
        <button className="primary" disabled={!changed || !valid || left <= 0 || minute >= 88} onClick={() => onApply({ minute, formation, lineup })}>✔ Aplicar mudança</button>
        <button className="btn ps-close" onClick={onClose}>Cancelar</button>
      </div>
    </div>
  );
}
