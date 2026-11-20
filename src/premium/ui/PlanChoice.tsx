import { useState } from 'react';
import './plans.css';

export type PlanId = 'weekly' | 'monthly' | 'lifetime';
export const PLANS: { id: PlanId; name: string; price: string; unit: string; note: string }[] = [
  { id: 'weekly', name: 'Semanal', price: 'R$ 3,90', unit: 'por semana', note: 'Renovação semanal' },
  { id: 'monthly', name: 'Mensal', price: 'R$ 9,99', unit: 'por mês', note: 'Renovação mensal' },
  { id: 'lifetime', name: 'Vitalício', price: 'R$ 29,99', unit: 'pagamento único', note: 'Premium para sempre' },
];

/** Linhas da comparação: só o que existe de fato em cada versão. */
export const COMPARE: { feature: string; free: string; premium: string }[] = [
  { feature: 'Primeira temporada', free: 'Completa', premium: 'Completa' },
  { feature: 'Da segunda temporada em diante', free: 'Liga do seu clube', premium: 'Jogo completo' },
  { feature: 'Divisões do campeonato', free: '1 temporada grátis por aparelho', premium: 'Todas, sempre' },
  { feature: 'Copa nacional, estaduais e continentais', free: '1 temporada grátis por aparelho', premium: 'Sempre' },
  { feature: 'Mundo, copas especiais e Super Mundial', free: '1 temporada grátis por aparelho', premium: 'Sempre' },
  { feature: 'Mods da comunidade', free: 'Indisponível', premium: 'Incluído' },
  { feature: 'Anúncios', free: 'Com anúncios', premium: 'Sem anúncios' },
];

const Check = () => (
  <svg className="pl-ico" viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M4.5 10.5l3.4 3.4 7.6-7.8" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
const Dash = () => (
  <svg className="pl-ico dim" viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M5 10h10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
);

/**
 * Tela "Escolha como jogar": compara a versão grátis com o Premium e mostra os três planos.
 * `billingReady` = a cobrança pela Google Play já está ativa; enquanto não estiver, o botão de assinar fica indisponível.
 */
export function PlanChoice({ onFree, onSubscribe, onRestore, billingReady = false, busy = false, message }: { onFree: () => void; onSubscribe?: (plan: PlanId) => void; onRestore?: () => void; billingReady?: boolean; busy?: boolean; message?: string }) {
  const [plan, setPlan] = useState<PlanId>('monthly');
  const chosen = PLANS.find((p) => p.id === plan)!;
  return (
    <main className="pl" aria-labelledby="pl-title">
      <header className="pl-head">
        <span className="pl-brand">Vida Real FC</span>
        <h1 id="pl-title">Escolha como jogar</h1>
        <p>Comece grátis. Libere o jogo completo com o Premium quando quiser. Seu progresso é sempre mantido.</p>
      </header>

      <section className="pl-card" aria-label="Comparação entre as versões">
        <table className="pl-table">
          <thead><tr><th scope="col"><span className="sr">Recurso</span></th><th scope="col">Grátis</th><th scope="col" className="prem">Premium</th></tr></thead>
          <tbody>
            {COMPARE.map((r) => (
              <tr key={r.feature}>
                <th scope="row">{r.feature}</th>
                <td><div className="pl-cell">{r.free === 'Indisponível' ? <Dash /> : <Check />}<span>{r.free}</span></div></td>
                <td className="prem"><div className="pl-cell"><Check /><span>{r.premium}</span></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="pl-plans" aria-label="Planos do Premium">
        <h2>Premium</h2>
        <div className="pl-grid" role="radiogroup" aria-label="Plano">
          {PLANS.map((p) => (
            <button key={p.id} type="button" role="radio" aria-checked={plan === p.id} className={`pl-plan ${plan === p.id ? 'on' : ''}`} onClick={() => setPlan(p.id)}>
              {p.id === 'monthly' && <em>Popular</em>}
              {p.id === 'lifetime' && <em>Melhor valor</em>}
              <strong>{p.name}</strong>
              <b>{p.price}</b>
              <span>{p.unit}</span>
            </button>
          ))}
        </div>
        <button type="button" className="pl-cta" disabled={!billingReady || busy} onClick={() => onSubscribe?.(plan)}>
          {!billingReady ? 'Disponível em breve na Google Play' : busy ? 'Aguarde…' : plan === 'lifetime' ? `Comprar por ${chosen.price}` : `Assinar por ${chosen.price}`}
        </button>
        <p className="pl-msg" role="status" aria-live="polite">{message ?? ''}</p>
        <button type="button" className="pl-free" onClick={onFree}>Continuar com a versão grátis</button>
      </section>

      <footer className="pl-foot">
        <p>As assinaturas semanal e mensal são cobradas pela Google Play e renovam automaticamente até serem canceladas. Você pode cancelar a qualquer momento em Play Store, Pagamentos e assinaturas. O plano Vitalício é um pagamento único e libera o Premium para sempre.</p>
        <p>O acesso volta automaticamente ao entrar com a mesma conta Google.{billingReady && onRestore ? <> <button type="button" className="pl-link" onClick={onRestore} disabled={busy}>Restaurar compras</button></> : null}</p>
      </footer>
    </main>
  );
}
