import type { GameState } from '../engine/types';
import { calOf, formatDayLong } from '../engine/calendar';

const KICKER: Record<string, string> = { good: 'ELOGIO', bad: 'ALERTA', info: 'BASTIDORES' };
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** Notícias em formato de jornal: cabeçalho, manchete grande e as demais matérias em duas colunas. */
export function Newspaper({ game }: { game: GameState }) {
  const items = game.news.slice(0, 5);
  const [head, ...rest] = items;
  const edition = `${cap(formatDayLong(calOf(game).day))} · Temporada ${game.season} · Rodada ${game.round}`;
  return (
    <section className="np" aria-label="Jornal">
      <header className="np-mast">
        <h3 className="np-name">O Jornal da Bola</h3>
        <div className="np-edition"><span>{edition}</span></div>
      </header>
      {!head ? <p className="np-empty">Sem notícias nesta edição. As manchetes aparecem conforme a temporada anda.</p> : (
        <>
          <article className={`np-head ${head.tone}`}>
            <small className="np-kicker">{KICKER[head.tone] ?? 'NOTÍCIA'} · Temporada {head.season} · rodada {head.round}</small>
            <h4>{head.text}</h4>
          </article>
          {rest.length > 0 && (
            <div className="np-cols">
              {rest.map((n, i) => (
                <article key={i} className={`np-story ${n.tone}`}>
                  <small className="np-kicker">{KICKER[n.tone] ?? 'NOTÍCIA'} · rodada {n.round}</small>
                  <p>{n.text}</p>
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
