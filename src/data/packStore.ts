import { applyPack, isImageName, baseName, validatePack, type Pack, type PackReport } from './playerpack';
import { readZip } from './zip';

/** Guarda o pacote instalado (JSON + imagens dos escudos) no IndexedDB do aparelho. */
const DB = 'vr-pack-v1', STORE = 'kv', KEY = 'pack';
interface Stored { text: string; images: Record<string, Blob> }

const open = (): Promise<IDBDatabase> => new Promise((res, rej) => {
  const r = indexedDB.open(DB, 1);
  r.onupgradeneeded = () => r.result.createObjectStore(STORE);
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
});
async function idb<T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((res, rej) => { const r = f(db.transaction(STORE, mode).objectStore(STORE)); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}

let urls: string[] = [];
function activate(s: Stored | null): Pack | null {
  urls.forEach((u) => URL.revokeObjectURL(u)); urls = [];
  if (!s) { applyPack(null); return null; }
  const v = validatePack(s.text, Object.keys(s.images));
  if (!v.ok) { applyPack(null); return null; }
  const map: Record<string, string> = {};
  for (const [n, b] of Object.entries(s.images)) { const u = URL.createObjectURL(b); urls.push(u); map[n] = u; }
  applyPack(v.pack, map);
  return v.pack;
}

/** Chamado ao abrir o app: reaplica o pacote instalado, se houver. */
export async function loadInstalledPack(): Promise<Pack | null> {
  try { return activate((await idb<Stored | undefined>('readonly', (s) => s.get(KEY))) ?? null); } catch { return null; }
}

export interface Prepared { text: string; images: Record<string, Blob>; pack: Pack; report: PackReport }

/** Lê os arquivos escolhidos (um .zip, ou um .json + imagens soltas), confere e devolve o relatório. */
export async function preparePack(files: File[]): Promise<{ ok: true; p: Prepared } | { ok: false; error: string }> {
  try {
    let text: string | null = null;
    const images: Record<string, Blob> = {};
    const mime = (n: string) => (/\.png$/i.test(n) ? 'image/png' : /\.webp$/i.test(n) ? 'image/webp' : 'image/jpeg');
    for (const f of files) {
      if (/\.zip$/i.test(f.name)) {
        for (const e of await readZip(await f.arrayBuffer())) {
          if (isImageName(e.name)) images[baseName(e.name)] = new Blob([e.data as BlobPart], { type: mime(e.name) });
          else if (/\.json$/i.test(e.name) && !/(^|\/)__MACOSX\//.test(e.name) && text === null) text = new TextDecoder().decode(e.data);
        }
      } else if (/\.json$/i.test(f.name)) text = await f.text();
      else if (isImageName(f.name)) images[baseName(f.name)] = f;
    }
    if (text === null) return { ok: false, error: 'Não achei o arquivo .json do pacote. O ZIP precisa ter um .json dentro.' };
    const v = validatePack(text, Object.keys(images));
    if (!v.ok) return v;
    const used = new Set(v.pack.clubs.map((c) => c.badge).filter(Boolean) as string[]);
    const kept: Record<string, Blob> = {};
    for (const n of used) kept[n] = images[n];
    return { ok: true, p: { text, images: kept, pack: v.pack, report: v.report } };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'Não consegui ler os arquivos.' }; }
}

export async function installPack(p: Prepared): Promise<void> {
  await idb('readwrite', (s) => s.put({ text: p.text, images: p.images } satisfies Stored, KEY));
  activate({ text: p.text, images: p.images });
}
export async function removePack(): Promise<void> {
  await idb('readwrite', (s) => s.delete(KEY));
  activate(null);
}
