/* =====================================================================
   Compressão simples (LZW com códigos de 16 bits) para guardar cópias de segurança do save no localStorage sem ocupar o espaço do jogo.
   Sem bibliotecas: texto -> UTF-8 -> códigos -> texto UTF-16 (15 bits úteis por caractere, nunca gera caractere inválido).
   O formato é fixo e conferido na leitura (contagem de códigos): se algo estiver truncado, `decompress` devolve null.
   ===================================================================== */

const MAX_CODES = 65536;
const CHAR_BITS = 15;

export function compress(text: string): string {
  const bytes = new TextEncoder().encode(text);
  const dict = new Map<number, number>();
  let next = 256;
  const codes: number[] = [];
  let w = -1;
  for (let i = 0; i < bytes.length; i++) {
    const c = bytes[i];
    if (w < 0) { w = c; continue; }
    const key = w * 256 + c;
    const hit = dict.get(key);
    if (hit !== undefined) { w = hit; continue; }
    codes.push(w);
    if (next < MAX_CODES) dict.set(key, next++);
    w = c;
  }
  if (w >= 0) codes.push(w);
  // empacota: cada código vale 16 bits; cada caractere guarda 15 bits
  let out = `${codes.length}:`;
  let acc = 0, bits = 0;
  const chunks: string[] = [];
  let buf: number[] = [];
  const flush = () => { chunks.push(String.fromCharCode(...buf)); buf = []; };
  for (const code of codes) {
    acc = (acc << 16) | code; bits += 16;
    while (bits >= CHAR_BITS) { bits -= CHAR_BITS; buf.push((acc >> bits) & 0x7fff); acc &= (1 << bits) - 1; if (buf.length >= 8192) flush(); }
  }
  if (bits > 0) buf.push((acc << (CHAR_BITS - bits)) & 0x7fff);
  if (buf.length) flush();
  return out + chunks.join('');
}

/** Descomprime o texto gerado por `compress`. null = dado truncado ou inválido. */
export function decompress(packed: string): string | null {
  const sep = packed.indexOf(':');
  if (sep < 1) return null;
  const n = Number(packed.slice(0, sep));
  if (!Number.isInteger(n) || n < 0) return null;
  const codes: number[] = [];
  let acc = 0, bits = 0;
  for (let i = sep + 1; i < packed.length && codes.length < n; i++) {
    acc = (acc << CHAR_BITS) | (packed.charCodeAt(i) & 0x7fff); bits += CHAR_BITS;
    while (bits >= 16 && codes.length < n) { bits -= 16; codes.push((acc >> bits) & 0xffff); acc &= (1 << bits) - 1; }
  }
  if (codes.length !== n) return null;
  const prefix = new Int32Array(MAX_CODES), last = new Uint8Array(MAX_CODES), first = new Uint8Array(MAX_CODES), len = new Uint32Array(MAX_CODES);
  for (let i = 0; i < 256; i++) { prefix[i] = -1; last[i] = i; first[i] = i; len[i] = 1; }
  let next = 256, prev = -1;
  let out = new Uint8Array(Math.max(1024, n * 4));
  let pos = 0;
  const ensure = (extra: number) => { if (pos + extra > out.length) { const o = new Uint8Array(Math.max(out.length * 2, pos + extra)); o.set(out); out = o; } };
  const emit = (code: number) => { const l = len[code]; ensure(l); let p = pos + l - 1, c = code; while (c >= 0) { out[p--] = last[c]; c = prefix[c]; } pos += l; };
  for (const code of codes) {
    if (code < next) {
      emit(code);
      if (prev >= 0 && next < MAX_CODES) { prefix[next] = prev; last[next] = first[code]; first[next] = first[prev]; len[next] = len[prev] + 1; next++; }
    } else if (code === next && prev >= 0 && next < MAX_CODES) {
      prefix[next] = prev; last[next] = first[prev]; first[next] = first[prev]; len[next] = len[prev] + 1; next++;
      emit(code);
    } else return null;
    prev = code;
  }
  try { return new TextDecoder('utf-8', { fatal: true }).decode(out.subarray(0, pos)); } catch { return null; }
}
