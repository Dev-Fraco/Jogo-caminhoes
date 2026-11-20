/** Recursos Premium, com o texto das telas de prévia (cadeado). */
export type FeatureId = 'world' | 'nordeste' | 'verde' | 'super' | 'africa' | 'foreign' | '3d';
export const FEATURES: Record<FeatureId, { icon: string; title: string; text: string; bullets: string[] }> = {
  world: { icon: '🌍', title: 'Mundo', text: 'Acompanhe as ligas do mundo inteiro: resultados e tabelas de todas as divisões, rodada a rodada.', bullets: ['Brasil, América do Sul e Europa', 'Tabelas e resultados ao vivo', 'Vender e comprar jogadores no exterior'] },
  nordeste: { icon: '🌵', title: 'Copa do Nordeste', text: 'Os 4 melhores de cada estado do Nordeste, em 6 grupos e mata-mata, com prêmios em dinheiro.', bullets: ['36 clubes de 9 estados', 'Grupos, oitavas, quartas, semifinal e final', 'Prêmio de até R$ 12 milhões'] },
  verde: { icon: '🌳', title: 'Copa Verde', text: 'Norte, Centro-Oeste e Espírito Santo: os 2 melhores de cada estado disputam o título.', bullets: ['24 clubes de 12 estados', 'Grupos e mata-mata', 'Prêmio de até R$ 8 milhões'] },
  super: { icon: '🌐', title: 'Super Mundial de Clubes', text: 'A cada 4 anos, os últimos campeões da Libertadores, da Champions, da África e da Arábia se enfrentam.', bullets: ['16 clubes e 4 grupos', 'Prêmio de R$ 250 milhões ao campeão', 'Copas da África e da Arábia nos bastidores'] },
  africa: { icon: '🌍', title: 'Copas da África e da Arábia', text: 'Campeões e vices das copas africana e árabe, que alimentam o Super Mundial.', bullets: ['Histórico de campeões', 'Os últimos 4 de cada copa vão ao Super Mundial'] },
  foreign: { icon: '💶', title: 'Vendas ao exterior', text: 'Clubes de outros países fazem propostas pelos seus jogadores, com pagamento à vista.', bullets: ['Propostas automáticas', 'Contraproposta de +15%'] },
  '3d': { icon: '🎥', title: 'Partida em 3D completa', text: 'Entrada das equipes, hino com mosaico da torcida, câmera do treinador e centenas de animações.', bullets: ['Estádio com torcida', 'Cerimônia e mosaico do escudo', 'Jogadores com passes, desarmes e dribles'] },
};
