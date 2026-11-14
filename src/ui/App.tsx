import { useEffect, useState } from 'react';
import { brazilPyramid } from '../data/pyramid';
import { isSeasonOver, newCareer, playRound, startNextSeason, userDivision } from '../engine/game';
import { loadGame, saveGame } from '../engine/save';
import type { GameState, MatchResult } from '../engine/types';
import { START_SEASON, type NewGameState } from '../newgame/state';
import { headerColor } from './badge';
import { MainMenu, MENU_OPTIONS, SHORTCUTS, type MenuOptionId } from './MainMenu';
import { NewGame } from './NewGame';
import { Options } from './Options';
import { Placeholder } from './Placeholder';
import { Squad } from './Squad';
import { Matches } from './Matches';
import { Table } from './Table';

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

  // Termina o assistente: cria a carreira no Campeonato Brasileiro (Série A–D) e abre o jogo.
  const startCareer = (s: NewGameState) => {
    const { name, nationality, reputation } = s.coach;
    setGame(newCareer({
      saveName: s.setup.saveName, coach: { name, nationality, reputation }, difficulty: s.setup.difficulty, mode: s.setup.mode,
      season: START_SEASON, userClubId: s.club!.id, divisions: brazilPyramid(),
    }));
    setLast([]); setTab('matches'); setScreen('game');
  };

  // Menu inicial. Só "Novo Jogo" e "Continuar" reaproveitam o que já existia (escolha de clube / carreira salva);
  // as outras 6 opções são placeholders até serem desenvolvidas uma a uma.
  const select = (id: MenuOptionId) => {
    // Atalhos da faixa inferior: Elenco e Competições abrem a carreira em andamento (se houver); os outros são placeholders.
    if (game && (id === 'elenco' || id === 'competicoes')) { setTab(id === 'elenco' ? 'squad' : 'table'); setScreen('game'); return; }
    if (id === 'continuar' && game) { setTab('matches'); setScreen('game'); return; }
    setScreen(id);
  };

  if (screen === 'menu') return <MainMenu onSelect={select} hasSave={!!game} />;

  if (screen === 'novo-jogo') return <NewGame onBack={toMenu} onStart={startCareer} hasSave={!!game} />;

  if (screen === 'opcoes') return <Options onBack={toMenu} onRestored={() => setGame(loadGame())} />;

  if (screen !== 'game' || !game) {
    const opt = [...MENU_OPTIONS, ...SHORTCUTS].find((o) => o.id === screen)!;
    const note = screen === 'continuar' ? 'Nenhum jogo salvo ainda. Em breve'
      : screen === 'elenco' || screen === 'competicoes' ? 'Inicie ou continue uma carreira para acessar'
      : 'Em breve';
    return <Placeholder title={opt.label} note={note} onBack={toMenu} />;
  }

  const club = game.clubs[game.userClubId];
  const play = () => { const r = playRound(game); setLast(r.results); setGame(r.state); };
  const nextSeason = () => { setLast([]); setGame(startNextSeason(game)); };

  return (
    <div className="app">
      <header style={{ background: headerColor(club) }}>
        <div>
          <strong>{club.name}</strong>
          <small>{userDivision(game).name} · Temporada {game.season}</small>
        </div>
        <button className="ghost" onClick={toMenu}>Menu</button>
      </header>
      <main>
        {tab === 'squad' && <Squad game={game} onChange={setGame} />}
        {tab === 'matches' && <Matches game={game} last={last} onPlay={play} onNextSeason={nextSeason} over={isSeasonOver(game)} />}
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
