import type { ReactNode } from 'react';
import { Backdrop } from './Backdrop';

/** Moldura das telas do menu (Carregar, Mods, Créditos, Sair, Salão de campeões): fundo, cabeçalho e botão de voltar. */
export function Screen({ title, onBack, children }: { title: string; onBack: () => void; children: ReactNode }) {
  return (
    <>
      <div className="app-bg" aria-hidden="true"><Backdrop /></div>
      <div className="app">
        <header>
          <div><strong>{title}</strong></div>
          <button className="ghost" onClick={onBack}>← Menu</button>
        </header>
        <main>{children}</main>
      </div>
    </>
  );
}
