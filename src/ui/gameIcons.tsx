/** Ícones do jogo (imagens em public/assets/icons). Caminho relativo: funciona no navegador e dentro do app Android. */
const NAMES = ['inicio', 'elenco', 'transf', 'tabela', 'estadio', 'financas', 'base', 'loja', 'galeria', 'musica', 'noticias', 'veiculos', 'propriedades', 'importar', 'netfibra', 'cassino'] as const;
export type IconName = (typeof NAMES)[number];

/** Aplicativo do celular → ícone. */
export const APP_ICON: Record<string, IconName> = { linstagra: 'galeria', tikiteko: 'musica', noticias: 'noticias', concessionaria: 'veiculos', corretor: 'propriedades', internetchip: 'importar', netfibra: 'netfibra', cassino: 'cassino' };
/** Item do menu lateral → ícone. */
export const MENU_ICON: Record<string, IconName> = { home: 'inicio', squad: 'elenco', transfers: 'transf', table: 'tabela', stadium: 'estadio', finance: 'financas', youth: 'base', shop: 'loja' };

export function GameIcon({ name, className }: { name: IconName; className?: string }) {
  return <img className={className ?? 'gi'} src={`./assets/icons/${name}.png`} alt="" draggable={false} aria-hidden="true" />;
}
