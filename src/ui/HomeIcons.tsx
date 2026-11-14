import type { ReactNode } from 'react';

/** Ícones de traço (24x24) em dourado, um por opção do menu e por atalho. */
const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

const gearTeeth = Array.from({ length: 8 }, (_, i) => (
  <rect key={i} x="10.6" y="1.8" width="2.8" height="4" rx="0.8" transform={`rotate(${i * 45} 12 12)`} fill="currentColor" stroke="none" />
));

export const ICONS: Record<string, ReactNode> = {
  'novo-jogo': <g {...S}><circle cx="8" cy="15" r="5.2" /><path d="M12 11.4 20.5 6l1 3.2-7 3.6" /><circle cx="8" cy="15" r="1.2" fill="currentColor" /></g>,
  continuar: <path d="M7 4.5v15l12-7.5z" fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />,
  'carregar-jogo': <g {...S}><path d="M3 7.5V18a1.5 1.5 0 0 0 1.5 1.5h15A1.5 1.5 0 0 0 21 18V9.5A1.5 1.5 0 0 0 19.5 8H11L9 5.5H4.5A1.5 1.5 0 0 0 3 7z" /></g>,
  opcoes: <g><circle cx="12" cy="12" r="6.2" fill="none" stroke="currentColor" strokeWidth="3" />{gearTeeth}<circle cx="12" cy="12" r="2.3" fill="currentColor" /></g>,
  mods: <path d="M20.5 11H19V7c0-1.1-.9-2-2-2h-4V3.5C13 2.12 11.88 1 10.5 1S8 2.12 8 3.5V5H4c-1.1 0-1.99.9-1.99 2v3.8H3.5c1.49 0 2.7 1.21 2.7 2.7s-1.21 2.7-2.7 2.7H2V20c0 1.1.9 2 2 2h3.8v-1.5c0-1.49 1.21-2.7 2.7-2.7 1.49 0 2.7 1.21 2.7 2.7V22H17c1.1 0 2-.9 2-2v-4h1.5c1.38 0 2.5-1.12 2.5-2.5S21.88 11 20.5 11z" fill="currentColor" />,
  creditos: <g fill="currentColor"><circle cx="12" cy="8" r="3.2" /><circle cx="5.2" cy="9.6" r="2.4" /><circle cx="18.8" cy="9.6" r="2.4" /><path d="M6.2 20v-3.2a5.8 5.8 0 0 1 11.6 0V20z" /><path d="M1.5 18.4v-2a3.7 3.7 0 0 1 4.7-3.5 7 7 0 0 0-1.9 4.6v.9zM22.5 18.4v-2a3.7 3.7 0 0 0-4.7-3.5 7 7 0 0 1 1.9 4.6v.9z" /></g>,
  sair: <g {...S} strokeWidth={2.2}><path d="M12 3v8.5" /><path d="M6.6 6.6a8 8 0 1 0 10.8 0" /></g>,
  // atalhos da faixa inferior
  competicoes: <g {...S}><path d="M7.5 4h9v5a4.5 4.5 0 0 1-9 0zM7.5 6H4.5c0 3 1.2 4.5 3.3 4.8M16.5 6h3c0 3-1.2 4.5-3.3 4.8M12 13.5V17M8.5 20h7M9.5 17h5" /></g>,
  transferencias: <g {...S}><path d="M4 8h14.5M15 4.5 18.5 8 15 11.5M20 16H5.5M9 12.5 5.5 16 9 19.5" /></g>,
  elenco: <g fill="currentColor"><circle cx="12" cy="7.8" r="3.3" /><circle cx="4.8" cy="10" r="2.3" /><circle cx="19.2" cy="10" r="2.3" /><path d="M6 20v-3a6 6 0 0 1 12 0v3z" /><path d="M1.3 18.2v-1.6A3.6 3.6 0 0 1 5.4 13a7 7 0 0 0-1.8 4.6v.6zM22.7 18.2v-1.6a3.6 3.6 0 0 0-4.1-3.6 7 7 0 0 1 1.8 4.6v.6z" /></g>,
  financas: <g {...S}><ellipse cx="9" cy="7" rx="5.5" ry="2.4" /><path d="M3.5 7v4c0 1.3 2.5 2.4 5.5 2.4s5.5-1.1 5.5-2.4V7M3.5 11v4c0 1.3 2.5 2.4 5.5 2.4M14.5 11.5c3 0 6 .9 6 2.2s-3 2.3-6 2.3-6-1-6-2.3M20.5 13.7v4c0 1.3-3 2.3-6 2.3s-6-1-6-2.3v-1" /></g>,
  estadio: <g {...S}><ellipse cx="12" cy="9" rx="9" ry="4.2" /><path d="M3 9v6.5c0 2.3 4 4.2 9 4.2s9-1.9 9-4.2V9M7.5 12v6.5M12 13.2v6.5M16.5 12v6.5" /></g>,
  base: <g {...S}><path d="M12 4 1.8 9 12 14 22.2 9zM6 11.5V16c1.4 1.7 3.6 2.6 6 2.6s4.6-.9 6-2.6v-4.5M22.2 9v6" /></g>,
  pessoa: <g {...S}><circle cx="12" cy="8" r="3.6" /><path d="M5 20c.6-3.8 3.3-6 7-6s6.4 2.2 7 6" /></g>,
};

export function HomeIcon({ id, className }: { id: string; className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true" focusable="false">{ICONS[id]}</svg>;
}
