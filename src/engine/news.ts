import { divisionTable, userDivision } from './game';
import { anyClubName } from './market';
import { makeRng, type Rng } from './rng';
import { contextOf } from './social';
import type { GameState } from './types';

export interface Interview { who: string; quote: string; tone: 'good' | 'bad' | 'mid' }

const FIRST = ['Seu Zé', 'Dona Marta', 'Carlinhos', 'Tia Neide', 'Rafa', 'Joana', 'Seu Antônio', 'Bia', 'Marcão', 'Dona Lourdes', 'Thiago', 'Paulinho', 'Vovô Nelson', 'Camila', 'Dudu', 'Sandra'];
const WHO = ['torcedor há 40 anos', 'sócio-torcedor', 'da organizada', 'ouvindo o jogo no rádio', 'saindo do estádio', 'no bar da esquina', 'vendedor de bandeiras', 'torcedora de arquibancada'];

const GOOD = [
  'Esse {coach} tem moral! O time joga bonito e a gente volta a sonhar.',
  'Finalmente um treinador que entende o {club}. Pode ficar por muitos anos!',
  'A fase está ótima, a torcida está feliz e o estádio vai encher.',
  'Estou orgulhoso! O {club} está na {pos}ª posição e merece.',
  'O {coach} acertou o time. Quem criticava agora está calado.',
  'Que jogão! O {club} está jogando com raça, como a torcida gosta.',
];
const MID = [
  'Tem coisa boa, tem coisa ruim. Vamos ver o que o {coach} faz nos próximos jogos.',
  'O time ainda está se acertando. Paciência, a gente tem que confiar.',
  'Estamos na {pos}ª posição… dá pra melhorar, mas não está um desastre.',
  'Gosto do {coach}, mas o time precisa ser mais regular.',
  'Meio morno. Falta um pouco mais de vontade lá na frente.',
  'Eu apoio sempre, mas queria ver mais ousadia do {coach}.',
];
const BAD = [
  'Isso é um absurdo! O {coach} precisa mudar o time ou deixar o cargo!',
  'Perder de novo? A torcida está cansada de passar vergonha.',
  'Na {pos}ª posição! O {club} merece muito mais do que isso.',
  'Eu pago meu ingresso pra ver isso? Assim não dá, {coach}!',
  'O time não tem alma. Se continuar assim, a diretoria vai ter que agir.',
  'Já foi o tempo em que esse {club} dava orgulho. Que tristeza.',
];

/** Entrevistas com torcedores: o tom depende do humor da torcida, do último jogo e da posição na tabela. */
export function fanInterviews(g: GameState, n = 4): { headline: string; items: Interview[] } {
  const rng: Rng = makeRng(g.seed * 71 + g.season * 13 + g.round * 5 + 3);
  const club = g.clubs[g.userClubId].name;
  const { last, streak } = contextOf(g);
  const table = divisionTable(g, userDivision(g).id);
  const pos = table.findIndex((r) => r.clubId === g.userClubId) + 1;
  const mood = g.morale.fans + (last === 'win' ? 10 : last === 'loss' ? -12 : 0) + Math.max(-10, Math.min(10, streak * 3));
  const pick = <T,>(xs: T[]) => xs[Math.floor(rng() * xs.length)];
  const used = new Set<string>();
  const items: Interview[] = [];
  for (let i = 0; i < n; i++) {
    // a maioria segue o humor geral (3 em cada 4); os outros destoam um pouco
    const main: Interview['tone'] = mood >= 62 ? 'good' : mood <= 42 ? 'bad' : 'mid';
    const r = rng();
    const tone: Interview['tone'] = i < Math.ceil(n * 0.75) ? main : r < 0.6 ? 'mid' : mood >= 52 ? 'bad' : 'good';
    const pool = tone === 'good' ? GOOD : tone === 'bad' ? BAD : MID;
    let quote = pick(pool);
    for (let k = 0; k < 6 && used.has(quote); k++) quote = pick(pool);
    used.add(quote);
    items.push({ who: `${pick(FIRST)}, ${pick(WHO)}`, quote: quote.split('{coach}').join(g.coach.name.split(' ')[0]).split('{club}').join(club).split('{pos}').join(String(pos)), tone });
  }
  const headline = mood >= 62 ? `Torcida do ${club} aprova o trabalho do treinador` : mood <= 42 ? `Torcida do ${club} está insatisfeita e cobra o treinador` : `Torcida do ${club} está dividida`;
  return { headline, items };
}

/** Últimas transferências entre clubes (e as suas). */
export function transferFeed(g: GameState, limit = 30): { season: number; round: number; text: string; mine?: boolean }[] {
  const mine = g.transfers.map((t) => {
    const from = t.fromClubId ? anyClubName(g, t.fromClubId) : undefined;
    const to = t.toClubId ? anyClubName(g, t.toClubId) : undefined;
    const verb = t.kind === 'buy' ? `Seu clube contratou ${t.playerName}${from ? ` do ${from}` : ''}` : t.kind === 'sale' ? `Seu clube vendeu ${t.playerName}${to ? ` ao ${to}` : ''}` : t.kind === 'loanin' ? `Seu clube pegou emprestado ${t.playerName}${from ? ` do ${from}` : ''}` : t.kind === 'loan' ? `Seu clube emprestou ${t.playerName}${to ? ` ao ${to}` : ''}` : `Seu clube dispensou ${t.playerName}`;
    return { season: t.season, round: t.round, text: `${verb}${t.fee ? ` por R$ ${t.fee.toLocaleString('pt-BR')}` : ''}.`, mine: true };
  });
  const rest = (g.market ?? []).map((m) => ({ season: m.season, round: m.round, text: m.text }));
  return [...mine, ...rest].sort((a, b) => b.season - a.season || b.round - a.round).slice(0, limit);
}
