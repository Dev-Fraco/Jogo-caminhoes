import { afterEach, describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { COMPARE, PLANS, PlanChoice } from '../src/premium/ui/PlanChoice';
import { PremiumPreview } from '../src/premium/ui/PremiumPreview';
import { MainMenu } from '../src/ui/MainMenu';
import { modsAllowed, setFreePreview } from '../src/premium/entitlement';

afterEach(() => setFreePreview(false));
const html = () => renderToStaticMarkup(createElement(PlanChoice, { onFree: () => {} }));

describe('tela de planos (Grátis x Premium)', () => {
  it('mostra a comparação (só o que existe), os três planos com os preços e as duas saídas', () => {
    const h = html();
    for (const t of ['Escolha como jogar', 'Grátis', 'Premium', 'Primeira temporada', 'Mods da comunidade', 'Anúncios', 'Sem anúncios', 'Continuar com a versão grátis']) expect(h, t).toContain(t);
    expect(PLANS.map((p) => [p.name, p.price])).toEqual([['Semanal', 'R$ 3,90'], ['Mensal', 'R$ 9,99'], ['Vitalício', 'R$ 29,99']]);
    for (const p of PLANS) expect(h).toContain(p.price);
    expect(COMPARE).toHaveLength(7);
    expect(h).toContain('Google Play'); expect(h).toContain('cancelar a qualquer momento');
  });
  it('visual sóbrio: sem emojis e com ícones vetoriais; a assinatura fica indisponível enquanto a cobrança não existe', () => {
    const h = html();
    expect(/\p{Extended_Pictographic}/u.test(h.replace(/<svg[\s\S]*?<\/svg>/g, ''))).toBe(false);
    expect(h).toContain('<svg');
    expect(h).toMatch(/pl-cta"[^>]*disabled/);
    const on = renderToStaticMarkup(createElement(PlanChoice, { onFree: () => {}, billingReady: true }));
    expect(on).not.toMatch(/pl-cta"[^>]*disabled/); expect(on).toContain('Assinar por R$ 9,99');
  });
  it('acessível: tabela com cabeçalhos, grupo de planos e botões com texto', () => {
    const h = html();
    expect(h).toContain('role="radiogroup"'); expect(h).toContain('scope="col"'); expect(h).toContain('scope="row"');
  });
});

describe('mods no grátis', () => {
  it('mods e pacotes de elencos são do Premium: no grátis a opção aparece com a marca Premium e a prévia explica o recurso', () => {
    expect(modsAllowed()).toBe(true);
    expect(renderToStaticMarkup(createElement(MainMenu, { onSelect: () => {} }))).not.toContain('hm-lock');
    setFreePreview(true);
    expect(modsAllowed()).toBe(false);
    expect(renderToStaticMarkup(createElement(MainMenu, { onSelect: () => {} }))).toContain('hm-lock');
    const p = renderToStaticMarkup(createElement(PremiumPreview, { feature: 'mods' }));
    expect(p).toContain('Mods da comunidade'); expect(p).toContain('Ver o Premium');
  });
});
