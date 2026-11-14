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

export interface CoachProfile {
  name: string;
  nationality: string; // id de NATIONALITIES, '' = não escolhido
  reputation: ReputationId | ''; // '' = não escolhido
}

/** Etapa 2: ids de data/world.ts ('' = ainda não escolhido). */
export interface WorldSelection { countryId: string; leagueId: string; divisionId: string }

export interface NewGameState {
  coach: CoachProfile; // Etapa 1
  world: WorldSelection; // Etapa 2
  // Etapa 3 (clube):        club?: { clubId }
  // Etapa 4 (confirmação):  setup?: { difficulty, mode, saveName }
}

export const createNewGameState = (): NewGameState => ({
  coach: { name: '', nationality: '', reputation: '' },
  world: { countryId: '', leagueId: '', divisionId: '' },
});

export const NAME_MIN = 2;
export const NAME_MAX = 40;

export interface CoachErrors { name?: string; nationality?: string; reputation?: string }

export function validateCoach(c: CoachProfile): CoachErrors {
  const errors: CoachErrors = {};
  const name = c.name.trim();
  if (!name) errors.name = 'Informe o nome do treinador.';
  else if (name.length < NAME_MIN) errors.name = `O nome precisa ter pelo menos ${NAME_MIN} caracteres.`;
  else if (name.length > NAME_MAX) errors.name = `O nome pode ter no máximo ${NAME_MAX} caracteres.`;
  if (!NATIONALITIES.some((n) => n.id === c.nationality)) errors.nationality = 'Selecione a nacionalidade.';
  if (!REPUTATIONS.some((r) => r.id === c.reputation)) errors.reputation = 'Escolha a reputação inicial.';
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
  { id: 'club', title: 'Escolha do Clube', implemented: false, isValid: () => false },
  { id: 'confirm', title: 'Confirmação', subtitle: 'Dificuldade, Modo de Jogo, Nome do Save', implemented: false, isValid: () => false },
];
