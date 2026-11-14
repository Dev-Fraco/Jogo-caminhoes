import { useEffect, useState } from 'react';
import { BRASILEIRAO } from '../data/brasileirao';
import { parsePack } from '../data/pack';
import { isSeasonOver, newGame, playRound } from '../engine/game';
import { loadGame, saveGame } from '../engine/save';
import type { DataPack, GameState, MatchResult } from '../engine/types';
import { MainMenu, MENU_OPTIONS, type MenuOptionId } from './MainMenu';
import { Placeholder } from './Placeholder';
import { Squad } from './Squad';
import { Matches } from './Matches';
import { Table } from './Table';
import { Start } from './Start';

type Tab = 'squad' | 'matches' | 'table';
/** Telas do app: menu inicial, uma das 8 opções (placeholder) ou a partida em andamento. */
type Screen = 'menu' | MenuOptionId | 'game';

export function App() {
  const [game, setGame] = useState<GameState | null>(() => loadGame());
  const [screen, setScreen] = useState<Screen>('menu');
  const [tab, setTab] = useState<Tab>('matches');
  const [last, setLast] = useState<MatchResult[]>([]);

  useEffect(() => { if (game) saveGame(game); }, [game]);

  const toMenu = () => setScreen('menu');

  // Menu inicial. Só "Novo Jogo" e "Continuar" reaproveitam o que já existia (escolha de clube / carreira salva);
  // as outras 6 opções são placeholders até serem desenvolvidas uma a uma.
  const select = (id: MenuOptionId) => setScreen(id === 'continuar' && game ? 'game' : id);

  if (screen === 'menu') return <MainMenu onSelect={select} />;

  if (screen === 'novo-jogo') {
    const start = (pack: DataPack, clubId: string) => { setLast([]); setTab('matches'); setGame(newGame(pack, clubId)); setScreen('game'); };
    return <Start defaultPack={BRASILEIRAO} parsePack={parsePack} onStart={start} onBack={toMenu} />;
  }

  if (screen !== 'game' || !game) {
    const opt = MENU_OPTIONS.find((o) => o.id === screen)!;
    return <Placeholder title={opt.label} note={screen === 'continuar' ? 'Nenhum jogo salvo ainda. Em breve' : 'Em breve'} onBack={toMenu} />;
  }

  const club = game.clubs.find((c) => c.id === game.userClubId)!;
  const play = () => { const r = playRound(game); setLast(r.results); setGame(r.state); };
  const nextSeason = () => {
    const pack: DataPack = { format: 'caminhoes-pack-v1', id: game.packId, name: game.packName, league: { name: game.leagueName, clubs: game.clubs } };
    setLast([]); setTab('matches'); setGame(newGame(pack, game.userClubId, undefined, game.season + 1));
  };

  return (
    <div className="app">
      <header style={{ background: club.color }}>
        <div>
          <strong>{club.name}</strong>
          <small>{game.leagueName} · Temporada {game.season}</small>
        </div>
        <button className="ghost" onClick={toMenu}>Menu</button>
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
