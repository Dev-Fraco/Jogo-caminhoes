import { describe, expect, it } from 'vitest';
import { ESTADUAIS, ESTADUAL_CLUB_COUNT } from '../src/data/br_estaduais';
import { CLUBS_DATA } from '../src/data/clubs';
import { allEstadualClubs, estadualClub, estadualClubsOf } from '../src/data/estaduais_clubs';
import { brazilPyramid } from '../src/data/pyramid';
import { createEstaduais, estadualRanking, estadualSummary, fixturesAt, playoffOf, stepLabel, estadualChampions, estadualOfUser, estadualTable, nextEstaduais, playEstadualStep, quickScore, singleRounds, userEstadualMatch } from '../src/engine/estadual';
import { pendingEvent } from '../src/engine/events';
import { isSeasonOver, newCareer, playNext, playRound, startNextSeason } from '../src/engine/game';
import { clubOf, teamOf } from '../src/engine/lookup';
import { makeRng } from '../src/engine/rng';
import type { GameState } from '../src/engine/types';

const fresh = (user = 'palmeiras', seed = 5): GameState => newCareer({
  saveName: 't', coach: { name: 'Teste Silva', nationality: 'BR', reputation: 'pro' }, difficulty: 'normal', mode: 'career', season: 2026,
  userClubId: user, divisions: brazilPyramid(), cup: true,
}, seed);
const runEstadual = (g: GameState) => { let n = 0; while (g.estadual?.due && n++ < 40) g = playNext(g).state; return g; };

describe('dados dos estaduais (PDF)', () => {
  it('27 competições e 346 clubes, sem ids repetidos; clubes da Série A–D usam o mesmo id do jogo', () => {
    expect(ESTADUAIS.length).toBe(27);
    expect(ESTADUAL_CLUB_COUNT).toBe(346);
    const all = allEstadualClubs();
    expect(all.length).toBe(346);
    expect(new Set(all.map((c) => c.id)).size).toBe(346);
    const game = new Set(['serie-a', 'serie-b', 'serie-c', 'serie-d'].flatMap((d) => CLUBS_DATA[d].map((c) => c.id)));
    for (const c of all.filter((x) => x.inGame)) expect(game.has(c.id)).toBe(true);
    expect(estadualClub('flamengo')?.uf).toBe('RJ');
    expect(estadualClub('bragantino')?.uf).toBe('SP');
    expect(estadualClub('vasco')?.uf).toBe('RJ');
    expect(estadualClub('athletic')?.uf).toBe('MG');
    expect(all.filter((c) => !c.inGame).length).toBeGreaterThan(150);
    expect(estadualClubsOf('SP').length).toBe(35);
  });
});

describe('estaduais na temporada', () => {
  it('Cearense, Carioca e Paulista têm Série A e B (divididos pela ordem do arquivo); os outros só a A', () => {
    const e = createEstaduais();
    const by = Object.fromEntries(e.comps.map((c) => [c.uf, c.divisions.map((d) => d.clubIds.length)]));
    expect(by.CE).toEqual([10, 5]);
    expect(by.RJ).toEqual([12, 6]);
    expect(by.SP).toEqual([16, 19]);
    for (const [uf, d] of Object.entries(by)) if (!['CE', 'RJ', 'SP'].includes(uf)) expect(d.length).toBe(1);
    const sp = e.comps.find((c) => c.uf === 'SP')!;
    expect(sp.divisions[0].clubIds.slice(0, 4)).toEqual(['palmeiras', 'corinthians', 'sao-paulo', 'santos']);
    expect(e.comps.reduce((n, c) => n + c.divisions.reduce((m, d) => m + d.clubIds.length, 0), 0)).toBe(346);
    expect(e.leagueSteps).toBe(19); expect(e.totalSteps).toBe(22); // 19 rodadas + semifinais (ida e volta) + final
    expect(singleRounds(16)).toBe(15); expect(singleRounds(19)).toBe(19);
  });
  it('a carreira começa pelos estaduais: o seu jogo vem como evento, antes da rodada 1 do campeonato', () => {
    const g = fresh();
    expect(g.estadual!.due).toBe(true);
    expect(g.round).toBe(1);
    const ev = pendingEvent(g)!;
    expect(ev.kind).toBe('estadual');
    expect(ev.label).toMatch(/Paulista/);
    expect([ev.match.homeId, ev.match.awayId]).toContain('palmeiras');
    expect(userEstadualMatch(g)).toBeTruthy();
    const r = playNext(g);
    expect(r.results.length).toBe(1);
    expect(r.results[0].events.length).toBeGreaterThan(0);
    expect(r.state.round).toBe(1); // o campeonato ainda não começou
    expect(r.state.estadual!.step).toBe(2);
  });
  it('rodadas sem jogo seu avançam sozinhas e, ao fim, começa o campeonato; todos os estaduais têm campeão', () => {
    let g = fresh('csa', 3); // CSA joga o Alagoano
    expect(estadualOfUser(g)!.comp.uf).toBe('AL');
    g = runEstadual(g);
    expect(g.estadual!.done).toBe(true); expect(g.estadual!.due).toBe(false);
    expect(g.round).toBe(1);
    const champs = estadualChampions(g);
    expect(champs.length).toBe(27);
    expect(champs.find((c) => c.uf === 'SP')!.divisions.map((d) => d.name)).toEqual(['Série A', 'Série B']);
    for (const c of g.estadual!.comps) for (const d of c.divisions) {
      const t = estadualTable(g, d);
      const rounds = singleRounds(d.clubIds.length);
      expect(t.every((r) => r.played >= rounds - 1 && r.played <= rounds)).toBe(true);
      const nL = (d.clubIds.length * (d.clubIds.length - 1)) / 2;
      expect(d.matches.length).toBe(d.clubIds.length >= 6 ? nL + 5 : nL); // + 2 semifinais de ida, 2 de volta e a final
    }
    const afterLeague = playRound(g).state;
    expect(afterLeague.round).toBe(2);
  });
  it('clubes só do estadual têm nome, time e elenco gerados; jogo contra eles funciona', () => {
    const g = fresh('csa', 3);
    const id = estadualClub('ee-galvez')?.id ?? allEstadualClubs().find((c) => !c.inGame)!.id;
    expect(clubOf(g, id).name).toBeTruthy();
    expect(teamOf(g, id).players.length).toBe(24);
    expect(teamOf(g, id)).toBe(teamOf(g, id)); // sempre o mesmo elenco
    expect(g.teams[id]).toBeUndefined(); // não ocupa espaço no save
  });
  it('campeão do estadual ganha prêmio; temporada fecha com o histórico dos 27 campeões e o título do treinador', () => {
    let g = fresh('palmeiras', 7);
    const t = g.teams.palmeiras; g = { ...g, teams: { ...g.teams, palmeiras: { ...t, players: t.players.map((p) => ({ ...p, strength: 97 })) } } };
    g = runEstadual(g);
    expect(g.news.some((n) => /Campeão do Campeonato Paulista|Paulista: você terminou/.test(n.text))).toBe(true);
    let guard = 0;
    while (!isSeasonOver(g) && guard++ < 400) { g = playNext(g).state; g = { ...g, morale: { ...g.morale, board: 60 } }; }
    const n = startNextSeason(g);
    expect(n.history[0].estadualChampions!.length).toBe(27);
    expect(n.estadual!.due).toBe(true); expect(n.estadual!.step).toBe(1);
    expect(n.estadual!.comps.every((c) => c.divisions.every((d) => d.matches.length === 0))).toBe(true);
  });
  it('acesso e rebaixamento entre Série A e B nos estados com 2 divisões (2 sobem, 2 descem)', () => {
    const g = runEstadual(fresh('palmeiras', 4));
    const next = nextEstaduais(g, g.estadual!);
    for (const uf of ['CE', 'RJ', 'SP']) {
      const prev = g.estadual!.comps.find((c) => c.uf === uf)!, cur = next.comps.find((c) => c.uf === uf)!;
      const ta = estadualRanking(g, prev.divisions[0]), tb = estadualRanking(g, prev.divisions[1]);
      expect(cur.divisions.map((d) => d.clubIds.length)).toEqual(prev.divisions.map((d) => d.clubIds.length));
      for (const id of ta.slice(-2)) { expect(cur.divisions[0].clubIds).not.toContain(id); expect(cur.divisions[1].clubIds).toContain(id); }
      for (const id of tb.slice(0, 2)) expect(cur.divisions[0].clubIds).toContain(id);
    }
  });
  it('placar rápido: favorito ganha mais; sem time do usuário o jogo é sempre decidido pelas forças', () => {
    const rng = makeRng(5); let fav = 0, dog = 0;
    for (let i = 0; i < 3000; i++) { const [h, a] = quickScore(rng, 70, 45); fav += h; dog += a; }
    expect(fav).toBeGreaterThan(dog * 2);
    const rng2 = makeRng(9); let h2 = 0, a2 = 0;
    for (let i = 0; i < 4000; i++) { const [h, a] = quickScore(rng2, 55, 55); h2 += h; a2 += a; }
    expect(h2).toBeGreaterThan(a2); // mando de casa
    expect(Math.abs(h2 + a2) / 4000).toBeGreaterThan(2);
  });
  it('sem clube (demitido) ou em ligas fora do Brasil, os estaduais correm sozinhos / não existem', () => {
    let g = { ...fresh('palmeiras', 2), unemployed: true };
    expect(pendingEvent(g)).toBeUndefined();
    g = runEstadual(g);
    expect(g.estadual!.done).toBe(true);
    expect(playEstadualStep(g).results).toEqual([]);
  });

  it('mata-mata: 4 primeiros, semifinais ida e volta, final em jogo único; o campeão sai da final', () => {
    const g = runEstadual(fresh('palmeiras', 4));
    const e = g.estadual!;
    expect(stepLabel(e, e.leagueSteps! + 1)).toBe('Semifinal · ida'); expect(stepLabel(e, e.totalSteps)).toBe('Final');
    for (const c of e.comps) for (const d of c.divisions) {
      const po = playoffOf(g, d);
      if (d.clubIds.length < 6) { expect(po).toBeUndefined(); continue; }
      const table = estadualTable(g, d).map((r) => r.clubId);
      expect(po!.seeds).toEqual(table.slice(0, 4));
      const [s1, s2] = po!.semis;
      expect([s1.hi, s1.lo, s2.hi, s2.lo]).toEqual([table[0], table[3], table[1], table[2]]);
      expect(po!.champion).toBeTruthy(); expect(po!.final!.score).toBeTruthy();
      expect(estadualRanking(g, d)[0]).toBe(po!.champion); expect(estadualRanking(g, d)[1]).toBe(po!.runnerUp);
      expect(new Set(estadualRanking(g, d)).size).toBe(d.clubIds.length);
      expect(d.matches.filter((m) => m[0] === e.leagueSteps! + 3).length).toBe(1);
    }
  });
  it('aviso de fim do estadual traz campeão, posição e Série D', () => {
    const g = runEstadual(fresh('csa', 3));
    const s = estadualSummary(g)!;
    expect(s.championId).toBeTruthy(); expect(s.pos).toBeGreaterThanOrEqual(1); expect(s.size).toBeGreaterThan(5);
    expect(s.outside).toBe(false); expect(s.serieD).toBe(false); // CSA já está na pirâmide
  });
  it('mando de campo intercalado: ninguém joga 3 jogos seguidos em casa ou fora na fase de pontos corridos', () => {
    const g = fresh('palmeiras', 4);
    for (const c of g.estadual!.comps) for (const d of c.divisions) {
      if (d.clubIds.length < 6) continue;
      for (const id of d.clubIds) {
        const seq: boolean[] = [];
        for (let s = 1; s <= singleRounds(d.clubIds.length); s++) { const f = fixturesAt(g, d, s).find((x) => x.homeId === id || x.awayId === id); if (f) seq.push(f.homeId === id); }
        for (let i = 2; i < seq.length; i++) expect(seq[i] === seq[i - 1] && seq[i] === seq[i - 2]).toBe(false);
      }
    }
  });
});

describe('calendário: jogos disputados', () => {
  it('cada jogo do seu clube é registrado com data, placar e competição, e o calendário lista os próximos', async () => {
    const { upcomingMatches } = await import('../src/engine/upcoming');
    let g = fresh('palmeiras', 4);
    expect(upcomingMatches(g, 100).length).toBeGreaterThan(30);
    for (let i = 0; i < 3; i++) g = playNext(g).state;
    expect(g.played!.length).toBe(3);
    expect(g.played![0].label).toMatch(/Paulista/);
    expect(g.played![1].day).toBeGreaterThan(g.played![0].day);
    expect(g.played!.every((m) => m.homeId === 'palmeiras' || m.awayId === 'palmeiras')).toBe(true);
  });
});
