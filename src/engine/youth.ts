import { ACADEMY_START_AGE, ACADEMY_START_OVERALL, canPromoteAge, homeCategory, categoryDef, MIN_PRO_AGE, needsDecision } from './categories';
import { inflate } from './economy';
import { academyCost, intakeCount, MAX_ACADEMY_LEVEL, START_FACILITIES, upgradeAcademy, youthCapacity, type FacilityLevels, type YouthFinance } from './academy';
import { basePointsAt, potentialFactor, rollPotential, STAR_POTENTIAL, trainTick, type Specialty } from './training';
import { ensureCoaches, evaluateCoaches, marketTick, midSeasonCheck, payCoaches, refreshMarket, trackSeason, upgradeLegacyCoaches, type CatLogEntry, type CoachMarket, type YouthCoach } from './coaches';
import { attributesOf, CATEGORIES } from './categories';
import { newContract, payWages, personalityOf, SAT_START, satTick } from './ycontract';
import { refreshScoutMarket, payScouts, scoutTick } from './yscout';
import { aiPromoteDerived } from './aiyouth';
import { aiScoutingYear, aiYouthMarket, endMove, refreshListings, returnLoans, ymarketTick } from './ymarket';
import { makeRng, type Rng } from './rng';
import { pickSpot, randomName } from './squad';
import { MAX_SQUAD } from './transfers';
import type { GameState, NewsItem, Player, Position } from './types';

/** Fato da vida do jovem na base (entrada, mudança de categoria, decisão pendente...). */
export interface HistoryEntry { season: number; text: string }
/** Um jovem da base: o jogador e o quanto ele pode chegar a ser (potencial). `exact` guarda a força com casas decimais.
 *  Um registro só por atleta; as categorias (Sub-13 a Sub-21) são faixas de idade sobre esta lista (ver categories.ts).
 *  `joined`, `origin` e `history` são a identidade/histórico próprios; ausentes em saves antigos (a migração completa). */
export interface Prospect { player: Player; potential: number; exact: number;
  /** Barra de treino (0 a 100 %): ao chegar a 100 o jovem ganha +1 de overall e a barra reinicia. `exact` = overall + barra/100. */
  train?: number;
  /** Os seis atributos (ordem de `ATTRIBUTES[pos]`), que acompanham o overall. */
  attrs?: number[];
  /** Especialidade de treino escolhida pelo usuário (sem escolha = equilibrado). */
  /** Foco de treino: decidido pelo treinador da categoria (o usuário não escolhe). */
  focus?: Specialty;
  /** Overall + barra no começo da temporada (mede quanto o jovem evoluiu no ano). */
  base?: number;
  joined?: number; origin?: 'academia' | 'anterior' | 'olheiro' | 'peneira' | 'mercado'; history?: HistoryEntry[];
  /** Satisfação (0 a 100), motivação e o que o jovem quer (Etapa 6). A personalidade sai do id e não é guardada. */
  sat?: number; mot?: number; want?: 'transferencia' | 'nao-renovar'; why?: string[]; unrest?: number;
  /** Histórico de renovações de contrato (o contrato fica em player.contract). */
  renewals?: { season: number; wage: number; until: number }[];
  /** Emprestado a outro clube (continua seu) ou recebido por empréstimo (continua do outro). */
  loanedTo?: { club: string; until: number; share: number }; loanFrom?: { club: string; until: number; share: number } }
/** Ganchos reservados para as próximas etapas (treinamento, treinadores individuais, instalações, campeonatos de base, olheiros,
 *  contratos, empréstimos). Nada disso existe ainda: o campo só garante um lugar no save, sem mexer no que já está salvo. */
export interface YouthModules { training?: unknown; coaches?: unknown; facilities?: unknown; competitions?: unknown; scouting?: unknown; contracts?: unknown; loans?: unknown }
export interface YouthState { level: number; prospects: Prospect[]; seq: number; lastIntake: number; /** versão do formato da base */ schema?: number; modules?: YouthModules;
  /** Treinador de cada categoria (qualidade 1 a 5), criado automaticamente. */
  coaches?: Partial<Record<import('./categories').CategoryId, YouthCoach>>;
  /** Níveis das cinco instalações (1 a 20). */
  fac?: FacilityLevels;
  /** Histórico e totais dos investimentos da formação. */
  fin?: YouthFinance;
  /** Olheiros contratados, candidatos a olheiro, jovens observados (olheiros e peneiras), propostas, jogadores à venda e última peneira. */
  scouts?: import('./yscout').Scout[]; scoutMarket?: import('./yscout').Scout[]; pool?: import('./yscout').Candidate[]; lastTryout?: { season: number; round: number; /** dia do calendário (a peneira é uma por mês) */ day?: number };
  offers?: import('./ymarket').YOffer[]; listings?: import('./ymarket').Listing[];
  /** A base já começou com 15 atletas em cada categoria (feito uma vez só). */
  seeded?: boolean;
  /** Os quatro treinadores iniciais já foram criados (depois disso uma vaga só é preenchida contratando). */
  coachesInit?: boolean;
  /** Mercado de treinadores disponíveis (renovado de tempos em tempos). */
  market?: CoachMarket;
  /** Histórico de cada categoria, que continua mesmo quando o treinador muda. */
  catLog?: Partial<Record<import('./categories').CategoryId, CatLogEntry[]>> }
export const YOUTH_SCHEMA = 5;

export const MAX_LEVEL = MAX_ACADEMY_LEVEL;
/** Limite de jovens na base (as quatro categorias juntas). Quem aguarda decisão aos 21 anos nunca é cortado. */
export const MAX_PROSPECTS = 80; // base; o alojamento acrescenta vagas (youthCapacity)
const HISTORY_MAX = 24;
const note = (p: Prospect, season: number, text: string): Prospect => ({ ...p, history: [...(p.history ?? []), { season, text }].slice(-HISTORY_MAX) });
const POS_BAG: Position[] = ['GK', 'DEF', 'DEF', 'DEF', 'MID', 'MID', 'MID', 'ATT', 'ATT'];

export const youthOf = (g: GameState): YouthState => g.youth ?? { level: 0, prospects: [], seq: 1, lastIntake: -1, schema: YOUTH_SCHEMA, fac: { ...START_FACILITIES }, fin: { total: 0, staff: 0, log: [] } };
const news = (g: GameState, text: string, tone: NewsItem['tone'] = 'info'): GameState => ({ ...g, news: [{ season: g.season, round: g.round, text, tone }, ...g.news].slice(0, 80) });

/** Atletas com que cada categoria de base começa: assim as competições já podem começar (mínimo de 11 para inscrever). */
export const SEED_PER_CATEGORY = 15;
/** Faixas de idade "da casa" de cada categoria (sem sobreposição): Sub-13, Sub-15, Sub-17 e Sub-21 (18 a 21 anos). */
const SEED_BANDS: readonly [number, number][] = [[12, 13], [14, 15], [16, 17], [18, 21]];
const SEED_POS: Position[] = ['GK', 'GK', 'DEF', 'DEF', 'DEF', 'DEF', 'DEF', 'MID', 'MID', 'MID', 'MID', 'MID', 'ATT', 'ATT', 'ATT'];

/** Completa a base até 15 atletas em cada categoria (os que já existem ficam como estão; só entram os que faltam). Feito uma vez por carreira. */
export function seedCategories(g: GameState, y: YouthState): YouthState {
  if (y.seeded) return y;
  const rng = makeRng(g.seed * 131 + g.season * 11 + 17);
  const used = new Set([...g.teams[g.userClubId].players.map((p) => p.name), ...y.prospects.map((p) => p.player.name)]);
  const out = [...y.prospects]; let seq = y.seq;
  for (const [lo, hi] of SEED_BANDS) {
    const inBand = (x: Prospect) => x.player.age >= lo && x.player.age <= hi;
    const have = out.filter(inBand);
    const needGk = Math.max(0, 2 - have.filter((x) => x.player.pos === 'GK').length);
    const rest = SEED_POS.filter((p) => p !== 'GK');
    for (let k = 0, i = have.length; i < SEED_PER_CATEGORY; i++, k++) {
      const pos = k < needGk ? 'GK' : rest[(k - needGk) % rest.length];
      const age = lo + (k % (hi - lo + 1));
      const potential = rollPotential(rng, y.level);
      let ovr = ACADEMY_START_OVERALL; for (let a = ACADEMY_START_AGE; a < age; a++) ovr = Math.min(potential - 1, ovr + basePointsAt(a) * potentialFactor(potential) * (0.85 + rng() * 0.3)); // quem já passou anos na base é mais forte
      const strength = Math.max(ACADEMY_START_OVERALL, Math.round(ovr)), train = Math.floor(rng() * 90);
      const player: Player = { id: `${g.userClubId}-y${seq++}`, name: randomName(rng, used), pos, spot: pickSpot(out.map((x) => x.player), pos), age, strength, pot: potential, formedAt: g.userClubId, formedSeason: g.season - (age - ACADEMY_START_AGE) };
      const pr: Prospect = { player, potential, exact: Math.min(potential, strength + train / 100), train, base: Math.min(potential, strength + train / 100), joined: g.season - (age - ACADEMY_START_AGE), origin: 'anterior', sat: 78, mot: 70,
        history: [{ season: g.season, text: `Fazia parte da categoria ${categoryDef(age <= 13 ? 'sub13' : age <= 15 ? 'sub15' : age <= 17 ? 'sub17' : 'sub21').label} quando a carreira começou (overall ${strength}).` }] };
      pr.attrs = attributesOf(pr.player).map((a) => a.value);
      pr.player = { ...pr.player, contract: newContract(g, pr, 2) };
      out.push(pr);
    }
  }
  return { ...y, prospects: out, seq, seeded: true };
}

/** Estrelas de potencial (1–5). */
export const stars = (potential: number) => Math.max(1, Math.min(5, Math.round((potential - 40) / 11)));

/** Nova safra: mais jovens e melhores conforme o nível da academia. */
function intake(g: GameState, y: YouthState, rng: Rng): YouthState {
  const used = new Set([...g.teams[g.userClubId].players.map((p) => p.name), ...y.prospects.map((p) => p.player.name)]);
  const count = intakeCount(y.level); // academia melhor = safra maior
  const fresh: Prospect[] = [];
  let seq = y.seq;
  for (let i = 0; i < count; i++) {
    const pos = POS_BAG[Math.floor(rng() * POS_BAG.length)];
    const age = ACADEMY_START_AGE;
    const strength = ACADEMY_START_OVERALL;
    const potential = rollPotential(rng, y.level); // ~8% estrelas (85+); o resto fica abaixo disso
    fresh.push({ player: { id: `${g.userClubId}-y${seq++}`, name: randomName(rng, used), pos, spot: pickSpot(fresh.map((x) => x.player), pos), age, strength, pot: potential, formedAt: g.userClubId, formedSeason: g.season }, potential, exact: strength, train: 0, base: strength,
      joined: g.season, origin: 'academia', sat: 78, mot: 70, history: [{ season: g.season, text: `Chegou à academia aos ${age} anos (overall ${strength})${potential >= STAR_POTENTIAL ? ' — talento excepcional (estrela)' : ''}.` }] });
    const last = fresh[fresh.length - 1]; last.attrs = attributesOf(last.player).map((a) => a.value);
    last.player = { ...last.player, contract: newContract(g, last, 3) }; // contrato de formação de 3 anos
  }
  const pending = y.prospects.filter((p) => needsDecision(p.player.age)); // quem aguarda decisão do clube nunca é cortado
  const rest = [...y.prospects.filter((p) => !needsDecision(p.player.age)), ...fresh].sort((a, b) => b.potential - a.potential).slice(0, youthCapacity(y));
  return { ...y, prospects: [...pending, ...rest], seq, lastIntake: g.season, schema: YOUTH_SCHEMA };
}

/** Saves antigos: completa os jovens já existentes (origem, histórico, barra de treino, atributos) e os treinadores das categorias.
 *  Idade, overall e potencial NÃO mudam. A barra começa com a parte fracionária que o jovem já tinha. Idempotente. */
export function ensureCategoryState(g: GameState): GameState {
  const y = g.youth;
  if (!y) return g;
  const done = y.schema === YOUTH_SCHEMA && !!y.scouts && !!y.scoutMarket && !!y.listings && y.prospects.every((p) => p.player.contract && p.sat !== undefined) && !!y.fac && !!y.fin && y.coachesInit && y.market && CATEGORIES.every((c) => y.coaches?.[c.id] ? y.coaches[c.id]!.rating !== undefined : true) && y.prospects.every((p) => p.origin && p.history && p.train !== undefined && p.attrs && p.base !== undefined);
  if (done) return g;
  const prospects = y.prospects.map((p) => {
    if (p.origin && p.history && p.train !== undefined && p.attrs && p.base !== undefined) return p;
    const train = p.train ?? Math.max(0, Math.min(99, Math.round((p.exact - p.player.strength) * 100)));
    return { ...p, origin: p.origin ?? ('anterior' as const), history: p.history ?? [{ season: g.season, text: 'Já estava na base quando o sistema de categorias foi ativado.' }], train,
      attrs: p.attrs ?? attributesOf(p.player).map((a) => a.value), exact: Math.min(p.potential, p.player.strength + train / 100), base: p.base ?? Math.min(p.potential, p.player.strength + train / 100) };
  });
  const y2 = ensureCoaches(g, upgradeLegacyCoaches(g, { ...y, prospects, schema: YOUTH_SCHEMA, fac: y.fac ?? { ...START_FACILITIES }, fin: y.fin ?? { total: 0, staff: 0, log: [] } }));
  return { ...g, youth: completeYouth(g, y2.market ? y2 : refreshMarket(g, y2, 'full')) };
}

/** Completa o que a Etapa 6 acrescentou (contratos, satisfação, olheiros, propostas, mercado). Só preenche o que falta; idempotente. */
export function completeYouth(g: GameState, y: YouthState): YouthState {
  const prospects = y.prospects.map((p) => {
    const need = !p.player.contract || p.sat === undefined;
    return need ? { ...p, player: p.player.contract ? p.player : { ...p.player, contract: newContract(g, p, 3) }, sat: p.sat ?? SAT_START, mot: p.mot ?? 60, renewals: p.renewals ?? [] } : p;
  });
  let ny: YouthState = prospects.some((p, i) => p !== y.prospects[i]) ? { ...y, prospects } : y;
  if (!ny.scouts || !ny.pool || !ny.offers) ny = { ...ny, scouts: ny.scouts ?? [], pool: ny.pool ?? [], offers: ny.offers ?? [] };
  if (!ny.scoutMarket) ny = refreshScoutMarket(g, ny);
  if (!ny.listings) ny = refreshListings(g, ny);
  return ny;
}

/** Garante que a base tenha a primeira safra. */
export function ensureYouth(g: GameState): GameState {
  if (g.youth || g.unemployed || g.observer) return g;
  const y0 = youthOf(g);
  return { ...g, youth: completeYouth(g, refreshMarket(g, ensureCoaches(g, seedCategories(g, intake(g, y0, makeRng(g.seed * 53 + g.season * 7 + 3)))), 'full')) };
}

/** A cada rodada a barra de treino de cada jovem enche um pouco (veja training.ts). Roda sozinho durante a temporada, com ou sem a tela aberta. */
export function youthTick(g: GameState): GameState {
  if (g.unemployed || g.observer) return g;
  const s0 = ensureYouth(g);
  let y = marketTick(s0, ensureCoaches(s0, upgradeLegacyCoaches(s0, youthOf(s0))));
  const ticks = Math.max(1, s0.totalRounds);
  const before = y.prospects;
  const prospects = before.map((p) => trainTick(p, y, ticks));
  y = trackSeason({ ...y, prospects }, before, prospects, ticks); // conta o que cada treinador rendeu na temporada
  let s: GameState = { ...s0, youth: y };
  if (s.round === Math.floor(ticks / 2) + 1) { const m = midSeasonCheck(s, y); s = { ...m.g, youth: m.y }; }
  return ymarketTick(scoutTick(satTick(s))); // satisfação, olheiros, propostas e mercado da base (Etapa 6)
}

/** Virada de temporada: todos ficam um ano mais velhos e crescem mais; quem chega aos 20 anos sai da base; entra uma safra nova. */
export function youthSeason(g: GameState): GameState {
  if (g.unemployed || g.observer) return g;
  let s = ensureYouth(g);
  const y0 = youthOf(s);
  const rng = makeRng(s.seed * 61 + s.season * 13 + 9);
  // os treinadores são avaliados ANTES de os jovens envelhecerem (com as categorias do ano que acabou); a folha deles é paga
  const ev = evaluateCoaches(s, ensureCoaches(s, upgradeLegacyCoaches(s, y0)));
  s = payCoaches(ev.g, ev.y);
  s = returnLoans(payScouts(payWages(s)));                         // folha dos jovens e dos olheiros; empréstimos que acabam voltam
  // contratos vencidos: o jovem deixa o clube (você foi avisado ao longo da temporada); quem tem contrato válido segue
  const gone = s.youth!.prospects.filter((p) => !p.loanFrom && p.player.contract && p.player.contract.until < s.season);
  if (gone.length) s = news(s, `📄 Contratos vencidos na base: ${gone.map((p) => p.player.name).join(', ')} deixaram o clube.`, 'bad');
  for (const p of gone) if (g.ymoves?.[p.player.id] || s.ymoves?.[p.player.id]) s = endMove(s, p.player.id); // saiu do clube: o registro de empréstimo/transferência também acaba
  const y = { ...s.youth!, offers: [], prospects: s.youth!.prospects.filter((p) => !gone.includes(p)).map((p) => ({ ...p, base: p.exact })) }; // (a folha paga já foi registrada no histórico)
  const moved: string[] = [], decide: string[] = [];
  const grown = y.prospects.map((p) => {
    const age = p.player.age + 1; // o overall NÃO muda na virada: ele só sobe pela barra de treino, rodada a rodada
    let q: Prospect = { ...p, player: { ...p.player, age } };
    // a idade sobe só aqui, na virada de temporada; o histórico registra a passagem de categoria e a decisão dos 21 anos
    if (needsDecision(age) && !needsDecision(p.player.age)) { q = note(q, s.season, `Completou ${age} anos: o clube decide entre profissional, empréstimo ou dispensa.`); decide.push(p.player.name); }
    else if (!needsDecision(age) && homeCategory(age) !== homeCategory(p.player.age) && homeCategory(age)) { q = note(q, s.season, `Passou para o ${categoryDef(homeCategory(age)!).label} (${age} anos).`); moved.push(p.player.name); }
    else if (age === MIN_PRO_AGE) q = note(q, s.season, 'Completou 16 anos: já pode ser promovido ao profissional.');
    return q;
  });
  if (decide.length) s = news(s, `🌱 Aguardando decisão do clube (21 anos): ${decide.join(', ')}. Escolha entre profissional, empréstimo ou dispensa.`, 'info');
  if (moved.length) s = news(s, `🌱 ${moved.length} jovem(ns) mudaram de categoria na base.`);
  s = { ...s, youth: refreshMarket(s, intake(s, { ...y, prospects: grown }, rng), 'full') }; // novo ano: o mercado de treinadores se renova
  s = aiPromoteDerived(aiYouthMarket(aiScoutingYear(s, rng), rng), rng);                  // clubes da IA: olheiros, peneiras, compras e empréstimos de jovens
  s = { ...s, youth: refreshListings(s, refreshScoutMarket(s, s.youth!)) };
  return news(s, '🌱 Nova safra da base: novos jovens chegaram às categorias de base.', 'good');
}

/** Salário anual de um jovem promovido (R$). */
export const youthWage = (g: GameState, p: Prospect) => Math.max(18_000, Math.round(inflate(g, 20_000 + p.player.strength * 600) / 1_000) * 1_000);

export type YouthResult = { ok: true; state: GameState } | { ok: false; error: string };

export function promoteProspect(g: GameState, id: string): YouthResult {
  const y = youthOf(g);
  const p = y.prospects.find((x) => x.player.id === id);
  if (!p) return { ok: false, error: 'Jovem não encontrado.' };
  if (!canPromoteAge(p.player.age)) return { ok: false, error: `${p.player.name} tem ${p.player.age} anos: só a partir dos ${MIN_PRO_AGE} anos o jovem pode ser promovido ao profissional.` };
  if (p.loanedTo || p.loanFrom) return { ok: false, error: `${p.player.name} está em empréstimo: espere o jogador voltar para promover.` };
  const team = g.teams[g.userClubId];
  if (team.players.length >= MAX_SQUAD) return { ok: false, error: `Elenco cheio (${MAX_SQUAD}). Venda ou dispense alguém antes.` };
  const player: Player = { ...p.player, strength: p.player.strength, pot: p.potential, formedAt: p.player.formedAt ?? g.userClubId, formedSeason: p.player.formedSeason ?? p.joined ?? g.season, contract: { wage: Math.max(youthWage(g, p), p.player.contract?.wage ?? 0), from: p.player.contract?.from ?? g.season, until: Math.max(p.player.contract?.until ?? 0, g.season + 2) },
    ybase: { attrs: p.attrs, pers: personalityOf(p), history: p.history, origin: p.origin, joined: p.joined } };
  const s: GameState = { ...g, teams: { ...g.teams, [g.userClubId]: { ...team, players: [...team.players, player] } }, youth: { ...y, offers: (y.offers ?? []).filter((o) => o.playerId !== p.player.id), prospects: y.prospects.filter((x) => x !== p) } };
  return { ok: true, state: news(s, `🌱 ${player.name} (${player.age} anos) subiu da base para o elenco principal.`, 'good') };
}

export function releaseProspect(g: GameState, id: string): GameState {
  const y = youthOf(g);
  if (!y.prospects.some((x) => x.player.id === id)) return g;
  return { ...g, youth: { ...y, prospects: y.prospects.filter((x) => x.player.id !== id) } };
}

/** Custo e melhoria da academia (20 níveis, custo com 60% de desconto sobre o triplo da tabela original) e das instalações: veja academy.ts. */
export { academyCost, upgradeAcademy };
