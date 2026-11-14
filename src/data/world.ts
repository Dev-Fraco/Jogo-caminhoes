/**
 * Mundo do jogo: países → ligas → divisões.
 * Usado pelo assistente de Novo Jogo (Etapa 2) e, depois, pela Etapa 3 para listar os clubes da divisão escolhida.
 * Os números de times são aproximados e podem ser ajustados aqui sem mexer na interface.
 */

export interface Division {
  /** Único no mundo todo (ex.: 'it-serie-a'), pois CLUBS_DATA é indexado só por este id. */
  id: string;
  name: string;
  /** Nome local da divisão, mostrado como apoio (ex.: "Championship"). */
  alias?: string;
  teams: number;
}

export interface League {
  id: string;
  name: string;
  description: string;
  /** Da principal (1ª divisão) para as inferiores. */
  divisions: Division[];
}

export interface Country {
  name: string;
  flag: string; // emoji de bandeira
  leagues: League[];
}

export const WORLD_DATA: Record<string, Country> = {
  BR: {
    name: 'Brasil', flag: '🇧🇷',
    leagues: [{
      id: 'brasileirao', name: 'Campeonato Brasileiro', description: 'Campeonato nacional de pontos corridos, com acesso e rebaixamento entre as séries.',
      divisions: [
        { id: 'serie-a', name: 'Série A', teams: 20 },
        { id: 'serie-b', name: 'Série B', teams: 20 },
        { id: 'serie-c', name: 'Série C', teams: 20 },
        { id: 'serie-d', name: 'Série D', teams: 96 },
      ],
    }],
  },
  AR: {
    name: 'Argentina', flag: '🇦🇷',
    leagues: [{
      id: 'liga-profesional', name: 'Liga Profesional', description: 'Campeonato nacional de pontos corridos da Argentina.',
      divisions: [
        { id: 'ar-primera', name: '1ª Divisão', alias: 'Primera División', teams: 30 },
        { id: 'ar-nacional', name: '2ª Divisão', alias: 'Primera Nacional', teams: 34 },
      ],
    }],
  },
  EN: {
    name: 'Inglaterra', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
    leagues: [{
      id: 'premier-league', name: 'Premier League', description: 'Campeonato nacional de pontos corridos da Inglaterra.',
      divisions: [
        { id: 'premier', name: '1ª Divisão', alias: 'Premier League', teams: 20 },
        { id: 'championship', name: '2ª Divisão', alias: 'Championship', teams: 24 },
        { id: 'league-one', name: '3ª Divisão', alias: 'League One', teams: 24 },
      ],
    }],
  },
  ES: {
    name: 'Espanha', flag: '🇪🇸',
    leagues: [{
      id: 'la-liga', name: 'La Liga', description: 'Campeonato nacional de pontos corridos da Espanha.',
      divisions: [
        { id: 'es-primera', name: '1ª Divisão', alias: 'La Liga', teams: 20 },
        { id: 'es-segunda', name: '2ª Divisão', alias: 'Segunda División', teams: 22 },
      ],
    }],
  },
  IT: {
    name: 'Itália', flag: '🇮🇹',
    leagues: [{
      id: 'serie-a-it', name: 'Serie A', description: 'Campeonato nacional de pontos corridos da Itália.',
      divisions: [
        { id: 'it-serie-a', name: '1ª Divisão', alias: 'Serie A', teams: 20 },
        { id: 'it-serie-b', name: '2ª Divisão', alias: 'Serie B', teams: 20 },
      ],
    }],
  },
  DE: {
    name: 'Alemanha', flag: '🇩🇪',
    leagues: [{
      id: 'bundesliga', name: 'Bundesliga', description: 'Campeonato nacional de pontos corridos da Alemanha.',
      divisions: [
        { id: 'bundesliga', name: '1ª Divisão', alias: 'Bundesliga', teams: 18 },
        { id: 'bundesliga-2', name: '2ª Divisão', alias: '2. Bundesliga', teams: 18 },
      ],
    }],
  },
  FR: {
    name: 'França', flag: '🇫🇷',
    leagues: [{
      id: 'ligue-1', name: 'Ligue 1', description: 'Campeonato nacional de pontos corridos da França.',
      divisions: [
        { id: 'ligue-1', name: '1ª Divisão', alias: 'Ligue 1', teams: 18 },
        { id: 'ligue-2', name: '2ª Divisão', alias: 'Ligue 2', teams: 18 },
      ],
    }],
  },
  PT: {
    name: 'Portugal', flag: '🇵🇹',
    leagues: [{
      id: 'primeira-liga', name: 'Primeira Liga', description: 'Campeonato nacional de pontos corridos de Portugal.',
      divisions: [
        { id: 'pt-primeira', name: '1ª Divisão', alias: 'Primeira Liga', teams: 18 },
        { id: 'pt-segunda', name: '2ª Divisão', alias: 'Liga Portugal 2', teams: 18 },
      ],
    }],
  },
};

/** Ordem de exibição dos países. */
export const COUNTRY_ORDER = ['BR', 'AR', 'EN', 'ES', 'IT', 'DE', 'FR', 'PT'] as const;

export const getCountry = (id: string): Country | undefined => WORLD_DATA[id];
export const getLeague = (countryId: string, leagueId: string): League | undefined =>
  WORLD_DATA[countryId]?.leagues.find((l) => l.id === leagueId);
export const getDivision = (countryId: string, leagueId: string, divisionId: string): Division | undefined =>
  getLeague(countryId, leagueId)?.divisions.find((d) => d.id === divisionId);
/** A divisão principal é sempre a primeira da liga. */
export const isPrincipal = (league: League, division: Division) => league.divisions[0]?.id === division.id;
