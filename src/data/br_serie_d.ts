/**
 * Clubes da Série D além dos 20 que já estavam em clubs.ts: 76 clubes reais tirados da lista de estaduais (br_estaduais.ts),
 * distribuídos por estado (cota por UF, na ordem do arquivo), sem repetir clubes das Séries A, B e C.
 * ATENÇÃO: o arquivo de origem não diz quais clubes disputam a Série D; esta seleção é uma suposição. Cores e estádios são provisórios
 * (cores sorteadas de uma paleta; estádio genérico) e as cidades são as dos clubes quando o nome indica, ou a capital do estado.
 * Linha: id, nome, sigla, cor 1, cor 2, estádio, cidade, orçamento (R$ mi), meta, reputação.
 */
import type { Row } from './clubs_world';

/* eslint-disable prettier/prettier */
export const SERIE_D_EXTRA: Row[] = [
  ['galvez', 'Galvez', 'GAL', '#D71920', '#111111', 'Estádio Municipal', 'Rio Branco', 2, 'mid', 1], // AC
  ['asa', 'ASA', 'ASA', '#7A1230', '#FFFFFF', 'Estádio Municipal', 'Arapiraca', 4, 'survive', 1], // AL
  ['cse', 'CSE', 'CSE', '#FFFFFF', '#C8102E', 'Estádio Municipal', 'Palmeira dos Índios', 2, 'mid', 1], // AL
  ['manaus', 'Manaus', 'MAN', '#1E88E5', '#FFFFFF', 'Estádio Municipal', 'Manaus', 3, 'mid', 1], // AM
  ['nacional-am', 'Nacional-AM', 'NAC', '#0057B8', '#FFFFFF', 'Estádio Municipal', 'Manaus', 3, 'survive', 1], // AM
  ['sao-raimundo-am', 'São Raimundo-AM', 'SAO', '#F2C200', '#111111', 'Estádio Municipal', 'Manaus', 4, 'mid', 1], // AM
  ['trem', 'Trem', 'TEM', '#5B2C83', '#FFFFFF', 'Estádio Municipal', 'Macapá', 3, 'mid', 1], // AP
  ['ypiranga-ap', 'Ypiranga-AP', 'YPI', '#F28C00', '#111111', 'Estádio Municipal', 'Macapá', 1, 'survive', 1], // AP
  ['juazeirense', 'Juazeirense', 'JUA', '#5B2C83', '#FFFFFF', 'Estádio Municipal', 'Juazeiro', 4, 'mid', 1], // BA
  ['jacuipense', 'Jacuipense', 'JAC', '#FFFFFF', '#C8102E', 'Estádio Municipal', 'Riachão do Jacuípe', 2, 'mid', 1], // BA
  ['atletico-de-alagoinhas', 'Atlético de Alagoinhas', 'ATL', '#FFFFFF', '#0057B8', 'Estádio Municipal', 'Alagoinhas', 1, 'mid', 1], // BA
  ['bahia-de-feira', 'Bahia de Feira', 'BAH', '#FFFFFF', '#00873E', 'Estádio Municipal', 'Feira de Santana', 3, 'mid', 1], // BA
  ['ferroviario', 'Ferroviário', 'FER', '#FFFFFF', '#0057B8', 'Estádio Municipal', 'Fortaleza', 3, 'mid', 1], // CE
  ['iguatu', 'Iguatu', 'IGU', '#C8102E', '#FFFFFF', 'Estádio Municipal', 'Iguatu', 2, 'top4', 1], // CE
  ['maracana', 'Maracanã', 'MAR', '#C8102E', '#FFFFFF', 'Estádio Municipal', 'Maracanaú', 1, 'mid', 1], // CE
  ['horizonte', 'Horizonte', 'HOR', '#FFFFFF', '#0057B8', 'Estádio Municipal', 'Horizonte', 1, 'mid', 1], // CE
  ['brasiliense', 'Brasiliense', 'BRA', '#0A2A66', '#F2C200', 'Estádio Municipal', 'Taguatinga', 4, 'survive', 1], // DF
  ['capital-df', 'Capital-DF', 'CAP', '#FFFFFF', '#C8102E', 'Estádio Municipal', 'Brasília', 3, 'mid', 1], // DF
  ['rio-branco-es', 'Rio Branco-ES', 'RIO', '#F2C200', '#111111', 'Estádio Municipal', 'Venda Nova do Imigrante', 2, 'mid', 1], // ES
  ['desportiva-ferroviaria', 'Desportiva Ferroviária', 'DES', '#F2C200', '#111111', 'Estádio Municipal', 'Cariacica', 2, 'top4', 1], // ES
  ['vitoria-es', 'Vitória-ES', 'VIT', '#FFFFFF', '#0057B8', 'Estádio Municipal', 'Vitória', 4, 'top4', 1], // ES
  ['crac', 'CRAC', 'CRA', '#7A1230', '#FFFFFF', 'Estádio Municipal', 'Catalão', 3, 'top4', 1], // GO
  ['goianesia', 'Goianésia', 'GOI', '#F2C200', '#111111', 'Estádio Municipal', 'Goianésia', 1, 'survive', 1], // GO
  ['goiatuba', 'Goiatuba', 'GIA', '#0A2A66', '#F2C200', 'Estádio Municipal', 'Goiatuba', 2, 'mid', 1], // GO
  ['imperatriz', 'Imperatriz', 'IMP', '#1E88E5', '#FFFFFF', 'Estádio Municipal', 'Imperatriz', 3, 'mid', 1], // MA
  ['pouso-alegre', 'Pouso Alegre', 'POU', '#111111', '#F2C200', 'Estádio Municipal', 'Pouso Alegre', 4, 'survive', 1], // MG
  ['urt', 'URT', 'URT', '#111111', '#F2C200', 'Estádio Municipal', 'Patos de Minas', 3, 'survive', 1], // MG
  ['democrata-gv', 'Democrata-GV', 'DEM', '#1E88E5', '#FFFFFF', 'Estádio Municipal', 'Governador Valadares', 3, 'mid', 1], // MG
  ['itabirito', 'Itabirito', 'ITA', '#FFFFFF', '#C8102E', 'Estádio Municipal', 'Itabirito', 4, 'top4', 1], // MG
  ['mamore', 'Mamoré', 'MAM', '#1E88E5', '#FFFFFF', 'Estádio Municipal', 'Patos de Minas', 2, 'top4', 1], // MG
  ['operario-ms', 'Operário-MS', 'OPE', '#FFFFFF', '#C8102E', 'Estádio Municipal', 'Campo Grande', 1, 'survive', 1], // MS
  ['costa-rica-ms', 'Costa Rica-MS', 'COS', '#FFFFFF', '#00873E', 'Estádio Municipal', 'Costa Rica', 2, 'mid', 1], // MS
  ['dourados', 'Dourados', 'DOU', '#00A650', '#F2C200', 'Estádio Municipal', 'Dourados', 1, 'mid', 1], // MS
  ['uniao-rondonopolis', 'União Rondonópolis', 'UNI', '#00A650', '#F2C200', 'Estádio Municipal', 'Rondonópolis', 3, 'mid', 1], // MT
  ['luverdense', 'Luverdense', 'LUV', '#7A1230', '#FFFFFF', 'Estádio Municipal', 'Lucas do Rio Verde', 2, 'mid', 1], // MT
  ['castanhal', 'Castanhal', 'CAS', '#0A2A66', '#F2C200', 'Estádio Municipal', 'Castanhal', 1, 'mid', 1], // PA
  ['tuna-luso', 'Tuna Luso', 'TUN', '#C8102E', '#FFFFFF', 'Estádio Municipal', 'Belém', 3, 'top4', 1], // PA
  ['sao-raimundo-pa', 'São Raimundo-PA', 'SOR', '#F28C00', '#111111', 'Estádio Municipal', 'Santarém', 4, 'survive', 1], // PA
  ['sousa', 'Sousa', 'SOU', '#FFFFFF', '#0057B8', 'Estádio Municipal', 'Sousa', 3, 'top4', 1], // PB
  ['nacional-de-patos', 'Nacional de Patos', 'NCI', '#111111', '#FFFFFF', 'Estádio Municipal', 'Patos', 3, 'mid', 1], // PB
  ['retro', 'Retrô', 'RET', '#FFFFFF', '#00873E', 'Estádio Municipal', 'Camaragibe', 3, 'survive', 1], // PE
  ['afogados', 'Afogados', 'AFO', '#FFFFFF', '#00873E', 'Estádio Municipal', 'Afogados da Ingazeira', 3, 'survive', 1], // PE
  ['salgueiro', 'Salgueiro', 'SAL', '#5B2C83', '#FFFFFF', 'Estádio Municipal', 'Salgueiro', 4, 'survive', 1], // PE
  ['river-pi', 'River-PI', 'RIV', '#00873E', '#FFFFFF', 'Estádio Municipal', 'Teresina', 4, 'mid', 1], // PI
  ['fluminense-pi', 'Fluminense-PI', 'FLU', '#0057B8', '#FFFFFF', 'Estádio Municipal', 'Teresina', 2, 'mid', 1], // PI
  ['cianorte', 'Cianorte', 'CIA', '#0A2A66', '#F2C200', 'Estádio Municipal', 'Cianorte', 1, 'top4', 1], // PR
  ['fc-cascavel', 'FC Cascavel', 'FCC', '#F2C200', '#111111', 'Estádio Municipal', 'Cascavel', 2, 'mid', 1], // PR
  ['azuriz', 'Azuriz', 'AZU', '#0057B8', '#FFFFFF', 'Estádio Municipal', 'Pato Branco', 1, 'mid', 1], // PR
  ['rio-branco-pr', 'Rio Branco-PR', 'ROB', '#D71920', '#111111', 'Estádio Municipal', 'Paranaguá', 1, 'top4', 1], // PR
  ['boavista', 'Boavista', 'BOA', '#0057B8', '#FFFFFF', 'Estádio Municipal', 'Saquarema', 3, 'mid', 1], // RJ
  ['portuguesa-rj', 'Portuguesa-RJ', 'PRT', '#111111', '#F2C200', 'Estádio Municipal', 'Rio de Janeiro', 3, 'mid', 1], // RJ
  ['resende', 'Resende', 'RES', '#FFFFFF', '#00873E', 'Estádio Municipal', 'Resende', 2, 'mid', 1], // RJ
  ['potiguar-de-mossoro', 'Potiguar de Mossoró', 'POT', '#F28C00', '#111111', 'Estádio Municipal', 'Mossoró', 3, 'mid', 1], // RN
  ['globo-fc', 'Globo FC', 'GLO', '#111111', '#FFFFFF', 'Estádio Municipal', 'Ceará-Mirim', 3, 'survive', 1], // RN
  ['porto-velho', 'Porto Velho', 'PTO', '#111111', '#FFFFFF', 'Estádio Municipal', 'Porto Velho', 2, 'mid', 1], // RO
  ['ji-parana', 'Ji-Paraná', 'JIP', '#111111', '#F2C200', 'Estádio Municipal', 'Ji-Paraná', 2, 'mid', 1], // RO
  ['sao-raimundo-rr', 'São Raimundo-RR', 'SRA', '#D71920', '#111111', 'Estádio Municipal', 'Boa Vista', 2, 'mid', 1], // RR
  ['gas', 'GAS', 'GAS', '#0A2A66', '#F2C200', 'Estádio Municipal', 'Boa Vista', 4, 'survive', 1], // RR
  ['brasil-de-pelotas', 'Brasil de Pelotas', 'BAS', '#00A650', '#F2C200', 'Estádio Municipal', 'Pelotas', 1, 'mid', 1], // RS
  ['sao-luiz', 'São Luiz', 'SOL', '#C8102E', '#FFFFFF', 'Estádio Municipal', 'Ijuí', 3, 'mid', 1], // RS
  ['novo-hamburgo', 'Novo Hamburgo', 'NOV', '#111111', '#F2C200', 'Estádio Municipal', 'Novo Hamburgo', 4, 'survive', 1], // RS
  ['sao-jose-rs', 'São José-RS', 'SOJ', '#00A650', '#F2C200', 'Estádio Municipal', 'Porto Alegre', 3, 'mid', 1], // RS
  ['pelotas', 'Pelotas', 'PEL', '#111111', '#FFFFFF', 'Estádio Municipal', 'Pelotas', 2, 'top4', 1], // RS
  ['marcilio-dias', 'Marcílio Dias', 'MRC', '#111111', '#FFFFFF', 'Estádio Municipal', 'Itajaí', 4, 'top4', 1], // SC
  ['concordia', 'Concórdia', 'CON', '#00873E', '#FFFFFF', 'Estádio Municipal', 'Concórdia', 1, 'mid', 1], // SC
  ['hercilio-luz', 'Hercílio Luz', 'HER', '#0057B8', '#FFFFFF', 'Estádio Municipal', 'Tubarão', 3, 'mid', 1], // SC
  ['sergipe', 'Sergipe', 'SER', '#F28C00', '#111111', 'Estádio Municipal', 'Aracaju', 1, 'mid', 1], // SE
  ['lagarto', 'Lagarto', 'LAG', '#1E88E5', '#FFFFFF', 'Estádio Municipal', 'Lagarto', 4, 'top4', 1], // SE
  ['falcon', 'Falcon', 'FAL', '#00A650', '#F2C200', 'Estádio Municipal', 'Lagarto', 2, 'mid', 1], // SE
  ['juventus-sp', 'Juventus-SP', 'JUV', '#F2C200', '#111111', 'Estádio Municipal', 'São Paulo', 1, 'top4', 1], // SP
  ['xv-de-piracicaba', 'XV de Piracicaba', 'XVD', '#7A1230', '#FFFFFF', 'Estádio Municipal', 'Piracicaba', 3, 'mid', 1], // SP
  ['noroeste', 'Noroeste', 'NOR', '#111111', '#FFFFFF', 'Estádio Municipal', 'Bauru', 2, 'survive', 1], // SP
  ['comercial-sp', 'Comercial-SP', 'COM', '#FFFFFF', '#00873E', 'Estádio Municipal', 'Ribeirão Preto', 3, 'mid', 1], // SP
  ['linense', 'Linense', 'LIN', '#0057B8', '#FFFFFF', 'Estádio Municipal', 'Lins', 2, 'mid', 1], // SP
  ['tocantinopolis', 'Tocantinópolis', 'TOC', '#FFFFFF', '#00873E', 'Estádio Municipal', 'Tocantinópolis', 2, 'survive', 1], // TO
  ['araguaina', 'Araguaína', 'ARA', '#F28C00', '#111111', 'Estádio Municipal', 'Araguaína', 2, 'mid', 1], // TO
];
/* eslint-enable prettier/prettier */
