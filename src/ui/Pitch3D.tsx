import { useEffect, useRef } from 'react';
import { resolveBadge } from '../data/playerpack';
import type { ClubInfo, FormationId, MatchEvent } from '../engine/types';
import { PitchSim } from './PitchSim';
import { kitColors } from './pitch';
import { drawScene, gkColor, type Kit, type Look } from './pitch3d/draw';
import { createDriver, createWorld, drive, stepWorld } from './pitch3d/world';

const loadBadge = (club: ClubInfo): HTMLImageElement | null => {
  if (!club.badge || typeof Image === 'undefined') return null;
  const img = new Image(); img.decoding = 'async';
  try { img.src = resolveBadge(club.badge); } catch { return null; }
  return img;
};

/**
 * Campo em 3D (câmera de transmissão): os 22 jogadores são botões de futebol com o escudo e as cores do uniforme, que correm pelo campo,
 * e a bola obedece à física (gravidade, quique, trave, travessão e rede). O motor decide a partida; aqui se encenam os lances da narração.
 */
export function Pitch3D({ home, away, homeFormation, awayFormation, events, minute, speed, userSide, paused = false }: {
  home: ClubInfo; away: ClubInfo; homeFormation: FormationId; awayFormation: FormationId; events: MatchEvent[]; minute: number; speed: number; userSide: 'home' | 'away'; paused?: boolean;
}) {
  const reduce = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const ref = useRef<HTMLCanvasElement>(null);
  const live = useRef({ events, minute, speed, paused, userSide });
  live.current = { events, minute, speed, paused, userSide };
  const supported = typeof document !== 'undefined' && !!document.createElement('canvas').getContext;

  useEffect(() => {
    const canvas = ref.current; if (!canvas || reduce || !supported) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    const world = createWorld(homeFormation, awayFormation), drv = createDriver();
    if ((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV) (window as unknown as { __pitch3d?: unknown }).__pitch3d = { world, drv }; // só em desenvolvimento: permite inspecionar o campo
    const [hc, ac] = kitColors(home, away);
    const kit = (c: ClubInfo, primary: string): Kit => ({ primary, secondary: c.secondaryColor, gk: gkColor(primary), short: c.shortName, badge: loadBadge(c) });
    const look: Look = { home: kit(home, hc), away: kit(away, ac), userSide };
    let raf = 0, last = performance.now(), alive = true;
    const frame = (now: number) => {
      if (!alive) return;
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      const cur = live.current;
      look.userSide = cur.userSide;
      const rect = canvas.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(160, Math.round(rect.width)), h = Math.max(100, Math.round(rect.height));
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
      if (!cur.paused) { drive(world, drv, cur.events, cur.minute); stepWorld(world, dt * Math.min(cur.speed, 4)); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawScene(ctx, world, w, h, look);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { alive = false; cancelAnimationFrame(raf); };
  }, [home.id, away.id, homeFormation, awayFormation]); // eslint-disable-line react-hooks/exhaustive-deps

  if (reduce || !supported) return <PitchSim home={home} away={away} homeFormation={homeFormation} awayFormation={awayFormation} events={events} minute={minute} speed={speed} userSide={userSide} />;
  return <div className="pitch3d" aria-hidden="true"><canvas ref={ref} /></div>;
}
