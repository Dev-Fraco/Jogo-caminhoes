# Jogo 3D (Godot 4)

Protótipo de jogo 3D nativo para desktop, feito na engine **Godot 4** com **GDScript**.
Não roda no navegador.

## Como abrir

1. Instale a Godot **4.3 ou mais nova** (versão "Standard", não a .NET): https://godotengine.org/download
2. Abra a Godot, clique em **Importar** e selecione o arquivo `jogo-3d/project.godot`.
3. Aperte **F5** para rodar.

## Testar no celular (Android), sem computador

Você não precisa instalar nada no celular para gerar o jogo. Cada vez que o código é enviado para o GitHub, o workflow **"Jogo 3D (APK Android)"** monta um APK:

1. Abra o repositório no GitHub (pelo navegador ou pelo app do GitHub).
2. Vá em **Actions** → **Jogo 3D (APK Android)** → **Run workflow** (ou espere o próximo envio de código).
3. Quando terminar (uns minutos), vá em **Releases** e abra a mais recente.
4. Baixe o `jogo-3d.apk` no celular e instale. Pode ser preciso permitir "instalar apps desconhecidos".

Obs.: o celular precisa ser **Android**. iPhone não consegue instalar esse tipo de arquivo.

## Controles (protótipo)

**No celular:** joystick na metade esquerda da tela para andar; arraste na metade direita para girar a câmera; botão **PULAR** no canto inferior direito.

**No computador:**

| Ação | Tecla |
| --- | --- |
| Andar | W A S D |
| Pular | Espaço |
| Girar câmera | Mouse |
| Liberar mouse | Esc |
| Capturar mouse de novo | Clique na tela |

## Estrutura

```
jogo-3d/
├── project.godot          # configuração do projeto
├── export_presets.cfg     # configuração do APK Android
├── docs/GDD.md            # documento de design (história, clima, personagens)
├── scenes/main.tscn       # cena principal (só um nó, o mundo)
└── scripts/
    ├── world.gd           # céu, sol, chão, obstáculos e criação do jogador
    ├── player.gd          # movimento e câmera em terceira pessoa
    └── touch_hud.gd       # controles de toque (celular)
```

## Próximos passos sugeridos

- Definir o tema do jogo (o que o jogador faz, objetivo, regras).
- Trocar as caixas por modelos 3D (`.glb`) e adicionar texturas.
- Criar menus, inimigos, sons e salvamento.
