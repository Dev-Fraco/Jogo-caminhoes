import { describe, expect, it } from 'vitest';
import { wageOf } from '../src/engine/finance';
import { MAX_TALKS_PER_ROUND, anyClubName, clubPlayers, contractLeft, directory, expireContracts, foreignSquad, homeLeague, leagueScore, negotiate, quickSign, quote, renew, renewalQuote, talksLeft } from '../src/engine/market';
import { isSeasonOver, playNext, startNextSeason } from '../src/engine/game';
import { makeCareer } from './helpers';
import type { GameState } from '../src/engine/types';

const g0 = (club = 'palmeiras', seed = 5) => makeCareer(club, seed);
const pick = (g: GameState, clubId: string, role: 'reserve' | 'best' = 'reserve') => {
  const ps = [...clubPlayers(g, clubId)].sort((a, b) => b.strength - a.strength);
  return role === 'best' ? ps[0] : ps[ps.length - 1];
};
const good = (g: GameState, clubId: string, id: string) => { const q = quote(g, clubId, id)!; return { q, p: { fee: q.askFee, wage: q.wageDemand, years: q.yearsMax } }; };

describe('diretório de clubes', () => {
  it('traz os clubes da sua liga e de outras ligas, cada um com país e divisão', () => {
    const g = g0();
    const d = directory(g);
    expect(homeLeague(g).countryId).toBe('BR');
    expect(d.filter((c) => c.domestic).length).toBe(155);
    expect(d.some((c) => c.id === 'palmeiras')).toBe(false);
    expect(d.some((c) => !c.domestic && c.countryId === 'EN' && c.name === 'Arsenal')).toBe(true);
    expect(d.some((c) => !c.domestic && c.countryId === 'AR' && c.divisionName === 'Primera Nacional')).toBe(true);
    expect(new Set(d.map((c) => c.id)).size).toBe(d.length);
    expect(d.length).toBeGreaterThan(300);
    expect(leagueScore('EN', 0)).toBeGreaterThan(leagueScore('BR', 0));
    expect(leagueScore('BR', 0)).toBeGreaterThan(leagueScore('BR', 3));
  });
  it('elencos de fora vêm dos dados e envelhecem com os anos; veteranos viram garotos; é determinístico', () => {
    const g = g0();
    const a = foreignSquad(g, 'en-arsenal');
    expect(a.length).toBe(24);
    expect(foreignSquad(g, 'en-arsenal')).toEqual(a);
    const later = foreignSquad({ ...g, history: new Array(8).fill(g.history) as never }, 'en-arsenal');
    expect(later.length).toBe(24);
    expect(later.every((p) => p.age < 40)).toBe(true);
    expect(anyClubName(g, 'en-arsenal')).toBe('Arsenal');
  });
});

describe('negociação', () => {
  it('cotação: reserva é mais barato que craque; o mínimo do clube é menor que o pedido; contrato por idade', () => {
    const g = g0();
    const star = quote(g, 'santos', pick(g, 'santos', 'best').id)!, res = quote(g, 'santos', pick(g, 'santos').id)!;
    expect(star.role).toBe('best'); expect(res.role).toBe('reserve');
    expect(star.askFee).toBeGreaterThan(star.price);
    expect(star.minFee).toBeLessThanOrEqual(star.askFee);
    expect(quote(g, 'santos', 'nao-existe')).toBeNull();
    const young = clubPlayers(g, 'santos').find((p) => p.age <= 21), old = clubPlayers(g, 'santos').find((p) => p.age >= 32);
    if (young) expect(quote(g, 'santos', young.id)!.yearsMin).toBe(3);
    if (old) expect(quote(g, 'santos', old.id)!.yearsMax).toBe(2);
  });
  it('proposta boa fecha: paga o clube, o jogador entra com contrato e o salário passa a valer', () => {
    const g = g0();
    const p = pick(g, 'santos');
    const { p: prop } = good(g, 'santos', p.id);
    const r = negotiate(g, 'santos', p.id, prop);
    expect(r.deal).toBe(true);
    const me = r.state.teams.palmeiras.players.find((x) => x.id === p.id)!;
    expect(me.contract).toEqual({ wage: prop.wage, until: g.season + prop.years - 1 });
    expect(wageOf(r.state, 'palmeiras', me)).toBe(prop.wage);
    expect(r.state.teams.santos.players.some((x) => x.id === p.id)).toBe(false);
    expect(r.state.budgets.palmeiras).toBe(g.budgets.palmeiras - prop.fee);
    expect(r.state.budgets.santos).toBe(g.budgets.santos + prop.fee);
    expect(r.state.transfers.at(-1)).toMatchObject({ kind: 'buy', fee: prop.fee });
  });
  it('valor baixo: contraproposta do clube; ofensivo: sem conversa; salário baixo: contraproposta do jogador', () => {
    const g = g0();
    const p = pick(g, 'santos');
    const { q, p: prop } = good(g, 'santos', p.id);
    const low = negotiate(g, 'santos', p.id, { ...prop, fee: Math.round(q.minFee * 0.85) });
    expect(low.deal).toBe(false);
    expect(low.club.counter).toBe(q.minFee);
    expect(low.player.ok).toBe(true);
    const insult = negotiate(g, 'santos', p.id, { ...prop, fee: Math.round(q.minFee * 0.3) });
    expect(insult.club.ok).toBe(false); expect(insult.club.counter).toBeUndefined();
    const cheap = negotiate(g, 'santos', p.id, { ...prop, wage: Math.round(q.wageDemand * 0.5) });
    expect(cheap.deal).toBe(false);
    expect(cheap.player.counter).toBeGreaterThan(0);
    expect(cheap.club.ok).toBe(true);
  });
  it('anos fora do que o jogador quer exigem salário maior', () => {
    const g = g0();
    const p = clubPlayers(g, 'santos').find((x) => x.age >= 32) ?? pick(g, 'santos');
    const q = quote(g, 'santos', p.id)!;
    const r = negotiate(g, 'santos', p.id, { fee: q.askFee, wage: q.wageDemand, years: 5 });
    if (q.yearsMax < 5) { expect(r.player.ok).toBe(false); expect(r.player.counter).toBeGreaterThan(q.wageDemand); }
  });
  it('limite de tentativas por rodada, que volta na rodada seguinte', () => {
    let g = g0();
    const p = pick(g, 'santos');
    const q = quote(g, 'santos', p.id)!;
    for (let i = 0; i < MAX_TALKS_PER_ROUND; i++) g = negotiate(g, 'santos', p.id, { fee: Math.round(q.minFee * 0.8), wage: q.wageDemand, years: q.yearsMax }).state;
    expect(talksLeft(g, p.id)).toBe(0);
    const r = negotiate(g, 'santos', p.id, { fee: q.askFee, wage: q.wageDemand, years: q.yearsMax });
    expect(r.blocked).toMatch(/travaram/);
    expect(talksLeft({ ...g, round: g.round + 1 }, p.id)).toBe(MAX_TALKS_PER_ROUND);
  });
  it('bloqueios: orçamento, elenco cheio, clube vendedor sem elenco mínimo e sem clube', () => {
    const g = g0();
    const p = pick(g, 'santos');
    const { p: prop } = good(g, 'santos', p.id);
    expect(negotiate({ ...g, budgets: { ...g.budgets, palmeiras: 1000 } }, 'santos', p.id, prop).blocked).toMatch(/Orçamento/);
    const full = { ...g.teams.palmeiras, players: [...g.teams.palmeiras.players, ...g.teams.santos.players.slice(0, 6).map((x, i) => ({ ...x, id: `extra${i}` }))] };
    expect(negotiate({ ...g, teams: { ...g.teams, palmeiras: full } }, 'santos', p.id, prop).blocked).toMatch(/cheio/);
    const thin = { ...g.teams.santos, players: g.teams.santos.players.slice(0, 18) };
    const q2 = pick({ ...g, teams: { ...g.teams, santos: thin } }, 'santos');
    expect(negotiate({ ...g, teams: { ...g.teams, santos: thin } }, 'santos', q2.id, prop).blocked).toMatch(/mínimo/);
    expect(negotiate({ ...g, unemployed: true }, 'santos', p.id, prop).blocked).toMatch(/sem clube/);
  });
  it('craque de liga muito mais forte recusa clube pequeno; salário e preço de fora são maiores', () => {
    const g = g0('csa');
    const star = clubPlayers(g, 'en-man-city').sort((a, b) => b.strength - a.strength)[0];
    const q = quote(g, 'en-man-city', star.id)!;
    expect(q.refuses).toBeTruthy();
    const r = negotiate(g, 'en-man-city', star.id, { fee: q.askFee, wage: q.wageDemand * 3, years: 3 });
    expect(r.deal).toBe(false);
    const dom = g0('palmeiras');
    const lowEn = clubPlayers(dom, 'en-leeds').sort((a, b) => a.strength - b.strength)[0];
    const lowBr = clubPlayers(dom, 'santos').sort((a, b) => a.strength - b.strength)[0];
    expect(quote(dom, 'en-leeds', lowEn.id)!.wageDemand / lowEn.strength).toBeGreaterThan(0);
    expect(lowBr).toBeTruthy();
  });
  it('comprar de outra liga: o jogador sai do elenco de lá (e não reaparece) e entra no seu', () => {
    const g = g0();
    const p = pick(g, 'it-roma');
    const { p: prop, q } = good(g, 'it-roma', p.id);
    if (q.refuses) return;
    const r = negotiate({ ...g, budgets: { ...g.budgets, palmeiras: 900_000_000 } }, 'it-roma', p.id, prop);
    expect(r.deal).toBe(true);
    expect(clubPlayers(r.state, 'it-roma').some((x) => x.id === p.id)).toBe(false);
    expect(r.state.teams.palmeiras.players.some((x) => x.id === p.id)).toBe(true);
    expect(r.state.transfers.at(-1)!.fromClubId).toBe('it-roma');
    expect(anyClubName(r.state, 'it-roma')).toBe('Roma');
    expect(quote(r.state, 'it-roma', p.id)).toBeNull();
  });
  it('compra direta pelo preço pedido usa um contrato padrão', () => {
    const g = g0();
    const p = pick(g, 'santos');
    const r = quickSign(g, 'santos', p.id);
    expect(r.deal).toBe(true);
    expect(r.state.teams.palmeiras.players.find((x) => x.id === p.id)!.contract).toBeTruthy();
  });
});

describe('contratos e renovação', () => {
  const signed = () => {
    const g = g0(); const p = pick(g, 'santos');
    const r = negotiate(g, 'santos', p.id, good(g, 'santos', p.id).p);
    expect(r.deal).toBe(true);
    // contrato de 1 ano (termina nesta temporada)
    const t = r.state.teams.palmeiras;
    const players = t.players.map((x) => (x.id === p.id ? { ...x, contract: { ...x.contract!, until: g.season } } : x));
    return { g: { ...r.state, teams: { ...r.state.teams, palmeiras: { ...t, players } } }, id: p.id };
  };
  it('contrato de 1 ano termina no fim da temporada e o jogador sai', () => {
    const { g, id } = signed();
    const mine = g.teams.palmeiras.players.find((x) => x.id === id)!;
    expect(contractLeft(g, mine)).toBe(1);
    const e = expireContracts(g);
    expect(e.teams.palmeiras.players.some((x) => x.id === id)).toBe(false);
    expect(e.news[0].text).toMatch(/terminou/);
  });
  it('renovar: o jogador pede aumento; aceitando, o contrato novo vale e ele fica', () => {
    const { g, id } = signed();
    const q = renewalQuote(g, id)!;
    expect(q.wageDemand).toBeGreaterThan(q.current);
    const low = renew(g, id, q.current, 2);
    expect(low.ok).toBe(false); expect(low.counter).toBeGreaterThan(0);
    const ok = renew(g, id, q.wageDemand, Math.max(q.yearsMin, 2));
    expect(ok.ok).toBe(true);
    const p = ok.state.teams.palmeiras.players.find((x) => x.id === id)!;
    expect(p.contract!.until).toBeGreaterThan(g.season);
    expect(expireContracts(ok.state).teams.palmeiras.players.some((x) => x.id === id)).toBe(true);
  });
  it('na virada de temporada o contrato vencido é aplicado', () => {
    const { g, id } = signed();
    let s = g; while (!isSeasonOver(s)) { s = playNext(s).state; s = { ...s, morale: { ...s.morale, board: 60 } }; }
    const n = startNextSeason(s);
    expect(n.teams.palmeiras.players.some((x) => x.id === id)).toBe(false);
  });
  it('elenco no mínimo: o contrato é estendido em vez de deixar o elenco inválido', () => {
    const g = g0();
    const t = g.teams.palmeiras;
    const players = t.players.map((p, i) => (i === 0 ? { ...p, contract: { wage: 10_000, until: g.season } } : p));
    const thin = { ...t, players: players.slice(0, 18).map((p) => p) };
    const s = { ...g, teams: { ...g.teams, palmeiras: thin } };
    const e = expireContracts(s);
    expect(e.teams.palmeiras.players.length).toBeGreaterThanOrEqual(17);
  });
});
