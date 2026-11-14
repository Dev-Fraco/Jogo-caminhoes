/** Logotipo "VIDA REAL FC" desenhado em SVG (coroa, escudo, louros, bola) com letras cromadas e douradas. */
const leaf = (side: 1 | -1, i: number) => {
  const t = i / 7; // 0 (base) → 1 (ponta)
  const x = 260 + side * (96 + Math.sin(t * 1.5) * 34);
  const y = 168 - t * 118;
  const rot = side * (-35 + t * 80);
  return <ellipse key={`${side}-${i}`} cx={x} cy={y} rx="5" ry="13" transform={`rotate(${rot} ${x} ${y})`} fill="url(#hl-gold)" opacity={0.95 - t * 0.2} />;
};

export function HomeLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 520 220" role="img" aria-label="Vida Real FC">
      <defs>
        <linearGradient id="hl-gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff0b0" /><stop offset=".45" stopColor="#f0b92b" /><stop offset="1" stopColor="#a8700f" /></linearGradient>
        <linearGradient id="hl-chrome" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffffff" /><stop offset=".5" stopColor="#c9ced6" /><stop offset=".55" stopColor="#8d949f" /><stop offset="1" stopColor="#e9ecf0" /></linearGradient>
        <filter id="hl-shadow" x="-10%" y="-10%" width="120%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#000" floodOpacity=".7" /></filter>
      </defs>
      {/* louros */}
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => leaf(1, i))}
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => leaf(-1, i))}
      {/* escudo */}
      <g filter="url(#hl-shadow)">
        <path d="M260 34 345 46v78c0 34-36 56-85 74-49-18-85-40-85-74V46z" fill="#0b0b0b" stroke="url(#hl-gold)" strokeWidth="6" strokeLinejoin="round" />
        <path d="M260 46 333 56v68c0 27-30 46-73 62-43-16-73-35-73-62V56z" fill="none" stroke="#f0b92b" strokeOpacity=".5" strokeWidth="1.5" />
      </g>
      {/* coroa */}
      <g filter="url(#hl-shadow)">
        <path d="M232 36 238 14l11 11 11-17 11 17 11-11 6 22z" fill="url(#hl-gold)" stroke="#6b4608" strokeWidth="1.2" strokeLinejoin="round" />
        <rect x="232" y="34" width="56" height="7" rx="2" fill="url(#hl-gold)" stroke="#6b4608" strokeWidth="1.2" />
      </g>
      {/* letras */}
      <g filter="url(#hl-shadow)" fontFamily="'Barlow Condensed','Arial Narrow',Impact,sans-serif" fontWeight="800" fontStyle="italic" textAnchor="middle">
        <text x="260" y="112" fontSize="92" fill="url(#hl-chrome)" stroke="#2b2f36" strokeWidth="1.5" letterSpacing="1">VIDA REAL</text>
        <text x="270" y="170" fontSize="82" fill="url(#hl-gold)" stroke="#5a3a05" strokeWidth="1.5">FC</text>
      </g>
      {/* bola */}
      <g transform="translate(260 188)" filter="url(#hl-shadow)">
        <circle r="19" fill="#fff" stroke="#1a1a1a" strokeWidth="2" />
        <path d="M0-8 7.6-2.5 4.7 6.5h-9.4L-7.6-2.5z" fill="#1a1a1a" />
        <path d="M0-8V-19M7.6-2.5 17-6M4.7 6.5 10.5 14.5M-4.7 6.5-10.5 14.5M-7.6-2.5-17-6" stroke="#1a1a1a" strokeWidth="1.8" fill="none" />
      </g>
    </svg>
  );
}
