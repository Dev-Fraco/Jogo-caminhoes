import { useEffect, useState } from 'react';
import { brazilPyramid } from '../data/pyramid';
import { isSeasonOver, newCareer, playRound, startNextSeason, userDivision } from '../engine/game';
import { loadGame, saveGame } from '../engine/save';
import type { GameState, MatchResult } from '../engine/types';
import { START_SEASON, type NewGameState } from '../newgame/state';
import { formatBudget } from '../newgame/format';
import { Backdrop } from './Backdrop';
import { tintColor } from './badge';
import { ClubBadge } from './ClubBadge';
import { MainMenu, MENU_OPTIONS, type MenuOptionId } from './MainMenu';
import { NewGame } from './NewGame';
import { Options } from './Options';
import { Placeholder } from './Placeholder';
import { Squad } from './Squad';
import { Matches } from './Matches';
import { Table } from './Table';
import { Transfers } from './Transfers';

type Tab = 'squad' | 'matches' | 'table' | 'transfers';
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
    if (id === 'continuar' && game) { setTab('matches'); setScreen('game'); return; }
    setScreen(id);
  };

  if (screen === 'menu') return <MainMenu onSelect={select} hasSave={!!game} />;

  if (screen === 'novo-jogo') return <NewGame onBack={toMenu} onStart={startCareer} hasSave={!!game} />;

  // Telas internas: a foto de fundo fica fixa atrás do conteúdo
  const bg = <div className="app-bg" aria-hidden="true"><Backdrop /></div>;

  if (screen === 'opcoes') return <>{bg}<Options onBack={toMenu} onRestored={() => setGame(loadGame())} /></>;

  if (screen !== 'game' || !game) {
    const opt = MENU_OPTIONS.find((o) => o.id === screen)!;
    return <>{bg}<Placeholder title={opt.label} note={screen === 'continuar' ? 'Nenhum jogo salvo ainda. Em breve' : 'Em breve'} onBack={toMenu} /></>;
  }

  const club = game.clubs[game.userClubId];
  const play = () => { const r = playRound(game); setLast(r.results); setGame(r.state); };
  const nextSeason = () => { setLast([]); setGame(startNextSeason(game)); };

  return (
    <>
      {bg}
      <div className="app">
        <header style={{ '--club-tint': tintColor(club) } as React.CSSProperties}>
          <div className="gh-id">
            <ClubBadge club={club} size={42} />
            <div>
              <strong>{club.name}</strong>
              <small>{userDivision(game).name} · Temporada {game.season}</small>
            </div>
          </div>
          <div className="gh-right">
            <span className="gh-money" title="Orçamento para transferências">{formatBudget(game.budgets[game.userClubId])}</span>
            <button className="ghost" onClick={toMenu}>Menu</button>
          </div>
        </header>
        <main>
          {tab === 'squad' && <Squad game={game} onChange={setGame} />}
          {tab === 'matches' && <Matches game={game} last={last} onPlay={play} onNextSeason={nextSeason} over={isSeasonOver(game)} />}
          {tab === 'table' && <Table game={game} />}
          {tab === 'transfers' && <Transfers game={game} onChange={setGame} />}
        </main>
        <nav>
          {([['squad', '👕', 'Elenco'], ['matches', '⚽', 'Jogos'], ['table', '📊', 'Tabela'], ['transfers', '🔁', 'Transf.']] as const).map(([id, icon, label]) => (
            <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)} aria-label={id === 'transfers' ? 'Transferências' : label}><span aria-hidden="true">{icon}</span>{label}</button>
          ))}
        </nav>
      </div>
    </>
  );
}
