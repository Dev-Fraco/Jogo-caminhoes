import { describe, expect, it } from 'vitest';
import { balanceOf } from '../src/engine/bank';
import { APP_INFO, canPost, contextOf, fit, growthPct, initialSocial, POST_TYPES, publish, socialAds, socialAfterMatch, socialOf, trendOf } from '../src/engine/social';
import { playRound } from '../src/engine/game';
import { makeCareer } from './helpers';

describe('redes sociais', () => {
  it('seguidores iniciais dependem da reputação do treinador e do clube', () => {
    const a = initialSocial(makeCareer('palmeiras'));
    const b = initialSocial(makeCareer('csa'));
    expect(a.linstagra.followers).toBeGreaterThan(b.linstagra.followers);
    expect(a.tikiteko.followers).toBeLessThan(a.linstagra.followers);
  });
  it('vitória faz ganhar seguidores e derrota faz perder; sequência pesa mais', () => {
    let g = makeCareer();
    const f0 = socialOf(g).linstagra.followers;
    const won = socialAfterMatch(g, 3, 0);
    expect(socialOf(won).linstagra.followers).toBeGreaterThan(f0);
    expect(contextOf(won)).toMatchObject({ last: 'win', streak: 1 });
    const lost = socialAfterMatch(g, 0, 2);
    expect(socialOf(lost).linstagra.followers).toBeLessThan(f0);
    let s = g; for (let i = 0; i < 4; i++) s = socialAfterMatch({ ...s, round: s.round + 1 }, 0, 1);
    expect(contextOf(s).streak).toBe(-4);
    expect(growthPct(socialOf(s).linstagra, 6)).toBeLessThan(-1);
    expect(contextOf(socialAfterMatch(s, 1, 1)).streak).toBe(0);
  });
  it('joga uma rodada de verdade e as redes reagem ao resultado', () => {
    const g = playRound(makeCareer('flamengo', 3)).state;
    expect(g.social?.lastMatch).toBeTruthy();
  });
  it('o tipo de post combina com o momento: dançar depois de perder dá revolta; pedir desculpas ajuda', () => {
    expect(fit('dance', 'win', 0).mult).toBeGreaterThan(1);
    expect(fit('dance', 'loss', 0).mult).toBeLessThan(0);
    expect(fit('apology', 'loss', 0).mult).toBeGreaterThan(1);
    expect(fit('apology', 'win', 0).mult).toBeLessThan(0);
    expect(fit('celebrate', 'loss', 0).mult).toBeLessThan(0);
    expect(fit('lifestyle', 'win', 10).mult).toBeGreaterThan(fit('lifestyle', 'win', 0).mult);
    expect(POST_TYPES.length).toBe(10);
  });
  it('publicar: derrota + dança perde seguidores e irrita a torcida; derrota + desculpas ganha e acalma', () => {
    const base = socialAfterMatch(makeCareer('palmeiras', 8), 0, 3);
    const bad = publish(base, 'linstagra', 'dance');
    const good = publish(base, 'linstagra', 'apology');
    if (!bad.ok || !good.ok) throw new Error('falhou');
    expect(bad.result.delta).toBeLessThan(0);
    expect(bad.state.morale.fans).toBeLessThan(base.morale.fans);
    expect(good.result.delta).toBeGreaterThan(0);
    expect(good.state.morale.fans).toBeGreaterThan(base.morale.fans);
    expect(socialOf(good.state).linstagra.posts[0].type).toBe('apology');
  });
  it('só um post por rede por rodada; libera na rodada seguinte; tipo exclusivo de outro app é recusado', () => {
    const g = makeCareer();
    const r = publish(g, 'tikiteko', 'challenge');
    if (!r.ok) throw new Error(r.error);
    expect(canPost(r.state, 'tikiteko')).toBe(false);
    expect(canPost(r.state, 'linstagra')).toBe(true);
    expect(publish(r.state, 'tikiteko', 'dance').ok).toBe(false);
    expect(canPost({ ...r.state, round: r.state.round + 1 }, 'tikiteko')).toBe(true);
    expect(publish(g, 'linstagra', 'challenge').ok).toBe(false); // desafio é só do TikiTeko
    expect(publish(g, 'linstagra', 'nao-existe').ok).toBe(false);
  });
  it('perda por revolta é limitada a 6% dos seguidores; viralizar rende muito mais', () => {
    let maxGain = 0;
    for (let seed = 1; seed < 60; seed++) {
      const g = socialAfterMatch(makeCareer('palmeiras', seed), 4, 0);
      const r = publish(g, 'tikiteko', 'dance');
      if (r.ok && r.result.viral) maxGain = Math.max(maxGain, r.result.delta / socialOf(g).tikiteko.followers);
    }
    expect(maxGain).toBeGreaterThan(0.04);
    const lost = socialAfterMatch(makeCareer(), 0, 5);
    const r = publish(lost, 'linstagra', 'dance');
    if (!r.ok) throw new Error(r.error);
    expect(r.result.delta).toBeGreaterThanOrEqual(-Math.round(socialOf(lost).linstagra.followers * 0.06));
  });
  it('tendência do TikiTeko muda a cada 3 rodadas e rende mais', () => {
    const g = makeCareer();
    expect(trendOf(g).apps).toContain('tikiteko');
    const ids = new Set([1, 4, 7, 10].map((r) => trendOf({ ...g, round: r }).id));
    expect(ids.size).toBeGreaterThan(1);
  });
  it('publicidade paga a cada 3 rodadas conforme os seguidores e cai no saldo do banco', () => {
    const g = makeCareer('palmeiras');
    const before = balanceOf(g);
    expect(socialAds({ ...g, round: 2 }).bank?.txs.length ?? 0).toBe(0); // fora da data, nada é pago
    const paid = socialAds({ ...g, round: 3 });
    expect(balanceOf(paid)).toBeGreaterThan(before);
    expect(paid.bank!.txs[0].title).toBe('Publicidade');
    expect(APP_INFO.tikiteko.adPerFollower).toBeGreaterThan(APP_INFO.linstagra.adPerFollower);
    const tiny = socialAds({ ...(() => { const c = makeCareer('csa'); return { ...c, coach: { ...c.coach, reputation: 'unknown' } }; })(), round: 3 });
    expect(tiny.bank?.txs.length ?? 0).toBe(0); // menos de mil seguidores não vira anúncio
  });
});
