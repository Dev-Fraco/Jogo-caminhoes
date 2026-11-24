import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Intro, STUDIO_NAME } from '../src/ui/Intro';
import { audio } from '../src/audio/audio';

describe('abertura', () => {
  it('começa mostrando o nome da empresa e a abertura sonora não quebra sem áudio', () => {
    const html = renderToStaticMarkup(createElement(Intro, { onDone: () => {} }));
    expect(html).toContain(STUDIO_NAME);
    expect(html).toContain('apresenta');
    expect(() => audio.intro()).not.toThrow();
  });
});
