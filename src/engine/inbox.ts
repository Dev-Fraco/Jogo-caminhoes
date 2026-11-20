import { creditAccount, openBoletos, createBoleto, hasBank } from './bank';
import { bumpOverall, clubQuality, coachMonthly, coachOverallInt, PAY_CONFIG, TIER_LABEL } from './coachpay';
import { declineRenewal } from './jobs';
import { inflate } from './economy';
import { notifyPhone } from './phone';
import { makeRng, type Rng } from './rng';
import { coachMoneyOf } from './finance';
import { teamRatings } from './squad';
import { socialOf, totalFollowers } from './social';
import type { GameState } from './types';

/* =====================================================================
   Mensagens e metas do celular: coisas que só se resolvem pelo celular.
   Patrocínios, coletivas, pedidos da diretoria e da torcida chegam como mensagens com prazo;
   quem não responde perde a oportunidade ou leva um desgaste. Metas semanais pagam em dinheiro.
   ===================================================================== */

export type MsgKind = 'sponsor' | 'clubspons' | 'press' | 'board' | 'fans' | 'contract' | 'tier';
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
export type GoalKind =
  | 'post' | 'win' | 'followers' | 'reply'                                                   // as 4 metas originais
  | 'winHome' | 'winAway' | 'winStreak' | 'unbeaten' | 'goals' | 'cleanSheets' | 'bigWin' | 'scoreStreak' | 'braces' | 'stingy' | 'points' | 'beatBigger' | 'winScoring2' | 'homeUnbeaten'
  | 'buy' | 'sell' | 'ovr' | 'coachOvr' | 'postInsta' | 'postTik' | 'balance' | 'clubCash' | 'youthTalents' | 'youthSquad' | 'moraleTeam' | 'moraleFans';
export type GoalTier = 'facil' | 'medio' | 'dificil';
export interface Goal {
  id: string; kind: GoalKind; text: string; target: number;
  /** Valores de partida (para contar só o que acontece depois da meta criada). */
  base: number; startAbs: number; expires: number;
  reward: number; claimed: boolean; expired: boolean;
}
export interface InboxState { msgs: InboxMsg[]; goals: Goal[]; seq: number; answered: number; lastBill: number; /** quantas vezes cada meta já foi cumprida (cada repetição fica mais difícil) */ claims?: Record<string, number> }
/** Sempre existem 30 metas abertas, todas diferentes. */
export const GOALS_OPEN = 30;

export const ABS = 200;
export const absRound = (g: Pick<GameState, 'season' | 'round'>) => g.season * ABS + g.round;
const MAX_OPEN = 4;
const MAX_KEEP = 30;

/** Metas de lotar o estádio (de versões antigas) foram removidas: somem de saves antigos. */
export const inboxOf = (g: GameState): InboxState => {
  const i = g.inbox ?? { msgs: [], goals: [], seq: 1, answered: 0, lastBill: 0 };
  return i.goals.some((x) => (x.kind as string) === 'sellout') ? { ...i, goals: i.goals.filter((x) => (x.kind as string) !== 'sellout') } : i;
};
export const openMessages = (g: GameState) => inboxOf(g).msgs.filter((m) => m.status === 'open');
/** Mensagens que vencem logo (no próximo jogo). */
export const urgentMessages = (g: GameState) => openMessages(g).filter((m) => m.expires - absRound(g) <= 1);
/** Jogos do seu clube na temporada atual a partir do começo da meta (em ordem), do ponto de vista do seu clube. */
interface My { home: boolean; gf: number; ga: number; opp: string }
const myGames = (g: GameState, startAbs: number): My[] => g.results
  .filter((r) => (r.homeId === g.userClubId || r.awayId === g.userClubId) && g.season * ABS + r.round >= startAbs)
  .sort((a, b) => a.round - b.round)
  .map((r) => (r.homeId === g.userClubId ? { home: true, gf: r.homeGoals, ga: r.awayGoals, opp: r.awayId } : { home: false, gf: r.awayGoals, ga: r.homeGoals, opp: r.homeId }));
/** Maior sequência seguida de jogos que cumprem a condição. */
const bestRun = (list: My[], ok: (m: My) => boolean) => { let best = 0, cur = 0; for (const m of list) { cur = ok(m) ? cur + 1 : 0; best = Math.max(best, cur); } return best; };
const count = (list: My[], ok: (m: My) => boolean) => list.filter(ok).length;
const won = (m: My) => m.gf > m.ga;

const totalPosts = (g: GameState) => { const s = socialOf(g); return s.linstagra.posts.length + s.tikiteko.posts.length; };
const moneyNow = (g: GameState) => coachMoneyOf(g);
const clubCash = (g: GameState) => g.budgets[g.userClubId] ?? 0;
const ovrNow = (g: GameState) => { const t = g.teams[g.userClubId]; return t ? teamRatings(t).overall : 0; };
const talents = (g: GameState) => (g.youth?.prospects ?? []).filter((p) => !p.loanedTo && p.player.strength >= 60).length;
const youthSize = (g: GameState) => (g.youth?.prospects ?? []).length;
const transfersSince = (g: GameState, kind: 'buy' | 'sale', startAbs: number) => g.transfers.filter((t) => t.kind === kind && t.season * ABS + t.round >= startAbs).length;

interface Spec {
  tier: GoalTier;
  /** rodadas até a meta vencer */ window: number;
  /** recompensa-base (R$, antes da inflação e da reputação) */ reward: number;
  /** texto, meta (quantidade a alcançar) e valor de partida (para metas de "subir") */ make: (g: GameState, inbox: InboxState, k: number) => { text: string; target: number; base: number };
  progress: (g: GameState, goal: Goal) => number;
  eligible?: (g: GameState) => boolean;
}
const sc = (n: number, k: number) => Math.max(1, Math.round(n * k));
const delta = (now: number, goal: Goal) => Math.max(0, now - goal.base);

/** As 30 metas. Mais difícil = prazo curto e quantidade alta; cada vez que você cumpre uma, a próxima versão dela sobe de nível. */
export const GOAL_SPECS: Record<GoalKind, Spec> = {
  win: { tier: 'medio', window: 10, reward: 18_000, make: (_g, _i, k) => ({ text: `Vencer ${sc(4, k)} jogos`, target: sc(4, k), base: 0 }), progress: (g, x) => count(myGames(g, x.startAbs), won) },
  winHome: { tier: 'medio', window: 12, reward: 16_000, make: (_g, _i, k) => ({ text: `Vencer ${sc(3, k)} jogos em casa`, target: sc(3, k), base: 0 }), progress: (g, x) => count(myGames(g, x.startAbs), (m) => m.home && won(m)) },
  winAway: { tier: 'dificil', window: 12, reward: 28_000, make: (_g, _i, k) => ({ text: `Vencer ${sc(2, k)} jogos fora de casa`, target: sc(2, k), base: 0 }), progress: (g, x) => count(myGames(g, x.startAbs), (m) => !m.home && won(m)) },
  winStreak: { tier: 'dificil', window: 12, reward: 32_000, make: (_g, _i, k) => ({ text: `Vencer ${sc(3, k)} jogos seguidos`, target: sc(3, k), base: 0 }), progress: (g, x) => bestRun(myGames(g, x.startAbs), won) },
  unbeaten: { tier: 'medio', window: 12, reward: 20_000, make: (_g, _i, k) => ({ text: `Ficar ${sc(6, k)} jogos seguidos sem perder`, target: sc(6, k), base: 0 }), progress: (g, x) => bestRun(myGames(g, x.startAbs), (m) => m.gf >= m.ga) },
  goals: { tier: 'medio', window: 10, reward: 14_000, make: (_g, _i, k) => ({ text: `Marcar ${sc(12, k)} gols`, target: sc(12, k), base: 0 }), progress: (g, x) => myGames(g, x.startAbs).reduce((t, m) => t + m.gf, 0) },
  cleanSheets: { tier: 'dificil', window: 12, reward: 26_000, make: (_g, _i, k) => ({ text: `Não sofrer gols em ${sc(3, k)} jogos`, target: sc(3, k), base: 0 }), progress: (g, x) => count(myGames(g, x.startAbs), (m) => m.ga === 0) },
  bigWin: { tier: 'dificil', window: 12, reward: 30_000, make: (_g, _i, k) => ({ text: `Vencer por 3 gols ou mais de diferença ${sc(1, k) === 1 ? '1 vez' : `${sc(1, k)} vezes`}`, target: sc(1, k), base: 0 }), progress: (g, x) => count(myGames(g, x.startAbs), (m) => m.gf - m.ga >= 3) },
  scoreStreak: { tier: 'medio', window: 12, reward: 18_000, make: (_g, _i, k) => ({ text: `Marcar gol em ${sc(5, k)} jogos seguidos`, target: sc(5, k), base: 0 }), progress: (g, x) => bestRun(myGames(g, x.startAbs), (m) => m.gf > 0) },
  braces: { tier: 'dificil', window: 14, reward: 30_000, make: (_g, _i, k) => ({ text: `Marcar 3 gols ou mais em um jogo, ${sc(2, k)} vezes`, target: sc(2, k), base: 0 }), progress: (g, x) => count(myGames(g, x.startAbs), (m) => m.gf >= 3) },
  stingy: { tier: 'dificil', window: 14, reward: 28_000, make: (_g, _i, k) => ({ text: `Sofrer no máximo 1 gol em ${sc(5, k)} jogos seguidos`, target: sc(5, k), base: 0 }), progress: (g, x) => bestRun(myGames(g, x.startAbs), (m) => m.ga <= 1) },
  points: { tier: 'medio', window: 10, reward: 18_000, make: (_g, _i, k) => ({ text: `Somar ${sc(12, k)} pontos`, target: sc(12, k), base: 0 }), progress: (g, x) => myGames(g, x.startAbs).reduce((t, m) => t + (m.gf > m.ga ? 3 : m.gf === m.ga ? 1 : 0), 0) },
  beatBigger: { tier: 'dificil', window: 14, reward: 32_000, make: (_g, _i, k) => ({ text: `Vencer ${sc(2, k)} clube(s) de reputação maior que o seu`, target: sc(2, k), base: 0 }), progress: (g, x) => count(myGames(g, x.startAbs), (m) => won(m) && (g.clubs[m.opp]?.reputation ?? 0) > g.clubs[g.userClubId].reputation) },
  winScoring2: { tier: 'medio', window: 12, reward: 18_000, make: (_g, _i, k) => ({ text: `Vencer ${sc(3, k)} jogos marcando 2 gols ou mais`, target: sc(3, k), base: 0 }), progress: (g, x) => count(myGames(g, x.startAbs), (m) => won(m) && m.gf >= 2) },
  homeUnbeaten: { tier: 'medio', window: 14, reward: 18_000, make: (_g, _i, k) => ({ text: `Ficar ${sc(4, k)} jogos em casa sem perder`, target: sc(4, k), base: 0 }), progress: (g, x) => bestRun(myGames(g, x.startAbs).filter((m) => m.home), (m) => m.gf >= m.ga) },
  buy: { tier: 'medio', window: 16, reward: 16_000, make: (_g, _i, k) => ({ text: `Contratar ${sc(1, k)} jogador${sc(1, k) > 1 ? 'es' : ''}`, target: sc(1, k), base: 0 }), progress: (g, x) => transfersSince(g, 'buy', x.startAbs) },
  sell: { tier: 'medio', window: 16, reward: 16_000, make: (_g, _i, k) => ({ text: `Vender ${sc(1, k)} jogador${sc(1, k) > 1 ? 'es' : ''}`, target: sc(1, k), base: 0 }), progress: (g, x) => transfersSince(g, 'sale', x.startAbs) },
  ovr: { tier: 'dificil', window: 20, reward: 34_000, make: (g, _i, k) => ({ text: `Subir o overall do time titular em ${sc(2, k)} pontos`, target: sc(2, k), base: ovrNow(g) }), progress: (g, x) => delta(ovrNow(g), x) },
  coachOvr: { tier: 'dificil', window: 24, reward: 34_000, make: (g, _i, k) => ({ text: `Subir seu overall de treinador em ${sc(1, k)} ponto${sc(1, k) > 1 ? 's' : ''}`, target: sc(1, k), base: coachOverallInt(g) }), progress: (g, x) => delta(coachOverallInt(g), x) },
  post: { tier: 'facil', window: 10, reward: 10_000, make: (g, _i, k) => ({ text: `Publicar ${sc(4, k)} posts nas redes sociais`, target: sc(4, k), base: totalPosts(g) }), progress: (g, x) => Math.max(0, totalPosts(g) - x.base) },
  postInsta: { tier: 'facil', window: 10, reward: 10_000, make: (g, _i, k) => ({ text: `Publicar ${sc(3, k)} posts no Linstagra`, target: sc(3, k), base: socialOf(g).linstagra.posts.length }), progress: (g, x) => Math.max(0, socialOf(g).linstagra.posts.length - x.base) },
  postTik: { tier: 'facil', window: 10, reward: 10_000, make: (g, _i, k) => ({ text: `Publicar ${sc(3, k)} vídeos no Tikiteko`, target: sc(3, k), base: socialOf(g).tikiteko.posts.length }), progress: (g, x) => Math.max(0, socialOf(g).tikiteko.posts.length - x.base) },
  followers: { tier: 'medio', window: 12, reward: 16_000, make: (g, _i, k) => { const f = totalFollowers(g), t = Math.round((f * (1 + 0.08 * k) + 200) / 10) * 10; return { text: `Chegar a ${t.toLocaleString('pt-BR')} seguidores`, target: t, base: f }; }, progress: (g) => totalFollowers(g) },
  reply: { tier: 'facil', window: 10, reward: 10_000, make: (_g, i, k) => ({ text: `Responder ${sc(4, k)} mensagens`, target: sc(4, k), base: i.answered }), progress: (g, x) => Math.max(0, inboxOf(g).answered - x.base) },
  balance: { tier: 'medio', window: 16, reward: 18_000, make: (g, _i, k) => { const d = Math.max(50_000, Math.round((moneyNow(g) * 0.2 * k) / 10_000) * 10_000); return { text: `Aumentar a sua conta pessoal em ${brl(d)}`, target: d, base: moneyNow(g) }; }, progress: (g, x) => delta(moneyNow(g), x) },
  clubCash: { tier: 'dificil', window: 16, reward: 30_000, make: (g, _i, k) => { const d = Math.max(500_000, Math.round((clubCash(g) * 0.08 * k) / 100_000) * 100_000); return { text: `Aumentar o caixa do clube em ${brl(d)}`, target: d, base: clubCash(g) }; }, progress: (g, x) => delta(clubCash(g), x) },
  youthTalents: { tier: 'medio', window: 20, reward: 16_000, make: (g, _i, k) => ({ text: `Ter ${sc(1, k)} jovem(ns) a mais na base com overall 60 ou mais`, target: sc(1, k), base: talents(g) }), progress: (g, x) => delta(talents(g), x) },
  youthSquad: { tier: 'medio', window: 20, reward: 14_000, make: (g, _i, k) => ({ text: `Trazer ${sc(3, k)} jovens novos para a base`, target: sc(3, k), base: youthSize(g) }), progress: (g, x) => delta(youthSize(g), x) },
  moraleTeam: { tier: 'medio', window: 12, reward: 16_000, make: (g, _i, k) => ({ text: `Subir o humor da equipe em ${sc(8, k)} pontos`, target: sc(8, k), base: g.morale.team }), progress: (g, x) => delta(g.morale.team, x), eligible: (g) => g.morale.team <= 85 },
  moraleFans: { tier: 'medio', window: 12, reward: 16_000, make: (g, _i, k) => ({ text: `Subir o humor da torcida em ${sc(8, k)} pontos`, target: sc(8, k), base: g.morale.fans }), progress: (g, x) => delta(g.morale.fans, x), eligible: (g) => g.morale.fans <= 85 },
};
export const GOAL_KINDS = Object.keys(GOAL_SPECS) as GoalKind[];
export const TIER_LABEL_GOAL: Record<GoalTier, string> = { facil: 'Fácil', medio: 'Média', dificil: 'Difícil' };
export const goalProgress = (g: GameState, goal: Goal): number => GOAL_SPECS[goal.kind]?.progress(g, goal) ?? 0;
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
    case 'tier': return null;
    case 'contract': return null; // só é criada no início da temporada (postContractOffer)
    case 'fans':
      return mk(g, inbox, { kind, from: 'Torcida organizada', title: 'A torcida convida você', body: 'A organizada abriu o treino e quer ouvir o treinador. Responda pelo celular se vai aparecer.', lifetime: 3, options: [{ id: 'go', label: 'Ir ao treino aberto', hint: 'Torcida e elenco ganham ânimo' }, { id: 'video', label: 'Mandar um vídeo', hint: 'Agrada um pouco a torcida' }, { id: 'ignore', label: 'Não ir', hint: 'A torcida se chateia' }] });
  }
}

/**
 * Proposta de contrato do início da temporada (uma única vez por temporada: o estado fica salvo em `coachOffer`).
 * O salário oferecido é o vigente, calculado pela qualidade do clube e pelo overall do treinador, dentro da faixa da divisão.
 */
export function postContractOffer(g: GameState): GameState {
  if (g.unemployed || g.observer) return g;
  if (g.coachOffer && g.coachOffer.season === g.season && g.coachOffer.clubId === g.userClubId) return g; // já houve proposta nesta temporada
  const q = clubQuality(g, g.userClubId);
  const club = g.clubs[g.userClubId];
  const salary = coachMonthly(g);
  const inbox = inboxOf(g);
  const { inbox: ib, msg } = mk(g, inbox, {
    kind: 'contract', from: `Diretoria · ${club.name}`, title: 'PROPOSTA DE RENOVAÇÃO DE CONTRATO',
    body: `Clube: ${club.name}\nCompetição: ${TIER_LABEL[q.tier]}\nOverall do elenco: ${Math.round(q.ovr)}\nReputação: ${q.rep}\nOverall do treinador: ${coachOverallInt(g)}\n\nSalário oferecido: ${brl(salary)} por mês.\n\nA diretoria deseja renovar seu contrato para a temporada ${g.season}. Se recusar, você deixa o clube e passa a ouvir propostas de outros.`,
    lifetime: 150, amount: salary,
    options: [{ id: 'accept', label: 'Aceitar proposta', hint: 'Fica no clube' }, { id: 'refuse', label: 'Recusar proposta', hint: 'Deixa o clube e procura outras oportunidades' }],
  });
  const s: GameState = { ...put(g, ib), coachOffer: { season: g.season, clubId: g.userClubId, status: 'pendente', salary, msgId: msg.id } };
  return notifyPhone(s, 'mensagens', `${club.name} enviou a proposta de renovação do seu contrato.`);
}

/** Aviso de promoção ou rebaixamento (faixa salarial nova). Informativo: um toque em "Entendi". */
export function postTierMessage(g: GameState, title: string, body: string): GameState {
  const { inbox, msg } = mk(g, inboxOf(g), { kind: 'tier', from: `Diretoria · ${g.clubs[g.userClubId].name}`, title, body, lifetime: 150, options: [{ id: 'ok', label: 'Entendi', hint: 'Fechar o aviso' }] });
  void msg;
  return notifyPhone(put(g, inbox), 'mensagens', `${title}: veja o novo limite salarial.`);
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
      s = bumpOverall(s, PAY_CONFIG.evolve.interview); // só a entrevista respondida rende evolução (a ignorada não)
      rec('A imprensa registrou a sua resposta.');
      break;
    }
    case 'board':
      if (optionId === 'cash') {
        if (g.morale.board >= 55) { const v = Math.round(inflate(g, 1_500_000 * (0.5 + 0.3 * rep(g))) / 10_000) * 10_000; s = { ...s, budgets: { ...s.budgets, [s.userClubId]: s.budgets[s.userClubId] + v } }; rec(`A diretoria liberou ${brl(v)} para reforços.`); }
        else { s = bump(s, { board: -3 }); rec('A diretoria negou: não confia em você o bastante.'); }
      } else if (optionId === 'time') { s = bump(s, { board: 1 }); rec('A diretoria vai esperar.'); } else rec('Sem efeito.');
      break;
    case 'tier': rec('Aviso lido.'); break;
    case 'contract':
      if (optionId === 'accept') {
        s = { ...s, coachOffer: s.coachOffer ? { ...s.coachOffer, status: 'aceita' } : s.coachOffer };
        s = bump(s, { board: 2 });
        rec(`Contrato renovado para a temporada ${g.season}: ${brl(msg.amount!)} por mês (o valor acompanha a situação do clube, dentro do limite da divisão).`);
      } else {
        s = { ...s, coachOffer: s.coachOffer ? { ...s.coachOffer, status: 'recusada' } : s.coachOffer };
        s = declineRenewal(s);
        rec('Você recusou a renovação e deixou o clube. Agora ouça as propostas de outros clubes.');
      }
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
      case 'tier': result = 'Aviso encerrado.'; break;
      case 'contract': result = 'A proposta ficou sem resposta: você segue no clube com o salário vigente.'; s = { ...s, coachOffer: s.coachOffer && s.coachOffer.status === 'pendente' ? { ...s.coachOffer, status: 'expirada' } : s.coachOffer }; break;
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
  const pool = GOAL_KINDS.filter((k) => !used.has(k) && (GOAL_SPECS[k].eligible?.(g) ?? true));
  if (pool.length === 0) return null;
  const kind = pool[Math.floor(rng() * pool.length)];
  const spec = GOAL_SPECS[kind];
  const k = 1 + 0.2 * Math.min(5, inbox.claims?.[kind] ?? 0); // cada vez que você cumpre uma meta, a próxima versão dela fica mais difícil
  const startAbs = absRound(g);
  const m = spec.make(g, inbox, k);
  const reward = Math.round((inflate(g, spec.reward) * (0.7 + 0.2 * rep(g))) / 1_000) * 1_000;
  return { id: `G${inbox.seq}-${kind}`, kind, text: m.text, target: m.target, base: m.base, startAbs, expires: startAbs + spec.window, reward, claimed: false, expired: false };
}

export function claimGoal(g: GameState, goalId: string): GameState {
  const inbox = inboxOf(g);
  const goal = inbox.goals.find((x) => x.id === goalId);
  if (!goal || goal.claimed || goal.expired || !goalDone(g, goal)) return g;
  const s = creditAccount(g, 'Meta cumprida', goal.text, goal.reward);
  return put(s, { ...inbox, claims: { ...(inbox.claims ?? {}), [goal.kind]: (inbox.claims?.[goal.kind] ?? 0) + 1 }, goals: inbox.goals.map((x) => (x.id === goalId ? { ...x, claimed: true } : x)) });
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
  if (g.unemployed || g.phone?.noPhone) return g; // sem celular não chegam mensagens nem metas
  let s = expire(g);
  let inbox = inboxOf(s);
  // metas vencidas
  const now = absRound(s);
  const marked = inbox.goals.map((x) => (!x.claimed && !x.expired && x.expires < now && !goalDone(s, x) ? { ...x, expired: true } : x));
  inbox = { ...inbox, goals: [...marked.filter((x) => !x.claimed && !x.expired), ...marked.filter((x) => x.claimed || x.expired).slice(0, 10)] }; // abertas + as últimas encerradas
  while (inbox.goals.filter((x) => !x.claimed && !x.expired).length < GOALS_OPEN) {
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
