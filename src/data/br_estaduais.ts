/**
 * Campeonatos estaduais e clubes cadastrados (fonte: PDF "Vida Real FC — campeonatos estaduais e clubes", 27 competições, 346 clubes).
 * A lista reproduz os nomes cadastrados no projeto; não é uma conferência de participantes oficiais da temporada.
 * A ordem dentro de cada estado é a do arquivo (os clubes maiores costumam vir primeiro).
 */
export interface Estadual { uf: string; state: string; name: string; clubs: string[] }

export const ESTADUAIS: Estadual[] = [
  { uf: 'AC', state: 'Acre', name: 'Campeonato Acreano', clubs: ['Rio Branco-AC', 'Galvez', 'Independência-AC', 'Vasco-AC', 'Andirá', 'ADESG', 'Náuas', 'São Francisco-AC'] },
  { uf: 'AL', state: 'Alagoas', name: 'Campeonato Alagoano', clubs: ['CRB', 'CSA', 'ASA', 'CSE', 'Coruripe', 'Penedense', 'Murici', 'Dimensão Saúde', 'Igaci', 'Força e Luz-AL'] },
  { uf: 'AM', state: 'Amazonas', name: 'Campeonato Amazonense', clubs: ['Amazonas', 'Manaus', 'Nacional-AM', 'São Raimundo-AM', 'Penarol-AM', 'Princesa do Solimões', 'Parintins', 'Itacoatiara'] },
  { uf: 'AP', state: 'Amapá', name: 'Campeonato Amapaense', clubs: ['Trem', 'Ypiranga-AP', 'Santos-AP', 'Independente-AP', 'São José-AP', 'Oratório', 'Macapá', 'Cristal'] },
  { uf: 'BA', state: 'Bahia', name: 'Campeonato Baiano', clubs: ['Bahia', 'Vitória', 'Juazeirense', 'Jacuipense', 'Atlético de Alagoinhas', 'Bahia de Feira', 'Barcelona de Ilhéus', 'Jequié', 'Galícia', 'Ypiranga-BA', 'Colo-Colo', 'UNIRB', 'Porto-BA', 'Fluminense de Feira', 'Jacobina'] },
  { uf: 'CE', state: 'Ceará', name: 'Campeonato Cearense', clubs: ['Fortaleza', 'Ceará', 'Ferroviário', 'Floresta', 'Iguatu', 'Maracanã', 'Horizonte', 'Caucaia', 'Quixadá', 'Crato', 'Icasa', 'Crateús', 'Guarany de Sobral', 'Maranguape', 'Itapipoca'] },
  { uf: 'DF', state: 'Distrito Federal', name: 'Campeonato Brasiliense', clubs: ['Brasiliense', 'Gama', 'Capital-DF', 'Real Brasília', 'Ceilândia', 'Sobradinho', 'Samambaia', 'Taguatinga', 'Luziânia', 'Formosa', 'Brasília', 'Bolamense'] },
  { uf: 'ES', state: 'Espírito Santo', name: 'Campeonato Capixaba', clubs: ['Rio Branco-ES', 'Desportiva Ferroviária', 'Vitória-ES', 'Serra', 'Real Noroeste', 'Nova Venécia', 'Estrela do Norte', 'Linhares', 'Porto Vitória', 'Vilavelhense', 'São Mateus', 'Cachoeiro'] },
  { uf: 'GO', state: 'Goiás', name: 'Campeonato Goiano', clubs: ['Goiás', 'Vila Nova', 'Atlético-GO', 'Anápolis', 'Aparecidense', 'CRAC', 'Goianésia', 'Goiatuba', 'Morrinhos', 'Inhumas', 'Iporá', 'Mineiros', 'Grêmio Anápolis', 'Jataiense'] },
  { uf: 'MA', state: 'Maranhão', name: 'Campeonato Maranhense', clubs: ['Sampaio Corrêa', 'Moto Club', 'Maranhão', 'Imperatriz', 'IAPE', 'Cordino', 'Tuntum', 'São José-MA', 'Expressinho', 'Pinheiro', 'Juventude-MA'] },
  { uf: 'MG', state: 'Minas Gerais', name: 'Campeonato Mineiro', clubs: ['Atlético-MG', 'Cruzeiro', 'América-MG', 'Athletic-MG', 'Tombense', 'Pouso Alegre', 'URT', 'Democrata-GV', 'Itabirito', 'Mamoré', 'Uberaba', 'Aymorés', 'Coimbra-MG', 'Betim', 'Patrocinense', 'Villa Nova-MG', 'Ipatinga', 'Boa Esporte'] },
  { uf: 'MS', state: 'Mato Grosso do Sul', name: 'Campeonato Sul-Mato-Grossense', clubs: ['Operário-MS', 'Costa Rica-MS', 'Dourados', 'Ivinhema', 'Corumbaense', 'Pantanal', 'Coxim-MS', 'SERC-MS'] },
  { uf: 'MT', state: 'Mato Grosso', name: 'Campeonato Mato-Grossense', clubs: ['Cuiabá', 'União Rondonópolis', 'Luverdense', 'Mixto', 'Operário-VG', 'Nova Mutum', 'Sinop', 'Primavera-MT', 'Academia', 'Grêmio Sorriso', 'Chapada', 'Araguaia'] },
  { uf: 'PA', state: 'Pará', name: 'Campeonato Paraense', clubs: ['Remo', 'Paysandu', 'Águia de Marabá', 'Castanhal', 'Tuna Luso', 'São Raimundo-PA', 'São Francisco-PA', 'Bragantino-PA', 'Cametá', 'Paragominas', 'Pinheirense', 'Tapajós', 'Ananindeua'] },
  { uf: 'PB', state: 'Paraíba', name: 'Campeonato Paraibano', clubs: ['Botafogo-PB', 'Treze', 'Campinense', 'Sousa', 'Nacional de Patos', 'Serra Branca', 'Pombal', 'Atlético-PB', 'Auto Esporte-PB', 'Esporte de Patos'] },
  { uf: 'PE', state: 'Pernambuco', name: 'Campeonato Pernambucano', clubs: ['Sport', 'Náutico', 'Santa Cruz', 'Retrô', 'Afogados', 'Salgueiro', 'Central', 'Porto-PE', 'Maguary', 'Íbis', 'Jaguar', 'América-PE', 'Belo Jardim', 'Vera Cruz', 'Decisão'] },
  { uf: 'PI', state: 'Piauí', name: 'Campeonato Piauiense', clubs: ['Altos', 'River-PI', 'Fluminense-PI', 'Parnahyba', 'Piauí', 'Picos', 'Oeirense', 'Corissabá', 'Comercial-PI', 'Caiçara'] },
  { uf: 'PR', state: 'Paraná', name: 'Campeonato Paranaense', clubs: ['Athletico-PR', 'Coritiba', 'Operário-PR', 'Londrina', 'Maringá', 'Cianorte', 'FC Cascavel', 'Azuriz', 'Rio Branco-PR', 'Foz do Iguaçu', 'Paraná Clube', 'Toledo', 'Independente-PR', 'Nacional-PR', 'Andraus', 'Araucária'] },
  { uf: 'RJ', state: 'Rio de Janeiro', name: 'Campeonato Carioca', clubs: ['Flamengo', 'Fluminense', 'Botafogo', 'Vasco', 'Volta Redonda', 'Nova Iguaçu', 'Boavista', 'Bangu', 'Portuguesa-RJ', 'Madureira', 'Resende', 'Cabofriense', 'Olaria', 'America-RJ', 'Friburguense', 'Maricá', 'Duque de Caxias', 'Serrano-RJ'] },
  { uf: 'RN', state: 'Rio Grande do Norte', name: 'Campeonato Potiguar', clubs: ['ABC', 'América-RN', 'Potiguar de Mossoró', 'Globo FC', 'Santa Cruz de Natal', 'Alecrim', 'Baraúnas', 'Mossoró', 'Corintians de Caicó', 'Visão Celeste'] },
  { uf: 'RO', state: 'Rondônia', name: 'Campeonato Rondoniense', clubs: ['Porto Velho', 'Ji-Paraná', 'Guaporé', 'Rondoniense', 'Genus', 'Barcelona-RO', 'Rolim de Moura'] },
  { uf: 'RR', state: 'Roraima', name: 'Campeonato Roraimense', clubs: ['São Raimundo-RR', 'GAS', 'Atlético-RR', 'Baré', 'River-RR', 'Náutico-RR', 'Progresso', 'Monte Roraima'] },
  { uf: 'RS', state: 'Rio Grande do Sul', name: 'Campeonato Gaúcho', clubs: ['Grêmio', 'Internacional', 'Juventude', 'Caxias', 'Brasil de Pelotas', 'Ypiranga-RS', 'São Luiz', 'Novo Hamburgo', 'São José-RS', 'Pelotas', 'Aimoré', 'Guarany de Bagé', 'Monsoon', 'Glória', 'Passo Fundo', 'Veranópolis'] },
  { uf: 'SC', state: 'Santa Catarina', name: 'Campeonato Catarinense', clubs: ['Avaí', 'Figueirense', 'Chapecoense', 'Criciúma', 'Joinville', 'Brusque', 'Barra', 'Marcílio Dias', 'Concórdia', 'Hercílio Luz', 'Juventus-SC', 'Camboriú', 'Carlos Renaux', 'Próspera', 'Fluminense-SC'] },
  { uf: 'SE', state: 'Sergipe', name: 'Campeonato Sergipano', clubs: ['Confiança', 'Sergipe', 'Itabaiana', 'Lagarto', 'Falcon', 'Dorense', 'Estanciano', 'Freipaulistano', 'Boca Júnior', 'Gloriense', 'Olímpico', 'Guarany-SE', 'Canindé'] },
  { uf: 'SP', state: 'São Paulo', name: 'Campeonato Paulista', clubs: ['Palmeiras', 'Corinthians', 'São Paulo', 'Santos', 'Bragantino', 'Mirassol', 'Novorizontino', 'Ponte Preta', 'Guarani', 'Ituano', 'Portuguesa', 'São Bernardo', 'Ferroviária', 'Inter de Limeira', 'Juventus-SP', 'XV de Piracicaba', 'Noroeste', 'Comercial-SP', 'Linense', 'Marília', 'Monte Azul', 'Rio Claro', 'Rio Preto', 'Votuporanguense', 'Taubaté', 'Sertãozinho', 'Barretos', 'Nacional-SP', 'Penapolense', 'Desportivo Brasil', 'Santo André', 'Capivariano', 'Mogi Mirim', 'Oeste', 'União Barbarense'] },
  { uf: 'TO', state: 'Tocantins', name: 'Campeonato Tocantinense', clubs: ['Tocantinópolis', 'Araguaína', 'Gurupi', 'Interporto', 'Palmas', 'Guaraí', 'Capital-TO', 'Sparta', 'Tocantins FC'] },
];

export const ESTADUAL_CLUB_COUNT = ESTADUAIS.reduce((n, e) => n + e.clubs.length, 0);
