import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { clubOf, teamOf } from '../src/engine/lookup';
import { LineupCompare } from '../src/ui/LineupCompare';
import { makeCareer } from './helpers';

describe('comparação de escalações antes da partida', () => {
  it('mostra os 11 titulares dos dois times lado a lado e o botão Iniciar', () => {
    const g = makeCareer('palmeiras', 3);
    const other = Object.keys(g.teams).find((id) => id !== g.userClubId)!;
    const html = renderToStaticMarkup(createElement(LineupCompare, { home: clubOf(g, g.userClubId), away: clubOf(g, other), homeTeam: teamOf(g, g.userClubId), awayTeam: teamOf(g, other), userId: g.userClubId, onStart: () => {} }));
    expect((html.match(/<li/g) ?? []).length).toBe(22);
    expect(html).toContain('Iniciar');
    expect(html).toContain(clubOf(g, other).name);
  });
});
