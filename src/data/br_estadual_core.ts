import { ESTADUAIS } from './br_estaduais';

/** Clube de um estadual. Os que já estão nas Séries A–D usam o mesmo id e jogam com o elenco do jogo (`inGame`); os demais são "só estadual". */
export interface EClub { id: string; name: string; uf: string; shortName: string; primaryColor: string; secondaryColor: string; rating: number; inGame: boolean; city: string }

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
/** Nomes do PDF que no jogo têm outro nome. */
const ALIAS: Record<string, string> = { bragantino: 'bragantino', vasco: 'vasco', athleticmg: 'athletic', ypirangars: 'ypiranga' };
const PAL: [string, string][] = [['#C8102E', '#FFFFFF'], ['#0057B8', '#FFFFFF'], ['#00873E', '#FFFFFF'], ['#111111', '#FFFFFF'], ['#F2C200', '#111111'], ['#7A1230', '#FFFFFF'], ['#FFFFFF', '#0057B8'], ['#FFFFFF', '#C8102E'], ['#00A650', '#F2C200'], ['#0A2A66', '#F2C200'], ['#D71920', '#111111'], ['#FFFFFF', '#00873E'], ['#1E88E5', '#FFFFFF'], ['#F28C00', '#111111'], ['#5B2C83', '#FFFFFF'], ['#111111', '#F2C200']];
const hash = (s: string) => { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
export const CAPITAL: Record<string, string> = { AC: 'Rio Branco', AL: 'Maceió', AM: 'Manaus', AP: 'Macapá', BA: 'Salvador', CE: 'Fortaleza', DF: 'Brasília', ES: 'Vitória', GO: 'Goiânia', MA: 'São Luís', MG: 'Belo Horizonte', MS: 'Campo Grande', MT: 'Cuiabá', PA: 'Belém', PB: 'João Pessoa', PE: 'Recife', PI: 'Teresina', PR: 'Curitiba', RJ: 'Rio de Janeiro', RN: 'Natal', RO: 'Porto Velho', RR: 'Boa Vista', RS: 'Porto Alegre', SC: 'Florianópolis', SE: 'Aracaju', SP: 'São Paulo', TO: 'Palmas' };

export interface GameClubRef { id: string; name: string; shortName: string; primaryColor: string; secondaryColor: string; city: string }

/** Liga os 346 clubes do PDF aos clubes do jogo (mesmo id) e cria os "só estadual" (id `ee-…`, força fixa pela posição na lista do estado). */
export function buildEstadualClubs(game: GameClubRef[]): { byId: Map<string, EClub>; byUf: Map<string, EClub[]> } {
  const byName = new Map(game.map((c) => [norm(c.name), c]));
  const byGameId = new Map(game.map((c) => [c.id, c]));
  const byId = new Map<string, EClub>(), byUf = new Map<string, EClub[]>();
  const usedShort = new Set<string>();
  for (const e of ESTADUAIS) {
    const list: EClub[] = [];
    e.clubs.forEach((name, i) => {
      const hit = byName.get(norm(name)) ?? byGameId.get(ALIAS[norm(name)] ?? '');
      let club: EClub;
      if (hit) club = { id: hit.id, name: hit.name, uf: e.uf, shortName: hit.shortName, primaryColor: hit.primaryColor, secondaryColor: hit.secondaryColor, rating: 0, inGame: true, city: hit.city };
      else {
        let id = `ee-${slug(name)}`; if (byId.has(id)) id += `-${e.uf.toLowerCase()}`;
        const letters = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z]/g, '');
        let short = letters.slice(0, 3);
        for (let k = 1; usedShort.has(`${e.uf}${short}`) && k < letters.length - 1; k++) short = letters[0] + letters[k] + letters[k + 1];
        usedShort.add(`${e.uf}${short}`);
        const [c1, c2] = PAL[hash(name) % PAL.length];
        club = { id, name, uf: e.uf, shortName: short, primaryColor: c1, secondaryColor: c2, rating: Math.max(36, Math.round(50 - i * 0.7)), inGame: false, city: CAPITAL[e.uf] };
      }
      byId.set(club.id, club); list.push(club);
    });
    byUf.set(e.uf, list);
  }
  return { byId, byUf };
}
