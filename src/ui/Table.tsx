import { lazy, useState } from 'react';
import { COMP_NAMES, shortCompName } from '../data/names';
import { ClubBadge } from './ClubBadge';
import { ScreenTitle } from './FmParts';
import { COMPS, CONTINENTALS, groupTable, type Comp } from '../engine/continental';
import { REGIONAL_KEYS } from '../engine/hooks';
import { PremiumGate } from './PremiumGate';
import { useExtras } from '../premium/usePremium';
import { freeLimited } from '../premium/entitlement';
import { PremiumPreview } from '../premium/ui/PremiumPreview';
import type { FeatureId } from '../premium/features';
const ExtraRegional = lazy(() => import('./ExtraViews').then((m) => ({ default: m.RegionalView })));
const ExtraSuper = lazy(() => import('./ExtraViews').then((m) => ({ default: m.SuperView })));
const ExtraOther = lazy(() => import('./ExtraViews').then((m) => ({ default: m.OtherCupsView })));
const REGIONAL_ICON = { nordeste: '🌵', verde: '🌳' } as const;
import { clubOf } from '../engine/lookup';
import { GROUP_ROUNDS, groupTables, isGroups, knockoutView } from '../engine/groups';
import { estadualOfUser, estadualTable, playoffOf, stepLabel } from '../engine/estadual';
import { HistoryView, TrophyRoom } from './HistoryView';
import { ScorersView } from './Scorers';
import { divisionTable, slotsOf, userDivisionIndex } from '../engine/game';
import type { GameState } from '../engine/types';

/** Zona de cada posição: Série A tem Libertadores (1–4), Sul-Americana (5–6) e rebaixamento; as demais, acesso e rebaixamento. */
function zone(divIndex: number, divCount: number, pos: number, size: number, slots: number, brazil: boolean): '' | 'lib' | 'sul' | 'acc' | 'rel' {
  if (divIndex < divCount - 1 && pos >= size - slots) return 'rel';
  if (divIndex === 0) return brazil ? (pos < 4 ? 'lib' : pos < 6 ? 'sul' : '') : '';
  return pos < slots ? 'acc' : '';
}

/** Últimos 5 jogos do clube na divisão (V, E ou D), do mais antigo para o mais recente. */
function formOf(game: GameState, divisionId: string, clubId: string): ('W' | 'D' | 'L')[] {
  const out: ('W' | 'D' | 'L')[] = [];
  for (const r of game.results) {
    if (r.divisionId !== divisionId || (r.homeId !== clubId && r.awayId !== clubId)) continue;
    const gf = r.homeId === clubId ? r.homeGoals : r.awayGoals, ga = r.homeId === clubId ? r.awayGoals : r.homeGoals;
    out.push(gf > ga ? 'W' : gf < ga ? 'L' : 'D');
  }
  return out.slice(-5);
}

export function Table({ game, initialView = 'div' }: { game: GameState; initialView?: 'div' | 'rounds' | 'hist' | 'scorers' }) {
  const mineIndex = userDivisionIndex(game);
  const [idx, setIdx] = useState(mineIndex);
  const [view, setView] = useState<'div' | 'cup' | Comp | 'mundial' | 'super' | 'copas' | 'nordeste' | 'verde' | 'outras' | 'rounds' | 'hist' | 'titles' | 'estadual' | 'scorers'>(initialView);
  const division = game.divisions[idx];
  const rows = divisionTable(game, division.id);
  const n = rows.length;
  const count = game.divisions.length;
  const slots = slotsOf(game);
  const brazil = game.leagueName === undefined;
  const [menu, setMenu] = useState(false);
  type Item = { key: string; label: string; on: boolean; go: () => void };
  const extras = useExtras(), locked = extras === 'off', lk = locked ? ' 🔒' : ''; // sem o pacote Premium, os extras aparecem trancados
  const mk = (key: string, label: string, v: typeof view, extra?: () => void): Item => ({ key, label, on: view === v, go: () => { extra?.(); setView(v); } });
  const limited = freeLimited(game); // jogo grátis depois da temporada grátis: só a divisão do clube
  const divItems: Item[] = game.divisions.map((d, i) => ({ key: d.id, label: `${d.name}${i === mineIndex ? ' ★' : limited ? ' 🔒' : ''}`, on: view === 'div' && i === idx, go: () => { setIdx(i); setView('div'); } }));
  const cupItems: Item[] = [
    ...(game.estadual ? [mk('estadual', '🏟️ Estadual', 'estadual')] : []),
    ...(game.cup ? [mk('cup', '🏆 Copa', 'cup')] : []),
    ...COMPS.filter((k) => game[k]).map((k) => mk(k, `${CONTINENTALS[k].icon} ${shortCompName(COMP_NAMES[k])}`, k)),
    ...(game.mundial ? [mk('mundial', '🌍 Mundial', 'mundial')] : []),
    ...(game.superMundial || locked ? [mk('super', `🌐 Super Mundial${lk}`, 'super')] : []),
    ...REGIONAL_KEYS.filter((k) => game.regionais?.[k] || locked).map((k) => mk(k, `${REGIONAL_ICON[k]} ${COMP_NAMES[k]}${lk}`, k)),
    mk('outras', `🌍 África e Arábia${lk}`, 'outras'),
    ...(limited ? [mk('copas', '🏆 Copas e continentais 🔒', 'copas')] : []),
  ];
  const infoItems: Item[] = [mk('rounds', '📋 Jogos', 'rounds'), mk('scorers', '⚽ Artilharia', 'scorers'), mk('hist', '🏅 Campeões', 'hist'), mk('titles', '🥇 Meus títulos', 'titles')];
  const groupsOf = [{ title: 'Divisões', items: divItems }, { title: 'Copas e torneios', items: cupItems }, { title: 'Jogos e estatísticas', items: infoItems }];
  const current = [...divItems, ...cupItems, ...infoItems].find((x) => x.on);

  return (
    <>
      <ScreenTitle icon="🏆" title="Competições" />
      <div className="cmp-bar">
        <div className="cmp-cur" aria-live="polite"><small>Competição</small><b>{current?.label ?? ''}</b></div>
        <button type="button" className="cmp-btn" aria-haspopup="dialog" aria-expanded={menu} aria-label="Ver todas as competições" onClick={() => setMenu(true)}>
          <span aria-hidden="true">🏆</span><span className="cmp-btn-t">Todas</span>
        </button>
      </div>
      {menu && (
        <div className="cmp-back" onMouseDown={(e) => { if (e.target === e.currentTarget) setMenu(false); }}>
          <div className="cmp-sheet" role="dialog" aria-modal="true" aria-label="Todas as competições" tabIndex={-1} onKeyDown={(e) => { if (e.key === 'Escape') setMenu(false); }}>
            <div className="cmp-head"><h3>Todas as competições</h3><button type="button" className="cmp-x" aria-label="Fechar" onClick={() => setMenu(false)}>✕</button></div>
            {groupsOf.map((gr) => gr.items.length > 0 && (
              <section key={gr.title}>
                <h4>{gr.title}</h4>
                <div className="cmp-grid">
                  {gr.items.map((it) => <button key={it.key} type="button" className={it.on ? 'on' : ''} aria-pressed={it.on} onClick={() => { it.go(); setMenu(false); }}>{it.label}</button>)}
                </div>
              </section>
            ))}
          </div>
        </div>
      )}
      {view === 'scorers' && <ScorersView game={game} />}
      {view === 'rounds' && <RoundsView game={game} />}
      {view === 'estadual' && game.estadual && <EstadualView game={game} />}
      {view === 'hist' && <HistoryView game={game} />}
      {view === 'titles' && <TrophyRoom game={game} />}
      {view === 'cup' && game.cup && <CupView game={game} />}
      {(view === 'lib' || view === 'sula' || view === 'ucl') && game[view] && <LibView game={game} comp={view} />}
      {view === 'mundial' && game.mundial && <MundialView game={game} />}
      {view === 'super' && <PremiumGate feature="super">{game.superMundial ? <ExtraSuper game={game} /> : <p className="hint">O Super Mundial acontece a cada 4 anos, no fim da temporada (2026, 2030...).</p>}</PremiumGate>}
      {(view === 'nordeste' || view === 'verde') && <PremiumGate feature={view as FeatureId}>{game.regionais?.[view] ? <ExtraRegional game={game} k={view} /> : <p className="hint">Esta copa começa na próxima temporada.</p>}</PremiumGate>}
      {view === 'outras' && <PremiumGate feature="africa"><ExtraOther game={game} /></PremiumGate>}
      {view === 'copas' && <PremiumPreview feature="leagues" onBack={() => setView('div')} />}
      {view === 'div' && limited && idx !== mineIndex && <PremiumPreview feature="leagues" onBack={() => setIdx(mineIndex)} />}
      {view === 'div' && !(limited && idx !== mineIndex) && division.format === 'outside' && (
        <div className="card">
          <h2>Fora da pirâmide</h2>
          <p>Seu clube joga só o estadual. Termine entre os 2 primeiros da Série A estadual (sendo o melhor clube do estado fora das Séries A–D) para subir à Série D.</p>
          <button className="btn main" onClick={() => setView('estadual')}>🏟️ Ver o estadual</button>
        </div>
      )}
      {view === 'div' && !(limited && idx !== mineIndex) && isGroups(division) && <GroupsView game={game} />}
      {view === 'div' && !(limited && idx !== mineIndex) && !isGroups(division) && division.format !== 'outside' && <>
      <div className="tb-wrap">
      <table className="tb">
        <thead><tr><th>#</th><th className="l">Clube</th><th>PTS</th><th>J</th><th>V</th><th>E</th><th>D</th><th>SG</th></tr></thead>
        <tbody>
          {rows.map((r, i) => {
            const c = game.clubs[r.clubId];
            return (
              <tr key={r.clubId} className={`${r.clubId === game.userClubId ? 'mine' : ''} ${zone(idx, count, i, n, slots, brazil)}`}>
                <td><span className="pos">{i + 1}</span></td>
                <td className="l">
                  <div className="team"><ClubBadge club={c} size={24} /><div><span className="cname">{c.name}</span>
                    <span className="form" aria-label="Últimos 5 jogos">{formOf(game, division.id, r.clubId).map((f, k) => <i key={k} className={f} />)}</span></div></div>
                </td>
                <td><span className="pts">{r.points}</span></td><td className="sub">{r.played}</td><td className="sub">{r.won}</td><td className="sub">{r.drawn}</td><td className="sub">{r.lost}</td><td className="sub">{r.gd > 0 ? `+${r.gd}` : r.gd}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
      <p className="legend">
        {idx === 0 && brazil && <><i className="k lib" /> {COMP_NAMES.lib} <i className="k sul" /> {COMP_NAMES.sula} </>}
        {idx > 0 && <><i className="k acc" /> Acesso (sobem {slots}) </>}
        {idx < count - 1 && <><i className="k rel" /> Rebaixamento (descem {slots})</>}
      </p>
      </>}
    </>
  );
}

/** Chaveamento da copa: as fases já sorteadas, da mais recente para a mais antiga; o seu jogo fica em destaque. */
function CupView({ game }: { game: GameState }) {
  const cup = game.cup!;
  const name = (id: string) => clubOf(game, id).name;
  return (
    <div className="cup-view">
      {cup.championId && <p className="outcome">🏆 Campeão: <b>{name(cup.championId)}</b></p>}
      {[...cup.rounds].reverse().map((r) => (
        <section key={r.name}>
          <h3>{r.name}</h3>
          <ul className="list">
            {r.ties.map((t) => (
              <li key={t.homeId} className={t.homeId === game.userClubId || t.awayId === game.userClubId ? 'row mine' : 'row'}>
                <span className="grow right">{name(t.homeId)}</span>
                <b className="score">{t.winnerId ? `${t.homeGoals} - ${t.awayGoals}` : 'x'}</b>
                <span className="grow">{name(t.awayId)}{t.pens ? <small> ({t.pens[0]}–{t.pens[1]} pên.)</small> : null}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** Libertadores: o seu grupo primeiro, depois os outros, e o mata-mata. */
function LibView({ game, comp }: { game: GameState; comp: Comp }) {
  const lib = game[comp]!;
  const name = (id: string) => clubOf(game, id).name;
  const groups = [...lib.groups].sort((a, b) => Number(b.clubIds.includes(game.userClubId)) - Number(a.clubIds.includes(game.userClubId)));
  return (
    <div className="cup-view">
      {lib.championId && <p className="outcome">🏆 Campeão: <b>{name(lib.championId)}</b></p>}
      {[...lib.ko].reverse().map((r) => (
        <section key={r.name}>
          <h3>{r.name}</h3>
          <ul className="list">
            {r.ties.map((t) => (
              <li key={t.homeId} className={t.homeId === game.userClubId || t.awayId === game.userClubId ? 'row mine' : 'row'}>
                <span className="grow right">{name(t.homeId)}</span>
                <b className="score">{t.winnerId ? `${t.homeGoals} - ${t.awayGoals}` : 'x'}</b>
                <span className="grow">{name(t.awayId)}{t.pens ? <small> ({t.pens[0]}–{t.pens[1]} pên.)</small> : null}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {groups.map((gr) => (
        <section key={gr.id}>
          <h3>Grupo {gr.id.slice(1)}</h3>
          <table className="table">
            <thead><tr><th>#</th><th className="l">Clube</th><th>P</th><th>J</th><th>V</th><th>E</th><th>D</th><th>SG</th></tr></thead>
            <tbody>
              {groupTable(game, gr).map((r, i) => (
                <tr key={r.clubId} className={`${r.clubId === game.userClubId ? 'mine' : ''} ${i < 2 ? 'acc' : ''}`}>
                  <td>{i + 1}</td><td className="l"><span className="cname">{name(r.clubId)}</span></td>
                  <td><b>{r.points}</b></td><td>{r.played}</td><td>{r.won}</td><td>{r.drawn}</td><td>{r.lost}</td><td>{r.gd}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}

/** Mundial de Clubes: semifinais cruzadas e final. */
function MundialView({ game }: { game: GameState }) {
  const m = game.mundial!;
  const name = (id: string) => clubOf(game, id).name;
  return (
    <div className="cup-view">
      {m.championId && <p className="outcome">🏆 Campeão mundial: <b>{name(m.championId)}</b></p>}
      {[...m.ko].reverse().map((r) => (
        <section key={r.name}>
          <h3>{r.name}</h3>
          <ul className="list">
            {r.ties.map((t) => (
              <li key={t.homeId} className={t.homeId === game.userClubId || t.awayId === game.userClubId ? 'row mine' : 'row'}>
                <span className="grow right">{name(t.homeId)}</span>
                <b className="score">{t.winnerId ? `${t.homeGoals} - ${t.awayGoals}` : 'x'}</b>
                <span className="grow">{name(t.awayId)}{t.pens ? <small> ({t.pens[0]}–{t.pens[1]} pên.)</small> : null}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** Todos os resultados da temporada, rodada a rodada, de qualquer divisão. */
function RoundsView({ game }: { game: GameState }) {
  const played = Math.max(0, Math.min(game.round - 1, game.totalRounds));
  const [div, setDiv] = useState(userDivisionIndex(game));
  const [round, setRound] = useState(Math.max(1, played));
  const d = game.divisions[div];
  const list = game.results.filter((r) => r.divisionId === d.id && r.round === round);
  const name = (id: string) => game.clubs[id].name;
  return (
    <div className="rounds-view">
      <div className="chips" role="tablist" aria-label="Divisão">
        {game.divisions.map((x, i) => <button key={x.id} role="tab" aria-selected={i === div} className={i === div ? 'on' : ''} onClick={() => setDiv(i)}>{x.name}</button>)}
      </div>
      <div className="round-nav">
        <button className="btn" disabled={round <= 1} onClick={() => setRound(round - 1)} aria-label="Rodada anterior">‹</button>
        <b>Rodada {round} de {game.totalRounds}</b>
        <button className="btn" disabled={round >= played} onClick={() => setRound(round + 1)} aria-label="Próxima rodada">›</button>
      </div>
      {played === 0 && <p className="hint">Nenhuma rodada jogada ainda.</p>}
      <ul className="list">
        {list.map((r) => (
          <li key={r.homeId} className={r.homeId === game.userClubId || r.awayId === game.userClubId ? 'row mine' : 'row'}>
            <span className="grow right">{name(r.homeId)}</span><b className="score">{r.homeGoals} - {r.awayGoals}</b><span className="grow">{name(r.awayId)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Série D: 16 grupos de 6 (os 2 primeiros avançam) e o mata-mata até a final. Os 4 semifinalistas sobem. */
function GroupsView({ game }: { game: GameState }) {
  const d = game.divisions.find(isGroups)!;
  const tabs = groupTables(game, d);
  const mine = Math.max(0, tabs.findIndex((t) => t.rows.some((r) => r.clubId === game.userClubId)));
  const [sel, setSel] = useState<number | 'ko'>(game.round > GROUP_ROUNDS ? 'ko' : mine);
  const ko = knockoutView(game, d);
  const name = (id: string) => game.clubs[id].name;
  return (
    <>
      <div className="chips" role="tablist" aria-label="Grupos da Série D">
        <button role="tab" aria-selected={sel === 'ko'} className={sel === 'ko' ? 'on' : ''} onClick={() => setSel('ko')}>⚔️ Mata-mata</button>
        {tabs.map((tb, i) => <button key={tb.name} role="tab" aria-selected={sel === i} className={sel === i ? 'on' : ''} onClick={() => setSel(i)}>{tb.name.replace('Grupo ', '')}{i === mine ? ' ★' : ''}</button>)}
      </div>
      {sel === 'ko' ? (
        <div className="cup-view">
          {ko.length === 0 && <p className="hint">O mata-mata começa depois da rodada {GROUP_ROUNDS}, com os 2 primeiros de cada grupo (32 clubes). Os 4 semifinalistas sobem para a Série C.</p>}
          {[...ko].reverse().map((v) => (
            <section key={v.name}>
              <h3>{v.name}</h3>
              <ul className="list">
                {v.ties.map((t) => (
                  <li key={t.homeId} className={t.homeId === game.userClubId || t.awayId === game.userClubId ? 'row mine' : 'row'}>
                    <span className="grow right">{name(t.homeId)}</span>
                    <b className="score">{t.result ? `${t.result.homeGoals} - ${t.result.awayGoals}` : 'x'}</b>
                    <span className="grow">{name(t.awayId)}{t.result?.pens ? <small> ({t.result.pens[0]}–{t.result.pens[1]} pên.)</small> : null}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <>
          <div className="tb-wrap">
            <table className="tb">
              <thead><tr><th>#</th><th className="l">{tabs[sel].name}</th><th>PTS</th><th>J</th><th>V</th><th>E</th><th>D</th><th>SG</th></tr></thead>
              <tbody>
                {tabs[sel].rows.map((r, i) => {
                  const c = game.clubs[r.clubId];
                  return (
                    <tr key={r.clubId} className={`${r.clubId === game.userClubId ? 'mine' : ''} ${i < 2 ? 'acc' : ''}`}>
                      <td><span className="pos">{i + 1}</span></td>
                      <td className="l"><div className="team"><ClubBadge club={c} size={24} /><div><span className="cname">{c.name}</span></div></div></td>
                      <td><span className="pts">{r.points}</span></td><td className="sub">{r.played}</td><td className="sub">{r.won}</td><td className="sub">{r.drawn}</td><td className="sub">{r.lost}</td><td className="sub">{r.gd > 0 ? `+${r.gd}` : r.gd}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="legend"><i className="k acc" /> Avançam ao mata-mata (2 primeiros) · os 4 semifinalistas sobem para a Série C</p>
        </>
      )}
    </>
  );
}

/** Campeonatos estaduais: escolha o estado e a divisão para ver a classificação e os jogos de cada rodada. */
function EstadualView({ game }: { game: GameState }) {
  const e = game.estadual!;
  const mine = estadualOfUser(game);
  const [uf, setUf] = useState(mine?.comp.uf ?? e.comps[0].uf);
  const [divIdx, setDivIdx] = useState(mine && mine.comp.uf === uf ? mine.divIndex : 0);
  const comp = e.comps.find((c) => c.uf === uf)!;
  const div = comp.divisions[Math.min(divIdx, comp.divisions.length - 1)];
  const played = e.done ? e.totalSteps : e.step - 1;
  const [round, setRound] = useState(Math.max(1, played));
  const rows = estadualTable(game, div);
  const po = playoffOf(game, div);
  const name = (id: string) => clubOf(game, id).name;
  const list = div.matches.filter((m) => m[0] === round);
  const maxRound = Math.max(...div.matches.map((m) => m[0]), 0);
  return (
    <>
      <div className="card">
        <div className="tf-filters">
          <select aria-label="Estado" value={uf} onChange={(ev) => { setUf(ev.target.value); setDivIdx(0); }}>
            {e.comps.map((c) => <option key={c.uf} value={c.uf}>{c.name}{c.uf === mine?.comp.uf ? ' ★' : ''}</option>)}
          </select>
        </div>
        {comp.divisions.length > 1 && (
          <div className="chips" role="tablist" aria-label="Divisão do estadual" style={{ marginTop: 8 }}>
            {comp.divisions.map((d, i) => <button key={d.name} role="tab" aria-selected={i === divIdx} className={i === divIdx ? 'on' : ''} onClick={() => setDivIdx(i)}>{d.name}</button>)}
          </div>
        )}
        <p className="hint" style={{ margin: '8px 0 0' }}>{e.done ? 'Estadual encerrado.' : `Rodada ${Math.min(e.step, e.totalSteps)} de ${e.totalSteps}.`} {div.clubIds.length >= 6 && e.leagueSteps !== undefined ? 'Turno único; os 4 primeiros vão ao mata-mata (semifinais ida e volta, final em jogo único).' : 'Turno único; o líder é o campeão.'}</p>
      </div>
      <div className="tb-wrap">
        <table className="tb">
          <thead><tr><th>#</th><th className="l">Clube</th><th>PTS</th><th>J</th><th>V</th><th>E</th><th>D</th><th>SG</th></tr></thead>
          <tbody>
            {rows.map((r, i) => {
              const c = clubOf(game, r.clubId);
              return (
                <tr key={r.clubId} className={`${r.clubId === game.userClubId ? 'mine' : ''} ${comp.divisions.length > 1 && divIdx === 0 && i >= rows.length - 2 ? 'rel' : ''} ${comp.divisions.length > 1 && divIdx === 1 && i < 2 ? 'acc' : ''}`}>
                  <td><span className="pos">{i + 1}</span></td>
                  <td className="l"><div className="team"><ClubBadge club={c} size={24} /><div><span className="cname">{c.name}</span></div></div></td>
                  <td><span className="pts">{r.points}</span></td><td className="sub">{r.played}</td><td className="sub">{r.won}</td><td className="sub">{r.drawn}</td><td className="sub">{r.lost}</td><td className="sub">{r.gd > 0 ? `+${r.gd}` : r.gd}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {comp.divisions.length > 1 && <p className="legend"><i className="k acc" /> Sobem à Série A (2) <i className="k rel" /> Caem à Série B (2)</p>}
      {po && (
        <div className="card">
          <h3 style={{ margin: '0 0 6px' }}>Mata-mata</h3>
          {po.semis.map((t, i) => (
            <p key={i} style={{ margin: '4px 0' }}>
              <b>Semifinal {i + 1}:</b> {name(t.lo)} {t.leg1 ? `${t.leg1[0]}-${t.leg1[1]}` : 'x'} {name(t.hi)} · volta: {name(t.hi)} {t.leg2 ? `${t.leg2[0]}-${t.leg2[1]}` : 'x'} {name(t.lo)}
              {t.pens && ` (pên. ${t.pens[0]}-${t.pens[1]} para ${name(t.winner!)})`}{t.winner && ` → ${name(t.winner)}`}
            </p>
          ))}
          {po.final && (
            <p style={{ margin: '4px 0' }}><b>Final:</b> {name(po.final.home)} {po.final.score ? `${po.final.score[0]}-${po.final.score[1]}` : 'x'} {name(po.final.away)}{po.final.pens && ` (pên. ${po.final.pens[0]}-${po.final.pens[1]})`}</p>
          )}
          {po.champion && <p style={{ margin: '6px 0 0' }}>🏆 <b>Campeão: {name(po.champion)}</b></p>}
        </div>
      )}
      {maxRound > 0 && (
        <>
          <div className="round-nav">
            <button className="btn" disabled={round <= 1} onClick={() => setRound(round - 1)} aria-label="Rodada anterior">‹</button>
            <b>{stepLabel(e, round)}</b>
            <button className="btn" disabled={round >= maxRound} onClick={() => setRound(round + 1)} aria-label="Próxima rodada">›</button>
          </div>
          <ul className="list">
            {list.map((m, i) => (
              <li key={i} className={div.clubIds[m[1]] === game.userClubId || div.clubIds[m[2]] === game.userClubId ? 'row mine' : 'row'}>
                <span className="grow right">{name(div.clubIds[m[1]])}</span><b className="score">{m[3]} - {m[4]}</b><span className="grow">{name(div.clubIds[m[2]])}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
