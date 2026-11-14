import { useEffect, useState } from 'react';
import { pyramidOf, slotsOfLeague } from '../data/pyramid';
import { getLeague } from '../data/world';
import { isSeasonOver, newCareer, playNext, startNextSeason, userDivision } from '../engine/game';
import { cupMatchDue } from '../engine/cup';
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
import { Home } from './Home';
import { Lineup } from './Lineup';
import { LiveMatch } from './LiveMatch';
import { Squad } from './Squad';
import { Table } from './Table';
import { Transfers } from './Transfers';

type Tab = 'home' | 'squad' | 'table' | 'transfers' | 'lineup'; // 'lineup' é uma tela dentro do Início
/** Telas do app: menu inicial, uma das 8 opções (placeholder) ou a partida em andamento. */
type Screen = 'menu' | MenuOptionId | 'game';

export function App() {
  const [game, setGame] = useState<GameState | null>(() => loadGame());
  const [screen, setScreen] = useState<Screen>('menu');
  const [tab, setTab] = useState<Tab>('home');
  const [tfView, setTfView] = useState<'buy' | 'offers' | 'news'>('buy');
  // partida em andamento: o resultado já foi calculado, mas só entra no jogo quando a partida termina
  const [live, setLive] = useState<{ state: GameState; results: MatchResult[] } | null>(null);
  const [last, setLast] = useState<MatchResult[]>([]);

  useEffect(() => { if (game) saveGame(game); }, [game]);

  const toMenu = () => setScreen('menu');

  // Termina o assistente: cria a carreira na liga escolhida (pirâmide completa) e abre o jogo.
  const startCareer = (s: NewGameState) => {
    const { name, nationality, reputation } = s.coach;
    setGame(newCareer({
      saveName: s.setup.saveName, coach: { name, nationality, reputation }, difficulty: s.setup.difficulty, mode: s.setup.mode,
      season: START_SEASON, userClubId: s.club!.id, divisions: pyramidOf(s.world.countryId, s.world.leagueId),
      leagueName: s.world.leagueId === 'brasileirao' ? undefined : getLeague(s.world.countryId, s.world.leagueId)?.name, slots: slotsOfLeague(s.world.leagueId), cup: s.world.leagueId === 'brasileirao',
    }));
    setLast([]); setTab('home'); setScreen('game');
  };

  // Menu inicial. Só "Novo Jogo" e "Continuar" reaproveitam o que já existia (escolha de clube / carreira salva);
  // as outras 6 opções são placeholders até serem desenvolvidas uma a uma.
  const select = (id: MenuOptionId) => {
    if (id === 'continuar' && game) { setTab('home'); setScreen('game'); return; }
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
  const play = () => setLive(playNext(game));
  const finishMatch = () => { if (live) { setLast(live.results); setGame(live.state); } setLive(null); };
  const liveResult = live?.results.find((r) => r.homeId === game.userClubId || r.awayId === game.userClubId);
  const liveCup = !!live && cupMatchDue(game);
  const liveLabel = liveCup && game.cup ? `${game.cup.name} · ${game.cup.rounds[game.cup.roundIndex].name}` : userDivision(game).name;
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
            <button className="ghost" onClick={toMenu} disabled={!!live}>Menu</button>
          </div>
        </header>
        <main>
          {live && liveResult && (
            <LiveMatch key={`${game.season}-${game.round}-${liveCup ? 'c' : 'l'}`} home={game.clubs[liveResult.homeId]} away={game.clubs[liveResult.awayId]} result={liveResult}
              userSide={liveResult.homeId === game.userClubId ? 'home' : 'away'} divisionName={liveLabel} stadium={game.clubs[liveResult.homeId].stadium} onFinish={finishMatch} />
          )}
          {!live && tab === 'home' && <Home game={game} last={last} over={isSeasonOver(game)} onPlay={play} onNextSeason={nextSeason} onEditLineup={() => setTab('lineup')} onSeeOffers={() => { setTfView('offers'); setTab('transfers'); }} />}
          {!live && tab === 'lineup' && <Lineup game={game} onChange={setGame} onBack={() => setTab('home')} />}
          {!live && tab === 'squad' && <Squad game={game} onChange={setGame} />}
          {!live && tab === 'table' && <Table game={game} />}
          {!live && tab === 'transfers' && <Transfers game={game} onChange={setGame} view={tfView} onView={setTfView} />}
        </main>
        <nav>
          {([['home', '🏠', 'Início'], ['squad', '👕', 'Elenco'], ['table', '📊', 'Tabela'], ['transfers', '🔁', 'Transf.']] as const).map(([id, icon, label]) => {
            const on = tab === id || (id === 'home' && tab === 'lineup');
            return (
              <button key={id} className={on ? 'on' : ''} disabled={!!live} onClick={() => setTab(id)} aria-label={id === 'transfers' ? 'Transferências' : label} aria-current={on ? 'page' : undefined}>
                <span aria-hidden="true">{icon}</span>{label}
                {id === 'transfers' && game.offers.length > 0 && <i className="nav-badge" aria-label={`${game.offers.length} propostas`}>{game.offers.length}</i>}
              </button>
            );
          })}
        </nav>
      </div>
    </>
  );
}
