import type { Club, DataPack, Player } from '../engine/types';

const POS = ['GK', 'DEF', 'MID', 'ATT'];

/** Valida um pacote importado pelo usuário. Lança Error com mensagem em português. */
export function parsePack(raw: unknown): DataPack {
  const p = raw as DataPack;
  if (!p || typeof p !== 'object' || p.format !== 'caminhoes-pack-v1') throw new Error('Arquivo não é um pacote de dados válido.');
  if (typeof p.id !== 'string' || typeof p.name !== 'string') throw new Error('Pacote sem id/nome.');
  const clubs = p.league?.clubs;
  if (!Array.isArray(clubs) || clubs.length < 4 || clubs.length > 40) throw new Error('A liga precisa ter entre 4 e 40 clubes.');
  const ids = new Set<string>();
  for (const c of clubs as Club[]) {
    if (!c.id || !c.name || typeof c.strength !== 'number') throw new Error(`Clube inválido: ${JSON.stringify(c).slice(0, 60)}`);
    if (ids.has(c.id)) throw new Error(`Clube repetido: ${c.id}`);
    ids.add(c.id);
    c.short ||= c.name.slice(0, 3).toUpperCase();
    c.color ||= '#444444';
    if (c.players) {
      if (c.players.length < 16) throw new Error(`${c.name}: elenco com menos de 16 jogadores.`);
      for (const pl of c.players as Player[]) {
        if (!POS.includes(pl.pos) || typeof pl.strength !== 'number') throw new Error(`${c.name}: jogador inválido.`);
      }
      for (const pos of POS) {
        const need = pos === 'GK' ? 1 : 4;
        if (c.players.filter((x) => x.pos === pos).length < need) throw new Error(`${c.name}: poucos jogadores na posição ${pos}.`);
      }
    }
  }
  return p;
}
