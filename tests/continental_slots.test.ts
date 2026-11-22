import { describe, expect, it } from 'vitest';
import { domesticOrder } from '../src/engine/continental';

const rank = Array.from({ length: 20 }, (_, i) => `c${i + 1}`);
describe('vagas da Libertadores e da Sul-Americana (regras 2026)', () => {
  it('base: 1º ao 4º + vaga preliminar (5º); a Sul-Americana pega os 6 seguintes que não estão na Libertadores', () => {
    const o = domesticOrder(rank);
    expect(o.slice(0, 5)).toEqual(['c1', 'c2', 'c3', 'c4', 'c5']);
    expect(o.slice(6, 12)).toEqual(['c7', 'c8', 'c9', 'c10', 'c11', 'c12']);
  });
  it('campeão da Copa do Brasil entra e as vagas descem; o vice fica com a vaga preliminar', () => {
    const o = domesticOrder(rank, 'c9', { vice: 'c12' });
    expect(o.slice(0, 6)).toEqual(['c9', 'c1', 'c2', 'c3', 'c4', 'c12']); // 6 vagas na fase de grupos do jogo (campeão, 1º-4º e o preliminar)
    expect(o.slice(6, 12)).toEqual(['c5', 'c6', 'c7', 'c8', 'c10', 'c11']); // Sul-Americana: os melhores que não estão na Libertadores
  });
  it('campeão da Copa do Brasil já classificado pelo Brasileirão: não ocupa duas vagas, a vaga passa ao próximo', () => {
    const o = domesticOrder(rank, 'c2', { vice: 'c3' }); // vice também já está entre os 4 primeiros
    expect(o.slice(0, 6)).toEqual(['c2', 'c1', 'c3', 'c4', 'c5', 'c6']);
    expect(new Set(o).size).toBe(o.length);
  });
  it('campeão continental do ano anterior (que mora no país) tem vaga e não repete', () => {
    const o = domesticOrder(rank, 'c1', { holders: ['c15', 'c1'] });
    expect(o.slice(0, 3)).toEqual(['c15', 'c1', 'c2']);
    expect(new Set(o).size).toBe(o.length);
  });
});
