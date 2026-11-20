# Guia: criar o app na Google Play Console (do zero, pelo celular ou PC)

Site: play.google.com/console (funciona no navegador do celular em "Versão para computador").

## A. Criar o app
1. Play Console > **Criar app**. Nome: Vida Real FC. Idioma: Português (Brasil). Tipo: **Jogo**. **Grátis**. Aceite as declarações.
2. Painel > **Configurar o app**: faça cada tarefa listada:
   - Política de privacidade: cole o link (veja `docs/politica-de-privacidade.md`).
   - Anúncios: **Sim, contém anúncios**.
   - Acesso ao app: tudo livre, sem login.
   - Classificação do conteúdo: responda o questionário (jogo de simulação esportiva, sem violência/apostas com dinheiro real).
   - Público-alvo: **13 anos ou mais** (não marque crianças menores).
   - Segurança dos dados: coleta de "ID do dispositivo ou outros IDs" e "Dados de uso" para **Publicidade**, compartilhados com o Google (AdMob); compras processadas pela Google Play; dados criptografados em trânsito; o usuário não pode pedir exclusão (não há conta).
   - Categoria: Esportes ou Simulação. E-mail de contato público.

## B. Enviar a primeira versão (teste interno)
1. **Testes > Teste interno > Criar versão.** Aceite o "Play App Signing".
2. Envie o arquivo **.aab** (workflow "Android" com `store` marcado; o AAB sai nos artefatos da execução, dentro de `android-builds`, já assinado com a sua chave).
3. Em **Testadores**, crie uma lista com o seu e-mail Gmail; copie o link de teste e instale pelo celular.
4. A primeira versão precisa existir na Play antes dos produtos poderem ser criados.

## C. Os 3 produtos (Monetização)
IDs EXATAMENTE assim:
- **Assinaturas** > Criar assinatura: ID `vidareal_weekly` > plano base semanal (renovação automática), R$ 3,90.
- Assinatura `vidareal_monthly` > plano base mensal, R$ 9,99.
- **Produtos no app** > Criar: ID `vidareal_lifetime`, tipo compra única, R$ 29,99.
- Ative cada um (Status: Ativo). Sem período de teste grátis.
- Configurações > **Teste de licença**: adicione o seu Gmail (compra de teste sem cobrar).

## D. Chave de licenciamento
Play Console > o app > **Testes e lançamento > Configuração do app** (ou Monetização > Licenciamento) > **Chave de licenciamento (base64)**. Copie e me mande: eu coloco em `android/app/src/main/res/values/billing.xml`. (É uma chave pública: não é segredo.)

## E. Antes de produção
Teste: instalar pelo link de teste interno, comprar cada plano com a conta de teste, restaurar compra, ver anúncios de teste (e depois reais), baixar o pacote Premium. Contas novas da Play costumam exigir um período de teste fechado (ex.: 12 testadores por 14 dias) antes de publicar em produção: veja o painel.
