export type Position = 'GK' | 'DEF' | 'MID' | 'ATT';
export type FormationId = '4-4-2' | '4-3-3' | '3-5-2' | '4-5-1' | '5-3-2';

export const FORMATIONS: Record<FormationId, { DEF: number; MID: number; ATT: number }> = {
  '4-4-2': { DEF: 4, MID: 4, ATT: 2 },
  '4-3-3': { DEF: 4, MID: 3, ATT: 3 },
  '3-5-2': { DEF: 3, MID: 5, ATT: 2 },
  '4-5-1': { DEF: 4, MID: 5, ATT: 1 },
  '5-3-2': { DEF: 5, MID: 3, ATT: 2 },
};

export interface Player {
  id: string;
  name: string;
  pos: Position;
  age: number;
  strength: number; // 1..100
  /** Contrato negociado (só jogadores contratados por você): salário anual e última temporada. */
  contract?: { wage: number; until: number };
}

export interface Club {
  id: string;
  name: string;
  short: string;
  color: string; // cor principal (sem escudos no MVP)
  strength: number; // 1..100, usado para gerar elenco quando o pacote não traz jogadores
  players?: Player[]; // opcional: pacotes de dados podem trazer elenco pronto
}

/** Formato do "pacote de dados" (liga + clubes). O jogo base é genérico; pacotes trazem os nomes. */
export interface DataPack {
  format: 'caminhoes-pack-v1';
  id: string;
  name: string;
  author?: string;
  league: { name: string; clubs: Club[] };
}

export interface TeamState {
  clubId: string;
  players: Player[];
  formation: FormationId;
  lineup: string[]; // 11 ids de jogadores
}

export interface MatchEvent {
  minute: number;
  type: 'kickoff' | 'goal' | 'yellow' | 'red' | 'foul' | 'save' | 'miss' | 'corner' | 'halftime' | 'fulltime';
  side: 'home' | 'away' | 'none';
  text: string;
  /** Jogador principal do lance (autor do gol, da falta, do chute...). */
  player?: string;
  /** Placar [casa, fora] depois do lance (gols, intervalo e fim de jogo). */
  score?: [number, number];
}

export interface MatchResult {
  divisionId: string;
  round: number;
  homeId: string;
  awayId: string;
  homeGoals: number;
  awayGoals: number;
  /** Pênaltis (mata-mata empatado). */
  pens?: [number, number];
  /** Lances da partida. Só são guardados nos jogos do clube do jogador (nos demais fica vazio, para o save não crescer). */
  events: MatchEvent[];
}

export interface Fixture {
  divisionId: string;
  round: number;
  homeId: string;
  awayId: string;
  /** Jogo eliminatório (empate vai para os pênaltis). */
  ko?: boolean;
}

export interface TableRow {
  clubId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;
}

/** Dados de exibição de um clube, copiados para o save (nomes, cores, estádio). */
export interface ClubInfo {
  id: string;
  name: string;
  shortName: string;
  badge: string;
  primaryColor: string;
  secondaryColor: string;
  stadium: string;
  city: string;
  reputation: number;
  /** Meta da diretoria (title | top4 | mid | survive), usada no humor dos dirigentes. */
  boardExpectation: 'title' | 'top4' | 'mid' | 'survive';
}

/** Uma divisão da pirâmide, da principal (índice 0) para as inferiores. */
export interface DivisionState {
  id: string;
  name: string;
  clubIds: string[];
  /** 'groups' = grupos de 6 e mata-mata (Série D): `groups` guarda os grupos da temporada. */
  format?: 'groups' | 'outside';
  groups?: string[][];
}

/** Notícia do mercado e dos clubes (movimentos da IA, investimentos, crises). */
export interface NewsItem {
  season: number;
  round: number;
  text: string;
  tone: 'good' | 'bad' | 'info';
}

/** Resumo de uma temporada encerrada. */
/** Um jogo de mata-mata (jogo único; empate vai para os pênaltis). */
export interface CupTie { homeId: string; awayId: string; homeGoals?: number; awayGoals?: number; pens?: [number, number]; winnerId?: string }
export interface CupRound { name: string; ties: CupTie[] }
/** Copa nacional da temporada (ex.: Copa do Brasil). */
export interface CupState {
  id: string;
  name: string;
  rounds: CupRound[]; // fases já sorteadas (a próxima é sorteada quando a anterior termina)
  roundIndex: number; // próxima fase a jogar
  totalRounds: number;
  dueAfter: number[]; // depois de qual rodada do campeonato cada fase acontece
  due: boolean; // há uma fase esperando para ser jogada
  alive: string[]; // clubes ainda na copa
  championId?: string;
}

export interface LibMatch { round: number; homeId: string; awayId: string; homeGoals?: number; awayGoals?: number }
export interface LibGroup { id: string; clubIds: string[]; matches: LibMatch[] }
/** Copa Libertadores: 8 grupos de 4 (6 rodadas) e mata-mata (oitavas, quartas, semi e final). */
export interface LibState {
  id: string;
  name: string;
  groups: LibGroup[];
  ko: CupRound[];
  step: number; // 0–5 rodadas da fase de grupos; 6–9 oitavas, quartas, semifinal, final
  dueAfter: number[];
  due: boolean;
  alive: string[];
  championId?: string;
}

export interface PhoneSettings { wallpaper: 'neon' | 'ouro' | 'noite' | 'campo' | 'aurora'; dark: boolean; brightness: number; bigText: boolean; dnd: boolean; sounds: boolean; vibration: boolean; /** desbloqueio por digital (sem digitar o PIN) */ fingerprint?: boolean; /** conexões (painel rápido) */ wifi?: boolean; mobileData?: boolean; airplane?: boolean; /** rede Wi-Fi conectada */ wifiNet?: string }
export interface PhoneNotification { id: string; app: string; text: string; season: number; round: number; read: boolean }
/** Celular do treinador: PIN, apps instalados, configurações e notificações. */
export interface PhoneState { pinHash?: string; installed: string[]; settings: PhoneSettings; notifications: PhoneNotification[] }

/** O que acontece quando uma cobrança/boleto é pago (cada app define o seu). */
export interface PayPurpose { type: string; ref?: string; data?: Record<string, number | string> }
export interface PixCharge { id: string; key: string; merchant: string; description: string; amount: number; purpose: PayPurpose; status: 'open' | 'paid'; season: number; round: number }
export interface Boleto { id: string; code: string; merchant: string; description: string; amount: number; dueSeason: number; dueRound: number; status: 'open' | 'paid' | 'late'; fine: number; notified: boolean; purpose: PayPurpose; paidTxId?: string }
export interface BankTx { id: string; kind: 'pix' | 'boleto' | 'income'; title: string; detail: string; /** negativo = saiu da conta */ amount: number; season: number; round: number }
/** Conta bancária do treinador (o saldo é o dinheiro pessoal dele, `coachMoney`). */
export interface BankState { name: string; passHash: string; txs: BankTx[]; charges: PixCharge[]; boletos: Boleto[]; seq: number }

/** Financiamento (parcelas mensais) ou aluguel (sem fim até encerrar). Um "mês" do jogo = 3 rodadas. */
export interface Contract { id: string; kind: 'loan' | 'rent'; assetKind: 'vehicle' | 'house'; assetId: string; merchant: string; description: string; monthly: number; /** parcelas que ainda faltam gerar boleto (null = aluguel) */ remaining: number | null; total: number; paid: number; nextSeason: number; nextRound: number }
export interface OwnedAsset { id: string; price: number; season: number; contractId?: string }
/** Bens do treinador: veículos, imóveis, aluguel atual e contratos. */
export interface AssetsState { vehicles: OwnedAsset[]; houses: OwnedAsset[]; contracts: Contract[]; seq: number }

export interface SocialPost { id: string; type: string; text: string; season: number; round: number; delta: number; likes: number; views: number; viral: boolean }
export interface SocialProfile { followers: number; history: { season: number; round: number; followers: number }[]; posts: SocialPost[]; lastPost: string; adIncome: number }
/** Redes sociais do treinador. */
export interface SocialState { linstagra: SocialProfile; tikiteko: SocialProfile; lastMatch?: { season: number; round: number; result: 'win' | 'draw' | 'loss'; streak: number } }

export type CasinoColor = 'azul' | 'preto' | 'vermelho';
export interface CasinoBet { id: string; color: CasinoColor; drawn: CasinoColor; stake: number; payout: number; season: number; round: number }
/** Saldo do Cassino (separado do banco) e histórico de apostas. */
export interface CasinoState { balance: number; bets: CasinoBet[]; deposited: number; wagered: number; won: number }
export interface MarketDeal { season: number; round: number; text: string }

/** Mundial de Clubes: semifinais cruzadas entre os dois finalistas da Libertadores e da Champions, e final. */
export interface MundialState {
  id: string;
  name: string;
  ko: CupRound[];
  step: number; // 0 = semifinais, 1 = final
  due: boolean;
  alive: string[];
  championId?: string;
}

export interface JobOffer { clubId: string; season: number; round: number; /** vale até esta rodada da mesma temporada (ou da seguinte) */ expires: number }
export interface JobSpell { clubId: string; fromSeason: number; toSeason?: number; ended?: 'demitido' | 'pediu demissão' | 'contratado por outro clube' }
export interface RetiredPlayer { name: string; age: number; pos: Position; strength: number; clubId: string; season: number }

export interface CoachTitle { season: number; clubId: string; clubName: string; competition: string; kind: 'liga' | 'copa' | 'continental' | 'mundial' | 'estadual' }

/** Um estadual: Série A (e, em CE, RJ e SP, Série B). Os resultados ficam compactos: [rodada, mandante (índice), visitante (índice), gols, gols]. */
export interface EstadualDivision { name: string; clubIds: string[]; matches: [number, number, number, number, number][] }
export interface EstadualComp { uf: string; name: string; divisions: EstadualDivision[] }
export interface EstadualState { id: string; comps: EstadualComp[]; step: number; totalSteps: number; due: boolean; done: boolean }

export interface SeasonSummary {
  /** Campeões dos estaduais da temporada (todos os estados). */
  estadualChampions?: { uf: string; name: string; divisions: { name: string; championId: string }[] }[];
  sulaChampionId?: string;
  /** Classificação final de cada divisão: [clube, pontos, jogos, saldo de gols]. */
  tables?: { id: string; rows: [string, number, number, number][] }[];
  uclChampionId?: string;
  mundialChampionId?: string;
  libChampionId?: string;
  cupChampionId?: string;
  season: number;
  userDivisionId: string;
  userPosition: number;
  divisions: { id: string; championId: string; promoted: string[]; relegated: string[] }[];
  /** Sorteio do investimento dos clubes promovidos (strong = investimento forte). */
  promotion?: { clubId: string; strong: boolean; bonus: number }[];
}

/** Registro de uma contratação (o jogador passa de um clube para outro). */
export interface Transfer {
  /** buy = contratação, sale = venda, loan = empréstimo cedido, release = dispensa (toClubId vazio) */
  kind: 'buy' | 'sale' | 'loan' | 'release';
  season: number;
  round: number;
  playerId: string;
  playerName: string;
  pos: Position;
  strength: number;
  fromClubId: string;
  toClubId: string;
  fee: number; // R$
}

/** Humor (0–100) da equipe, dos dirigentes e da torcida. */
export interface Morale { team: number; board: number; fans: number }

/** Proposta de outro clube por um jogador da lista de transferência (buy) ou de empréstimo (loan). */
export interface Offer {
  id: string;
  kind: 'buy' | 'loan';
  playerId: string;
  clubId: string; // clube que fez a proposta
  fee: number; // R$ pagos ao seu clube
  season: number;
  expiresRound: number; // a proposta vale até o fim desta rodada
}

/** Jogador seu emprestado: volta no fim da temporada. */
export interface Loan { playerId: string; hostClubId: string; season: number }

export interface GameState {
  version: 5;
  /** Liga da carreira (nome exibido) e quantos clubes sobem/descem por fronteira. Ausentes em saves antigos (Brasileirão, 4). */
  leagueName?: string;
  slots?: number;
  saveName: string;
  coach: { name: string; nationality: string; reputation: string };
  difficulty: string;
  mode: string;
  userClubId: string;
  seed: number;
  season: number;
  round: number; // próxima rodada a jogar (1-based); > totalRounds = temporada acabou
  totalRounds: number;
  clubs: Record<string, ClubInfo>;
  budgets: Record<string, number>; // saldo de cada clube em R$ (usado nas transferências)
  transfers: Transfer[]; // histórico de contratações, vendas, empréstimos e dispensas
  morale: Morale;
  transferList: string[]; // jogadores do seu clube à venda
  loanList: string[]; // jogadores do seu clube disponíveis para empréstimo
  offers: Offer[]; // propostas recebidas
  loans: Loan[]; // jogadores seus emprestados
  news: NewsItem[]; // últimas notícias (mais recente primeiro)
  divisions: DivisionState[]; // ordem: Série A, B, C, D
  teams: Record<string, TeamState>; // todos os clubes
  fixtures: Fixture[]; // da temporada atual, todas as divisões
  results: MatchResult[]; // da temporada atual
  history: SeasonSummary[];
  cup?: CupState;
  lib?: LibState;
  ucl?: LibState;
  sula?: LibState;
  estadual?: EstadualState;
  phone?: PhoneState;
  bank?: BankState;
  assets?: AssetsState;
  social?: SocialState;
  casino?: CasinoState;
  /** Sem clube (demitido ou pediu demissão): o clube antigo passa a ser controlado pela IA. */
  unemployed?: boolean;
  /** Inflação acumulada (índice de preços, 1,00 no início da carreira) e a taxa de cada ano. */
  inflation?: { index: number; rate: number; history: { season: number; rate: number }[] };
  /** Mundo só para assistir (Simular Anos): ninguém é o treinador. */
  observer?: boolean;
  /** Pagar boletos sozinho com o saldo (usado ao pular temporadas). */
  autoPay?: boolean;
  /** Títulos conquistados pelo treinador. */
  titles?: CoachTitle[];
  /** Jogadores de clubes de outras ligas que saíram (out) ou chegaram (in) — esses elencos vêm dos dados do jogo. */
  foreignDeals?: Record<string, { out: string[]; in: Player[] }>;
  /** Rodadas de negociação por jogador (limite de tentativas por rodada). */
  talks?: Record<string, { season: number; round: number; tries: number }>;
  firedInfo?: { clubId: string; season: number; round: number; reason: string; resigned?: boolean };
  jobOffers?: JobOffer[];
  /** Clubes pelos quais o treinador já passou. */
  jobs?: JobSpell[];
  /** Pontos de reputação ganhos na carreira (títulos, acessos) ou perdidos (demissões). */
  coachPoints?: number;
  /** Quantas rodadas seguidas a diretoria esteve no limite. */
  boardLow?: number;
  /** Última rodada em que o treinador se candidatou a uma vaga. */
  appliedKey?: string;
  retired?: RetiredPlayer[];
  /** Últimas transferências entre clubes (para o app Notícias). */
  market?: MarketDeal[];
  mundial?: MundialState;
  /** Dinheiro pessoal do treinador (R$) e quanto da folha ele paga (0/25/50/100). */
  coachMoney?: number;
  wageCover?: number;
  /** Mensagens (patrocínios, coletivas, diretoria, torcida) e metas do celular. */
  inbox?: import('./inbox').InboxState;
  /** Estádio do seu clube: capacidade, conforto, preço do ingresso e público dos últimos jogos. */
  stadium?: import('./stadium').StadiumState;
  /** Balanço da temporada do seu clube. */
  ledger?: { season: number; gate: number; wages: number; coachCover: number; coachSalary: number };
  /** Clubes de outros países que disputam a Libertadores (ficam fora do campeonato e do mercado). */
  foreign?: { clubs: Record<string, ClubInfo>; teams: Record<string, TeamState> };
}
