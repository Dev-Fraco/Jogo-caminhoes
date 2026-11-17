import { useState } from 'react';
import { audio } from '../audio/audio';
import { academyCost, academyCostTable, academyPercent, academySpeed, dedicationWith, facilityCost, facilityDef, FACILITIES, facLevel, gapWindow, injuryDurationFactor, intakeCount, MAX_ACADEMY_LEVEL, MAX_FACILITY_LEVEL, potentialBonus, totals, upgradeAcademy, upgradeFacility, youthCapacity, type FacilityId } from '../engine/academy';
import { starsOf } from '../engine/coaches';
import { youthOf } from '../engine/youth';
import type { GameState } from '../engine/types';
import { formatBudget } from '../newgame/format';

const pct = (v: number) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1).replace('.', ',')}%`;

/** Efeitos ATUAIS de cada instalação, calculados pelas mesmas funções que o jogo usa no treino, nas lesões e na base. */
function effects(g: GameState, f: FacilityId): string[] {
  const y = youthOf(g), l = facLevel(y, f) - 1;
  switch (f) {
    case 'centro': return [`Treino técnico/tático: ${pct(0.012 * l)} · todos os treinos: ${pct(0.004 * l)}`, `Bônus para treinadores de técnica/tática: ${pct(0.006 * l)}`];
    case 'fisica': return [`Treino físico: ${pct(0.015 * l)} · preparação geral: ${pct(0.003 * l)}`, `Bônus para treinadores de preparação física: ${pct(0.006 * l)}`];
    case 'medico': return [`Lesões leves do elenco: ${pct(injuryDurationFactor(y, 'leve') - 1)} de duração`, `Lesões graves: ${pct(injuryDurationFactor(y, 'grave') - 1)} (nunca abaixo de 1 mês)`];
    case 'alojamento': return [`Dedicação dos jovens: ${pct(dedicationWith(1, y) - 1)}`, `Vagas na base: ${youthCapacity(y)}`];
    case 'campos': return [`Fundamentos: ${pct(0.015 * l)} · técnico/tático: ${pct(0.006 * l)} · treinos práticos: ${pct(0.002 * l)}`, `Bônus para treinadores especialistas de posição: ${pct(0.005 * l)}`];
  }
}

/** Gestão da academia: nível geral (20 níveis), cinco instalações, caixa, custos, benefícios, histórico e treinadores disponíveis. */
export function AcademyScreen({ game, onChange }: { game: GameState; onChange: (g: GameState) => void }) {
  const y = youthOf(game);
  const cash = game.budgets[game.userClubId] ?? 0;
  const level = y.level, percent = academyPercent(y);
  const next = level < MAX_ACADEMY_LEVEL ? academyCost(game) : 0;
  const [ask, setAsk] = useState<'academia' | FacilityId | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [table, setTable] = useState(false);
  const tot = totals(y);
  const market = y.market?.list ?? [];
  const best = market.reduce((m, c) => Math.max(m, starsOf(c.rating)), 0);
  const top = [...market].sort((a, b) => b.rating - a.rating).slice(0, 3);
  const costOf = (k: 'academia' | FacilityId) => (k === 'academia' ? next : facilityCost(game, k));
  const nameOf = (k: 'academia' | FacilityId) => (k === 'academia' ? 'a academia' : facilityDef(k).label);

  const confirm = () => {
    if (!ask) return;
    const r = ask === 'academia' ? upgradeAcademy(game) : upgradeFacility(game, ask);
    if (!r.ok) { setMsg({ text: r.error, ok: false }); audio.sfx('error'); setAsk(null); return; }
    onChange(r.state); audio.sfx('cash'); setMsg({ text: `Investimento de ${formatBudget(costOf(ask))} feito em ${nameOf(ask)}.`, ok: true }); setAsk(null);
  };
  const Confirm = ({ k }: { k: 'academia' | FacilityId }) => {
    const c = costOf(k);
    return (
      <div className="ac-confirm" role="alertdialog" aria-label="Confirmar investimento">
        <p>Investir <b>{formatBudget(c)}</b> em {nameOf(k)}? Caixa depois: <b>{formatBudget(cash - c)}</b>.</p>
        <div className="tc-btns"><button className="primary" disabled={cash < c} onClick={confirm}>Confirmar</button><button className="btn" onClick={() => setAsk(null)}>Cancelar</button></div>
      </div>
    );
  };

  return (
    <>
      <section className="card mk-card ac-top">
        <div className="yt-lv"><b>Academia</b><span>Nível {level} / {MAX_ACADEMY_LEVEL}</span></div>
        <div className="cp-bar" role="progressbar" aria-label="Desenvolvimento da academia" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${percent}%` }} /></div>
        <p className="ac-pct"><b>{percent}%</b> de desenvolvimento{level < MAX_ACADEMY_LEVEL ? ` · faltam ${MAX_ACADEMY_LEVEL - level} nível(is)` : ' · nível máximo'}</p>
        <div className="yt-info"><span>🏦 Disponível: <b>{formatBudget(cash)}</b></span><span>💰 Total investido: <b>{formatBudget(tot.obras)}</b></span></div>
        {level < MAX_ACADEMY_LEVEL ? (
          <>
            <p className="hint">Próxima melhoria (nível {level + 1}): <b>{formatBudget(next)}</b>. {cash >= next ? 'Você tem caixa.' : `Faltam ${formatBudget(next - cash)}.`}</p>
            <div className="cp-bar" aria-label="Caixa em relação ao custo"><i style={{ width: `${Math.min(100, (cash / Math.max(1, next)) * 100)}%` }} /></div>
            {ask === 'academia' ? <Confirm k="academia" /> : <button className="primary mk-big" disabled={cash < next} onClick={() => setAsk('academia')}>⏫ Melhorar a academia · {formatBudget(next)}</button>}
          </>
        ) : <p className="hint">A academia já está no nível máximo.</p>}
        {msg && <p className={`shop-msg ${msg.ok ? 'ok' : 'bad'}`} role="status">{msg.text}</p>}
        <button className="btn ac-tbl" onClick={() => setTable(!table)}>{table ? 'Esconder' : 'Ver'} tabela de custos dos 20 níveis</button>
        {table && <ol className="ac-table">{academyCostTable(game).map((c, i) => <li key={i} className={i === level ? 'on' : ''}><span>Nível {i} → {i + 1}</span><b>{formatBudget(c)}</b></li>)}</ol>}
      </section>

      <section className="mk-sec">
        <h3><span className="yt-bar2" aria-hidden="true" />O que a academia dá hoje (nível {level})</h3>
        <ul className="ac-ben">
          <li>⚡ Velocidade do treino: <b>×{academySpeed(level).toFixed(2).replace('.', ',')}</b></li>
          <li>🌱 Safra anual: <b>{intakeCount(level)} jovens</b> · potencial <b>+{potentialBonus(level).toFixed(1).replace('.', ',')} pts</b> em média</li>
          <li>📈 Evolução na velocidade cheia até faltarem <b>{gapWindow(level).toFixed(1).replace('.', ',')} pts</b> para o potencial</li>
          <li>🧑‍🏫 Treinadores melhores no mercado; os de <b>10★ só aos 100%</b> (hoje {percent}%){level < MAX_ACADEMY_LEVEL ? '' : ' — liberados!'}</li>
        </ul>
      </section>

      <section className="mk-sec">
        <h3><span className="yt-bar2" aria-hidden="true" />Instalações</h3>
        <ul className="tc-list">
          {FACILITIES.map((f) => {
            const l = facLevel(y, f.id), c = l < MAX_FACILITY_LEVEL ? facilityCost(game, f.id) : 0;
            return (
              <li key={f.id} className="mk-card tc-card">
                <div className="tc-head"><span className="ac-ico" aria-hidden="true">{f.icon}</span><div><b>{f.label}</b><small>Nível {l} / {MAX_FACILITY_LEVEL}</small></div></div>
                <div className="cp-bar" role="progressbar" aria-label={`Nível de ${f.label}`} aria-valuenow={l} aria-valuemin={1} aria-valuemax={MAX_FACILITY_LEVEL}><i style={{ width: `${(l / MAX_FACILITY_LEVEL) * 100}%` }} /></div>
                {effects(game, f.id).map((e, i) => <small key={i} className="ac-eff">✔ {e}</small>)}
                <details><summary>Benefícios por nível</summary>{f.benefits.map((b, i) => <small key={i} className="ac-eff">• {b}</small>)}</details>
                {l < MAX_FACILITY_LEVEL ? (
                  ask === f.id ? <Confirm k={f.id} /> : <button className="primary" disabled={cash < c} onClick={() => setAsk(f.id)}>Melhorar → nível {l + 1} · {formatBudget(c)}</button>
                ) : <small className="ac-eff">Nível máximo.</small>}
              </li>
            );
          })}
        </ul>
        <p className="hint">As instalações melhoram o treino e a estrutura, mas <b>não liberam</b> treinadores de 10 estrelas: isso só acontece com a academia geral em 100%.</p>
      </section>

      <section className="mk-sec">
        <h3><span className="yt-bar2" aria-hidden="true" />Treinadores disponíveis</h3>
        <p className="hint">{market.length} no mercado · melhor avaliação <b>{best}★</b>. {percent >= 100 ? 'Treinadores de 10★ liberados.' : `Treinadores de 10★ bloqueados até a academia chegar a 100% (hoje ${percent}%).`} Contrate na aba Treinadores.</p>
        <ul className="tc-hist">{top.map((c) => <li key={c.id}><b>{starsOf(c.rating)}★</b> {c.name} — {formatBudget(c.wage)}/ano</li>)}</ul>
      </section>

      <section className="mk-sec">
        <h3><span className="yt-bar2" aria-hidden="true" />Histórico de investimentos</h3>
        <div className="yt-info"><span>🏗️ Obras: <b>{formatBudget(tot.obras)}</b></span><span>🧑‍🏫 Treinadores: <b>{formatBudget(tot.treinadores)}</b></span></div>
        {(y.fin?.log.length ?? 0) === 0 && <p className="hint">Nenhum investimento ainda. Tudo o que você gastar na formação aparece aqui.</p>}
        <ul className="tc-hist">{[...(y.fin?.log ?? [])].reverse().slice(0, 30).map((e, i) => <li key={i}><b>{e.season}</b> {e.text} — {formatBudget(e.cost)}</li>)}</ul>
      </section>
    </>
  );
}
