import { useEffect, useRef, useState } from 'react';
import { advanceToMatchDays } from '../engine/daily';
import { calOf, formatDayLong } from '../engine/calendar';
import { isMatchDay } from '../engine/calendar';
import { playNext, isSeasonOver } from '../engine/game';
import { estadualOfUser } from '../engine/estadual';
import { clubOf } from '../engine/lookup';
import { userPlaysNextSlot } from '../engine/advance';
import { ClubBadge } from './ClubBadge';
import type { GameState, MatchResult } from '../engine/types';

/** Início da temporada: jogar o estadual (partida a partida) ou simular até a última rodada. */
export function EstadualChoice({ game, onPlay, onSim }: { game: GameState; onPlay: () => void; onSim: () => void }) {
  const mine = estadualOfUser(game);
  return (
    <div className="phone-gate" role="dialog" aria-modal="true" aria-label="Campeonato estadual">
      <div className="sf-box">
        <h2>🏟️ {mine?.comp.name ?? 'Campeonato estadual'}</h2>
        <p>A temporada {game.season} está começando. Como você quer disputar o estadual?</p>
        <button className="primary" onClick={onPlay}>▶ Jogar o estadual<small>Você joga cada partida do seu clube.</small></button>
        <button onClick={onSim}>⏩ Simular o estadual<small>Os dias passam sozinhos até a última rodada; param nos seus jogos para mostrar o placar.</small></button>
      </div>
    </div>
  );
}

const finished = (g: GameState) => !g.estadual || g.estadual.done || g.unemployed || isSeasonOver(g);

/** Simula o estadual dia a dia; em cada jogo do seu clube faz uma pausa mostrando o placar. */
export function EstadualSim({ start, onProgress, onDone }: { start: GameState; onProgress: (g: GameState) => void; onDone: (g: GameState) => void }) {
  const [view, setView] = useState<{ g: GameState; res?: MatchResult }>({ g: start });
  const cur = useRef(start);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    let timer = 0, guard = 0;
    const step = () => {
      if (!alive.current) return;
      let s = cur.current;
      if (finished(s) || ++guard > 600) { onDone(s); return; }
      const mineNow = userPlaysNextSlot(s);
      const s1 = advanceToMatchDays(s);
      if (!isMatchDay(s1)) { onDone(s1); return; } // travado (ex.: sem moradia): devolve o controle
      const r = playNext(mineNow && !s1.luck ? { ...s1, luck: 1 + Math.floor(Math.random() * 2147483000) } : s1);
      if (r.state === s1) { onDone(s1); return; }
      s = r.state; cur.current = s; onProgress(s);
      const my = mineNow ? r.results.find((x) => x.homeId === s1.userClubId || x.awayId === s1.userClubId) : undefined;
      setView({ g: s, res: my });
      timer = window.setTimeout(step, my ? 2600 : 180);  // nos seus jogos para um pouco; nos demais passa rápido
    };
    timer = window.setTimeout(step, 400);
    return () => { alive.current = false; window.clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const { g, res } = view;
  const e = g.estadual;
  const pct = e ? Math.min(100, Math.round((e.step / Math.max(1, e.totalSteps)) * 100)) : 100;
  return (
    <div className="phone-gate" role="dialog" aria-modal="true" aria-label="Simulando o estadual">
      <div className="sf-box">
        <h2>⏩ Simulando o estadual</h2>
        <small>{formatDayLong(calOf(g).day)}</small>
        <div className="sf-bar" aria-label={`${pct}%`}><i style={{ width: `${pct}%` }} /></div>
        {res ? (
          <div className="sf-score">
            <div><ClubBadge club={clubOf(g, res.homeId)} size={44} /><b>{clubOf(g, res.homeId).shortName}</b></div>
            <strong>{res.homeGoals} x {res.awayGoals}{res.pens ? ` (${res.pens[0]}-${res.pens[1]} pên.)` : ''}</strong>
            <div><ClubBadge club={clubOf(g, res.awayId)} size={44} /><b>{clubOf(g, res.awayId).shortName}</b></div>
          </div>
        ) : <p>Os outros jogos estão sendo disputados…</p>}
        <button className="sf-skip" onClick={() => { alive.current = false; onDone(cur.current); }}>Parar aqui</button>
      </div>
    </div>
  );
}

const TIPS = ['Fechando as contas da temporada…', 'Atualizando os elencos e as idades…', 'Montando o calendário e as competições…', 'Renovando o mercado e a base…', 'Quase pronto para o apito inicial…'];

/** Animação entre temporadas: calendário virando, resumo da que acabou e barra de progresso enquanto a nova é preparada. */
export function SeasonTransition({ game, pos, onReady, onClose }: { game: GameState; pos?: number; onReady: () => Promise<void>; onClose: () => void }) {
  const [tip, setTip] = useState(0);
  const [done, setDone] = useState(false);
  useEffect(() => {
    let live = true;
    const t = window.setInterval(() => setTip((i) => Math.min(i + 1, TIPS.length - 1)), 700);
    const t0 = Date.now();
    // dá tempo de o navegador desenhar a animação antes do cálculo pesado da nova temporada
    window.setTimeout(() => { void onReady().finally(() => { const wait = Math.max(0, 2800 - (Date.now() - t0)); window.setTimeout(() => { if (live) { setDone(true); window.setTimeout(onClose, 600); } }, wait); }); }, 120);
    return () => { live = false; window.clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const club = clubOf(game, game.userClubId);
  return (
    <div className="phone-gate sf-trans" role="status" aria-live="polite" aria-label="Preparando a nova temporada">
      <div className="sf-box">
        <div className="sf-years"><span>{game.season}</span><i>→</i><b>{game.season + 1}</b></div>
        <ClubBadge club={club} size={64} />
        <strong>{club.name}</strong>
        {pos ? <small>🏁 Terminou a temporada {game.season} em {pos}º lugar</small> : <small>Temporada {game.season} encerrada</small>}
        <div className="sf-bar sf-anim"><i className={done ? 'sf-full' : ''} /></div>
        <p>{done ? 'Tudo pronto!' : TIPS[tip]}</p>
      </div>
    </div>
  );
}
