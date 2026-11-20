# Lançamento na Google Play (etapa 8)

Tudo aqui é o roteiro do dono. Itens marcados [CLAUDE] eu faço no código quando você mandar; os outros dependem da sua conta.
Ordem importa: só tire o jogo do ar (site, releases, repositório público) DEPOIS que o app estiver publicado na Play.

## 1. Decisões que travam o resto
1. **ID do aplicativo (applicationId).** DEFINIDO: `com.flexonix.vidarealfc` (já trocado no código). A Play não deixa trocar depois de publicado.
2. **Nome na loja:** "Vida Real FC" (confira se está livre e se não usa marca de terceiros: sem nomes reais de clubes/jogadores/escudos licenciados na loja).
3. **Limite do grátis:** DEFINIDO e feito: 1 temporada grátis por aparelho (a primeira carreira do aparelho; as novas já nascem limitadas).

## 2. Chave de publicação (upload key)
- Com o "Play App Signing" (padrão), o Google guarda a chave final do app; você só precisa de uma chave de envio (upload key), que pode ser trocada se perder.
- Gerar (em um computador com Java, ou no Termux): `keytool -genkeypair -v -keystore release.jks -alias vidareal -keyalg RSA -keysize 2048 -validity 10000`. Guarde o arquivo e as senhas em lugar seguro (NÃO no repositório).
- No GitHub (Settings > Secrets and variables > Actions) crie os segredos: `RELEASE_KEYSTORE_B64` (o .jks em base64: `base64 -w0 release.jks`), `RELEASE_KEYSTORE_PASSWORD`, `RELEASE_KEY_ALIAS`, `RELEASE_KEY_PASSWORD`.
- O workflow "Android" com `store` marcado já assina o AAB com esses segredos e NÃO publica o build da loja na Release pública (o arquivo fica só nos artefatos da execução).

## 3. Play Console
1. Criar o app (Android, jogo, grátis) com o applicationId definitivo.
2. Perfil de pagamentos (para vender) e conta de teste de licença (Configurações > Teste de licença).
3. Monetização > Produtos: assinaturas `vidareal_weekly` (R$ 3,90/semana) e `vidareal_monthly` (R$ 9,99/mês) e produto único `vidareal_lifetime` (R$ 29,99). Os IDs têm que ser exatamente esses.
4. Configuração do app > Licenciamento: copie a chave pública e cole em `android/app/src/main/res/values/billing.xml` (`play_public_key`). [CLAUDE cola se você me enviar]
5. Conteúdo do app: política de privacidade (link), classificação indicativa, anúncios (sim), ID de publicidade (sim), Segurança dos dados (anúncios, compras, identificadores do aparelho).
6. Pacote Premium (Play Asset Delivery) já vai dentro do AAB; só publique o AAB (não APK).
7. Faixa de **teste interno** primeiro: instale pelo link da Play, teste compra (com a conta de teste), restaurar compras, anúncios de teste, pacote Premium e a oferta do fim da temporada. Só depois produção.

## 4. Anúncios
Veja `docs/guia-anuncios.md` (passo a passo do AdMob). Antes de publicar, troque os IDs de teste em `android/app/src/main/res/values/ads.xml`.

## 5. Depois de publicado (decisões do dono, eu só faço quando você mandar)
- Tirar do ar a versão web (GitHub Pages): desligar em Settings > Pages (ou eu removo o workflow `pages.yml`).
- Apagar as Releases antigas com APK/AAB (o link do APK público deixa de existir).
- Deixar o repositório **privado** (Settings > General > Danger Zone > Change visibility). Os builds do CI continuam funcionando em repositório privado.
- Quem já instalou o APK de teste antigo não recebe atualização da Play (assinatura diferente): avise-os para instalar pela loja.

## 6. Limites que continuam valendo
Sem servidor próprio não dá para impedir um APK adulterado em aparelho com root/hooks; o que foi feito: compra verificada pela Play, nada de Premium no save, pacote Premium só entregue pela Play ao app original, livro da temporada grátis no Keystore/Block Store, repositório privado e web fora do ar.
