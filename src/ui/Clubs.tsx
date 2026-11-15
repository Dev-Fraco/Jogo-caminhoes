import { coachOf } from '../engine/aicoaches';
import { ClubBadge } from './ClubBadge';
import { SPOT_SHORT } from '../engine/types';
import { spotOf } from '../engine/squad';
import { clubProfile } from '../engine/aiprofile';
import { useMemo, useState } from 'react';
import { COUNTRY_ORDER, WORLD_DATA } from '../data/world';
import { clubPlayers, directory, homeLeague, quote, type DirClub } from '../engine/market';
import type { GameState, Player, Position } from '../engine/types';
import { formatBudget } from '../newgame/format';
import { NegotiationSheet } from './Negotiation';

const POS_ORDER: Position[] = ['GK', 'DEF', 'MID', 'ATT'];
const POS_LABEL: Record<Position, string> = { GK: 'Goleiros', DEF: 'Defensores', MID: 'Meio-campistas', ATT: 'Atacantes' };
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n);

/** Transferências por clube: escolha o país, a divisão e o clube; veja os jogadores e toque em um para negociar. */
export function Clubs({ game, onChange }: { game: GameState; onChange: (g: GameState) => void }) {
  const home = homeLeague(game);
  const dir = useMemo(() => directory(game), [game.userClubId, game.season, game.history.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const [country, setCountry] = useState(home.countryId);
  const [div, setDiv] = useState<string>('all');
  const [q, setQ] = useState('');
  const [clubId, setClubId] = useState<string | null>(null);
  const [negId, setNegId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const countries = COUNTRY_ORDER.filter((c) => dir.some((x) => x.countryId === c));
  const divisions = useMemo(() => {
    const ds = new Map<string, { id: string; name: string; i: number }>();
    for (const c of dir) if (c.countryId === country) ds.set(c.divisionId, { id: c.divisionId, name: c.divisionName, i: c.divIndex });
    return [...ds.values()].sort((a, b) => a.i - b.i);
  }, [dir, country]);
  const list = dir.filter((c) => c.countryId === country && (div === 'all' || c.divisionId === div) && (!q || norm(c.name).includes(norm(q))))
    .sort((a, b) => a.divIndex - b.divIndex || b.reputation - a.reputation || a.name.localeCompare(b.name, 'pt-BR'));
  const club: DirClub | undefined = clubId ? dir.find((c) => c.id === clubId) : undefined;

  if (club) {
    const players = clubPlayers(game, club.id);
    const budget = game.budgets[game.userClubId];
    return (
      <>
        <button className="btn" onClick={() => { setClubId(null); setNotice(null); }}>‹ Voltar aos clubes</button>
        <div className="card cl-head">
          <ClubBadge club={club} size={44} />
          <div className="grow"><h2>{club.name}</h2><small>{club.flag} {club.countryName} · {club.divisionName} · {stars(club.reputation)}</small>{game.teams[club.id] && <small className="cl-prof">🧠 {clubProfile(game, club.id).label}</small>}{(game.aiLoans ?? []).some((l) => l.ownerId === club.id || l.hostId === club.id) && <small className="cl-prof">🔁 Empréstimos: {(game.aiLoans ?? []).filter((l) => l.ownerId === club.id).length} cedidos · {(game.aiLoans ?? []).filter((l) => l.hostId === club.id).length} recebidos</small>}{(game.aiYouth?.[club.id] ?? []).length > 0 && <small className="cl-prof">🌱 Base: {game.aiYouth![club.id].length} promessas</small>}{coachOf(game, club.id) && <small className="cl-prof">🧢 {coachOf(game, club.id)!.name} · {stars(coachOf(game, club.id)!.rep)}</small>}</div>
          <div className="cl-bud"><small>Seu orçamento</small><b>{formatBudget(budget)}</b></div>
        </div>
        {notice && <p className="tf-notice" role="status">✔ {notice}</p>}
        <p className="hint sq-hint">Toque em um jogador para negociar o valor da transferência, o salário e o contrato.</p>
        {POS_ORDER.map((pos) => {
          const ps = players.filter((p) => p.pos === pos).sort((a, b) => b.strength - a.strength);
          if (!ps.length) return null;
          return (
            <section key={pos} className="sq-pos">
              <h3>{POS_LABEL[pos]} <em>{ps.length}</em></h3>
              <ul className="sq-grid">
                {ps.map((p: Player) => {
                  const qq = quote(game, club.id, p.id);
                  return (
                    <li key={p.id}>
                      <button className={`sq-card ${pos}`} aria-label={`${p.name}, overall ${p.strength}. Negociar`} onClick={() => { setNotice(null); setNegId(p.id); }}>
                        <span className={`sq-ovr ${p.strength >= 80 ? 'elite' : ''}`}>{p.strength}</span>
                        <span className="sq-role">{SPOT_SHORT[spotOf(p)]}{qq?.role === 'best' ? ' · CRAQUE' : ''}</span>
                        <span className="sq-name">{p.name}</span>
                        <span className="sq-meta">{p.age} anos</span>
                        <span className="sq-val">{qq ? formatBudget(qq.askFee) : '—'}</span>
                        <span className="sq-bar" aria-hidden="true"><i style={{ width: `${Math.min(100, p.strength)}%` }} /></span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
        {negId && <NegotiationSheet game={game} clubId={club.id} playerId={negId} onChange={onChange} onClose={() => setNegId(null)} onDone={(m) => { setNegId(null); setNotice(m); }} />}
      </>
    );
  }

  return (
    <>
      <div className="card">
        <div className="tf-filters">
          <input type="search" aria-label="Buscar clube" placeholder="Buscar clube" value={q} onChange={(e) => setQ(e.target.value)} />
          <select aria-label="País" value={country} onChange={(e) => { setCountry(e.target.value); setDiv('all'); }}>
            {countries.map((c) => <option key={c} value={c}>{WORLD_DATA[c].flag} {WORLD_DATA[c].name}{c === home.countryId ? ' (sua liga)' : ''}</option>)}
          </select>
          <select aria-label="Divisão" value={div} onChange={(e) => setDiv(e.target.value)}>
            <option value="all">Todas as divisões</option>
            {divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
      </div>
      <p className="tf-count">{list.length} clubes{country !== home.countryId ? ' · transferência internacional: preços e salários mais altos' : ''}</p>
      <ul className="cl-list">
        {list.map((c) => (
          <li key={c.id}>
            <button onClick={() => setClubId(c.id)} aria-label={`Ver jogadores do ${c.name}`}>
              <ClubBadge club={c} size={34} />
              <span className="grow"><b>{c.name}</b><small>{c.divisionName} · {stars(c.reputation)}</small></span>
              <span className="cl-go">›</span>
            </button>
          </li>
        ))}
      </ul>
      {list.length === 0 && <div className="card center"><p className="hint">Nenhum clube encontrado.</p></div>}
    </>
  );
}
