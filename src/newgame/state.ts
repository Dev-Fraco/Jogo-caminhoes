import { getClub, type ClubData } from '../data/clubs';
import { getCountry, getDivision, getLeague } from '../data/world';

/**
 * Estado e regras do assistente "Novo Jogo".
 * As próximas etapas (mundo, clube, confirmação) entram como novos campos de NewGameState
 * e como implementação de uma etapa em STEPS — o resto do assistente não precisa mudar.
 */

export type ReputationId = 'unknown' | 'amateur' | 'semi-pro' | 'pro' | 'legend';

export interface Nationality { id: string; label: string }

export const NATIONALITIES: Nationality[] = [
  { id: 'BR', label: 'Brasil' },
  { id: 'AR', label: 'Argentina' },
  { id: 'PT', label: 'Portugal' },
  { id: 'ES', label: 'Espanha' },
  { id: 'EN', label: 'Inglaterra' },
  { id: 'IT', label: 'Itália' },
  { id: 'DE', label: 'Alemanha' },
  { id: 'FR', label: 'França' },
  { id: 'UY', label: 'Uruguai' },
  { id: 'CL', label: 'Chile' },
  { id: 'CO', label: 'Colômbia' },
  { id: 'BO', label: 'Bolívia' },
  { id: 'EC', label: 'Equador' },
  { id: 'PY', label: 'Paraguai' },
  { id: 'PE', label: 'Peru' },
  { id: 'VE', label: 'Venezuela' },
  { id: 'MX', label: 'México' },
  { id: 'JP', label: 'Japão' },
  { id: 'US', label: 'EUA' },
];

export interface Reputation { id: ReputationId; label: string; description: string; level: number }

export const REPUTATIONS: Reputation[] = [
  { id: 'unknown', label: 'Desconhecido', description: 'Nenhum clube grande confia em você ainda.', level: 1 },
  { id: 'amateur', label: 'Amador', description: 'Você começa em divisões inferiores.', level: 2 },
  { id: 'semi-pro', label: 'Semi-profissional', description: 'Alguma experiência, pouca visibilidade.', level: 3 },
  { id: 'pro', label: 'Profissional', description: 'Treinador respeitado no mercado.', level: 4 },
  { id: 'legend', label: 'Lenda', description: 'Nome forte, clubes grandes te procuram.', level: 5 },
];

/** Desafios (substituem a reputação inicial): decidem os clubes permitidos, a verba e a dificuldade. */
export type ChallengeId = 'easy' | 'normal' | 'hard' | 'legend' | 'create';
export interface Challenge { id: ChallengeId; label: string; description: string; level: number }
export const CHALLENGES: Challenge[] = [
  { id: 'easy', label: 'Fácil', description: 'Escolha qualquer time do mundo. Verba cheia e diretoria paciente.', level: 1 },
  { id: 'normal', label: 'Médio', description: 'Qualquer time, mas a verba do clube é cortada pela metade.', level: 2 },
  { id: 'hard', label: 'Difícil', description: 'Só clubes da Série B ou C, com verba ainda menor (1/4) e diretoria exigente.', level: 3 },
  { id: 'legend', label: 'Lendário', description: 'Só clubes que jogam apenas estaduais. Comece lá embaixo e chegue ao topo.', level: 4 },
  { id: 'create', label: 'Criar um clube', description: 'Crie o seu próprio clube e comece pelo estadual.', level: 5 },
];
/** Reputação do treinador de cada desafio (define o nível inicial e o dinheiro pessoal). */
export const CHALLENGE_REPUTATION: Record<ChallengeId, ReputationId> = { easy: 'pro', normal: 'semi-pro', hard: 'amateur', legend: 'unknown', create: 'unknown' };
export const CHALLENGE_DIFFICULTY: Record<ChallengeId, DifficultyId> = { easy: 'easy', normal: 'normal', hard: 'hard', legend: 'legend', create: 'legend' };
/** Quanto da verba do clube sobra em cada desafio. */
export const BUDGET_FACTOR: Record<ChallengeId, number> = { easy: 1, normal: 0.5, hard: 0.25, legend: 0.5, create: 1 };

/** O que cada desafio permite escolher no Mundo (null = tudo). */
export function challengeWorld(c: ChallengeId | ''): { countries: string[]; leagues: string[]; divisions: string[] } | null {
  if (c === 'hard') return { countries: ['BR'], leagues: ['brasileirao'], divisions: ['serie-b', 'serie-c'] };
  if (c === 'legend' || c === 'create') return { countries: ['BR'], leagues: ['brasileirao'], divisions: ['br-estaduais'] };
  return null;
}
/** Seleção de mundo imposta pelo desafio (só quando há uma única opção). */
export function lockedWorld(c: ChallengeId | ''): WorldSelection | null {
  return c === 'legend' || c === 'create' ? { countryId: 'BR', leagueId: 'brasileirao', divisionId: 'br-estaduais' } : null;
}
/** O clube escolhido vale neste desafio? */
export function clubAllowed(c: ChallengeId | '', divisionId: string, club: { custom?: boolean }): boolean {
  if (c === 'create') return !!club.custom && divisionId === 'br-estaduais';
  if (c === 'legend') return !club.custom && divisionId === 'br-estaduais';
  if (c === 'hard') return divisionId === 'serie-b' || divisionId === 'serie-c';
  return true;
}

export interface CoachProfile {
  name: string;
  nationality: string; // id de NATIONALITIES, '' = não escolhido
  reputation: ReputationId | ''; // derivada do desafio
  challenge: ChallengeId | ''; // '' = não escolhido
}

/** Etapa 2: ids de data/world.ts ('' = ainda não escolhido). */
export interface WorldSelection { countryId: string; leagueId: string; divisionId: string }

export type DifficultyId = 'easy' | 'normal' | 'hard' | 'legend';
export type GameModeId = 'career' | 'challenge' | 'infinite-money';

export interface Difficulty { id: DifficultyId; label: string; description: string; level: number }
export interface GameMode { id: GameModeId; label: string; description: string; /** recurso Premium bloqueado (não selecionável) */ locked?: boolean }

export const DIFFICULTIES: Difficulty[] = [
  { id: 'easy', label: 'Fácil', description: 'Orçamento maior, diretoria paciente e adversários mais fracos.', level: 1 },
  { id: 'normal', label: 'Normal', description: 'Equilíbrio entre desafio e recompensa. Recomendado para começar.', level: 2 },
  { id: 'hard', label: 'Difícil', description: 'Orçamento apertado, diretoria exigente e adversários mais fortes.', level: 3 },
  { id: 'legend', label: 'Lendário', description: 'Pouca margem de erro: demissão rápida, mercado caro e rivais impiedosos.', level: 4 },
];

/**
 * Desafio (Premium, futuro): o jogo sorteia um clube que joga SÓ campeonatos estaduais e o jogador o leva até a elite do Brasileirão.
 * Clube que disputa estadual E uma das Séries A–D do Brasileirão não pode ser sorteado (nem escolhido). Depende de os estaduais existirem.
 */
export const GAME_MODES: GameMode[] = [
  { id: 'career', label: 'Carreira de Treinador', description: 'Assuma o clube escolhido e conduza a carreira temporada após temporada.' },
];

/** Temporada inicial usada na sugestão do nome do save. */
export const START_SEASON = 2026;
export const SAVE_NAME_MIN = 2;
export const SAVE_NAME_MAX = 60;

/** Etapa 4. */
export interface GameSetup {
  difficulty: DifficultyId;
  mode: GameModeId;
  saveName: string;
  /** true quando o jogador editou o nome do save; enquanto false, o nome acompanha a sugestão. */
  saveNameEdited: boolean;
}

export interface NewGameState {
  coach: CoachProfile; // Etapa 1
  world: WorldSelection; // Etapa 2
  club: ClubData | null; // Etapa 3 (clube completo; null = ainda não escolhido)
  setup: GameSetup; // Etapa 4
  // Etapa 4 (confirmação):  setup?: { difficulty, mode, saveName }
}

export const createNewGameState = (): NewGameState => ({
  coach: { name: '', nationality: '', reputation: '', challenge: '' },
  world: { countryId: '', leagueId: '', divisionId: '' },
  club: null,
  setup: { difficulty: 'normal', mode: 'career', saveName: '', saveNameEdited: false },
});

/** Atualiza a Etapa 2. Se a divisão mudou, o clube escolhido deixa de valer e é limpo. */
export function applyWorld(state: NewGameState, world: WorldSelection): NewGameState {
  return { ...state, world, club: world.divisionId === state.world.divisionId ? state.club : null };
}

export const NAME_MIN = 2;
export const NAME_MAX = 40;

export interface CoachErrors { name?: string; nationality?: string; challenge?: string }

export function validateCoach(c: CoachProfile): CoachErrors {
  const errors: CoachErrors = {};
  const name = c.name.trim();
  if (!name) errors.name = 'Informe o nome do treinador.';
  else if (name.length < NAME_MIN) errors.name = `O nome precisa ter pelo menos ${NAME_MIN} caracteres.`;
  else if (name.length > NAME_MAX) errors.name = `O nome pode ter no máximo ${NAME_MAX} caracteres.`;
  if (!NATIONALITIES.some((n) => n.id === c.nationality)) errors.nationality = 'Selecione a nacionalidade.';
  if (!CHALLENGES.some((x) => x.id === c.challenge)) errors.challenge = 'Escolha o desafio.';
  return errors;
}

export interface WorldErrors { country?: string; league?: string; division?: string }

/** Mostra só o erro do primeiro nível que falta: país, depois liga, depois divisão. */
export function validateWorld(w: WorldSelection): WorldErrors {
  if (!getCountry(w.countryId)) return { country: 'Selecione um país.' };
  if (!getLeague(w.countryId, w.leagueId)) return { league: 'Selecione uma liga.' };
  if (!getDivision(w.countryId, w.leagueId, w.divisionId)) return { division: 'Selecione uma divisão.' };
  return {};
}

/** Sugestão de nome do save: "Treinador - Clube - 2026" (cortada para caber em SAVE_NAME_MAX). */
export function suggestSaveName(coachName: string, clubName: string): string {
  const tail = ` - ${clubName} - ${START_SEASON}`;
  const coach = coachName.trim();
  const room = Math.max(0, SAVE_NAME_MAX - tail.length);
  return `${coach.length > room ? coach.slice(0, Math.max(0, room - 1)).trimEnd() + '…' : coach}${tail}`;
}

/** Enquanto o jogador não editou o nome do save, mantém a sugestão em dia com treinador e clube. */
export function syncSaveName(state: NewGameState): NewGameState {
  if (state.setup.saveNameEdited || !state.club) return state;
  const saveName = suggestSaveName(state.coach.name, state.club.name);
  return saveName === state.setup.saveName ? state : { ...state, setup: { ...state.setup, saveName } };
}

export interface SetupErrors { difficulty?: string; mode?: string; saveName?: string }

export function validateSetup(u: GameSetup): SetupErrors {
  const errors: SetupErrors = {};
  if (!DIFFICULTIES.some((d) => d.id === u.difficulty)) errors.difficulty = 'Escolha a dificuldade.';
  const mode = GAME_MODES.find((m) => m.id === u.mode);
  if (!mode || mode.locked) errors.mode = 'Escolha um modo de jogo disponível.';
  const n = u.saveName.trim().length;
  if (n === 0) errors.saveName = 'Dê um nome ao save.';
  else if (n < SAVE_NAME_MIN) errors.saveName = `O nome precisa ter pelo menos ${SAVE_NAME_MIN} caracteres.`;
  else if (n > SAVE_NAME_MAX) errors.saveName = `O nome pode ter no máximo ${SAVE_NAME_MAX} caracteres.`;
  return errors;
}

export type StepId = 'coach' | 'world' | 'club' | 'confirm';

export interface StepDef {
  id: StepId;
  title: string;
  subtitle?: string;
  /** false = placeholder "Em breve": o botão Avançar fica bloqueado nesta etapa. */
  implemented: boolean;
  /** A etapa está completa? Usado para liberar o Avançar e os saltos pelo indicador de etapas. */
  isValid: (s: NewGameState) => boolean;
}

export const STEPS: StepDef[] = [
  { id: 'coach', title: 'Perfil do Treinador', implemented: true, isValid: (s) => Object.keys(validateCoach(s.coach)).length === 0 },
  { id: 'world', title: 'Mundo', subtitle: 'País, Ligas, Divisões', implemented: true, isValid: (s) => Object.keys(validateWorld(s.world)).length === 0 },
  { id: 'club', title: 'Escolha do Clube', implemented: true, isValid: (s) => !!s.club && (!!getClub(s.world.divisionId, s.club.id) || (!!s.club.custom && s.world.divisionId === 'br-estaduais')) && clubAllowed(s.coach.challenge, s.world.divisionId, s.club) },
  { id: 'confirm', title: 'Confirmação', subtitle: 'Resumo, Modo de Jogo, Nome do Save', implemented: true, isValid: (s) => Object.keys(validateSetup(s.setup)).length === 0 },
];

/** Tudo preenchido? (todas as etapas válidas) */
export const isWizardComplete = (s: NewGameState) => STEPS.every((st) => st.isValid(s));
