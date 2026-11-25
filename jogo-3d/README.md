# Jogo 3D (Godot 4)

Protótipo de jogo 3D nativo para desktop, feito na engine **Godot 4** com **GDScript**.
Não roda no navegador.

## Como abrir

1. Instale a Godot **4.3 ou mais nova** (versão "Standard", não a .NET): https://godotengine.org/download
2. Abra a Godot, clique em **Importar** e selecione o arquivo `jogo-3d/project.godot`.
3. Aperte **F5** para rodar.

## Controles (protótipo)

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
├── scenes/main.tscn       # cena principal (só um nó, o mundo)
└── scripts/
    ├── world.gd           # céu, sol, chão e obstáculos
    └── player.gd          # movimento e câmera em terceira pessoa
```

## Próximos passos sugeridos

- Definir o tema do jogo (o que o jogador faz, objetivo, regras).
- Trocar as caixas por modelos 3D (`.glb`) e adicionar texturas.
- Criar menus, inimigos, sons e salvamento.
