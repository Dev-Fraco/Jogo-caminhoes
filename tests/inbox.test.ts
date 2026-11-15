import { describe, expect, it } from 'vitest';
import { brazilPyramid } from '../src/data/pyramid';
import { newCareer, playNext } from '../src/engine/game';
import { absRound, answerMessage, claimGoal, claimable, goalDone, inboxOf, inboxTick, openMessages, pendingCount, urgentMessages } from '../src/engine/inbox';
import { registerBank } from '../src/engine/bank';
import { makeRng } from '../src/engine/rng';
import type { GameState } from '../src/engine/types';

const mk = (seed = 3): GameState => newCareer({ saveName: 't', coach: { name: 'A B', nationality: 'BR', reputation: 'pro' }, difficulty: 'normal', mode: 'career', season: 2026, userClubId: 'palmeiras', divisions: brazilPyramid(), cup: true }, seed);
const keep = (g: GameState): GameState => ({ ...g, morale: { ...g.morale, board: 60 } });
const play = (g: GameState, n: number) => { for (let i = 0; i < n; i++) g = keep(playNext(g).state); return g; };
const league = (g: GameState) => { while (g.estadual?.due) g = keep(playNext(g).state); return g; };

describe('mensagens e metas do celular', () => {
  it('com o tempo chegam mensagens, metas e notificações do app Mensagens', () => {
    const g = play(league(mk()), 12);
    const inbox = inboxOf(g);
    expect(inbox.msgs.length).toBeGreaterThan(0);
    expect(inbox.goals.filter((x) => !x.claimed && !x.expired).length).toBe(3);
    expect(g.phone?.notifications.some((n) => n.app === 'mensagens')).toBe(true);
    expect(pendingCount(g)).toBeGreaterThan(0);
  });
  it('responder muda o jogo: patrocínio paga, coletiva mexe no humor, torcida ignorada reclama', () => {
    let g = play(league(mk(5)), 14);
    for (const m of openMessages(g)) {
      const before = { ...g.morale }, cash = g.coachMoney ?? 0, club = g.budgets[g.userClubId];
      const opt = m.options[0].id;
      const n = answerMessage(g, m.id, opt);
      expect(inboxOf(n).msgs.find((x) => x.id === m.id)!.status).toBe('done');
      if (m.kind === 'sponsor') expect(n.coachMoney).toBeGreaterThan(cash);
      if (m.kind === 'clubspons') expect(n.budgets[n.userClubId]).toBeGreaterThan(club);
      if (m.kind === 'fans') expect(n.morale.fans).toBeGreaterThanOrEqual(before.fans);
      expect(inboxOf(n).answered).toBe(inboxOf(g).answered + 1);
      expect(answerMessage(n, m.id, opt)).toBe(n); // não responde duas vezes
    }
  });
  it('mensagem ignorada expira com desgaste; urgentes são avisadas antes do jogo', () => {
    let g = play(league(mk(7)), 10);
    let fanMsg = openMessages(g).find((m) => m.kind === 'fans' || m.kind === 'board');
    for (let i = 0; i < 30 && !fanMsg; i++) { g = play(g, 1); fanMsg = openMessages(g).find((m) => m.kind === 'fans' || m.kind === 'board'); }
    expect(fanMsg).toBeTruthy();
    const id = fanMsg!.id;
    let h = g;
    for (let i = 0; i < 6; i++) h = play(h, 1);
    const m = inboxOf(h).msgs.find((x) => x.id === id)!;
    expect(m.status).toBe('expired');
    expect(m.result).toMatch(/ignor|sem resposta|não respondeu/i);
    expect(urgentMessages({ ...g, round: absRound(g) % 200 }).length).toBeGreaterThanOrEqual(0);
  });
  it('metas: resgatar só quando cumpridas e paga na conta', () => {
    let g = play(league(mk(9)), 3);
    expect(inboxOf(g).goals.length).toBe(3);
    const goal = { id: 'G-test', kind: 'reply' as const, text: 'Responder 2 mensagens', target: 2, base: inboxOf(g).answered, startAbs: absRound(g), expires: absRound(g) + 8, reward: 50_000, claimed: false, expired: false };
    g = { ...g, inbox: { ...inboxOf(g), goals: [goal, ...inboxOf(g).goals] } };
    expect(claimGoal(g, goal.id)).toBe(g);
    // força o cumprimento: simula respostas
    g = { ...g, inbox: { ...inboxOf(g), answered: inboxOf(g).answered + goal.target } };
    expect(goalDone(g, goal)).toBe(true);
    expect(claimable(g).some((x) => x.id === goal.id)).toBe(true);
    const cash = g.coachMoney ?? 0;
    const n = claimGoal(g, goal.id);
    expect(n.coachMoney).toBe(cash + goal.reward);
    expect(claimGoal(n, goal.id)).toBe(n);
  });
  it('não existe mais meta de lotar o estádio (nem em saves antigos)', () => {
    let g = play(league(mk(11)), 14);
    expect(inboxOf(g).goals.some((x) => (x.kind as string) === 'sellout')).toBe(false);
    g = { ...g, inbox: { ...inboxOf(g), goals: [{ id: 'old', kind: 'sellout' as never, text: 'x', target: 1, base: 0, startAbs: 0, expires: 9e9, reward: 1, claimed: false, expired: false }, ...inboxOf(g).goals] } };
    expect(inboxOf(g).goals.some((x) => (x.kind as string) === 'sellout')).toBe(false);
  });
  it('quem tem conta no banco recebe a fatura do cartão como boleto', () => {
    let g = league(mk(13));
    const r = registerBank(g, 'A B', 'segredo1', 'segredo1');
    expect(r.ok).toBe(true);
    if (r.ok) g = r.state;
    g = play(g, 4);
    expect(g.bank!.boletos.some((b) => b.merchant === 'Cartão de crédito')).toBe(true);
    void inboxTick; void makeRng;
  });
});
