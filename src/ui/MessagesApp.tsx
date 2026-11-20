import { useState } from 'react';
import { answerMessage, absRound, claimGoal, goalDone, goalProgress, GOAL_SPECS, inboxOf, TIER_LABEL_GOAL, type Goal } from '../engine/inbox';
import { smsOf } from '../engine/accounts';
import type { GameState } from '../engine/types';

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const ICON: Record<string, string> = { sponsor: '🤝', clubspons: '🏟️', press: '🎙️', board: '👔', fans: '📣', contract: '📝', tier: '📊' };

function GoalRow({ game, goal, onClaim }: { game: GameState; goal: Goal; onClaim: () => void }) {
  const done = goalDone(game, goal);
  const prog = Math.min(goal.target, goalProgress(game, goal));
  const left = goal.expires - absRound(game);
  return (
    <li className={`ms-goal ${goal.claimed ? 'claimed' : ''}`}>
      <span className="grow">
        <b>{goal.text}</b>
        <span className={`ms-tier ${GOAL_SPECS[goal.kind]?.tier ?? 'medio'}`}>{TIER_LABEL_GOAL[GOAL_SPECS[goal.kind]?.tier ?? 'medio']}</span>
        <small>{goal.claimed ? 'Resgatada' : goal.expired ? 'Expirou' : `${prog.toLocaleString('pt-BR')}/${goal.target.toLocaleString('pt-BR')} · ${left > 0 ? `${left} ${left === 1 ? 'rodada' : 'rodadas'} restantes` : 'último prazo'}`}</small>
        {!goal.claimed && !goal.expired && <span className="ms-bar"><i style={{ width: `${(prog / goal.target) * 100}%` }} /></span>}
      </span>
      {goal.claimed || goal.expired ? <small>{brl(goal.reward)}</small> : <button className={done ? 'primary' : 'btn'} disabled={!done} onClick={onClaim}>{done ? `Resgatar ${brl(goal.reward)}` : brl(goal.reward)}</button>}
    </li>
  );
}

/** Mensagens e metas: o que precisa de resposta no celular. */
export function MessagesApp({ game, onChange }: { game: GameState; onChange: (g: GameState) => void }) {
  const [tab, setTab] = useState<'msgs' | 'goals' | 'sms'>('msgs');
  const inbox = inboxOf(game);
  const open = inbox.msgs.filter((m) => m.status === 'open');
  const old = inbox.msgs.filter((m) => m.status !== 'open').slice(0, 12);
  const TIER_ORDER = { facil: 0, medio: 1, dificil: 2 } as const;
  const ratio = (x: Goal) => Math.min(1, goalProgress(game, x) / Math.max(1, x.target));
  const goals = inbox.goals.filter((x) => !x.expired && !x.claimed).sort((a, b) => Number(goalDone(game, b)) - Number(goalDone(game, a)) || TIER_ORDER[GOAL_SPECS[a.kind]?.tier ?? 'medio'] - TIER_ORDER[GOAL_SPECS[b.kind]?.tier ?? 'medio'] || ratio(b) - ratio(a));
  const todo = goals.filter((x) => !x.claimed && goalDone(game, x)).length;
  return (
    <div className="ph-app-screen ms">
      <h2>💬 Mensagens</h2>
      <div className="chips ap-chips" role="tablist">
        <button role="tab" aria-selected={tab === 'msgs'} className={tab === 'msgs' ? 'on' : ''} onClick={() => setTab('msgs')}>Mensagens{open.length > 0 ? ` (${open.length})` : ''}</button>
        <button role="tab" aria-selected={tab === 'sms'} className={tab === 'sms' ? 'on' : ''} onClick={() => setTab('sms')}>SMS{smsOf(game).length > 0 ? ` (${smsOf(game).length})` : ''}</button>
        <button role="tab" aria-selected={tab === 'goals'} className={tab === 'goals' ? 'on' : ''} onClick={() => setTab('goals')}>Metas{todo > 0 ? ` (${todo})` : ''}</button>
      </div>
      {tab === 'msgs' && (
        <>
          {open.length === 0 && <p className="ph-empty">Nenhuma mensagem esperando resposta. Novas chegam depois dos jogos.</p>}
          <ul className="ms-list">
            {open.map((m) => {
              const left = m.expires - absRound(game);
              return (
                <li key={m.id} className="ms-msg">
                  <div className="ms-head"><span aria-hidden="true">{ICON[m.kind]}</span><span className="grow"><b>{m.title}</b><small>{m.from}</small></span><em className={left <= 1 && m.kind !== 'contract' ? 'hot' : ''}>{m.kind === 'contract' ? 'Nesta temporada' : left <= 0 ? 'Último jogo' : `${left + 1} ${left + 1 === 1 ? 'jogo' : 'jogos'}`}</em></div>
                  <p style={{ whiteSpace: 'pre-line' }}>{m.body}</p>
                  <div className="ms-opts">
                    {m.options.map((o) => <button key={o.id} className="btn" onClick={() => onChange(answerMessage(game, m.id, o.id))}><b>{o.label}</b><small>{o.hint}</small></button>)}
                  </div>
                </li>
              );
            })}
          </ul>
          {old.length > 0 && (
            <>
              <h3>Anteriores</h3>
              <ul className="ms-list old">
                {old.map((m) => <li key={m.id} className="ms-msg"><div className="ms-head"><span aria-hidden="true">{ICON[m.kind]}</span><span className="grow"><b>{m.title}</b><small>{m.result}</small></span></div></li>)}
              </ul>
            </>
          )}
        </>
      )}
      {tab === 'sms' && (
        <>
          {smsOf(game).length === 0 && <p className="ph-empty">Nenhum SMS. Os códigos de confirmação dos apps chegam aqui, no número do seu chip.</p>}
          <ul className="ms-list">
            {smsOf(game).map((m) => <li key={m.id} className="ms-msg"><div className="ms-head"><span aria-hidden="true">💬</span><span className="grow"><b>{m.code ? `Código ${m.code}` : 'SMS'}</b><small>Temporada {m.season} · rodada {m.round}</small></span></div><p>{m.text}</p></li>)}
          </ul>
        </>
      )}
      {tab === 'goals' && (
        <>
          <p className="bk-sub">São sempre 30 metas, todas diferentes. Cumpra e resgate o prêmio aqui no celular: o dinheiro cai na sua conta pessoal. Cada vez que você cumpre uma, a próxima versão dela fica mais difícil.</p>
          <ul className="ms-list">{goals.map((x) => <GoalRow key={x.id} game={game} goal={x} onClaim={() => onChange(claimGoal(game, x.id))} />)}</ul>
        </>
      )}
    </div>
  );
}
