import { useMemo, useState } from 'react';
import { ScreenTitle, SubTabs } from './FmParts';
import { anyClubName } from '../engine/market';
import { Clubs } from './Clubs';
import { NegotiationSheet } from './Negotiation';
import { acceptOffer, myValue, rejectOffer, toggleLoanList, toggleTransferList } from '../engine/roster';
import { BUY_BLOCK_TEXT, buyPlayer, MAX_SQUAD, marketEntries } from '../engine/transfers';
import { banOf, FAIRPLAY_LIMIT, fairplayBlock, fairplayWarning, signingsThisSeason } from '../engine/fairplay';
import { loanIn, loanMarket } from '../engine/loanin';
import type { GameState, Position, Transfer } from '../engine/types';
import { formatBudget } from '../newgame/format';

const POS_SHORT: Record<Position, string> = { GK: 'GOL', DEF: 'DEF', MID: 'MEI', ATT: 'ATA' };
const POS_FILTERS: { id: 'ALL' | Position; label: string }[] = [
  { id: 'ALL', label: 'Todos' }, { id: 'GK', label: 'GOL' }, { id: 'DEF', label: 'DEF' }, { id: 'MID', label: 'MEI' }, { id: 'ATT', label: 'ATA' },
];
type Sort = 'ovr' | 'priceAsc' | 'priceDesc' | 'age';
const PAGE = 30;
const tier = (n: number) => (n >= 75 ? 'hi' : n >= 62 ? 'mid' : 'lo');
/** Minúsculas e sem acentos, para a busca. */
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const KIND_LABEL: Record<Transfer['kind'], string> = { buy: 'Contratação', sale: 'Venda', loan: 'Empréstimo cedido', release: 'Dispensa', loanin: 'Empréstimo recebido' };

/** Propostas recebidas, listas de venda/empréstimo e movimentações da temporada. */
function Offers({ game, onChange }: { game: GameState; onChange: (g: GameState) => void }) {
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const team = game.teams[game.userClubId];
  const pl = (id: string) => team.players.find((p) => p.id === id);
  const moves = game.transfers.filter((t) => t.season === game.season);
  const answer = (id: string, accept: boolean) => {
    const o = game.offers.find((x) => x.id === id)!;
    const p = pl(o.playerId);
    if (!accept) { onChange(rejectOffer(game, id)); setNotice({ text: 'Proposta recusada.' }); return; }
    const r = acceptOffer(game, id);
    onChange(r.state);
    setNotice(r.result.ok ? { text: `✔ ${p?.name} ${o.kind === 'buy' ? 'vendido ao' : 'emprestado ao'} ${game.clubs[o.clubId].name} por ${formatBudget(o.fee)}.` } : { text: r.result.text, error: true });
  };

  return (
    <>
      <div role="status" aria-live="polite">{notice && <p className={`tf-notice ${notice.error ? 'err' : ''}`}>{notice.text}</p>}</div>

      <section>
        <h3>Propostas recebidas ({game.offers.length})</h3>
        {game.offers.length === 0 ? (
          <div className="card"><p className="hint" style={{ margin: 0 }}>Nenhuma proposta no momento. Coloque jogadores nas listas de transferência ou de empréstimo (aba Elenco) e jogue as rodadas: os clubes podem fazer propostas.</p></div>
        ) : (
          <ul className="tf-list">
            {game.offers.map((o) => {
              const p = pl(o.playerId);
              if (!p) return null;
              return (
                <li key={o.id} className="tf-item">
                  <div className="tf-row">
                    <span className={`tf-ovr ${tier(p.strength)}`}>{p.strength}</span>
                    <div className="tf-info">
                      <strong>{p.name}</strong>
                      <small><em className={`pill ${o.kind === 'buy' ? 'sale' : 'loan'}`}>{o.kind === 'buy' ? 'Compra' : 'Empréstimo'}</em> {game.clubs[o.clubId].name} · vale até a rodada {o.expiresRound}</small>
                    </div>
                    <span className="tf-price">{formatBudget(o.fee)}</span>
                  </div>
                  <div className="tf-confirm">
                    <button className="primary" onClick={() => answer(o.id, true)}>Aceitar</button>
                    <button className="btn" onClick={() => answer(o.id, false)}>Recusar</button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {([['Na lista de transferência', game.transferList, toggleTransferList], ['Na lista de empréstimo', game.loanList, toggleLoanList]] as const).map(([title, ids, toggle]) => (
        <section key={title}>
          <h3>{title} ({ids.length})</h3>
          <div className="card">
            {ids.length === 0 ? <p className="hint" style={{ margin: 0 }}>Nenhum jogador. Toque em um jogador na aba Elenco para colocá-lo aqui.</p> : (
              <ul className="tf-log">
                {ids.map((id) => { const p = pl(id); if (!p) return null; return (
                  <li key={id} className="tf-lrow"><span><b>{p.name}</b> <small>({POS_SHORT[p.pos]}, overall {p.strength}) · valor {formatBudget(myValue(game, p))}</small></span><button className="mini" onClick={() => onChange(toggle(game, id))}>Retirar</button></li>
                ); })}
              </ul>
            )}
          </div>
        </section>
      ))}

      <section>
        <h3>Movimentações da temporada {game.season}</h3>
        <div className="card">
          {moves.length === 0 ? <p className="hint" style={{ margin: 0 }}>Nenhuma movimentação ainda.</p> : (
            <ul className="tf-log">
              {[...moves].reverse().map((t, i) => (
                <li key={`${t.playerId}-${i}`}><b>{KIND_LABEL[t.kind]}:</b> {t.playerName} <small>({POS_SHORT[t.pos]}, overall {t.strength}){t.kind === 'buy' ? ` · de ${anyClubName(game, t.fromClubId)}` : t.kind === 'release' ? '' : ` · para ${anyClubName(game, t.toClubId)}`}{t.fee > 0 ? ` · ${formatBudget(t.fee)}` : ''} · rodada {t.round}</small></li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </>
  );
}

/** Notícias do mercado: o que a IA dos outros clubes está fazendo (contratações, investimentos, crises). */
function News({ game }: { game: GameState }) {
  return (
    <section>
      <h3>Notícias do mercado</h3>
      <div className="card">
        {game.news.length === 0 ? <p className="hint" style={{ margin: 0 }}>Ainda sem notícias. Os outros clubes contratam e vendem no meio da temporada (rodada 19) e na virada da temporada.</p> : (
          <ul className="news">
            {game.news.map((n, i) => <li key={i} className={n.tone}>{n.text}<small>Temporada {n.season} · rodada {n.round}</small></li>)}
          </ul>
        )}
      </div>
    </section>
  );
}

/** Fair play financeiro: contratações da temporada, aviso de meta atingida e transfer ban. */
function FairplayBar({ game }: { game: GameState }) {
  const n = signingsThisSeason(game);
  const block = fairplayBlock(game), warn = fairplayWarning(game);
  return (
    <div className="card" role={block || warn ? 'alert' : undefined}>
      <p style={{ margin: 0 }}>⚖️ <b>Fair play financeiro:</b> {Math.min(n, 99)}/{FAIRPLAY_LIMIT} contratações nesta temporada (compra ou empréstimo).</p>
      {block ? <p className="un-warn" style={{ margin: '6px 0 0' }}>{block}</p> : warn ? <p className="un-warn" style={{ margin: '6px 0 0' }}>{warn}</p> : <p className="hint" style={{ margin: '6px 0 0' }}>Passou de {FAIRPLAY_LIMIT} contratações na temporada, o clube fica 1 ano sem poder contratar (transfer ban).</p>}
    </div>
  );
}

/** Transferências: comprar jogadores de outros clubes e responder às propostas pelos seus. */
export function Transfers({ game, onChange, view, onView }: { game: GameState; onChange: (g: GameState) => void; view: 'clubs' | 'buy' | 'offers' | 'news'; onView: (v: 'clubs' | 'buy' | 'offers' | 'news') => void }) {
  return (
    <>
      <ScreenTitle icon="🔁" title="Transferências" />
      <SubTabs items={[
        { icon: '👥', label: 'Clubes', on: view === 'clubs', onClick: () => onView('clubs') },
        { icon: '🔎', label: 'Mercado', on: view === 'buy', onClick: () => onView('buy') },
        { icon: '📄', label: `Propostas${game.offers.length > 0 ? ` (${game.offers.length})` : ''}`, on: view === 'offers', onClick: () => onView('offers') },
        { icon: '📰', label: 'Notícias', on: view === 'news', onClick: () => onView('news') },
      ]} />
      <FairplayBar game={game} />
      {view === 'clubs' ? <Clubs game={game} onChange={onChange} /> : view === 'buy' ? <Market game={game} onChange={onChange} /> : view === 'offers' ? <Offers game={game} onChange={onChange} /> : <News game={game} />}
    </>
  );
}

function Market({ game, onChange }: { game: GameState; onChange: (g: GameState) => void }) {
  const [q, setQ] = useState('');
  const [pos, setPos] = useState<'ALL' | Position>('ALL');
  const [division, setDivision] = useState('all');
  const [afford, setAfford] = useState(true);
  const [mode, setMode] = useState<'buy' | 'loan'>('buy');
  const [sort, setSort] = useState<Sort>('ovr');
  const [shown, setShown] = useState(PAGE);
  const [neg, setNeg] = useState<{ clubId: string; id: string } | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);

  const budget = game.budgets[game.userClubId];
  const squadSize = game.teams[game.userClubId].players.length;
  const full = squadSize >= MAX_SQUAD;
  const divisionOf = useMemo(() => {
    const m = new Map<string, { id: string; name: string }>();
    for (const d of game.divisions) for (const id of d.clubIds) m.set(id, { id: d.id, name: d.name });
    return m;
  }, [game.divisions]);
  const entries = useMemo(() => (mode === 'loan' ? loanMarket(game).map((e) => ({ player: e.player, clubId: e.clubId, price: e.fee })) : marketEntries(game)), [game.teams, game.userClubId, game.season, game.loansIn, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const nq = norm(q.trim());
    const list = entries.filter((e) =>
      (pos === 'ALL' || e.player.pos === pos) &&
      (division === 'all' || divisionOf.get(e.clubId)?.id === division) &&
      (!afford || e.price <= budget) &&
      (!nq || norm(e.player.name).includes(nq) || norm(game.clubs[e.clubId].name).includes(nq)));
    const by: Record<Sort, (a: typeof list[number], b: typeof list[number]) => number> = {
      ovr: (a, b) => b.player.strength - a.player.strength || a.price - b.price,
      priceAsc: (a, b) => a.price - b.price || b.player.strength - a.player.strength,
      priceDesc: (a, b) => b.price - a.price,
      age: (a, b) => a.player.age - b.player.age || b.player.strength - a.player.strength,
    };
    return list.sort(by[sort]);
  }, [entries, pos, division, afford, q, sort, budget, divisionOf, game.clubs]);

  const reset = (fn: () => void) => { fn(); setShown(PAGE); setConfirmId(null); };
  const banned = !!banOf(game);

  const confirm = (id: string) => {
    if (mode === 'loan') {
      const lr = loanIn(game, id);
      if (!lr.check.ok) { setNotice({ text: lr.check.reason, error: true }); setConfirmId(null); return; }
      onChange(lr.state); setConfirmId(null);
      setNotice({ text: `🤝 ${lr.check.entry.player.name} emprestado do ${game.clubs[lr.check.entry.clubId].name} até o fim da temporada por ${formatBudget(lr.check.entry.fee)}.${fairplayWarning(lr.state) ? ` ${fairplayWarning(lr.state)}` : ''}` });
      return;
    }
    const r = buyPlayer(game, id);
    if (!r.check.ok) { setNotice({ text: BUY_BLOCK_TEXT[r.check.reason], error: true }); setConfirmId(null); return; }
    const e = entries.find((x) => x.player.id === id)!;
    onChange(r.state);
    setConfirmId(null);
    setNotice({ text: `✔ ${e.player.name} contratado do ${game.clubs[e.clubId].name} por ${formatBudget(r.check.price)}.` });
  };


  return (
    <>
      <div className="card">
        <div className="tf-top">
          <div><small>Orçamento</small><b>{formatBudget(budget)}</b></div>
          <div><small>Elenco</small><b>{squadSize}/{MAX_SQUAD}</b></div>
          <div><small>Contratações (fair play)</small><b>{signingsThisSeason(game)}/{FAIRPLAY_LIMIT}</b></div>
        </div>
        <div className="chips" role="tablist" aria-label="Tipo de contratação" style={{ marginBottom: 8 }}>
          <button role="tab" aria-selected={mode === 'buy'} className={mode === 'buy' ? 'on' : ''} onClick={() => reset(() => setMode('buy'))}>💰 Comprar</button>
          <button role="tab" aria-selected={mode === 'loan'} className={mode === 'loan' ? 'on' : ''} onClick={() => reset(() => setMode('loan'))}>🤝 Empréstimo</button>
        </div>
        {mode === 'loan' && <p className="hint" style={{ margin: '0 0 8px' }}>Jogadores que os clubes colocaram na lista de empréstimo. Você paga uma taxa, o jogador fica até o fim da temporada e volta ao clube dono. Conta como contratação no fair play.</p>}
        <div className="tf-filters">
          <input type="search" aria-label="Buscar jogador ou clube" placeholder="Buscar jogador ou clube" value={q} onChange={(e) => reset(() => setQ(e.target.value))} />
          <div className="tf-pos" role="group" aria-label="Posição">
            {POS_FILTERS.map((f) => <button key={f.id} className={pos === f.id ? 'on' : ''} aria-pressed={pos === f.id} onClick={() => reset(() => setPos(f.id))}>{f.label}</button>)}
          </div>
          <select aria-label="Divisão" value={division} onChange={(e) => reset(() => setDivision(e.target.value))}>
            <option value="all">Todas as divisões</option>
            {game.divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <select aria-label="Ordenar por" value={sort} onChange={(e) => reset(() => setSort(e.target.value as Sort))}>
            <option value="ovr">Maior overall</option><option value="priceAsc">Menor preço</option><option value="priceDesc">Maior preço</option><option value="age">Mais jovens</option>
          </select>
          <label className="tf-check"><input type="checkbox" className="check" checked={afford} onChange={(e) => reset(() => setAfford(e.target.checked))} /> Só quem cabe no meu orçamento</label>
        </div>
      </div>

      <div role="status" aria-live="polite">{notice && <p className={`tf-notice ${notice.error ? 'err' : ''}`}>{notice.text}</p>}</div>

      <p className="tf-count">{filtered.length} jogadores encontrados{full ? ' · elenco cheio, não é possível contratar' : ''}</p>
      <ul className="tf-list">
        {filtered.slice(0, shown).map(({ player: p, clubId, price }) => {
          const club = game.clubs[clubId];
          const tooExpensive = price > budget;
          const open = confirmId === p.id;
          return (
            <li key={p.id} className="tf-item">
              <div className="tf-row">
                <span className={`tf-ovr ${tier(p.strength)}`} title="Overall">{p.strength}</span>
                <div className="tf-info">
                  <strong>{p.name}</strong>
                  <small>{POS_SHORT[p.pos]} · {p.age} anos · {club.name} ({divisionOf.get(clubId)?.name})</small>
                </div>
                <span className={`tf-price ${tooExpensive ? 'no' : ''}`}>{formatBudget(price)}</span>
                {mode === 'loan'
                  ? <button className="tf-buy" disabled={tooExpensive || full || banned} onClick={() => { setNotice(null); setConfirmId(open ? null : p.id); }} aria-label={`Pegar ${p.name} emprestado`}>Emprestar</button>
                  : <button className="tf-buy" disabled={tooExpensive || full || banned} onClick={() => { setNotice(null); setNeg({ clubId, id: p.id }); }} aria-label={`Negociar ${p.name}`}>Negociar</button>}
              </div>
              {open && (
                <div className="tf-confirm">
                  <p>{mode === 'loan' ? 'Pegar emprestado' : 'Contratar'} <b>{p.name}</b> do <b>{club.name}</b> por <b>{formatBudget(price)}</b>{mode === 'loan' ? ' (até o fim da temporada)' : ''}? Orçamento depois: <b>{formatBudget(budget - price)}</b> · Elenco: {squadSize} → {squadSize + 1}.</p>
                  {fairplayWarning(game) && <p className="un-warn">{fairplayWarning(game)}</p>}
                  <button className="primary" onClick={() => confirm(p.id)}>{mode === 'loan' ? 'Confirmar empréstimo' : 'Confirmar contratação'}</button>
                  <button className="btn" onClick={() => setConfirmId(null)}>Cancelar</button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {filtered.length === 0 && <div className="card center"><p className="hint">Nenhum jogador com esses filtros. {afford && 'Desmarque "Só quem cabe no meu orçamento" para ver todos.'}</p></div>}
      {neg && <NegotiationSheet game={game} clubId={neg.clubId} playerId={neg.id} onChange={onChange} onClose={() => setNeg(null)} onDone={(m) => { setNeg(null); setNotice({ text: `✔ ${m}` }); }} />}
      {filtered.length > shown && <button className="btn tf-more" onClick={() => setShown(shown + PAGE)}>Mostrar mais ({filtered.length - shown})</button>}

    </>
  );
}
