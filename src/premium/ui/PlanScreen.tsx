import { useState } from 'react';
import { billingAvailable, buyPlan, restorePurchases, type PlanId } from '../billing';
import { recheckExtras } from '../usePremium';
import { PlanChoice } from './PlanChoice';

/** Tela de planos ligada à cobrança: assinar, restaurar compras e seguir no grátis. `onDone(true)` = o Premium foi liberado. */
export function PlanScreen({ onDone }: { onDone: (premium: boolean) => void }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | undefined>();
  const finish = (r: { premium: boolean; message: string }) => { setBusy(false); setMessage(r.message); if (r.premium) { recheckExtras(); onDone(true); } };
  const subscribe = async (plan: PlanId) => { setBusy(true); finish(await buyPlan(plan)); };
  const restore = async () => { setBusy(true); finish(await restorePurchases()); };
  return <PlanChoice billingReady={billingAvailable()} busy={busy} message={message} onSubscribe={subscribe} onRestore={restore} onFree={() => onDone(false)} />;
}
