# Ferramentas de modelos (FBX → g3dj → mdl)

Scripts usados para trazer personagens de outros programas para o jogo. Precisam de **Blender 4.0** (modo
linha de comando) e de **Python 3 com numpy** (para os scripts de construção).

## Fluxo

1. **Exportar o FBX** para JSON no sistema do jogo (Y para cima, metros, pés em y = 0, 1,73 m de altura):

       blender -b --factory-startup -P dump_any.py -- personagem.fbx saida.json

   Para um personagem **sem esqueleto**, passe um esqueleto de pose T (`fit_full.json`) como terceiro argumento.

2. **Montar o g3dj** com o esqueleto e as animações do Jake (`modelos_fonte/g3dj/models/jake/jake.g3dj`):
   - `build_all.py droide|robo|lutador saida.g3dj` (ler os JSON gerados no passo 1, na pasta onde estão);
   - `build_boxer.py saida.g3dj` (personagem CC3 com texturas; use `TEXDIR` com a pasta das texturas).
   Variável `JAKE_G3DJ` aponta para outro jake.g3dj, se preciso.

3. **Empacotar em binário** (`.mdl`) com o `ModelPack` (em `testes-mira/`), rodando a partir de `assets/`.

4. **Miniatura para o lobby**: `g3dj2obj.py` (g3dj → OBJ) e depois `render_thumb.py` no Blender:

       blender -b --factory-startup -P render_thumb.py -- personagem.obj miniatura.png 0

## Arquivos

- `dump_any.py`: exporta a malha, os ossos e os pesos do FBX.
- `builder.py`: transfere a malha para a pose de repouso do Jake e escreve o g3dj.
- `build_all.py`: construções dos personagens (droide com ossos próprios, robô com peças rígidas, lutador sem esqueleto).
- `build_boxer.py`: boxeador (CC3, com texturas).
- `mapping.py`: nomes dos ossos CC_Base → Jake.
- `g3dj2obj.py`, `render_thumb.py`: miniaturas.
- `fit_full.json`: esqueleto de pose T para o lutador.
