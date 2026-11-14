import { useRef, useState } from 'react';
import type { DataPack } from '../engine/types';

interface Props { defaultPack: DataPack; parsePack: (raw: unknown) => DataPack; onStart: (pack: DataPack, clubId: string) => void; onBack: () => void }

export function Start({ defaultPack, parsePack, onStart, onBack }: Props) {
  const [pack, setPack] = useState(defaultPack);
  const [error, setError] = useState('');
  const file = useRef<HTMLInputElement>(null);

  const importPack = async (f?: File) => {
    if (!f) return;
    try { setPack(parsePack(JSON.parse(await f.text()))); setError(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'Erro ao ler o arquivo.'); }
  };

  return (
    <div className="app">
      <header style={{ background: '#0b3d2e' }}>
        <div><strong>Escolha seu clube</strong><small>{pack.name}</small></div>
        <button className="ghost" onClick={onBack}>← Menu</button>
      </header>
      <main>
        <div className="card">
          <p>Assuma um clube e leve-o ao título. Suas escolhas de escalação e formação decidem a temporada.</p>
          <button className="ghost dark" onClick={() => file.current?.click()}>📦 Importar pacote de dados (.json)</button>
          <input ref={file} type="file" accept=".json,application/json" hidden onChange={(e) => importPack(e.target.files?.[0])} />
          {pack !== defaultPack && <button className="ghost dark" onClick={() => setPack(defaultPack)}>Voltar ao pacote padrão</button>}
          {error && <p className="error">{error}</p>}
        </div>
        <ul className="list">
          {[...pack.league.clubs].sort((a, b) => b.strength - a.strength).map((c) => (
            <li key={c.id}>
              <button className="row" onClick={() => onStart(pack, c.id)}>
                <span className="dot" style={{ background: c.color }} />
                <span className="grow">{c.name}</span>
                <span className="stars">{'★'.repeat(Math.max(1, Math.round((c.strength - 55) / 6)))}</span>
              </button>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
