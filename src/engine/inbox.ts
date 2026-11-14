import { creditAccount, openBoletos, createBoleto, hasBank } from './bank';
import { inflate } from './economy';
import { notifyPhone } from './phone';
import { makeRng, type Rng } from './rng';
import { stadiumOf } from './stadium';
import { socialOf, totalFollowers } from './social';
import type { GameState } from './types';

/* =====================================================================
   Mensagens e metas do celular: coisas que só se resolvem pelo celular.
   Patrocínios, coletivas, pedidos da diretoria e da torcida chegam como mensagens com prazo;
   quem não responde perde a oportunidade ou leva um desgaste. Metas semanais pagam em dinheiro.
   ===================================================================== */

export type MsgKind = 'sponsor' | 'clubspons' | 'press' | 'board' | 'fans';
export interface MsgOption { id: string; label: string; hint: string }
export interface InboxMsg {
  id: string; kind: MsgKind; from: string; title: string; body: string;
  season: number; round: number;
  /** Prazo (rodada absoluta); depois disso a mensagem expira. */
  expires: number;
  options: MsgOption[];
  status: 'open' | 'done' | 'expired';
  amount?: number;
  /** O que aconteceu quando foi respondida/expirou. */
  result?: string;
}
export type GoalKind = 'post' | 'win' | 'followers' | 'sellout' | 'reply';
export interface Goal {
  id: string; kind: GoalKind; text: string; target: number;
  /** Valores de partida (para contar só o que acontece depois da meta criada). */
  base: number; startAbs: number; expires: number;
  reward: number; claimed: boolean; expired: boolean;
}
export interface InboxState { msgs: InboxMsg[]; goals: Goal[]; seq: number; answered: number; lastBill: number }

export const ABS = 200;
export const absRound = (g: Pick<GameState, 'season' | 'round'>) => g.season * ABS + g.round;
const MAX_OPEN = 4;
const MAX_KEEP = 30;

export const inboxOf = (g: GameState): InboxState => g.inbox ?? { msgs: [], goals: [], seq: 1, answered: 0, lastBill: 0 };
export const openMessages = (g: GameState) => inboxOf(g).msgs.filter((m) => m.status === 'open');
/** Mensagens que vencem logo (no próximo jogo). */
export const urgentMessages = (g: GameState) => openMessages(g).filter((m) => m.expires - absRound(g) <= 1);
export const goalProgress = (g: GameState, goal: Goal): number => {
  const inbox = inboxOf(g);
  switch (goal.kind) {
    case 'post': return Math.max(0, totalPosts(g) - goal.base);
    case 'followers': return totalFollowers(g);
    case 'reply': return Math.max(0, inbox.answered - goal.base);
    case 'win': return g.results.filter((r) => g.season * ABS + r.round >= goal.startAbs && winnerIs(g, r)).length;
    case 'sellout': return stadiumOf(g).log.filter((r) => r.season * ABS + r.round >= goal.startAbs && r.attendance >= r.capacity * 0.95).length;
  }
};
const totalPosts = (g: GameState) => { const s = socialOf(g); return s.linstagra.posts.length + s.tikiteko.posts.length; };
const winnerIs = (g: GameState, r: GameState['results'][number]) => (r.homeId === g.userClubId && r.homeGoals > r.awayGoals) || (r.awayId === g.userClubId && r.awayGoals > r.homeGoals);
export const goalDone = (g: GameState, goal: Goal) => goalProgress(g, goal) >= goal.target;
export const claimable = (g: GameState) => inboxOf(g).goals.filter((x) => !x.claimed && !x.expired && goalDone(g, x));
/** Quantas coisas esperam por você no celular (mensagens abertas + metas para resgatar). */
export const pendingCount = (g: GameState) => openMessages(g).length + claimable(g).length;

const put = (g: GameState, inbox: InboxState): GameState => ({ ...g, inbox });
const clamp = (v: number) => Math.max(0, Math.min(100, v));
const bump = (g: GameState, d: { team?: number; board?: number; fans?: number }): GameState => ({ ...g, morale: { team: clamp(g.morale.team + (d.team ?? 0)), board: clamp(g.morale.board + (d.board ?? 0)), fans: clamp(g.morale.fans + (d.fans ?? 0)) } });
const rep = (g: GameState) => g.clubs[g.userClubId].reputation;

const BRANDS = ['Supermercados Bom Preço', 'Tênis Veloz', 'Banco Primavera', 'Cerveja Torcida', 'Moto Turbo', 'Energético Gol', 'Planos Vida+', 'Construtora Alicerce'];
const AGENTS = ['Bruno (empresário)', 'Marcos (agente)', 'Renata (assessoria)'];

function mk(g: GameState, inbox: InboxState, m: Omit<InboxMsg, 'id' | 'season' | 'round' | 'status' | 'expires'> & { lifetime: number }): { inbox: InboxState; msg: InboxMsg } {
  const { lifetime, ...rest } = m;
  const msg: InboxMsg = { ...rest, id: `M${inbox.seq}`, season: g.season, round: g.round, status: 'open', expires: absRound(g) + lifetime };
  return { inbox: { ...inbox, seq: inbox.seq + 1, msgs: [msg, ...inbox.msgs].slice(0, MAX_KEEP) }, msg };
}

function newMessage(g: GameState, inbox: InboxState, rng: Rng): { inbox: InboxState; msg: InboxMsg } | null {
  const open = inbox.msgs.filter((m) => m.status === 'open');
  const has = (k: MsgKind) => open.some((m) => m.kind === k);
  const last = g.social?.lastMatch;
  const kinds: MsgKind[] = [];
  if (last && last.round === g.round - 1 && !has('press')) kinds.push('press', 'press', 'press');
  if (!has('sponsor')) kinds.push('sponsor', 'sponsor');
  if (!has('clubspons')) kinds.push('clubspons');
  if (!has('board')) kinds.push('board');
  if (!has('fans')) kinds.push('fans', 'fans');
  if (kinds.length === 0) return null;
  const kind = kinds[Math.floor(rng() * kinds.length)];
  const r = rep(g);
  switch (kind) {
    case 'sponsor': {
      const amount = Math.round(inflate(g, 120_000 + rng() * 280_000) * (0.7 + 0.25 * r) / 1_000) * 1_000;
      const brand = BRANDS[Math.floor(rng() * BRANDS.length)];
      return mk(g, inbox, { kind, from: AGENTS[Math.floor(rng() * AGENTS.length)], title: `Patrocínio pessoal: ${brand}`, body: `A ${brand} quer o seu rosto em uma campanha e oferece ${brl(amount)} (cachê único, na sua conta). Dá para tentar pedir mais, mas eles podem desistir.`, amount, lifetime: 3, options: [{ id: 'accept', label: 'Aceitar', hint: 'Receber o valor agora' }, { id: 'push', label: 'Pedir 40% a mais', hint: 'Pode render mais ou perder o negócio' }, { id: 'decline', label: 'Recusar', hint: 'Sem efeito' }] });
    }
    case 'clubspons': {
      const amount = Math.round(inflate(g, 700_000 + rng() * 1_300_000) * (0.5 + 0.25 * r) / 10_000) * 10_000;
      const brand = BRANDS[Math.floor(rng() * BRANDS.length)];
      return mk(g, inbox, { kind, from: AGENTS[Math.floor(rng() * AGENTS.length)], title: `Anúncio no estádio: ${brand}`, body: `${brand} quer anunciar nas placas do ${g.clubs[g.userClubId].stadium} e paga ${brl(amount)} ao clube. A diretoria deixou a decisão com você.`, amount, lifetime: 4, options: [{ id: 'accept', label: 'Fechar o contrato', hint: 'O dinheiro entra no caixa do clube' }, { id: 'decline', label: 'Recusar', hint: 'Sem efeito' }] });
    }
    case 'press': {
      const res = last!.result;
      const opts: MsgOption[] = res === 'loss'
        ? [{ id: 'own', label: 'Assumir a culpa', hint: 'Torcida e diretoria gostam; o elenco estranha' }, { id: 'ref', label: 'Culpar a arbitragem', hint: 'Torcida e elenco apoiam; a diretoria não gosta' }, { id: 'players', label: 'Criticar o elenco', hint: 'Diretoria aprova; o elenco fica abalado' }]
        : res === 'win'
          ? [{ id: 'praise', label: 'Elogiar o elenco', hint: 'Anima o time' }, { id: 'humble', label: 'Pedir humildade', hint: 'Diretoria aprova; o elenco acha chato' }, { id: 'taunt', label: 'Provocar os rivais', hint: 'Torcida adora; a diretoria se preocupa' }]
          : [{ id: 'praise', label: 'Elogiar o esforço', hint: 'Anima o time' }, { id: 'own', label: 'Cobrar mais do grupo', hint: 'Diretoria aprova' }, { id: 'ref', label: 'Reclamar do árbitro', hint: 'Torcida apoia; diretoria não gosta' }];
      return mk(g, inbox, { kind, from: 'Assessoria de imprensa', title: res === 'loss' ? 'Coletiva após a derrota' : res === 'win' ? 'Coletiva após a vitória' : 'Coletiva após o empate', body: `Os jornalistas esperam a sua resposta pelo grupo da imprensa. O que você diz?`, lifetime: 1, options: opts });
    }
    case 'board':
      return mk(g, inbox, { kind, from: 'Diretoria', title: 'A diretoria quer ouvir você', body: 'O presidente pergunta o que você precisa para o resto da temporada.', lifetime: 4, options: [{ id: 'cash', label: 'Pedir verba para reforços', hint: 'Só funciona se a diretoria confia em você' }, { id: 'time', label: 'Pedir paciência', hint: 'A diretoria fica um pouco mais tranquila' }, { id: 'fine', label: 'Dizer que está tudo bem', hint: 'Sem efeito' }] });
    case 'fans':
      return mk(g, inbox, { kind, from: 'Torcida organizada', title: 'A torcida convida você', body: 'A organizada abriu o treino e quer ouvir o treinador. Responda pelo celular se vai aparecer.', lifetime: 3, options: [{ id: 'go', label: 'Ir ao treino aberto', hint: 'Torcida e elenco ganham ânimo' }, { id: 'video', label: 'Mandar um vídeo', hint: 'Agrada um pouco a torcida' }, { id: 'ignore', label: 'Não ir', hint: 'A torcida se chateia' }] });
  }
}

/** Responde uma mensagem aberta. */
export function answerMessage(g: GameState, msgId: string, optionId: string): GameState {
  const inbox = inboxOf(g);
  const msg = inbox.msgs.find((m) => m.id === msgId);
  if (!msg || msg.status !== 'open' || !msg.options.some((o) => o.id === optionId)) return g;
  const rng = makeRng(g.seed * 71 + g.season * 13 + g.round * 5 + inbox.seq);
  let s = g;
  let result = 'Respondido.';
  const rec = (text: string) => { result = text; };
  switch (msg.kind) {
    case 'sponsor':
      if (optionId === 'accept') { s = creditAccount(s, `Patrocínio — ${msg.title.replace('Patrocínio pessoal: ', '')}`, 'Cachê de campanha', msg.amount!); rec(`Contrato fechado: ${brl(msg.amount!)} na sua conta.`); }
      else if (optionId === 'push') {
        if (rng() < 0.55) { const v = Math.round((msg.amount! * 1.4) / 1_000) * 1_000; s = creditAccount(s, 'Patrocínio negociado', 'Cachê de campanha', v); rec(`Eles toparam! ${brl(v)} na sua conta.`); }
        else rec('O patrocinador desistiu da proposta.');
      } else rec('Você recusou.');
      break;
    case 'clubspons':
      if (optionId === 'accept') { s = { ...s, budgets: { ...s.budgets, [s.userClubId]: s.budgets[s.userClubId] + msg.amount! } }; s = bump(s, { board: 2 }); rec(`Contrato fechado: ${brl(msg.amount!)} no caixa do clube.`); } else rec('Você recusou.');
      break;
    case 'press': {
      const eff: Record<string, { team?: number; board?: number; fans?: number }> = {
        own: { fans: 2, board: 2, team: -1 }, ref: { fans: 3, team: 2, board: -3 }, players: { board: 3, team: -4 },
        praise: { team: 3, fans: 1 }, humble: { board: 2, team: -1 }, taunt: { fans: 3, board: -2 },
      };
      s = bump(s, eff[optionId] ?? {});
      rec('A imprensa registrou a sua resposta.');
      break;
    }
    case 'board':
      if (optionId === 'cash') {
        if (g.morale.board >= 55) { const v = Math.round(inflate(g, 1_500_000 * (0.5 + 0.3 * rep(g))) / 10_000) * 10_000; s = { ...s, budgets: { ...s.budgets, [s.userClubId]: s.budgets[s.userClubId] + v } }; rec(`A diretoria liberou ${brl(v)} para reforços.`); }
        else { s = bump(s, { board: -3 }); rec('A diretoria negou: não confia em você o bastante.'); }
      } else if (optionId === 'time') { s = bump(s, { board: 1 }); rec('A diretoria vai esperar.'); } else rec('Sem efeito.');
      break;
    case 'fans':
      if (optionId === 'go') { s = bump(s, { fans: 4, team: 1 }); rec('A torcida adorou ver você no treino.'); }
      else if (optionId === 'video') { s = bump(s, { fans: 2 }); rec('O vídeo agradou a torcida.'); }
      else { s = bump(s, { fans: -2 }); rec('A torcida ficou chateada.'); }
      break;
  }
  const next: InboxState = { ...inbox, answered: inbox.answered + 1, msgs: inbox.msgs.map((m) => (m.id === msgId ? { ...m, status: 'done', result } : m)) };
  return put(s, next);
}

/** Expira o que passou do prazo, com o desgaste de quem ignorou. */
function expire(g: GameState): GameState {
  const inbox = inboxOf(g);
  const now = absRound(g);
  let s = g;
  const msgs = inbox.msgs.map((m) => {
    if (m.status !== 'open' || m.expires >= now) return m;
    let result = 'Você não respondeu a tempo.';
    switch (m.kind) {
      case 'fans': s = bump(s, { fans: -3 }); result = 'Você ignorou a torcida: ela se chateou.'; break;
      case 'press': s = bump(s, { fans: -1, board: -1 }); result = 'Você não deu entrevista e a imprensa inventou a versão dela.'; break;
      case 'board': s = bump(s, { board: -2 }); result = 'A diretoria ficou sem resposta e achou desinteresse.'; break;
      case 'sponsor': case 'clubspons': result = 'A proposta expirou: o patrocinador fechou com outra pessoa.'; break;
    }
    s = notifyPhone(s, 'mensagens', `Você deixou passar: ${m.title}.`);
    return { ...m, status: 'expired' as const, result };
  });
  return put(s, { ...inbox, msgs });
}

// ---- metas ----
function newGoal(g: GameState, inbox: InboxState, rng: Rng): Goal | null {
  const used = new Set(inbox.goals.filter((x) => !x.claimed && !x.expired).map((x) => x.kind));
  const pool: GoalKind[] = (['post', 'win', 'followers', 'sellout', 'reply'] as GoalKind[]).filter((k) => !used.has(k));
  if (pool.length === 0) return null;
  const kind = pool[Math.floor(rng() * pool.length)];
  const startAbs = absRound(g);
  const f = totalFollowers(g);
  const base = kind === 'post' ? totalPosts(g) : kind === 'reply' ? inbox.answered : g.round;
  const spec: Record<GoalKind, { text: string; target: number; reward: number }> = {
    post: { text: 'Publicar 2 posts nas redes sociais', target: 2, reward: 70_000 },
    win: { text: 'Vencer 2 jogos', target: 2, reward: 120_000 },
    followers: { text: `Chegar a ${Math.round((f * 1.03 + 60) / 10) * 10} seguidores`, target: Math.round((f * 1.03 + 60) / 10) * 10, reward: 90_000 },
    sellout: { text: 'Lotar o estádio (95%) em um jogo em casa', target: 1, reward: 100_000 },
    reply: { text: 'Responder 2 mensagens', target: 2, reward: 50_000 },
  };
  const sp = spec[kind];
  return { id: `G${inbox.seq}-${kind}`, kind, text: sp.text, target: sp.target, base, startAbs, expires: startAbs + 8, reward: Math.round(inflate(g, sp.reward) * (0.7 + 0.2 * rep(g)) / 1_000) * 1_000, claimed: false, expired: false };
}

export function claimGoal(g: GameState, goalId: string): GameState {
  const inbox = inboxOf(g);
  const goal = inbox.goals.find((x) => x.id === goalId);
  if (!goal || goal.claimed || goal.expired || !goalDone(g, goal)) return g;
  const s = creditAccount(g, 'Meta cumprida', goal.text, goal.reward);
  return put(s, { ...inbox, goals: inbox.goals.map((x) => (x.id === goalId ? { ...x, claimed: true } : x)) });
}

/** Cartão e contas do dia a dia: um boleto a cada 8 rodadas, para quem tem conta no banco. */
function bills(g: GameState, inbox: InboxState): GameState {
  if (!hasBank(g) || absRound(g) - inbox.lastBill < 8 || openBoletos(g).length >= 3) return g;
  const amount = Math.round(inflate(g, 18_000 + (g.clubs[g.userClubId].reputation * 6_000)) / 100) * 100;
  const s = createBoleto(g, { merchant: 'Cartão de crédito', description: 'Fatura do cartão', amount, dueInRounds: 4, purpose: { type: 'bill' } });
  return put(s, { ...inboxOf(s), lastBill: absRound(g) });
}

/** Depois de cada rodada: expira o que passou, sorteia mensagens novas, renova metas e gera a fatura. */
export function inboxTick(g: GameState, rng: Rng = makeRng(g.seed * 37 + g.season * 17 + g.round * 3)): GameState {
  if (g.unemployed) return g;
  let s = expire(g);
  let inbox = inboxOf(s);
  // metas vencidas
  const now = absRound(s);
  inbox = { ...inbox, goals: inbox.goals.map((x) => (!x.claimed && !x.expired && x.expires < now && !goalDone(s, x) ? { ...x, expired: true } : x)).slice(0, 12) };
  while (inbox.goals.filter((x) => !x.claimed && !x.expired).length < 3) {
    const goal = newGoal(s, inbox, rng);
    if (!goal) break;
    inbox = { ...inbox, seq: inbox.seq + 1, goals: [goal, ...inbox.goals] };
  }
  const open = inbox.msgs.filter((m) => m.status === 'open').length;
  if (open < MAX_OPEN && s.round >= 2 && rng() < 0.5) {
    const made = newMessage(s, inbox, rng);
    if (made) { inbox = made.inbox; s = put(s, inbox); s = notifyPhone(s, 'mensagens', `${made.msg.from}: ${made.msg.title}`); inbox = inboxOf(s); }
  }
  s = put(s, inbox);
  return bills(s, inboxOf(s));
}

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
