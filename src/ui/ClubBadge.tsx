import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { ClubData } from '../data/clubs';
import { badgeColors } from './badge';
import { resolveBadge } from '../data/playerpack';

/**
 * Escudo do clube. Mostra a imagem de `club.badge`; se estiver vazio, não carregar (onError) ou ainda estiver carregando,
 * mostra o escudo reserva: círculo com a sigla na cor do clube.
 */
export function ClubBadge({ club, size = 60 }: { club: Pick<ClubData, 'badge' | 'shortName' | 'primaryColor' | 'secondaryColor'>; size?: number }) {
  const src = club.badge ? resolveBadge(club.badge) : '';
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>(src ? 'loading' : 'error');
  const img = useRef<HTMLImageElement>(null);

  useEffect(() => {
    setStatus(src ? 'loading' : 'error');
  }, [src]);
  useEffect(() => {
    // imagem já em cache pode não disparar onLoad
    const el = img.current;
    if (el?.complete && el.naturalWidth > 0) setStatus('ok');
  }, [src]);

  const { bg, fg, ring } = badgeColors(club);
  const style = { '--cb-bg': bg, '--cb-fg': fg, '--cb-ring': ring, '--cb-shadow': fg.toUpperCase() === '#FFFFFF' ? '0 1px 2px rgba(0, 0, 0, .35)' : 'none', '--cb-size': `${size}px` } as CSSProperties;

  return (
    <span className="cb" style={style} aria-hidden="true">
      {src && status !== 'error' && (
        <img ref={img} className={`cb-img ${status}`} src={src} alt="" draggable={false} onLoad={() => setStatus('ok')} onError={() => setStatus('error')} />
      )}
      {status !== 'ok' && <span className="cb-fallback">{club.shortName}</span>}
    </span>
  );
}
