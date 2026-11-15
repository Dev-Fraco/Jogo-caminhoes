import { useEffect, useState } from 'react';
import { audio } from '../audio/audio';
import { MAX_SQUAD } from '../engine/transfers';
import { academyCost, ensureYouth, MAX_LEVEL, MAX_PROSPECTS, promoteProspect, releaseProspect, stars, upgradeAcademy, youthOf, youthWage } from '../engine/youth';
import type { GameState, Position } from '../engine/types';
import { formatBudget } from '../newgame/format';
import { ovrClass, POS_ONE, ScreenTitle } from './FmParts';
import { Face } from './Face';

const POS_ICON: Record<Position, string> = { GK: '🧤', DEF: '🛡️', MID: '🏟️', ATT: '⚽' };

const star = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n);

/** Categorias de base: jovens em formação que evoluem com o tempo; promova os melhores ao elenco principal. */
export function YouthScreen({ game, onChange }: { game: GameState; onChange: (g: GameState) => void }) {
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  useEffect(() => { if (!game.youth && !game.unemployed) onChange(ensureYouth(game)); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const y = youthOf(game);
  const squad = game.teams[game.userClubId].players.length;
  const cost = academyCost(game);
  const POS_ORDER: Position[] = ['GK', 'DEF', 'MID', 'ATT'];
  const list = [...y.prospects].sort((a, b) => POS_ORDER.indexOf(a.player.pos) - POS_ORDER.indexOf(b.player.pos) || b.potential - a.potential);

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
      <ScreenTitle icon="🌱" title="Base" />
      <section className="card mk-card yt-hero2">
        <img className="yt-art" src="assets/ui/academy.jpg" alt="" />
        <div className="yt-hero2-r">
          <div className="yt-lv"><b>Academia</b><span>Nível {y.level} / {MAX_LEVEL}</span></div>
          <div className="cp-bar" role="progressbar" aria-valuenow={y.level} aria-valuemin={0} aria-valuemax={MAX_LEVEL}><i style={{ width: `${(y.level / MAX_LEVEL) * 100}%` }} /></div>
          <p>Academia melhor = safras maiores (4 + nível jovens), jovens mais fortes e evolução mais rápida. A cada temporada chega uma safra nova; quem faz 20 anos sai da base.</p>
        </div>
        <button className="primary mk-big" disabled={y.level >= MAX_LEVEL} onClick={upgrade}>{y.level >= MAX_LEVEL ? 'Nível máximo' : `⏫ Melhorar a academia · ${formatBudget(cost)}`}</button>
        <div className="yt-info"><span>🏦 Caixa: <b>{formatBudget(game.budgets[game.userClubId])}</b></span><span>👥 Elenco principal: <b>{squad}/{MAX_SQUAD}</b></span></div>
        {msg && <p className={`shop-msg ${msg.ok ? 'ok' : 'bad'}`} role="status">{msg.text}</p>}
      </section>

      <section className="mk-sec">
        <h3><span className="yt-bar2" aria-hidden="true" />Jovens na base ({y.prospects.length}/{MAX_PROSPECTS})</h3>
        {list.length === 0 && <p className="hint">Nenhum jovem na base agora. A próxima safra chega no início da temporada.</p>}
        <ul className="yt-grid">
          {list.map((p) => (
            <li key={p.player.id} className="mk-card yt-card">
              <span className="yt-face"><Face id={p.player.id} age={Math.min(p.player.age, 20)} size={64} /><em className={`yt-ovr ${ovrClass(p.player.strength)}`}>{p.player.strength}</em></span>
              <b className="yt-n">{p.player.name}</b>
              <small>{POS_ICON[p.player.pos]} {POS_ONE[p.player.pos]} · {p.player.age} anos</small>
              <small className="yt-pot" title={`Potencial ${p.potential}`}>Potencial <span className="stars">{star(stars(p.potential))}</span> ({p.potential})</small>
              <span className="yt-bar" aria-hidden="true"><i style={{ width: `${(p.exact / p.potential) * 100}%` }} /></span>
              <button className="primary yt-pro" onClick={() => promote(p.player.id)}>⏫ Promover<small>{formatBudget(youthWage(game, p))}/ano</small></button>
              <button className="btn yt-del" onClick={() => onChange(releaseProspect(game, p.player.id))}>🗑️ Dispensar</button>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
