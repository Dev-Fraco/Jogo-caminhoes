import * as THREE from 'three';
import { J, newAnim, stepAnim, type AnimState, type Pose } from '../anim';
import type { World } from '../world';

/* =====================================================================
   Atletas em low-poly "realista": cabeça com pescoço, tronco afunilado, braços e antebraços, coxas, canelas, meiões e chuteiras, com a
   camisa numerada. Cada parte do corpo é UM InstancedMesh para os 22 jogadores (poucas chamadas de desenho no celular); o esqueleto é
   feito só de Object3D vazios e a pose de cada quadro vem de anim.ts.
   ===================================================================== */

export interface AthleteKit { primary: string; secondary: string; gk: string }
export interface AthleteLook { home: AthleteKit; away: AthleteKit; /** árbitro principal e assistentes (uniformes próprios) */ officials?: [AthleteKit, AthleteKit, AthleteKit] }
export type AQuality = 'low' | 'medium' | 'high';

const hash = (n: number) => { let h = (n * 2654435761) >>> 0; h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; return (h >>> 8) / 0xffffff; };
const lum = (hex: string) => { const c = new THREE.Color(hex); return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; };
const SKINS = ['#f1c9a0', '#e0ac7c', '#c68642', '#8d5524', '#5b3a1e'];
const HAIRS = ['#1b1209', '#3b2412', '#6b4423', '#c9a24a', '#0d0d0d', '#7a7a7a'];
export const SCALE = 1.35; // atletas um pouco maiores que o real para ler bem na tela do celular
export const HIP_Y = 0.92;

/** Camisa pelo posto na formação (convenção: 1 goleiro, 2 lateral direito, 3 e 4 zagueiros, 5 volante...), pois o motor não guarda número de camisa. */
export const SHIRT_BY_SLOT: Record<string, number[]> = { GK: [1], LD: [2], LE: [6], ZAG: [3, 4, 13], MC: [5, 8, 15, 18], MD: [7], ME: [11], PD: [7], PE: [11], CA: [9, 10, 19] };

function numberTexture(n: number, shirt: string): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d')!; g.clearRect(0, 0, 128, 128);
  g.font = '900 96px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 7; g.strokeStyle = lum(shirt) > 0.5 ? 'rgba(0,0,0,.55)' : 'rgba(255,255,255,.55)'; g.strokeText(String(n), 64, 70);
  g.fillStyle = lum(shirt) > 0.5 ? '#101820' : '#ffffff'; g.fillText(String(n), 64, 70);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 2; return t;
}

type PartName = 'torso' | 'pelvis' | 'shortL' | 'thigh' | 'shin' | 'boot' | 'upperArm' | 'foreArm' | 'hand' | 'neck' | 'head' | 'hair';
interface Part { mesh: THREE.InstancedMesh; perAthlete: number }

export interface Athletes {
  update(w: World, dt: number): void;
  /** troca o número exibido (substituição): `i` = índice do agente (0 a 21) */
  setNumber(i: number, n: number): void;
  dispose(): void;
}

export function createAthletes(scene: THREE.Scene, look: AthleteLook, numbers: number[], quality: AQuality, castShadow: boolean): Athletes {
  const seg = quality === 'high' ? 10 : quality === 'medium' ? 8 : 6;
  const owned: { dispose(): void }[] = [];
  const own = <A extends { dispose(): void }>(o: A): A => { owned.push(o); return o; };
  const cyl = (rt: number, rb: number, h: number, y: number) => { const g = new THREE.CylinderGeometry(rt, rb, h, seg); g.translate(0, y, 0); return own(g); };
  const white = () => own(new THREE.MeshLambertMaterial({ color: 0xffffff }));
  const N = 25; // 22 jogadores + árbitro + 2 assistentes

  const geo: Record<PartName, THREE.BufferGeometry> = {
    torso: (() => { const g = cyl(0.205, 0.15, 0.54, 0.29); g.scale(0.66, 1, 1.3); return g; })(),     // ombros largos, cintura estreita, tórax menos fundo que largo
    pelvis: (() => { const g = cyl(0.15, 0.165, 0.2, -0.02); g.scale(0.78, 1, 1.25); return g; })(),
    shortL: cyl(0.105, 0.115, 0.27, -0.13),                                                             // perna do calção
    thigh: cyl(0.09, 0.07, 0.43, -0.215),
    shin: cyl(0.066, 0.05, 0.43, -0.215),                                                               // meião
    boot: (() => { const g = new THREE.BoxGeometry(0.27, 0.09, 0.11, 1, 1, 1); g.translate(0.07, -0.03, 0); return own(g); })(),
    upperArm: cyl(0.055, 0.048, 0.29, -0.145),
    foreArm: cyl(0.045, 0.036, 0.27, -0.135),
    hand: (() => { const g = new THREE.SphereGeometry(0.052, 6, 5); g.translate(0, -0.03, 0); return own(g); })(),
    neck: cyl(0.05, 0.055, 0.1, 0.57),
    head: (() => { const g = new THREE.IcosahedronGeometry(0.118, quality === 'low' ? 0 : 1); g.scale(0.95, 1.12, 0.92); g.translate(0.01, 0.13, 0); return own(g); })(),
    hair: (() => { const g = new THREE.SphereGeometry(0.126, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.56); g.scale(1, 1.1, 1); g.translate(-0.005, 0.14, 0); return own(g); })(),
  };
  const per: Record<PartName, number> = { torso: 1, pelvis: 1, shortL: 2, thigh: 2, shin: 2, boot: 2, upperArm: 2, foreArm: 2, hand: 2, neck: 1, head: 1, hair: 1 };
  const parts = {} as Record<PartName, Part>;
  for (const k of Object.keys(geo) as PartName[]) {
    const mesh = new THREE.InstancedMesh(geo[k], own(white()), N * per[k]);
    mesh.castShadow = castShadow && k !== 'hand'; mesh.frustumCulled = false; scene.add(mesh); parts[k] = { mesh, perAthlete: per[k] };
  }
  const col = new THREE.Color();
  const paint = (k: PartName, i: number, j: number, hex: string) => { parts[k].mesh.setColorAt(i * per[k] + j, col.set(hex)); };

  /* ---- esqueleto de cada atleta: só Object3D (sem malhas), com as articulações animadas ---- */
  interface Skel { root: THREE.Group; body: THREE.Group; spine: THREE.Group; head: THREE.Group; sh: [THREE.Group, THREE.Group]; el: [THREE.Group, THREE.Group]; hip: [THREE.Group, THREE.Group]; knee: [THREE.Group, THREE.Group]; ank: [THREE.Group, THREE.Group]; num: THREE.Mesh; state: AnimState }
  const skels: Skel[] = [];
  const numGeo = own(new THREE.PlaneGeometry(0.26, 0.26));
  const numMats: THREE.MeshBasicMaterial[] = [];
  for (let i = 0; i < N; i++) {
    const off = i >= 22, home = i < 11, gk = !off && i % 11 === 0, kit = off ? (look.officials?.[i - 22] ?? look.home) : home ? look.home : look.away;
    const shirt = gk ? kit.gk : kit.primary, shorts = kit.secondary, sock = kit.primary;
    const g = () => new THREE.Group();
    const root = g(), body = g(), spine = g(), head = g();
    body.position.y = HIP_Y; spine.position.y = 0.07; head.position.y = 0.58; root.add(body); body.add(spine); spine.add(head);
    const sh: Skel['sh'] = [g(), g()], el: Skel['el'] = [g(), g()], hip: Skel['hip'] = [g(), g()], knee: Skel['knee'] = [g(), g()], ank: Skel['ank'] = [g(), g()];
    ([-1, 1] as const).forEach((side, s) => { // 0 = esquerdo (z negativo), 1 = direito
      sh[s].position.set(0, 0.5, side * 0.215); spine.add(sh[s]); el[s].position.y = -0.29; sh[s].add(el[s]);
      hip[s].position.set(0, -0.06, side * 0.095); body.add(hip[s]); knee[s].position.y = -0.43; hip[s].add(knee[s]); ank[s].position.y = -0.43; knee[s].add(ank[s]);
    });
    // número da camisa: nas costas e no peito
    const mat = new THREE.MeshBasicMaterial({ map: numberTexture(numbers[i] ?? i + 1, shirt), visible: !off, transparent: true, depthWrite: false, side: THREE.DoubleSide }); numMats.push(mat);
    const num = new THREE.Mesh(numGeo, mat); num.position.set(-0.14, 0.32, 0); num.rotation.y = -Math.PI / 2; spine.add(num);
    const front = new THREE.Mesh(numGeo, mat); front.scale.setScalar(0.5); front.position.set(0.14, 0.43, -0.07); front.rotation.y = Math.PI / 2; spine.add(front);
    root.scale.setScalar(SCALE); scene.add(root);
    skels.push({ root, body, spine, head, sh, el, hip, knee, ank, num, state: newAnim(i) });
    // cores (uma vez): camisa, calção, meiões, pele e cabelo de cada atleta
    const skin = SKINS[Math.floor(hash(i * 7 + 3) * SKINS.length)], hair = HAIRS[Math.floor(hash(i * 11 + 5) * HAIRS.length)];
    const glove = gk ? '#f5f5f5' : skin, boot = gk ? '#111' : hash(i * 13) > 0.5 ? '#151515' : '#f2f2f2';
    paint('torso', i, 0, shirt); paint('pelvis', i, 0, shorts); paint('neck', i, 0, skin); paint('head', i, 0, skin); paint('hair', i, 0, hair);
    for (let j = 0; j < 2; j++) { paint('shortL', i, j, shorts); paint('thigh', i, j, skin); paint('shin', i, j, gk ? shorts : sock); paint('boot', i, j, boot); paint('upperArm', i, j, shirt); paint('foreArm', i, j, gk ? shirt : skin); paint('hand', i, j, glove); }
  }
  for (const k of Object.keys(parts) as PartName[]) if (parts[k].mesh.instanceColor) parts[k].mesh.instanceColor!.needsUpdate = true;

  // bandeira dos assistentes (xadrez vermelho e amarelo) e cartão do árbitro: presos à mão direita
  const flagTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d')!; for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) { g.fillStyle = (x + y) % 2 ? '#e11d1d' : '#ffd400'; g.fillRect(x * 32, y * 32, 32, 32); } const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return own(t); })();
  const flagMat = own(new THREE.MeshBasicMaterial({ map: flagTex, side: THREE.DoubleSide })), poleMat = own(new THREE.MeshLambertMaterial({ color: 0x222222 }));
  const cardGeo = own(new THREE.PlaneGeometry(0.075, 0.11)), cardMats = { yellow: own(new THREE.MeshBasicMaterial({ color: 0xffd400, side: THREE.DoubleSide })), red: own(new THREE.MeshBasicMaterial({ color: 0xe11d1d, side: THREE.DoubleSide })) };
  const poleGeo = own(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 5)), flagGeo = own(new THREE.PlaneGeometry(0.32, 0.24));
  for (const i of [23, 24]) { const hand = skels[i].el[1]; const pole = new THREE.Mesh(poleGeo, poleMat); pole.position.y = -0.27; hand.add(pole); const fl = new THREE.Mesh(flagGeo, flagMat); fl.position.set(0, -0.4, 0.16); hand.add(fl); }
  const refCard = new THREE.Mesh(cardGeo, cardMats.yellow); refCard.position.set(0, -0.4, 0); refCard.visible = false; skels[22].el[1].add(refCard);

  const apply = (s: Skel, p: Pose) => {
    s.body.position.y = HIP_Y + p[J.rootY]; s.body.rotation.set(p[J.rootRoll], 0, -p[J.rootPitch]);
    s.spine.rotation.set(0, p[J.spineTwist], -p[J.spinePitch]); s.head.rotation.set(0, p[J.headYaw], -p[J.headPitch]);
    s.sh[0].rotation.set(p[J.lShA], 0, p[J.lShP]); s.sh[1].rotation.set(-p[J.rShA], 0, p[J.rShP]);
    s.el[0].rotation.set(0, 0, p[J.lElb]); s.el[1].rotation.set(0, 0, p[J.rElb]);
    s.hip[0].rotation.set(p[J.lHipA], 0, p[J.lHip]); s.hip[1].rotation.set(-p[J.rHipA], 0, p[J.rHip]);
    s.knee[0].rotation.set(0, 0, -p[J.lKnee]); s.knee[1].rotation.set(0, 0, -p[J.rKnee]);
    s.ank[0].rotation.set(0, 0, p[J.lAnk]); s.ank[1].rotation.set(0, 0, p[J.rAnk]);
  };
  const T = (x: number, y: number, z: number) => new THREE.Vector3(x, z, -y);
  let lastT = -1;
  return {
    update(w, dtIn) {
      const dt = dtIn >= 0 ? dtIn : lastT < 0 ? 0 : Math.max(0, Math.min(0.1, w.t - lastT)); lastT = w.t;
      [...w.agents, ...w.refs].forEach((a, i) => {
        const s = skels[i];
        const view = { vx: a.vx, vy: a.vy, heading: a.heading, carrying: w.ball.mode === 'carried' && w.ball.carrier === a.id, gk: a.gk, down: a.state === 'down', celebrate: a.state === 'celebrate', act: a.act, t: w.t };
        const pose = stepAnim(s.state, view, dt);
        s.root.position.copy(T(a.x, a.y, 0)); s.root.rotation.y = a.heading; apply(s, pose);
        s.root.scale.setScalar(a.off === 'gone' ? 0.0001 : SCALE); // quem foi expulso e já saiu do campo não aparece
      });
      const showCard = !!w.card && w.card.until > w.t && w.refs[0]?.act?.kind === 'ref_card'; refCard.visible = showCard; if (showCard && w.card) refCard.material = cardMats[w.card.kind];
      for (const s of skels) s.root.updateMatrixWorld(true);
      const set = (k: PartName, getJoint: (s: Skel, j: number) => THREE.Object3D) => {
        const { mesh, perAthlete } = parts[k];
        skels.forEach((s, i) => { for (let j = 0; j < perAthlete; j++) mesh.setMatrixAt(i * perAthlete + j, getJoint(s, j).matrixWorld); });
        mesh.instanceMatrix.needsUpdate = true;
      };
      set('torso', (s) => s.spine); set('pelvis', (s) => s.body); set('neck', (s) => s.spine);
      // o pescoço e a cabeça saem do alto do tronco
      set('head', (s) => s.head); set('hair', (s) => s.head);
      set('shortL', (s, j) => s.hip[j]); set('thigh', (s, j) => s.hip[j]); set('shin', (s, j) => s.knee[j]); set('boot', (s, j) => s.ank[j]);
      set('upperArm', (s, j) => s.sh[j]); set('foreArm', (s, j) => s.el[j]); set('hand', (s, j) => s.el[j]);
    },
    setNumber(i, n) { const m = numMats[i]; if (!m) return; const side = i < 11 ? look.home : look.away; m.map?.dispose(); m.map = numberTexture(n, i % 11 === 0 ? side.gk : side.primary); m.needsUpdate = true; },
    dispose() {
      for (const o of owned) o.dispose();
      for (const m of numMats) { m.map?.dispose(); m.dispose(); }
      for (const k of Object.keys(parts) as PartName[]) { scene.remove(parts[k].mesh); parts[k].mesh.dispose(); }
      for (const s of skels) scene.remove(s.root);
    },
  };
}
