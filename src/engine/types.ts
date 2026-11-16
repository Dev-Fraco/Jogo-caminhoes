export type Position = 'GK' | 'DEF' | 'MID' | 'ATT';
export type FormationId = '4-4-2' | '4-3-3' | '3-5-2' | '4-5-1' | '5-3-2';

export const FORMATIONS: Record<FormationId, { DEF: number; MID: number; ATT: number }> = {
  '4-4-2': { DEF: 4, MID: 4, ATT: 2 },
  '4-3-3': { DEF: 4, MID: 3, ATT: 3 },
  '3-5-2': { DEF: 3, MID: 5, ATT: 2 },
  '4-5-1': { DEF: 4, MID: 5, ATT: 1 },
  '5-3-2': { DEF: 5, MID: 3, ATT: 2 },
};

/**
 * Função do jogador dentro da sua linha (posição):
 * defensor = zagueiro ou lateral; meia = central, direita ou esquerda; atacante = centroavante ou ponta direita/esquerda.
 */
export type Spot = 'GK' | 'ZAG' | 'LD' | 'LE' | 'MC' | 'MD' | 'ME' | 'PD' | 'PE' | 'CA';
export const SPOT_LINE: Record<Spot, Position> = { GK: 'GK', ZAG: 'DEF', LD: 'DEF', LE: 'DEF', MC: 'MID', MD: 'MID', ME: 'MID', PD: 'ATT', PE: 'ATT', CA: 'ATT' };
export const SPOT_LABEL: Record<Spot, string> = { GK: 'Goleiro', ZAG: 'Zagueiro', LD: 'Lateral direito', LE: 'Lateral esquerdo', MC: 'Meia central', MD: 'Meia direita', ME: 'Meia esquerda', PD: 'Ponta direita', PE: 'Ponta esquerda', CA: 'Centroavante' };
export const SPOT_SHORT: Record<Spot, string> = { GK: 'GOL', ZAG: 'ZAG', LD: 'LD', LE: 'LE', MC: 'MC', MD: 'MD', ME: 'ME', PD: 'PD', PE: 'PE', CA: 'CA' };
/** As vagas de cada formação, da esquerda para a direita dentro de cada linha (goleiro primeiro). */
export const FORMATION_SLOTS: Record<'4-4-2' | '4-3-3' | '3-5-2' | '4-5-1' | '5-3-2', Spot[]> = {
  '4-4-2': ['GK', 'LE', 'ZAG', 'ZAG', 'LD', 'ME', 'MC', 'MC', 'MD', 'CA', 'CA'],
  '4-3-3': ['GK', 'LE', 'ZAG', 'ZAG', 'LD', 'MC', 'MC', 'MC', 'PE', 'CA', 'PD'],
  '3-5-2': ['GK', 'ZAG', 'ZAG', 'ZAG', 'ME', 'MC', 'MC', 'MC', 'MD', 'CA', 'CA'],
  '4-5-1': ['GK', 'LE', 'ZAG', 'ZAG', 'LD', 'ME', 'MC', 'MC', 'MC', 'MD', 'CA'],
  '5-3-2': ['GK', 'LE', 'ZAG', 'ZAG', 'ZAG', 'LD', 'MC', 'MC', 'MC', 'CA', 'CA'],
};

export interface Player {
  id: string;
  name: string;
  pos: Position;
  /** Função dentro da linha (lateral, ponta, centroavante...). Ausente em saves e pacotes antigos: o jogo deduz uma função fixa do jogador. */
  spot?: Spot;
  age: number;
  strength: number; // 1..100
  /** Contrato negociado (só jogadores contratados por você): salário anual e última temporada. */
  contract?: { wage: number; until: number; /** temporada em que o contrato começou */ from?: number };
  /** Último clube (jogadores livres): de onde saiu ao ficar sem contrato. */
  lastClubId?: string;
  /** Potencial (overall que pode alcançar). Ausente = ainda não avaliado; jogadores com mais de 25 anos já o atingiram. */
  pot?: number;
  /** Clube formador (revelado na base) e temporada: nunca muda, mesmo passando por vários clubes. */
  formedAt?: string; formedSeason?: number;
  /** Nacionalidade (código do país), nos jogadores revelados pelo jogo. */
  nat?: string;
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
  type: 'kickoff' | 'tactic' | 'injury' | 'goal' | 'yellow' | 'red' | 'foul' | 'save' | 'miss' | 'corner' | 'halftime' | 'fulltime';
  side: 'home' | 'away' | 'none';
  text: string;
  /** Jogador principal do lance (autor do gol, da falta, do chute...). */
  player?: string;
  /** Lesão: id do jogador e quantas rodadas ele fica fora. */
  injury?: { playerId: string; rounds: number; kind: string };
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
  /** Cobranças dos pênaltis, na ordem (só no jogo do seu clube): quem bateu e se fez o gol. */
  penKicks?: { home: PenKick[]; away: PenKick[] };
  /** Lances da partida. Só são guardados nos jogos do clube do jogador (nos demais fica vazio, para o save não crescer). */
  events: MatchEvent[];
}

/** Um jogo do seu clube já disputado (data, placar e competição). */
export interface PlayedMatch { season: number; day: number; homeId: string; awayId: string; homeGoals: number; awayGoals: number; pens?: [number, number]; label: string }

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
export interface PenKick { name: string; scored: boolean }
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

export interface PhoneSettings { wallpaper: 'azul' | 'neon' | 'ouro' | 'noite' | 'campo' | 'aurora'; dark: boolean; brightness: number; bigText: boolean; dnd: boolean; sounds: boolean; vibration: boolean; /** desbloqueio por digital (sem digitar o PIN) */ fingerprint?: boolean; /** conexões (painel rápido) */ wifi?: boolean; mobileData?: boolean; airplane?: boolean; /** rede Wi-Fi conectada */ wifiNet?: string }
export interface PhoneNotification { id: string; app: string; text: string; season: number; round: number; read: boolean }
/** Celular do treinador: PIN, apps instalados, configurações e notificações. */
export interface PhoneState { pinHash?: string; installed: string[]; settings: PhoneSettings; notifications: PhoneNotification[]; /** modelo do aparelho (Mega-zona Luiz), chip e se o treinador ainda não tem celular */ model?: string; chip?: string; chipNumber?: string; chipUntil?: number; chipCount?: number; chipWarn?: string; noPhone?: boolean; /** apps com conta criada (código por SMS confirmado) */ verified?: string[]; /** código enviado por SMS aguardando confirmação */ pendingCode?: { app: string; code: string; number: string }; sms?: { id: string; text: string; code?: string; season: number; round: number }[]; /** plano de dados: vale até a rodada absoluta `until` */ plan?: { until: number /* dia do calendário */; warned?: boolean; expiredNotified?: boolean};
  /** NetFibra (Wi-Fi residencial): vale até a rodada absoluta `until`; rede e senha escolhidas na contratação; `down` = a rede caiu até essa rodada */
  fibra?: { until: number; entryPaid: boolean; ssid?: string; password?: string; down?: number; warned?: boolean; expiredNotified?: boolean } }

/** O que acontece quando uma cobrança/boleto é pago (cada app define o seu). */
export interface PayPurpose { type: string; ref?: string; data?: Record<string, number | string> }
export interface PixCharge { id: string; key: string; merchant: string; description: string; amount: number; purpose: PayPurpose; status: 'open' | 'paid'; season: number; round: number }
export interface Boleto { id: string; code: string; merchant: string; description: string; amount: number; dueSeason: number; dueRound: number; status: 'open' | 'paid' | 'late'; fine: number; notified: boolean; purpose: PayPurpose; paidTxId?: string }
export interface BankTx { id: string; kind: 'pix' | 'boleto' | 'income'; title: string; detail: string; /** negativo = saiu da conta */ amount: number; season: number; round: number; /** dia do calendário em que aconteceu */ day?: number }
/** Conta bancária do treinador (o saldo é o dinheiro pessoal dele, `coachMoney`). */
export interface BankState { name: string; passHash: string; txs: BankTx[]; charges: PixCharge[]; boletos: Boleto[]; seq: number }

/** Financiamento (parcelas mensais) ou aluguel (sem fim até encerrar). Um "mês" do jogo = 3 rodadas. */
export interface Contract { id: string; kind: 'loan' | 'rent'; assetKind: 'vehicle' | 'house'; assetId: string; merchant: string; description: string; monthly: number; /** parcelas que ainda faltam gerar boleto (null = aluguel) */ remaining: number | null; total: number; paid: number; nextSeason: number; nextRound: number; /** próximo vencimento (dia do calendário): todo mês, no mesmo dia */ nextDay?: number }
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

/** Clube de outro país que quer contratar o treinador (aceitar leva a carreira para a liga dele). */
export interface ForeignOffer { countryId: string; leagueId: string; countryName: string; leagueName: string; divisionName: string; club: ClubInfo }
export interface JobOffer { clubId: string; season: number; round: number; /** vale até esta rodada da mesma temporada (ou da seguinte) */ expires: number; foreign?: ForeignOffer }
export interface JobSpell { clubId: string; fromSeason: number; toSeason?: number; ended?: 'demitido' | 'pediu demissão' | 'contratado por outro clube' | 'não renovou' }
export interface RetiredPlayer { name: string; age: number; pos: Position; strength: number; clubId: string; season: number }

/** Treinador controlado pela IA: perfil, clube atual (ou null se desempregado) e passagens. */
export interface AiCoach {
  id: string; name: string; age: number;
  /** Reputação de 1 a 5 (casa com a reputação dos clubes). */
  rep: number;
  /** Mérito acumulado: títulos e acessos sobem; rebaixamentos e demissões descem. */
  merit: number;
  /** Temporadas de experiência como treinador principal. */
  exp: number;
  clubId: string | null;
  /** Último ano da temporada coberto pelo contrato com o clube atual (a IA renova quem vai bem e libera quem não rende). */
  until?: number;
  since: { season: number; round: number };
  past: { clubId: string; fromSeason: number; toSeason: number; ended: 'demitido' | 'saiu' | 'substituído' }[];
}
/** Limites do elenco da IA (configuráveis por jogo; ausente = padrão). Valem só para as decisões da IA: elenco cadastrado fora deles não é cortado de uma vez. */
export interface SquadLimits {
  total: { min: number; max: number };
  pos: Record<Position, { min: number; ideal: number; max: number }>;
  /** Faixa de idade média desejada do elenco. */
  age: { min: number; max: number };
}
/** Jogador da categoria de base de um clube da IA: `pot` é o potencial (quanto pode chegar a render). */
export interface Prospect extends Player { pot: number }
/** Empréstimo entre clubes da IA: o jogador está no elenco do clube que o recebeu, mas é do dono (volta no fim da temporada). */
export interface AiLoan { playerId: string; ownerId: string; hostId: string; season: number }
export interface CoachTitle { season: number; clubId: string; clubName: string; competition: string; kind: 'liga' | 'copa' | 'continental' | 'mundial' | 'estadual' }

/** Um estadual: Série A (e, em CE, RJ e SP, Série B). Os resultados ficam compactos: [rodada, mandante (índice), visitante (índice), gols, gols]. */
export interface EstadualDivision { name: string; clubIds: string[]; matches: [number, number, number, number, number][]; /** Pênaltis do mata-mata: [rodada, mandante (índice), visitante (índice), pên. mandante, pên. visitante]. */ pens?: [number, number, number, number, number][] }
export interface EstadualComp { uf: string; name: string; divisions: EstadualDivision[] }
export interface EstadualState { id: string; comps: EstadualComp[]; step: number; totalSteps: number; due: boolean; done: boolean; /** Rodadas da fase de pontos corridos; depois vêm semifinais (ida e volta) e final. Ausente = save antigo (sem mata-mata). */ leagueSteps?: number; /** O aviso de fim do estadual já foi lido. */ ack?: boolean }

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
  /** Artilheiros da temporada em cada divisão (os 10 primeiros): [jogador, clube, gols]. */
  topScorers?: { divisionId: string; rows: [string, string, number][] }[];
  /** Sorteio do investimento dos clubes promovidos (strong = investimento forte). */
  promotion?: { clubId: string; strong: boolean; bonus: number }[];
}

/** Lesão de um jogador: volta a poder jogar na rodada `untilRound` da temporada `season` (pode passar da última rodada e seguir na próxima temporada). */
export interface Injury { season: number; untilRound: number; kind: string; /** quantas rodadas ficou fora no total */ rounds: number; clubId?: string }

/** Registro de uma contratação (o jogador passa de um clube para outro). */
export interface Transfer {
  /** buy = contratação, sale = venda, loan = empréstimo cedido, release = dispensa (toClubId vazio) */
  kind: 'buy' | 'sale' | 'loan' | 'release' | 'loanin';
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


/* ---------- Mercado avançado: propostas, parcelas, trocas, empréstimos, cláusulas, janelas, agentes ---------- */

export type DealKind = 'compra' | 'troca' | 'emprestimo' | 'livre';
export type DealState = 'enviada' | 'recebida' | 'em-analise' | 'contraproposta' | 'aguardando' | 'aceita-clube' | 'aceita-jogador' | 'recusada' | 'expirada' | 'cancelada' | 'concluida';
/** Parcela de uma transferência: vencimento (dia do calendário), valor e, depois de paga, o dia do pagamento. */
export interface Installment { due: number; amount: number; paidDay?: number }
/** Cláusula negociada. revenda: % sobre a venda futura (sobre o valor ou o lucro); os bônus pagam quando a condição é cumprida. */
export interface DealClause { type: 'revenda' | 'bonus-jogos' | 'bonus-titulos' | 'bonus-desempenho'; pct?: number; base?: 'valor' | 'lucro'; amount?: number; threshold?: number; untilSeason?: number }
/** Empréstimo: até quando, quanto do salário o clube de origem paga, taxa, opção e obrigação de compra. */
export interface LoanTerms { untilDay: number; originWagePct: number; fee: number; buyOption?: number; buyObligation?: number; obligationGames?: number }
export interface DealTerms {
  /** Valor total negociado (R$). */
  fee: number;
  /** Parcelas (ausente = à vista). A soma é o `fee`. */
  installments?: Installment[];
  /** Jogadores do comprador oferecidos em troca (o `fee` é o valor em dinheiro além deles). */
  swapPlayerIds?: string[];
  clauses?: DealClause[];
  loan?: LoanTerms;
  /** Contrato oferecido ao jogador no clube comprador. */
  wage?: number; years?: number;
}
export interface DealStep { day: number; by: 'comprador' | 'vendedor' | 'jogador' | 'sistema'; action: string; fee?: number; note: string }
/** Proposta/negociação oficial. Concluída ou encerrada, vai para o histórico (`dealLog`). */
export interface Deal {
  id: string; kind: DealKind; playerId: string;
  /** Clube vendedor (null = jogador livre). */
  sellerId: string | null; buyerId: string;
  terms: DealTerms; state: DealState;
  createdDay: number; deadlineDay: number; round: number;
  history: DealStep[];
  clubOk?: boolean; playerOk?: boolean;
  /** Por que o comprador quer o jogador (necessidade). */
  reason?: string;
  /** Dia a partir do qual a outra parte responde (a resposta não é instantânea). */
  answerDay?: number;
  /** Quem deve agir agora: o clube vendedor, o comprador (a IA ou você) ou o jogador. */
  turn?: 'vendedor' | 'comprador' | 'jogador';
}
export interface DealRecord { /** overall do jogador e nível (média dos titulares) do clube comprador na hora do negócio */ ovr?: number; lvl?: number; id: string; kind: DealKind; playerId: string; playerName: string; sellerId: string | null; buyerId: string; fee: number; state: DealState; day: number; summary: string }
/** Dívida entre clubes (parcela de transferência). */
export interface Debt { id: string; dealId: string; playerId: string; debtorId: string; creditorId: string; amount: number; due: number; paidDay?: number; late?: boolean }
/** Cláusula em vigor (revenda e bônus), ligada ao jogador. */
export interface ActiveClause { id: string; dealId: string; playerId: string; type: DealClause['type']; beneficiaryId: string; payerId: string; pct?: number; base?: 'valor' | 'lucro'; baseFee: number; amount?: number; threshold?: number; progress?: number; fromSeason: number; untilSeason?: number; paid?: boolean; paidDay?: number }
/** Empréstimo registrado com todas as condições. */
export interface LoanDeal { reason?: string; startStrength?: number; origContract?: { wage: number; until: number }; dealId: string; playerId: string; originId: string; hostId: string; season: number; fromDay: number; untilDay: number; fullWage: number; originWagePct: number; fee: number; buyOption?: number; buyObligation?: number; obligationGames?: number; apps: number; closed?: boolean }
/** Empréstimo encerrado: o histórico fica guardado (resultado, jogos e evolução). */
export interface LoanRecord { dealId: string; playerId: string; playerName: string; originId: string; hostId: string; season: number; fromDay: number; endDay: number; apps: number; strengthFrom: number; strengthTo: number; outcome: 'devolvido' | 'comprado-opcao' | 'comprado-obrigacao'; reason?: string; note: string }
/** Mudança contratual de um jogador (histórico). */
export interface ContractEvent { day: number; playerId: string; playerName: string; clubId: string; kind: 'novo' | 'renovou' | 'recusou' | 'fim' | 'aumento' | 'reducao'; wageFrom?: number; wageTo?: number; until?: number; note: string }
export interface TransferWindow { id: string; countryId: string; label: string; opens: number; closes: number }
export interface WindowEvent { id: string; event: 'aberta' | 'fechada'; day: number }
export interface Mood { since: number; reason: string; level: 1 | 2 | 3; want: 'sair' | 'aumento'; cooldown?: number }
export interface AgentOffer { id: string; agentId: string; playerId: string; clubId: string; day: number; expiresDay: number; ask: number; pitch: string; state: 'aberta' | 'aceita' | 'recusada' | 'expirada' }

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
/** Jogador de outro clube que você pegou emprestado (volta ao dono no fim da temporada). */
export interface LoanIn { playerId: string; ownerClubId: string; season: number }
/** Punição do fair play financeiro: o clube não pode contratar até o dia indicado (dias desde 1970). */
export interface TransferBan { clubId: string; since: number; until: number }

export interface GameState {
  version: 5;
  /** Geração do conteúdo do save (que sistemas ele já conhece). Ausente = save anterior a esse registro: é deduzido dos campos presentes. */
  schema?: number;
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
  loansIn?: LoanIn[]; // jogadores de outros clubes emprestados ao seu
  transferBan?: TransferBan; // transfer ban do fair play financeiro
  /** Últimas transferências feitas pela IA (jogador → de onde, para onde e quando): impede revender ou recontratar o mesmo jogador logo em seguida. */
  /** Treinadores controlados pela IA (empregados e desempregados) e quem treina cada clube (clubId -> id do treinador). */
  aiCoaches?: Record<string, AiCoach>;
  /** Categoria de base dos clubes da IA e empréstimos entre clubes da IA. */
  aiYouth?: Record<string, Prospect[]>;
  aiLoans?: AiLoan[];
  /** Mercado avançado (todos opcionais; saves antigos abrem sem eles). */
  deals?: Deal[];
  dealLog?: DealRecord[];
  debts?: Debt[];
  clauses?: ActiveClause[];
  loanDeals?: LoanDeal[];
  windowState?: { id: string | null; closingWarned?: string };
  windowLog?: WindowEvent[];
  /** Jogadores que os clubes da IA colocaram oficialmente à venda. */
  listed?: Record<string, { clubId: string; day: number; reason: string }>;
  mood?: Record<string, Mood>;
  agentOffers?: AgentOffer[];
  /** Último dia em que o mercado da IA foi processado (evita repetir a mesma decisão). */
  marketDay?: number;
  /** Quantas notícias de negócios entre clubes da IA já saíram no dia (o noticiário não pode ser engolido por elas). */
  aiNewsDay?: { day: number; n: number };
  /** Carga de jogos seguidos de cada jogador (rodízio dos clubes da IA). */
  load?: Record<string, number>;
  /** Partidas como titular de cada jogador na temporada (minutos jogados): alimenta a evolução, os bônus e o acompanhamento de empréstimos. */
  apps?: Record<string, number>;
  loanLog?: LoanRecord[];
  contractLog?: ContractEvent[];
  /** Renovações em conversa/recusadas: jogador -> {dia, tentativas, recusas}. */
  renewTalks?: Record<string, { day: number; tries: number; refusals: number; done?: boolean }>;
  /** Objetivos da temporada de cada clube, fixados no início dela (persistem mesmo se o clube sair de uma copa). */
  aiGoals?: Record<string, { season: number; league: string; extras: { kind: string; label: string }[] }>;
  /** Ajustes dos limites de elenco da IA (parciais sobre o padrão). */
  squadRules?: { total?: Partial<SquadLimits['total']>; pos?: Partial<Record<Position, Partial<SquadLimits['pos'][Position]>>>; age?: Partial<SquadLimits['age']> };
  clubCoach?: Record<string, string>;
  /** Jogadores livres no mercado (contrato acabou e não foi renovado): os clubes podem contratá-los sem pagar transferência. */
  freeAgents?: Player[];
  /** Gols dos campeonatos nacionais na temporada, por jogador (todos os clubes, não só o seu). Zera na virada. */
  scorers?: Record<string, { name: string; clubId: string; divisionId: string; g: number }>;
  aiMoves?: Record<string, { season: number; round: number; from: string; to: string }>;
  /** propostas da IA recusadas por jogador na temporada (limite de assédio: ninguém é alvo de todos os clubes) */
  chase?: Record<string, { season: number; n: number }>;
  /** Lesões (o jogo ainda não gera lesões; se existirem, a IA as considera): jogador → temporada e rodada em que volta. */
  injuries?: Record<string, Injury>;
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
  /** Overall do treinador (1 a 100): capacidade e reconhecimento profissional. */
  coachOverall?: number;
  /** Sequência atual de resultados do seu time (positivo = vitórias seguidas, negativo = derrotas seguidas). */
  coachStreak?: number;
  /** Proposta de contrato do início da temporada (uma por temporada). */
  coachOffer?: { season: number; clubId: string; status: 'pendente' | 'aceita' | 'recusada' | 'expirada'; salary: number; msgId?: string };
  /** Faixa salarial vigente: serve para avisar promoção/rebaixamento uma vez só. */
  payTier?: { clubId: string; tier: string; season: number };
  /** Último dia em que o salário foi pago (impede pagamento duplicado). */
  salaryPaidDay?: number;
  /** Último pagamento (para o extrato do banco registrar uma única vez, sem creditar de novo). */
  salaryPaid?: { day: number; amount: number; clubId: string; recorded?: boolean };
  /** Pressão de reputação por clube: temporadas seguidas com elenco no nível do porte acima. */
  repPressure?: Record<string, number>;
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
  /** Categorias de base do seu clube: academia (nível 0–5) e jovens em formação. */
  youth?: import('./youth').YouthState;
  /** Débito automático das mensalidades (plano de dados, NetFibra, aluguel e parcelas): ligado a menos que seja desligado. */
  autoDebit?: boolean;
  /** Carreira nova: só dá para avançar dias e jogar depois de alugar ou comprar uma casa. */
  homeRequired?: boolean;
  /** Negociação de salário: multiplicador sobre o salário-base do clube e a rodada de negociação do fim da temporada. */
  payMult?: number;
  salaryNeg?: { season: number; done: boolean; text: string };
  /** Calendário: dia atual, início da temporada e quantos jogos (eventos) já aconteceram nela. */
  cal?: { day: number; start: number; slot: number };
  /** Jogos do seu clube já disputados nesta temporada, com a data (para o Calendário). */
  played?: PlayedMatch[];
  /** Mensagens (patrocínios, coletivas, diretoria, torcida) e metas do celular. */
  inbox?: import('./inbox').InboxState;
  /** Estádio do seu clube: capacidade, conforto, preço do ingresso e público dos últimos jogos. */
  stadium?: import('./stadium').StadiumState;
  /** Balanço da temporada do seu clube. */
  ledger?: { season: number; gate: number; wages: number; coachCover: number; coachSalary: number };
  /** Clubes de outros países que disputam a Libertadores (ficam fora do campeonato e do mercado). */
  foreign?: { clubs: Record<string, ClubInfo>; teams: Record<string, TeamState> };
}
