/** Recursos Premium, com o texto das telas de prévia (cadeado). */
export type FeatureId = 'mods' | 'leagues' | 'world' | 'nordeste' | 'verde' | 'super' | 'africa' | 'foreign';
export const FEATURES: Record<FeatureId, { icon: string; title: string; text: string; bullets: string[] }> = {
  mods: { icon: '', title: 'Mods da comunidade', text: 'Instale pacotes criados pela comunidade: nomes, escudos, uniformes, elencos e competições.', bullets: ['Pacotes de clubes, elencos e escudos', 'Uniformes e nomes de competições', 'Incluído no Premium'] },
  leagues: { icon: '🏆', title: 'Outras ligas e copas', text: 'Depois da temporada grátis, o jogo grátis fica só com a liga do seu clube. O Premium libera tudo de volta.', bullets: ['Todas as divisões do campeonato e a classificação delas', 'Copa nacional, estaduais e copas continentais', 'Mundial de clubes', 'Sem anúncios'] },
  world: { icon: '🌍', title: 'Mundo', text: 'Acompanhe as ligas do mundo inteiro: resultados e tabelas de todas as divisões, rodada a rodada.', bullets: ['Brasil, América do Sul e Europa', 'Tabelas e resultados ao vivo', 'Vender e comprar jogadores no exterior'] },
  nordeste: { icon: '🌵', title: 'Copa do Nordeste', text: 'Os 4 melhores de cada estado do Nordeste, em 6 grupos e mata-mata, com prêmios em dinheiro.', bullets: ['36 clubes de 9 estados', 'Grupos, oitavas, quartas, semifinal e final', 'Prêmio de até R$ 12 milhões'] },
  verde: { icon: '🌳', title: 'Copa Verde', text: 'Norte, Centro-Oeste e Espírito Santo: os 2 melhores de cada estado disputam o título.', bullets: ['24 clubes de 12 estados', 'Grupos e mata-mata', 'Prêmio de até R$ 8 milhões'] },
  super: { icon: '🌐', title: 'Super Mundial de Clubes', text: 'A cada 4 anos, os últimos campeões da Libertadores, da Champions, da África e da Arábia se enfrentam.', bullets: ['16 clubes e 4 grupos', 'Prêmio de R$ 250 milhões ao campeão', 'Copas da África e da Arábia nos bastidores'] },
  africa: { icon: '🌍', title: 'Copas da África e da Arábia', text: 'Campeões e vices das copas africana e árabe, que alimentam o Super Mundial.', bullets: ['Histórico de campeões', 'Os últimos 4 de cada copa vão ao Super Mundial'] },
  foreign: { icon: '💶', title: 'Vendas ao exterior', text: 'Clubes de outros países fazem propostas pelos seus jogadores, com pagamento à vista.', bullets: ['Propostas automáticas', 'Contraproposta de +15%'] },
};
