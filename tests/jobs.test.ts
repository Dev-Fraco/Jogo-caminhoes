import { describe, expect, it } from 'vitest';
import { balanceOf } from '../src/engine/bank';
import { acceptOffer, applicationOdds, applyForJob, boardTick, coachLevel, declineOffer, eligibleClubs, fire, generateJobOffers, hire, jobsOf, resign, seasonEndFiring, seasonEndOffers } from '../src/engine/jobs';
import { firingWarning, isSeasonOver, playNext, playRound, startNextSeason, simulateToEnd } from '../src/engine/game';
import { retireUser } from '../src/engine/ai';
import { makeRng } from '../src/engine/rng';
import { makeCareer } from './helpers';
import type { GameState, Player } from '../src/engine/types';

const fired = (g = makeCareer('flamengo', 6)) => fire(g, 'Teste.');

describe('demissão', () => {
  it('demitido: fica sem clube, recebe indenização, perde seguidores e o clube vira da IA', () => {
    const g = makeCareer('flamengo', 6);
    const before = balanceOf(g);
    const f = fire(g, 'Resultados ruins.');
    expect(f.unemployed).toBe(true);
    expect(f.firedInfo).toMatchObject({ clubId: 'flamengo', reason: 'Resultados ruins.' });
    expect(balanceOf(f)).toBeGreaterThan(before);
    expect(f.bank!.txs[0].title).toBe('Indenização');
    expect(f.coachPoints).toBe(-15);
    expect(jobsOf(f)[0]).toMatchObject({ clubId: 'flamengo', ended: 'demitido' });
    expect(f.news[0].text).toMatch(/demitido/);
    expect(fire(f, 'de novo')).toBe(f);
  });
  it('pedir demissão não paga indenização', () => {
    const g = makeCareer('flamengo', 6);
    const r = resign(g);
    expect(r.unemployed).toBe(true);
    expect(balanceOf(r)).toBe(balanceOf(g));
    expect(jobsOf(r)[0].ended).toBe('pediu demissão');
  });
  it('diretoria no limite por 4 rodadas seguidas demite; aviso antes; só no meio da temporada', () => {
    let g: GameState = { ...makeCareer('flamengo', 6), round: 16, morale: { team: 50, board: 5, fans: 50 } };
    g = boardTick(g, makeRng(1)); g = boardTick(g, makeRng(2)); g = boardTick(g, makeRng(3));
    expect(g.unemployed).toBeFalsy();
    expect(g.boardLow).toBe(3);
    expect(g.news[0].text).toMatch(/fio/);
    g = boardTick(g, makeRng(4));
    expect(g.unemployed).toBe(true);
    // diretoria satisfeita zera a contagem; no início da temporada não demite
    const ok = boardTick({ ...makeCareer('flamengo'), round: 20, boardLow: 3, morale: { team: 50, board: 60, fans: 50 } }, makeRng(1));
    expect(ok.boardLow).toBe(0);
    const early = boardTick({ ...makeCareer('flamengo'), round: 5, boardLow: 3, morale: { team: 50, board: 0, fans: 50 } }, makeRng(1));
    expect(early.unemployed).toBeFalsy();
  });
  it('fim de temporada: demite por confiança perdida, rebaixamento ou fiasco no título; Fácil é mais paciente', () => {
    const g = makeCareer('flamengo');
    expect(seasonEndFiring({ ...g, morale: { ...g.morale, board: 10 } }, 5, false)).toMatch(/confiança/);
    expect(seasonEndFiring({ ...g, morale: { ...g.morale, board: 70 } }, 19, true)).toMatch(/rebaixamento/);
    expect(seasonEndFiring({ ...g, morale: { ...g.morale, board: 40 } }, 12, false)).toMatch(/título/);
    expect(seasonEndFiring({ ...g, morale: { ...g.morale, board: 70 } }, 3, false)).toBeNull();
    expect(seasonEndFiring({ ...g, difficulty: 'easy', morale: { ...g.morale, board: 18 } }, 5, false)).toBeNull();
    expect(seasonEndFiring({ ...g, difficulty: 'hard', morale: { ...g.morale, board: 28 } }, 5, false)).toMatch(/confiança/);
    expect(seasonEndFiring({ ...g, unemployed: true, morale: { ...g.morale, board: 0 } }, 20, true)).toBeNull();
  });
  it('temporada acaba com demissão: startNextSeason deixa o treinador sem clube e o aviso aparece antes', () => {
    let g = makeCareer('flamengo', 6);
    g = simulateToEnd({ ...g });
    g = { ...g, morale: { ...g.morale, board: 5 } };
    expect(firingWarning(g)).toMatch(/confiança/);
    const n = startNextSeason(g);
    expect(n.unemployed).toBe(true);
    expect(n.season).toBe(g.season + 1);
    expect((n.jobOffers ?? []).length).toBeGreaterThan(0); // propostas ao virar a temporada
  });
});

describe('ficar sem clube e ser contratado', () => {
  it('sem clube o mundo continua: rodadas, copas e temporada rodam sozinhas, sem esperar o seu jogo', () => {
    let g = fired();
    let guard = 0;
    while (!isSeasonOver(g) && guard++ < 120) g = playNext(g).state;
    expect(isSeasonOver(g)).toBe(true);
    expect(g.lib?.championId).toBeTruthy();
    const next = startNextSeason(g);
    expect(next.unemployed).toBe(true);
    expect(Object.keys(next.teams).length).toBe(156);
  });
  it('o clube antigo passa a ser controlado pela IA (escalação automática e janela de transferências)', () => {
    const g = fired();
    const s = playRound(g).state;
    expect(s.teams.flamengo.lineup).toHaveLength(11);
    expect(g.unemployed).toBe(true);
  });
  it('propostas: surgem para clubes no nível do treinador, vencem e podem ser aceitas ou recusadas', () => {
    let g = fired(makeCareer('flamengo', 6));
    const lvl = coachLevel(g);
    const pool = eligibleClubs(g);
    expect(pool).not.toContain('flamengo'); // clube que acabou de demitir
    for (const id of pool) expect(g.clubs[id].reputation).toBeLessThanOrEqual(lvl);
    g = generateJobOffers(g, makeRng(5), 2);
    expect((g.jobOffers ?? []).length).toBe(2);
    const offer = g.jobOffers![0];
    const dec = declineOffer(g, g.jobOffers![1].clubId);
    expect(dec.jobOffers).toHaveLength(1);
    const r = acceptOffer(g, offer.clubId);
    if (!r.ok) throw new Error(r.error);
    expect(r.state.unemployed).toBe(false);
    expect(r.state.userClubId).toBe(offer.clubId);
    expect(r.state.jobOffers).toEqual([]);
    expect(r.state.morale.board).toBe(55);
    expect(jobsOf(r.state).map((j) => j.clubId)).toEqual(['flamengo', offer.clubId]);
    expect(acceptOffer(r.state, 'palmeiras').ok).toBe(false);
    // vencem depois de 8 rodadas
    const old = generateJobOffers({ ...g, round: g.round + 9 }, makeRng(9), 0);
    expect((old.jobOffers ?? []).every((o) => o.round !== g.round)).toBe(true);
  });
  it('candidatura: chance maior em clubes menores; uma por rodada; resultado fixo na rodada', () => {
    const g = fired(makeCareer('flamengo', 6));
    const lvl = coachLevel(g);
    const small = Object.keys(g.clubs).find((id) => g.clubs[id].reputation <= lvl - 1 && id !== 'flamengo')!;
    const big = Object.keys(g.clubs).find((id) => g.clubs[id].reputation >= lvl + 2 && id !== 'flamengo')!;
    expect(applicationOdds(g, small).pct).toBeGreaterThan(applicationOdds(g, big).pct);
    expect(applicationOdds(g, big).label).toBe('Muito baixa');
    expect(applyForJob(g, 'flamengo')).toMatchObject({ ok: false });
    const r = applyForJob(g, big);
    if (!r.ok) throw new Error(r.error);
    if (!r.accepted) {
      expect(applyForJob(r.state, small)).toMatchObject({ ok: false });
      expect(applyForJob({ ...r.state, round: r.state.round + 1 }, small).ok).toBe(true);
    }
    // empregado não se candidata
    expect(applyForJob(makeCareer('flamengo'), small)).toMatchObject({ ok: false });
    // com muitas tentativas (rodadas diferentes) alguém aceita um clube pequeno
    let hired = false;
    for (let i = 0; i < 12 && !hired; i++) { const t = applyForJob({ ...g, round: g.round + i }, small); hired = t.ok && t.accepted; }
    expect(hired).toBe(true);
  });
  it('quem vai bem recebe proposta de clube maior no fim da temporada; quem vai mal, não', () => {
    let any = false;
    for (let seed = 1; seed < 30 && !any; seed++) any = (seasonEndOffers(makeCareer('csa', seed), 1, true).jobOffers ?? []).length > 0;
    expect(any).toBe(true);
    expect(seasonEndOffers(makeCareer('csa'), 15, false).jobOffers ?? []).toEqual([]);
  });
  it('contratar leva o treinador ao novo clube com listas e propostas zeradas', () => {
    const g = fired();
    const h = hire(g, 'santos');
    expect(h.userClubId).toBe('santos');
    expect(h.transferList).toEqual([]);
    expect(h.teams.santos.lineup).toHaveLength(11);
    expect(h.news[0].text).toMatch(/novo treinador do Serranos Clube/);
  });
});

describe('aposentadoria', () => {
  const mk = (age: number, i: number, pos: Player['pos'] = 'MID'): Player => ({ id: `p${i}`, name: `J${i}`, pos, age, strength: 70 });
  const squad = [...[0, 1, 2].map((i) => mk(30, i, 'GK')), ...[3, 4, 5, 6, 7, 8].map((i) => mk(28, i, 'DEF')), ...[9, 10, 11, 12, 13, 14].map((i) => mk(27, i)), ...[15, 16, 17, 18].map((i) => mk(25, i, 'ATT')), mk(39, 19), mk(36, 20), mk(34, 21)];
  it('seu clube: 38+ sempre se aposentam; 35–37 às vezes; 34 ou menos nunca; elenco continua válido', () => {
    const r = retireUser(squad, makeRng(3));
    expect(r.retired.some((p) => p.age === 39)).toBe(true);
    expect(r.retired.every((p) => p.age >= 35)).toBe(true);
    expect(r.left.some((p) => p.age === 34)).toBe(true);
    expect(r.left.length + r.retired.length).toBe(squad.length);
  });
  it('na virada de temporada os aposentados são registrados e viram notícia', () => {
    let g = makeCareer('flamengo', 4);
    const old = g.teams.flamengo.players.map((p, i) => (i < 3 ? { ...p, age: 38 } : p));
    g = { ...g, teams: { ...g.teams, flamengo: { ...g.teams.flamengo, players: old } } };
    for (let i = 0; i < 400 && !isSeasonOver(g); i++) { g = playNext(g).state; g = { ...g, unemployed: undefined, morale: { ...g.morale, board: 60 } }; } // a diretoria não demite durante o teste
    const n = startNextSeason(g);
    expect((n.retired ?? []).length).toBeGreaterThan(3);
    expect(n.retired!.some((r) => r.clubId === 'flamengo')).toBe(true);
    expect(n.news.some((x) => /Aposentados do seu clube/.test(x.text))).toBe(true);
    expect(n.retired!.every((r) => r.season === g.season)).toBe(true);
  });
});
