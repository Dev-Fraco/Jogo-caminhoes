import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { playNext } from '../src/engine/game';
import { Home } from '../src/ui/Home';
import { CoachProfile } from '../src/ui/CoachProfile';
import { Newspaper } from '../src/ui/Newspaper';
import { makeCareer } from './helpers';

const noop = () => {};
const home = (g: ReturnType<typeof makeCareer>, last: ReturnType<typeof playNext>['results'] = []) => renderToStaticMarkup(createElement(Home, { game: g, onChange: noop, last, over: false, onPlay: noop, onSeeTables: noop, onSeeResults: noop, onNextSeason: noop, onEditLineup: noop, onAdvance: noop, onAdvanceToMatch: noop, onTab: noop, onNews: noop, onSeeHist: noop, onSeeOffers: noop } as never));

describe('Início enxuto', () => {
  const g0 = makeCareer('palmeiras', 5);
  const r = playNext(g0); const g = { ...r.state, news: [{ season: 2026, round: 1, text: 'Palmeiras vence e assume a liderança do campeonato.', tone: 'good' as const }, { season: 2026, round: 1, text: 'Torcida cobra reforços para a sequência da temporada.', tone: 'info' as const }, { season: 2026, round: 1, text: 'Diretoria avisa: queda de rendimento não será tolerada.', tone: 'bad' as const }] };

  it('tem só o que foi pedido: próximo jogo, avançar, editar escalação, ir até o dia do jogo, classificação, jornal e resultados da rodada com escudo e nome', () => {
    const html = home(g, r.results);
    expect(html).toContain('home2-match'); expect(html).toContain('Editar escalação');
    expect(html).toMatch(/Avançar 1 dia|Iniciar partida|Avançar até/); expect(html).toContain('Ir até o dia do jogo');
    expect(html).toContain('Classificação'); expect(html).toContain('fm-mini');
    expect(html).toContain('O Jornal da Bola'); expect(html).toContain('np-head');
    expect(html).toMatch(/Resultados da rodada/);
    // cada resultado: escudo e nome dos dois clubes
    const rows = html.split('res-row').slice(1); expect(rows.length).toBeGreaterThan(5);
    for (const row of rows.slice(0, 6)) { expect((row.match(/<svg|<img|club-badge|badge/g) ?? []).length, row.slice(0, 200)).toBeGreaterThanOrEqual(2); }
  });

  it('as opções que saíram não aparecem mais no Início', () => {
    const html = home(g, r.results);
    for (const gone of ['ELENCO', 'Ver meu elenco', 'Transferências', 'Abrir mercado', 'Últimos jogos', 'Moral', 'Pedir demissão', 'Carreira', 'lesionado', 'Competições', 'Propostas de emprego', 'Público:']) expect(html, gone).not.toContain(gone);
  });

  it('o jornal tem manchete e matérias em colunas; sem notícias mostra uma edição vazia', () => {
    const html = renderToStaticMarkup(createElement(Newspaper, { game: g }));
    expect(html).toContain('Palmeiras vence e assume a liderança'); expect(html).toContain('np-cols'); expect(html).toContain('Torcida cobra reforços'); expect(html).toContain('Diretoria avisa');
    expect(renderToStaticMarkup(createElement(Newspaper, { game: { ...g, news: [] } }))).toContain('Sem notícias nesta edição');
  });

  it('o que saiu do Início continua no jogo: moral, propostas de emprego e pedir demissão ficam na tela do Treinador', () => {
    const withOffer = { ...g, jobOffers: [{ clubId: 'flamengo', round: 1, season: 2026 }] } as never;
    const html = renderToStaticMarkup(createElement(CoachProfile, { game: withOffer, onNext: noop, onChange: noop }));
    expect(html).toContain('Moral'); expect(html).toContain('Pedir demissão'); expect(html).toContain('Propostas de emprego');
  });
});
