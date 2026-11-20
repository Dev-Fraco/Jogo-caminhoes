import { useEffect, useRef } from 'react';
import { resolveBadge } from '../data/playerpack';
import type { ClubInfo, FormationId, MatchEvent, Player } from '../engine/types';
import { PitchSim } from './PitchSim';
import { kitColors } from './pitch';
import { drawOverlay, drawScene, drawVarOverlay, gkColor, type Kit, type Look } from './pitch3d/draw';
import { makeCamera, VAR_CAMS, varCamera, type VarCamId } from './pitch3d/camera';
import type { PitchRenderer } from './pitch3d/three/scene';
import { loadSettings } from '../settings/settings';
import { audio } from '../audio/audio';
import { createDriver, createWorld, drive, isHolding, replayView, stepWorld, varFocus } from './pitch3d/world';
import { skipCeremony, startCeremony } from './pitch3d/ceremony';

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
export function Pitch3D({ home, away, homeFormation, awayFormation, events, minute, speed, userSide, paused = false, players, onVar, onHold, varCam = null, skipVar = 0, skipCeremony: skipCer = 0 }: {
  home: ClubInfo; away: ClubInfo; homeFormation: FormationId; awayFormation: FormationId; events: MatchEvent[]; minute: number; speed: number; userSide: 'home' | 'away'; paused?: boolean;
  /** jogadores dos dois times (por id): com eles os lances são feitos pelos jogadores que o motor escolheu */
  players?: Map<string, Player>;
  /** VAR: avisa quando uma revisão começa/termina (a partida fica parada), câmera escolhida na repetição e pedido para pular a revisão */
  onVar?: (active: boolean) => void; /** o relógio da partida deve ficar parado (lance sendo mostrado, VAR, comemoração) */ onHold?: (holding: boolean) => void; varCam?: VarCamId | null; skipVar?: number; /** pedido para pular a cerimônia (entrada e hino) */ skipCeremony?: number;
}) {
  const reduce = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const ref = useRef<HTMLCanvasElement>(null);       // campo em WebGL (three.js)
  const flat = useRef<HTMLCanvasElement>(null);      // letreiros por cima (gol, cartão, confete) ou, sem WebGL, o campo inteiro em 2D
  const live = useRef({ events, minute, speed, paused, userSide, onVar, onHold, varCam, skipVar, skipCer });
  live.current = { events, minute, speed, paused, userSide, onVar, onHold, varCam, skipVar, skipCer };
  const supported = typeof document !== 'undefined' && !!document.createElement('canvas').getContext;

  useEffect(() => {
    const gl = ref.current, canvas = flat.current; if (!gl || !canvas || reduce || !supported) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    const world = createWorld(homeFormation, awayFormation), drv = createDriver();
    if (players) world.posOf = (id) => players.get(id)?.pos;
    if ((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV) (window as unknown as { __pitch3d?: unknown }).__pitch3d = { world, drv }; // só em desenvolvimento: permite inspecionar o campo
    const [hc, ac] = kitColors(home, away);
    const kit = (c: ClubInfo, primary: string): Kit => ({ primary, secondary: c.secondaryColor, gk: gkColor(primary), short: c.shortName, badge: loadBadge(c) });
    const look: Look = { home: kit(home, hc), away: kit(away, ac), userSide };
    let renderer: PitchRenderer | null = null;
    gl.style.display = 'none'; // enquanto o 3D carrega (ou sem WebGL) o campo em 2D aparece
    if (live.current.minute < 0.5 && live.current.events.length > 0) startCeremony(world); // entrada das equipes e hino antes do apito inicial (só no começo da partida)
    let raf = 0, last = performance.now(), alive = true, inVar = false, holding = false, skipSeen = live.current.skipVar, skipCerSeen = live.current.skipCer;
    import('./pitch3d/three/scene').then((m) => { // o three.js só é baixado quando existe uma partida para mostrar
      if (!alive) return;
      try { renderer = m.createPitchRenderer(gl, loadSettings().graphics ?? 'medium', look, { home: homeFormation, away: awayFormation }); } catch { renderer = null; }
      gl.style.display = renderer ? 'block' : 'none';
    }).catch(() => { renderer = null; });
    const frame = (now: number) => {
      if (!alive) return;
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      const cur = live.current;
      look.userSide = cur.userSide;
      const rect = canvas.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(160, Math.round(rect.width)), h = Math.max(100, Math.round(rect.height));
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
      if (cur.skipCer !== skipCerSeen) { skipCerSeen = cur.skipCer; skipCeremony(world); }
      if (!cur.paused || world.var) { if (!world.var && !world.ceremony) drive(world, drv, cur.events, cur.minute); stepWorld(world, dt); } // (a velocidade é sempre 1x)
      if (world.cues.length) for (const c of world.cues.splice(0)) audio.cue(c, 1); // sons no instante em que acontecem (acompanham a velocidade da partida)
      if (!!world.var !== inVar) { inVar = !!world.var; cur.onVar?.(inVar); }
      const hold = isHolding(world); if (hold !== holding) { holding = hold; cur.onHold?.(hold); } // relógio parado durante o lance encenado
      if (world.var && cur.skipVar !== skipSeen) { world.var.skip = true; }
      skipSeen = cur.skipVar;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const v = world.var; let view = world, cam = makeCamera(w, h, world.camX, world.span), camLabel = 'TV';
      if (v && v.stage === 'review') { // repetição do lance, pela câmera escolhida (ou pela sequência automática)
        view = replayView(world); const id = cur.varCam ?? v.camList[v.camIdx] ?? 'tv'; camLabel = VAR_CAMS.find((c) => c.id === id)?.label ?? 'TV';
        cam = varCamera(id, w, h, varFocus(world, view), view.camX);
        if (v.jumped) { renderer?.snap(); v.jumped = false; }
      }
      if (renderer) { renderer.render(view, look, w, h, cam); ctx.clearRect(0, 0, w, h); if (!v) drawOverlay(ctx, world, w, h, cam); }
      else { drawScene(ctx, view, w, h, look); }
      if (v) drawVarOverlay(ctx, v, w, h, camLabel);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { alive = false; cancelAnimationFrame(raf); renderer?.dispose(); if (holding) live.current.onHold?.(false); };
  }, [home.id, away.id, homeFormation, awayFormation]); // eslint-disable-line react-hooks/exhaustive-deps

  if (reduce || !supported) return <PitchSim home={home} away={away} homeFormation={homeFormation} awayFormation={awayFormation} events={events} minute={minute} speed={speed} userSide={userSide} />;
  return <div className="pitch3d" aria-hidden="true"><canvas ref={ref} className="p3-gl" /><canvas ref={flat} className="p3-flat" /></div>;
}
