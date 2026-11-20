import { useId } from 'react';
import type { Kit } from '../data/kit';
import { contrastRatio } from './badge';

const BODY = 'M30 8 L12 20 L2 42 L18 50 L26 38 L26 92 L74 92 L74 38 L82 50 L98 42 L88 20 L70 8 Q50 22 30 8 Z';

/** Camisa do time (SVG) com o número no peito. O desenho vem do uniforme do clube (mods da comunidade); com `image`, usa a imagem própria. */
export function Shirt({ kit, number, className }: { kit: Kit; number: number; className?: string }) {
  const id = useId().replace(/:/g, '');
  const acc = kit.accent ?? kit.base;
  const numColor = kit.number ?? (contrastRatio(kit.base, '#FFFFFF') >= 3 ? '#FFFFFF' : '#101820');
  const halo = contrastRatio(numColor, '#FFFFFF') > 3 ? 'rgba(0,0,0,.55)' : 'rgba(255,255,255,.7)';
  const stripes = Array.from({ length: 6 }, (_, i) => i);
  return (
    <svg className={`shirt ${className ?? ''}`} viewBox="0 0 100 100" aria-hidden="true">
      <defs><clipPath id={`c${id}`}><path d={BODY} /></clipPath></defs>
      {kit.image ? (
        <image href={kit.image} x="0" y="0" width="100" height="100" preserveAspectRatio="xMidYMid meet" />
      ) : (
        <g clipPath={`url(#c${id})`}>
          <rect width="100" height="100" fill={kit.base} />
          {kit.pattern === 'stripes' && stripes.map((i) => <rect key={i} x={14 + i * 14} y="0" width="7" height="100" fill={acc} />)}
          {kit.pattern === 'hoops' && stripes.map((i) => <rect key={i} x="0" y={8 + i * 16} width="100" height="8" fill={acc} />)}
          {kit.pattern === 'half' && <rect x="50" y="0" width="50" height="100" fill={acc} />}
          {kit.pattern === 'sash' && <polygon points="0,30 0,56 100,92 100,66" fill={acc} />}
          {kit.pattern === 'checks' && stripes.flatMap((r) => stripes.map((c) => ((r + c) % 2 ? <rect key={`${r}${c}`} x={c * 17} y={r * 17} width="17" height="17" fill={acc} /> : null)))}
          {kit.sleeves && <><rect x="0" y="0" width="26" height="60" fill={kit.sleeves} /><rect x="74" y="0" width="26" height="60" fill={kit.sleeves} /></>}
        </g>
      )}
      <path d={BODY} fill="none" stroke="rgba(0,0,0,.65)" strokeWidth="2.2" strokeLinejoin="round" />
      {!kit.image && <path d="M30 8 Q50 22 70 8" fill="none" stroke={kit.collar ?? acc} strokeWidth="5" strokeLinecap="round" />}
      <text x="50" y="64" textAnchor="middle" fontSize={number > 9 ? 30 : 34} fontWeight="800" fontFamily="var(--font-head), system-ui, sans-serif" fill={numColor} stroke={halo} strokeWidth="3" paintOrder="stroke">{number}</text>
    </svg>
  );
}
