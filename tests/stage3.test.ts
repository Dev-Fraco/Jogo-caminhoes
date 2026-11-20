import { startNextSeason } from '../src/premium/season';
import { startNextSeason } from '../src/premium/season';
import { describe, expect, it } from 'vitest';
import { CLUBS_DATA, getClubs } from '../src/data/clubs';
import { brazilPyramid } from '../src/data/pyramid';
import { getDivision } from '../src/data/world';
import { generateSquad } from '../src/engine/squad';
import { SERIE_D_SLOTS, estadualOfUser, estadualTable, serieDQualifiers } from '../src/engine/estadual';
import { isSeasonOver, newCareer, playNext, seasonOutcome, userDivision } from '../src/engine/game';
import { createEstaduais } from '../src/engine/estadual';
import { createContinentals } from '../src/engine/continental';
import type { ClubData } from '../src/data/clubs';
import type { GameState } from '../src/engine/types';
import { isWizardComplete, createNewGameState, STEPS } from '../src/newgame/state';

const custom = (): ClubData => ({
  id: 'meu-real-esperanca', name: 'Real Esperança', shortName: 'RES', badge: 'x', primaryColor: '#1e6bff', secondaryColor: '#ffffff', stadium: 'Estádio da Esperança', city: 'Fortaleza',
  budget: 900_000, boardExpectation: 'mid', reputation: 1, uf: 'CE', custom: true, squad: generateSquad({ id: 'meu-real-esperanca', name: 'Real Esperança', short: 'RES', color: '#1e6bff', strength: 48 }, 2026),
});
const start = (club: ClubData, seed = 5): GameState => newCareer({
  saveName: 't', coach: { name: 'Teste Silva', nationality: 'BR', reputation: 'unknown' }, difficulty: 'normal', mode: 'career', season: 2026,
  userClubId: club.id, divisions: brazilPyramid(), cup: true, outside: club,
}, seed);
const keep = (g: GameState): GameState => ({ ...g, morale: { ...g.morale, board: 60 } });
const season = (g: GameState) => { let n = 0; while (!isSeasonOver(g) && n++ < 500) g = keep(playNext(g).state); return g; };

describe('clubes só de estadual (vitrine)', () => {
  it('191 clubes que só jogam estadual aparecem na divisão "Estaduais", com elenco, estado e sem repetir os da pirâmide', () => {
    const list = getClubs('br-estaduais');
    expect(list.length).toBe(191);
    expect(getDivision('BR', 'brasileirao', 'br-estaduais')?.teams).toBe(191);
    expect(list.every((c) => c.uf && c.squad.length === 24)).toBe(true);
    const pyr = new Set(['serie-a', 'serie-b', 'serie-c', 'serie-d'].flatMap((d) => CLUBS_DATA[d].map((c) => c.id)));
    expect(list.filter((c) => pyr.has(c.id))).toEqual([]);
    expect(new Set(list.map((c) => c.id)).size).toBe(191);
    expect(brazilPyramid().length).toBe(4); // a vitrine não entra na pirâmide
  });
  it('o assistente aceita o clube criado e o clube só de estadual', () => {
    const base = { ...createNewGameState(), coach: { name: 'Carlos', nationality: 'BR', reputation: 'unknown' as const, challenge: 'legend' as const }, world: { countryId: 'BR', leagueId: 'brasileirao', divisionId: 'br-estaduais' }, setup: { difficulty: 'normal' as const, mode: 'career' as const, saveName: 'Meu save', saveNameEdited: true } };
    expect(isWizardComplete({ ...base, coach: { ...base.coach, challenge: 'create' }, club: custom() })).toBe(true);
    expect(isWizardComplete({ ...base, club: getClubs('br-estaduais')[0] })).toBe(true);
    expect(isWizardComplete({ ...base, club: custom() })).toBe(false); // criar clube só no desafio próprio
    expect(STEPS[2].isValid({ ...base, club: { ...custom(), custom: false } })).toBe(false);
    expect(STEPS[2].isValid({ ...base, world: { ...base.world, divisionId: 'serie-a' }, club: custom() })).toBe(false); // clube criado só vale na vitrine de estaduais
  });
});

describe('carreira fora da pirâmide', () => {
  it('clube criado: fora da pirâmide, na Série B do Cearense, sem jogos no campeonato e com o estadual antes de tudo', () => {
    const g = start(custom());
    expect(userDivision(g).format).toBe('outside');
    expect(g.divisions.length).toBe(5);
    expect(g.divisions.slice(0, 4).every((d) => !d.clubIds.includes('meu-real-esperanca'))).toBe(true);
    const mine = estadualOfUser(g)!;
    expect(mine.comp.uf).toBe('CE');
    expect(mine.divIndex).toBe(1);
    expect(mine.div.clubIds.length).toBe(6); // 5 + o seu clube
    expect(g.teams['meu-real-esperanca'].players.length).toBe(24);
    expect(g.fixtures.some((f) => f.homeId === 'meu-real-esperanca' || f.awayId === 'meu-real-esperanca')).toBe(false);
    expect(g.estadual!.due).toBe(true);
  });
  it('estado sem Série B: o clube criado entra na Série A estadual', () => {
    const g = start({ ...custom(), id: 'meu-time-ac', uf: 'AC' });
    expect(estadualOfUser(g)!.divIndex).toBe(0);
    expect(estadualOfUser(g)!.div.clubIds.length).toBe(9);
  });
  it('clube que já existe como só estadual joga o estadual do estado dele', () => {
    const galvez = getClubs('br-estaduais').find((c) => c.uf === 'AC')!;
    const g = start(galvez);
    expect(estadualOfUser(g)!.comp.uf).toBe('AC');
    expect(estadualOfUser(g)!.div.clubIds.filter((id) => id === galvez.id).length).toBe(1);
    expect(g.teams[galvez.id]).toBeTruthy();
  });
  it('a temporada roda inteira (estadual ao vivo, depois o campeonato sem jogos seus) e vira para a seguinte', () => {
    let g = start(custom());
    let live = 0, guard = 0;
    while (g.estadual!.due && guard++ < 40) { const r = playNext(g); if (r.results.some((x) => x.events.length > 0 && (x.homeId === g.userClubId || x.awayId === g.userClubId))) live++; g = keep(r.state); }
    expect(live).toBeGreaterThan(0); // pelo menos um jogo seu foi narrado
    g = season(g);
    expect(isSeasonOver(g)).toBe(true);
    const out = seasonOutcome(g);
    expect(['promoted', 'stay']).toContain(out.movement);
    const n = startNextSeason(g);
    expect(n.history).toHaveLength(1);
    expect(n.divisions.some((d) => d.format === 'outside') || out.movement === 'promoted').toBe(true);
  });
  it('subir na Série B estadual leva o clube à Série A estadual do ano seguinte', () => {
    let g = start(custom(), 3);
    const sb = g.estadual!.comps.find((c) => c.uf === 'CE')!.divisions[1];
    // dá um elenco muito forte ao clube criado para ganhar a Série B
    const t = g.teams['meu-real-esperanca'];
    g = { ...g, teams: { ...g.teams, 'meu-real-esperanca': { ...t, players: t.players.map((p) => ({ ...p, strength: 90 })) } } };
    g = season(g);
    const pos = estadualTable(g, g.estadual!.comps.find((c) => c.uf === 'CE')!.divisions[1]).findIndex((r) => r.clubId === 'meu-real-esperanca') + 1;
    expect(sb.clubIds.length).toBe(6);
    expect(pos).toBeLessThanOrEqual(2);
    const n = startNextSeason(g);
    expect(estadualOfUser(n)!.divIndex).toBe(0);
  });
});

describe('estaduais → Série D', () => {
  const advance = (g: GameState) => { while (g.estadual?.due) g = keep(playNext(g).state); return g; };

  it('os melhores clubes só-estadual (fora da pirâmide, 2 primeiros) sobem; os 8 piores da D saem; a D continua com 96', () => {
    let g = advance(start(custom(), 7));
    const quals = serieDQualifiers(g);
    expect(quals.length).toBeGreaterThan(0);
    expect(quals.length).toBeLessThanOrEqual(SERIE_D_SLOTS);
    const pyramid = new Set(g.divisions.filter((d) => d.format !== 'outside').flatMap((d) => d.clubIds));
    for (const id of quals) expect(pyramid.has(id)).toBe(false);
    g = season(g);
    const dBefore = g.divisions[3].clubIds;
    const out = seasonOutcome(g);
    const rel = out.moves[3].relegated;
    expect(rel.length).toBe(quals.length);
    const n = startNextSeason(g);
    expect(n.divisions[3].clubIds.length).toBe(96);
    for (const id of quals) { expect(n.divisions[3].clubIds).toContain(id); expect(n.teams[id].players.length).toBeGreaterThanOrEqual(18); expect(n.clubs[id].name).toBeTruthy(); expect(n.budgets[id]).toBeGreaterThan(0); }
    for (const id of rel) { expect(n.divisions[3].clubIds).not.toContain(id); expect(dBefore).toContain(id); expect(n.teams[id]).toBeTruthy(); }
    expect(n.news.some((x) => /Sobem dos estaduais para a Série D/.test(x.text))).toBe(true);
    expect(n.divisions[3].groups!.flat().length).toBe(96);
  });
  it('clube do jogador campeão da Série A estadual (e melhor clube de fora) sobe à Série D e vira "acesso conquistado"', () => {
    const galvez = getClubs('br-estaduais').find((c) => c.uf === 'AC')!;
    let g = start(galvez, 4);
    const t = g.teams[galvez.id];
    g = { ...g, teams: { ...g.teams, [galvez.id]: { ...t, players: t.players.map((p) => ({ ...p, strength: 95 })) } } };
    g = season(advance(g));
    const mine = estadualOfUser(g)!;
    const first = estadualTable(g, mine.div)[0].clubId;
    expect(first).toBe(galvez.id);
    expect(serieDQualifiers(g)[0]).toBe(galvez.id); // o clube do jogador sempre entra
    expect(seasonOutcome(g).movement).toBe('promoted');
    const n = startNextSeason(g);
    expect(userDivision(n).id).toBe('serie-d');
    expect(n.divisions.some((d) => d.format === 'outside')).toBe(false);
    expect(n.divisions[3].groups!.some((grp) => grp.includes(galvez.id))).toBe(true);
  });
  it('clube do jogador entre os 8 piores da Série D volta para o estadual', () => {
    let g = advance(keep(newCareer({ saveName: 't', coach: { name: 'A B', nationality: 'BR', reputation: 'unknown' }, difficulty: 'normal', mode: 'career', season: 2026, userClubId: 'csa', divisions: brazilPyramid(), cup: true }, 9)));
    const t = g.teams.csa;
    g = { ...g, teams: { ...g.teams, csa: { ...t, players: t.players.map((p) => ({ ...p, strength: 25 })) } } };
    g = season(g);
    const out = seasonOutcome(g);
    const n = startNextSeason(g);
    if (out.moves[3].relegated.includes('csa')) {
      expect(out.movement).toBe('relegated');
      expect(userDivision(n).format).toBe('outside');
      expect(n.divisions[3].clubIds).not.toContain('csa');
    } else expect(userDivision(n).id).toBe('serie-d');
  });
  it('sem estaduais (outras ligas) nada muda: a Série D só troca com a C', () => {
    const g = createContinentals(newCareer({ saveName: 't', coach: { name: 'A B', nationality: 'BR', reputation: 'pro' }, difficulty: 'normal', mode: 'career', season: 2026, userClubId: 'palmeiras', divisions: brazilPyramid() }, 2));
    expect(serieDQualifiers(g)).toEqual([]);
    void createEstaduais;
  });
});
