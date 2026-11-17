import { categoryDef, canPromoteAge, homeCategory, needsDecision, type CategoryId } from './categories';
import { COACH_TRAITS, ratioOf, specLabel, starsOf, STAR_LABEL, vacancies, type YouthCoach } from './coaches';
import { academyPercent, expectedRating, isStar, pointsPerYear } from './training';
import type { GameState } from './types';
import { youthOf, type Prospect } from './youth';

/* =====================================================================
   Relatórios técnicos e conversa com o treinador (Etapa 3).
   Tudo sai dos dados reais da categoria (overall, barra de treino, potencial, idade, evolução da temporada, elenco profissional).
   O treinador RECOMENDA; quem decide promoções e contratações é sempre o usuário. Ninguém aqui altera o treino.
   ===================================================================== */

export interface PlayerLine { id: string; name: string; pos: Prospect['player']['pos']; age: number; ovr: number; pot: number; gain: number; star: boolean }
export interface CoachReport {
  cat: CategoryId; coach?: YouthCoach; count: number;
  avgOvr: number; avgGain: number; ratio: number;
  topGainers: PlayerLine[]; topPotential: PlayerLine[]; behind: PlayerLine[]; nearPotential: PlayerLine[];
  highlights: string[]; evaluation: string; promotions: { player: PlayerLine; reason: string }[];
}

/** Os jovens sob responsabilidade do treinador (categoria "de origem": 16–17 anos é do Sub-17; 18–21 do Sub-21). */
export const playersOf = (g: GameState, cat: CategoryId): Prospect[] => youthOf(g).prospects.filter((p) => homeCategory(p.player.age) === cat);
const line = (p: Prospect): PlayerLine => ({ id: p.player.id, name: p.player.name, pos: p.player.pos, age: p.player.age, ovr: p.player.strength, pot: p.potential, gain: Math.max(0, p.exact - (p.base ?? p.exact)), star: isStar(p) });
const POS: Record<string, string> = { GK: 'goleiro', DEF: 'defensor', MID: 'meia', ATT: 'atacante' };
const f1 = (n: number) => n.toFixed(1).replace('.', ',');
const seasonFraction = (g: GameState) => Math.max(0.05, Math.min(1, (g.round - 1) / Math.max(1, g.totalRounds)));

/** Nível do elenco profissional que o jovem precisa alcançar para ser aproveitado (o 18º melhor do plantel). */
function proBenchmark(g: GameState): number {
  const s = [...g.teams[g.userClubId].players.map((p) => p.strength)].sort((a, b) => b - a);
  return s.length ? s[Math.min(17, s.length - 1)] : 0;
}

export function buildReport(g: GameState, cat: CategoryId): CoachReport {
  const y = youthOf(g);
  const coach = y.coaches?.[cat];
  const ps = playersOf(g, cat);
  const lines = ps.map(line);
  const frac = seasonFraction(g);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const topGainers = [...lines].sort((a, b) => b.gain - a.gain).filter((l) => l.gain > 0).slice(0, 3);
  const topPotential = [...lines].sort((a, b) => b.pot - a.pot || b.ovr - a.ovr).slice(0, 3);
  const behind = ps.filter((p) => frac > 0.15 && p.player.strength < p.potential - 2 && (p.exact - (p.base ?? p.exact)) < 0.6 * pointsPerYear(p, y, true) * frac).map(line).slice(0, 4);
  const nearPotential = lines.filter((l) => l.pot - l.ovr <= 3 && l.ovr > 15).sort((a, b) => a.pot - a.ovr - (b.pot - b.ovr)).slice(0, 4);
  const bench = proBenchmark(g);
  const promotions: CoachReport['promotions'] = [];
  for (const l of lines) {
    if (!canPromoteAge(l.age)) continue;
    if (needsDecision(l.age)) promotions.push({ player: l, reason: `completou ${l.age} anos e o clube precisa decidir: profissional, empréstimo ou dispensa` });
    else if (l.ovr >= bench - 3) promotions.push({ player: l, reason: `já tem nível de elenco (overall ${l.ovr}; o plantel pede cerca de ${bench})` });
    else if (l.star && l.age >= 17 && l.ovr >= bench - 12) promotions.push({ player: l, reason: `talento excepcional (potencial ${l.pot}); vale ganhar rodagem no profissional` });
  }
  const ratio = coach ? ratioOf(coach) : 0;
  const highlights: string[] = [];
  if (topGainers[0]) highlights.push(`${topGainers[0].name} (${topGainers[0].age} anos) foi quem mais evoluiu: +${f1(topGainers[0].gain)} de overall na temporada.`);
  const stars = lines.filter((l) => l.star);
  if (stars.length) highlights.push(`${stars.length === 1 ? 'Temos uma estrela' : `Temos ${stars.length} estrelas`}: ${stars.map((s) => `${s.name} (potencial ${s.pot})`).join(', ')}.`);
  if (nearPotential[0]) highlights.push(`${nearPotential[0].name} está a ${nearPotential[0].pot - nearPotential[0].ovr} ponto(s) do potencial máximo.`);
  let evaluation = 'Ainda não há dados da temporada para avaliar meu trabalho.';
  if (!coach) evaluation = 'A vaga está aberta: sem treinador, o treino da categoria rende bem menos.';
  else if (coach.season && coach.season.expected > 0.3) {
    const pct = Math.round(ratio * 100);
    evaluation = `Os jovens renderam ${pct}% do que a diretoria esperava para a academia atual — ${ratio >= 1.1 ? 'acima do objetivo' : ratio >= 0.95 ? 'dentro do objetivo' : ratio >= 0.8 ? 'um pouco abaixo do objetivo' : 'bem abaixo do objetivo'}.`;
  }
  return { cat, coach, count: ps.length, avgOvr: avg(lines.map((l) => l.ovr)), avgGain: avg(lines.map((l) => l.gain)), ratio, topGainers, topPotential, behind, nearPotential, highlights, evaluation, promotions };
}

export type Topic = 'resumo' | 'evoluindo' | 'talentos' | 'perto' | 'promocao' | 'sugestoes' | 'avaliacao';
export const TOPICS: { id: Topic; label: string }[] = [
  { id: 'resumo', label: '📋 Como está a categoria?' },
  { id: 'evoluindo', label: '📈 Quem está evoluindo melhor?' },
  { id: 'talentos', label: '⭐ Quais são os maiores talentos?' },
  { id: 'perto', label: '🎯 Quem está perto do potencial?' },
  { id: 'promocao', label: '⏫ Quem posso promover?' },
  { id: 'sugestoes', label: '💡 Como melhorar a categoria?' },
  { id: 'avaliacao', label: '📝 Como foi o seu trabalho?' },
];

const norm = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
/** Entende uma pergunta digitada pelo usuário (palavras-chave simples). */
export function parseTopic(text: string): Topic | undefined {
  const t = norm(text);
  if (/promo|subir|profission|aprove|elenco principal/.test(t)) return 'promocao';
  if (/perto|teto|maximo|limite|estagn/.test(t)) return 'perto';
  if (/talent|potencial|promessa|craque|estrela|revela/.test(t)) return 'talentos';
  if (/evolu|destaque|cresc|progress|quem.*melhor/.test(t)) return 'evoluindo';
  if (/sugest|dica|conselho|melhorar|como.*(melhor|ajud)|o que fazer|precisa/.test(t)) return 'sugestoes';
  if (/avalia|seu trabalho|desempenho|nota/.test(t)) return 'avaliacao';
  if (/resumo|situacao|como esta|relatorio|geral|tudo bem/.test(t)) return 'resumo';
  return undefined;
}

const who = (l: PlayerLine) => `${l.name} (${POS[l.pos]}, ${l.age} anos, overall ${l.ovr}/${l.pot})`;

/** Resposta do treinador sobre um assunto, em linhas, sempre com os dados reais da categoria. */
export function answer(g: GameState, cat: CategoryId, topic: Topic): string[] {
  const r = buildReport(g, cat);
  const c = r.coach;
  const label = categoryDef(cat).label;
  if (!c) return [`Não há treinador no ${label} neste momento. Contrate um no mercado para eu poder ajudar com a categoria.`];
  if (r.count === 0) return [`Ainda não temos jovens sob a minha responsabilidade no ${label}. Quando a safra chegar a essa faixa de idade, eu passo os relatórios.`];
  switch (topic) {
    case 'resumo':
      return [`Temos ${r.count} jovem(ns) no ${label}, com overall médio ${f1(r.avgOvr)} e evolução média de +${f1(r.avgGain)} nesta temporada.`, ...r.highlights, r.evaluation];
    case 'evoluindo':
      return r.topGainers.length ? ['Quem mais evoluiu nesta temporada:', ...r.topGainers.map((l, i) => `${i + 1}. ${who(l)} — +${f1(l.gain)}.`)] : ['Ainda é cedo: ninguém completou evolução relevante nesta temporada.'];
    case 'talentos':
      return ['Os maiores potenciais da categoria:', ...r.topPotential.map((l, i) => `${i + 1}. ${who(l)}${l.star ? ' — talento excepcional ⭐' : ''}.`)];
    case 'perto':
      return r.nearPotential.length ? ['Perto de alcançar o potencial máximo:', ...r.nearPotential.map((l) => `• ${who(l)} — faltam ${l.pot - l.ovr} ponto(s).`), 'Quem chega ao teto para de evoluir: se tiver nível, vale pensar na promoção.'] : ['Ninguém está perto do teto agora: todos ainda têm espaço para crescer.'];
    case 'promocao':
      return r.promotions.length ? ['Recomendo avaliar a promoção de:', ...r.promotions.map((p) => `• ${who(p.player)} — ${p.reason}.`), 'A decisão é sua; eu apenas indico.'] : [`Por enquanto não vejo ninguém pronto para o profissional. Menores de 16 anos não podem subir, e os demais ainda estão abaixo do nível do elenco.`];
    case 'avaliacao':
      return [`Minha avaliação atual é ${starsOf(c.rating)}★ (${STAR_LABEL[starsOf(c.rating)]}), com ${c.exp} anos de experiência.`, r.evaluation, ...(c.evals?.length ? [`Última temporada fechada: ${Math.round(c.evals[c.evals.length - 1].ratio * 100)}% do esperado.`] : [])];
    case 'sugestoes':
      return suggestions(g, cat, r);
  }
}

function suggestions(g: GameState, cat: CategoryId, r: CoachReport): string[] {
  const y = youthOf(g), c = r.coach!;
  const out: string[] = [];
  const need = expectedRating(y.level);
  if (c.rating < need - 0.5) out.push(`Minha avaliação (${starsOf(c.rating)}★) está abaixo do que a academia atual pede (cerca de ${Math.round(need)}★). Um treinador mais bem avaliado aceleraria o treino.`);
  const pc = academyPercent(y);
  if (pc < 100) out.push(`A academia está em ${pc}%. Melhorar a academia acelera o treino de todas as categorias e libera treinadores de 10 estrelas aos 100%.`);
  const posCount: Record<string, number> = { GK: 0, DEF: 0, MID: 0, ATT: 0 };
  for (const p of playersOf(g, cat)) posCount[p.player.pos]++;
  const main = (Object.entries(posCount).sort((a, b) => b[1] - a[1])[0] ?? [])[0] as string | undefined;
  const specFor: Record<string, 'goleiros' | 'defensores' | 'meias' | 'atacantes'> = { GK: 'goleiros', DEF: 'defensores', MID: 'meias', ATT: 'atacantes' };
  if (main && !c.specs.includes(specFor[main])) out.push(`A maioria dos jovens é ${POS[main]}, e eu não sou especialista nisso. Um treinador com "${specLabel(specFor[main])}" renderia mais.`);
  if (r.behind.length) out.push(`Estão abaixo do esperado: ${r.behind.map((l) => l.name).join(', ')}. Eu já ajusto o foco deles; se continuar assim, talvez o potencial seja o limite.`);
  if (r.nearPotential.length) out.push(`${r.nearPotential.length} jovem(ns) perto do teto: promover quem já tem nível abre espaço para a próxima geração.`);
  if (vacancies(y).length) out.push(`Há categoria(s) sem treinador (${vacancies(y).map((v) => categoryDef(v).label).join(', ')}): preencher essas vagas melhora o conjunto.`);
  if (!out.length) out.push('Está tudo no caminho: a categoria rende o esperado e a estrutura é boa. Siga acompanhando a evolução.');
  return out;
}

/** Conversa livre: devolve o assunto entendido e a resposta; se não entender, diz o que sabe responder. */
export function chat(g: GameState, cat: CategoryId, text: string): { topic?: Topic; lines: string[] } {
  const topic = parseTopic(text);
  if (!topic) return { lines: ['Não entendi bem. Posso falar sobre: como está a categoria, quem está evoluindo, os maiores talentos, quem está perto do potencial, quem promover e como melhorar.'] };
  return { topic, lines: answer(g, cat, topic) };
}

export const traitText = (c: YouthCoach): string => COACH_TRAITS[c.trait].label;
