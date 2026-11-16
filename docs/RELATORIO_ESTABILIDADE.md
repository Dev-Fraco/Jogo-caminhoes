# Vida Real FC — Relatório final (estabilidade, temporadas, saves e universo da IA)

Suíte completa na última execução: 69 arquivos, 648 testes passando, 1 pulado. `tsc` e `vite build` limpos.

## Por etapa
1. **Temporadas**: carregar um save não altera nada; fim de temporada e virada auditados (`tests/season_audit.test.ts`).
2. **Proteção do progresso**: salvamento comprimido com verificação, cópias de segurança, recuperação de save danificado e aviso na tela.
3. **Saves antigos**: schema 5, migração por etapas que preserva os dados, cópia do original antes de migrar, restauração pelo menu.
4. **Mercado**: jogadores livres só até overall 70 e perto do nível do time (pequeno +4, médio +7, gigante +12); limite de assédio por jogador; auditoria de 4 temporadas.
5. **Carreira de treinador**: treinadores da IA com contrato (2 ou 3 anos), renovação de quem vai bem e troca de quem não rende; auditoria da carreira do usuário.
6. **Competições**: todas as ligas, estaduais, copa e continentais; desempates; subida e descida exatas.
7. **Universo da IA**: artilharia de todas as divisões, reposição de elencos com idades equilibradas.
8. **Desempenho**: limpeza das tabelas por jogador na virada, busca de livres sem refazer índice, renovações da IA mais baratas, teste de orçamento.
9. **Testes gerais**: 8 temporadas seguidas sem jogador com salvar/carregar a cada virada; 10 saves antigos reais.

## Problemas conhecidos
- Poucos veteranos (31+) no universo da IA depois de alguns anos; nível médio sobe devagar.
- Artilharia só dos campeonatos nacionais e sem tela.
- Propostas de clubes do exterior não foram auditadas.
- Nada foi testado em celular, navegador ou Capacitor, só no motor do jogo.
- APK e link web ainda não incluem as Etapas 1 a 9 (último APK: build-24).
