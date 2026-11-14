import { fixturesOfRound, userDivision } from '../engine/game';
import {
  attendanceAt, bestPrice, BOYCOTT, canUpgrade, capacityStep, comfortCost, expandCost, fairPrice, MAX_COMFORT,
  setTicketPrice, stadiumOf, ticketPriceOf, upgradeStadium, type UpgradeKind,
} from '../engine/stadium';
import type { GameState } from '../engine/types';
import { formatBudget } from '../newgame/format';
import { ScreenTitle } from './FmParts';

export const brl = (v: number) => `R$ ${v.toLocaleString('pt-BR')}`;
const num = (v: number) => v.toLocaleString('pt-BR');

interface Props { game: GameState; onChange: (g: GameState) => void; onBack?: () => void }

/** Estádio: preço do ingresso, público e renda dos jogos e obras de melhoria. */
export function Stadium({ game, onChange }: Props) {
  const st = stadiumOf(game);
  const id = game.userClubId;
  const fair = fairPrice(game);
  const price = ticketPriceOf(game);
  const club = game.clubs[id];
  const f = fixturesOfRound(game, game.round, userDivision(game).id).find((x) => x.homeId === id);
  const opp = f?.awayId ?? Object.keys(game.clubs).find((c) => c !== id)!;
  const att = attendanceAt(game, opp, price);
  const best = bestPrice(game, opp);
  const ratio = price / fair;
  const verdict = ratio > BOYCOTT ? { t: 'Absurdo: a torcida vai boicotar.', c: 'neg' } : ratio > 1.3 ? { t: 'Caro: o estádio deve ficar vazio e a torcida reclama.', c: 'neg' } : ratio > 1.08 ? { t: 'Salgado, mas ainda viável.', c: '' } : ratio < 0.85 ? { t: 'Barato: lota e a torcida adora, mas você perde renda.', c: '' } : { t: 'Preço justo para o momento.', c: 'pos' };
  const log = st.log.slice(0, 10);
  const avg = log.length ? Math.round(log.reduce((s, r) => s + r.attendance, 0) / log.length) : 0;
  const total = st.log.filter((r) => r.season === game.season).reduce((s, r) => s + r.revenue, 0);
  const step = Math.max(1, Math.round(fair / 20));
  const upg = (k: UpgradeKind) => onChange(upgradeStadium(game, k));
  const capChk = canUpgrade(game, 'capacity'), comChk = canUpgrade(game, 'comfort');

  return (
    <>
      <ScreenTitle icon="🏟️" title="Estádio" />
      <div className="card center st-hero">
        <small>🏟️ {club.stadium}</small>
        <h2>{num(st.capacity)} lugares</h2>
        <div className="st-meter" aria-label={`Ocupação prevista ${Math.round((att / st.capacity) * 100)}%`}><i style={{ width: `${Math.min(100, (att / st.capacity) * 100)}%` }} /></div>
        <p className="hint">Próximo jogo em casa{f ? '' : ' (estimativa)'}: <b>{num(att)}</b> torcedores · <b>{formatBudget(att * price)}</b> de renda</p>
      </div>

      <section>
        <h3>Preço do ingresso</h3>
        <div className="card">
          <div className="st-price">
            <button className="btn" aria-label="Diminuir preço" onClick={() => onChange(setTicketPrice(game, price - step))}>−</button>
            <b>{brl(price)}</b>
            <button className="btn" aria-label="Aumentar preço" onClick={() => onChange(setTicketPrice(game, price + step))}>+</button>
          </div>
          <p className={`hint ${verdict.c}`}>{verdict.t}</p>
          <div className="row"><span className="grow">Preço justo hoje</span><b>{brl(fair)}</b></div>
          <div className="row"><span className="grow">Preço de maior renda no próximo jogo</span><b>{brl(best)}</b></div>
          <div className="chips">
            <button onClick={() => onChange(setTicketPrice(game, Math.round(fair * 0.7)))}>Popular</button>
            <button onClick={() => onChange(setTicketPrice(game, fair))}>Justo</button>
            <button onClick={() => onChange(setTicketPrice(game, best))}>Maior renda</button>
          </div>
          <p className="hint">A torcida só vai ao estádio se o ingresso for viável para o jogo: rival forte e torcida animada aguentam preço maior; preço muito acima do justo esvazia o estádio e irrita os torcedores.</p>
        </div>
      </section>

      <section>
        <h3>Público e renda</h3>
        <div className="card">
          <div className="row"><span className="grow">Renda de bilheteria na temporada</span><b className="pos">{formatBudget(total)}</b></div>
          <div className="row"><span className="grow">Média de público (últimos jogos)</span><b>{log.length ? num(avg) : '—'}</b></div>
        </div>
        {log.length === 0 ? <p className="hint">Ainda não houve jogo em casa.</p> : (
          <ul className="list">
            {log.map((r, i) => (
              <li key={i}><div className="row"><span className="grow">{r.comp ? `${r.comp} · ` : ''}Rodada {r.round} · {game.clubs[r.opponentId]?.shortName ?? game.clubs[r.opponentId]?.name ?? '—'}<small>{num(r.attendance)} de {num(r.capacity)} ({Math.round((r.attendance / r.capacity) * 100)}%) · ingresso {brl(r.price)}</small></span><b className="pos">{formatBudget(r.revenue)}</b></div></li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3>Melhorar o estádio</h3>
        <div className="card">
          <div className="row"><span className="grow">Ampliar arquibancadas<small>+{num(capacityStep(game))} lugares</small></span><b>{formatBudget(expandCost(game))}</b></div>
          <button className="primary" disabled={!capChk.ok} onClick={() => upg('capacity')}>Ampliar</button>
          {!capChk.ok && <p className="hint neg">{capChk.reason}</p>}
        </div>
        <div className="card">
          <div className="row"><span className="grow">Modernizar (gramado, cadeiras, camarotes)<small>Nível {st.comfort} de {MAX_COMFORT} · ingresso mais valorizado e mais procura</small></span><b>{st.comfort >= MAX_COMFORT ? '—' : formatBudget(comfortCost(game))}</b></div>
          <button className="primary" disabled={!comChk.ok} onClick={() => upg('comfort')}>Modernizar</button>
          {!comChk.ok && <p className="hint neg">{comChk.reason}</p>}
          <p className="hint">Caixa do clube: {formatBudget(game.budgets[id])}. Ampliar só compensa se a procura passa da capacidade (estádio lotado).</p>
        </div>
      </section>
    </>
  );
}
