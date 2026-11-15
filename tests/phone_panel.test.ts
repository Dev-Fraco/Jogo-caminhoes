import { describe, expect, it } from 'vitest';
import { brazilPyramid } from '../src/data/pyramid';
import { newCareer } from '../src/engine/game';
import { connOf, phoneOf, toggleConn, updatePhoneSettings } from '../src/engine/phone';
import { CALC_START, calcPress, type CalcKey } from '../src/engine/calculator';

const mk = () => newCareer({ saveName: 't', coach: { name: 'A B', nationality: 'BR', reputation: 'pro' }, difficulty: 'normal', mode: 'career', season: 2026, userClubId: 'palmeiras', divisions: brazilPyramid() }, 1);
const run = (keys: string) => [...keys].reduce((s, k) => calcPress(s, k as CalcKey), CALC_START).display;

describe('painel rápido: conexões', () => {
  it('Wi-Fi e dados ligam e desligam; modo avião desliga tudo e ligar uma conexão tira o avião', () => {
    let g = mk();
    expect(connOf(g)).toEqual({ wifi: false, mobileData: false, airplane: false });
    g = toggleConn(g, 'wifi'); g = toggleConn(g, 'mobileData');
    expect(connOf(g)).toEqual({ wifi: true, mobileData: true, airplane: false });
    g = toggleConn(g, 'airplane');
    expect(connOf(g)).toEqual({ wifi: false, mobileData: false, airplane: true });
    g = toggleConn(g, 'wifi');
    expect(connOf(g)).toEqual({ wifi: true, mobileData: false, airplane: false });
    g = toggleConn(g, 'wifi');
    expect(connOf(g).wifi).toBe(false);
    g = toggleConn(toggleConn(g, 'airplane'), 'airplane');
    expect(connOf(g).airplane).toBe(false);
  });
  it('brilho continua entre 30 e 100', () => {
    const g = updatePhoneSettings(mk(), { brightness: 5 });
    expect(phoneOf(g).settings.brightness).toBe(30);
  });
});

describe('calculadora', () => {
  it('quatro operações, vírgula, porcentagem, sinal e apagar', () => {
    expect(run('12+30=')).toBe('42');
    expect(run('9-12=')).toBe('-3');
    expect(run('6×7=')).toBe('42');
    expect(run('7÷2=')).toBe('3,5');
    expect(run('0,1+0,2=')).toBe('0,3');
    expect(run('50%')).toBe('0,5');
    expect(run('5±')).toBe('-5');
    expect(run('123⌫⌫')).toBe('1');
    expect(run('2+3+4=')).toBe('9');
    expect(run('2+3×4=')).toBe('20'); // sem precedência, como calculadora simples
  });
  it('divisão por zero dá erro até apertar C', () => {
    expect(run('5÷0=')).toBe('Erro');
    expect(calcPress(calcPress(CALC_START, '5'), 'C')).toEqual(CALC_START);
    const e = [...'5÷0='].reduce((s, k) => calcPress(s, k as CalcKey), CALC_START);
    expect(calcPress(e, '3')).toBe(e);
    expect(calcPress(e, 'C')).toEqual(CALC_START);
  });
  it('limita o tamanho do número e só aceita uma vírgula', () => {
    expect(run('1234567890123456').replace(/[-,]/g, '').length).toBe(12);
    expect(run('1,2,3')).toBe('1,23');
  });
});
