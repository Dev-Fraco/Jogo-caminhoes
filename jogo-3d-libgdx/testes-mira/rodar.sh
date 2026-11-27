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
java -Xmx3g -cp "$OUT:$CP" com.exemplo.jogo3d.ModelIOTests
java -cp "$OUT:$CP" com.exemplo.jogo3d.AimTests
java -cp "$OUT:$CP" com.exemplo.jogo3d.ShootTests
java -cp "$OUT:$CP" com.exemplo.jogo3d.TargetBotTests
java -cp "$OUT:$CP" com.exemplo.jogo3d.AnimTests
java -cp "$OUT:$CP" com.exemplo.jogo3d.ControlTests
java -cp "$OUT:$CP" com.exemplo.jogo3d.ClimaTests
java -cp "$OUT:$CP" com.exemplo.jogo3d.PersonagensTests
java -cp "$OUT:$CP" com.exemplo.jogo3d.RelevoTests
java -cp "$OUT:$CP" com.exemplo.jogo3d.WallTests
java -cp "$OUT:$CP" com.exemplo.jogo3d.SurvivalTests
java -cp "$OUT:$CP" com.exemplo.jogo3d.ScopeTests
java -cp "$OUT:$CP" com.exemplo.jogo3d.DummyTests
java -cp "$OUT:$CP" com.exemplo.jogo3d.ShotgunTests
java -cp "$OUT:$CP" com.exemplo.jogo3d.ArsenalTests
java -cp "$OUT:$CP" com.exemplo.jogo3d.ShelfTests
java -cp "$OUT:$CP" com.exemplo.jogo3d.WallLimitTests
java -cp "$OUT:$CP" com.exemplo.jogo3d.MoveRotTests
java -cp "$OUT:$CP" com.exemplo.jogo3d.InventarioTests
java -cp "$OUT:$CP" com.exemplo.jogo3d.AgachTests
java -cp "$OUT:$CP" com.exemplo.jogo3d.EmoteTests
java -cp "$OUT:$CP" com.exemplo.jogo3d.SalaTests
java -cp "$OUT:$CP" com.exemplo.jogo3d.ArenaTests
java -cp "$OUT:$CP" com.exemplo.jogo3d.RodadasTests
java -cp "$OUT:$CP" com.exemplo.jogo3d.BotMiraTests
java -cp "$OUT:$CP" com.exemplo.jogo3d.AimUiTests

