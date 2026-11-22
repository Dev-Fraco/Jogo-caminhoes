/* =====================================================================
   Troféus das competições (mods da comunidade). Um mod pode trazer a imagem do troféu de cada competição; ela aparece no lugar do ícone
   padrão nas listas de campeões. Formato: "trophies": { "cup": "data:image/png;base64,...", "lib": "..." } (PNG, JPG ou WebP em data URI).
   ===================================================================== */

/** Competições que têm troféu na lista de campeões. */
export const TROPHY_KEYS = ['cup', 'lib', 'sula', 'ucl', 'mundial', 'supermundial', 'nordeste', 'verde', 'sulsudeste', 'africa', 'arab'] as const;
export type TrophyKey = (typeof TROPHY_KEYS)[number];
/** Tamanho máximo de cada imagem (caracteres do data URI, uns 90 KB). */
export const MAX_TROPHY = 120_000;
const IMG = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

export type TrophyResult = { ok: true; trophies: Record<string, string> } | { ok: false; error: string };

/** Valida o campo "trophies" de um mod. */
export function parseTrophies(raw: unknown): TrophyResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: '"trophies" precisa ser um objeto com a chave da competição e a imagem.' };
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!(TROPHY_KEYS as readonly string[]).includes(k)) return { ok: false, error: `Troféu de competição desconhecida: "${k}".` };
    if (typeof v !== 'string' || !IMG.test(v)) return { ok: false, error: `trophies.${k} precisa ser data:image/png|jpeg|webp;base64,...` };
    if (v.length > MAX_TROPHY) return { ok: false, error: `trophies.${k} grande demais (máximo ${Math.round(MAX_TROPHY / 1000)} mil caracteres).` };
    out[k] = v;
  }
  return { ok: true, trophies: out };
}

let current: Record<string, string> = {};
/** Troféus em vigor (vindos dos mods ligados). */
export const setTrophies = (t: Record<string, string>): void => { current = t; };
export const trophyOf = (key: string | undefined): string | undefined => (key ? current[key] : undefined);
