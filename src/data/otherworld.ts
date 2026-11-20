import { build, type ClubData, type Row } from './clubs';

/**
 * Clubes fictícios da África e da Arábia: disputam, "nos bastidores", a Copa dos Campeões da África e a Copa dos Campeões Árabes
 * (um campeão por temporada). Os últimos 4 campeões de cada uma vão ao Super Mundial de Clubes. Ficam fora das ligas do jogo.
 */
const AFRICA: Row[] = [
  ['afr-baoba', 'Baobá Atlético Clube', 'BAO', '#1B7F3B', '#F2C200', 'Estádio do Baobá', 'Dacar do Sul', 60, 'title', 4],
  ['afr-nilo', 'Nilo Sporting', 'NIL', '#C8102E', '#FFFFFF', 'Arena do Nilo', 'Cairo Novo', 70, 'title', 4],
  ['afr-sahel', 'Sahel Unidos', 'SAH', '#F2C200', '#111111', 'Estádio das Dunas', 'Bamaco', 40, 'top4', 3],
  ['afr-acacia', 'Acácia FC', 'ACA', '#0A4FA3', '#FFFFFF', 'Parque Acácia', 'Acra Velha', 45, 'top4', 3],
  ['afr-kilima', 'Kilima Real', 'KIR', '#00873E', '#111111', 'Estádio Kilima', 'Nairóbi Alto', 50, 'top4', 3],
  ['afr-zambeze', 'Zambeze Clube', 'ZAB', '#D2232A', '#F2C200', 'Complexo Zambeze', 'Lusaca', 35, 'mid', 3],
  ['afr-atlas', 'Atlas do Norte', 'ATN', '#7A1230', '#FFFFFF', 'Estádio Atlas', 'Casablanca Nova', 65, 'title', 4],
  ['afr-congo', 'Rio Congo SC', 'RCS', '#003DA5', '#F2C200', 'Arena do Rio', 'Quinxassa', 40, 'mid', 3],
  ['afr-lago', 'Lago Azul FC', 'LAZ', '#1E88E5', '#FFFFFF', 'Estádio do Lago', 'Kampala', 30, 'mid', 3],
  ['afr-dunas', 'Dunas do Cabo', 'DUC', '#111111', '#F2C200', 'Estádio do Cabo', 'Cidade do Cabo Nova', 55, 'top4', 4],
  ['afr-mara', 'Mara Leões', 'MAL', '#F2A900', '#111111', 'Parque Mara', 'Arusha', 28, 'mid', 3],
  ['afr-kalahari', 'Kalahari Stars', 'KAS', '#00553A', '#FFFFFF', 'Estádio Kalahari', 'Gaborone', 25, 'mid', 2],
];
const ARABIA: Row[] = [
  ['ara-oasis', 'Oásis Dourado', 'OAD', '#F2C200', '#111111', 'Estádio do Oásis', 'Riade Nova', 120, 'title', 4],
  ['ara-falcoes', 'Falcões do Deserto', 'FAD', '#006437', '#FFFFFF', 'Arena dos Falcões', 'Jidá Alta', 110, 'title', 4],
  ['ara-tamar', 'Tamareira SC', 'TMR', '#8B1E3F', '#FFFFFF', 'Parque Tamareira', 'Doha Velha', 90, 'top4', 4],
  ['ara-golfo', 'Golfo Real', 'GOR', '#0033A0', '#FFFFFF', 'Estádio do Golfo', 'Abu Dabi do Sul', 130, 'title', 5],
  ['ara-dunas', 'Dunas de Ouro', 'DOU', '#D2232A', '#F2C200', 'Estádio das Dunas Douradas', 'Mascate', 70, 'top4', 3],
  ['ara-crescente', 'Crescente Azul', 'CRZ', '#1565C0', '#FFFFFF', 'Complexo Crescente', 'Manama Nova', 80, 'top4', 4],
  ['ara-lua', 'Lua Cheia FC', 'LUC', '#111111', '#FFFFFF', 'Arena da Lua', 'Kuwait Novo', 75, 'top4', 3],
  ['ara-palmeiral', 'Palmeiral Clube', 'PAC', '#00873E', '#F2C200', 'Estádio Palmeiral', 'Bagdá Alta', 50, 'mid', 3],
  ['ara-cidadela', 'Cidadela do Sol', 'CDS', '#F2A900', '#7A1230', 'Cidadela Arena', 'Amã Nova', 55, 'mid', 3],
  ['ara-miragem', 'Miragem Atlético', 'MIR', '#7A1230', '#F2C200', 'Estádio Miragem', 'Damasco Novo', 45, 'mid', 3],
  ['ara-beduinos', 'Beduínos SC', 'BED', '#006437', '#111111', 'Parque dos Beduínos', 'Sanaa Alta', 40, 'mid', 2],
  ['ara-sultanato', 'Sultanato United', 'SUL', '#0A3D91', '#F2C200', 'Estádio do Sultanato', 'Dubai do Norte', 100, 'title', 4],
];
export const OTHER_CLUBS: Record<'africa' | 'arab', ClubData[]> = { africa: build(AFRICA, -2), arab: build(ARABIA, -2) };
export const otherClub = (id: string): ClubData | undefined => [...OTHER_CLUBS.africa, ...OTHER_CLUBS.arab].find((c) => c.id === id);
