import { Suspense, type ReactNode } from 'react';
import type { FeatureId } from '../premium/features';
import { extrasError, recheckExtras, useExtras } from '../premium/usePremium';
import { PremiumPreview } from '../premium/ui/PremiumPreview';

/** Mostra o recurso Premium (carregado sob demanda) quando liberado; senão, a prévia com cadeado. */
export function PremiumGate({ feature, children, onBack }: { feature: FeatureId; children: ReactNode; onBack?: () => void }) {
  const state = useExtras();
  if (state === 'off') return <PremiumPreview feature={feature} onBack={onBack} />;
  if (state === 'error') return (
    <div className="card" role="alert">
      <p style={{ margin: 0 }}><b>Não foi possível carregar o conteúdo Premium agora.</b></p>
      <p className="hint">Seu Premium está ativo. Confira a internet e se o jogo foi instalado pela Google Play, e tente de novo.</p>
      <p className="hint">Código: {extrasError() || 'desconhecido'}</p>
      <button type="button" className="primary" onClick={recheckExtras}>Tentar de novo</button>
      {onBack && <button type="button" onClick={onBack}>Voltar</button>}
    </div>
  );
  if (state === 'loading') return <p className="hint" role="status">Carregando…</p>;
  return <Suspense fallback={<p className="hint" role="status">Carregando…</p>}>{children}</Suspense>;
}
