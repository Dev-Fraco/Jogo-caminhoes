import { ClubBadge } from './ClubBadge';
import type { ClubInfo } from '../engine/types';

export type MatchMode = 'sim' | 'watch';

/** Antes de cada partida do seu clube: simular tudo de uma vez ou assistir (as duas usam exatamente o mesmo resultado). */
export function MatchChoice({ home, away, divisionName, stadium, onChoose }: { home: ClubInfo; away: ClubInfo; divisionName: string; stadium: string; onChoose: (m: MatchMode) => void }) {
  return (
    <section className="mc" aria-label="Como você quer jogar esta partida?">
      <small className="mc-div">{divisionName}</small>
      <div className="mc-vs">
        <div className="mc-team"><ClubBadge club={home} size={72} /><strong>{home.name}</strong></div>
        <span className="mc-x">X</span>
        <div className="mc-team"><ClubBadge club={away} size={72} /><strong>{away.name}</strong></div>
      </div>
      <p className="mc-std">🏟️ {stadium}</p>
      <button className="mc-opt" onClick={() => onChoose('watch')}>
        <b>▶ Assistir partida</b>
        <span>Entrada das equipes, hino e a partida no campo (cerca de 5 minutos), com mudanças táticas e a opção de pular até o fim.</span>
      </button>
      <button className="mc-opt" onClick={() => onChoose('sim')}>
        <b>⚡ Simular partida inteira</b>
        <span>Veja a linha do tempo, os gols e as estatísticas. É a mesma partida: o resultado é idêntico ao de assistir.</span>
      </button>
    </section>
  );
}
