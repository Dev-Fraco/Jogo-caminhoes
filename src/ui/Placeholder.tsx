export function Placeholder({ title, note = 'Em breve', onBack }: { title: string; note?: string; onBack: () => void }) {
  return (
    <div className="app">
      <header>
        <div><strong>{title}</strong></div>
        <button className="ghost" onClick={onBack}>← Menu</button>
      </header>
      <main>
        <div className="card center placeholder">
          <h2>{title}</h2>
          <p>{note}</p>
        </div>
      </main>
    </div>
  );
}
