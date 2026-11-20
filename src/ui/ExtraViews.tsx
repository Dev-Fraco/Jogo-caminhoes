import { COMP_NAMES as NAMES } from '../data/names';
import { otherClub } from '../data/otherworld';
import { groupTable } from '../engine/continental';
import { clubOf } from '../engine/lookup';
import { regionalStepName } from '../engine/regional';
import { isSuperYear, SUPER_EVERY, SUPER_STEPS } from '../engine/supermundial';
import type { GameState } from '../engine/types';
import { ClubBadge } from './ClubBadge';

/* Telas dos extras Premium (Copa do Nordeste, Copa Verde, Super Mundial e copas da África/Arábia): carregadas sob demanda. */

/** Grupos (o seu primeiro) e mata-mata de uma competição com fase de grupos. */
export function GroupsKoView({ game, groups: gs, ko, championId, champLabel, subtitle }: { game: GameState; groups: { id: string; clubIds: string[]; matches: { round: number; homeId: string; awayId: string; homeGoals?: number; awayGoals?: number }[] }[]; ko: { name: string; ties: { homeId: string; awayId: string; homeGoals?: number; awayGoals?: number; pens?: [number, number]; winnerId?: string }[] }[]; championId?: string; champLabel: string; subtitle: string }) {
  const name = (id: string) => clubOf(game, id).name;
  const groups = [...gs].sort((a, b) => Number(b.clubIds.includes(game.userClubId)) - Number(a.clubIds.includes(game.userClubId)));
  return (
    <div className="cup-view">
      {championId && <p className="outcome">🏆 {champLabel}: <b>{name(championId)}</b></p>}
      {!championId && <p className="hint">{subtitle}</p>}
      {[...ko].reverse().map((r) => (
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
      <h3>Fase de grupos</h3>
      {groups.map((gr) => (
        <section key={gr.id}>
          <h4>Grupo {gr.id.slice(-1)}</h4>
          <div className="tb-wrap"><table className="tb">
            <thead><tr><th>#</th><th className="l">Clube</th><th>PTS</th><th>J</th><th>V</th><th>E</th><th>D</th><th>SG</th></tr></thead>
            <tbody>{groupTable(game, gr).map((r, i) => (
              <tr key={r.clubId} className={`${r.clubId === game.userClubId ? 'mine' : ''} ${i < 2 ? 'lib' : ''}`}>
                <td><span className="pos">{i + 1}</span></td>
                <td className="l"><div className="team"><ClubBadge club={clubOf(game, r.clubId)} size={22} /><span className="cname">{name(r.clubId)}</span></div></td>
                <td><span className="pts">{r.points}</span></td><td className="sub">{r.played}</td><td className="sub">{r.won}</td><td className="sub">{r.drawn}</td><td className="sub">{r.lost}</td><td className="sub">{r.gd > 0 ? `+${r.gd}` : r.gd}</td>
              </tr>
            ))}</tbody>
          </table></div>
        </section>
      ))}
    </div>
  );
}

/** Super Mundial de Clubes: 4 grupos de 4 (o seu primeiro) e o mata-mata. */
export function SuperView({ game }: { game: GameState }) {
  const sm = game.superMundial!;
  return <GroupsKoView game={game} groups={sm.groups} ko={sm.ko} championId={sm.championId} champLabel="Campeão do Super Mundial" subtitle={`${sm.entrants.length} clubes · ${SUPER_STEPS[Math.min(sm.step, SUPER_STEPS.length - 1)]}`} />;
}

/** Copa do Nordeste e Copa Verde. */
export function RegionalView({ game, k }: { game: GameState; k: 'nordeste' | 'verde' }) {
  const r = game.regionais![k]!;
  return <GroupsKoView game={game} groups={r.groups} ko={r.ko} championId={r.championId} champLabel={`Campeão da ${r.name}`} subtitle={`${r.entrants.length} clubes · ${regionalStepName(k, r)} · os 4 melhores de cada estado do ${k === 'nordeste' ? 'Nordeste' : 'Norte, Centro-Oeste e ES (2 por estado)'}`} />;
}

/** Copas dos Campeões da África e Árabe (nos bastidores) e quando é o próximo Super Mundial. */
export function OtherCupsView({ game }: { game: GameState }) {
  let next = game.season; while (!isSuperYear(next) || (next === game.season && game.superMundial?.championId)) next++;
  const nm = (id: string) => otherClub(id)?.name ?? id;
  const lists = [['africa', '🌍', game.otherCups?.africa ?? []], ['arab', '🌙', game.otherCups?.arab ?? []]] as const;
  return (
    <div className="cup-view">
      <p className="hint">🌐 O Super Mundial de Clubes acontece a cada {SUPER_EVERY} anos. Próxima edição: <b>temporada {next}</b>. Vão os últimos 4 campeões da Libertadores, da Champions, da África e da Arábia.</p>
      {lists.map(([key, icon, eds]) => (
        <section key={key}>
          <h3>{icon} {NAMES[key]}</h3>
          {eds.length === 0 && <p className="hint">A primeira edição termina no fim desta temporada.</p>}
          <ul className="list">{[...eds].reverse().map((e) => <li key={e.season} className="row"><b>{e.season}</b><span className="grow">🏆 {nm(e.championId)}<small> · vice {nm(e.runnerUpId)}</small></span></li>)}</ul>
        </section>
      ))}
    </div>
  );
}
