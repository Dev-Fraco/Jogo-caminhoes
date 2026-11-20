import { Suspense, type ReactNode } from 'react';
import type { FeatureId } from '../premium/features';
import { useExtras } from '../premium/usePremium';
import { PremiumPreview } from '../premium/ui/PremiumPreview';

/** Mostra o recurso Premium (carregado sob demanda) quando liberado; senão, a prévia com cadeado. */
export function PremiumGate({ feature, children, onBack }: { feature: FeatureId; children: ReactNode; onBack?: () => void }) {
  const state = useExtras();
  if (state === 'off') return <PremiumPreview feature={feature} onBack={onBack} />;
  if (state === 'loading') return <p className="hint" role="status">Carregando…</p>;
  return <Suspense fallback={<p className="hint" role="status">Carregando…</p>}>{children}</Suspense>;
}
