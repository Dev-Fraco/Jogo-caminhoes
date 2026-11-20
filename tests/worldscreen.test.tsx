import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { playNext } from '../src/engine/game';
import { ensureWorld, worldDivisions } from '../src/engine/wleagues';
import { SideMenu } from '../src/ui/SideMenu';
import { WorldScreen } from '../src/ui/WorldScreen';
import { makeCareer } from './helpers';

describe('tela Mundo', () => {
  let g = ensureWorld(makeCareer('palmeiras', 4)); for (let i = 0; i < 4; i++) g = playNext(g).state;
  it('lista todas as ligas do mundo com país, divisão, rodada e líder, e o seu campeonato primeiro, com filtro América/Europa', () => {
    const html = renderToStaticMarkup(createElement(WorldScreen, { game: g, onChange: () => {}, onBack: () => {} }));
    expect(html).toContain('Seu campeonato'); expect(html).toContain('América'); expect(html).toContain('Europa');
    for (const d of worldDivisions(g)) expect(html, d.id).toContain(`${d.countryName} · ${d.name}`);
    expect((html.match(/wd-head/g) ?? []).length).toBeGreaterThanOrEqual(24);
    expect(html).toMatch(/Rodada \d+\/\d+/); expect(html).toContain('líder:');
  });
  it('o menu lateral tem a opção Mundo', () => {
    expect(renderToStaticMarkup(createElement(SideMenu, { game: g, open: true, current: 'home', locked: false, onClose: () => {}, onGo: () => {} }))).toContain('Mundo');
  });
});
