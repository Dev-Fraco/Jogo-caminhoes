import { avgXI, clubProfile, profileCtx, type ClubProfile, type ProfileCtx } from './aiprofile';
import { decideRenewal, importanceOf, WAGE_LIMIT } from './aicontracts';
import { calOf } from './calendar';
import { fmt } from './dealeval';
import { baseWage, payrollOf } from './finance';
import { managed } from './lookup';
import { notifyPhone } from './phone';
import { clamp, hashString } from './rng';
import { autoLineup } from './squad';
import { potentialOf } from './potential';
import type { ContractEvent, GameState, NewsItem, Player } from './types';

/* =====================================================================
   Controle de contratos. Cada clube acompanha os vencimentos com antecedência (no ano final, e antes se o salário estiver muito abaixo da
   importância), negocia com o jogador (que pode aceitar, pedir mais dinheiro, pedir prazo diferente ou recusar) e registra tudo.
   Quem recusa várias vezes e é importante vai para a lista de venda antes de sair de graça.
   ===================================================================== */

const news = (g: GameState, text: string, tone: NewsItem['tone'] = 'info'): GameState => ({ ...g, news: [{ season: g.season, round: g.round, text, tone }, ...g.news].slice(0, 80) });
const today = (g: GameState) => calOf(g).day;
export const MAX_CONTRACT_LOG = 300;
const trait = (id: string, tag: string) => (hashString(`${id}:${tag}`) % 100) / 100;

/** Anos de contrato que restam (incluindo a temporada atual). null = jogador sem contrato registrado. */
export const yearsLeft = (g: Pick<GameState, 'season'>, p: Player): number | null => (p.contract ? p.contract.until - g.season + 1 : null);
export type ContractState = 'ok' | 'vence-em-2-anos' | 'ultimo-ano' | 'vencido' | 'sem-contrato';
export const stateOf = (g: Pick<GameState, 'season'>, p: Player): ContractState => { const y = yearsLeft(g, p); return y === null ? 'sem-contrato' : y <= 0 ? 'vencido' : y === 1 ? 'ultimo-ano' : y === 2 ? 'vence-em-2-anos' : 'ok'; };

/** Registra uma mudança contratual no histórico. */
export function logContract(g: GameState, e: Omit<ContractEvent, 'day'>): GameState {
  return { ...g, contractLog: [{ day: today(g), ...e }, ...(g.contractLog ?? [])].slice(0, MAX_CONTRACT_LOG) };
}

/** Salário que o jogador considera justo no clube: pesa importância, idade, potencial e a reputação do clube. */
export function demandOf(g: GameState, clubId: string, p: Player, ctx: ProfileCtx): { wage: number; importance: number } {
  const imp = importanceOf(g, clubId, p, ctx).value;
  const fair = baseWage(g, clubId, { ...p, contract: undefined });
  const level = ctx.xi.get(clubId) ?? avgXI(g.teams[clubId]);
  const mult = (imp >= 1 ? 1.15 : imp >= 0.75 ? 1.05 : imp >= 0.4 ? 0.97 : 0.9)
    + (p.age <= 23 ? clamp((potentialOf(p) - p.strength) / 200, 0, 0.12) : 0)                   // potencial valoriza o jovem
    + (p.strength >= level + 8 && (g.clubs[clubId]?.reputation ?? 2) <= 2 ? 0.1 : 0);           // craque em clube pequeno pede mais
  const w = clamp(Math.round(fair * mult / 1_000) * 1_000, 6_000, Math.round(fair * 2.2));      // nunca fora da economia do jogo
  return { wage: w, importance: imp };
}

export interface RenewalAnswer { action: 'aceitar' | 'pedir-aumento' | 'pedir-prazo' | 'recusar'; wage?: number; years?: number; note: string }

/** Prazo que o jogador prefere: jovens querem contrato longo; veteranos, curto. */
export const preferredYears = (p: Player): [number, number] => (p.age <= 22 ? [3, 5] : p.age <= 27 ? [2, 5] : p.age <= 31 ? [1, 3] : [1, 2]);

/** Resposta do jogador à proposta de renovação. */
export function renewalAnswer(g: GameState, clubId: string, p: Player, offer: { wage: number; years: number }, ctx: ProfileCtx = profileCtx(g)): RenewalAnswer {
  const club = g.clubs[clubId]?.name ?? 'o clube';
  if (p.age >= 37) return { action: 'recusar', note: `${p.name} quer se aposentar e não renova.` };
  const { wage: demand, importance } = demandOf(g, clubId, p, ctx);
  const level = ctx.xi.get(clubId) ?? avgXI(g.teams[clubId]);
  const team = g.teams[clubId];
  const xi = new Set(autoLineup(team.players, team.formation));
  const mood = g.mood?.[p.id];
  const rep = g.clubs[clubId]?.reputation ?? 2;
  // motivos para não querer continuar
  let why = '';
  if (mood?.want === 'sair' && mood.level >= 2) why = 'está insatisfeito e quer sair';
  else if (!xi.has(p.id) && p.strength >= level - 2 && p.age >= 22 && importance < 0.75) why = 'quer mais oportunidades de jogar';
  else if (p.strength >= level + 10 && rep <= 2 && trait(p.id, `amb${g.season}`) < 0.55) why = 'quer disputar competições maiores';
  else if (p.strength >= level + 6 && (g.clubs[clubId]?.reputation ?? 2) <= 3 && trait(p.id, `maior${g.season}`) < 0.2) why = 'tem interesse de clubes maiores';
  const loyal = trait(p.id, 'lealdade');
  if (why && loyal > 0.7 && !mood) why = ''; // jogador leal fica, a não ser que esteja realmente insatisfeito
  if (why) return { action: 'recusar', note: `${p.name} recusou renovar com o ${club}: ${why}.` };
  const [ymin, ymax] = preferredYears(p);
  if (offer.wage < demand * 0.97) return { action: 'pedir-aumento', wage: demand, years: clamp(offer.years, ymin, ymax), note: `${p.name} quer ${fmt(demand)} por ano para renovar.` };
  if (offer.years < ymin || offer.years > ymax) return { action: 'pedir-prazo', wage: offer.wage, years: clamp(offer.years, ymin, ymax), note: `${p.name} prefere um contrato de ${ymin} a ${ymax} anos.` };
  return { action: 'aceitar', note: `${p.name} aceitou renovar com o ${club} por ${offer.years} ${offer.years === 1 ? 'ano' : 'anos'}.` };
}

/** Aplica o novo contrato ao jogador (substitui o antigo: o clube nunca paga dois salários) e registra. */
export function applyContract(g: GameState, clubId: string, playerId: string, wage: number, years: number, kind: ContractEvent['kind'] = 'renovou', note = ''): GameState {
  const t = g.teams[clubId];
  const p = t?.players.find((x) => x.id === playerId);
  if (!p || !(wage > 0) || years < 1) return g;
  const from = p.contract?.wage;
  const until = Math.max(g.season, p.contract?.until ?? g.season) + years;
  const players = t.players.map((x) => (x.id === playerId ? { ...x, contract: { wage: Math.round(wage), until, from: g.season } } : x));
  let s: GameState = { ...g, teams: { ...g.teams, [clubId]: { ...t, players } }, renewTalks: { ...(g.renewTalks ?? {}), [playerId]: { ...(g.renewTalks?.[playerId] ?? { day: today(g), tries: 0, refusals: 0 }), day: today(g), done: true } } };
  s = logContract(s, { playerId, playerName: p.name, clubId, kind: from === undefined ? 'novo' : wage > from ? 'aumento' : wage < from ? 'reducao' : kind, wageFrom: from, wageTo: Math.round(wage), until, note: note || `${years} ${years === 1 ? 'ano' : 'anos'}` });
  return s;
}

export interface ContractAlert { player: Player; state: ContractState; years: number | null; importance: number; wage: number; fair: number; underpaid: boolean; refusals: number }

/** Alertas de contrato de um clube: quem está no último ano (ou nos dois últimos, se estiver muito mal pago) e quem recusou renovar. */
export function contractAlerts(g: GameState, clubId: string): ContractAlert[] {
  const ctx = profileCtx(g);
  const out: ContractAlert[] = [];
  const loaned = new Set([...(g.loans ?? []).map((l) => l.playerId), ...(g.loansIn ?? []).map((l) => l.playerId)]);
  for (const p of g.teams[clubId]?.players ?? []) {
    if (!p.contract || loaned.has(p.id)) continue;
    const st = stateOf(g, p);
    const { wage: fair, importance } = demandOf(g, clubId, p, ctx);
    const underpaid = importance >= 0.75 && p.contract.wage < fair * 0.7;
    if (st === 'ultimo-ano' || st === 'vencido' || (st === 'vence-em-2-anos' && (importance >= 0.75 || underpaid)) || underpaid) out.push({ player: p, state: st, years: yearsLeft(g, p), importance, wage: p.contract.wage, fair, underpaid, refusals: g.renewTalks?.[p.id]?.refusals ?? 0 });
  }
  return out.sort((a, b) => b.importance - a.importance || (a.years ?? 9) - (b.years ?? 9));
}

/** Margem de folha para um clube pagar `wage` a um jogador (R$/ano) sem passar do limite do porte. */
const roomFor = (g: GameState, clubId: string, prof: ClubProfile, current: number) => prof.revenue * WAGE_LIMIT[prof.tier] - (payrollOf(g, clubId) - current);

/**
 * Negociação de renovação dos clubes da IA (os que estão na vez), com antecedência: no ano final do contrato ou quando um jogador importante ganha bem
 * abaixo do justo. O clube só tenta renovar quem vale a pena (decideRenewal) e dentro da folha; o jogador responde (aceita, pede mais, pede prazo ou recusa).
 * Quem recusa renovar e é importante vai para a lista de venda (para não sair de graça). Cada jogador é tratado uma vez por temporada.
 */
export function aiRenewTick(g: GameState, due: string[]): GameState {
  let s = g;
  const ctx = profileCtx(s);
  const day = today(s);
  const loaned = new Set([...(s.loans ?? []).map((l) => l.playerId), ...(s.aiLoans ?? []).map((l) => l.playerId)]);
  for (const id of due) {
    if (managed(s, id)) continue;
    const prof = clubProfile(s, id, ctx);
    const team = s.teams[id];
    for (const p of team.players) {
      if (!p.contract || loaned.has(p.id)) continue;
      const talk = s.renewTalks?.[p.id];
      if (talk && (talk.done || day - talk.day < 30) && talk.day >= day - 330) continue;      // já resolvido ou conversou há pouco
      const st = stateOf(s, p);
      const { wage: fair, importance } = demandOf(s, id, p, ctx);
      const underpaid = importance >= 0.75 && p.contract.wage < fair * 0.7;
      if (!(st === 'ultimo-ano' || (st === 'vence-em-2-anos' && underpaid))) continue;
      const cur = s.teams[id].players.find((x) => x.id === p.id)!;
      const d = decideRenewal(s, id, cur, prof, ctx, payrollOf(s, id));
      const tk = { day, tries: (talk?.tries ?? 0) + 1, refusals: talk?.refusals ?? 0 };
      if (!d.renew) { // o clube não quer renovar (não compensa): o contrato segue até o fim
        s = { ...s, renewTalks: { ...(s.renewTalks ?? {}), [p.id]: { ...tk, done: true } } };
        if (importance >= 0.4) s = logContract(s, { playerId: p.id, playerName: p.name, clubId: id, kind: 'recusou', note: `o clube não renova (${d.reason})` });
        continue;
      }
      let offer = { wage: d.wage, years: d.years };
      let finished = false;
      for (let round = 0; round < 3 && !finished; round++) {
        const a = renewalAnswer(s, id, p, offer, ctx);
        if (a.action === 'aceitar') { s = applyContract(s, id, p.id, offer.wage, offer.years, 'renovou', `renovação antecipada (${d.reason})`); if (p.strength >= 72) s = news(s, `✍️ ${s.clubs[id].name} renova com ${p.name} (overall ${p.strength}) por ${offer.years} ${offer.years === 1 ? 'ano' : 'anos'}.`); finished = true; }
        else if (a.action === 'pedir-prazo') offer = { ...offer, years: a.years! };
        else if (a.action === 'pedir-aumento') {
          if (a.wage! <= roomFor(s, id, prof, p.contract.wage) && a.wage! <= p.contract.wage * 3 + 1_000_000) offer = { wage: a.wage!, years: a.years ?? offer.years };
          else { s = refuse(s, id, p, tk, importance, `o clube não pode pagar ${fmt(a.wage!)}`); finished = true; }
        } else { s = refuse(s, id, p, tk, importance, a.note.replace(/^.*recusou renovar com o [^:]+: /, '')); finished = true; }
      }
      if (!finished) s = refuse(s, id, p, tk, importance, 'sem acordo depois de várias propostas');
    }
  }
  return s;
}

/** Registra a recusa de renovação; jogador importante que recusa vai para a lista de venda para o clube não perdê-lo de graça. */
function refuse(g: GameState, clubId: string, p: Player, tk: { day: number; tries: number; refusals: number }, importance: number, why: string): GameState {
  let s: GameState = { ...g, renewTalks: { ...(g.renewTalks ?? {}), [p.id]: { ...tk, refusals: tk.refusals + 1, done: tk.refusals + 1 >= 2 } } };
  s = logContract(s, { playerId: p.id, playerName: p.name, clubId, kind: 'recusou', note: why });
  if (importance >= 0.75 && !s.listed?.[p.id]) { s = { ...s, listed: { ...(s.listed ?? {}), [p.id]: { clubId, day: today(s), reason: `recusou renovar (${why})` } } }; if (p.strength >= 70) s = news(s, `🙅 ${p.name} (overall ${p.strength}) recusa renovar com o ${s.clubs[clubId].name} e é colocado à venda.`); }
  return s;
}

/** Seus alertas: avisa (uma vez por temporada) os contratos que entram no último ano e os de jogadores muito mal pagos. */
export function userContractTick(g: GameState): GameState {
  if (g.unemployed) return g;
  let s = g;
  let said = 0;
  for (const a of contractAlerts(g, g.userClubId)) {
    const talk = s.renewTalks?.[a.player.id];
    if (said >= 3 || (talk && talk.day >= calOf(s).day - 330 && talk.tries > 0)) continue;
    if (a.state !== 'ultimo-ano' && !a.underpaid) continue;
    said++;
    s = { ...s, renewTalks: { ...(s.renewTalks ?? {}), [a.player.id]: { day: today(s), tries: 1, refusals: talk?.refusals ?? 0 } } };
    s = notifyPhone(news(s, a.state === 'ultimo-ano' ? `📄 O contrato de ${a.player.name} (overall ${a.player.strength}) vence ao fim desta temporada. Negocie a renovação antes de perdê-lo de graça.` : `💬 ${a.player.name} ganha bem menos do que vale (${fmt(a.wage)} contra ${fmt(a.fair)} por ano). Considere um aumento.`, 'bad'), 'noticias', `Contrato de ${a.player.name} precisa de atenção.`);
  }
  return s;
}

/** Você propõe a renovação a um jogador seu. O jogador responde (aceita, pede mais, pede outro prazo ou recusa). */
export function renewOffer(g: GameState, playerId: string, wage: number, years: number): { state: GameState; ok: boolean; text: string; counter?: { wage?: number; years?: number } } {
  const p = g.teams[g.userClubId]?.players.find((x) => x.id === playerId);
  if (!p || g.unemployed) return { state: g, ok: false, text: 'Jogador não encontrado.' };
  if (!(wage > 0) || years < 1 || years > 5) return { state: g, ok: false, text: 'Proposta inválida: salário positivo e contrato de 1 a 5 anos.' };
  const a = renewalAnswer(g, g.userClubId, p, { wage, years });
  if (a.action === 'aceitar') {
    const s = applyContract(g, g.userClubId, playerId, wage, years, 'renovou', 'renovação aceita');
    return { state: notifyPhone(news(s, `📄 ${p.name} renovou por ${years} ${years === 1 ? 'ano' : 'anos'} (${fmt(wage)} por ano).`, 'good'), 'noticias', `${p.name} renovou o contrato.`), ok: true, text: a.note };
  }
  if (a.action === 'recusar') {
    const talk = g.renewTalks?.[playerId];
    const s = logContract({ ...g, renewTalks: { ...(g.renewTalks ?? {}), [playerId]: { day: today(g), tries: (talk?.tries ?? 0) + 1, refusals: (talk?.refusals ?? 0) + 1 } } }, { playerId, playerName: p.name, clubId: g.userClubId, kind: 'recusou', note: a.note });
    return { state: s, ok: false, text: a.note };
  }
  return { state: g, ok: false, text: a.note, counter: { wage: a.action === 'pedir-aumento' ? a.wage : undefined, years: a.years } };
}
