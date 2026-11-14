import { beforeEach, describe, expect, it } from 'vitest';
import { applyMods, modTemplate, parseMod } from '../src/data/mods';
import { CLUBS_DATA } from '../src/data/clubs';
import { balanceOf, createBoleto, openBoletos, registerBank } from '../src/engine/bank';
import { isSeasonOver, skipSeasons, startNextSeason } from '../src/engine/game';
import { entriesOf } from '../src/engine/hall';
import { newObserverWorld, simLeagues, simulateOneYear } from '../src/engine/sim';
import { makeCareer } from './helpers';
import type { GameState } from '../src/engine/types';

const keepBoard = (g: GameState): GameState => ({ ...g, morale: { ...g.morale, board: 60 } });

describe('pular de 1 a 5 anos', () => {
  it('pula N temporadas e guarda os campeões de cada uma, com a classificação final', () => {
    const g = skipSeasons(keepBoard(makeCareer('palmeiras', 3)), 3);
    expect(g.history.length).toBe(2); // 2 temporadas já viradas + a última parada no fim
    expect(isSeasonOver(g) || g.unemployed).toBeTruthy();
    for (const h of g.history) {
      expect(h.divisions.length).toBe(4);
      expect(h.tables!.length).toBe(4);
      expect(h.tables![0].rows.length).toBe(20);
      expect(h.tables![0].rows[0][0]).toBe(h.divisions[0].championId);
      expect(h.libChampionId && h.uclChampionId && h.mundialChampionId).toBeTruthy();
    }
    expect(skipSeasons(keepBoard(makeCareer('palmeiras', 3)), 99).history.length).toBe(4); // máximo de 5 anos
  });
  it('1 ano termina a temporada atual sem virar', () => {
    const g = skipSeasons(makeCareer('flamengo', 2), 1);
    expect(isSeasonOver(g)).toBe(true);
    expect(g.history.length).toBe(0);
  });
  it('boletos em aberto são pagos sozinhos durante o pulo, sem multa nem retomada', () => {
    const r0 = registerBank(makeCareer('palmeiras', 4), 'Carlos Almeida', 'segredo1', 'segredo1');
    if (!r0.ok) throw new Error(r0.error);
    let g: GameState = { ...r0.state, coachMoney: 5_000_000 };
    g = createBoleto(g, { merchant: 'Teste', description: 'Parcela', amount: 10_000, dueInRounds: 3, purpose: { type: 'nada' } });
    expect(openBoletos(g).length).toBe(1);
    const s = skipSeasons(keepBoard(g), 1);
    expect(openBoletos(s).length).toBe(0);
    expect(s.bank!.boletos[0].status).toBe('paid');
    expect(s.autoPay).toBeFalsy(); // a opção não fica ligada depois do pulo
    expect(balanceOf(s)).toBeLessThan(5_000_000 + 20_000_000);
  });
  it('registra os títulos do treinador quando o clube é campeão', () => {
    let g = keepBoard(makeCareer('palmeiras', 7));
    // força o título: coloca o time muito acima dos outros
    const t = g.teams.palmeiras; g = { ...g, teams: { ...g.teams, palmeiras: { ...t, players: t.players.map((p) => ({ ...p, strength: 97 })) } } };
    let champ = 0;
    for (let i = 0; i < 4; i++) { g = keepBoard(skipSeasons(g, 1)); const c = g.divisions[0].clubIds; void c; g = startNextSeason(g); champ = (g.titles ?? []).length; if (champ) break; }
    expect(champ).toBeGreaterThan(0);
    expect(g.titles![0]).toMatchObject({ clubId: 'palmeiras', kind: expect.stringMatching(/liga|copa|continental|mundial/) });
  });
});

describe('simular anos sem treinador', () => {
  it('mundo de observador: todos os clubes da IA, sem propostas de emprego nem demissão', () => {
    const w = newObserverWorld('BR', 'brasileirao', 5);
    expect(w.observer).toBe(true);
    expect(w.unemployed).toBe(true);
    const n = simulateOneYear(w);
    expect(n.history.length).toBe(1);
    expect(n.season).toBe(2027);
    expect(n.jobOffers ?? []).toEqual([]);
    expect(n.firedInfo).toBeUndefined();
    expect(Object.keys(n.teams).length).toBe(80);
  });
  it('simula vários anos em qualquer liga, com campeões e tabelas guardados', () => {
    expect(simLeagues().length).toBe(16);
    for (const [c, l] of [['AR', 'liga-profesional'], ['EN', 'premier-league'], ['CL', 'primera-chile']]) {
      let w = newObserverWorld(c, l, 9);
      for (let i = 0; i < 3; i++) w = simulateOneYear(w);
      expect(w.history.length).toBe(3);
      expect(w.history.every((h) => h.tables![0].rows.length === w.divisions[0].clubIds.length)).toBe(true);
    }
  });
  it('salão de campeões: uma entrada por temporada, com nomes de clubes e copas', () => {
    let w = newObserverWorld('BR', 'brasileirao', 6);
    w = simulateOneYear(simulateOneYear(w));
    const e = entriesOf(w);
    expect(e.length).toBe(2);
    expect(e[0]).toMatchObject({ mode: 'simulacao', season: 2026 });
    expect(e[0].divisions.map((d) => d.name)).toEqual(['Série A', 'Série B', 'Série C', 'Série D']);
    expect(e[0].cups.map((c) => c.name)).toEqual(expect.arrayContaining(['Copa do Brasil', 'Libertadores', 'Champions League', 'Mundial de Clubes']));
    expect(new Set(e.map((x) => x.key)).size).toBe(2);
    const car = entriesOf(skipSeasons(keepBoard(makeCareer('flamengo', 1)), 2));
    expect(car[0].mode).toBe('carreira');
  });
});

describe('mods da comunidade', () => {
  beforeEach(() => applyMods([]));
  it('valida o pacote: JSON, nome, clubes que existem, cores', () => {
    expect(parseMod('nao e json').ok).toBe(false);
    expect(parseMod('{"name":"x","clubs":[]}').ok).toBe(false);
    expect(parseMod('{"name":"x","clubs":[{"id":"clube-que-nao-existe"}]}')).toMatchObject({ ok: false });
    expect(parseMod('{"name":"x","clubs":[{"id":"flamengo","primaryColor":"vermelho"}]}')).toMatchObject({ ok: false });
    expect(parseMod('{"clubs":[{"id":"flamengo"}]}').ok).toBe(false);
    expect(parseMod(modTemplate()).ok).toBe(true);
  });
  it('aplicar troca nomes e cores; desligar devolve os originais', () => {
    const fla = () => Object.values(CLUBS_DATA).flat().find((c) => c.id === 'flamengo')!;
    const orig = fla().name;
    const r = parseMod(modTemplate());
    if (!r.ok) throw new Error(r.error);
    applyMods([r.mod]);
    expect(fla().name).toBe('Meu Time');
    expect(fla().primaryColor).toBe('#c52613');
    applyMods([{ ...r.mod, enabled: false }]);
    expect(fla().name).toBe(orig);
    applyMods([]);
    expect(fla().name).toBe(orig);
  });
});
