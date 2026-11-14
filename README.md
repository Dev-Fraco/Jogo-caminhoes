# Brasileirão Manager (MVP)

Jogo de carreira de treinador estilo Brasfoot, para celular. TypeScript + React + Vite, empacotado em Android com Capacitor.

## Rodar no navegador
```
npm install
npm run dev      # abre em http://localhost:5173
npm test         # testes do motor
```

## Estrutura
- `src/engine/` — regras do jogo (calendário, simulação, tabela, salvamento). Sem dependência de interface.
- `src/data/` — pacote de dados padrão (`brasileirao.ts`) e validação de pacotes importados (`pack.ts`).
- `src/ui/` — telas (Escolha do clube, Elenco, Jogos, Tabela).
- `tests/` — testes do motor.

## Pacotes de dados
O jogo é genérico: clubes/ligas vêm de um **pacote** (`format: "caminhoes-pack-v1"`). Na tela inicial há o botão
"Importar pacote de dados (.json)". Clubes podem trazer `players` prontos; sem isso o jogo gera elencos fictícios.

## Gerar APK / AAB
- **Sem instalar nada (pelo celular):** no GitHub, aba *Actions* → *Android (APK + AAB)* → *Run workflow*. Baixe o resultado em *Artifacts*.
- **No PC:** `npm run sync:android`, abra a pasta `android/` no Android Studio e use Build → Generate Signed Bundle / APK.
- Antes de publicar: troque `appId` em `capacitor.config.json` (hoje `com.exemplo.brasileiraomanager`) e assine o AAB com sua chave de upload.
