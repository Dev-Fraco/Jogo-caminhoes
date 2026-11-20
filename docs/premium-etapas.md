# Premium — etapas e segurança (rascunho de trabalho)

Decisões já tomadas
- Venda pela Google Play (cobrança pela loja). Planos: semanal R$ 3,90 · mensal R$ 9,99 · compra única R$ 29,99 (vale para sempre).
- Grátis: todas as ligas na 1ª temporada; depois só a liga do clube; com anúncios. Premium: sem anúncios.
- Exclusivo Premium: outras ligas, Mundo, copas especiais, partida 3D completa, selo/visual do perfil.
- Sem servidor próprio. Repositório privado e web completa fora do ar antes do lançamento (decisão do dono, a fazer só quando ele mandar).
- Compra confirmada pela Play Billing; pacote Premium entregue pelo Play Asset Delivery (só para o app original instalado pela Play).

Realidade da segurança (sem servidor)
- Barra: editar save/localStorage, mexer em arquivos de dados, refazer o APK com outra assinatura (a Play não entrega o pacote).
- Não barra: usuário com root e ferramentas de hook, ou alguém que pagou e extrai o pacote para repassar.
- O que é de fato "separável": o desenhista 3D (~500 KB, o maior pedaço do app), a virada de temporada e os módulos do mundo/copas especiais. O motor base é pequeno e compartilhado: não tem como trancá-lo.

Etapas
1. [FEITA] Fronteira do Premium no código: `src/premium/` (virada de temporada em `season.ts`; `loader.ts` com o portão `setPremiumGate`; 3D passa pelo carregador). Teste garante que o código grátis só chega ao pacote pelo carregador. Nenhuma trava ainda (portão sempre aberto).
2. Mover para o pacote os módulos que só existem do Mundo/copas especiais em diante (mundo, vendas ao exterior, copas regionais, Super Mundial) com telas de prévia no lugar.
3. Modo grátis: contador da 1ª temporada, "só a liga do clube" depois dela, partida em 2D, telas de prévia com cadeado e fim de temporada com oferta.
4. Cobrança: Play Billing (semanal, mensal, compra única), restauração, verificação da assinatura recebida localmente e estado do Premium só em memória (nunca no save).
5. Entrega do pacote: Play Asset Delivery (plugin Android nativo), com o app original apenas.
6. Save assinado/embaralhado + contador da temporada grátis em "Jogos salvos" da conta Google.
7. Anúncios (AdMob) só no grátis, fora das partidas.
8. Lançamento: chave de release, app novo na Play, repositório privado, web fora do ar, releases antigas removidas.
