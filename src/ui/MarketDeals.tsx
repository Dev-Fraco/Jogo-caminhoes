import { premiumChunk } from '../premium/loader';
import { lazy, Suspense, useState } from 'react';
import { agentOf } from '../engine/aimarket';
import { calOf, formatDay } from '../engine/calendar';
import { locate } from '../engine/dealeval';
import { dealsForUser, dealsWaitingUser } from '../engine/deals';
import { FREE_AGENT_MAX } from '../engine/freeagents';
import { answerRequest, freeLimitOf, freeList, myLoanDeals, myRequests, officialList, proposeBuy, proposeFree, proposeLoan, userAccept, userCancel, userCounter, userRefuse, valueOf, wageAsk } from '../engine/marketdeals';
import { exerciseBuyOption, loanReport } from '../engine/loandeals';
import { contractAlerts, renewOffer } from '../engine/contractwatch';
import { spotOf } from '../engine/squad';
import { SPOT_SHORT, type Deal, type DealClause, type DealState, type GameState, type Player } from '../engine/types';
import { transferBlock, windowInfo, windowLabel } from '../engine/windows';
import { formatBudget } from '../newgame/format';
import { ClubBadge } from './ClubBadge';
import { hooks, openForeignSales } from '../engine/hooks';
const ForeignSalesSection = lazy(() => premiumChunk(() => import('../premium/ui/ForeignSales'))().then((m) => ({ default: m.ForeignSalesSection }))); // (recurso Premium, carregado sob demanda)

const STATE_LABEL: Record<DealState, string> = {
  enviada: 'Enviada', recebida: 'Recebida', 'em-analise': 'Em análise', contraproposta: 'Contraproposta', aguardando: 'Aguardando resposta',
  'aceita-clube': 'Aceita pelo clube', 'aceita-jogador': 'Aceita pelo jogador', recusada: 'Recusada', expirada: 'Expirada', cancelada: 'Cancelada', concluida: 'Concluída',
};
const KIND_LABEL = { compra: 'Compra', troca: 'Troca', emprestimo: 'Empréstimo', livre: 'Jogador livre' } as const;
const tier = (n: number) => (n >= 75 ? 'hi' : n >= 62 ? 'mid' : 'lo');
const nameOf = (g: GameState, id: string) => g.clubs[id]?.name ?? id;

/** Situação da janela de transferências (aberta/fechada, dias restantes). */
export function WindowBanner({ game }: { game: GameState }) {
  const i = windowInfo(game);
  return (
    <div className="card" role="status">
      <p style={{ margin: 0 }}>{i.open ? '🔓' : '🔒'} <b>{windowLabel(game)}</b></p>
      {!i.open && <p className="hint" style={{ margin: '6px 0 0' }}>Com o mercado fechado só dá para contratar jogadores livres. Propostas e empréstimos voltam quando a janela abrir.</p>}
    </div>
  );
}

/* ---------- formulário de proposta / contraproposta ---------- */

interface SheetProps { game: GameState; playerId: string; mode: 'compra' | 'emprestimo' | 'livre'; deal?: Deal; onChange: (g: GameState) => void; onClose: () => void; onDone: (text: string, error?: boolean) => void }

/** Proposta oficial: valor, pagamento (à vista ou parcelado), troca, cláusulas e, no empréstimo, divisão salarial e opção de compra. */
export function ProposalSheet({ game, playerId, mode, deal, onChange, onClose, onDone }: SheetProps) {
  const l = locate(game, playerId);
  const mine = game.teams[game.userClubId].players;
  const base = deal?.terms;
  const [fee, setFee] = useState(Math.round((base?.fee ?? valueOf(game, playerId)) / 10_000) * 10_000);
  const [parts, setParts] = useState(base?.installments?.length ?? 1);
  const [swap, setSwap] = useState<string[]>(base?.swapPlayerIds ?? []);
  const [resale, setResale] = useState(Math.round((base?.clauses?.find((c) => c.type === 'revenda')?.pct ?? 0) * 100));
  const [bonusAmt, setBonusAmt] = useState(base?.clauses?.find((c) => c.type === 'bonus-jogos')?.amount ?? 0);
  const [bonusGames, setBonusGames] = useState(base?.clauses?.find((c) => c.type === 'bonus-jogos')?.threshold ?? 20);
  const [wage, setWage] = useState(base?.wage ?? (l ? wageAsk(game, l.player) : 0));
  const [years, setYears] = useState(base?.years ?? 3);
  const [split, setSplit] = useState(Math.round((base?.loan?.originWagePct ?? 0) * 100));
  const [option, setOption] = useState(base?.loan?.buyOption ?? 0);
  const [oblig, setOblig] = useState(base?.loan?.buyObligation ?? 0);
  const [obGames, setObGames] = useState(base?.loan?.obligationGames ?? 15);
  if (!l) return null;
  const p = l.player;
  const clubName = l.clubId ? nameOf(game, l.clubId) : 'Sem clube';
  const clauses: DealClause[] = [...(resale > 0 ? [{ type: 'revenda' as const, pct: resale / 100, base: 'lucro' as const }] : []), ...(bonusAmt > 0 ? [{ type: 'bonus-jogos' as const, amount: bonusAmt, threshold: bonusGames }] : [])];

  const send = () => {
    if (deal) {
      const iSell = deal.sellerId === game.userClubId;
      const cnt = userCounter(game, deal.id, { fee, installments: parts > 1 ? instOf(fee, parts, calOf(game).day) : undefined, ...(iSell ? {} : { swapPlayerIds: swap.length ? swap : undefined, clauses: clauses.length ? clauses : undefined }) });
      if (cnt.error) { onDone(cnt.error, true); return; }
      onChange(cnt.state); onDone('Contraproposta enviada. A resposta chega no próximo dia.'); return;
    }
    const r = mode === 'livre' ? proposeFree(game, playerId, { wage, years })
      : mode === 'emprestimo' ? proposeLoan(game, playerId, { fee, originWagePct: split / 100, buyOption: option || undefined, buyObligation: oblig || undefined, obligationGames: oblig ? obGames : undefined })
      : proposeBuy(game, playerId, { fee, installments: parts, swapIds: swap, clauses, wage: wage || undefined, years });
    if (r.error) { onDone(r.error, true); return; }
    onChange(r.state);
    const concluded = r.state.dealLog?.[0]?.playerId === playerId && r.state.dealLog[0].state === 'concluida';
    onDone(concluded ? `✔ ${p.name} é o novo reforço do clube.` : `Proposta enviada ao ${clubName}. Acompanhe em Propostas › Negociações.`);
  };

  const num = (v: string) => Math.max(0, Number(v.replace(/[^\d]/g, '')) || 0);
  return (
    <div className="ps-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ps ng" role="dialog" aria-modal="true" aria-label="Proposta" tabIndex={-1} onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}>
        <div className="ps-head">
          <span className="ps-ovr">{p.strength}</span>
          <div className="grow"><h2>{p.name}</h2><p>{SPOT_SHORT[spotOf(p)]} · {p.age} anos · {clubName}</p><p>Valor de mercado: <b>{formatBudget(valueOf(game, playerId))}</b>{l.clubId ? '' : ` · agente ${agentOf(p.id).name}`}</p></div>
          <button className="ps-x" aria-label="Fechar" onClick={onClose}>✕</button>
        </div>
        <p className="ng-budget">Orçamento do clube: <b>{formatBudget(game.budgets[game.userClubId])}</b>{deal ? ` · contraproposta nº ${deal.round + 1}` : ''}</p>
        {mode !== 'livre' && (
          <fieldset className="ng-box">
            <legend>💰 {mode === 'emprestimo' ? 'Taxa do empréstimo' : 'Valor da transferência'}</legend>
            <div className="ng-input"><input inputMode="numeric" aria-label="Valor em reais" value={fee.toLocaleString('pt-BR')} onChange={(e) => setFee(num(e.target.value))} /><span>R$</span></div>
            {mode === 'compra' && (<>
              <label className="tf-check">Pagamento{' '}
                <select aria-label="Parcelas" value={parts} onChange={(e) => setParts(Number(e.target.value))}>
                  <option value={1}>À vista</option><option value={2}>2 parcelas</option><option value={3}>3 parcelas</option><option value={4}>4 parcelas</option>
                </select></label>
              {parts > 1 && <p className="hint" style={{ margin: '4px 0' }}>Entrada de 40% agora e o restante a cada 90 dias. Soma: {formatBudget(fee)}.</p>}
              {!(deal && deal.sellerId === game.userClubId) && <label className="tf-check">Troca: jogadores seus oferecidos (o valor acima é o dinheiro além deles)</label>}
              {!(deal && deal.sellerId === game.userClubId) && <div className="chips" role="group" aria-label="Jogadores na troca" style={{ flexWrap: 'wrap' }}>
                {mine.filter((x) => !game.loans.some((y) => y.playerId === x.id)).slice(0, 40).map((x) => <button key={x.id} className={swap.includes(x.id) ? 'on' : ''} aria-pressed={swap.includes(x.id)} onClick={() => setSwap((s) => (s.includes(x.id) ? s.filter((i) => i !== x.id) : s.length < 2 ? [...s, x.id] : s))}>{x.name.split(' ')[0]} {x.strength}</button>)}
              </div>}
            </>)}
          </fieldset>
        )}
        {mode === 'emprestimo' && (
          <fieldset className="ng-box">
            <legend>🤝 Condições do empréstimo (até o fim da temporada)</legend>
            <label className="tf-check">Salário pago pelo clube de origem{' '}<select value={split} onChange={(e) => setSplit(Number(e.target.value))}><option value={0}>0% (você paga tudo)</option><option value={50}>50%</option><option value={100}>100% (origem paga tudo)</option></select></label>
            <label className="tf-check">Opção de compra (R$) <input inputMode="numeric" value={option ? option.toLocaleString('pt-BR') : ''} placeholder="sem opção" onChange={(e) => setOption(num(e.target.value))} /></label>
            <label className="tf-check">Obrigação de compra (R$) <input inputMode="numeric" value={oblig ? oblig.toLocaleString('pt-BR') : ''} placeholder="sem obrigação" onChange={(e) => setOblig(num(e.target.value))} /></label>
            {oblig > 0 && <label className="tf-check">...se jogar ao menos <input inputMode="numeric" style={{ width: 60 }} value={obGames} onChange={(e) => setObGames(num(e.target.value))} /> partidas como titular</label>}
          </fieldset>
        )}
        {mode === 'compra' && !(deal && deal.sellerId === game.userClubId) && (
          <fieldset className="ng-box">
            <legend>📜 Cláusulas</legend>
            <label className="tf-check">Venda futura: <select value={resale} onChange={(e) => setResale(Number(e.target.value))}><option value={0}>nenhuma</option><option value={10}>10% do lucro</option><option value={15}>15% do lucro</option><option value={20}>20% do lucro</option></select></label>
            <label className="tf-check">Bônus por partidas (R$) <input inputMode="numeric" value={bonusAmt ? bonusAmt.toLocaleString('pt-BR') : ''} placeholder="sem bônus" onChange={(e) => setBonusAmt(num(e.target.value))} />{bonusAmt > 0 && <> ao chegar a <input inputMode="numeric" style={{ width: 60 }} value={bonusGames} onChange={(e) => setBonusGames(num(e.target.value))} /> jogos</>}</label>
          </fieldset>
        )}
        {mode !== 'emprestimo' && !deal && (
          <fieldset className="ng-box">
            <legend>✍️ Contrato do jogador</legend>
            <div className="ng-input"><input inputMode="numeric" aria-label="Salário por ano" value={wage.toLocaleString('pt-BR')} onChange={(e) => setWage(num(e.target.value))} /><span>R$/ano</span></div>
            <label className="tf-check">Duração <select value={years} onChange={(e) => setYears(Number(e.target.value))}>{[1, 2, 3, 4, 5].map((y) => <option key={y} value={y}>{y} {y === 1 ? 'ano' : 'anos'}</option>)}</select></label>
          </fieldset>
        )}
        <div className="tf-confirm">
          <button className="primary" onClick={send}>{deal ? 'Enviar contraproposta' : mode === 'livre' ? 'Contratar jogador livre' : 'Enviar proposta'}</button>
          <button className="btn" onClick={onClose}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}
/** Parcelas de uma contraproposta (a entrada hoje e o resto a cada 90 dias). */
function instOf(fee: number, n: number, day: number) {
  const first = Math.round(fee * 0.4 / 10_000) * 10_000, each = Math.floor((fee - first) / (n - 1) / 10_000) * 10_000;
  const out = [{ due: day, amount: first }, ...Array.from({ length: n - 1 }, (_, i) => ({ due: day + 90 * (i + 1), amount: each }))];
  out[out.length - 1].amount += fee - out.reduce((s, i) => s + i.amount, 0);
  return out;
}

/* ---------- negociações ---------- */

function DealCard({ game, d, onChange, notify }: { game: GameState; d: Deal; onChange: (g: GameState) => void; notify: (t: string, e?: boolean) => void }) {
  const [more, setMore] = useState(false);
  const [counter, setCounter] = useState(false);
  const l = locate(game, d.playerId);
  const p = l?.player;
  const day = calOf(game).day;
  const iSell = d.sellerId === game.userClubId;
  const waiting = (iSell && d.turn === 'vendedor') || (!iSell && d.turn === 'comprador');
  const other = iSell ? d.buyerId : d.sellerId;
  const t = d.terms;
  const swapNames = (t.swapPlayerIds ?? []).map((id) => locate(game, id)?.player.name ?? id);
  return (
    <li className="tf-item">
      <div className="tf-row">
        <span className={`tf-ovr ${tier(p?.strength ?? 0)}`}>{p?.strength ?? '?'}</span>
        <div className="tf-info">
          <strong>{p?.name ?? 'Jogador'} <span className="tf-age">· {p?.age} anos</span></strong>
          <small><em className={`pill ${d.kind === 'compra' || d.kind === 'troca' ? 'sale' : 'loan'}`}>{KIND_LABEL[d.kind]}</em> {iSell ? 'Proposta do' : 'Proposta ao'} {other && game.clubs[other] ? <span className="tf-club"><ClubBadge club={game.clubs[other]} size={18} /> {nameOf(game, other)}</span> : 'mercado'} · <b>{STATE_LABEL[d.state]}</b> · prazo {formatDay(d.deadlineDay)} ({Math.max(0, d.deadlineDay - day)} d)</small>
        </div>
        <span className="tf-price">{formatBudget(t.fee)}</span>
      </div>
      <p className="hint" style={{ margin: '6px 0 0' }}>
        {t.installments ? `${t.installments.length} parcelas: ${t.installments.map((i) => `${formatBudget(i.amount)} em ${formatDay(i.due)}`).join(' · ')}. ` : 'À vista. '}
        {swapNames.length ? `Troca: ${swapNames.join(', ')}. ` : ''}
        {t.loan ? `Empréstimo até ${formatDay(t.loan.untilDay)} · origem paga ${Math.round(t.loan.originWagePct * 100)}% do salário${t.loan.buyOption ? ` · opção de compra ${formatBudget(t.loan.buyOption)}` : ''}${t.loan.buyObligation ? ` · obrigação ${formatBudget(t.loan.buyObligation)} (${t.loan.obligationGames} jogos)` : ''}. ` : ''}
        {(t.clauses ?? []).map((c) => (c.type === 'revenda' ? `Revenda ${Math.round((c.pct ?? 0) * 100)}% (${c.base}). ` : c.type === 'bonus-jogos' ? `Bônus ${formatBudget(c.amount ?? 0)} aos ${c.threshold} jogos. ` : `Bônus ${formatBudget(c.amount ?? 0)}. `)).join('')}
        {t.wage ? `Salário ${formatBudget(t.wage)}/ano. ` : ''}{d.reason ? `Motivo: ${d.reason}.` : ''}
      </p>
      <div className="tf-confirm">
        {waiting && <button className="primary" onClick={() => { onChange(userAccept(game, d.id)); notify('Resposta enviada.'); }}>Aceitar</button>}
        {waiting && <button className="btn" onClick={() => setCounter(true)}>Contrapropor</button>}
        {waiting && <button className="btn" onClick={() => { onChange(userRefuse(game, d.id)); notify('Proposta recusada.'); }}>Recusar</button>}
        {!waiting && <small>Aguardando resposta {d.answerDay && d.answerDay > day ? `(em ${d.answerDay - day} dia${d.answerDay - day > 1 ? 's' : ''})` : 'do outro lado'}…</small>}
        {!iSell && <button className="mini" onClick={() => { onChange(userCancel(game, d.id)); notify('Negociação cancelada.'); }}>Cancelar</button>}
        <button className="mini" onClick={() => setMore(!more)}>{more ? 'Ocultar histórico' : 'Histórico'}</button>
      </div>
      {more && <ul className="tf-log">{d.history.map((h, i) => <li key={i}><small>{formatDay(h.day)} · {h.by}: {h.note}</small></li>)}</ul>}
      {counter && <ProposalSheet game={game} playerId={d.playerId} mode={d.kind === 'emprestimo' ? 'emprestimo' : 'compra'} deal={d} onChange={onChange} onClose={() => setCounter(false)} onDone={(t2, e) => { setCounter(false); notify(t2, e); }} />}
    </li>
  );
}

/** Negociações em andamento (enviadas e recebidas), com as ações de aceitar, recusar e contrapropor. */
export function DealsPanel({ game, onChange, notify }: { game: GameState; onChange: (g: GameState) => void; notify: (t: string, e?: boolean) => void }) {
  const list = dealsForUser(game);
  const incoming = list.filter((d) => d.sellerId === game.userClubId), out = list.filter((d) => d.buyerId === game.userClubId);
  const sales = openForeignSales(game);
  return (
    <>
      {sales.length > 0 && hooks.installed && <Suspense fallback={null}><ForeignSalesSection game={game} onChange={onChange} notify={notify} /></Suspense>}
      <section>
        <h3>Propostas recebidas ({incoming.length})</h3>
        {incoming.length === 0 ? <div className="card"><p className="hint" style={{ margin: 0 }}>Nenhuma proposta pelos seus jogadores agora. Clubes que precisam da posição fazem propostas durante a janela, principalmente por quem está na lista de transferência.</p></div> : <ul className="tf-list">{incoming.map((d) => <DealCard key={d.id} game={game} d={d} onChange={onChange} notify={notify} />)}</ul>}
      </section>
      <section>
        <h3>Propostas enviadas ({out.length})</h3>
        {out.length === 0 ? <div className="card"><p className="hint" style={{ margin: 0 }}>Você não tem propostas em andamento. Use “Propor” na aba Mercado.</p></div> : <ul className="tf-list">{out.map((d) => <DealCard key={d.id} game={game} d={d} onChange={onChange} notify={notify} />)}</ul>}
      </section>
      {myLoanDeals(game).length > 0 && (
        <section>
          <h3>Empréstimos em vigor</h3>
          <div className="card"><ul className="tf-log">{myLoanDeals(game).map((ld) => {
            const p = locate(game, ld.playerId)?.player;
            const host = ld.hostId === game.userClubId;
            const rep = loanReport(game, ld);
            return <li key={ld.dealId} className="tf-lrow"><span><b>{p?.name}</b> <small>{host ? `do ${nameOf(game, ld.originId)}` : `no ${nameOf(game, ld.hostId)}`} · até {formatDay(ld.untilDay)} · origem paga {Math.round(ld.originWagePct * 100)}% · {ld.apps} jogos como titular · overall {ld.startStrength ?? '?'} → {p?.strength ?? '?'} ({rep.evolution >= 0 ? '+' : ''}{rep.evolution}) · {rep.status}{rep.injured ? ' · 🤕 lesionado' : ''}{ld.reason ? ` · ${ld.reason}` : ''}{ld.buyOption ? ` · opção ${formatBudget(ld.buyOption)}` : ''}{ld.buyObligation ? ` · obrigação ${formatBudget(ld.buyObligation)} aos ${ld.obligationGames} jogos` : ''}</small></span>
              {host && ld.buyOption ? <button className="mini" disabled={!!transferBlock(game, 'comum')} onClick={() => { const r = exerciseBuyOption(game, ld.playerId); if (r.ok) { onChange(r.state); notify(`Opção exercida: ${p?.name} é do seu clube.`); } else notify(r.reason ?? 'Não foi possível.', true); }}>Exercer opção</button> : null}</li>;
          })}</ul></div>
        </section>
      )}
    </>
  );
}

/** Pedidos dos seus jogadores (quer sair, pede aumento). */
export function RequestsPanel({ game, onChange, notify }: { game: GameState; onChange: (g: GameState) => void; notify: (t: string, e?: boolean) => void }) {
  const reqs = myRequests(game);
  if (!reqs.length) return null;
  const act = (pid: string, a: 'conceder' | 'listar' | 'ignorar') => { const r = answerRequest(game, pid, a); onChange(r.state); notify(r.text, !r.ok); };
  return (
    <section>
      <h3>Pedidos dos jogadores ({reqs.length})</h3>
      <div className="card"><ul className="tf-log">{reqs.map(({ player: p, mood }) => (
        <li key={p.id} className="tf-lrow"><span><b>{p.name}</b> <small>({p.strength}) · {mood.want === 'sair' ? 'quer sair' : 'pede aumento'}: {mood.reason}{mood.level >= 3 ? ' · muito insatisfeito' : ''}</small></span>
          <span>{mood.want === 'aumento' ? <button className="mini" onClick={() => act(p.id, 'conceder')}>Dar aumento</button> : <button className="mini" onClick={() => act(p.id, 'listar')}>Colocar à venda</button>}{' '}<button className="mini" onClick={() => act(p.id, 'ignorar')}>Ignorar</button></span></li>
      ))}</ul></div>
    </section>
  );
}

/** Histórico das negociações encerradas (concluídas, recusadas, expiradas, canceladas). */
export function DealHistory({ game }: { game: GameState }) {
  const log = (game.dealLog ?? []).slice(0, 40);
  return (
    <section>
      <h3>Histórico de negociações</h3>
      <div className="card">{log.length === 0 ? <p className="hint" style={{ margin: 0 }}>Ainda sem negociações registradas.</p> : (
        <ul className="tf-log">{log.map((r) => <li key={r.id}><b>{STATE_LABEL[r.state]}:</b> {r.playerName} <small>· {KIND_LABEL[r.kind]} · {r.sellerId ? nameOf(game, r.sellerId) : 'livre'} → {nameOf(game, r.buyerId)}{r.fee ? ` · ${formatBudget(r.fee)}` : ''} · {formatDay(r.day)}</small></li>)}</ul>
      )}</div>
    </section>
  );
}

/* ---------- listas do mercado ---------- */

export function OfficialList({ game, onPropose }: { game: GameState; onPropose: (id: string) => void }) {
  const rows = officialList(game).slice(0, 60);
  return (
    <>
      <p className="hint">Jogadores que os clubes colocaram oficialmente à venda. Os demais jogadores não estão disponíveis: só dá para abordá-los pela busca (o preço pedido é mais alto e o clube pode recusar).</p>
      {rows.length === 0 && <div className="card center"><p className="hint">Nenhum clube colocou jogadores à venda por enquanto.</p></div>}
      <ul className="tf-list">{rows.map(({ player: p, clubId, reason, value }) => (
        <li key={p.id} className="tf-item"><div className="tf-row">
          <span className={`tf-ovr ${tier(p.strength)}`}>{p.strength}</span>
          <div className="tf-info"><strong>{p.name}</strong><small>{SPOT_SHORT[spotOf(p)]} · {p.age} anos · {nameOf(game, clubId)} · à venda: {reason}{p.contract ? ` · contrato até ${p.contract.until}` : ''}</small></div>
          <span className="tf-price">{formatBudget(value)}</span>
          <button className="tf-buy" onClick={() => onPropose(p.id)}>Propor</button>
        </div></li>
      ))}</ul>
    </>
  );
}

export function FreeAgents({ game, onPropose }: { game: GameState; onPropose: (id: string) => void }) {
  const rows = freeList(game).slice(0, 60);
  return (
    <>
      <p className="hint">Jogadores sem clube: sem taxa de transferência, só salário. Podem ser contratados mesmo com o mercado fechado. Só ficam livres jogadores de overall {FREE_AGENT_MAX} ou menos, e o seu clube só pode contratar quem tem overall parecido com o do seu time: <b>até {freeLimitOf(game)}</b>.</p>
      {rows.length === 0 && <div className="card center"><p className="hint">Nenhum jogador livre no momento. Eles aparecem quando contratos terminam e clubes liberam jogadores.</p></div>}
      <ul className="tf-list">{rows.map(({ player: p, ask, agent, lastClub }) => (
        <li key={p.id} className="tf-item"><div className="tf-row">
          <span className={`tf-ovr ${tier(p.strength)}`}>{p.strength}</span>
          <div className="tf-info"><strong>{p.name}</strong><small>{SPOT_SHORT[spotOf(p)]} · {p.age} anos · pede {formatBudget(ask)}/ano · agente {agent}{lastClub ? ` · ex-${lastClub}` : ''}</small></div>
          <button className="tf-buy" onClick={() => onPropose(p.id)}>Contratar</button>
        </div></li>
      ))}</ul>
    </>
  );
}

export function AgentsList({ game, onPropose }: { game: GameState; onPropose: (id: string, free: boolean) => void }) {
  const offers = (game.agentOffers ?? []).filter((o) => o.clubId === game.userClubId && o.state === 'aberta');
  return (
    <>
      <p className="hint">Agentes oferecem jogadores para as posições em que o seu elenco precisa. As ofertas são poucas e valem por 10 dias.</p>
      {offers.length === 0 && <div className="card center"><p className="hint">Nenhuma oferta de agente agora.</p></div>}
      <ul className="tf-list">{offers.map((o) => {
        const l = locate(game, o.playerId);
        if (!l) return null;
        return <li key={o.id} className="tf-item"><div className="tf-row">
          <span className={`tf-ovr ${tier(l.player.strength)}`}>{l.player.strength}</span>
          <div className="tf-info"><strong>{l.player.name}</strong><small>{o.pitch} · até {formatDay(o.expiresDay)}</small></div>
          <button className="tf-buy" onClick={() => onPropose(l.player.id, l.clubId === null)}>Negociar</button>
        </div></li>;
      })}</ul>
    </>
  );
}

/** Quantas coisas esperam por você no mercado (para o selo do menu). */
export const marketBadge = (g: GameState) => g.offers.length + dealsWaitingUser(g).length + myRequests(g).length + openForeignSales(g).length;
export type { Player };

const CONTRACT_STATE: Record<string, string> = { 'ultimo-ano': 'último ano', 'vencido': 'vencido', 'vence-em-2-anos': 'vence em 2 anos', ok: 'em dia', 'sem-contrato': 'sem contrato' };

/** Contratos que pedem atenção (último ano, mal pagos, recusas) e o histórico de mudanças contratuais; daqui você propõe a renovação. */
export function ContractsPanel({ game, onChange, notify }: { game: GameState; onChange: (g: GameState) => void; notify: (t: string, e?: boolean) => void }) {
  const alerts = contractAlerts(game, game.userClubId).slice(0, 12);
  const [open, setOpen] = useState<string | null>(null);
  const [wage, setWage] = useState(0);
  const [years, setYears] = useState(3);
  const log = (game.contractLog ?? []).filter((e) => e.clubId === game.userClubId).slice(0, 10);
  const send = (pid: string) => {
    const r = renewOffer(game, pid, wage, years);
    if (r.ok) { onChange(r.state); setOpen(null); notify(r.text); return; }
    if (r.state !== game) onChange(r.state);
    if (r.counter?.wage) setWage(r.counter.wage);
    if (r.counter?.years) setYears(r.counter.years);
    notify(r.text, true);
  };
  return (
    <section>
      <h3>Contratos ({alerts.length})</h3>
      <div className="card">
        {alerts.length === 0 ? <p className="hint" style={{ margin: 0 }}>Nenhum contrato pede atenção agora. Os avisos chegam no último ano de contrato.</p> : (
          <ul className="tf-log">{alerts.map((a) => (
            <li key={a.player.id}>
              <div className="tf-lrow"><span><b>{a.player.name}</b> <small>({a.player.strength}, {a.player.age} anos) · {CONTRACT_STATE[a.state]}{a.underpaid ? ' · salário abaixo do justo' : ''}{a.refusals ? ` · recusou ${a.refusals}×` : ''} · ganha {formatBudget(a.wage)}/ano (justo ~{formatBudget(a.fair)})</small></span>
                <button className="mini" onClick={() => { setOpen(open === a.player.id ? null : a.player.id); setWage(Math.max(a.wage, a.fair)); setYears(3); }}>Renovar</button></div>
              {open === a.player.id && (
                <div className="tf-confirm">
                  <div className="ng-input"><input inputMode="numeric" aria-label="Novo salário por ano" value={wage.toLocaleString('pt-BR')} onChange={(e) => setWage(Number(e.target.value.replace(/\D/g, '')))} /><span>R$/ano</span></div>
                  <label className="tf-check">Duração <select value={years} onChange={(e) => setYears(Number(e.target.value))}>{[1, 2, 3, 4, 5].map((y) => <option key={y} value={y}>{y} {y === 1 ? 'ano' : 'anos'}</option>)}</select></label>
                  <button className="primary" onClick={() => send(a.player.id)}>Propor renovação</button>
                </div>
              )}
            </li>
          ))}</ul>
        )}
      </div>
      {log.length > 0 && <div className="card"><h4 style={{ margin: '0 0 6px' }}>Histórico de contratos</h4><ul className="tf-log">{log.map((e, i) => <li key={i}><small>{formatDay(e.day)} · <b>{e.playerName}</b>: {e.kind}{e.wageFrom && e.wageTo ? ` (${formatBudget(e.wageFrom)} → ${formatBudget(e.wageTo)}/ano)` : e.wageTo ? ` (${formatBudget(e.wageTo)}/ano)` : ''} · {e.note}</small></li>)}</ul></div>}
    </section>
  );
}

/** Histórico dos empréstimos encerrados que envolveram o seu clube. */
export function LoanHistory({ game }: { game: GameState }) {
  const log = (game.loanLog ?? []).filter((l) => l.originId === game.userClubId || l.hostId === game.userClubId).slice(0, 10);
  if (!log.length) return null;
  return (
    <section>
      <h3>Histórico de empréstimos</h3>
      <div className="card"><ul className="tf-log">{log.map((l) => <li key={l.dealId}><b>{l.playerName}</b> <small>· {nameOf(game, l.originId)} → {nameOf(game, l.hostId)} · {l.apps} jogos · overall {l.strengthFrom} → {l.strengthTo} · {l.outcome === 'devolvido' ? 'devolvido' : l.outcome === 'comprado-opcao' ? 'opção exercida' : 'obrigação cumprida'} · {formatDay(l.endDay)}</small></li>)}</ul></div>
    </section>
  );
}
