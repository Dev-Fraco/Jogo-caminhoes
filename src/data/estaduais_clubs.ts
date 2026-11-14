import { CLUBS_DATA } from './clubs';
import { ESTADUAIS } from './br_estaduais';

/**
 * Clubes dos estaduais (346, do PDF). Os que já estão nas Séries A–D usam o mesmo id e jogam com o elenco do jogo;
 * os demais ("só estadual") têm apenas uma força fixa e o elenco é gerado na hora quando o seu clube os enfrenta.
 */
export interface EClub { id: string; name: string; uf: string; shortName: string; primaryColor: string; secondaryColor: string; rating: number; inGame: boolean; city: string }

/** Divisões por estado: os 3 com Série A e B (divididos pela ordem do arquivo) e os demais só com a Série A. */
export const ESTADUAL_SPLIT: Record<string, number[]> = { CE: [10, 5], RJ: [12, 6], SP: [16, 19] };

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
/** Nomes do PDF que no jogo têm outro nome. */
const ALIAS: Record<string, string> = { bragantino: 'bragantino', vasco: 'vasco', athleticmg: 'athletic', ypirangars: 'ypiranga' };
const PAL: [string, string][] = [['#C8102E', '#FFFFFF'], ['#0057B8', '#FFFFFF'], ['#00873E', '#FFFFFF'], ['#111111', '#FFFFFF'], ['#F2C200', '#111111'], ['#7A1230', '#FFFFFF'], ['#FFFFFF', '#0057B8'], ['#FFFFFF', '#C8102E'], ['#00A650', '#F2C200'], ['#0A2A66', '#F2C200'], ['#D71920', '#111111'], ['#FFFFFF', '#00873E'], ['#1E88E5', '#FFFFFF'], ['#F28C00', '#111111'], ['#5B2C83', '#FFFFFF'], ['#111111', '#F2C200']];
const hash = (s: string) => { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const CAPITAL: Record<string, string> = { AC: 'Rio Branco', AL: 'Maceió', AM: 'Manaus', AP: 'Macapá', BA: 'Salvador', CE: 'Fortaleza', DF: 'Brasília', ES: 'Vitória', GO: 'Goiânia', MA: 'São Luís', MG: 'Belo Horizonte', MS: 'Campo Grande', MT: 'Cuiabá', PA: 'Belém', PB: 'João Pessoa', PE: 'Recife', PI: 'Teresina', PR: 'Curitiba', RJ: 'Rio de Janeiro', RN: 'Natal', RO: 'Porto Velho', RR: 'Boa Vista', RS: 'Porto Alegre', SC: 'Florianópolis', SE: 'Aracaju', SP: 'São Paulo', TO: 'Palmas' };

let CACHE: { byId: Map<string, EClub>; byUf: Map<string, EClub[]> } | null = null;

function build() {
  if (CACHE) return CACHE;
  const game = new Map<string, { id: string; name: string; short: string; c1: string; c2: string; city: string }>();
  for (const d of ['serie-a', 'serie-b', 'serie-c', 'serie-d']) for (const c of CLUBS_DATA[d]) game.set(norm(c.name), { id: c.id, name: c.name, short: c.shortName, c1: c.primaryColor, c2: c.secondaryColor, city: c.city });
  const gameById = new Map([...game.values()].map((c) => [c.id, c]));
  const byId = new Map<string, EClub>(), byUf = new Map<string, EClub[]>();
  const usedShort = new Set<string>();
  for (const e of ESTADUAIS) {
    const list: EClub[] = [];
    e.clubs.forEach((name, i) => {
      const hit = game.get(norm(name)) ?? gameById.get(ALIAS[norm(name)] ?? '');
      let club: EClub;
      if (hit) club = { id: hit.id, name: hit.name, uf: e.uf, shortName: hit.short, primaryColor: hit.c1, secondaryColor: hit.c2, rating: 0, inGame: true, city: hit.city };
      else {
        let id = `ee-${slug(name)}`; if (byId.has(id)) id += `-${e.uf.toLowerCase()}`;
        const letters = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z]/g, '');
        let short = letters.slice(0, 3);
        for (let k = 1; usedShort.has(`${e.uf}${short}`) && k < letters.length - 1; k++) short = letters[0] + letters[k] + letters[k + 1];
        usedShort.add(`${e.uf}${short}`);
        const [c1, c2] = PAL[hash(name) % PAL.length];
        // força fixa: clubes menores e mais para o fim da lista do estado são mais fracos
        club = { id, name, uf: e.uf, shortName: short, primaryColor: c1, secondaryColor: c2, rating: Math.max(36, Math.round(50 - i * 0.7)), inGame: false, city: CAPITAL[e.uf] };
      }
      byId.set(club.id, club); list.push(club);
    });
    byUf.set(e.uf, list);
  }
  return (CACHE = { byId, byUf });
}

export const estadualClub = (id: string): EClub | undefined => build().byId.get(id);
export const estadualClubsOf = (uf: string): EClub[] => build().byUf.get(uf) ?? [];
export const allEstadualClubs = (): EClub[] => [...build().byId.values()];
/** Estado do clube (se joga algum estadual). */
export const ufOfClub = (id: string): string | undefined => build().byId.get(id)?.uf;
