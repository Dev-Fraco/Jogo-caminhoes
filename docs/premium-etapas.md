# Premium — etapas e segurança (rascunho de trabalho)

Decisões já tomadas
- Venda pela Google Play (cobrança pela loja). Planos: semanal R$ 3,90 · mensal R$ 9,99 · compra única R$ 29,99 (vale para sempre).
- Grátis: todas as ligas na 1ª temporada; depois só a liga do clube; com anúncios. Premium: sem anúncios.
- Exclusivo Premium: mods da comunidade, outras ligas e copas, Mundo, copas especiais, selo/visual do perfil. (A partida em 3D foi REMOVIDA do jogo: 'Assistir partida' é o campo 2D com narração.)
- Sem servidor próprio. Repositório privado e web completa fora do ar antes do lançamento (decisão do dono, a fazer só quando ele mandar).
- Compra confirmada pela Play Billing; pacote Premium entregue pelo Play Asset Delivery (só para o app original instalado pela Play).

Realidade da segurança (sem servidor)
- Barra: editar save/localStorage, mexer em arquivos de dados, refazer o APK com outra assinatura (a Play não entrega o pacote).
- Não barra: usuário com root e ferramentas de hook, ou alguém que pagou e extrai o pacote para repassar.
- O que é de fato "separável": os módulos do mundo e das copas especiais. O motor base é pequeno e compartilhado: não tem como trancá-lo. A virada de temporada fica livre (o grátis continua só com a liga do clube).

Etapas
1. [FEITA] Fronteira do Premium no código: `src/premium/` (virada de temporada em `season.ts`; `loader.ts` com o portão `setPremiumGate`; 3D passa pelo carregador). Teste garante que o código grátis só chega ao pacote pelo carregador. Nenhuma trava ainda (portão sempre aberto).
2. [FEITA] Extras no pacote: ligas do mundo, vendas ao exterior, Copa do Nordeste, Copa Verde e Super Mundial saíram do código base e entram por ganchos (`src/engine/hooks.ts`); `src/premium/extras.ts` os instala sob demanda (`loadExtras`). Sem o pacote essas telas mostram a prévia com cadeado (`PremiumPreview`) e o jogo segue normal (as copas somem, a temporada não trava). Nos testes o pacote é instalado por `tests/setup.ts`.
3. [FEITA] Modo grátis: `src/premium/entitlement.ts` (FREE_SEASONS = 1; `freeStart` no save). Depois da temporada grátis o jogo grátis fica só com a divisão do clube (a virada de temporada remove copa nacional, estadual — exceto de quem só joga o estadual —, continentais, Mundial, copas especiais, Super Mundial); a Tabela mostra as outras divisões e as copas com cadeado. O 3D foi removido. Enquanto não há cobrança todos contam como Premium; o 'Teste do modo grátis' (Opções) liga o modo grátis para conferir. FALTA: tela de oferta no fim da temporada.
4. [FEITA] Cobrança: Play Billing 7.1.1 pelo plugin nativo `PlayBilling` (`android/.../PlayBillingPlugin.java`) + `src/premium/billing.ts`. Produtos: `vidareal_weekly` e `vidareal_monthly` (assinaturas), `vidareal_lifetime` (compra única). A assinatura recebida é verificada (RSA) com a chave pública da Play em `android/app/src/main/res/values/billing.xml` (`play_public_key`; vazia = só builds de debug aceitam). Estado do Premium só em memória (nunca no save). Assinatura precisa de confirmação online a cada 7 dias (`SUB_GRACE_DAYS`); vitalício vale sempre. A cobrança só é exigida em build da loja: workflow `android.yml` com `store=true` (`VITE_ENFORCE_BILLING=1`); sem isso (web, testes, APK de teste) tudo fica liberado. Testes: `tests/billing.test.ts`.
   FALTA, manual do dono: criar os 3 produtos no Play Console com esses IDs; adicionar conta de testador de licença; colar a chave de licenciamento em `billing.xml`; trocar o applicationId provisório `com.exemplo.brasileiraomanager` por um real. O plugin Java ainda não foi compilado (sem SDK Android aqui): validar com um build do CI.
5. Entrega do pacote: Play Asset Delivery (plugin Android nativo), com o app original apenas.
6. Save assinado/embaralhado + contador da temporada grátis em "Jogos salvos" da conta Google.
7. Anúncios (AdMob) só no grátis, fora das partidas.
8. Lançamento: chave de release, app novo na Play, repositório privado, web fora do ar, releases antigas removidas.

Tela de planos (feita): `src/premium/ui/PlanChoice.tsx`. Mostra a comparação Grátis x Premium (só o que existe de fato), os três planos e o rodapé legal da Play. No grátis, aparece uma vez por sessão antes de Novo Jogo/Continuar e também pelo botão "Ver o Premium" das telas com cadeado. A opção Mods fica trancada no grátis (menu com a marca Premium, prévia no lugar da tela, mods e pacotes de elencos não são aplicados). O botão de assinar só funciona no build da loja (etapa 4). Se o dono enviar uma imagem/arte, ela entra no topo da tela.
