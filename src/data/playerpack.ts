import { SPOT_LINE, type Player, type Position, type Spot } from '../engine/types';
import { CLUBS_DATA, dedupeShorts, type ClubData } from './clubs';
import { autoShort, COMP_KEYS, competitionIds, setCompetitionSource } from './names';
import { resetEstadualCache } from './estaduais_clubs';
import { generateSquad, pickSpot } from '../engine/squad';

/* =====================================================================
   Pacote de elencos e escudos (feito por você): nomes de jogadores e escudos dos clubes.
   Formato do JSON:  { "name": "Meu pacote", "clubs": [ { "id": "flamengo", "badge": "flamengo.png",
                       "players": [ { "name": "Fulano", "pos": "CA", "age": 27, "overall": 78 } ] } ] }
   "pos" aceita GK, ZAG, LD, LE, MC, MD, ME, PD, PE, CA (ou DEF, MID, ATT: aí o jogo escolhe a função)
   "id" é o identificador do clube NO JOGO (o modelo gerado pelo jogo já traz os ids). Vale para as próximas carreiras.
   ===================================================================== */

/** Máximo de clubes por pacote. */
export const MAX_PACK_CLUBS = 5000;

export interface PackPlayer { name: string; pos: Position; /** função (LD, LE, ZAG, MC, MD, ME, PD, PE, CA), se o pacote disser */ spot?: Spot; age?: number; overall?: number }
/** `players` = elenco completo com posição; `names` = só nomes, na ordem do elenco do jogo (vazio = mantém o nome). */
/** Vaga do elenco do jogo (na ordem: goleiros, defensores, meias, atacantes): o pacote dá nome, idade e overall; a posição e a função vêm do jogo. Campo vazio = mantém o do jogo. */
export interface PackSlot { name?: string; age?: number; overall?: number }
/** Dados do clube trocados pelo pacote: nome, sigla, estádio, cidade e cores. */
export interface ClubInfoPatch { name?: string; shortName?: string; stadium?: string; city?: string; primaryColor?: string; secondaryColor?: string }
export interface PackClub { id: string; badge?: string; players?: PackPlayer[]; names?: string[]; slots?: PackSlot[]; info?: ClubInfoPatch }
export interface Pack { name: string; author?: string; version?: string; clubs: PackClub[]; /** nomes de competições (copas, ligas, divisões) */ competitions?: Record<string, string> }
export interface PackReport { clubs: number; players: number; badges: number; names: number; warnings: string[]; /** escudos citados pelo JSON cuja imagem não veio junto */ missingBadges?: number }
export type PackResult = { ok: true; pack: Pack; report: PackReport } | { ok: false; error: string };

const POS: Record<string, Position> = {
  GK: 'GK', GOL: 'GK', G: 'GK', GOLEIRO: 'GK',
  DEF: 'DEF', D: 'DEF', ZAG: 'DEF', LD: 'DEF', LE: 'DEF', ZAGUEIRO: 'DEF', DEFENSOR: 'DEF', LATERAL: 'DEF',
  MID: 'MID', M: 'MID', MEI: 'MID', VOL: 'MID', MC: 'MID', MEIA: 'MID', VOLANTE: 'MID',
  ATT: 'ATT', A: 'ATT', ATA: 'ATT', CA: 'ATT', PE: 'ATT', PD: 'ATT', ATACANTE: 'ATT',
};
/** Função (lateral, ponta, centroavante...) quando o pacote usa a sigla/nome dela. */
const SPOT_ALIAS: Record<string, Spot> = {
  GK: 'GK', GOL: 'GK', ZAG: 'ZAG', ZAGUEIRO: 'ZAG', LD: 'LD', 'LATERAL DIREITO': 'LD', LE: 'LE', 'LATERAL ESQUERDO': 'LE',
  VOL: 'MC', VOLANTE: 'MC', MC: 'MC', MEI: 'MC', MEIA: 'MC', MD: 'MD', 'MEIA DIREITA': 'MD', ME: 'ME', 'MEIA ESQUERDA': 'ME',
  PD: 'PD', 'PONTA DIREITA': 'PD', PE: 'PE', 'PONTA ESQUERDA': 'PE', CA: 'CA', CENTROAVANTE: 'CA',
};
export const normSpot = (s: unknown): Spot | undefined => (typeof s === 'string' ? SPOT_ALIAS[s.trim().toUpperCase()] : undefined);
export const normPos = (s: unknown): Position | undefined => (typeof s === 'string' ? POS[s.trim().toUpperCase()] : undefined);
/** Primeiro campo existente entre vários nomes possíveis (o pacote pode vir em português ou inglês). */
const pick = (o: Record<string, unknown> | undefined, ...keys: string[]): unknown => { if (!o) return undefined; for (const k of keys) if (o[k] !== undefined && o[k] !== null) return o[k]; return undefined; };
/** Posição do jogador: "pos" (ou "posicao"); guias gerados trazem "_posicao" (Goleiro, Defensor, Meia, Atacante), que também vale. */
const posOf = (o: Record<string, unknown> | undefined): unknown => pick(o, 'pos', 'posicao', 'posição', 'position', '_posicao');
const IMG = /\.(png|jpe?g|webp)$/i;
export const isImageName = (n: string) => IMG.test(n);
export const baseName = (n: string) => n.split('/').pop()!.toLowerCase();

/** Valida o texto do pacote. Erros graves param tudo; problemas pequenos viram avisos e só pulam o item. `badgeFiles` = nomes das imagens entregues junto. */
export function validatePack(text: string, badgeFiles: string[] = []): PackResult {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return { ok: false, error: 'O arquivo não é um JSON válido.' }; }
  const r0 = raw as Record<string, unknown>;
  const r: { name: unknown; author: unknown; version: unknown; clubs: unknown } = { name: pick(r0, 'name', 'nome'), author: pick(r0, 'author', 'autor'), version: pick(r0, 'version', 'versao', 'versão'), clubs: pick(r0, 'clubs', 'clubes', 'times') };
  if (!r0 || typeof r0 !== 'object' || typeof r.name !== 'string' || !r.name.trim()) return { ok: false, error: 'O pacote precisa de um "name".' };
  if (!Array.isArray(r.clubs) || r.clubs.length === 0) { if (!pick(r0, 'competitions', 'competicoes', 'competições')) return { ok: false, error: 'O pacote precisa de uma lista "clubs" com pelo menos 1 clube.' }; r.clubs = []; }
  if ((r.clubs as unknown[]).length > MAX_PACK_CLUBS) return { ok: false, error: `Pacote grande demais (máximo de ${MAX_PACK_CLUBS.toLocaleString('pt-BR')} clubes).` };
  const known = new Set(Object.values(CLUBS_DATA).flat().map((c) => c.id));
  const files = new Set(badgeFiles.map(baseName));
  const warnings: string[] = [];
  const warn = (t: string) => { if (warnings.length < 60) warnings.push(t); };
  const seen = new Set<string>();
  const clubs: PackClub[] = [];
  let players = 0, badges = 0, names = 0, missingBadges = 0;
  for (const c0 of r.clubs as Record<string, unknown>[]) {
    const c = { id: pick(c0, 'id', 'clubId', 'clube_id', 'clubeId'), badge: pick(c0, 'badge', 'escudo', 'logo'), players: pick(c0, 'players', 'jogadores', 'elenco') } as Record<string, unknown>;
    const id = typeof c.id === 'string' ? c.id : '';
    if (!id || !known.has(id)) { warn(`Clube que o jogo não tem: "${id || '(sem id)'}" (ignorado).`); continue; }
    if (seen.has(id)) { warn(`Clube repetido: "${id}" (usei o primeiro).`); continue; }
    seen.add(id);
    const club: PackClub = { id };
    const info: ClubInfoPatch = {};
    for (const [f, keys] of [['name', ['name', 'nome']], ['shortName', ['shortName', 'sigla', 'short']], ['stadium', ['stadium', 'estadio', 'estádio']], ['city', ['city', 'cidade']]] as const) {
      const v = pick(c0, ...keys);
      if (v === undefined) continue;
      if (typeof v !== 'string' || !v.trim() || v.trim().length > (f === 'stadium' ? 60 : 40)) { warn(`${id}: campo "${f}" inválido (ignorado).`); continue; }
      info[f] = v.trim();
    }
    for (const [f, keys] of [['primaryColor', ['primaryColor', 'corPrincipal']], ['secondaryColor', ['secondaryColor', 'corSecundaria']]] as const) {
      const v = pick(c0, ...keys);
      if (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v.trim())) info[f] = v.trim();
    }
    if (Object.keys(info).length) { club.info = info; names++; }
    if (typeof c.badge === 'string' && c.badge.trim()) {
      if (!IMG.test(c.badge)) warn(`${id}: escudo "${c.badge}" não é imagem PNG/JPG/WEBP.`);
      else if (!files.has(baseName(c.badge))) { missingBadges++; warn(`${id}: o escudo "${c.badge}" não veio no ZIP.`); }
      else { club.badge = baseName(c.badge); badges++; }
    }
    if (Array.isArray(c.players) && c.players.length > 0 && c.players.every((x) => typeof x === 'string')) {
      // só nomes: trocam os nomes do elenco do jogo, na ordem (posições, idades e forças ficam como estão)
      const seenN = new Set<string>();
      const names = (c.players as string[]).map((n, i) => {
        const t = typeof n === 'string' ? n.trim() : '';
        if (!t) return '';
        if (t.length < 2 || t.length > 40 || seenN.has(t)) { warn(`${id}: nome ${i + 1} inválido ou repetido (mantive o original).`); return ''; }
        seenN.add(t); return t;
      });
      const filled = names.filter(Boolean).length;
      if (filled > 0) { club.names = names; players += filled; }
    } else if (Array.isArray(c.players) && c.players.length > 0 && (c.players as Record<string, unknown>[]).every((x) => x && typeof x === 'object' && posOf(x) === undefined && normSpot(pick(x, 'spot', 'funcao', 'função')) === undefined)) {
      // jogadores sem posição: valem pela ORDEM do elenco do jogo (3 goleiros, 8 defensores, 8 meias, 5 atacantes); a posição vem do jogo
      const seenN = new Set<string>();
      const slots: PackSlot[] = (c.players as Record<string, unknown>[]).slice(0, 40).map((p0) => {
        const nm = pick(p0, 'name', 'nome'), ag = pick(p0, 'age', 'idade'), ov = pick(p0, 'overall', 'ovr', 'forca', 'força', 'strength');
        const name = typeof nm === 'string' && nm.trim().length >= 2 && nm.trim().length <= 40 && !seenN.has(nm.trim()) ? nm.trim() : undefined;
        if (name) seenN.add(name);
        return { ...(name ? { name } : {}), ...(typeof ag === 'number' && ag >= 15 && ag <= 45 ? { age: Math.round(ag) } : {}), ...(typeof ov === 'number' && ov >= 1 && ov <= 99 ? { overall: Math.round(ov) } : {}) };
      });
      const filled = slots.filter((s) => s.name || s.age !== undefined || s.overall !== undefined).length;
      if (filled > 0) { club.slots = slots; players += slots.filter((s) => s.name).length; }
    } else if (Array.isArray(c.players)) {
      const list: PackPlayer[] = [];
      const names = new Set<string>();
      for (const p0 of c.players as Record<string, unknown>[]) {
        const p = { name: pick(p0, 'name', 'nome'), pos: posOf(p0), spot: pick(p0, 'spot', 'funcao', 'função'), age: pick(p0, 'age', 'idade'), overall: pick(p0, 'overall', 'ovr', 'forca', 'força', 'strength') } as Record<string, unknown>;
        const name = typeof p.name === 'string' ? p.name.trim() : '';
        const pos = normPos(p.pos);
        if (name.length < 2 || name.length > 40) { warn(`${id}: jogador sem nome válido (ignorado).`); continue; }
        if (!pos) { warn(`${id}: posição inválida de "${name}" (use GK, DEF, MID ou ATT).`); continue; }
        if (names.has(name)) { warn(`${id}: "${name}" repetido (ignorado).`); continue; }
        names.add(name);
        const age = typeof p.age === 'number' && p.age >= 15 && p.age <= 45 ? Math.round(p.age) : undefined;
        const overall = typeof p.overall === 'number' && p.overall >= 1 && p.overall <= 99 ? Math.round(p.overall) : undefined;
        const spot = normSpot(p.spot) ?? normSpot(p.pos);
        list.push({ name, pos, ...(spot && SPOT_LINE[spot] === pos ? { spot } : {}), ...(age !== undefined ? { age } : {}), ...(overall !== undefined ? { overall } : {}) });
      }
      if (list.length > 40) { warn(`${id}: mais de 40 jogadores (usei os 40 primeiros).`); list.length = 40; }
      if (list.length > 0 && list.length < 14) warn(`${id}: só ${list.length} jogadores; o jogo completa o elenco com nomes fictícios.`);
      if (list.length > 0) { club.players = list; players += list.length; }
    }
    if (club.badge || club.players || club.names || club.slots || club.info) clubs.push(club);
  }
  // nomes de competições (copas, ligas e divisões) pela chave de cada uma
  const rawComp = pick(r0, 'competitions', 'competicoes', 'competições');
  let competitions: Record<string, string> | undefined;
  if (rawComp && typeof rawComp === 'object' && !Array.isArray(rawComp)) {
    const ok = new Set<string>([...COMP_KEYS, ...competitionIds()]);
    for (const [k, v] of Object.entries(rawComp as Record<string, unknown>)) {
      if (!ok.has(k)) { warn(`Competição desconhecida: "${k}" (ignorada).`); continue; }
      if (typeof v !== 'string' || !v.trim() || v.trim().length > 40) { warn(`Competição "${k}": nome inválido (ignorado).`); continue; }
      (competitions ??= {})[k] = v.trim();
    }
  }
  if (clubs.length === 0 && !competitions) return { ok: false, error: 'Nenhum clube válido no pacote. Use os ids do modelo gerado pelo jogo.' };
  return { ok: true, pack: { name: r.name.trim().slice(0, 40), author: typeof r.author === 'string' ? r.author.slice(0, 40) : undefined, version: typeof r.version === 'string' ? r.version.slice(0, 12) : undefined, clubs, ...(competitions ? { competitions } : {}) }, report: { clubs: clubs.length, players, badges, names, warnings, ...(missingBadges ? { missingBadges } : {}) } };
}

const hash = (s: string) => { let h = 7; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };
const NEED: Record<Position, number> = { GK: 3, DEF: 7, MID: 7, ATT: 5 };

/** Monta o elenco do clube com os jogadores do pacote. Sem overall, usa a força do clube (os primeiros de cada posição são os titulares); falta de gente é completada com nomes fictícios. */
export function buildPackSquad(club: Pick<ClubData, 'id' | 'name' | 'shortName' | 'primaryColor' | 'squad'>, list: PackPlayer[]): Player[] {
  const avg = Math.round(club.squad.reduce((s, p) => s + p.strength, 0) / Math.max(1, club.squad.length));
  const idx: Record<Position, number> = { GK: 0, DEF: 0, MID: 0, ATT: 0 };
  const out: Player[] = list.map((p, i) => {
    const k = idx[p.pos]++;
    const noise = (hash(`${club.id}${p.name}`) % 7) - 3;
    const strength = p.overall ?? Math.max(25, Math.min(95, avg + (k < (p.pos === 'GK' ? 1 : p.pos === 'ATT' ? 2 : 4) ? 3 : -5) - Math.floor(k * 0.6) + noise));
    return { id: `${club.id}-m${i}`, name: p.name, pos: p.pos, ...(p.spot ? { spot: p.spot } : {}), age: p.age ?? 18 + (hash(p.name) % 17), strength };
  });
  for (const pl of out) if (!pl.spot) pl.spot = pickSpot(out.filter((x) => x !== pl && x.spot), pl.pos); // sem função no pacote: distribui laterais, pontas e centroavantes
  const have: Record<Position, number> = { GK: 0, DEF: 0, MID: 0, ATT: 0 };
  for (const p of out) have[p.pos]++;
  const filler = generateSquad({ id: `${club.id}-fill`, name: club.name, short: club.shortName, color: club.primaryColor, strength: avg - 4 }, 4242);
  const used = new Set(out.map((p) => p.name));
  let n = 0;
  for (const pos of ['GK', 'DEF', 'MID', 'ATT'] as Position[]) {
    for (const f of filler.filter((x) => x.pos === pos)) {
      if (have[pos] >= NEED[pos]) break;
      if (used.has(f.name)) continue;
      out.push({ ...f, id: `${club.id}-g${n++}`, spot: pickSpot(out, pos) }); used.add(f.name); have[pos]++;
    }
  }
  return out;
}

/** Troca só os nomes do elenco, na ordem (posição, idade e força de cada vaga não mudam). Nome vazio = mantém o original. */
export function renameSquad(squad: Player[], names: string[]): Player[] {
  const taken = new Set(names.filter(Boolean));
  return squad.map((p, i) => {
    const n = names[i];
    if (n) return { ...p, name: n };
    return taken.has(p.name) ? { ...p, name: `${p.name} Jr.` } : p; // o original não pode repetir um nome novo
  });
}

/** Aplica nome, idade e overall às vagas do elenco do jogo, na ordem. Posição, função e id não mudam; campo vazio mantém o do jogo; nome não repete. */
export function applySlots(squad: Player[], slots: PackSlot[]): Player[] {
  const taken = new Set(slots.map((s) => s.name).filter(Boolean) as string[]);
  return squad.map((p, i) => {
    const s = slots[i];
    if (!s) return taken.has(p.name) ? { ...p, name: `${p.name} Jr.` } : p;
    return { ...p, name: s.name ?? (taken.has(p.name) ? `${p.name} Jr.` : p.name), ...(s.age !== undefined ? { age: s.age } : {}), ...(s.overall !== undefined ? { strength: s.overall } : {}) };
  });
}

/** Escudos embutidos no próprio JSON ("data:image/...;base64,"): vira arquivos de imagem e o campo passa a apontar para eles. */
export function extractEmbedded(text: string): { text: string; files: { name: string; bytes: Uint8Array; mime: string }[] } {
  let j: { clubs?: unknown };
  try { j = JSON.parse(text); } catch { return { text, files: [] }; }
  const list = (j && typeof j === 'object' && (Array.isArray((j as { clubs?: unknown }).clubs) ? (j as { clubs: unknown[] }).clubs : undefined)) as Record<string, unknown>[] | undefined;
  if (!list) return { text, files: [] };
  const files: { name: string; bytes: Uint8Array; mime: string }[] = [];
  for (const c of list) {
    const key = ['badge', 'escudo', 'logo'].find((k) => typeof c?.[k] === 'string' && (c[k] as string).startsWith('data:image/'));
    const id = typeof c?.id === 'string' ? c.id : '';
    if (!key || !id) continue;
    const m = /^data:(image\/(png|jpeg|webp));base64,(.+)$/i.exec(c[key] as string);
    if (!m) { delete c[key]; continue; }
    try {
      const bin = atob(m[3]);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const name = `${id}.${m[2].toLowerCase() === 'jpeg' ? 'jpg' : m[2].toLowerCase()}`;
      files.push({ name, bytes, mime: m[1].toLowerCase() });
      c.badge = name; if (key !== 'badge') delete c[key];
    } catch { delete c[key]; }
  }
  return { text: JSON.stringify(j), files };
}

/* ---------- aplicar sobre os dados do jogo ---------- */
const ORIGINAL = new Map<string, { squad: Player[]; badge: string; info: Required<ClubInfoPatch> }>();
const BADGE_URLS = new Map<string, string>();

/** Endereço real do escudo: escudos do pacote usam "pack:<id>", resolvidos para a imagem guardada. */
export const resolveBadge = (badge: string): string => (badge.startsWith('pack:') ? BADGE_URLS.get(badge.slice(5)) ?? '' : badge);

/** Aplica (ou, com null, remove) o pacote nos clubes do jogo. `urls` liga o nome da imagem ao endereço dela. */
export function applyPack(pack: Pack | null, urls: Record<string, string> = {}): void {
  const all = new Map(Object.values(CLUBS_DATA).flat().map((c) => [c.id, c]));
  for (const [id, o] of ORIGINAL) { const c = all.get(id); if (c) { c.squad = o.squad; c.badge = o.badge; Object.assign(c, o.info); } }
  ORIGINAL.clear(); BADGE_URLS.clear();
  setCompetitionSource('pack', pack?.competitions);
  if (!pack) { resetEstadualCache(); return; }
  for (const pc of pack.clubs) {
    const c = all.get(pc.id);
    if (!c) continue;
    ORIGINAL.set(c.id, { squad: c.squad, badge: c.badge, info: { name: c.name, shortName: c.shortName, stadium: c.stadium, city: c.city, primaryColor: c.primaryColor, secondaryColor: c.secondaryColor } });
    if (pc.info) { Object.assign(c, pc.info); if (pc.info.name && !pc.info.shortName) c.shortName = autoShort(pc.info.name); } // só o nome veio: a sigla sai dele
    if (pc.players?.length) c.squad = buildPackSquad(c, pc.players);
    else if (pc.slots?.length) c.squad = applySlots(c.squad, pc.slots);
    else if (pc.names?.length) c.squad = renameSquad(c.squad, pc.names);
    if (pc.badge && urls[pc.badge]) { BADGE_URLS.set(c.id, urls[pc.badge]); c.badge = `pack:${c.id}`; }
  }
  dedupeShorts(new Set(ORIGINAL.keys()));
  resetEstadualCache();
}

/** Modelo para o jogador preencher: os primeiros clubes de cada divisão, com ids certos e jogadores de exemplo. */
export function packTemplate(perDivision = 1): string {
  const clubs = Object.values(CLUBS_DATA).filter((l) => l.length).slice(0, 6).flatMap((list) => list.slice(0, perDivision)).map((c) => ({
    id: c.id, badge: `${c.id}.png`,
    players: [
      { name: 'Nome do Goleiro', pos: 'GK', age: 30, overall: 72 }, { name: 'Nome do Lateral Direito', pos: 'LD', age: 27, overall: 70 }, { name: 'Nome do Zagueiro', pos: 'ZAG', age: 28, overall: 71 },
      { name: 'Nome do Meia', pos: 'MC', age: 25, overall: 71 }, { name: 'Nome do Ponta Esquerda', pos: 'PE', age: 24, overall: 73 }, { name: 'Nome do Centroavante', pos: 'CA', age: 26, overall: 75 },
    ],
  }));
  return JSON.stringify({ name: 'Meu pacote', author: 'Seu nome', version: '1.0', clubs }, null, 2);
}
