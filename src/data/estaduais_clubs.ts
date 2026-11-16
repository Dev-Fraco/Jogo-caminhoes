import { CLUBS_DATA } from './clubs';
import { buildEstadualClubs, type EClub } from './br_estadual_core';

export type { EClub } from './br_estadual_core';

/** Divisões por estado: os 3 com Série A e B (divididos pela ordem do arquivo) e os demais só com a Série A. */
export const ESTADUAL_SPLIT: Record<string, number[]> = { CE: [10, 5], RJ: [12, 6], SP: [16, 19] };

let CACHE: ReturnType<typeof buildEstadualClubs> | null = null;
/** Os clubes de estadual usam os dados dos clubes do jogo: nomes, siglas, cores e cidades trocados por um pacote aparecem aqui também. */
const build = () => {
  if (CACHE) return CACHE;
  const c = buildEstadualClubs(['serie-a', 'serie-b', 'serie-c', 'serie-d'].flatMap((d) => CLUBS_DATA[d]));
  for (const p of CLUBS_DATA['br-estaduais'] ?? []) { const e = c.byId.get(p.id); if (e) Object.assign(e, { name: p.name, shortName: p.shortName, primaryColor: p.primaryColor, secondaryColor: p.secondaryColor }); }
  return (CACHE = c);
};
/** Depois de ligar/desligar um pacote: refaz a lista de clubes de estadual na próxima vez que for usada. */
export const resetEstadualCache = () => { CACHE = null; };

/** Clubes criados pelo jogador (valem para o save atual): ficam registrados para o estadual do estado escolhido. */
const CUSTOM = new Map<string, EClub>();
export function registerCustomClub(c: EClub) { CUSTOM.set(c.id, c); }

export const estadualClub = (id: string): EClub | undefined => build().byId.get(id) ?? CUSTOM.get(id);
export const estadualClubsOf = (uf: string): EClub[] => build().byUf.get(uf) ?? [];
export const allEstadualClubs = (): EClub[] => [...build().byId.values()];
/** Estado do clube (se joga algum estadual). */
export const ufOfClub = (id: string): string | undefined => estadualClub(id)?.uf;
