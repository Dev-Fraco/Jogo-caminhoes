#!/usr/bin/env bash
# Testes do sistema de mira/hitbox/dano e da IA dos inimigos, sem tela (backend headless do libGDX).
# Usa o mundo, o esqueleto e as animações reais do jogo. Fora do build do APK de propósito.
set -e
cd "$(dirname "$0")"
LIB=${LIB:-/tmp/gdxlibs}
mkdir -p "$LIB"
M=https://repo1.maven.org/maven2/com/badlogicgames/gdx
for a in gdx/1.12.1/gdx-1.12.1.jar gdx-backend-headless/1.12.1/gdx-backend-headless-1.12.1.jar \
         gdx-platform/1.12.1/gdx-platform-1.12.1-natives-desktop.jar gdx-jnigen-loader/2.3.1/gdx-jnigen-loader-2.3.1.jar; do
  [ -f "$LIB/$(basename $a)" ] || curl -sfL -o "$LIB/$(basename $a)" "$M/$a"
done
CP="$LIB/gdx-1.12.1.jar:$LIB/gdx-backend-headless-1.12.1.jar:$LIB/gdx-platform-1.12.1-natives-desktop.jar:$LIB/gdx-jnigen-loader-2.3.1.jar"
OUT=$(mktemp -d)
javac -encoding UTF-8 -d "$OUT" -cp "$CP" ../core/src/main/java/com/exemplo/jogo3d/*.java com/exemplo/jogo3d/*.java
cd ../assets
java -cp "$OUT:$CP" com.exemplo.jogo3d.AimTests
java -cp "$OUT:$CP" com.exemplo.jogo3d.AiSoak
