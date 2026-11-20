import { WORLD_DATA } from './world';

/* =====================================================================
   Nomes das competições. O jogo vem com nomes fictícios (copas, ligas e mundial); pacotes (mods) instalados pelo jogador podem trazer
   os nomes reais, com a chave de cada competição:
     "cup", "lib", "sula", "ucl", "mundial", "supermundial", "africa", "arab"  (copa nacional, 3 copas continentais e o mundial)
     id de uma liga (ex.: "premier-league")  → nome da liga;   id de uma divisão (ex.: "premier") → nome local da divisão (alias).
   ===================================================================== */

export const COMP_DEFAULTS = {
  cup: 'Copa Nacional', lib: 'Copa dos Campeões da América', sula: 'Copa das Américas', ucl: 'Copa Europeia de Elite', mundial: 'Mundial dos Campeões', supermundial: 'Super Mundial de Clubes', africa: 'Copa dos Campeões da África', arab: 'Copa dos Campeões Árabes',
} as const;
export type CompKey = keyof typeof COMP_DEFAULTS;
/** Nomes em vigor (os campos mudam quando um pacote com competições é ligado). */
export const COMP_NAMES: Record<CompKey, string> = { ...COMP_DEFAULTS };

export const COMP_KEYS = Object.keys(COMP_DEFAULTS) as CompKey[];
const ORIG_LEAGUE = new Map<string, string>(), ORIG_DIV = new Map<string, string | undefined>();
const eachLeague = (fn: (l: { id: string; name: string; divisions: { id: string; alias?: string }[] }) => void) => { for (const c of Object.values(WORLD_DATA)) for (const l of c.leagues) fn(l); };

const SOURCES = new Map<string, Record<string, string>>();
/** Cada origem (pacote de elencos, pacotes de nomes) informa os seus nomes; vale a soma de todas (a última a chegar vence). */
export function setCompetitionSource(source: string, map: Record<string, string> | null | undefined): void {
  if (map && Object.keys(map).length) SOURCES.set(source, map); else SOURCES.delete(source);
  const merged: Record<string, string> = {};
  for (const m of SOURCES.values()) Object.assign(merged, m);
  applyCompetitionNames(Object.keys(merged).length ? merged : null);
}

/** Aplica nomes de competições (ou, com null, volta aos nomes fictícios do jogo). Só valem para as próximas carreiras. */
export function applyCompetitionNames(map: Record<string, string> | null): void {
  eachLeague((l) => {
    if (ORIG_LEAGUE.has(l.id)) l.name = ORIG_LEAGUE.get(l.id)!;
    for (const d of l.divisions) if (ORIG_DIV.has(d.id)) d.alias = ORIG_DIV.get(d.id);
  });
  ORIG_LEAGUE.clear(); ORIG_DIV.clear();
  Object.assign(COMP_NAMES, COMP_DEFAULTS);
  if (!map) return;
  for (const k of COMP_KEYS) if (typeof map[k] === 'string' && map[k].trim()) COMP_NAMES[k] = map[k].trim().slice(0, 40);
  eachLeague((l) => {
    const ln = map[l.id];
    if (typeof ln === 'string' && ln.trim()) { ORIG_LEAGUE.set(l.id, l.name); l.name = ln.trim().slice(0, 40); }
    for (const d of l.divisions) { const dn = map[d.id]; if (typeof dn === 'string' && dn.trim() && !(d.id in COMP_DEFAULTS)) { ORIG_DIV.set(d.id, d.alias); d.alias = dn.trim().slice(0, 40); } }
  });
}

/** Nome curto para abas e botões: a primeira palavra que não seja "Copa", "Liga" ou ligação (ex.: "Copa dos Campeões da América" → "Campeões"). */
export function shortCompName(name: string): string {
  const skip = new Set(['copa', 'liga', 'de', 'do', 'da', 'dos', 'das', 'a', 'o', 'e']);
  const w = name.split(/\s+/).find((x) => !skip.has(x.toLowerCase()));
  return w ?? name;
}

/** Ids de liga/divisão que um pacote pode renomear (para validar e para gerar o modelo). */
export const competitionIds = (): string[] => { const out: string[] = []; eachLeague((l) => { out.push(l.id); for (const d of l.divisions) if (d.id !== l.id) out.push(d.id); else if (!out.includes(d.id)) out.push(d.id); }); return [...new Set(out)]; };

/** Sigla de 3 letras a partir do nome (iniciais se houver 3 palavras ou mais; senão as 3 primeiras letras). */
export function autoShort(name: string): string {
  const skip = new Set(['de', 'do', 'da', 'dos', 'das', 'e', 'fc', 'ec', 'sc', 'ac', 'club', 'clube']);
  const clean = (w: string) => w.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z]/g, '').toUpperCase();
  const ws = name.split(/[\s-]+/).filter((w) => w && !skip.has(w.toLowerCase())).map(clean).filter(Boolean);
  if (ws.length >= 3) return ws.slice(0, 3).map((w) => w[0]).join('');
  const all = ws.join('');
  return (all || clean(name) || 'CLB').slice(0, 3).padEnd(3, 'X');
}
