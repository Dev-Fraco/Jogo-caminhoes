# Guia: como colocar os anúncios para valer (AdMob)

O jogo já tem o código dos anúncios (só no grátis, só no app da loja, nunca durante a partida). Hoje ele usa IDs de TESTE do Google: aparecem anúncios de teste e ninguém te paga. Para ganhar dinheiro é preciso trocar por IDs seus.

## Passo a passo
1. **Conta AdMob.** Entre em admob.google.com com a conta Google e aceite os termos. Preencha o perfil de pagamento (nome, endereço, dados fiscais/CPF) para receber; o pagamento só sai depois de passar o limite mínimo.
2. **Criar o app no AdMob.** Aplicativos > Adicionar aplicativo > Android. Se o jogo ainda não está na Play, escolha "Não" em "o app está listado em uma loja" e dê o nome "Vida Real FC". Ao terminar, o AdMob mostra o **ID do app**, no formato `ca-app-pub-1234567890123456~1234567890` (tem um `~`).
3. **Criar o bloco de anúncio.** Dentro do app: Blocos de anúncios > Adicionar bloco de anúncios > **Intersticial**. Nome: "Intersticial pausas". Copie o **ID do bloco**, no formato `ca-app-pub-1234567890123456/1234567890` (tem uma `/`).
4. **Colocar os IDs no jogo.** Abra `android/app/src/main/res/values/ads.xml`:
   - `admob_app_id` = ID do app (com `~`);
   - `admob_interstitial_id` = ID do bloco (com `/`).
   Pode me mandar os dois IDs que eu troco, comito e gero o build.
5. **Mensagem de consentimento.** AdMob > Privacidade e mensagens > crie a mensagem "Consentimento do GDPR" para o app (vale para Europa; o Brasil não exige a tela, mas o jogo já está pronto para ela). Publique a mensagem.
6. **Testar sem se arriscar.** Não clique nos seus próprios anúncios reais (a conta pode ser banida). No AdMob > Configurações > Dispositivos de teste, cadastre seu aparelho; ou deixe os IDs de teste até o app ir para teste interno.
7. **Ligar ao app da loja.** Depois de publicado, no AdMob > Aplicativos > o app > "Vincular à loja" e escolha a Play. Assim os relatórios e o app-ads.txt funcionam.
8. **Declarações na Play Console.** Conteúdo do app > Anúncios: "Sim, o app contém anúncios". Segurança dos dados: informe o uso de ID de publicidade e dados de diagnóstico/uso para anúncios. Tenha um link de política de privacidade.
9. **Gerar o app da loja.** Rode o workflow "Android" marcando `store`. Os anúncios só aparecem nesse build (no APK de teste e no site não aparecem).

## Regras do jogo sobre anúncios (já implementadas)
- Só no grátis; quem compra o Premium deixa de ver na hora.
- Só em pausas (voltar ao menu, virar a temporada); nunca durante a partida.
- Intervalo mínimo de 6 minutos; nenhum nos primeiros 4 minutos.
- Para mudar isso: `AD_GAP_MS` e `AD_FIRST_AFTER_MS` em `src/premium/ads.ts`.

## Dicas
- Uma pausa a cada poucos minutos rende menos que muitos anúncios, mas segura os jogadores; ajuste olhando as avaliações.
- Nunca peça para o jogador clicar em anúncio e nunca ponha anúncio colado em botões (a política do AdMob proíbe).
