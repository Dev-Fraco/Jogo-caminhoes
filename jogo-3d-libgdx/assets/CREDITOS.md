# Créditos dos arquivos 3D e texturas

Todos os arquivos desta pasta vêm de fontes com licença **CC0 1.0** (domínio público), obtidas pelo pacote npm `@netforge/asset-library-files` (MIT), que reúne esses arquivos com a origem de cada um.

- **Modelos** (`models/`): cactos, pedras, tocos, troncos e arbustos do estilo *lowpoly* da Quaternius e da Kenney, convertidos de glTF para OBJ.
- **Textura** (`textures/dirt.png`): textura de terra seca do pacote *Screaming Brain Studios* (OpenGameArt), CC0.

Fontes:
- Kenney: https://www.kenney.nl
- Quaternius: https://quaternius.com
- Screaming Brain Studios (OpenGameArt): https://opengameart.org/content/base-material-texture-pack

## Personagem e animações (Mixamo / Adobe)

- **Modelo e animações** (`models/player.g3dj`): personagem e animações *Walking*, *Fast Run* e *Jumping Down* baixados do Mixamo (https://www.mixamo.com), convertidos de FBX para .g3dj.
- Uso permitido em jogos pela licença do Mixamo; não é permitido redistribuir o personagem como arquivo avulso.

## Chão (material enviado pelo usuário)

- `textures/ground_basecolor.jpg`: mapa de cor (basecolor) do material "AddWater", reduzido para 1024 px. Os mapas de normal, rugosidade e altura do mesmo material ainda não estão no jogo.

- **Personagem cangaceiro** (`models/cangaceiro.g3dj`, texturas em `models/cangaceiro/`): reconstrução 3D estilizada fornecida pelo autor do projeto, baseada em imagem de referência. Convertida de GLB rigado para libGDX, com a malha reduzida para celular.

- **Cerca de arame farpado** (`models/cerca_base.g3dj`, original em `modelos_fonte/cerca_arame_farpado_3D.glb`): modelo 3D fornecido pelo autor do projeto. Fios e farpas são simulados em `BarbedWireFence.java`.

- **Som do avião** (`audio/aviao.mp3`): "Airplane engine sound 2" de freesound_community (Freesound), enviado pelo autor do projeto. Toca em loop, mais alto perto do avião.
- **Vento da queda** (`audio/vento_queda.mp3`): "Harsh wind" de dragon-studio (Pixabay/Freesound), enviado pelo autor do projeto. Toca na queda livre e, mais baixo, com o paraquedas aberto.
