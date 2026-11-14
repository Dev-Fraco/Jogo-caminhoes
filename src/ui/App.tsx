import { useEffect, useState } from 'react';
import { BRASILEIRAO } from '../data/brasileirao';
import { parsePack } from '../data/pack';
import { isSeasonOver, newGame, playRound } from '../engine/game';
import { clearSave, loadGame, saveGame } from '../engine/save';
import type { DataPack, GameState, MatchResult } from '../engine/types';
import { Squad } from './Squad';
import { Matches } from './Matches';
import { Table } from './Table';
import { Start } from './Start';

type Tab = 'squad' | 'matches' | 'table';

export function App() {
  const [game, setGame] = useState<GameState | null>(() => loadGame());
  const [tab, setTab] = useState<Tab>('matches');
  const [last, setLast] = useState<MatchResult[]>([]);
  const [askQuit, setAskQuit] = useState(false);

  useEffect(() => { if (game) saveGame(game); }, [game]);

  const start = (pack: DataPack, clubId: string) => { setLast([]); setTab('matches'); setGame(newGame(pack, clubId)); };
  const quit = () => {
    if (!askQuit) { setAskQuit(true); setTimeout(() => setAskQuit(false), 4000); return; }
    clearSave(); setAskQuit(false); setGame(null);
  };

  if (!game) return <Start defaultPack={BRASILEIRAO} parsePack={parsePack} onStart={start} />;

  const club = game.clubs.find((c) => c.id === game.userClubId)!;
  const play = () => { const r = playRound(game); setLast(r.results); setGame(r.state); };
  const nextSeason = () => start({ format: 'caminhoes-pack-v1', id: game.packId, name: game.packName, league: { name: game.leagueName, clubs: game.clubs } }, game.userClubId);

  return (
    <div className="app">
      <header style={{ background: club.color }}>
        <div>
          <strong>{club.name}</strong>
          <small>{game.leagueName} · Temporada {game.season}</small>
        </div>
        <button className="ghost" onClick={quit}>{askQuit ? 'Apagar e sair?' : 'Sair'}</button>
      </header>
      <main>
        {tab === 'squad' && <Squad game={game} onChange={setGame} />}
        {tab === 'matches' && <Matches game={game} last={last} onPlay={play} onNewSeason={nextSeason} over={isSeasonOver(game)} />}
        {tab === 'table' && <Table game={game} />}
      </main>
      <nav>
        {([['squad', '👕', 'Elenco'], ['matches', '⚽', 'Jogos'], ['table', '📊', 'Tabela']] as const).map(([id, icon, label]) => (
          <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}><span>{icon}</span>{label}</button>
        ))}
      </nav>
    </div>
  );
}
