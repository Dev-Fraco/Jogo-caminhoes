import { describe, expect, it } from 'vitest';
import { brazilPyramid } from '../src/data/pyramid';
import { CUP_DATES, CUP_SIZE, cupMatchDue, playCupRound, userCupTie } from '../src/engine/cup';
import { isSeasonOver, newCareer, playNext, playRound, startNextSeason } from '../src/engine/game';

/** Cria a carreira e já passa pelos estaduais (que acontecem antes do campeonato), para testar a copa. */
const career = (user = 'palmeiras', seed = 5) => { let g = fresh(user, seed); while (g.estadual?.due) g = playNext(g).state; return g; };
const fresh = (user = 'palmeiras', seed = 5) => newCareer({
  saveName: 't', coach: { name: 'Teste Silva', nationality: 'BR', reputation: 'pro' }, difficulty: 'normal', mode: 'career', season: 2026,
  userClubId: user, divisions: brazilPyramid(), cup: true,
}, seed);

describe('Copa do Brasil', () => {
  it('64 clubes, 32 jogos na 1ª fase, o seu clube sempre participa (mesmo da Série D)', () => {
    for (const club of ['palmeiras', 'csa', 'portuguesa']) {
      const g = career(club);
      expect(g.cup!.alive.length).toBe(CUP_SIZE);
      expect(g.cup!.rounds[0].ties.length).toBe(32);
      expect(g.cup!.alive).toContain(club);
      expect(new Set(g.cup!.alive).size).toBe(CUP_SIZE);
    }
  });
  it('a fase abre depois da rodada marcada e o jogo do seu clube vem antes da próxima rodada', () => {
    let g = career();
    for (let i = 0; i < CUP_DATES[0]; i++) { expect(cupMatchDue(g)).toBe(false); g = playNext(g).state; }
    expect(cupMatchDue(g)).toBe(true);
    const round = g.round;
    expect(userCupTie(g)).toBeTruthy();
    const r = playNext(g);
    expect(r.state.round).toBe(round); // não avançou o campeonato
    expect(r.results.every((x) => x.divisionId === 'copa-do-brasil')).toBe(true);
    expect(r.results.find((x) => x.homeId === 'palmeiras' || x.awayId === 'palmeiras')!.events.length).toBeGreaterThan(0);
    expect(r.state.cup!.roundIndex).toBe(1);
    expect(r.state.cup!.rounds[1].ties.length).toBe(r.state.cup!.alive.length / 2);
  });
  it('temporada inteira: sai um campeão, empates têm vencedor e a próxima temporada sorteia nova copa', () => {
    let g = career('flamengo', 9);
    let guard = 0;
    while (!isSeasonOver(g) && guard++ < 100) g = playNext(g).state;
    expect(g.cup!.championId).toBeTruthy();
    expect(g.cup!.rounds.length).toBe(6);
    expect(g.cup!.rounds.flatMap((r) => r.ties).every((t) => t.winnerId)).toBe(true);
    const champ = g.cup!.championId!;
    const n = startNextSeason(g);
    expect(n.history.at(-1)!.cupChampionId).toBe(champ);
    expect(n.cup!.championId).toBeUndefined();
    expect(n.cup!.alive.length).toBe(CUP_SIZE);
  });
  it('playRound sozinho (sem a interface) também termina a temporada com a copa decidida', () => {
    let g = career('santos', 3);
    while (!isSeasonOver(g)) g = playRound(g).state;
    expect(g.cup!.championId).toBeTruthy();
  });
  it('quem é eliminado não precisa jogar: a copa é simulada sozinha', () => {
    let g = career('csa', 2);
    for (let i = 0; i < 38; i++) { if (isSeasonOver(g)) break; g = playNext(g).state; }
    expect(g.cup!.championId).toBeTruthy();
    expect(playCupRound(g).results).toEqual([]);
  });
});
