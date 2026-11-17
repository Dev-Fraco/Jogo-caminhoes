import { useEffect, useState } from 'react';
import { audio } from '../audio/audio';
import { MAX_SQUAD } from '../engine/transfers';
import { academyCost, ensureYouth, MAX_LEVEL, MAX_PROSPECTS, promoteProspect, releaseProspect, stars, upgradeAcademy, youthOf, youthWage, type Prospect } from '../engine/youth';
import { attributesOf, awaitingDecision, canPromoteAge, categoriesOf, categoryDef, CATEGORIES, DECISION_AGE, MIN_PRO_AGE, splitByCategory, type CategoryId } from '../engine/categories';
import type { GameState, Position } from '../engine/types';
import { formatBudget } from '../newgame/format';
import { ovrClass, ScreenTitle, SubTabs } from './FmParts';
import { Face } from './Face';
import { SPOT_LABEL } from '../engine/types';
import { spotOf } from '../engine/squad';

const POS_ICON: Record<Position, string> = { GK: '🧤', DEF: '🛡️', MID: '🏟️', ATT: '⚽' };

const star = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n);

/** Categorias de base: Sub-13, Sub-15, Sub-17 e Sub-21 (faixas de idade sobre a mesma lista de jovens); promova a partir dos 16 anos. */
export function YouthScreen({ game, onChange }: { game: GameState; onChange: (g: GameState) => void }) {
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [cat, setCat] = useState<CategoryId>('sub13');
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => { if (!game.youth && !game.unemployed) onChange(ensureYouth(game)); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const y = youthOf(game);
  const squad = game.teams[game.userClubId].players.length;
  const cost = academyCost(game);
  const POS_ORDER: Position[] = ['GK', 'DEF', 'MID', 'ATT'];
  const byCat = splitByCategory(y.prospects);
  const sortList = (l: Prospect[]) => [...l].sort((a, b) => POS_ORDER.indexOf(a.player.pos) - POS_ORDER.indexOf(b.player.pos) || b.potential - a.potential);
  const list = sortList(byCat[cat]);
  const decide = sortList(awaitingDecision(y.prospects));

  const promote = (id: string) => {
    const r = promoteProspect(game, id);
    if (!r.ok) { setMsg({ text: r.error, ok: false }); audio.sfx('error'); return; }
    onChange(r.state); audio.sfx('cash'); setMsg({ text: 'Jovem promovido ao elenco principal!', ok: true });
  };
  const upgrade = () => {
    const r = upgradeAcademy(game);
    if (!r.ok) { setMsg({ text: r.error, ok: false }); audio.sfx('error'); return; }
    onChange(r.state); audio.sfx('cash'); setMsg({ text: 'Academia melhorada!', ok: true });
  };

  return (
    <>
      <ScreenTitle icon="🌱" title="Categorias de base" />
      <section className="card mk-card yt-hero2">
        <img className="yt-art" src="assets/ui/academy.jpg" alt="" />
        <div className="yt-hero2-r">
          <div className="yt-lv"><b>Academia</b><span>Nível {y.level} / {MAX_LEVEL}</span></div>
          <div className="cp-bar" role="progressbar" aria-valuenow={y.level} aria-valuemin={0} aria-valuemax={MAX_LEVEL}><i style={{ width: `${(y.level / MAX_LEVEL) * 100}%` }} /></div>
          <p>Academia melhor = safras maiores (4 + nível jovens), jovens mais fortes e evolução mais rápida. Toda temporada chega uma safra nova de jovens de 12 anos. Promoção ao profissional só a partir dos 16; aos 21 o clube decide.</p>
        </div>
        <button className="primary mk-big" disabled={y.level >= MAX_LEVEL} onClick={upgrade}>{y.level >= MAX_LEVEL ? 'Nível máximo' : `⏫ Melhorar a academia · ${formatBudget(cost)}`}</button>
        <div className="yt-info"><span>🏦 Caixa: <b>{formatBudget(game.budgets[game.userClubId])}</b></span><span>👥 Elenco principal: <b>{squad}/{MAX_SQUAD}</b></span></div>
        {msg && <p className={`shop-msg ${msg.ok ? 'ok' : 'bad'}`} role="status">{msg.text}</p>}
      </section>

      <section className="mk-sec">
        <h3><span className="yt-bar2" aria-hidden="true" />Jovens na base ({y.prospects.length}/{MAX_PROSPECTS})</h3>
        <SubTabs items={CATEGORIES.map((c) => ({ label: `${c.label} (${byCat[c.id].length})`, on: cat === c.id, onClick: () => setCat(c.id) }))} />
        <p className="hint yt-rule">{categoryDef(cat).label}: jogadores de {categoryDef(cat).minAge} a {categoryDef(cat).maxAge} anos · {byCat[cat].length} na categoria{cat === 'sub21' ? ' (inclui os de 16 e 17 anos, que também são Sub-17)' : cat === 'sub17' ? ' (os de 16 e 17 anos também podem jogar o Sub-21)' : ''}.</p>
        {list.length === 0 && <p className="hint">Nenhum jovem no {categoryDef(cat).label} agora. {cat === 'sub13' ? 'A próxima safra chega no início da temporada.' : 'Os jovens sobem de categoria conforme a idade, a cada temporada.'}</p>}
        <ul className="yt-grid">
          {list.map((p) => <YouthCard key={p.player.id} game={game} p={p} open={open === p.player.id} onOpen={() => setOpen(open === p.player.id ? null : p.player.id)} onPromote={() => promote(p.player.id)} onRelease={() => onChange(releaseProspect(game, p.player.id))} />)}
        </ul>
      </section>

      {decide.length > 0 && (
        <section className="mk-sec">
          <h3><span className="yt-bar2" aria-hidden="true" />Decisão do clube — {DECISION_AGE} anos ou mais ({decide.length})</h3>
          <p className="hint yt-rule">Esses jovens completaram {DECISION_AGE} anos e deixaram as categorias. Escolha: profissional, empréstimo ou dispensa.</p>
          <ul className="yt-grid">
            {decide.map((p) => <YouthCard key={p.player.id} game={game} p={p} decision open={open === p.player.id} onOpen={() => setOpen(open === p.player.id ? null : p.player.id)} onPromote={() => promote(p.player.id)} onRelease={() => onChange(releaseProspect(game, p.player.id))} />)}
          </ul>
        </section>
      )}
    </>
  );
}

function YouthCard({ game, p, open, decision, onOpen, onPromote, onRelease }: { game: GameState; p: Prospect; open: boolean; decision?: boolean; onOpen: () => void; onPromote: () => void; onRelease: () => void }) {
  const age = p.player.age;
  const cats = categoriesOf(age).map((c) => categoryDef(c).label).join(' · ');
  return (
    <li className="mk-card yt-card">
      <button type="button" className="yt-face yt-open" onClick={onOpen} aria-expanded={open} aria-label={`Detalhes de ${p.player.name}`}><Face id={p.player.id} age={Math.min(age, 20)} size={64} /><em className={`yt-ovr ${ovrClass(p.player.strength)}`}>{p.player.strength}</em></button>
      <b className="yt-n">{p.player.name}</b>
      <small>{POS_ICON[p.player.pos]} {SPOT_LABEL[spotOf(p.player)]} · {age} anos</small>
      <small className="yt-cats">{decision ? 'Aguardando decisão' : cats}</small>
      <small className="yt-pot" title={`Potencial ${p.potential}`}>Potencial <span className="stars">{star(stars(p.potential))}</span> ({p.potential})</small>
      <span className="yt-bar" aria-hidden="true"><i style={{ width: `${Math.min(100, (p.exact / p.potential) * 100)}%` }} /></span>
      {open && (
        <div className="yt-det">
          <ul>{attributesOf(p.player).map((a) => <li key={a.name}><span>{a.name}</span><b>{a.value}</b></li>)}</ul>
          <small>Na base desde {p.joined ?? '—'}{p.origin === 'anterior' ? ' (já estava antes das categorias)' : ''}.</small>
          {(p.history ?? []).slice(-4).map((h, i) => <small key={i}>{h.season}: {h.text}</small>)}
        </div>
      )}
      <button className="primary yt-pro" disabled={!canPromoteAge(age)} onClick={onPromote}>{canPromoteAge(age) ? <>⏫ Promover<small>{formatBudget(youthWage(game, p))}/ano</small></> : <>🔒 Aos {MIN_PRO_AGE} anos</>}</button>
      {decision && <button className="btn yt-del" disabled title="Empréstimos chegam numa próxima etapa">🤝 Empréstimo (em breve)</button>}
      <button className="btn yt-del" onClick={onRelease}>🗑️ Dispensar</button>
    </li>
  );
}
