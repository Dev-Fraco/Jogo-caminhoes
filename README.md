# Vida Real FC (MVP)

Jogo de carreira de treinador estilo Brasfoot, para celular. TypeScript + React + Vite, empacotado em Android com Capacitor.

## Rodar no navegador
```
npm install
npm run dev      # abre em http://localhost:5173
npm test         # testes do motor
```

## Estrutura
- `src/engine/` — regras do jogo (calendário, simulação, tabela, acesso/rebaixamento, salvamento). Sem dependência de interface.
- `src/data/` — mundo (`world.ts`), clubes e elencos 2026 das Séries A–D (`clubs.ts`), pirâmide do Brasileirão (`pyramid.ts`) e formato de pacotes para mods (`pack.ts`).
- `src/ui/` — telas (Escolha do clube, Elenco, Jogos, Tabela).
- `tests/` — testes do motor.

## Campeonato Brasileiro (Série A–D)
Cada carreira simula as 4 divisões ao mesmo tempo (38 rodadas, pontos corridos). No fim da temporada os 4 últimos de A, B e C descem e os 4 primeiros de B, C e D sobem.
O Modo Desafio (Premium) ainda não existe: ele sorteará um clube que joga só estadual, e depende de os estaduais serem criados.

## Gerar APK / AAB
- **Sem instalar nada (pelo celular):** no GitHub, aba *Actions* → *Android (APK + AAB)* → *Run workflow*. Baixe o resultado em *Artifacts*.
- **No PC:** `npm run sync:android`, abra a pasta `android/` no Android Studio e use Build → Generate Signed Bundle / APK.
- Antes de publicar: troque `appId` em `capacitor.config.json` (já é `com.flexonix.vidarealfc`) e assine o AAB com sua chave de upload.
