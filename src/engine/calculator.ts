/** Calculadora simples de quatro operações (estado puro, fácil de testar). */
export interface CalcState { display: string; acc: number | null; op: '+' | '-' | '×' | '÷' | null; fresh: boolean; error: boolean }
export const CALC_START: CalcState = { display: '0', acc: null, op: null, fresh: true, error: false };
export type CalcKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | ',' | '+' | '-' | '×' | '÷' | '=' | 'C' | '⌫' | '±' | '%';

const num = (s: string) => Number(s.replace(',', '.'));
const fmt = (n: number): string => {
  if (!Number.isFinite(n)) return 'Erro';
  const r = Math.round(n * 1e9) / 1e9;
  return String(r).replace('.', ',');
};
function apply(a: number, op: CalcState['op'], b: number): number {
  switch (op) { case '+': return a + b; case '-': return a - b; case '×': return a * b; case '÷': return b === 0 ? NaN : a / b; default: return b; }
}

export function calcPress(s: CalcState, k: CalcKey): CalcState {
  if (s.error && k !== 'C') return s;
  if (k === 'C') return CALC_START;
  if (k >= '0' && k <= '9' && k.length === 1) {
    if (s.fresh) return { ...s, display: k, fresh: false };
    if (s.display.replace(/[-,]/g, '').length >= 12) return s;
    return { ...s, display: s.display === '0' ? k : s.display + k };
  }
  if (k === ',') return s.fresh ? { ...s, display: '0,', fresh: false } : s.display.includes(',') ? s : { ...s, display: s.display + ',' };
  if (k === '⌫') {
    if (s.fresh) return s;
    const d = s.display.length <= 1 || (s.display.length === 2 && s.display.startsWith('-')) ? '0' : s.display.slice(0, -1);
    return { ...s, display: d };
  }
  if (k === '±') return s.display === '0' ? s : { ...s, display: s.display.startsWith('-') ? s.display.slice(1) : '-' + s.display };
  if (k === '%') return { ...s, display: fmt(num(s.display) / 100), fresh: true };
  if (k === '=') {
    if (s.op === null || s.acc === null) return { ...s, fresh: true };
    const r = apply(s.acc, s.op, num(s.display));
    return Number.isFinite(r) ? { display: fmt(r), acc: null, op: null, fresh: true, error: false } : { ...CALC_START, display: 'Erro', error: true };
  }
  // operador
  const op = k as NonNullable<CalcState['op']>;
  if (s.op !== null && s.acc !== null && !s.fresh) {
    const r = apply(s.acc, s.op, num(s.display));
    if (!Number.isFinite(r)) return { ...CALC_START, display: 'Erro', error: true };
    return { display: fmt(r), acc: r, op, fresh: true, error: false };
  }
  return { ...s, acc: num(s.display), op, fresh: true };
}
