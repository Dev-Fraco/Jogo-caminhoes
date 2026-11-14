import { useMemo, useState } from 'react';
import { BUY_BLOCK_TEXT, buyPlayer, MAX_SQUAD, marketEntries } from '../engine/transfers';
import type { GameState, Position } from '../engine/types';
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

/** Transferências: o clube do jogador contrata jogadores de outros clubes, pagando o preço de mercado. */
export function Transfers({ game, onChange }: { game: GameState; onChange: (g: GameState) => void }) {
  const [q, setQ] = useState('');
  const [pos, setPos] = useState<'ALL' | Position>('ALL');
  const [division, setDivision] = useState('all');
  const [afford, setAfford] = useState(true);
  const [sort, setSort] = useState<Sort>('ovr');
  const [shown, setShown] = useState(PAGE);
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
  const entries = useMemo(() => marketEntries(game), [game.teams, game.userClubId]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const confirm = (id: string) => {
    const r = buyPlayer(game, id);
    if (!r.check.ok) { setNotice({ text: BUY_BLOCK_TEXT[r.check.reason], error: true }); setConfirmId(null); return; }
    const e = entries.find((x) => x.player.id === id)!;
    onChange(r.state);
    setConfirmId(null);
    setNotice({ text: `✔ ${e.player.name} contratado do ${game.clubs[e.clubId].name} por ${formatBudget(r.check.price)}.` });
  };

  const mine = game.transfers.filter((t) => t.season === game.season);

  return (
    <>
      <div className="card">
        <div className="tf-top">
          <div><small>Orçamento</small><b>{formatBudget(budget)}</b></div>
          <div><small>Elenco</small><b>{squadSize}/{MAX_SQUAD}</b></div>
          <div><small>Contratações na temporada</small><b>{mine.length}</b></div>
        </div>
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
                <button className="tf-buy" disabled={tooExpensive || full} onClick={() => setConfirmId(open ? null : p.id)} aria-expanded={open} aria-label={`Contratar ${p.name}`}>Contratar</button>
              </div>
              {open && (
                <div className="tf-confirm">
                  <p>Contratar <b>{p.name}</b> do <b>{club.name}</b> por <b>{formatBudget(price)}</b>? Orçamento depois: <b>{formatBudget(budget - price)}</b> · Elenco: {squadSize} → {squadSize + 1}.</p>
                  <button className="primary" onClick={() => confirm(p.id)}>Confirmar contratação</button>
                  <button className="btn" onClick={() => setConfirmId(null)}>Cancelar</button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {filtered.length === 0 && <div className="card center"><p className="hint">Nenhum jogador com esses filtros. {afford && 'Desmarque "Só quem cabe no meu orçamento" para ver todos.'}</p></div>}
      {filtered.length > shown && <button className="btn tf-more" onClick={() => setShown(shown + PAGE)}>Mostrar mais ({filtered.length - shown})</button>}

      <section>
        <h3>Suas contratações na temporada {game.season}</h3>
        <div className="card">
          {mine.length === 0 ? <p className="hint" style={{ margin: 0 }}>Nenhuma contratação ainda.</p> : (
            <ul className="tf-log">
              {[...mine].reverse().map((t) => (
                <li key={t.playerId}><b>{t.playerName}</b> ({POS_SHORT[t.pos]}, overall {t.strength}) <small>· de {game.clubs[t.fromClubId].name} · {formatBudget(t.fee)} · rodada {t.round}</small></li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </>
  );
}
