import { FEATURES, type FeatureId } from '../features';

/** Tela de prévia de um recurso Premium (cadeado). A cobrança entra numa etapa seguinte: por enquanto o botão só avisa. */
export function PremiumPreview({ feature, onBack }: { feature: FeatureId; onBack?: () => void }) {
  const f = FEATURES[feature];
  return (
    <section className="card prem-preview" aria-label={`${f.title}: recurso Premium`}>
      <div className="prem-lock" aria-hidden="true">🔒</div>
      <h3>{f.icon} {f.title}</h3>
      <p>{f.text}</p>
      <ul>{f.bullets.map((b) => <li key={b}>{b}</li>)}</ul>
      <p className="hint">Este recurso faz parte do <b>Premium</b>.</p>
      <button className="primary" disabled title="A assinatura chega numa próxima etapa">Conhecer o Premium (em breve)</button>
      {onBack && <button className="btn" onClick={onBack}>Voltar</button>}
    </section>
  );
}
