import { anyClubName } from './market';
import type { GameState } from './types';

/** Salão de campeões: guarda os campeões de todas as ligas e copas, de todas as carreiras e simulações (fica no aparelho, fora dos saves). */
export interface HallEntry {
  key: string; mode: 'carreira' | 'simulacao'; world: string; league: string; season: number;
  divisions: { name: string; champion: string }[]; cups: { icon: string; name: string; champion: string }[];
}

const KEY = 'vr-hall-v1';
const MAX = 600;

export function loadHall(): HallEntry[] {
  try { const a = JSON.parse(localStorage.getItem(KEY) ?? '[]'); return Array.isArray(a) ? (a as HallEntry[]) : []; } catch { return []; }
}
const save = (list: HallEntry[]) => { try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX))); } catch { /* cheio */ } };
export function clearHall() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } }

/** Campeões de cada temporada encerrada de um jogo (carreira ou simulação). */
export function entriesOf(g: GameState): HallEntry[] {
  const observer = !!g.observer;
  const world = observer ? `Simulação — ${g.leagueName ?? 'Campeonato Brasileiro'}` : `Carreira de ${g.coach.name}`;
  return g.history.map((h) => ({
    key: `${observer ? 's' : 'c'}:${g.seed}:${g.leagueName ?? ''}:${h.season}`, mode: observer ? 'simulacao' : 'carreira', world, league: g.leagueName ?? 'Campeonato Brasileiro', season: h.season,
    divisions: h.divisions.map((d, i) => ({ name: g.divisions[i]?.name ?? d.id, champion: anyClubName(g, d.championId) })),
    cups: [
      ...(h.cupChampionId ? [{ icon: '🏆', name: g.cup?.name ?? 'Copa do Brasil', champion: anyClubName(g, h.cupChampionId) }] : []),
      ...(h.libChampionId ? [{ icon: '🌎', name: 'Libertadores', champion: anyClubName(g, h.libChampionId) }] : []),
      ...(h.uclChampionId ? [{ icon: '⭐', name: 'Champions League', champion: anyClubName(g, h.uclChampionId) }] : []),
      ...(h.mundialChampionId ? [{ icon: '🌍', name: 'Mundial de Clubes', champion: anyClubName(g, h.mundialChampionId) }] : []),
    ],
  }));
}

/** Registra no salão as temporadas ainda não guardadas. Devolve true se algo novo entrou. */
export function recordHall(g: GameState): boolean {
  const have = loadHall();
  const keys = new Set(have.map((e) => e.key));
  const fresh = entriesOf(g).filter((e) => !keys.has(e.key));
  if (!fresh.length) return false;
  save([...fresh.reverse(), ...have]);
  return true;
}
