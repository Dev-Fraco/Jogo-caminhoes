import { useState } from 'react';
import { audio } from '../audio/audio';
import { CATEGORIES, type CategoryId } from '../engine/categories';
import { maxScouts } from '../engine/yscout';
import { candidateAsk, discardCandidate, findInterval, fireScout, holdTryout, hireScout, missionCost, REGIONS, regionOf, scoutFee, signCandidate, sendScout, recallScout, TRYOUT_SIZES, tryoutCost, tryoutNextLabel, tryoutReady, type Candidate, type RegionId, type TryoutSize } from '../engine/yscout';
import { askWage, contractStatus, expiring, mood, payroll, personalityOf, PERS_LABEL, releaseWithContract, renewContract, SAT_START, yearsLeft } from '../engine/ycontract';
import { acceptOffer, buyListing, counterOffer, formationComp, listingPlayer, loanOut, loanTargets, recallLoan, rejectOffer, youthValue } from '../engine/ymarket';
import { youthOf, type Prospect } from '../engine/youth';
import { clubOf } from '../engine/lookup';
import type { GameState } from '../engine/types';
import { formatBudget } from '../newgame/format';
import { SubTabs } from './FmParts';

type Tab = 'olheiros' | 'peneiras' | 'contratos' | 'propostas' | 'transferencias' | 'emprestimos' | 'insatisfeitos';
const POS: Record<string, string> = { GK: 'GOL', DEF: 'DEF', MID: 'MEI', ATT: 'ATA' };
const clubName = (g: GameState, id: string) => clubOf(g, id)?.name ?? id;
const line = (p: Prospect) => `${p.player.name} · ${POS[p.player.pos]} · ${p.player.age} anos · overall ${p.player.strength}`;

/** Mercado da base: olheiros, peneiras, contratos, propostas, transferências, empréstimos e jogadores insatisfeitos. */
export function YouthMarket({ game, onChange }: { game: GameState; onChange: (g: GameState) => void }) {
  const [tab, setTab] = useState<Tab>('olheiros');
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const y = youthOf(game);
  const cash = game.budgets[game.userClubId] ?? 0;
  const say = (text: string, ok: boolean) => { setMsg({ text, ok }); if (!ok) audio.sfx('error'); };
  const run = (r: { ok: true; state: GameState; msg?: string } | { ok: false; error: string }, okText?: string) => { if (!r.ok) { say(r.error, false); return false; } onChange(r.state); audio.sfx('cash'); say(okText ?? r.msg ?? 'Feito.', true); return true; };
  const unhappy = y.prospects.filter((p) => (p.sat ?? SAT_START) < 55 || p.want);
  const pending = (y.offers ?? []).length;
  const tabs: [Tab, string][] = [['olheiros', '🔭 Olheiros'], ['peneiras', '🧢 Peneiras'], ['contratos', '📄 Contratos'], ['propostas', `📩 Propostas${pending ? ` (${pending})` : ''}`], ['transferencias', '🔁 Transferências'], ['emprestimos', '🤝 Empréstimos'], ['insatisfeitos', `😠 Insatisfeitos${unhappy.length ? ` (${unhappy.length})` : ''}`]];

  return (
    <>
      <section className="card mk-card ym-top">
        <div className="yt-info"><span>🏦 Caixa: <b>{formatBudget(cash)}</b></span><span>💼 Folha da base: <b>{formatBudget(payroll(y))}</b>/ano</span></div>
        <small className="hint">Tudo sai e entra no caixa real do clube e fica registrado no histórico da academia.</small>
        {msg && <p className={`shop-msg ${msg.ok ? 'ok' : 'bad'}`} role="status">{msg.text}</p>}
      </section>
      <div className="ym-tabs"><SubTabs items={tabs.map(([id, label]) => ({ label, on: tab === id, onClick: () => { setTab(id); setMsg(null); } }))} /></div>

      {tab === 'olheiros' && <Scouts game={game} run={run} onChange={onChange} />}
      {tab === 'peneiras' && <Tryouts game={game} run={run} onChange={onChange} />}
      {tab === 'contratos' && <Contracts game={game} run={run} />}
      {tab === 'propostas' && <Offers game={game} run={run} onChange={onChange} say={say} />}
      {tab === 'transferencias' && <Listings game={game} run={run} />}
      {tab === 'emprestimos' && <Loans game={game} run={run} />}
      {tab === 'insatisfeitos' && <Unhappy game={game} list={unhappy} run={run} />}
    </>
  );
}

type Run = (r: { ok: true; state: GameState; msg?: string } | { ok: false; error: string }, okText?: string) => boolean;

/* ----------------------------- observados (olheiros + peneiras) ----------------------------- */

function Pool({ game, run, onChange }: { game: GameState; run: Run; onChange: (g: GameState) => void }) {
  const y = youthOf(game);
  const [open, setOpen] = useState<string | null>(null);
  const [wage, setWage] = useState<Record<string, string>>({});
  const [years, setYears] = useState<Record<string, number>>({});
  const list = y.pool ?? [];
  return (
    <section className="mk-sec">
      <h3><span className="yt-bar2" aria-hidden="true" />Jovens observados ({list.length})</h3>
      <p className="hint">Relatório dos olheiros e das peneiras. O potencial aparece como uma faixa: olheiro melhor erra menos. Validade curta: decida logo. Vagas na base: {y.prospects.length}/{Math.round(60 + 2 * ((y.fac?.alojamento ?? 1) - 1))}.</p>
      {list.length === 0 && <p className="hint">Ninguém observado agora. Envie um olheiro ou organize uma peneira.</p>}
      <ul className="tc-list">
        {list.map((c: Candidate) => {
          const ask = candidateAsk(game, c), w = Number(wage[c.id] ?? ask), yrs = years[c.id] ?? 3;
          const q = personalityOf({ player: c.player });
          return (
            <li key={c.id} className="mk-card tc-card">
              <div className="tc-head"><div><b>{c.player.name}</b><small>{POS[c.player.pos]} · {c.player.age} anos · overall {c.player.strength}</small></div></div>
              <small>Potencial estimado: <b>{c.seen.lo}–{c.seen.hi}</b>{c.seen.special ? ' ⭐ talento especial identificado' : ''}</small>
              <small>{c.origin.kind === 'peneira' ? '🧢 Peneira' : `🔭 ${c.origin.by}`} · {regionOf(c.origin.region).label} · validade {c.left} rodada(s)</small>
              <small>Personalidade: {(['prof', 'ded', 'disc', 'amb'] as const).map((k) => `${PERS_LABEL[k].slice(0, 4)}. ${q[k]}`).join(' · ')}</small>
              <div className="tc-btns"><button className="primary" onClick={() => setOpen(open === c.id ? null : c.id)}>Oferecer contrato</button><button className="btn" onClick={() => onChange(discardCandidate(game, c.id))}>Descartar</button></div>
              {open === c.id && (
                <div className="ym-form">
                  <small>Ele pede cerca de <b>{formatBudget(ask)}</b>/ano. Luvas: 20% do salário.</small>
                  <label>Salário anual (R$)<input inputMode="numeric" value={wage[c.id] ?? String(ask)} onChange={(e) => setWage({ ...wage, [c.id]: e.target.value.replace(/\D/g, '') })} aria-label={`Salário de ${c.player.name}`} /></label>
                  <label>Duração<select value={yrs} onChange={(e) => setYears({ ...years, [c.id]: Number(e.target.value) })}>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} ano(s)</option>)}</select></label>
                  <button className="primary" onClick={() => run(signCandidate(game, c.id, w, yrs), `${c.player.name} contratado!`)}>Contratar por {formatBudget(w)}/ano</button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Scouts({ game, run, onChange }: { game: GameState; run: Run; onChange: (g: GameState) => void }) {
  const y = youthOf(game);
  return (
    <>
      <section className="mk-sec">
        <h3><span className="yt-bar2" aria-hidden="true" />Seus olheiros ({y.scouts?.length ?? 0}/{maxScouts(y.level)})</h3>
        {(y.scouts ?? []).length === 0 && <p className="hint">Nenhum olheiro. Contrate um abaixo e envie para uma região: ele traz relatórios de jovens de tempos em tempos.</p>}
        <ul className="tc-list">
          {(y.scouts ?? []).map((s) => (
            <li key={s.id} className="mk-card tc-card">
              <div className="tc-head"><div><b>{s.name}</b><small>{s.age} anos · {s.quality}/10 ★ · {formatBudget(s.wage)}/ano</small></div></div>
              <small>{s.region ? `Em missão: ${regionOf(s.region).label} · próximo relatório em ${s.wait ?? '?'} rodada(s) · ${formatBudget(missionCost(game, s.region))} por viagem` : 'Parado: envie para uma região.'} · {s.found} descoberta(s)</small>
              <div className="tc-btns">
                <select aria-label={`Região de ${s.name}`} value={s.region ?? ''} onChange={(e) => { if (e.target.value) run(sendScout(game, s.id, e.target.value as RegionId)); }}>
                  <option value="">Enviar para…</option>{REGIONS.map((r) => <option key={r.id} value={r.id}>{r.label} (a cada ~{findInterval(s.quality, r.id)} rod.)</option>)}
                </select>
                {s.region && <button className="btn" onClick={() => onChange(recallScout(game, s.id))}>Chamar de volta</button>}
                <button className="btn" onClick={() => run(fireScout(game, s.id))}>Dispensar</button>
              </div>
            </li>
          ))}
        </ul>
      </section>
      <section className="mk-sec">
        <h3><span className="yt-bar2" aria-hidden="true" />Olheiros disponíveis</h3>
        <p className="hint">Olheiro melhor encontra mais rápido e enxerga o potencial com menos erro. Máximo de {maxScouts(y.level)} com a academia no nível {y.level}.</p>
        <ul className="tc-list">
          {(y.scoutMarket ?? []).map((s) => (
            <li key={s.id} className="mk-card tc-card">
              <div className="tc-head"><div><b>{s.name}</b><small>{s.age} anos · {s.quality}/10 ★</small></div></div>
              <small>Salário {formatBudget(s.wage)}/ano · luvas {formatBudget(scoutFee(s))}</small>
              <button className="primary" onClick={() => run(hireScout(game, s.id), `${s.name} contratado.`)}>Contratar</button>
            </li>
          ))}
        </ul>
      </section>
      <Pool game={game} run={run} onChange={onChange} />
    </>
  );
}

function Tryouts({ game, run, onChange }: { game: GameState; run: Run; onChange: (g: GameState) => void }) {
  const [size, setSize] = useState<TryoutSize>('media');
  const [cat, setCat] = useState<CategoryId | 'todas'>('todas');
  const [region, setRegion] = useState<RegionId>('sudeste');
  const wait = tryoutReady(game);
  const cost = tryoutCost(game, size, region);
  return (
    <>
      <section className="card mk-card ym-top">
        <h3>Organizar uma peneira</h3>
        <p className="hint">Reúne jovens da região para você avaliar. Academia e olheiros melhores trazem jovens melhores; talentos excepcionais são raros. Só entra na base quem você contratar.</p>
        <label className="ym-row">Tamanho<select value={size} onChange={(e) => setSize(e.target.value as TryoutSize)}>{(Object.keys(TRYOUT_SIZES) as TryoutSize[]).map((k) => <option key={k} value={k}>{k} ({TRYOUT_SIZES[k]} jovens)</option>)}</select></label>
        <label className="ym-row">Categoria<select value={cat} onChange={(e) => setCat(e.target.value as CategoryId | 'todas')}><option value="todas">Todas as idades</option>{CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
        <label className="ym-row">Região<select value={region} onChange={(e) => setRegion(e.target.value as RegionId)}>{REGIONS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select></label>
        <p>Custo: <b>{formatBudget(cost)}</b>{wait > 0 ? ` · já feita neste mês: libera no ${tryoutNextLabel(game)} (em ${wait} dia${wait === 1 ? '' : 's'})` : ' · disponível (1 por mês)'}</p>
        <button className="primary mk-big" disabled={wait > 0 || cash(game) < cost} onClick={() => run(holdTryout(game, size, cat, region))}>🧢 Organizar peneira · {formatBudget(cost)}</button>
      </section>
      <Pool game={game} run={run} onChange={onChange} />
    </>
  );
}
const cash = (g: GameState) => g.budgets[g.userClubId] ?? 0;

/* ----------------------------- contratos ----------------------------- */

function Contracts({ game, run }: { game: GameState; run: Run }) {
  const y = youthOf(game);
  const [open, setOpen] = useState<string | null>(null);
  const [wage, setWage] = useState<Record<string, string>>({});
  const [years, setYears] = useState<Record<string, number>>({});
  const list = [...y.prospects].sort((a, b) => (a.player.contract?.until ?? 0) - (b.player.contract?.until ?? 0));
  const soon = expiring(game, 0);
  return (
    <section className="mk-sec">
      <h3><span className="yt-bar2" aria-hidden="true" />Contratos ({y.prospects.length})</h3>
      <p className="hint">Folha anual: <b>{formatBudget(payroll(y))}</b> (paga na virada da temporada). {soon.length ? `⚠️ ${soon.length} contrato(s) vencem no fim desta temporada: renove ou o jovem deixa o clube.` : 'Nenhum contrato vence nesta temporada.'}</p>
      <ul className="tc-list">
        {list.map((p) => {
          const c = p.player.contract, st = contractStatus(game, p), ask = askWage(game, p), w = Number(wage[p.player.id] ?? ask);
          return (
            <li key={p.player.id} className={`mk-card tc-card ${st === 'vencendo' ? 'ym-warn' : ''}`}>
              <b>{line(p)}</b>
              <small>{c ? `${formatBudget(c.wage)}/ano · ${c.from ?? '—'} → ${c.until}` : 'sem contrato'} · <b>{st === 'vencendo' ? '⚠️ vence neste ano' : st}</b>{p.loanFrom ? ' · emprestado (contrato do outro clube)' : ''}</small>
              <small>{(p.renewals ?? []).length ? `Renovações: ${(p.renewals ?? []).map((r) => `${r.season} (${Math.round(r.wage / 1000)} mil até ${r.until})`).join('; ')}` : 'Sem renovações.'}</small>
              {!p.loanFrom && <div className="tc-btns"><button className="primary" onClick={() => setOpen(open === p.player.id ? null : p.player.id)}>Renovar / negociar</button><button className="btn" onClick={() => run(releaseWithContract(game, p.player.id), `${p.player.name} liberado.`)}>Liberar</button></div>}
              {open === p.player.id && (
                <div className="ym-form">
                  <small>Ele pede cerca de <b>{formatBudget(ask)}</b>/ano{p.want === 'nao-renovar' ? ' (e está insatisfeito: não quer renovar)' : ''}. Luvas: 20%.</small>
                  <label>Salário anual (R$)<input inputMode="numeric" value={wage[p.player.id] ?? String(ask)} onChange={(e) => setWage({ ...wage, [p.player.id]: e.target.value.replace(/\D/g, '') })} aria-label={`Salário de ${p.player.name}`} /></label>
                  <label>Mais<select value={years[p.player.id] ?? 2} onChange={(e) => setYears({ ...years, [p.player.id]: Number(e.target.value) })}>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} ano(s)</option>)}</select></label>
                  <button className="primary" onClick={() => run(renewContract(game, p.player.id, w, years[p.player.id] ?? 2), `${p.player.name} renovou.`)}>Propor {formatBudget(w)}/ano</button>
                </div>
              )}
              <small className="sub">Restam {yearsLeft(game, p)} ano(s).</small>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ----------------------------- propostas ----------------------------- */

function Offers({ game, run, onChange, say }: { game: GameState; run: Run; onChange: (g: GameState) => void; say: (t: string, ok: boolean) => void }) {
  const y = youthOf(game);
  const [ask, setAsk] = useState<Record<string, string>>({});
  const list = y.offers ?? [];
  return (
    <section className="mk-sec">
      <h3><span className="yt-bar2" aria-hidden="true" />Propostas recebidas ({list.length})</h3>
      {list.length === 0 && <p className="hint">Nenhuma proposta agora. Clubes se interessam por jovens com potencial e bom desempenho.</p>}
      <ul className="tc-list">
        {list.map((o) => {
          const p = y.prospects.find((x) => x.player.id === o.playerId)!;
          const value = youthValue(game, p), comp = o.kind === 'compra' ? formationComp(game, p, o.fee) : 0;
          return (
            <li key={o.id} className="mk-card tc-card">
              <b>{o.kind === 'compra' ? '💸 Compra' : '🤝 Empréstimo'} · {clubName(game, o.club)}</b>
              <small>{line(p)} · potencial {p.potential}</small>
              <small>{o.kind === 'compra' ? `Oferta: ${formatBudget(o.fee)}${comp ? ` + compensação de formação ${formatBudget(comp)}` : ''} · valor estimado do jogador ${formatBudget(value)}` : `${Math.round((o.share ?? 0.5) * 100)}% do salário pago por eles · ${o.years ?? 1} temporada(s) · ele continua seu e volta no fim`}</small>
              {o.note && <small className="yc-no">{o.note}</small>}
              <small className="sub">Válida por {o.left} rodada(s){p.want === 'transferencia' ? ' · o jogador pediu para sair' : ''}.</small>
              <div className="tc-btns"><button className="primary" onClick={() => run(acceptOffer(game, o.id))}>Aceitar</button><button className="btn" onClick={() => onChange(rejectOffer(game, o.id))}>Recusar</button></div>
              {o.kind === 'compra' && (
                <div className="ym-form"><label>Pedir (R$)<input inputMode="numeric" value={ask[o.id] ?? String(Math.round(o.fee * 1.15 / 10_000) * 10_000)} onChange={(e) => setAsk({ ...ask, [o.id]: e.target.value.replace(/\D/g, '') })} aria-label="Valor pedido" /></label>
                  <button className="btn" onClick={() => { const r = counterOffer(game, o.id, Number(ask[o.id] ?? o.fee * 1.15)); if (!r.ok) { say(r.error, false); return; } onChange(r.state); say(r.msg, r.outcome !== 'desistiu'); }}>Negociar valor</button></div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ----------------------------- transferências e empréstimos ----------------------------- */

function Listings({ game, run }: { game: GameState; run: Run }) {
  const y = youthOf(game);
  const log = [...(game.yMarketLog ?? [])].reverse().slice(0, 8);
  return (
    <>
      <section className="mk-sec">
        <h3><span className="yt-bar2" aria-hidden="true" />Jogadores da base de outros clubes ({(y.listings ?? []).length})</h3>
        <p className="hint">Comprar tira o jogador do clube dele (um registro só). Quem chega mantém a identidade e ganha contrato com você.</p>
        <ul className="tc-list">
          {(y.listings ?? []).map((l) => {
            const pl = listingPlayer(game, l);
            if (!pl) return null;
            return (
              <li key={l.id} className="mk-card tc-card">
                <b>{pl.name}</b><small>{POS[pl.pos]} · {pl.age} anos · overall {pl.strength} · potencial {pl.pot}</small>
                <small>{clubName(game, l.clubId)} · {l.kind === 'emprestimo' ? `empréstimo (você paga ${Math.round((l.share ?? 0.5) * 100)}% do salário)` : formatBudget(l.price)} · {l.left} rodada(s)</small>
                <button className="primary" onClick={() => run(buyListing(game, l.id), l.kind === 'emprestimo' ? `${pl.name} chegou por empréstimo.` : `${pl.name} comprado.`)}>{l.kind === 'emprestimo' ? 'Pegar emprestado' : `Comprar · ${formatBudget(l.price)}`}</button>
              </li>
            );
          })}
        </ul>
      </section>
      <section className="mk-sec">
        <h3><span className="yt-bar2" aria-hidden="true" />Movimentos recentes entre clubes</h3>
        {log.length === 0 && <p className="hint">Os clubes negociam jovens entre si na virada de temporada.</p>}
        <ul className="tc-hist">{log.map((e, i) => <li key={i}><b>{e.season}</b> {e.text}{e.fee ? ` — ${formatBudget(e.fee)}` : ''}</li>)}</ul>
      </section>
    </>
  );
}

function Loans({ game, run }: { game: GameState; run: Run }) {
  const y = youthOf(game);
  const [sel, setSel] = useState<string>('');
  const [years, setYears] = useState(1);
  const out = y.prospects.filter((p) => p.loanedTo), inn = y.prospects.filter((p) => p.loanFrom);
  const free = y.prospects.filter((p) => !p.loanedTo && !p.loanFrom);
  const targets = sel ? loanTargets(game, sel) : [];
  return (
    <>
      <section className="mk-sec">
        <h3><span className="yt-bar2" aria-hidden="true" />Emprestados por você ({out.length})</h3>
        {out.length === 0 && <p className="hint">Nenhum. Emprestar dá minutos de jogo a quem não tem espaço e o jogador continua seu.</p>}
        <ul className="tc-hist">{out.map((p) => <li key={p.player.id}><b>{p.player.name}</b> → {clubName(game, p.loanedTo!.club)} até {p.loanedTo!.until} · eles pagam {Math.round(p.loanedTo!.share * 100)}% do salário <button className="btn" onClick={() => run(recallLoan(game, p.player.id), 'Jogador de volta.')}>Chamar de volta</button></li>)}</ul>
        <h4>Emprestar um jovem</h4>
        <label className="ym-row">Jovem<select value={sel} onChange={(e) => setSel(e.target.value)}><option value="">Escolha…</option>{free.map((p) => <option key={p.player.id} value={p.player.id}>{line(p)}</option>)}</select></label>
        <label className="ym-row">Duração<select value={years} onChange={(e) => setYears(Number(e.target.value))}>{[1, 2, 3].map((n) => <option key={n} value={n}>{n} temporada(s)</option>)}</select></label>
        {sel && targets.length === 0 && <p className="hint">Nenhum clube quer esse jovem agora (overall baixo para o nível deles).</p>}
        <ul className="tc-list">{targets.map((t) => <li key={t.club} className="mk-card tc-card"><b>{clubName(game, t.club)}</b><small>Aproveitamento esperado {Math.round(t.fit * 100)}% · pagam {Math.round(t.share * 100)}% do salário</small><button className="primary" onClick={() => run(loanOut(game, sel, t.club, years, t.share), 'Empréstimo feito.')}>Emprestar</button></li>)}</ul>
      </section>
      <section className="mk-sec">
        <h3><span className="yt-bar2" aria-hidden="true" />Recebidos por empréstimo ({inn.length})</h3>
        {inn.length === 0 && <p className="hint">Nenhum. Veja a aba Transferências para pegar jovens emprestados.</p>}
        <ul className="tc-hist">{inn.map((p) => <li key={p.player.id}><b>{p.player.name}</b> (de {clubName(game, p.loanFrom!.club)}) até {p.loanFrom!.until} · você paga {Math.round(p.loanFrom!.share * 100)}% do salário · volta no fim; não pode ser promovido nem vendido</li>)}</ul>
      </section>
    </>
  );
}

function Unhappy({ game, list, run }: { game: GameState; list: Prospect[]; run: Run }) {
  const y = youthOf(game);
  const [wage, setWage] = useState<Record<string, string>>({});
  return (
    <section className="mk-sec">
      <h3><span className="yt-bar2" aria-hidden="true" />Jogadores insatisfeitos ({list.length})</h3>
      <p className="hint">A satisfação muda devagar com as oportunidades de jogo, a evolução, o salário, as propostas e a perspectiva de promoção. Só insatisfação longa vira pedido.</p>
      {list.length === 0 && <p className="hint">Ninguém insatisfeito agora.</p>}
      <ul className="tc-list">
        {list.map((p) => {
          const ask = askWage(game, p);
          return (
            <li key={p.player.id} className="mk-card tc-card ym-warn">
              <b>{line(p)}</b>
              <small>Humor: <b>{mood(p.sat ?? SAT_START)}</b> ({Math.round(p.sat ?? SAT_START)}/100) · motivação {Math.round(p.mot ?? 60)}</small>
              <small>{p.why?.length ? `Motivos: ${p.why.join(', ')}.` : 'Sem motivo claro registrado.'}</small>
              {p.want && <small className="yc-no">{p.want === 'transferencia' ? 'Pediu para ser negociado.' : 'Avisou que não quer renovar.'}</small>}
              <div className="ym-form">
                <label>Novo salário (R$)<input inputMode="numeric" value={wage[p.player.id] ?? String(ask)} onChange={(e) => setWage({ ...wage, [p.player.id]: e.target.value.replace(/\D/g, '') })} aria-label={`Novo salário de ${p.player.name}`} /></label>
                <button className="primary" onClick={() => run(renewContract(game, p.player.id, Number(wage[p.player.id] ?? ask), 2), `${p.player.name} renovou.`)}>Melhorar o contrato</button>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="hint">Dica: dar minutos (empréstimo), promover quem está pronto ou melhorar o salário aumenta a satisfação. {y.prospects.length} jovens na base.</p>
    </section>
  );
}
