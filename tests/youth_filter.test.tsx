import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { YouthScreen } from '../src/ui/YouthScreen';
import { ensureYouth } from '../src/engine/youth';
import { makeCareer } from './helpers';

describe('base: filtros', () => {
  it('a tela mostra ordenação, posição, estrelas e "só quem pode subir", e lista os de maior overall primeiro', () => {
    const g = ensureYouth(makeCareer('palmeiras', 4));
    const html = renderToStaticMarkup(createElement(YouthScreen, { game: g, onChange: () => {} } as never));
    expect(html).toContain('Maior overall');
    expect(html).toContain('Mais estrelas');
    expect(html).toContain('Só quem já pode subir');
    const ovrs = [...html.matchAll(/class="yt-ovr [^"]*">(\d+)</g)].map((m) => Number(m[1]));
    expect(ovrs.length).toBeGreaterThan(10);
    for (let i = 1; i < ovrs.length; i++) expect(ovrs[i]).toBeLessThanOrEqual(ovrs[i - 1]);
  });
});
