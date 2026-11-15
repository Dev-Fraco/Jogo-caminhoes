import { describe, expect, it } from 'vitest';
import { changePin, checkPin, hasPin, hashPin, installApp, installedApps, isInstalled, markAllRead, notifyPhone, phoneOf, registerPin, STORE_APPS, uninstallApp, unreadCount, updatePhoneSettings } from '../src/engine/phone';
import { makeCareer } from './helpers';

describe('celular', () => {
  it('primeiro acesso não tem PIN; cadastro exige 4 números iguais nas duas vezes e rejeita PIN óbvio', () => {
    const g = makeCareer();
    expect(hasPin(g)).toBe(false);
    for (const [a, b] of [['12', '12'], ['abcd', 'abcd'], ['1357', '1358'], ['1111', '1111'], ['1234', '1234']] as const) expect(registerPin(g, a, b).ok).toBe(false);
    const r = registerPin(g, '2580', '2580');
    expect(r.ok).toBe(true);
    if (r.ok) { expect(hasPin(r.state)).toBe(true); expect(checkPin(r.state, '2580')).toBe(true); expect(checkPin(r.state, '0000')).toBe(false); expect(JSON.stringify(r.state.phone)).not.toContain('2580'); }
  });
  it('não deixa cadastrar de novo e altera o PIN só com o atual correto', () => {
    const g = (registerPin(makeCareer(), '2580', '2580') as { ok: true; state: ReturnType<typeof makeCareer> }).state;
    expect(registerPin(g, '1357', '1357').ok).toBe(false);
    expect(changePin(g, '0000', '1357', '1357').ok).toBe(false);
    expect(changePin(g, '2580', '1357', '1358').ok).toBe(false);
    const c = changePin(g, '2580', '1357', '1357');
    expect(c.ok && checkPin(c.state, '1357') && !checkPin(c.state, '2580')).toBe(true);
    expect(hashPin('1357')).not.toBe(hashPin('1358'));
  });
  it('vem só com Loja, Mensagens e Configurações; a loja instala e remove os 8 apps', () => {
    let g = makeCareer();
    expect(installedApps(g).map((a) => a.id)).toEqual(['loja', 'mensagens', 'config']);
    expect(STORE_APPS.map((a) => a.name)).toEqual(expect.arrayContaining(['LinstaGrã', 'TikiTeko', 'Cassino', 'Concessionária', 'Corretor de Imóveis', 'Notícias', 'Banco', 'Internet de Chip']));
    expect(STORE_APPS.length).toBe(8);
    g = installApp(g, 'banco');
    expect(isInstalled(g, 'banco')).toBe(true);
    expect(installApp(g, 'banco')).toBe(g);
    expect(installApp(g, 'nao-existe')).toBe(g);
    g = uninstallApp(g, 'banco');
    expect(isInstalled(g, 'banco')).toBe(false);
    expect(isInstalled(g, 'loja')).toBe(true);
    expect(uninstallApp(g, 'loja')).toBe(g);
  });
  it('configurações: brilho limitado, tema, não perturbar; notificações', () => {
    let g = updatePhoneSettings(makeCareer(), { brightness: 5, dnd: true, wallpaper: 'noite' });
    expect(phoneOf(g).settings).toMatchObject({ brightness: 30, dnd: true, wallpaper: 'noite' });
    g = notifyPhone(notifyPhone(g, 'banco', 'Boleto vence amanhã'), 'banco', 'Pix recebido');
    expect(unreadCount(g)).toBe(2);
    expect(phoneOf(g).notifications[0].text).toBe('Pix recebido');
    expect(unreadCount(markAllRead(g))).toBe(0);
  });
});
