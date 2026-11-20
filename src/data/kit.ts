import { CLUBS_DATA } from './clubs';

/**
 * Uniforme (camisa) de um clube. Sem `kit`, a camisa sai das duas cores do clube (lisa). A comunidade pode mandar o uniforme de cada clube pelo mod:
 * um desenho pronto (pattern + cores) ou uma imagem própria da camisa (`image`, PNG/JPG/WebP em data URI).
 */
export const KIT_PATTERNS = ['solid', 'stripes', 'hoops', 'half', 'sash', 'checks'] as const;
export type KitPattern = (typeof KIT_PATTERNS)[number];
export interface Kit {
  pattern: KitPattern;
  /** cor de fundo da camisa */ base: string;
  /** cor do desenho (listras, faixa...) */ accent?: string;
  /** cor das mangas */ sleeves?: string;
  /** cor da gola */ collar?: string;
  /** cor do número */ number?: string;
  /** imagem própria da camisa (data URI); substitui o desenho */ image?: string;
}
export const MAX_KIT_IMAGE = 150_000;
const HEX = /^#[0-9a-fA-F]{6}$/;
const IMG = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

/** Valida o uniforme vindo de um mod. Devolve o texto do erro, ou o uniforme limpo. */
export function parseKit(raw: unknown): { ok: true; kit: Kit } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'kit precisa ser um objeto.' };
  const r = raw as Record<string, unknown>;
  const pattern = (r.pattern ?? 'solid') as KitPattern;
  if (!KIT_PATTERNS.includes(pattern)) return { ok: false, error: `kit.pattern inválido (use ${KIT_PATTERNS.join(', ')}).` };
  const kit: Kit = { pattern, base: '' };
  for (const f of ['base', 'accent', 'sleeves', 'collar', 'number'] as const) {
    const v = r[f];
    if (v === undefined) continue;
    if (typeof v !== 'string' || !HEX.test(v)) return { ok: false, error: `kit.${f}: use #RRGGBB.` };
    kit[f] = v;
  }
  if (!kit.base) return { ok: false, error: 'kit precisa de "base" (#RRGGBB).' };
  if (r.image !== undefined) {
    if (typeof r.image !== 'string' || !IMG.test(r.image)) return { ok: false, error: 'kit.image precisa ser data:image/png|jpeg|webp;base64,...' };
    if (r.image.length > MAX_KIT_IMAGE) return { ok: false, error: `kit.image grande demais (máximo ${Math.round(MAX_KIT_IMAGE / 1000)} mil caracteres).` };
    kit.image = r.image;
  }
  return { ok: true, kit };
}

/** Uniforme de um clube pelo id: o do mod, se houver; senão camisa lisa na cor principal. */
export function kitOf(clubId: string, fallback?: { primaryColor: string; secondaryColor: string }): Kit {
  const c = Object.values(CLUBS_DATA).flat().find((x) => x.id === clubId);
  if (c?.kit) return c.kit;
  const src = c ?? fallback ?? { primaryColor: '#c52613', secondaryColor: '#ffffff' };
  return { pattern: 'solid', base: src.primaryColor, accent: src.secondaryColor, collar: src.secondaryColor };
}
