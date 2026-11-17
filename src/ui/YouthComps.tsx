import { useState } from 'react';
import { CATEGORIES, categoryDef, type CategoryId } from '../engine/categories';
import { awardLines, compsOf, enrolledMine, gamesOf, isFinished, lastGamesOf, leaders, nextGamesOf, prizeTable, SRC_LABEL, stepsOf, tablesOf, totalSteps, type YComp, type YGame } from '../engine/ycomp';
import { MIN_ROSTER, enrollCheck } from '../engine/yroster';
import { clubOf } from '../engine/lookup';
import { formatBudget } from '../newgame/format';
import { formatDayShort } from '../engine/calendar';
import type { GameState } from '../engine/types';
import { SubTabs } from './FmParts';

const POS = ['GOL', 'DEF', 'MEI', 'ATA'];
const nameOf = (g: GameState, id: string) => clubOf(g, id)?.name ?? id;
const score = (x: YGame) => (x.hg === undefined ? 'x' : `${x.hg} x ${x.ag}${x.pens ? ` (${x.pens[0]}-${x.pens[1]})` : ''}${x.wo ? ' W.O.' : ''}`);

/** Competições de cada categoria da base: acompanha jogos, classificação, artilharia, estatísticas, prêmios e histórico. Quem escala é o treinador. */
export function YouthComps({ game }: { game: GameState }) {
  const [cat, setCat] = useState<CategoryId>('sub17');
  const [sel, setSel] = useState<string | null>(null);
  const list = compsOf(game, cat);
  const comp = sel ? list.find((c) => c.id === sel) : undefined;
  const en = enrollCheck(game, cat);
  const coach = game.youth?.coaches?.[cat];
  const hist = (game.yhist ?? []).filter((h) => h.cat === cat).slice().reverse();

  return (
    <>
      <SubTabs items={CATEGORIES.map((c) => ({ label: c.label, on: cat === c.id, onClick: () => { setCat(c.id); setSel(null); } }))} />
      {comp ? <CompDetail game={game} c={comp} onBack={() => setSel(null)} /> : (
        <>
          <section className="card mk-card yc-head">
            <h3>{categoryDef(cat).label} · competições</h3>
            <p className={en.ok ? 'yc-ok' : 'yc-no'}>{en.ok ? `✔ Seu clube está inscrito (${en.have} atletas elegíveis).` : `✖ Seu clube não está inscrito: precisa de pelo menos ${MIN_ROSTER} atletas elegíveis (${categoryDef(cat).minAge} a ${categoryDef(cat).maxAge} anos) e tem ${en.have}. Os jovens não são inventados para completar o time.`}</p>
            <small>🧑‍🏫 Treinador: {coach ? `${coach.name} — ele escala e decide o time; você acompanha` : 'vaga aberta (contrate um treinador)'}.</small>
          </section>

          <section className="mk-sec">
            <h3><span className="yt-bar2" aria-hidden="true" />Competições disponíveis ({list.length})</h3>
            {list.length === 0 && <p className="hint">Nenhuma competição de base nesta temporada (o seu clube precisa estar em uma competição profissional equivalente).</p>}
            <ul className="tc-list">
              {list.map((c) => {
                const t = tablesOf(game, c).find((x) => x.rows.some((r) => r.clubId === game.userClubId));
                const pos = t ? t.rows.findIndex((r) => r.clubId === game.userClubId) + 1 : 0;
                const next = nextGamesOf(game, c, 1)[0], last = lastGamesOf(game, c, 1)[0];
                return (
                  <li key={c.id} className="mk-card tc-card yc-card">
                    <div className="tc-cat">{SRC_LABEL[c.src]}</div>
                    <b>{c.name.replace(`${categoryDef(cat).label} · `, '')}</b>
                    <small>{isFinished(c) ? `Encerrada${c.champion ? ` · campeão: ${nameOf(game, c.champion)}` : ''}` : `Etapa ${Math.min(c.done + 1, totalSteps(c))} de ${totalSteps(c)} · ${c.clubs.length} clubes`}</small>
                    {enrolledMine(c, game.userClubId) ? <small>{koStatus(c, game.userClubId) ?? (pos ? `Você: ${pos}º${c.groups ? ' no grupo' : ''}` : 'Você está na fase final')}{next ? ` · próximo: ${nameOf(game, next.homeId === game.userClubId ? next.awayId : next.homeId)} (${next.round})` : ''}{last ? ` · último: ${score(last)}` : ''}</small> : <small className="yc-no">Seu clube não está inscrito.</small>}
                    <button className="primary" onClick={() => setSel(c.id)}>Abrir competição</button>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="mk-sec">
            <h3><span className="yt-bar2" aria-hidden="true" />Próximos jogos e últimos resultados</h3>
            <Games game={game} list={list.flatMap((c) => nextGamesOf(game, c, 2).map((x) => ({ c, x })))} empty="Sem jogos marcados para o seu clube." />
            <Games game={game} list={list.flatMap((c) => lastGamesOf(game, c, 2).map((x) => ({ c, x })))} empty="Ainda sem resultados." />
          </section>

          <section className="mk-sec">
            <h3><span className="yt-bar2" aria-hidden="true" />Histórico de temporadas ({categoryDef(cat).label})</h3>
            {hist.length === 0 && <p className="hint">O histórico aparece quando a primeira temporada termina.</p>}
            <ul className="tc-hist">
              {hist.slice(0, 40).map((h, i) => (
                <li key={i}><b>{h.season}</b> {h.name.replace(`${categoryDef(cat).label} · `, '')} — 🏆 {h.champion ?? '—'}{h.runnerUp ? ` · vice ${h.runnerUp}` : ''}{h.final ? ` · final ${h.final}` : ''}{h.scorer ? ` · artilheiro ${h.scorer.name} (${h.scorer.club}, ${h.scorer.goals})` : ''}{h.best ? ` · melhor ${h.best.name}` : ''}{h.gk ? ` · goleiro ${h.gk.name}` : ''}{h.rev ? ` · revelação ${h.rev.name}` : ''}{h.mine ? ` · seu clube: ${h.mine}` : ''}</li>
              ))}
            </ul>
          </section>
        </>
      )}
    </>
  );
}

/** Situação do seu clube nas fases de mata-mata (ou nada, se a competição ainda é de pontos). */
function koStatus(c: YComp, me: string): string | undefined {
  const inKo = c.plan[0].k === 'ko' || c.done > c.plan.reduce((t, p) => t + (p.k === 'rr' ? p.n : 0), 0);
  if (!inKo) return undefined;
  if (isFinished(c)) return c.champion === me ? 'Você foi campeão' : c.runnerUp === me ? 'Você foi vice-campeão' : 'Seu clube foi eliminado';
  if (!c.alive) return c.done === 0 ? 'Você está na competição' : undefined;
  return c.alive.includes(me) ? 'Você segue na competição' : 'Seu clube foi eliminado';
}

function Games({ game, list, empty }: { game: GameState; list: { c: YComp; x: YGame }[]; empty: string }) {
  if (!list.length) return <p className="hint">{empty}</p>;
  return <ul className="yc-games">{list.map(({ c, x }, i) => <li key={i} className={x.mine ? 'mine' : ''}><small>{formatDayShort(x.day)} · {c.name} · {x.round}</small><span>{nameOf(game, x.homeId)} <b>{score(x)}</b> {nameOf(game, x.awayId)}</span></li>)}</ul>;
}

type Tab = 'resumo' | 'jogos' | 'tabela' | 'artilharia' | 'stats' | 'premios';

/** Tela de detalhes de uma competição de base. */
function CompDetail({ game, c, onBack }: { game: GameState; c: YComp; onBack: () => void }) {
  const [tab, setTab] = useState<Tab>('resumo');
  const [all, setAll] = useState(false);
  const steps = stepsOf(c);
  const games = gamesOf(game, c);
  const shown = games.filter((x) => all || x.mine);
  const byStep = new Map<number, YGame[]>();
  for (const x of shown) byStep.set(x.step, [...(byStep.get(x.step) ?? []), x]);
  const tabs: [Tab, string][] = [['resumo', 'Resumo'], ['jogos', 'Jogos'], ['tabela', 'Classificação'], ['artilharia', 'Artilharia'], ['stats', 'Estatísticas'], ['premios', 'Premiações']];
  const tb = tablesOf(game, c);
  const ko = c.m.filter((x) => steps[x[0]]?.plan.k === 'ko');

  return (
    <>
      <button className="btn" onClick={onBack}>‹ Voltar às competições</button>
      <section className="card mk-card yc-head">
        <h3>{c.name}</h3>
        <small>{SRC_LABEL[c.src]} · {c.clubs.length} clubes · {isFinished(c) ? 'encerrada' : `etapa ${Math.min(c.done + 1, steps.length)} de ${steps.length}`}</small>
        {!enrolledMine(c, game.userClubId) && <p className="yc-no">Seu clube não está inscrito nesta competição (falta de atletas elegíveis).</p>}
      </section>
      <SubTabs items={tabs.map(([id, label]) => ({ label, on: tab === id, onClick: () => setTab(id) }))} />

      {tab === 'resumo' && (
        <section className="mk-sec">
          {c.champion ? <p>🏆 Campeão: <b>{nameOf(game, c.champion)}</b>{c.runnerUp ? ` · vice: ${nameOf(game, c.runnerUp)}` : ''}{c.finalText ? ` · final: ${c.finalText}` : ''}</p> : <p className="hint">Competição em andamento.</p>}
          <h4>Próximos jogos do seu clube</h4><Games game={game} list={nextGamesOf(game, c, 3).map((x) => ({ c, x }))} empty="Nenhum jogo marcado." />
          <h4>Últimos resultados do seu clube</h4><Games game={game} list={lastGamesOf(game, c, 3).map((x) => ({ c, x }))} empty="Ainda sem resultados." />
          <h4>Artilheiros</h4><Board game={game} c={c} by="gols" n={3} />
        </section>
      )}

      {tab === 'jogos' && (
        <section className="mk-sec">
          <div className="tc-btns"><button className={`btn ${!all ? 'on' : ''}`} onClick={() => setAll(false)}>Meus jogos</button><button className={`btn ${all ? 'on' : ''}`} onClick={() => setAll(true)}>Todos os jogos</button></div>
          {[...byStep.entries()].sort((a, b) => a[0] - b[0]).map(([k, list]) => (
            <div key={k} className="yc-round"><h4>{steps[k]?.name}</h4>
              <ul className="yc-games">{list.map((x, i) => <li key={i} className={x.mine ? 'mine' : ''}><small>{formatDayShort(x.day)}</small><span>{nameOf(game, x.homeId)} <b>{score(x)}</b> {nameOf(game, x.awayId)}</span></li>)}</ul>
            </div>
          ))}
          {byStep.size === 0 && <p className="hint">Nenhum jogo para mostrar.</p>}
        </section>
      )}

      {tab === 'tabela' && (
        <section className="mk-sec">
          {tb.map((t) => (
            <div key={t.name} className="tb-wrap">
              {c.groups && <h4>{t.name}</h4>}
              <table className="tb"><thead><tr><th>#</th><th className="l">Clube</th><th>J</th><th>V</th><th>E</th><th>D</th><th>GP</th><th>GC</th><th>SG</th><th>PTS</th></tr></thead>
                <tbody>{t.rows.map((r, i) => <tr key={r.clubId} className={r.clubId === game.userClubId ? 'mine' : ''}><td><span className="pos">{i + 1}</span></td><td className="l"><span className="cname">{nameOf(game, r.clubId)}</span></td><td>{r.played}</td><td>{r.won}</td><td>{r.drawn}</td><td>{r.lost}</td><td>{r.gf}</td><td>{r.ga}</td><td>{r.gd > 0 ? `+${r.gd}` : r.gd}</td><td><span className="pts">{r.points}</span></td></tr>)}</tbody>
              </table>
            </div>
          ))}
          <p className="legend">Desempate: pontos, vitórias, saldo de gols, gols marcados e nome do clube.</p>
          {ko.length > 0 && <><h4>Mata-mata</h4><ul className="yc-games">{ko.map((x, i) => <li key={i} className={c.clubs[x[1]] === game.userClubId || c.clubs[x[2]] === game.userClubId ? 'mine' : ''}><small>{steps[x[0]]?.name}</small><span>{nameOf(game, c.clubs[x[1]])} <b>{x[3]} x {x[4]}{x[5] || x[6] ? ` (${x[5]}-${x[6]})` : ''}</b> {nameOf(game, c.clubs[x[2]])}</span></li>)}</ul></>}
        </section>
      )}

      {tab === 'artilharia' && <section className="mk-sec"><h4>Artilheiros</h4><Board game={game} c={c} by="gols" n={10} /><h4>Assistências</h4><Board game={game} c={c} by="assist" n={10} /></section>}

      {tab === 'stats' && (
        <section className="mk-sec">
          <h4>Partidas disputadas</h4><Board game={game} c={c} by="jogos" n={8} />
          <h4>Minutos jogados</h4><Board game={game} c={c} by="minutos" n={8} />
          <h4>Cartões amarelos</h4><Board game={game} c={c} by="amarelos" n={8} />
          <h4>Cartões vermelhos</h4><Board game={game} c={c} by="vermelhos" n={8} />
        </section>
      )}

      {tab === 'premios' && (
        <section className="mk-sec">
          <h4>Premiações desta competição</h4>
          {prizeTable(c.src, c.cat).every((p) => p.value === 0) ? <p className="hint">Esta competição não paga premiação em dinheiro na categoria {categoryDef(c.cat).label} (apenas o troféu e o prestígio).</p>
            : <ul className="tc-hist">{prizeTable(c.src, c.cat).map((p) => <li key={p.prize}><b>{p.label}</b> {formatBudget(p.value)}</li>)}</ul>}
          <p className="hint">Teto de R$ 500 mil por prêmio. O dinheiro entra no caixa do clube e aparece no histórico da academia.</p>
          <h4>Vencedores</h4>
          {awardLines(game, c).length === 0 ? <p className="hint">Os prêmios são definidos no fim da competição.</p> : <ul className="tc-hist">{awardLines(game, c).map((l, i) => <li key={i}><b>{l.label}</b> {l.name}{l.club ? ` (${l.club})` : ''}{l.prize ? ` — ${formatBudget(l.prize)}` : ''}</li>)}</ul>}
        </section>
      )}
    </>
  );
}

function Board({ game, c, by, n }: { game: GameState; c: YComp; by: Parameters<typeof leaders>[2]; n: number }) {
  const rows = leaders(game, c, by, n);
  if (!rows.length) return <p className="hint">Sem dados ainda.</p>;
  const val = (r: (typeof rows)[number]) => (by === 'gols' ? r.v[0] : by === 'assist' ? r.v[1] : by === 'jogos' ? r.v[2] : by === 'minutos' ? r.v[3] : by === 'amarelos' ? r.v[4] : r.v[5]);
  return (
    <div className="tb-wrap"><table className="tb"><thead><tr><th>#</th><th className="l">Jogador</th><th>Pos</th><th>Idade</th><th>{by === 'minutos' ? 'Min' : by === 'jogos' ? 'J' : by === 'gols' ? 'Gols' : by === 'assist' ? 'Ass.' : by === 'amarelos' ? '🟨' : '🟥'}</th></tr></thead>
      <tbody>{rows.map((r, i) => <tr key={r.id} className={r.clubId === game.userClubId ? 'mine' : ''}><td><span className="pos">{i + 1}</span></td><td className="l"><span className="cname">{r.name}</span><small className="sub"> {r.club}</small></td><td>{POS[r.pos]}</td><td>{r.age}</td><td><span className="pts">{val(r)}</span></td></tr>)}</tbody></table></div>
  );
}
