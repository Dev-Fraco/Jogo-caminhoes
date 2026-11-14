import { useState } from 'react';
import { fanInterviews, transferFeed } from '../engine/news';
import type { GameState } from '../engine/types';

/** Notícias: transferências dos clubes em uma aba e entrevistas com torcedores do seu clube em outra. */
export function NewsApp({ game }: { game: GameState }) {
  const [tab, setTab] = useState<'transfers' | 'fans' | 'retired'>('transfers');
  const feed = transferFeed(game);
  const fans = fanInterviews(game);
  return (
    <div className="ph-app-screen nw">
      <h2>📰 Notícias</h2>
      <div className="chips ap-chips" role="tablist">
        <button role="tab" aria-selected={tab === 'transfers'} className={tab === 'transfers' ? 'on' : ''} onClick={() => setTab('transfers')}>Transferências</button>
        <button role="tab" aria-selected={tab === 'fans'} className={tab === 'fans' ? 'on' : ''} onClick={() => setTab('fans')}>Torcida</button>
        <button role="tab" aria-selected={tab === 'retired'} className={tab === 'retired' ? 'on' : ''} onClick={() => setTab('retired')}>Aposentadorias</button>
      </div>
      {tab === 'transfers' && (
        <>
          {feed.length === 0 && <p className="ph-empty">Nenhuma transferência por enquanto. Os clubes negociam durante a temporada e no meio dela.</p>}
          <ul className="nw-list">
            {feed.map((n, i) => (
              <li key={i} className={n.mine ? 'mine' : ''}>
                <span className="nw-ico" aria-hidden="true">{n.mine ? '⭐' : '🔁'}</span>
                <span className="grow"><b>{n.text}</b><small>Temporada {n.season} · rodada {n.round}</small></span>
              </li>
            ))}
          </ul>
        </>
      )}
      {tab === 'retired' && (
        <>
          {(game.retired ?? []).length === 0 && <p className="ph-empty">Ninguém se aposentou ainda. As aposentadorias acontecem na virada da temporada, para jogadores de 35 anos ou mais.</p>}
          <ul className="nw-list">
            {(game.retired ?? []).slice(0, 40).map((r, i) => (
              <li key={i} className={r.clubId === game.userClubId ? 'mine' : ''}>
                <span className="nw-ico" aria-hidden="true">🧓</span>
                <span className="grow"><b>{r.name} se aposentou aos {r.age} anos</b><small>{game.clubs[r.clubId]?.name ?? '—'} · {r.pos === 'GK' ? 'goleiro' : r.pos === 'DEF' ? 'defensor' : r.pos === 'MID' ? 'meia' : 'atacante'}, overall {r.strength} · fim da temporada {r.season}</small></span>
              </li>
            ))}
          </ul>
        </>
      )}
      {tab === 'fans' && (
        <>
          <p className={`nw-head ${fans.items.filter((i) => i.tone === 'good').length >= fans.items.filter((i) => i.tone === 'bad').length ? '' : 'bad'}`}>{fans.headline}</p>
          <ul className="nw-list">
            {fans.items.map((it, i) => (
              <li key={i} className={`quote ${it.tone}`}>
                <span className="nw-ico" aria-hidden="true">{it.tone === 'good' ? '😀' : it.tone === 'bad' ? '😡' : '😐'}</span>
                <span className="grow"><b>“{it.quote}”</b><small>{it.who}</small></span>
              </li>
            ))}
          </ul>
          <p className="bk-sub">As entrevistas mudam a cada rodada, conforme os resultados e o humor da torcida.</p>
        </>
      )}
    </div>
  );
}
