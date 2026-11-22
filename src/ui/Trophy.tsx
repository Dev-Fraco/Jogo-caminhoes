import { trophyOf } from '../data/trophies';

/** Ícone de uma competição: o troféu do mod (se houver) ou o ícone padrão. */
export function Trophy({ k, fallback, size = 18 }: { k?: string; fallback: string; size?: number }) {
  const src = trophyOf(k);
  return src ? <img src={src} alt="" width={size} height={size} style={{ objectFit: 'contain', verticalAlign: 'middle' }} /> : <span aria-hidden="true">{fallback}</span>;
}
