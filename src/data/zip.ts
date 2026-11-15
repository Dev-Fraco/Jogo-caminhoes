/** Leitor mínimo de ZIP (arquivos guardados ou comprimidos com deflate), sem bibliotecas. Devolve cada arquivo como Blob. */
export type Inflate = (data: Uint8Array) => Promise<Uint8Array>;

/** Descompacta "deflate cru" com o recurso do próprio navegador (Chrome/Android WebView 80+). */
export const browserInflate: Inflate = async (data) => {
  const DS = (globalThis as { DecompressionStream?: new (f: string) => TransformStream }).DecompressionStream;
  if (!DS) throw new Error('Este aparelho não consegue abrir ZIP comprimido. Use um ZIP "sem compressão" ou instale os arquivos separados (.json e imagens).');
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DS('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
};

const u16 = (v: DataView, o: number) => v.getUint16(o, true);
const u32 = (v: DataView, o: number) => v.getUint32(o, true);

export interface ZipEntry { name: string; data: Uint8Array }

/** Lê todos os arquivos do ZIP (ignora pastas). Aceita no máximo `maxEntries` arquivos e `maxBytes` descompactados. */
export async function readZip(buf: ArrayBuffer | Uint8Array, inflate: Inflate = browserInflate, opts: { maxEntries?: number; maxBytes?: number } = {}): Promise<ZipEntry[]> {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const maxEntries = opts.maxEntries ?? 6000, maxBytes = opts.maxBytes ?? 200_000_000;
  // fim do diretório central
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 66_000); i--) if (u32(v, i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('Esse arquivo não parece ser um ZIP válido.');
  const count = u16(v, eocd + 10);
  let p = u32(v, eocd + 16);
  if (count > maxEntries) throw new Error(`ZIP com arquivos demais (máximo ${maxEntries}).`);
  const out: ZipEntry[] = [];
  let total = 0;
  const dec = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (u32(v, p) !== 0x02014b50) throw new Error('ZIP corrompido (diretório central).');
    const flags = u16(v, p + 8), method = u16(v, p + 10), csize = u32(v, p + 20), usize = u32(v, p + 24);
    const nlen = u16(v, p + 28), xlen = u16(v, p + 30), clen = u16(v, p + 32), local = u32(v, p + 42);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nlen));
    p += 46 + nlen + xlen + clen;
    if (name.endsWith('/')) continue;
    if (flags & 1) throw new Error('ZIP com senha não é aceito.');
    total += usize;
    if (total > maxBytes) throw new Error('ZIP grande demais.');
    if (u32(v, local) !== 0x04034b50) throw new Error('ZIP corrompido (arquivo local).');
    const start = local + 30 + u16(v, local + 26) + u16(v, local + 28);
    const raw = bytes.subarray(start, start + csize);
    if (method === 0) out.push({ name, data: raw.slice() });
    else if (method === 8) out.push({ name, data: await inflate(raw) });
    else throw new Error(`Compressão não suportada em "${name}".`);
  }
  return out;
}
