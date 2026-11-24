import { useEffect, useState } from 'react';
import { audio } from '../audio/audio';

/** Nome da empresa mostrado na abertura (troque aqui). */
export const STUDIO_NAME = 'FLEXONIX';
export const STUDIO_TAGLINE = 'Estúdio de Jogos';
const CREATORS = ['Flexon Jr', 'Raul Freitas', 'Douglas Breno'];

/** Abertura estilo anos 90 (PlayStation 1): 1) nome da empresa (2 s); 2) criadores e aviso dos mods (3 s); depois o menu. Toque para pular. */
export function Intro({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<0 | 1>(0);
  useEffect(() => {
    try { audio.intro(); } catch { /* sem áudio */ }
    const t1 = window.setTimeout(() => setStep(1), 2000);
    const t2 = window.setTimeout(onDone, 5000);
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="intro" role="presentation" onClick={onDone} aria-label="Abertura do jogo (toque para pular)">
      <div className="intro-scan" aria-hidden="true" />
      {step === 0 ? (
        <div className="intro-logo" key="a">
          <div className="intro-spin" aria-label={STUDIO_NAME}>{STUDIO_NAME}</div>
          <small>{STUDIO_TAGLINE} apresenta</small>
        </div>
      ) : (
        <div className="intro-credits" key="b">
          <h2>Vida Real FC</h2>
          <p className="intro-by">Criado por</p>
          <ul>{CREATORS.map((c) => <li key={c}>{c}</li>)}</ul>
          <p className="intro-warn">⚠️ <b>Aviso sobre os mods:</b> o jogo não inclui nomes nem escudos reais. Os mods da comunidade são feitos por terceiros e o Vida Real FC não se responsabiliza por eles.</p>
        </div>
      )}
      <span className="intro-skip">Toque para pular</span>
    </div>
  );
}
