package com.exemplo.jogo3d;

import com.badlogic.gdx.utils.Array;

/** Nomes dos lugares do sertão (aparecem no mapa inteiro). */
final class Places {
    static final int CIDADE = 0, FAZENDA = 1, ACUDE = 2, POCO = 3, CEMITERIO = 4, ACAMPAMENTO = 5, RIO = 6;

    static final class Place {
        final String name;
        final float x, z;
        final int kind;

        Place(String name, float x, float z, int kind) {
            this.name = name;
            this.x = x;
            this.z = z;
            this.kind = kind;
        }
    }

    static final String[] NOMES_FAZENDAS = {"Fazenda Boa Vista", "Fazenda Riacho Fundo", "Fazenda Pedra Branca",
            "Fazenda Juazeiro", "Fazenda Serra Verde", "Fazenda Lagoa Seca", "Fazenda Caiçara"};

    final Array<Place> list = new Array<>();

    Places(World w) {
        list.add(new Place("Santa Cruz do Sertão", World.TOWN_X, World.TOWN_Z, CIDADE));
        for (int i = 0; i < Regions.FARM_X.length; i++) {
            String nome = i < NOMES_FAZENDAS.length ? NOMES_FAZENDAS[i] : "Fazenda " + (i + 1);
            list.add(new Place(nome, Regions.FARM_X[i], Regions.FARM_Z[i], FAZENDA));
        }
        if (w.hasDam) list.add(new Place("Açude do Cajueiro", w.damX, w.damZ, ACUDE));
        if (w.hasWell) list.add(new Place("Cacimba da Pedra", w.wellX, w.wellZ, POCO));
        if (w.hasCem) list.add(new Place("Cemitério da Esperança", w.cemX, w.cemZ, CEMITERIO));
        list.add(new Place("Acampamento dos Retirantes", w.campX, w.campZ, ACAMPAMENTO));
        list.add(new Place("Rio Seco", World.riverX(0f), 0f, RIO));
    }
}
