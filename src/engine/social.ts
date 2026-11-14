import { creditAccount } from './bank';
import { priceIndex } from './economy';
import { prestigeScore } from './assets';
import { notifyPhone } from './phone';
import { makeRng } from './rng';
import type { GameState, SocialPost, SocialProfile, SocialState } from './types';

export type SocialApp = 'linstagra' | 'tikiteko';
export type PostKind = 'dance' | 'explain' | 'apology' | 'celebrate' | 'training' | 'lifestyle' | 'fans' | 'tactics' | 'challenge' | 'behind';

export interface PostType { id: string; kind: PostKind; label: string; icon: string; apps: SocialApp[]; hint: string }
export const POST_TYPES: PostType[] = [
  { id: 'dance', kind: 'dance', label: 'Vídeo dançando', icon: '💃', apps: ['linstagra', 'tikiteko'], hint: 'Bomba depois de vitória. Depois de derrota, a torcida não perdoa.' },
  { id: 'explain', kind: 'explain', label: 'Vídeo explicando a derrota', icon: '🗣️', apps: ['linstagra', 'tikiteko'], hint: 'Funciona bem depois de uma derrota.' },
  { id: 'apology', kind: 'apology', label: 'Vídeo pedindo desculpas', icon: '🙏', apps: ['linstagra', 'tikiteko'], hint: 'Acalma a torcida depois de perder. Sem motivo, soa estranho.' },
  { id: 'celebrate', kind: 'celebrate', label: 'Comemorar a vitória', icon: '🏆', apps: ['linstagra', 'tikiteko'], hint: 'Só vale depois de ganhar.' },
  { id: 'training', kind: 'training', label: 'Foto do treino', icon: '📸', apps: ['linstagra'], hint: 'Seguro: sempre rende um pouco e anima o elenco.' },
  { id: 'lifestyle', kind: 'lifestyle', label: 'Mostrar a vida de luxo', icon: '💎', apps: ['linstagra'], hint: 'Rende mais quanto mais bens você tem. Perdendo, causa revolta.' },
  { id: 'fans', kind: 'fans', label: 'Homenagem à torcida', icon: '❤️', apps: ['linstagra', 'tikiteko'], hint: 'Sobe o ânimo da torcida em qualquer situação.' },
  { id: 'tactics', kind: 'tactics', label: 'Explicando a tática', icon: '🧠', apps: ['tikiteko'], hint: 'Rende mais quando o time vem ganhando.' },
  { id: 'challenge', kind: 'challenge', label: 'Desafio com os jogadores', icon: '🤹', apps: ['tikiteko'], hint: 'Divertido e arriscado: pode viralizar.' },
  { id: 'behind', kind: 'behind', label: 'Bastidores do vestiário', icon: '🎥', apps: ['tikiteko', 'linstagra'], hint: 'Aproxima o elenco e a torcida.' },
];
export const postType = (id: string) => POST_TYPES.find((p) => p.id === id);
export const APP_INFO: Record<SocialApp, { name: string; icon: string; baseRate: number; viral: number; adPerFollower: number; unit: string }> = {
  linstagra: { name: 'LinstaGrã', icon: '📸', baseRate: 0.008, viral: 0.1, adPerFollower: 0.012, unit: 'curtidas' },
  tikiteko: { name: 'TikiTeko', icon: '🎵', baseRate: 0.012, viral: 0.14, adPerFollower: 0.018, unit: 'curtidas' },
};

const REP_FOLLOWERS: Record<string, number> = { unknown: 800, amateur: 2_500, 'semi-pro': 12_000, pro: 60_000, legend: 400_000 };
const MAX_HISTORY = 24;

export function initialSocial(g: GameState): SocialState {
  const rep = g.clubs[g.userClubId].reputation;
  const base = (REP_FOLLOWERS[g.coach.reputation] ?? 5_000) * (0.6 + 0.2 * rep);
  const profile = (mult: number): SocialProfile => ({ followers: Math.round(base * mult), history: [{ season: g.season, round: g.round, followers: Math.round(base * mult) }], posts: [], lastPost: '', adIncome: 0 });
  return { linstagra: profile(1), tikiteko: profile(0.8) };
}
export const socialOf = (g: GameState): SocialState => g.social ?? initialSocial(g);
const put = (g: GameState, s: SocialState): GameState => ({ ...g, social: s });

export const handleOf = (g: GameState) => '@' + g.coach.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z]+/g, '.').replace(/^\.|\.$/g, '');
export const totalFollowers = (g: GameState) => { const s = socialOf(g); return s.linstagra.followers + s.tikiteko.followers; };
export const fmtCount = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1).replace('.', ',')} mi` : n >= 1e4 ? `${(n / 1e3).toFixed(1).replace('.', ',')} mil` : String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'));

/* ---------- contexto: como foi o último jogo ---------- */
type Last = NonNullable<SocialState['lastMatch']>['result'] | null;
export function contextOf(g: GameState): { last: Last; streak: number } {
  const m = g.social?.lastMatch;
  return { last: m?.result ?? null, streak: m?.streak ?? 0 };
}

/** Quanto cada tipo de post cai bem agora: multiplicador de seguidores e efeitos no humor. */
export function fit(kind: PostKind, last: Last, prestige: number): { mult: number; fans: number; board: number; team: number } {
  const l = last ?? 'none';
  switch (kind) {
    case 'dance': return { mult: l === 'win' ? 1.5 : l === 'loss' ? -1 : l === 'draw' ? 0.7 : 1, fans: l === 'win' ? 2 : l === 'loss' ? -5 : 0, board: l === 'loss' ? -2 : 0, team: 0 };
    case 'explain': return { mult: l === 'loss' ? 1.3 : l === 'draw' ? 1 : l === 'win' ? 0.5 : 0.7, fans: l === 'loss' ? 3 : 0, board: 0, team: 0 };
    case 'apology': return { mult: l === 'loss' ? 1.4 : l === 'draw' ? 0.3 : l === 'win' ? -0.4 : 0, fans: l === 'loss' ? 4 : l === 'win' ? -2 : 0, board: l === 'loss' ? 1 : 0, team: 0 };
    case 'celebrate': return { mult: l === 'win' ? 1.6 : -0.5, fans: l === 'win' ? 3 : -2, board: 0, team: 0 };
    case 'training': return { mult: 0.7, fans: 0, board: 0, team: 1 };
    case 'lifestyle': { const m = 0.2 + prestige / 10 * 1.6; return { mult: l === 'loss' ? -m * 0.6 : m, fans: l === 'loss' ? -4 : 0, board: l === 'loss' ? -1 : 0, team: 0 }; }
    case 'fans': return { mult: 1, fans: 3, board: 0, team: 0 };
    case 'tactics': return { mult: l === 'win' ? 1.2 : l === 'loss' ? 0.5 : 0.9, fans: 0, board: 1, team: 0 };
    case 'challenge': return { mult: 1.1, fans: 1, board: 0, team: 1 };
    case 'behind': return { mult: 0.9, fans: 1, board: 0, team: 1 };
  }
}

/** Tendência da semana no TikiTeko (muda a cada 3 rodadas): posts desse tipo rendem 1,5x. */
export const trendOf = (g: GameState): PostType => {
  const pool = POST_TYPES.filter((p) => p.apps.includes('tikiteko'));
  return pool[(g.season * 7 + Math.floor((g.round - 1) / 3)) % pool.length];
};

export const roundKey = (g: GameState) => `${g.season}-${g.round}`;
export const canPost = (g: GameState, app: SocialApp) => socialOf(g)[app].lastPost !== roundKey(g);

export interface PostResult { delta: number; likes: number; views: number; viral: boolean; backlash: boolean }
export type PostOutcome = { ok: true; state: GameState; post: SocialPost; result: PostResult } | { ok: false; error: string };

/** Publica um post: o resultado depende do tipo, do último jogo, do prestígio e da sorte (pode viralizar). */
export function publish(g: GameState, app: SocialApp, typeId: string): PostOutcome {
  const t = postType(typeId);
  if (!t || !t.apps.includes(app)) return { ok: false, error: 'Tipo de post inválido.' };
  if (!canPost(g, app)) return { ok: false, error: 'Você já postou nesta rodada. Jogue a próxima partida para postar de novo.' };
  const s = socialOf(g);
  const p = s[app];
  const info = APP_INFO[app];
  const { last } = contextOf(g);
  const f = fit(t.kind, last, prestigeScore(g));
  const rng = makeRng(g.seed * 911 + g.season * 131 + g.round * 17 + p.posts.length * 7 + (app === 'linstagra' ? 3 : 5));
  const trend = app === 'tikiteko' && trendOf(g).id === t.id;
  const noise = 0.6 + rng() * 0.9;
  const viral = f.mult > 0.3 && rng() < info.viral * (trend ? 1.8 : 1);
  const rate = info.baseRate * f.mult * noise * (trend ? 1.5 : 1) * (viral ? 4 : 1);
  let delta = Math.round(p.followers * rate);
  if (delta === 0) delta = f.mult >= 0 ? 3 : -3;
  delta = Math.max(delta, -Math.round(p.followers * 0.06)); // revolta tem limite
  const backlash = delta < 0;
  const views = Math.round(p.followers * (0.25 + rng() * 0.5) * (viral ? 6 : 1) * (backlash ? 1.5 : 1));
  const likes = Math.round(views * (backlash ? 0.02 : 0.08 + rng() * 0.08));
  const post: SocialPost = { id: `${app}-${g.season}-${g.round}-${p.posts.length}`, type: t.id, text: t.label, season: g.season, round: g.round, delta, likes, views, viral };
  const followers = Math.max(0, p.followers + delta);
  const profile: SocialProfile = { ...p, followers, posts: [post, ...p.posts].slice(0, 40), lastPost: roundKey(g), history: [...p.history, { season: g.season, round: g.round, followers }].slice(-MAX_HISTORY) };
  const m = g.morale;
  const clamp = (v: number) => Math.max(0, Math.min(100, v));
  let state: GameState = put({ ...g, morale: { team: clamp(m.team + f.team), board: clamp(m.board + f.board), fans: clamp(m.fans + f.fans) } }, { ...s, [app]: profile });
  if (viral) state = notifyPhone(state, app, `Seu post "${t.label}" viralizou! +${fmtCount(delta)} seguidores.`);
  return { ok: true, state, post, result: { delta, likes, views, viral, backlash } };
}

/* ---------- reação aos jogos e publicidade ---------- */

/** Depois de um jogo do seu clube: vitória atrai seguidores, derrota afasta (pesa mais em sequência). `weight` menor para copas. */
export function socialAfterMatch(g: GameState, gf: number, ga: number, weight = 1): GameState {
  const s = socialOf(g);
  const result = gf > ga ? 'win' : gf < ga ? 'loss' : 'draw';
  const prev = s.lastMatch?.streak ?? 0;
  const streak = result === 'win' ? Math.max(0, prev) + 1 : result === 'loss' ? Math.min(0, prev) - 1 : 0;
  const rng = makeRng(g.seed * 313 + g.season * 29 + g.round * 11 + gf * 5 + ga);
  const pct = (result === 'win' ? 0.004 : result === 'loss' ? -0.004 : 0) + (Math.abs(streak) >= 3 ? 0.003 * Math.sign(streak) : 0) + (rng() - 0.5) * 0.002 + Math.min(gf - ga, 3) * 0.0008;
  const apply = (p: SocialProfile): SocialProfile => {
    const followers = Math.max(0, Math.round(p.followers * (1 + pct * weight)));
    return { ...p, followers, history: [...p.history, { season: g.season, round: g.round, followers }].slice(-MAX_HISTORY) };
  };
  return put(g, { linstagra: apply(s.linstagra), tikiteko: apply(s.tikiteko), lastMatch: { season: g.season, round: g.round, result, streak } });
}

/** A cada "mês" (3 rodadas): contratos de publicidade pagam conforme os seguidores. */
export function socialAds(g: GameState): GameState {
  if (g.round % 3 !== 0) return g;
  const s = socialOf(g);
  let state = g;
  let sum = 0;
  const next = { ...s };
  for (const app of ['linstagra', 'tikiteko'] as SocialApp[]) {
    const p = s[app];
    if (p.followers < 1_000) continue;
    const pay = Math.round((p.followers * APP_INFO[app].adPerFollower * priceIndex(g)) / 100) * 100;
    sum += pay;
    next[app] = { ...p, adIncome: p.adIncome + pay };
  }
  if (sum <= 0) return g;
  state = creditAccount(put(state, next), 'Publicidade', 'Contratos em redes sociais', sum);
  return notifyPhone(state, 'banco', `Publicidade: você recebeu R$ ${sum.toLocaleString('pt-BR')} das redes sociais.`);
}

/** Variação nas últimas `n` fotos do histórico (%). */
export function growthPct(p: SocialProfile, n = 6): number {
  const h = p.history;
  if (h.length < 2) return 0;
  const from = h[Math.max(0, h.length - 1 - n)].followers;
  return from > 0 ? ((p.followers - from) / from) * 100 : 0;
}
