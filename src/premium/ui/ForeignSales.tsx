import { acceptForeignSale, counterForeignSale, openSales, refuseForeignSale } from '../../engine/forsales';
import { clubInfoOf, dirClub } from '../../engine/market';
import type { GameState } from '../../engine/types';
import { formatBudget } from '../../newgame/format';
import { ClubBadge } from '../../ui/ClubBadge';

/** Propostas de clubes do exterior pelos seus jogadores (recurso Premium: carregado sob demanda). */
export function ForeignSalesSection({ game, onChange, notify }: { game: GameState; onChange: (g: GameState) => void; notify: (t: string, e?: boolean) => void }) {
  const sales = openSales(game);
  const doSale = (fn: () => { state: GameState; ok: boolean; text: string }) => { const r = fn(); onChange(r.state); notify(r.text, !r.ok); };
  if (!sales.length) return null;
  return (
    <section>
    <h3>Propostas de clubes do exterior ({sales.length})</h3>
    <ul className="tf-list">
      {sales.map((o) => {
        const p = game.teams[game.userClubId].players.find((x) => x.id === o.playerId), c = clubInfoOf(game, o.clubId), d = dirClub(game, o.clubId);
        if (!p || !c) return null;
        return (
          <li key={o.id} className="card tf-deal">
            <div className="row"><ClubBadge club={c} size={36} /><div className="grow"><b>{c.name}</b><small>{d ? `${d.flag} ${d.countryName} · ${d.divisionName}` : ''}</small></div><b>{formatBudget(o.fee)}</b></div>
            <p className="hint" style={{ margin: '4px 0' }}>Quer <b>{p.name}</b> ({p.pos}, overall {p.strength}, {p.age} anos). Pagamento à vista; salário no clube: {formatBudget(o.wage)} por ano, {o.years} {o.years === 1 ? 'ano' : 'anos'}. Vale até a rodada {o.expires}.</p>
            <div className="un-btns">
              <button className="btn main" onClick={() => doSale(() => acceptForeignSale(game, o.id))}>Aceitar e vender</button>
              <button className="btn" disabled={!!o.countered} onClick={() => doSale(() => counterForeignSale(game, o.id))}>{o.countered ? 'Já pediu mais' : 'Pedir 15% a mais'}</button>
              <button className="btn" onClick={() => onChange(refuseForeignSale(game, o.id))}>Recusar</button>
            </div>
          </li>
        );
      })}
    </ul>
        </section>
  );
}
