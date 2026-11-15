import type { Player, Position } from '../engine/types';
import { CLUBS_DATA, type ClubData } from './clubs';
import { generateSquad } from '../engine/squad';

/* =====================================================================
   Pacote de elencos e escudos (feito por você): nomes de jogadores e escudos dos clubes.
   Formato do JSON:  { "name": "Meu pacote", "clubs": [ { "id": "flamengo", "badge": "flamengo.png",
                       "players": [ { "name": "Fulano", "pos": "ATT", "age": 27, "overall": 78 } ] } ] }
   "id" é o identificador do clube NO JOGO (o modelo gerado pelo jogo já traz os ids). Vale para as próximas carreiras.
   ===================================================================== */

/** Máximo de clubes por pacote. */
export const MAX_PACK_CLUBS = 5000;

export interface PackPlayer { name: string; pos: Position; age?: number; overall?: number }
/** `players` = elenco completo com posição; `names` = só nomes, na ordem do elenco do jogo (vazio = mantém o nome). */
export interface PackClub { id: string; badge?: string; players?: PackPlayer[]; names?: string[] }
export interface Pack { name: string; author?: string; version?: string; clubs: PackClub[] }
export interface PackReport { clubs: number; players: number; badges: number; warnings: string[] }
export type PackResult = { ok: true; pack: Pack; report: PackReport } | { ok: false; error: string };

const POS: Record<string, Position> = {
  GK: 'GK', GOL: 'GK', G: 'GK', GOLEIRO: 'GK',
  DEF: 'DEF', D: 'DEF', ZAG: 'DEF', LD: 'DEF', LE: 'DEF', ZAGUEIRO: 'DEF', LATERAL: 'DEF',
  MID: 'MID', M: 'MID', MEI: 'MID', VOL: 'MID', MC: 'MID', MEIA: 'MID', VOLANTE: 'MID',
  ATT: 'ATT', A: 'ATT', ATA: 'ATT', CA: 'ATT', PE: 'ATT', PD: 'ATT', ATACANTE: 'ATT',
};
export const normPos = (s: unknown): Position | undefined => (typeof s === 'string' ? POS[s.trim().toUpperCase()] : undefined);
/** Primeiro campo existente entre vários nomes possíveis (o pacote pode vir em português ou inglês). */
const pick = (o: Record<string, unknown> | undefined, ...keys: string[]): unknown => { if (!o) return undefined; for (const k of keys) if (o[k] !== undefined && o[k] !== null) return o[k]; return undefined; };
const IMG = /\.(png|jpe?g|webp)$/i;
export const isImageName = (n: string) => IMG.test(n);
export const baseName = (n: string) => n.split('/').pop()!.toLowerCase();

/** Valida o texto do pacote. Erros graves param tudo; problemas pequenos viram avisos e só pulam o item. `badgeFiles` = nomes das imagens entregues junto. */
export function validatePack(text: string, badgeFiles: string[] = []): PackResult {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return { ok: false, error: 'O arquivo não é um JSON válido.' }; }
  const r0 = raw as Record<string, unknown>;
  const r = { name: pick(r0, 'name', 'nome'), author: pick(r0, 'author', 'autor'), version: pick(r0, 'version', 'versao', 'versão'), clubs: pick(r0, 'clubs', 'clubes', 'times') };
  if (!r0 || typeof r0 !== 'object' || typeof r.name !== 'string' || !r.name.trim()) return { ok: false, error: 'O pacote precisa de um "name".' };
  if (!Array.isArray(r.clubs) || r.clubs.length === 0) return { ok: false, error: 'O pacote precisa de uma lista "clubs" com pelo menos 1 clube.' };
  if (r.clubs.length > MAX_PACK_CLUBS) return { ok: false, error: `Pacote grande demais (máximo de ${MAX_PACK_CLUBS.toLocaleString('pt-BR')} clubes).` };
  const known = new Set(Object.values(CLUBS_DATA).flat().map((c) => c.id));
  const files = new Set(badgeFiles.map(baseName));
  const warnings: string[] = [];
  const warn = (t: string) => { if (warnings.length < 60) warnings.push(t); };
  const seen = new Set<string>();
  const clubs: PackClub[] = [];
  let players = 0, badges = 0;
  for (const c0 of r.clubs as Record<string, unknown>[]) {
    const c = { id: pick(c0, 'id', 'clubId', 'clube_id', 'clubeId'), badge: pick(c0, 'badge', 'escudo', 'logo'), players: pick(c0, 'players', 'jogadores', 'elenco') } as Record<string, unknown>;
    const id = typeof c.id === 'string' ? c.id : '';
    if (!id || !known.has(id)) { warn(`Clube que o jogo não tem: "${id || '(sem id)'}" (ignorado).`); continue; }
    if (seen.has(id)) { warn(`Clube repetido: "${id}" (usei o primeiro).`); continue; }
    seen.add(id);
    const club: PackClub = { id };
    if (typeof c.badge === 'string' && c.badge.trim()) {
      if (!IMG.test(c.badge)) warn(`${id}: escudo "${c.badge}" não é imagem PNG/JPG/WEBP.`);
      else if (!files.has(baseName(c.badge))) warn(`${id}: o escudo "${c.badge}" não veio no ZIP.`);
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
    } else if (Array.isArray(c.players)) {
      const list: PackPlayer[] = [];
      const names = new Set<string>();
      for (const p0 of c.players as Record<string, unknown>[]) {
        const p = { name: pick(p0, 'name', 'nome'), pos: pick(p0, 'pos', 'posicao', 'posição', 'position'), age: pick(p0, 'age', 'idade'), overall: pick(p0, 'overall', 'ovr', 'forca', 'força', 'strength') } as Record<string, unknown>;
        const name = typeof p.name === 'string' ? p.name.trim() : '';
        const pos = normPos(p.pos);
        if (name.length < 2 || name.length > 40) { warn(`${id}: jogador sem nome válido (ignorado).`); continue; }
        if (!pos) { warn(`${id}: posição inválida de "${name}" (use GK, DEF, MID ou ATT).`); continue; }
        if (names.has(name)) { warn(`${id}: "${name}" repetido (ignorado).`); continue; }
        names.add(name);
        const age = typeof p.age === 'number' && p.age >= 15 && p.age <= 45 ? Math.round(p.age) : undefined;
        const overall = typeof p.overall === 'number' && p.overall >= 1 && p.overall <= 99 ? Math.round(p.overall) : undefined;
        list.push({ name, pos, ...(age !== undefined ? { age } : {}), ...(overall !== undefined ? { overall } : {}) });
      }
      if (list.length > 40) { warn(`${id}: mais de 40 jogadores (usei os 40 primeiros).`); list.length = 40; }
      if (list.length > 0 && list.length < 14) warn(`${id}: só ${list.length} jogadores; o jogo completa o elenco com nomes fictícios.`);
      if (list.length > 0) { club.players = list; players += list.length; }
    }
    if (club.badge || club.players || club.names) clubs.push(club);
  }
  if (clubs.length === 0) return { ok: false, error: 'Nenhum clube válido no pacote. Use os ids do modelo gerado pelo jogo.' };
  return { ok: true, pack: { name: r.name.trim().slice(0, 40), author: typeof r.author === 'string' ? r.author.slice(0, 40) : undefined, version: typeof r.version === 'string' ? r.version.slice(0, 12) : undefined, clubs }, report: { clubs: clubs.length, players, badges, warnings } };
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
    return { id: `${club.id}-m${i}`, name: p.name, pos: p.pos, age: p.age ?? 18 + (hash(p.name) % 17), strength };
  });
  const have: Record<Position, number> = { GK: 0, DEF: 0, MID: 0, ATT: 0 };
  for (const p of out) have[p.pos]++;
  const filler = generateSquad({ id: `${club.id}-fill`, name: club.name, short: club.shortName, color: club.primaryColor, strength: avg - 4 }, 4242);
  const used = new Set(out.map((p) => p.name));
  let n = 0;
  for (const pos of ['GK', 'DEF', 'MID', 'ATT'] as Position[]) {
    for (const f of filler.filter((x) => x.pos === pos)) {
      if (have[pos] >= NEED[pos]) break;
      if (used.has(f.name)) continue;
      out.push({ ...f, id: `${club.id}-g${n++}` }); used.add(f.name); have[pos]++;
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
const ORIGINAL = new Map<string, { squad: Player[]; badge: string }>();
const BADGE_URLS = new Map<string, string>();

/** Endereço real do escudo: escudos do pacote usam "pack:<id>", resolvidos para a imagem guardada. */
export const resolveBadge = (badge: string): string => (badge.startsWith('pack:') ? BADGE_URLS.get(badge.slice(5)) ?? '' : badge);

/** Aplica (ou, com null, remove) o pacote nos clubes do jogo. `urls` liga o nome da imagem ao endereço dela. */
export function applyPack(pack: Pack | null, urls: Record<string, string> = {}): void {
  const all = new Map(Object.values(CLUBS_DATA).flat().map((c) => [c.id, c]));
  for (const [id, o] of ORIGINAL) { const c = all.get(id); if (c) { c.squad = o.squad; c.badge = o.badge; } }
  ORIGINAL.clear(); BADGE_URLS.clear();
  if (!pack) return;
  for (const pc of pack.clubs) {
    const c = all.get(pc.id);
    if (!c) continue;
    ORIGINAL.set(c.id, { squad: c.squad, badge: c.badge });
    if (pc.players?.length) c.squad = buildPackSquad(c, pc.players);
    else if (pc.names?.length) c.squad = renameSquad(c.squad, pc.names);
    if (pc.badge && urls[pc.badge]) { BADGE_URLS.set(c.id, urls[pc.badge]); c.badge = `pack:${c.id}`; }
  }
}

/** Modelo para o jogador preencher: os primeiros clubes de cada divisão, com ids certos e jogadores de exemplo. */
export function packTemplate(perDivision = 1): string {
  const clubs = Object.values(CLUBS_DATA).filter((l) => l.length).slice(0, 6).flatMap((list) => list.slice(0, perDivision)).map((c) => ({
    id: c.id, badge: `${c.id}.png`,
    players: [
      { name: 'Nome do Goleiro', pos: 'GK', age: 30, overall: 72 }, { name: 'Nome do Zagueiro', pos: 'DEF', age: 27, overall: 70 },
      { name: 'Nome do Meia', pos: 'MID', age: 25, overall: 71 }, { name: 'Nome do Atacante', pos: 'ATT', age: 24, overall: 74 },
    ],
  }));
  return JSON.stringify({ name: 'Meu pacote', author: 'Seu nome', version: '1.0', clubs }, null, 2);
}
