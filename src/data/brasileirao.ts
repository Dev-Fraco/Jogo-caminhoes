import type { DataPack } from '../engine/types';

/**
 * Pacote de dados padrão do MVP: Brasileirão Série A (nomes reais, SEM escudos).
 * Elencos são gerados pelo jogo com nomes fictícios; "strength" define a força do clube.
 * Para editar/atualizar a lista de clubes, basta mexer aqui ou importar um pacote .json.
 */
const c = (id: string, name: string, short: string, color: string, strength: number) => ({ id, name, short, color, strength });

export const BRASILEIRAO: DataPack = {
  format: 'caminhoes-pack-v1',
  id: 'brasileirao-serie-a',
  name: 'Brasileirão Série A',
  league: {
    name: 'Campeonato Brasileiro Série A',
    clubs: [
      c('fla', 'Flamengo', 'FLA', '#c8102e', 84),
      c('pal', 'Palmeiras', 'PAL', '#006437', 83),
      c('cru', 'Cruzeiro', 'CRU', '#0033a0', 77),
      c('bot', 'Botafogo', 'BOT', '#222222', 77),
      c('flu', 'Fluminense', 'FLU', '#8a1538', 75),
      c('bah', 'Bahia', 'BAH', '#005baa', 74),
      c('sap', 'São Paulo', 'SAO', '#e4002b', 74),
      c('cor', 'Corinthians', 'COR', '#111111', 73),
      c('gre', 'Grêmio', 'GRE', '#0d80bf', 73),
      c('int', 'Internacional', 'INT', '#d71920', 73),
      c('cam', 'Atlético-MG', 'CAM', '#000000', 74),
      c('vas', 'Vasco da Gama', 'VAS', '#333333', 71),
      c('san', 'Santos', 'SAN', '#555555', 70),
      c('rbb', 'Red Bull Bragantino', 'RBB', '#d2232a', 70),
      c('cap', 'Athletico-PR', 'CAP', '#c8102e', 70),
      c('mir', 'Mirassol', 'MIR', '#f2c200', 66),
      c('vit', 'Vitória', 'VIT', '#b3000c', 65),
      c('cor2', 'Coritiba', 'CFC', '#00553a', 64),
      c('cha', 'Chapecoense', 'CHA', '#00873e', 62),
      c('rem', 'Remo', 'REM', '#0a2a66', 62),
    ],
  },
};
