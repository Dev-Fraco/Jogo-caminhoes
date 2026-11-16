import { CLUBS_DATA, dedupeShorts } from './clubs';
import { COMP_KEYS, competitionIds, setCompetitionSource } from './names';
import { resetEstadualCache } from './estaduais_clubs';

/** Mods da Comunidade: pacotes de dados (JSON) que o jogador importa para trocar nomes, cores e estádios dos clubes. Valem para as próximas carreiras. */
/** Máximo de clubes por pacote. */
export const MAX_MOD_CLUBS = 5000;

export interface ClubPatch { id: string; name?: string; shortName?: string; primaryColor?: string; secondaryColor?: string; stadium?: string; city?: string }
export interface Mod { id: string; name: string; author?: string; version?: string; enabled: boolean; clubs: ClubPatch[]; /** nomes de competições (copas, ligas e divisões) por chave */ competitions?: Record<string, string> }

const KEY = 'vr-mods-v1';
const HEX = /^#[0-9a-fA-F]{6}$/;
const FIELDS = ['name', 'shortName', 'primaryColor', 'secondaryColor', 'stadium', 'city'] as const;

export function loadMods(): Mod[] {
  try { const a = JSON.parse(localStorage.getItem(KEY) ?? '[]'); return Array.isArray(a) ? (a as Mod[]) : []; } catch { return []; }
}
export function saveMods(mods: Mod[]): boolean {
  try { localStorage.setItem(KEY, JSON.stringify(mods)); return true; } catch { return false; }
}

export const modTemplate = () => JSON.stringify({
  name: 'Meu pacote', author: 'Seu nome', version: '1.0',
  clubs: [{ id: 'flamengo', name: 'Meu Time', shortName: 'MTI', primaryColor: '#c52613', secondaryColor: '#111111', stadium: 'Meu Estádio', city: 'Minha Cidade' }],
}, null, 2);

export type ParseResult = { ok: true; mod: Mod } | { ok: false; error: string };

/** Valida o texto de um pacote: só ids de clubes que existem e campos conhecidos (cores em #RRGGBB). */
export function parseMod(text: string): ParseResult {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return { ok: false, error: 'O arquivo não é um JSON válido.' }; }
  const r = raw as { name?: unknown; author?: unknown; version?: unknown; clubs?: unknown[] | unknown };
  if (!r || typeof r !== 'object' || typeof r.name !== 'string' || !r.name.trim()) return { ok: false, error: 'O pacote precisa de um "name".' };
  const rawComp = (raw as { competitions?: unknown }).competitions;
  const hasComp = !!rawComp && typeof rawComp === 'object' && !Array.isArray(rawComp) && Object.keys(rawComp as object).length > 0;
  if (!hasComp && (!Array.isArray(r.clubs) || r.clubs.length === 0)) return { ok: false, error: 'O pacote precisa de uma lista "clubs" com pelo menos 1 clube (ou de "competitions").' };
  const clubList: unknown[] = Array.isArray(r.clubs) ? r.clubs : [];
  if (clubList.length > MAX_MOD_CLUBS) return { ok: false, error: `Pacote grande demais (máximo de ${MAX_MOD_CLUBS.toLocaleString('pt-BR')} clubes).` };
  const known = new Set(Object.values(CLUBS_DATA).flat().map((c) => c.id));
  const clubs: ClubPatch[] = [];
  for (const c of clubList as Record<string, unknown>[]) {
    if (!c || typeof c.id !== 'string' || !known.has(c.id)) return { ok: false, error: `Clube desconhecido: "${String((c as { id?: unknown })?.id)}".` };
    const patch: ClubPatch = { id: c.id };
    for (const f of FIELDS) {
      const v = c[f];
      if (v === undefined) continue;
      if (typeof v !== 'string' || !v.trim() || v.length > (f === 'stadium' ? 60 : 40)) return { ok: false, error: `Campo "${f}" inválido em ${c.id}.` };
      if ((f === 'primaryColor' || f === 'secondaryColor') && !HEX.test(v)) return { ok: false, error: `Cor inválida em ${c.id}.${f}: use #RRGGBB.` };
      (patch as unknown as Record<string, string>)[f] = v.trim();
    }
    clubs.push(patch);
  }
  let competitions: Record<string, string> | undefined;
  if (hasComp) {
    const ok = new Set<string>([...COMP_KEYS, ...competitionIds()]);
    for (const [k, v] of Object.entries(rawComp as Record<string, unknown>)) {
      if (!ok.has(k)) return { ok: false, error: `Competição desconhecida: "${k}".` };
      if (typeof v !== 'string' || !v.trim() || v.length > 40) return { ok: false, error: `Nome inválido em competitions.${k}.` };
      (competitions ??= {})[k] = v.trim();
    }
  }
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  return { ok: true, mod: { id, ...(competitions ? { competitions } : {}), name: r.name.trim().slice(0, 40), author: typeof r.author === 'string' ? r.author.slice(0, 40) : undefined, version: typeof r.version === 'string' ? r.version.slice(0, 12) : undefined, enabled: true, clubs } };
}

const ORIGINAL = new Map<string, Required<Omit<ClubPatch, 'id'>>>();

/** Aplica os pacotes ligados sobre os dados do jogo (os originais são guardados e voltam quando o pacote é desligado). */
export function applyMods(mods: Mod[]): void {
  const all = new Map(Object.values(CLUBS_DATA).flat().map((c) => [c.id, c]));
  for (const [id, o] of ORIGINAL) Object.assign(all.get(id)!, o);
  for (const m of mods.filter((x) => x.enabled)) {
    for (const p of m.clubs) {
      const c = all.get(p.id);
      if (!c) continue;
      if (!ORIGINAL.has(c.id)) ORIGINAL.set(c.id, { name: c.name, shortName: c.shortName, primaryColor: c.primaryColor, secondaryColor: c.secondaryColor, stadium: c.stadium, city: c.city });
      for (const f of FIELDS) if (p[f]) (c as unknown as Record<string, string>)[f] = p[f]!;
    }
  }
  dedupeShorts(new Set(ORIGINAL.keys()));
  const comp: Record<string, string> = {};
  for (const m of mods.filter((x) => x.enabled)) Object.assign(comp, m.competitions ?? {});
  setCompetitionSource('mods', comp);
  resetEstadualCache();
}
