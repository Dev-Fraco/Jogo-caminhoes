import { useEffect, useRef, useState } from 'react';
import { addPhoto, phoneOf, removePhoto, setPhotoWallpaper } from '../engine/phone';
import { canPost, publish, APP_INFO, type SocialApp } from '../engine/social';
import type { GameState } from '../engine/types';

/** Redimensiona o quadro do vídeo para um JPEG pequeno (cabe no save). */
function snap(video: HTMLVideoElement): string | null {
  const vw = video.videoWidth, vh = video.videoHeight;
  if (!vw || !vh) return null;
  const W = 240, H = 320, canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const r = Math.max(W / vw, H / vh), dw = vw * r, dh = vh * r;
  ctx.translate(W, 0); ctx.scale(-1, 1); // espelhado, como na câmera frontal
  ctx.drawImage(video, (W - dw) / 2, (H - dh) / 2, dw, dh);
  return canvas.toDataURL('image/jpeg', 0.7);
}

/** Câmera frontal de verdade: mostra o rosto do usuário; a foto pode virar post nas redes ou fundo de tela. */
export function CameraApp({ game, onChange }: { game: GameState; onChange: (g: GameState) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [state, setState] = useState<'abrindo' | 'ao-vivo' | 'erro'>('abrindo');
  const [err, setErr] = useState('');
  const [shot, setShot] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const photos = phoneOf(game).photos ?? [];

  const stop = () => { stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null; };
  const open = async () => {
    setState('abrindo'); setErr('');
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('sem-camera');
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
      stream.current = s;
      if (video.current) { video.current.srcObject = s; await video.current.play().catch(() => undefined); }
      setState('ao-vivo');
    } catch (e) {
      const name = (e as { name?: string }).name ?? '';
      setErr(name === 'NotAllowedError' || name === 'SecurityError' ? 'A permissão da câmera foi negada. Libere a câmera nas configurações do aparelho e tente de novo.' : 'Não consegui abrir a câmera frontal deste aparelho.');
      setState('erro');
    }
  };
  useEffect(() => { void open(); return stop; }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const take = () => { if (!video.current) return; const p = snap(video.current); if (p) { setShot(p); setMsg(''); } };
  const save = (keep = true) => { if (shot && keep) onChange(addPhoto(game, shot)); };
  const post = (app: SocialApp) => {
    if (!shot) return;
    const r = publish(addPhoto(game, shot), app, 'selfie', shot);
    if (!r.ok) { setMsg(r.error); return; }
    onChange(r.state); setMsg(`Postado na ${APP_INFO[app].name}! ${r.result.delta >= 0 ? '+' : '−'}${Math.abs(r.result.delta)} seguidores.`); setShot(null);
  };

  return (
    <div className="cam">
      <div className="cam-view">
        {shot ? <img src={shot} alt="Sua foto" /> : <video ref={video} playsInline muted aria-label="Câmera frontal" />}
      </div>
      {state === 'abrindo' && !shot && <p className="bk-sub">Abrindo a câmera…</p>}
      {state === 'erro' && !shot && <><p className="bk-sub" role="alert">{err}</p><button className="ph-btn pri" onClick={() => void open()}>Tentar de novo</button></>}
      {state === 'ao-vivo' && !shot && <button className="cam-shutter" aria-label="Tirar foto" onClick={take} />}
      {shot && (
        <div className="cam-row">
          <button className="ph-btn pri" onClick={() => { onChange(setPhotoWallpaper(addPhoto(game, shot), shot)); setMsg('Foto definida como fundo de tela!'); setShot(null); }}>🖼️ Usar de fundo</button>
          {(['linstagra', 'tikiteko'] as SocialApp[]).map((a) => <button key={a} className="ph-btn" disabled={!canPost(game, a)} onClick={() => post(a)}>{APP_INFO[a].icon} Postar na {APP_INFO[a].name}</button>)}
          <button className="ph-btn" onClick={() => { save(); setShot(null); setMsg('Foto guardada na galeria.'); }}>💾 Guardar</button>
          <button className="ph-btn" onClick={() => setShot(null)}>🗑️ Descartar</button>
        </div>
      )}
      {msg && <p className="bk-sub" role="status">{msg}</p>}
      {photos.length > 0 && (
        <>
          <small>Galeria ({photos.length}) — toque para usar de fundo, segure o botão ✖ para apagar</small>
          <div className="cam-gal">
            {photos.map((ph, i) => <img key={i} src={ph} alt={`Foto ${i + 1}`} className={phoneOf(game).wallpaperPhoto === ph ? 'on' : ''} onClick={() => { onChange(setPhotoWallpaper(game, ph)); setMsg('Fundo de tela trocado!'); }} onContextMenu={(e) => { e.preventDefault(); onChange(removePhoto(game, ph)); }} />)}
          </div>
          <button className="ph-btn" onClick={() => { let g = game; for (const ph of photos) g = removePhoto(g, ph); onChange(g); }}>🗑️ Apagar todas as fotos</button>
        </>
      )}
    </div>
  );
}
