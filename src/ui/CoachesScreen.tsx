import { useState } from 'react';
import { audio } from '../audio/audio';
import { CATEGORIES, categoryDef, type CategoryId } from '../engine/categories';
import { answer, buildReport, chat, TOPICS, traitText, type Topic } from '../engine/coachtalk';
import { academyText, canHireStars, COACH_SPECS, COACH_TRAITS, dismissCoach, hireCoach, hireFee, ratioOf, roundsToRefresh, severance, specLabel, starsOf, STAR_LABEL, vacancies, type YouthCoach } from '../engine/coaches';
import { academyPercent, expectedRating } from '../engine/training';
import { youthOf } from '../engine/youth';
import type { GameState } from '../engine/types';
import { formatBudget } from '../newgame/format';
import { Face } from './Face';

const Stars = ({ n }: { n: number }) => <span className="tc-stars" aria-label={`${n} de 10 estrelas`}><b>{n}</b><i>/10</i> <span aria-hidden="true">{'★'.repeat(n)}<em>{'★'.repeat(10 - n)}</em></span></span>;
const Specs = ({ c }: { c: YouthCoach }) => <span className="tc-specs">{c.specs.map((s) => <em key={s} className={`tc-chip ${COACH_SPECS.find((x) => x.id === s)!.group === 'Técnica' ? 'tech' : 'prep'}`} title={COACH_SPECS.find((x) => x.id === s)!.hint}>{specLabel(s)}</em>)}</span>;

/** Última avaliação do treinador em palavras e seta. */
function recent(c: YouthCoach): string {
  const e = c.evals?.[c.evals.length - 1];
  if (!e) return c.season && c.season.expected > 0.3 ? `Rendendo ${Math.round(ratioOf(c) * 100)}% do esperado nesta temporada` : 'Ainda sem avaliação';
  return `${e.season}: ${Math.round(e.ratio * 100)}% do esperado ${e.delta > 0.04 ? '▲' : e.delta < -0.04 ? '▼' : '■'}`;
}

/** Treinadores da base: um por categoria, mercado, contratação, demissão, conversa e relatórios. Quem comanda o treino é o treinador, não o usuário. */
export function CoachesScreen({ game, onChange }: { game: GameState; onChange: (g: GameState) => void }) {
  const y = youthOf(game);
  const [sel, setSel] = useState<CategoryId | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [target, setTarget] = useState<Record<string, CategoryId>>({});
  const [detail, setDetail] = useState<string | null>(null); // perfil de um candidato do mercado
  const vac = vacancies(y);
  const cash = game.budgets[game.userClubId] ?? 0;
  const pct = academyPercent(y);

  const fire = (cat: CategoryId) => {
    const r = dismissCoach(game, cat);
    if (!r.ok) { setMsg({ text: r.error, ok: false }); audio.sfx('error'); return; }
    onChange(r.state); setSel(null); setMsg({ text: 'Treinador demitido. Os jovens e o histórico da categoria foram mantidos.', ok: true });
  };
  const hire = (c: YouthCoach) => {
    const cat = target[c.id] ?? vac[0];
    if (!cat) { setMsg({ text: 'Todas as categorias têm treinador. Demita um antes de contratar outro.', ok: false }); audio.sfx('error'); return; }
    const r = hireCoach(game, cat, c.id);
    if (!r.ok) { setMsg({ text: r.error, ok: false }); audio.sfx('error'); return; }
    onChange(r.state); audio.sfx('cash'); setDetail(null); setMsg({ text: `${c.name} assumiu o ${categoryDef(cat).label}.`, ok: true });
  };

  if (sel && y.coaches?.[sel]) return <CoachDetail game={game} cat={sel} onBack={() => setSel(null)} onFire={() => fire(sel)} />;
  const market = y.market?.list ?? [];
  const open = detail ? market.find((m) => m.id === detail) : undefined;

  return (
    <>
      <section className="card mk-card tc-top">
        <p><b>Quem comanda o treino é o treinador.</b> Você contrata, demite e conversa; ele decide o foco de cada jovem. Avaliação de 1 a 10 estrelas: quanto maior, mais rápido os jovens evoluem.</p>
        <div className="yt-info"><span>🏦 Caixa: <b>{formatBudget(cash)}</b></span><span>🏫 Academia: <b>{academyText(y)}</b></span></div>
        <p className="hint">Treinadores de 10 estrelas só podem ser contratados com a academia em <b>100%</b> (agora {pct}%). A diretoria espera cerca de {Math.round(expectedRating(y.level))}★ para esta academia.</p>
        {msg && <p className={`shop-msg ${msg.ok ? 'ok' : 'bad'}`} role="status">{msg.text}</p>}
      </section>

      <section className="mk-sec">
        <h3><span className="yt-bar2" aria-hidden="true" />Comissão técnica da base</h3>
        <ul className="tc-list">
          {CATEGORIES.map((cd) => {
            const c = y.coaches?.[cd.id];
            return (
              <li key={cd.id} className="mk-card tc-card">
                <div className="tc-cat">{cd.label}</div>
                {c ? (
                  <>
                    <div className="tc-head"><Face id={c.id} age={Math.max(30, c.age)} size={52} /><div><b>{c.name}</b><small>{c.age} anos · {c.exp} anos de carreira · {traitText(c)}</small></div></div>
                    <Stars n={starsOf(c.rating)} />
                    <Specs c={c} />
                    <small className="tc-recent">📊 {recent(c)}{c.bad ? ` · ⚠️ ${c.bad} temporada(s) ruim(ns)` : ''}</small>
                    <div className="tc-btns"><button className="primary" onClick={() => setSel(cd.id)}>Perfil e conversa</button><button className="btn" onClick={() => fire(cd.id)} title={`Multa de ${formatBudget(severance(c))}`}>Demitir</button></div>
                  </>
                ) : (
                  <><p className="hint">🪑 Vaga aberta: sem treinador o treino rende bem menos. Escolha um no mercado abaixo.</p></>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mk-sec">
        <h3><span className="yt-bar2" aria-hidden="true" />Mercado de treinadores ({market.length})</h3>
        <p className="hint">Renova em {roundsToRefresh(game)} rodada(s) e a cada nova temporada. {vac.length ? `Vagas: ${vac.map((v) => categoryDef(v).label).join(', ')}.` : 'Para contratar, demita primeiro um treinador.'}</p>
        {open && (
          <div className="mk-card tc-open">
            <div className="tc-head"><Face id={open.id} age={Math.max(30, open.age)} size={56} /><div><b>{open.name}</b><small>{open.age} anos · {open.exp} anos de carreira</small></div></div>
            <Stars n={starsOf(open.rating)} /> <small>{STAR_LABEL[starsOf(open.rating)]}</small>
            <Specs c={open} />
            <small><b>{COACH_TRAITS[open.trait].label}:</b> {COACH_TRAITS[open.trait].hint}</small>
            {open.specs.map((s) => <small key={s}>• {COACH_SPECS.find((x) => x.id === s)!.hint}</small>)}
            <small>Salário {formatBudget(open.wage)}/ano · luvas {formatBudget(hireFee(open))}</small>
            <button className="btn" onClick={() => setDetail(null)}>Fechar</button>
          </div>
        )}
        <ul className="tc-list">
          {market.map((c) => {
            const st = starsOf(c.rating), locked = !canHireStars(y, st);
            return (
              <li key={c.id} className={`mk-card tc-card ${locked ? 'locked' : ''}`}>
                <div className="tc-head"><Face id={c.id} age={Math.max(30, c.age)} size={44} /><div><b>{c.name}</b><small>{c.age} anos · {traitText(c)}</small></div></div>
                <Stars n={st} />
                <Specs c={c} />
                <small>{formatBudget(c.wage)}/ano · luvas {formatBudget(hireFee(c))}</small>
                {locked && <small className="tc-lock">🔒 10★ só com a academia em 100%</small>}
                <div className="tc-btns">
                  <button className="btn" onClick={() => setDetail(c.id)}>Ver perfil</button>
                  {vac.length > 1 && <select aria-label={`Categoria para ${c.name}`} value={target[c.id] ?? vac[0]} onChange={(e) => setTarget({ ...target, [c.id]: e.target.value as CategoryId })}>{vac.map((v) => <option key={v} value={v}>{categoryDef(v).label}</option>)}</select>}
                  <button className="primary" disabled={locked || !vac.length} onClick={() => hire(c)}>Contratar</button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}

/** Perfil completo do treinador de uma categoria, com histórico, relatório técnico e conversa. */
function CoachDetail({ game, cat, onBack, onFire }: { game: GameState; cat: CategoryId; onBack: () => void; onFire: () => void }) {
  const y = youthOf(game);
  const c = y.coaches![cat]!;
  const [tab, setTab] = useState<'perfil' | 'conversa' | 'relatorio'>('perfil');
  const [log, setLog] = useState<{ me?: string; lines: string[] }[]>([{ lines: [`Olá! Sou ${c.name}, treinador do ${categoryDef(cat).label}. Pergunte o que quiser sobre a categoria — eu respondo com o que vejo nos treinos.`] }]);
  const [text, setText] = useState('');
  const r = buildReport(game, cat);
  const ask = (t: Topic, label: string) => setLog((l) => [...l, { me: label, lines: answer(game, cat, t) }]);
  const send = () => { const t = text.trim(); if (!t) return; setLog((l) => [...l, { me: t, lines: chat(game, cat, t).lines }]); setText(''); };
  const catLog = y.catLog?.[cat] ?? [];

  return (
    <>
      <button className="btn" onClick={onBack}>‹ Voltar aos treinadores</button>
      <section className="card mk-card tc-prof">
        <div className="tc-head"><Face id={c.id} age={Math.max(30, c.age)} size={64} /><div><h3>{c.name}</h3><small>Treinador do {categoryDef(cat).label} · {c.age} anos · {c.exp} anos de carreira</small></div></div>
        <Stars n={starsOf(c.rating)} /> <small>{STAR_LABEL[starsOf(c.rating)]} (nota {c.rating.toFixed(1).replace('.', ',')})</small>
        <Specs c={c} />
        <small><b>{COACH_TRAITS[c.trait].label}:</b> {COACH_TRAITS[c.trait].hint}</small>
        <small>💰 Salário {formatBudget(c.wage)}/ano · no clube desde {c.hiredSeason ?? '—'}</small>
        <small>📊 {recent(c)}</small>
      </section>
      <div className="fm-sub" role="tablist">
        {(['perfil', 'conversa', 'relatorio'] as const).map((t) => <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t === 'perfil' ? '📜 Histórico' : t === 'conversa' ? '💬 Conversar' : '📋 Relatório'}</button>)}
      </div>

      {tab === 'perfil' && (
        <section className="mk-sec">
          <h3>Histórico de trabalho</h3>
          <ul className="tc-hist">{[...c.history].reverse().map((h, i) => <li key={i}><b>{h.season}</b> {h.text}</li>)}</ul>
          {catLog.length > 0 && <><h3>Histórico da categoria</h3><ul className="tc-hist">{[...catLog].reverse().map((h, i) => <li key={i}><b>{h.season}</b> {h.text}</li>)}</ul></>}
          {c.evals && c.evals.length > 0 && <><h3>Avaliações por temporada</h3><ul className="tc-hist">{[...c.evals].reverse().map((e) => <li key={e.season}><b>{e.season}</b> {Math.round(e.ratio * 100)}% do esperado · objetivo {e.met ? 'cumprido' : 'não cumprido'} · avaliação {e.delta > 0 ? '+' : ''}{e.delta.toFixed(2).replace('.', ',')}</li>)}</ul></>}
          <button className="btn tc-fire" onClick={onFire}>Demitir {c.name} · multa {formatBudget(severance(c))}</button>
        </section>
      )}

      {tab === 'conversa' && (
        <section className="mk-sec">
          <ul className="tc-chat" aria-live="polite">
            {log.map((m, i) => <li key={i}>{m.me && <p className="tc-me">{m.me}</p>}<div className="tc-coach">{m.lines.map((l, j) => <p key={j}>{l}</p>)}</div></li>)}
          </ul>
          <div className="tc-topics">{TOPICS.map((t) => <button key={t.id} className="btn" onClick={() => ask(t.id, t.label)}>{t.label}</button>)}</div>
          <form className="tc-form" onSubmit={(e) => { e.preventDefault(); send(); }}>
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Pergunte ao treinador…" aria-label="Mensagem para o treinador" maxLength={120} />
            <button className="primary" type="submit">Enviar</button>
          </form>
          <p className="hint">Você pode conversar e pedir recomendações, mas as decisões de treino são do treinador.</p>
        </section>
      )}

      {tab === 'relatorio' && (
        <section className="mk-sec">
          <h3>Relatório técnico — {categoryDef(cat).label}</h3>
          <p><b>{r.count}</b> jovem(ns) · overall médio <b>{r.avgOvr.toFixed(1).replace('.', ',')}</b> · evolução média na temporada <b>+{r.avgGain.toFixed(1).replace('.', ',')}</b></p>
          <p>📝 {r.evaluation}</p>
          {r.highlights.map((h, i) => <p key={i}>⭐ {h}</p>)}
          <Block title="Mais evoluíram" rows={r.topGainers.map((l) => `${l.name} (${l.age}) +${l.gain.toFixed(1).replace('.', ',')}`)} />
          <Block title="Maior potencial" rows={r.topPotential.map((l) => `${l.name} (${l.age}) pot. ${l.pot}${l.star ? ' ⭐' : ''}`)} />
          <Block title="Abaixo do esperado" rows={r.behind.map((l) => `${l.name} (${l.age}) +${l.gain.toFixed(1).replace('.', ',')}`)} />
          <Block title="Recomendados para promoção (a decisão é sua)" rows={r.promotions.map((p) => `${p.player.name} (${p.player.age}) — ${p.reason}`)} />
        </section>
      )}
    </>
  );
}

function Block({ title, rows }: { title: string; rows: string[] }) {
  return <div className="tc-block"><h4>{title}</h4>{rows.length ? <ul>{rows.map((r, i) => <li key={i}>{r}</li>)}</ul> : <small>Ninguém no momento.</small>}</div>;
}
