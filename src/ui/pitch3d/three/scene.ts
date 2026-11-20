import * as THREE from 'three';
import type { Camera } from '../camera';
import type { Look } from '../draw';
import { BALL_R, GOAL_D, GOAL_H, GOAL_W, L, MID_Y, W, type World } from '../world';
import { APRON, makeBallTexture, makePitchTexture } from './textures';
import { createStadium } from './stadium';
import { createAthletes, SHIRT_BY_SLOT, type AthleteKit as AthleteKitT } from './athletes';
import { FORMATION_SLOTS, type FormationId } from '../../../engine/types';

export type Quality = 'low' | 'medium' | 'high';
export interface PitchRenderer { render(w: World, look: Look, width: number, height: number, cam: Camera): void; /** a próxima imagem vai direto às poses (repetição do VAR volta no tempo) */ snap(): void; dispose(): void }

/** Mundo (x ao longo, y largura, z para cima) -> three.js (X, Y para cima, Z). */
const T = (x: number, y: number, z: number) => new THREE.Vector3(x, z, -y);
const hash = (n: number) => { let h = (n * 2654435761) >>> 0; h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; return (h >>> 8) / 0xffffff; };

const QUALITY = {
  low: { pr: 1, shadow: 0, tufts: 0, crowd: 0, aa: false },
  medium: { pr: 1.5, shadow: 1024, tufts: 9000, crowd: 1500, aa: true },
  high: { pr: 2, shadow: 2048, tufts: 26000, crowd: 3600, aa: true },
} as const;

/** Tenta criar o campo em WebGL; devolve null se o aparelho não suporta (aí o jogo usa o campo em 2D). */
export function createPitchRenderer(canvas: HTMLCanvasElement, quality: Quality, look: Look, formations: { home: FormationId; away: FormationId } = { home: '4-4-2', away: '4-4-2' }): PitchRenderer | null {
  const q = QUALITY[quality];
  let renderer: THREE.WebGLRenderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: q.aa, alpha: false, powerPreference: 'high-performance' }); } catch { return null; }
  if (!renderer.getContext()) return null;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = q.shadow > 0; renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const disposables: { dispose(): void }[] = [];
  const own = <A extends { dispose(): void }>(o: A): A => { disposables.push(o); return o; };

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0b1428');
  scene.fog = new THREE.Fog('#0b1428', 150, 380);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.5, 520);

  /* ---- luzes de estádio: céu/gramado + refletores ---- */
  scene.add(new THREE.HemisphereLight(0xeaf2ff, 0x2a5a30, 1.35));
  const sun = new THREE.DirectionalLight(0xfff4e0, 2.1);
  sun.position.copy(T(L / 2 - 28, W + 30, 46)); sun.target.position.copy(T(L / 2, MID_Y, 0));
  if (q.shadow) {
    sun.castShadow = true; sun.shadow.mapSize.set(q.shadow, q.shadow);
    const sc = sun.shadow.camera; sc.left = -70; sc.right = 70; sc.top = 52; sc.bottom = -52; sc.near = 10; sc.far = 160; sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.05;
  }
  scene.add(sun, sun.target);

  /* ---- gramado: textura com listras, manchas, lâminas e linhas ---- */
  const pitchTex = own(makePitchTexture(quality === 'low' ? 'low' : quality));
  const pitch = new THREE.Mesh(own(new THREE.PlaneGeometry(L + APRON * 2, W + APRON * 2)), own(new THREE.MeshLambertMaterial({ map: pitchTex })));
  pitch.rotation.x = -Math.PI / 2; pitch.position.copy(T(L / 2, W / 2, 0)); pitch.receiveShadow = true;
  scene.add(pitch);
  const ground = new THREE.Mesh(own(new THREE.PlaneGeometry(500, 500)), own(new THREE.MeshLambertMaterial({ color: 0x143a20 })));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.03; scene.add(ground);

  /* ---- gramado em 3D: tufos de lâminas com instancing (poucos milhares de objetos de uma vez só) ---- */
  if (q.tufts) {
    const pos: number[] = [], col: number[] = [];
    const tuft = (a: number) => { // dois triângulos cruzados: base escura, ponta clara
      const ca = Math.cos(a), sa = Math.sin(a), hw = 0.018, h = 0.13;
      for (const [dx, dz] of [[ca, sa], [-sa, ca]]) {
        pos.push(-dx * hw, 0, -dz * hw, dx * hw, 0, dz * hw, dx * 0.012, h, dz * 0.012);
        col.push(0.07, 0.3, 0.1, 0.07, 0.3, 0.1, 0.5, 0.82, 0.28);
      }
    };
    tuft(0);
    const geo = own(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); geo.computeVertexNormals();
    const mat = own(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    const tufts = new THREE.InstancedMesh(geo, mat, q.tufts); tufts.receiveShadow = true;
    const m = new THREE.Matrix4(), e = new THREE.Euler(), qt = new THREE.Quaternion(), sc = new THREE.Vector3(), c = new THREE.Color();
    for (let i = 0; i < q.tufts; i++) {
      const x = -4 + hash(i * 3 + 1) * (L + 8), y = -4 + hash(i * 5 + 2) * (W + 8);
      e.set((hash(i * 7 + 3) - 0.5) * 0.35, hash(i * 11 + 4) * Math.PI * 2, (hash(i * 13 + 5) - 0.5) * 0.35); qt.setFromEuler(e);
      const s = 0.7 + hash(i * 17 + 6) * 0.9; sc.set(s, s * (0.8 + hash(i * 19 + 7) * 0.7), s);
      m.compose(T(x, y, 0), qt, sc); tufts.setMatrixAt(i, m);
      const stripe = Math.floor((x + APRON) / 7) % 2, tint = 0.82 + hash(i * 23 + 8) * 0.36;
      c.setRGB((stripe ? 1.05 : 0.9) * tint, (stripe ? 1.1 : 0.95) * tint, tint * 0.9); tufts.setColorAt(i, c);
    }
    tufts.instanceMatrix.needsUpdate = true; if (tufts.instanceColor) tufts.instanceColor.needsUpdate = true;
    scene.add(tufts);
  }

  /* ---- traves, travessão e rede ---- */
  // moldura bem visível no celular: traves e travessão grossos (só o desenho; a física usa o raio real), mais as barras do fundo e dos lados
  const white = own(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.05, emissive: 0x666666 }));
  const FR = 0.2, BR = 0.09;
  const post = own(new THREE.CylinderGeometry(FR, FR, GOAL_H + FR, 12));
  const bar = own(new THREE.CylinderGeometry(FR, FR, GOAL_W + FR * 2, 12));
  const sideBar = own(new THREE.CylinderGeometry(BR, BR, GOAL_D, 8)), backPost = own(new THREE.CylinderGeometry(BR, BR, GOAL_H, 8)), backBar = own(new THREE.CylinderGeometry(BR, BR, GOAL_W, 8));
  const netFill = own(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }));
  const NW = 9, NH = 5;
  const netLines: { geo: THREE.BufferGeometry; gx: number; dir: number; ni: number }[] = [];
  const netMat = own(new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }));
  for (const gx of [0, L]) {
    const dir = gx === 0 ? -1 : 1, yl = MID_Y - GOAL_W / 2, yr = MID_Y + GOAL_W / 2;
    for (const yy of [yl, yr]) { const p = new THREE.Mesh(post, white); p.position.copy(T(gx, yy, (GOAL_H + FR) / 2)); p.castShadow = q.shadow > 0; scene.add(p); }
    const b = new THREE.Mesh(bar, white); b.rotation.x = Math.PI / 2; b.position.copy(T(gx, MID_Y, GOAL_H)); b.castShadow = q.shadow > 0; scene.add(b);
    for (const yy of [yl, yr]) { // barras de cima (do travessão ao fundo) e postes do fundo
      const sb = new THREE.Mesh(sideBar, white); sb.rotation.z = Math.PI / 2; sb.position.copy(T(gx + dir * GOAL_D / 2, yy, GOAL_H)); scene.add(sb);
      const bp = new THREE.Mesh(backPost, white); bp.position.copy(T(gx + dir * GOAL_D, yy, GOAL_H / 2)); scene.add(bp);
    }
    const bb = new THREE.Mesh(backBar, white); bb.rotation.x = Math.PI / 2; bb.position.copy(T(gx + dir * GOAL_D, MID_Y, GOAL_H)); scene.add(bb);
    const backFill = new THREE.Mesh(new THREE.PlaneGeometry(GOAL_W, GOAL_H), netFill); backFill.rotation.y = Math.PI / 2; backFill.position.copy(T(gx + dir * GOAL_D, MID_Y, GOAL_H / 2)); scene.add(backFill); own(backFill.geometry);
    const top = new THREE.Mesh(new THREE.PlaneGeometry(GOAL_D, GOAL_W), netFill); top.rotation.x = -Math.PI / 2; top.position.copy(T(gx + dir * GOAL_D / 2, MID_Y, GOAL_H)); scene.add(top); own(top.geometry);
    // rede: fundo com nós que balançam (grade 9 x 5) + laterais e teto
    const segs: number[] = [];
    const back = (i: number, j: number) => [gx + dir * GOAL_D, yl + (GOAL_W * i) / (NW - 1), (GOAL_H * j) / (NH - 1)];
    for (let i = 0; i < NW; i++) for (let j = 0; j < NH - 1; j++) { const a = back(i, j), c = back(i, j + 1); segs.push(...a, ...c); }
    for (let j = 0; j < NH; j++) for (let i = 0; i < NW - 1; i++) { const a = back(i, j), c = back(i + 1, j); segs.push(...a, ...c); }
    const nBack = segs.length / 3;
    for (let k = 0; k <= 4; k++) { const z = (GOAL_H * k) / 4, x = gx + dir * ((GOAL_D * k) / 4); segs.push(gx, yl, z, gx + dir * GOAL_D, yl, z, gx, yr, z, gx + dir * GOAL_D, yr, z, x, yl, 0, x, yl, GOAL_H, x, yr, 0, x, yr, GOAL_H, x, yl, GOAL_H, x, yr, GOAL_H); }
    const pts = new Float32Array(segs.length);
    for (let i = 0; i < segs.length; i += 3) { const v = T(segs[i], segs[i + 1], segs[i + 2]); pts[i] = v.x; pts[i + 1] = v.y; pts[i + 2] = v.z; }
    const geo = own(new THREE.BufferGeometry()); geo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    scene.add(new THREE.LineSegments(geo, netMat)); void nBack;
    netLines.push({ geo, gx, dir, ni: gx === 0 ? 0 : 1 });
  }

  /* ---- arquibancadas, placas e refletores ---- */
  const adCols = [0xe63946, 0xf1faee, 0x457b9d, 0xffd23f, 0x2a9d8f, 0xf4a261];
  const adGeo = own(new THREE.BoxGeometry(1, 1, 0.12));
  const addBoards = (x0: number, y0: number, x1: number, y1: number, n: number) => {
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n, mx = x0 + (x1 - x0) * (t0 + t1) / 2, my = y0 + (y1 - y0) * (t0 + t1) / 2, len = Math.hypot(x1 - x0, y1 - y0) / n;
      if (my > W + 3 && Math.abs(mx - L / 2) < 6) continue; // boca do túnel dos jogadores
      const m = new THREE.Mesh(adGeo, own(new THREE.MeshLambertMaterial({ color: adCols[i % adCols.length] })));
      m.scale.set(len * 0.98, 0.95, 1); m.position.copy(T(mx, my, 0.5)); m.rotation.y = Math.atan2(y1 - y0, x1 - x0) * -1 + 0; scene.add(m);
    }
  };
  addBoards(-APRON + 1, W + 3.5, L + APRON - 1, W + 3.5, 20);
  addBoards(-4.5, -2, -4.5, W + 3.5, 8); addBoards(L + 4.5, -2, L + 4.5, W + 3.5, 8);
  const crowdStep = quality === 'high' ? 0.62 : quality === 'medium' ? 0.95 : 1.9; // pessoas na arquibancada: mais ou menos conforme o aparelho
  const stadium = createStadium(scene, look, crowdStep, own);
  const towerMat = own(new THREE.MeshBasicMaterial({ color: 0xfffbe6 }));
  const poleMat = own(new THREE.MeshLambertMaterial({ color: 0x555d6e }));
  for (const [tx, ty] of [[-34, W + 44], [L + 34, W + 44]]) {
    const pole = new THREE.Mesh(own(new THREE.CylinderGeometry(0.5, 0.7, 30, 8)), poleMat); pole.position.copy(T(tx, ty, 15)); scene.add(pole);
    const lamp = new THREE.Mesh(own(new THREE.BoxGeometry(7, 3.6, 0.4)), towerMat); lamp.position.copy(T(tx, ty, 31)); lamp.lookAt(T(L / 2, MID_Y, 0)); scene.add(lamp);
  }

  /* ---- bola ---- */
  const ballTex = own(makeBallTexture(quality === 'low' ? 256 : 512));
  const ball = new THREE.Mesh(own(new THREE.SphereGeometry(BALL_R, quality === 'low' ? 14 : 24, quality === 'low' ? 10 : 16)), own(new THREE.MeshStandardMaterial({ map: ballTex, roughness: 0.55, metalness: 0 })));
  ball.castShadow = q.shadow > 0; ball.scale.setScalar(1.7); scene.add(ball); // um pouco maior que o real para aparecer no celular
  const ballQ = new THREE.Quaternion();
  const blobGeo = own(new THREE.CircleGeometry(1, 20)); blobGeo.rotateX(-Math.PI / 2);
  const blobMat = own(new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false }));
  const ballBlob = new THREE.Mesh(blobGeo, blobMat); ballBlob.position.y = 0.02; scene.add(ballBlob);

  /* ---- atletas: modelos low-poly com camisa numerada e animação por pose (athletes.ts / anim.ts) ---- */
  const slotNumbers = (f: FormationId): number[] => { const used = new Map<string, number>(); return FORMATION_SLOTS[f].map((sp) => { const k = used.get(sp) ?? 0; used.set(sp, k + 1); const list = SHIRT_BY_SLOT[sp] ?? [k + 2]; return list[Math.min(k, list.length - 1)]; }); };
  const dist = (a: string, b: string) => { const x = new THREE.Color(a), y = new THREE.Color(b); return Math.hypot(x.r - y.r, x.g - y.g, x.b - y.b); };
  const clash = (c: string) => Math.min(dist(c, look.home.primary), dist(c, look.away.primary), dist(c, look.home.gk), dist(c, look.away.gk));
  const refColor = ['#1b1b1b', '#e8e100', '#00b36b', '#f2f2f2'].find((c) => clash(c) > 0.55) ?? '#1b1b1b'; // uniforme que não se confunde com nenhum dos times
  const arColor = ['#ffb000', '#2b2b2b', '#ff5ba0'].find((c) => clash(c) > 0.5) ?? '#ffb000';
  const officials: [AthleteKitT, AthleteKitT, AthleteKitT] = [{ primary: refColor, secondary: '#111111', gk: refColor }, { primary: arColor, secondary: '#111111', gk: arColor }, { primary: arColor, secondary: '#111111', gk: arColor }];
  const athletes = createAthletes(scene, { ...look, officials }, [...slotNumbers(formations.home), ...slotNumbers(formations.away)], quality, q.shadow > 0);
  const blobs: THREE.Mesh[] = [];
  for (let i = 0; i < 25; i++) { const blob = new THREE.Mesh(blobGeo, blobMat); blob.position.y = 0.02; blob.scale.set(0.8, 1, 0.8); scene.add(blob); blobs.push(blob); }
  const ring = new THREE.Mesh(own(new THREE.RingGeometry(1.0, 1.15, 28)), own(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false })));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; ring.visible = false; scene.add(ring);

  // linhas do impedimento (repetição do VAR): branca no último defensor, vermelha no atacante
  const lineGeo = own(new THREE.BoxGeometry(0.22, 0.03, W + 6));
  const defLine = new THREE.Mesh(lineGeo, own(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }))), attLine = new THREE.Mesh(lineGeo, own(new THREE.MeshBasicMaterial({ color: 0xff2d2d, transparent: true, opacity: 0.9 })));
  defLine.visible = attLine.visible = false; scene.add(defLine, attLine);
  let lastT = -1;
  const resize = (width: number, height: number) => {
    const pr = Math.min(window.devicePixelRatio || 1, q.pr) * scale;
    renderer.setPixelRatio(pr); renderer.setSize(width, height, false);
  };
  let sizeKey = '';
  // qualidade adaptativa: se o aparelho não dá conta (quadros lentos por alguns segundos), baixa a resolução e depois as sombras, sem o jogador mexer em nada
  let scale = 1, ema = 16, slow = 0, lastFrame = 0;
  const adapt = () => {
    const now = performance.now(), ft = lastFrame ? now - lastFrame : 16; lastFrame = now;
    if (ft > 250) return; // aba em segundo plano ou pausa: não conta
    ema = ema * 0.92 + ft * 0.08;
    if (ema > 34) { if (++slow > 40) { slow = 0; if (scale > 0.62) { scale = Math.max(0.6, scale * 0.85); sizeKey = ''; } else if (sun.castShadow) { sun.castShadow = false; renderer.shadowMap.enabled = false; scene.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (m) m.needsUpdate = true; }); } } } else slow = 0;
  };

  return {
    render(w, lk, width, height, cam) {
      adapt();
      const key = `${width}x${height}`; if (key !== sizeKey) { sizeKey = key; resize(width, height); }
      // câmera de transmissão: a mesma do desenho 2D (assim o letreiro, o cartão e o confete por cima ficam alinhados)
      const dt = lastT < 0 ? 0 : Math.max(0, Math.min(0.1, w.t - lastT)); lastT = w.t;
      camera.fov = (2 * Math.atan(height / 2 / cam.focal) * 180) / Math.PI; camera.aspect = width / height;
      camera.setViewOffset(width, height, 0, -(cam.cy - height / 2), width, height); camera.updateProjectionMatrix();
      camera.position.copy(T(cam.px, cam.py, cam.pz)); camera.up.set(0, 1, 0); camera.lookAt(T(cam.px + cam.fx * 40, cam.py + cam.fy * 40, cam.pz + cam.fz * 40));
      const vl = w.var?.stage === 'review' ? w.var.line : undefined; defLine.visible = attLine.visible = !!vl; if (vl) { defLine.position.copy(T(vl.def, MID_Y, 0.04)); attLine.position.copy(T(vl.att, MID_Y, 0.045)); }
      // atletas
      athletes.update(w, dt); [...w.agents, ...w.refs].forEach((a, i) => { blobs[i].position.set(a.x, 0.02, -a.y); blobs[i].visible = a.off !== 'gone'; });
      const carrier = lk.userSide && w.flow.carrier >= 0 ? w.agents[w.flow.carrier] : null;
      ring.visible = !!carrier && carrier.side === lk.userSide; if (carrier) ring.position.set(carrier.x, 0.03, -carrier.y);
      // bola: gira conforme a direção e a velocidade (rolando ou no ar)
      const b = w.ball;
      ball.position.copy(T(b.p.x, b.p.y, b.p.z));
      if (dt > 0) {
        const vh = T(b.v.x, b.v.y, 0), spd = vh.length();
        if (spd > 0.02) { const axis = new THREE.Vector3(0, 1, 0).cross(vh).normalize(); const dq = new THREE.Quaternion().setFromAxisAngle(axis, (spd * dt) / BALL_R); ballQ.premultiply(dq); }
        if (b.curve) ballQ.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.sign(b.curve) * Math.min(14, Math.abs(b.curve) * 3) * dt));
      }
      ball.quaternion.copy(ballQ);
      ballBlob.position.set(b.p.x, 0.02, -b.p.y); const bs = BALL_R * 1.7 * (1.3 + b.p.z * 0.35); ballBlob.scale.set(bs, 1, bs); (ballBlob.material as THREE.MeshBasicMaterial).opacity = Math.max(0.08, 0.34 - b.p.z * 0.08);
      // rede: acompanha o balanço calculado pela física
      for (const n of netLines) {
        const net = w.nets[n.ni], pos = n.geo.getAttribute('position') as THREE.BufferAttribute, yl = MID_Y - GOAL_W / 2;
        let k = 0;
        const node = (i: number, j: number) => { const d = net.d[i * net.h + j] ?? 0; return T(n.gx + n.dir * (GOAL_D + d * 0.55), yl + (GOAL_W * i) / (NW - 1), (GOAL_H * j) / (NH - 1)); };
        for (let i = 0; i < NW; i++) for (let j = 0; j < NH - 1; j++) { const a = node(i, j), c = node(i, j + 1); pos.setXYZ(k++, a.x, a.y, a.z); pos.setXYZ(k++, c.x, c.y, c.z); }
        for (let j = 0; j < NH; j++) for (let i = 0; i < NW - 1; i++) { const a = node(i, j), c = node(i + 1, j); pos.setXYZ(k++, a.x, a.y, a.z); pos.setXYZ(k++, c.x, c.y, c.z); }
        pos.needsUpdate = true;
      }
      stadium.update(w, dt); // torcida (pula no gol) e mosaico da cerimônia
      renderer.render(scene, camera);
    },
    snap() { athletes.snap(); },
    dispose() {
      athletes.dispose(); for (const d of disposables) d.dispose();
      scene.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); });
      renderer.dispose(); renderer.forceContextLoss();
    },
  };
}
