/**
 * Clubes da Série D além dos 20 que já estavam em clubs.ts: 76 clubes (fictícios) tirados da lista de estaduais (br_estaduais.ts),
 * distribuídos por estado (cota por UF, na ordem do arquivo), sem repetir clubes das Séries A, B e C.
 * ATENÇÃO: o arquivo de origem não diz quais clubes disputam a Série D; esta seleção é uma suposição. Cores e estádios são provisórios
 * (cores sorteadas de uma paleta; estádio genérico) e as cidades são as dos clubes quando o nome indica, ou a capital do estado.
 * Linha: id, nome, sigla, cor 1, cor 2, estádio, cidade, orçamento (R$ mi), meta, reputação.
 */
import type { Row } from './clubs_world';

/* eslint-disable prettier/prettier */
export const SERIE_D_EXTRA: Row[] = [
  ['galvez', 'Atlético Jangadeiros', 'AJA', '#D71920', '#111111', 'Estádio Municipal', 'Rio Branco', 2, 'mid', 1], // AC
  ['asa', 'Olímpico Sucupira', 'OLI', '#7A1230', '#FFFFFF', 'Estádio Municipal', 'Arapiraca', 4, 'survive', 1], // AL
  ['cse', 'Jaguar EC', 'JAG', '#FFFFFF', '#C8102E', 'Estádio Municipal', 'Palmeira dos Índios', 2, 'mid', 1], // AL
  ['manaus', 'Juventude Bem-Te-Vi', 'JBT', '#1E88E5', '#FFFFFF', 'Estádio Municipal', 'Manaus', 3, 'mid', 1], // AM
  ['nacional-am', 'Social Juazeiro Novo', 'SJN', '#0057B8', '#FFFFFF', 'Estádio Municipal', 'Manaus', 3, 'survive', 1], // AM
  ['sao-raimundo-am', 'União Jangadeiros', 'UOJ', '#F2C200', '#111111', 'Estádio Municipal', 'Manaus', 4, 'mid', 1], // AM
  ['trem', 'Sport Pioneiros', 'SIO', '#5B2C83', '#FFFFFF', 'Estádio Municipal', 'Macapá', 3, 'mid', 1], // AP
  ['ypiranga-ap', 'Juventude Planalto', 'JPL', '#F28C00', '#111111', 'Estádio Municipal', 'Macapá', 1, 'survive', 1], // AP
  ['juazeirense', 'Social Rubi', 'SCI', '#5B2C83', '#FFFFFF', 'Estádio Municipal', 'Juazeiro', 4, 'mid', 1], // BA
  ['jacuipense', 'Aroeira FC', 'AFC', '#FFFFFF', '#C8102E', 'Estádio Municipal', 'Riachão do Jacuípe', 2, 'mid', 1], // BA
  ['atletico-de-alagoinhas', 'Social Gavião-Real', 'SGR', '#FFFFFF', '#0057B8', 'Estádio Municipal', 'Alagoinhas', 1, 'mid', 1], // BA
  ['bahia-de-feira', 'Nacional Planalto', 'NAC', '#FFFFFF', '#00873E', 'Estádio Municipal', 'Feira de Santana', 3, 'mid', 1], // BA
  ['ferroviario', 'Vanguarda Rubi', 'VRU', '#FFFFFF', '#0057B8', 'Estádio Municipal', 'Fortaleza', 3, 'mid', 1], // CE
  ['iguatu', 'Olímpico Beija-Flor', 'OBF', '#C8102E', '#FFFFFF', 'Estádio Municipal', 'Iguatu', 2, 'top4', 1], // CE
  ['maracana', 'Olímpico Cupuaçu', 'OCU', '#C8102E', '#FFFFFF', 'Estádio Municipal', 'Maracanaú', 1, 'mid', 1], // CE
  ['horizonte', 'Cedro Rosa Clube', 'CRC', '#FFFFFF', '#0057B8', 'Estádio Municipal', 'Horizonte', 1, 'mid', 1], // CE
  ['brasiliense', 'Juventude Guará', 'JGU', '#0A2A66', '#F2C200', 'Estádio Municipal', 'Taguatinga', 4, 'survive', 1], // DF
  ['capital-df', 'Racing Pau-Brasil Novo', 'RPB', '#FFFFFF', '#C8102E', 'Estádio Municipal', 'Brasília', 3, 'mid', 1], // DF
  ['rio-branco-es', 'Açaí Clube', 'ACL', '#F2C200', '#111111', 'Estádio Municipal', 'Venda Nova do Imigrante', 2, 'mid', 1], // ES
  ['desportiva-ferroviaria', 'Sporting Cupuaçu', 'SCU', '#F2C200', '#111111', 'Estádio Municipal', 'Cariacica', 2, 'top4', 1], // ES
  ['vitoria-es', 'Jacarandá SC', 'JAR', '#FFFFFF', '#0057B8', 'Estádio Municipal', 'Vitória', 4, 'top4', 1], // ES
  ['crac', 'Operário Sucupira', 'OSU', '#7A1230', '#FFFFFF', 'Estádio Municipal', 'Catalão', 3, 'top4', 1], // GO
  ['goianesia', 'Atlético Urutu', 'AUR', '#F2C200', '#111111', 'Estádio Municipal', 'Goianésia', 1, 'survive', 1], // GO
  ['goiatuba', 'Esporte Campos Altos', 'EAL', '#0A2A66', '#F2C200', 'Estádio Municipal', 'Goiatuba', 2, 'mid', 1], // GO
  ['imperatriz', 'Operário Nova Esperança', 'ONE', '#1E88E5', '#FFFFFF', 'Estádio Municipal', 'Imperatriz', 3, 'mid', 1], // MA
  ['pouso-alegre', 'Tiê-Sangue Clube', 'TSC', '#111111', '#F2C200', 'Estádio Municipal', 'Pouso Alegre', 4, 'survive', 1], // MG
  ['urt', 'Racing Ventania', 'RVE', '#111111', '#F2C200', 'Estádio Municipal', 'Patos de Minas', 3, 'survive', 1], // MG
  ['democrata-gv', 'Popular Chapada', 'PCH', '#1E88E5', '#FFFFFF', 'Estádio Municipal', 'Governador Valadares', 3, 'mid', 1], // MG
  ['itabirito', 'Tucano Futebol Clube', 'TFC', '#FFFFFF', '#C8102E', 'Estádio Municipal', 'Itabirito', 4, 'top4', 1], // MG
  ['mamore', 'Vanguarda Planalto', 'VPL', '#1E88E5', '#FFFFFF', 'Estádio Municipal', 'Patos de Minas', 2, 'top4', 1], // MG
  ['operario-ms', 'Aliança Cruz do Sul', 'ACD', '#FFFFFF', '#C8102E', 'Estádio Municipal', 'Campo Grande', 1, 'survive', 1], // MS
  ['costa-rica-ms', 'Esporte Pioneiros', 'EPI', '#FFFFFF', '#00873E', 'Estádio Municipal', 'Costa Rica', 2, 'mid', 1], // MS
  ['dourados', 'Estrela Tucano', 'ETU', '#00A650', '#F2C200', 'Estádio Municipal', 'Dourados', 1, 'mid', 1], // MS
  ['uniao-rondonopolis', 'Jabuticaba EC', 'JEC', '#00A650', '#F2C200', 'Estádio Municipal', 'Rondonópolis', 3, 'mid', 1], // MT
  ['luverdense', 'Nacional Pioneiros', 'NPI', '#7A1230', '#FFFFFF', 'Estádio Municipal', 'Lucas do Rio Verde', 2, 'mid', 1], // MT
  ['castanhal', 'Real Sertão', 'REA', '#0A2A66', '#F2C200', 'Estádio Municipal', 'Castanhal', 1, 'mid', 1], // PA
  ['tuna-luso', 'Vaqueiros SC', 'VAQ', '#C8102E', '#FFFFFF', 'Estádio Municipal', 'Belém', 3, 'top4', 1], // PA
  ['sao-raimundo-pa', 'Estrela Vaqueiros', 'EVA', '#F28C00', '#111111', 'Estádio Municipal', 'Santarém', 4, 'survive', 1], // PA
  ['sousa', 'Independente Serranos', 'IPE', '#FFFFFF', '#0057B8', 'Estádio Municipal', 'Sousa', 3, 'top4', 1], // PB
  ['nacional-de-patos', 'Jaguar SC', 'JSC', '#111111', '#FFFFFF', 'Estádio Municipal', 'Patos', 3, 'mid', 1], // PB
  ['retro', 'Juventude Rio Claro Novo', 'JRC', '#FFFFFF', '#00873E', 'Estádio Municipal', 'Camaragibe', 3, 'survive', 1], // PE
  ['afogados', 'Praianos Futebol Clube', 'PFC', '#FFFFFF', '#00873E', 'Estádio Municipal', 'Afogados da Ingazeira', 3, 'survive', 1], // PE
  ['salgueiro', 'Municipal Brasa Viva', 'MBV', '#5B2C83', '#FFFFFF', 'Estádio Municipal', 'Salgueiro', 4, 'survive', 1], // PE
  ['river-pi', 'Imbuia EC', 'IEC', '#00873E', '#FFFFFF', 'Estádio Municipal', 'Teresina', 4, 'mid', 1], // PI
  ['fluminense-pi', 'Ilhéus do Norte EC', 'IDN', '#0057B8', '#FFFFFF', 'Estádio Municipal', 'Teresina', 2, 'mid', 1], // PI
  ['cianorte', 'Seringueiros Futebol Clube', 'SFC', '#0A2A66', '#F2C200', 'Estádio Municipal', 'Cianorte', 1, 'top4', 1], // PR
  ['fc-cascavel', 'Real Caatinga', 'RCA', '#F2C200', '#111111', 'Estádio Municipal', 'Cascavel', 2, 'mid', 1], // PR
  ['azuriz', 'Esporte Vaqueiros', 'ESP', '#0057B8', '#FFFFFF', 'Estádio Municipal', 'Pato Branco', 1, 'mid', 1], // PR
  ['rio-branco-pr', 'Campos Altos FC', 'CAM', '#D71920', '#111111', 'Estádio Municipal', 'Paranaguá', 1, 'top4', 1], // PR
  ['boavista', 'Municipal Imbuia', 'MUN', '#0057B8', '#FFFFFF', 'Estádio Municipal', 'Saquarema', 3, 'mid', 1], // RJ
  ['portuguesa-rj', 'Vale Verde SC', 'VVS', '#111111', '#F2C200', 'Estádio Municipal', 'Rio de Janeiro', 3, 'mid', 1], // RJ
  ['resende', 'Aliança Cometa', 'ACO', '#FFFFFF', '#00873E', 'Estádio Municipal', 'Resende', 2, 'mid', 1], // RJ
  ['potiguar-de-mossoro', 'Nacional Navegantes', 'NNA', '#F28C00', '#111111', 'Estádio Municipal', 'Mossoró', 3, 'mid', 1], // RN
  ['globo-fc', 'Palmar AC', 'PAL', '#111111', '#FFFFFF', 'Estádio Municipal', 'Ceará-Mirim', 3, 'survive', 1], // RN
  ['porto-velho', 'Tempestade Atlético Clube', 'TEM', '#111111', '#FFFFFF', 'Estádio Municipal', 'Porto Velho', 2, 'mid', 1], // RO
  ['ji-parana', 'Serra Azul Clube', 'SCL', '#111111', '#F2C200', 'Estádio Municipal', 'Ji-Paraná', 2, 'mid', 1], // RO
  ['sao-raimundo-rr', 'Aliança Açaí', 'AAN', '#D71920', '#111111', 'Estádio Municipal', 'Boa Vista', 2, 'mid', 1], // RR
  ['gas', 'Municipal Monte Alto', 'MMA', '#0A2A66', '#F2C200', 'Estádio Municipal', 'Boa Vista', 4, 'survive', 1], // RR
  ['brasil-de-pelotas', 'Mata Atlântica AC', 'MAA', '#00A650', '#F2C200', 'Estádio Municipal', 'Pelotas', 1, 'mid', 1], // RS
  ['sao-luiz', 'Buriti EC', 'BEC', '#C8102E', '#FFFFFF', 'Estádio Municipal', 'Ijuí', 3, 'mid', 1], // RS
  ['novo-hamburgo', 'Juventude Pampa', 'JPA', '#111111', '#F2C200', 'Estádio Municipal', 'Novo Hamburgo', 4, 'survive', 1], // RS
  ['sao-jose-rs', 'Sport Planície', 'SLA', '#00A650', '#F2C200', 'Estádio Municipal', 'Porto Alegre', 3, 'mid', 1], // RS
  ['pelotas', 'União Vaqueiros', 'UVA', '#111111', '#FFFFFF', 'Estádio Municipal', 'Pelotas', 2, 'top4', 1], // RS
  ['marcilio-dias', 'Aliança Brasa Viva', 'ABV', '#111111', '#FFFFFF', 'Estádio Municipal', 'Itajaí', 4, 'top4', 1], // SC
  ['concordia', 'Olímpico Tiê-Sangue', 'OTS', '#00873E', '#FFFFFF', 'Estádio Municipal', 'Concórdia', 1, 'mid', 1], // SC
  ['hercilio-luz', 'Atlético Serra Azul', 'AAZ', '#0057B8', '#FFFFFF', 'Estádio Municipal', 'Tubarão', 3, 'mid', 1], // SC
  ['sergipe', 'Caatinga EC', 'CAA', '#F28C00', '#111111', 'Estádio Municipal', 'Aracaju', 1, 'mid', 1], // SE
  ['lagarto', 'Popular Jatobá', 'PJA', '#1E88E5', '#FFFFFF', 'Estádio Municipal', 'Lagarto', 4, 'top4', 1], // SE
  ['falcon', 'Lagoa Dourada SC', 'LDS', '#00A650', '#F2C200', 'Estádio Municipal', 'Lagarto', 2, 'mid', 1], // SE
  ['juventus-sp', 'Popular Planície', 'PPL', '#F2C200', '#111111', 'Estádio Municipal', 'São Paulo', 1, 'top4', 1], // SP
  ['xv-de-piracicaba', 'Real Harpia', 'RHA', '#7A1230', '#FFFFFF', 'Estádio Municipal', 'Piracicaba', 3, 'mid', 1], // SP
  ['noroeste', 'Racing Gaúchos do Sul', 'RGD', '#111111', '#FFFFFF', 'Estádio Municipal', 'Bauru', 2, 'survive', 1], // SP
  ['comercial-sp', 'Sporting Condor do Sul', 'SCD', '#FFFFFF', '#00873E', 'Estádio Municipal', 'Ribeirão Preto', 3, 'mid', 1], // SP
  ['linense', 'Cruz do Sul Clube', 'CDS', '#0057B8', '#FFFFFF', 'Estádio Municipal', 'Lins', 2, 'mid', 1], // SP
  ['tocantinopolis', 'Bandeirantes Atlético Clube', 'BAC', '#FFFFFF', '#00873E', 'Estádio Municipal', 'Tocantinópolis', 2, 'survive', 1], // TO
  ['araguaina', 'Popular Imbuia', 'POP', '#F28C00', '#111111', 'Estádio Municipal', 'Araguaína', 2, 'mid', 1], // TO
];
/* eslint-enable prettier/prettier */
