import { useState } from 'react';
import { CATEGORIES, categoryDef, type CategoryId } from '../engine/categories';
import { awardLines, compsOf, enrolledMine, gamesOf, isFinished, lastGamesOf, leaders, nextGamesOf, prizeTable, SRC_LABEL, stepsOf, tablesOf, totalSteps, type YComp, type YGame } from '../engine/ycomp';
import { MIN_ROSTER, enrollCheck } from '../engine/yroster';
import { clubOf } from '../engine/lookup';
import { formatBudget } from '../newgame/format';
import { formatDayShort } from '../engine/calendar';
import type { GameState } from '../engine/types';
import { SubTabs } from './FmParts';
import { ClubBadge } from './ClubBadge';

const POS = ['GOL', 'DEF', 'MEI', 'ATA'];
const nameOf = (g: GameState, id: string) => clubOf(g, id)?.name ?? id;

/** Escudo + nome do clube (o seu aparece em destaque). */
function Team({ game, id, right }: { game: GameState; id: string; right?: boolean }) {
  const c = clubOf(game, id);
  const name = c?.name ?? id;
  return <span className={`yc2-team ${right ? 'right' : ''} ${id === game.userClubId ? 'me' : ''}`}>{!right && c && <ClubBadge club={c} size={22} />}<span className="nm">{name}</span>{right && c && <ClubBadge club={c} size={22} />}</span>;
}
/** Resultado do seu clube no jogo: V, E ou D. */
const outcome = (g: GameState, x: YGame): 'V' | 'E' | 'D' | undefined => {
  if (!x.mine || x.hg === undefined || x.ag === undefined) return undefined;
  const me = x.homeId === g.userClubId ? x.hg - x.ag : x.ag - x.hg;
  if (me === 0 && x.pens) { const mp = x.homeId === g.userClubId ? x.pens[0] - x.pens[1] : x.pens[1] - x.pens[0]; return mp > 0 ? 'V' : 'D'; }
  return me > 0 ? 'V' : me < 0 ? 'D' : 'E';
};
/** Uma partida: data, mandante x visitante (com escudos) e placar. */
function MatchRow({ game, x, comp }: { game: GameState; x: YGame; comp?: string }) {
  const o = outcome(game, x);
  return (
    <li className={`yc2-match ${x.mine ? 'mine' : ''}`}>
      <div className="yc2-when"><b>{formatDayShort(x.day)}</b>{comp ? <small>{comp}</small> : null}<small>{x.round}</small></div>
      <div className="yc2-vs"><Team game={game} id={x.homeId} /><span className={`yc2-score ${x.hg === undefined ? 'todo' : ''}`}>{x.hg === undefined ? 'x' : `${x.hg} - ${x.ag}`}{x.pens ? <small>pên. {x.pens[0]}-{x.pens[1]}</small> : null}{x.wo ? <small>W.O.</small> : null}</span><Team game={game} id={x.awayId} right /></div>
      {o && <span className={`yc2-res r${o}`} aria-label={o === 'V' ? 'Vitória' : o === 'E' ? 'Empate' : 'Derrota'}>{o}</span>}
    </li>
  );
}
const compShort = (c: YComp, cat: CategoryId) => c.name.replace(`${categoryDef(cat).label} · `, '');
const SRC_ICON: Record<string, string> = { estadual: '🏟️', liga: '🏆', copa: '🥇', lib: '🌎', sula: '🌎', ucl: '🌍' };

/** Competições de cada categoria da base: acompanha jogos, classificação, artilharia, estatísticas, prêmios e histórico. Quem escala é o treinador. */
export function YouthComps({ game }: { game: GameState }) {
  const [cat, setCat] = useState<CategoryId>('sub17');
  const [sel, setSel] = useState<string | null>(null);
  const list = compsOf(game, cat);
  const comp = sel ? list.find((c) => c.id === sel) : undefined;
  const en = enrollCheck(game, cat);
  const coach = game.youth?.coaches?.[cat];
  const nextAll = list.flatMap((c) => nextGamesOf(game, c, 1).map((x) => ({ c, x, comp: compShort(c, cat) }))).sort((p, q) => p.x.day - q.x.day)[0];
  const hist = (game.yhist ?? []).filter((h) => h.cat === cat).slice().reverse();

  return (
    <>
      <div className="ym-tabs"><SubTabs items={CATEGORIES.map((c) => ({ label: c.label, on: cat === c.id, onClick: () => { setCat(c.id); setSel(null); } }))} /></div>
      {comp ? <CompDetail game={game} c={comp} onBack={() => setSel(null)} /> : (
        <>
          <section className="yc2-status">
            <div className={`yc2-chip ${en.ok ? 'ok' : 'no'}`}>{en.ok ? `✔ Inscrito · ${en.have} atletas elegíveis` : `✖ Não inscrito · ${en.have}/${MIN_ROSTER} atletas elegíveis (${categoryDef(cat).minAge}–${categoryDef(cat).maxAge} anos)`}</div>
            <div className="yc2-chip">🧑‍🏫 {coach ? `Treinador: ${coach.name}` : 'Sem treinador (vaga aberta)'}</div>
            {!en.ok && <p className="yc-no">Para disputar, o clube precisa de pelo menos {MIN_ROSTER} atletas na faixa de idade. Os jovens não são inventados: contrate ou promova na base.</p>}
          </section>

          {nextAll && (
            <section className="yc2-next" aria-label="Seu próximo jogo">
              <small className="yc2-eyebrow">Seu próximo jogo · {nextAll.comp}</small>
              <div className="yc2-vsbig"><Team game={game} id={nextAll.x.homeId} /><b>x</b><Team game={game} id={nextAll.x.awayId} right /></div>
              <small>{formatDayShort(nextAll.x.day)} · {nextAll.x.round}</small>
            </section>
          )}

          <section className="yc2-sec">
            <h3>Competições <span>{list.length}</span></h3>
            {list.length === 0 && <p className="hint">Nenhuma competição de base nesta temporada (o seu clube precisa estar em uma competição profissional equivalente).</p>}
            <ul className="yc2-comps">
              {list.map((c) => {
                const t = tablesOf(game, c).find((x) => x.rows.some((r) => r.clubId === game.userClubId));
                const row = t?.rows.find((r) => r.clubId === game.userClubId);
                const pos = t ? t.rows.findIndex((r) => r.clubId === game.userClubId) + 1 : 0;
                const last = lastGamesOf(game, c, 1)[0];
                const total = totalSteps(c), done = Math.min(c.done, total);
                const ko = koStatus(c, game.userClubId);
                const o = last ? outcome(game, last) : undefined;
                return (
                  <li key={c.id} className="yc2-comp">
                    <header><span className="ico" aria-hidden="true">{SRC_ICON[c.src] ?? '🏆'}</span><div><b>{compShort(c, cat)}</b><small>{SRC_LABEL[c.src]} · {c.clubs.length} clubes</small></div></header>
                    <div className="yc2-prog" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label="Andamento da competição"><i style={{ width: `${total ? (done / total) * 100 : 0}%` }} /></div>
                    <small className="yc2-progtxt">{isFinished(c) ? `Encerrada${c.champion ? ` · campeão: ${nameOf(game, c.champion)}` : ''}` : `Etapa ${Math.min(c.done + 1, total)} de ${total}`}</small>
                    {enrolledMine(c, game.userClubId) ? (
                      <div className="yc2-tiles">
                        {pos > 0 && <div><b>{pos}º</b><small>{c.groups ? 'no grupo' : 'posição'}</small></div>}
                        {row && <div><b>{row.points}</b><small>pontos</small></div>}
                        {row && <div><b>{row.played}</b><small>jogos</small></div>}
                        {last && o && <div className={`r${o}`}><b>{o}</b><small>último jogo</small></div>}
                        {!pos && <div className="wide"><b>{ko ?? 'Na competição'}</b><small>sua situação</small></div>}
                      </div>
                    ) : <p className="yc-no">Seu clube não está inscrito.</p>}
                    {pos > 0 && ko && <small className="yc2-ko">{ko}</small>}
                    <button className="yc2-open" onClick={() => setSel(c.id)}>Ver tabela, jogos e estatísticas ›</button>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="yc2-sec">
            <h3>Próximos jogos</h3>
            <MatchList game={game} items={list.flatMap((c) => nextGamesOf(game, c, 2).map((x) => ({ c, x })))} cat={cat} empty="Sem jogos marcados para o seu clube." />
          </section>
          <section className="yc2-sec">
            <h3>Últimos resultados</h3>
            <MatchList game={game} items={list.flatMap((c) => lastGamesOf(game, c, 2).map((x) => ({ c, x })))} cat={cat} empty="Ainda sem resultados." />
          </section>

          <section className="yc2-sec">
            <h3>Campeões das temporadas anteriores</h3>
            {hist.length === 0 && <p className="hint">O histórico aparece quando a primeira temporada termina.</p>}
            {hist.length > 0 && (
              <div className="tb-wrap"><table className="tb yc2-hist"><thead><tr><th>Ano</th><th className="l">Competição</th><th className="l">Campeão</th><th className="l">Vice</th></tr></thead>
                <tbody>{hist.slice(0, 40).map((h, i) => <tr key={i} className={h.mine ? 'mine' : ''}><td>{h.season}</td><td className="l">{h.name.replace(`${categoryDef(cat).label} · `, '')}</td><td className="l">🏆 {h.champion ?? '—'}</td><td className="l">{h.runnerUp ?? '—'}</td></tr>)}</tbody>
              </table></div>
            )}
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

function MatchList({ game, items, cat, empty }: { game: GameState; items: { c: YComp; x: YGame }[]; cat: CategoryId; empty: string }) {
  if (!items.length) return <p className="hint">{empty}</p>;
  return <ul className="yc2-matches">{items.sort((a, b) => a.x.day - b.x.day).map(({ c, x }, i) => <MatchRow key={i} game={game} x={x} comp={compShort(c, cat)} />)}</ul>;
}

type Tab = 'resumo' | 'jogos' | 'tabela' | 'artilharia' | 'stats' | 'premios';

/** Tela de detalhes de uma competição de base. */
export function CompDetail({ game, c, onBack }: { game: GameState; c: YComp; onBack: () => void }) {
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
        <h3>{compShort(c, c.cat)}</h3>
        <small>{categoryDef(c.cat).label} · {SRC_LABEL[c.src]} · {c.clubs.length} clubes · {isFinished(c) ? 'encerrada' : `etapa ${Math.min(c.done + 1, steps.length)} de ${steps.length}`}</small>
        <div className="yc2-prog" role="progressbar" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={Math.min(c.done, steps.length)} aria-label="Andamento da competição"><i style={{ width: `${steps.length ? (Math.min(c.done, steps.length) / steps.length) * 100 : 0}%` }} /></div>
        {!enrolledMine(c, game.userClubId) && <p className="yc-no">Seu clube não está inscrito nesta competição (falta de atletas elegíveis).</p>}
      </section>
      <div className="ym-tabs"><SubTabs items={tabs.map(([id, label]) => ({ label, on: tab === id, onClick: () => setTab(id) }))} /></div>

      {tab === 'resumo' && (
        <section className="mk-sec">
          {c.champion ? <p>🏆 Campeão: <b>{nameOf(game, c.champion)}</b>{c.runnerUp ? ` · vice: ${nameOf(game, c.runnerUp)}` : ''}{c.finalText ? ` · final: ${c.finalText}` : ''}</p> : <p className="hint">Competição em andamento.</p>}
          <h4>Próximos jogos do seu clube</h4><MatchList game={game} items={nextGamesOf(game, c, 3).map((x) => ({ c, x }))} cat={c.cat} empty="Nenhum jogo marcado." />
          <h4>Últimos resultados do seu clube</h4><MatchList game={game} items={lastGamesOf(game, c, 3).map((x) => ({ c, x }))} cat={c.cat} empty="Ainda sem resultados." />
          <h4>Artilheiros</h4><Board game={game} c={c} by="gols" n={3} />
        </section>
      )}

      {tab === 'jogos' && (
        <section className="mk-sec">
          <div className="tc-btns"><button className={`btn ${!all ? 'on' : ''}`} onClick={() => setAll(false)}>Meus jogos</button><button className={`btn ${all ? 'on' : ''}`} onClick={() => setAll(true)}>Todos os jogos</button></div>
          {[...byStep.entries()].sort((a, b) => a[0] - b[0]).map(([k, list]) => (
            <div key={k} className="yc-round"><h4>{steps[k]?.name}</h4>
              <ul className="yc2-matches">{list.map((x, i) => <MatchRow key={i} game={game} x={x} />)}</ul>
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
              <table className="tb yc2-tb"><thead><tr><th>#</th><th className="l">Clube</th><th>J</th><th>V</th><th>E</th><th>D</th><th>GP</th><th>GC</th><th>SG</th><th>PTS</th></tr></thead>
                <tbody>{t.rows.map((r, i) => <tr key={r.clubId} className={r.clubId === game.userClubId ? 'mine' : ''}><td><span className="pos">{i + 1}</span></td><td className="l"><Team game={game} id={r.clubId} /></td><td>{r.played}</td><td>{r.won}</td><td>{r.drawn}</td><td>{r.lost}</td><td>{r.gf}</td><td>{r.ga}</td><td>{r.gd > 0 ? `+${r.gd}` : r.gd}</td><td><span className="pts">{r.points}</span></td></tr>)}</tbody>
              </table>
            </div>
          ))}
          <p className="legend">J jogos · V vitórias · E empates · D derrotas · GP gols pró · GC gols contra · SG saldo · PTS pontos. Desempate: pontos, vitórias, saldo de gols, gols marcados e nome do clube.</p>
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
