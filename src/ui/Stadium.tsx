import { useState } from 'react';
import { fixturesOfRound, userDivision } from '../engine/game';
import {
  attendanceAt, bestPrice, BOYCOTT, canUpgrade, capacityStep, comfortCost, expandCost, fairPrice, MAX_CAPACITY, MAX_COMFORT,
  setTicketPrice, stadiumOf, ticketPriceOf, upgradeStadium, type UpgradeKind,
} from '../engine/stadium';
import type { GameState } from '../engine/types';
import { formatBudget } from '../newgame/format';
import { fanBase, fanRanking, formatFans } from '../engine/fans';
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

  const lastHome = st.log[0];
  const seasonCrowd = st.log.filter((r) => r.season === game.season).reduce((t, r) => t + r.attendance, 0);
  const comfortPct = Math.round((st.comfort / MAX_COMFORT) * 100);
  const nextCap = Math.min(MAX_CAPACITY, st.capacity + capacityStep(game));
  const [priceTxt, setPriceTxt] = useState<string | null>(null);
  const commitPrice = () => { if (priceTxt !== null) { const v = Number(priceTxt.replace(/\D/g, '')); if (v > 0) onChange(setTicketPrice(game, v)); setPriceTxt(null); } };
  const preset = (v: number) => price === v;
  const fans = fanBase(game), rank = fanRanking(game, 5);

  return (
    <>
      <ScreenTitle icon="🏟️" title="Estádio" />
      <div className="card mk-card st-hero2">
        <img className="st-art" src="assets/ui/stadium-hero.jpg" alt="" />
        <div className="st-hero2-r">
          <b className="st-name">{club.stadium}</b>
          <span className="st-cap">👥 Capacidade: <b>{num(st.capacity)}</b></span>
          <div className="st-meter" aria-label={`Ocupação prevista ${Math.round((att / st.capacity) * 100)}%`}><i style={{ width: `${Math.min(100, (att / st.capacity) * 100)}%` }} /></div>
          <small>Próximo nível: {num(nextCap)} lugares</small>
          <small>Conforto: {comfortPct}% | Renda: + {formatBudget(att * price)}/jogo</small>
        </div>
      </div>

      <section className="mk-sec">
        <h3><span aria-hidden="true">👥</span> Torcida do clube</h3>
        <div className="card mk-card" data-testid="torcida">
          <p style={{ margin: 0, fontSize: 22 }}><b>{formatFans(fans)}</b> <small>de torcedores</small></p>
          <small>{rank.position}ª maior torcida entre os {rank.total} clubes do campeonato · humor da torcida: {Math.round(game.morale.fans)}%</small>
          <ul className="list" style={{ marginTop: 8 }}>
            {rank.top.map((r, i) => <li key={r.clubId} className={r.clubId === id ? 'row mine' : 'row'}><b>{i + 1}</b><span className="grow">{game.clubs[r.clubId].name}</span><b className="score">{formatFans(r.fans)}</b></li>)}
          </ul>
          <small>A torcida cresce com títulos e com o humor da torcida (resultados e ingresso justo); cair de divisão a encolhe só um pouco.</small>
        </div>
      </section>

      <section className="mk-sec">
        <h3><span aria-hidden="true">🎟️</span> Preço do ingresso</h3>
        <div className="card mk-card">
          <div className="st-ticket">
            <img className="st-ticket-art" src="assets/ui/ticket.jpg" alt="" />
            <div className="st-ticket-r">
              <small>Valor do ingresso</small>
              <div className="st-price">
                <button className="btn" aria-label="Diminuir preço" onClick={() => onChange(setTicketPrice(game, price - step))}>−</button>
                <input inputMode="numeric" aria-label="Valor do ingresso (R$)" value={priceTxt ?? brl(price)} onFocus={(e) => { setPriceTxt(String(price)); e.target.select(); }} onChange={(e) => setPriceTxt(e.target.value)} onBlur={commitPrice} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
                <button className="btn" aria-label="Aumentar preço" onClick={() => onChange(setTicketPrice(game, price + step))}>+</button>
              </div>
              <p className={`st-pred ${verdict.c}`}>Previsão de público: {num(att)} pessoas</p>
            </div>
          </div>
          <div className="mk-rows">
            <div><span>👥 Renda por partida:</span><b>{brl(att * price)}</b></div>
            <div><span>🎯 Preço justo hoje:</span><b>{brl(fair)}</b></div>
            <div><span>📈 Preço de maior renda:</span><b className="pos">{brl(best)}</b></div>
          </div>
          <div className="mk-presets">
            <button className={preset(Math.round(fair * 0.7)) ? 'on' : ''} onClick={() => onChange(setTicketPrice(game, Math.round(fair * 0.7)))}>Popular<small>{brl(Math.round(fair * 0.7))}</small></button>
            <button className={preset(fair) ? 'on' : ''} onClick={() => onChange(setTicketPrice(game, fair))}>Justo<small>{brl(fair)}</small></button>
            <button className={preset(best) ? 'on' : ''} onClick={() => onChange(setTicketPrice(game, best))}>Maior renda<small>{brl(best)}</small></button>
          </div>
          <p className={`mk-info ${verdict.c}`}><span aria-hidden="true">ℹ️</span> {verdict.t} A torcida só vai se o ingresso for viável para o jogo: preço muito acima do justo esvazia o estádio e irrita os torcedores.</p>
        </div>
      </section>

      <section className="mk-sec">
        <h3><span aria-hidden="true">📊</span> Renda do estádio</h3>
        <div className="card mk-card st-income">
          <span className="st-bars" aria-hidden="true">📊</span>
          <div className="mk-rows">
            <div><span>📅 Última partida em casa:</span><b className="pos">{lastHome ? `+ ${formatBudget(lastHome.revenue)}` : '—'}</b></div>
            <div><span>👥 Público total na temporada:</span><b>{num(seasonCrowd)}</b></div>
            <div><span>💰 Bilheteria na temporada:</span><b className="pos">{formatBudget(total)}</b></div>
            <div><span>📈 Média de público:</span><b>{log.length ? num(avg) : '—'}</b></div>
          </div>
        </div>
        {log.length > 0 && (
          <ul className="list">
            {log.map((r, i) => (
              <li key={i}><div className="row"><span className="grow">{r.comp ? `${r.comp} · ` : ''}Rodada {r.round} · {game.clubs[r.opponentId]?.shortName ?? game.clubs[r.opponentId]?.name ?? '—'}<small>{num(r.attendance)} de {num(r.capacity)} ({Math.round((r.attendance / r.capacity) * 100)}%) · ingresso {brl(r.price)}</small></span><b className="pos">{formatBudget(r.revenue)}</b></div></li>
            ))}
          </ul>
        )}
      </section>

      <section className="mk-sec">
        <h3><span aria-hidden="true">🏗️</span> Melhorar estádio</h3>
        <div className="card mk-card st-up">
          <img className="st-up-art" src="assets/ui/stadium-build.jpg" alt="" />
          <div className="st-up-r">
            <span>Ampliar arquibancadas</span>
            <b>{num(st.capacity)} → {num(nextCap)} lugares</b>
            <span className="st-cost">🪙 {formatBudget(expandCost(game))}</span>
          </div>
          <button className="primary mk-big" disabled={!capChk.ok} onClick={() => upg('capacity')}>⏫ Ampliar arquibancadas</button>
          {!capChk.ok && <p className="hint neg">{capChk.reason}</p>}
        </div>
        <div className="card mk-card st-up">
          <img className="st-up-art" src="assets/ui/stadium-build.jpg" alt="" />
          <div className="st-up-r">
            <span>Modernizar (gramado, cadeiras, camarotes)</span>
            <b>Nível {st.comfort}/{MAX_COMFORT} · conforto {comfortPct}%</b>
            <span className="st-cost">🪙 {st.comfort >= MAX_COMFORT ? '—' : formatBudget(comfortCost(game))}</span>
          </div>
          <button className="primary mk-big" disabled={!comChk.ok} onClick={() => upg('comfort')}>⏫ Modernizar estádio</button>
          {!comChk.ok && <p className="hint neg">{comChk.reason}</p>}
          <p className="mk-info"><span aria-hidden="true">ℹ️</span> Caixa do clube: {formatBudget(game.budgets[id])}. Ampliar só compensa se a procura passa da capacidade (estádio lotado). Modernizar valoriza o ingresso e aumenta a procura.</p>
        </div>
      </section>
    </>
  );
}
