import { useEffect, useState } from 'react';
import { pyramidOf, slotsOfLeague } from '../data/pyramid';
import { getLeague } from '../data/world';
import { audio } from '../audio/audio';
import { isSeasonOver, newCareer, playNext, simulateToEnd, startNextSeason, userDivision } from '../engine/game';
import { pendingEvent } from '../engine/events';
import { clubOf } from '../engine/lookup';
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
import { Finance } from './Finance';
import { Phone } from './Phone';
import { unreadCount } from '../engine/phone';
import { Lineup } from './Lineup';
import { LiveMatch } from './LiveMatch';
import { Squad } from './Squad';
import { Table } from './Table';
import { Transfers } from './Transfers';

type Tab = 'home' | 'squad' | 'table' | 'transfers' | 'lineup' | 'finance'; // 'lineup' é uma tela dentro do Início
/** Telas do app: menu inicial, uma das 8 opções (placeholder) ou a partida em andamento. */
type Screen = 'menu' | MenuOptionId | 'game';

export function App() {
  const [game, setGame] = useState<GameState | null>(() => loadGame());
  const [screen, setScreen] = useState<Screen>('menu');
  const [tab, setTab] = useState<Tab>('home');
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [tableView, setTableView] = useState<'div' | 'rounds'>('div');
  const [tfView, setTfView] = useState<'buy' | 'offers' | 'news'>('buy');
  // partida em andamento: o resultado já foi calculado, mas só entra no jogo quando a partida termina
  const [live, setLive] = useState<{ state: GameState; results: MatchResult[] } | null>(null);
  const [last, setLast] = useState<MatchResult[]>([]);

  useEffect(() => { if (game) saveGame(game); }, [game]);

  // som: o navegador só libera o áudio depois de um toque; a música toca em todas as telas
  useEffect(() => {
    const unlock = () => { audio.unlock(); audio.setMusic(true); };
    const click = (e: Event) => { if ((e.target as HTMLElement | null)?.closest('button')) audio.sfx('click'); };
    const onSettings = () => audio.refresh();
    const onVis = () => audio.suspend(document.hidden);
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('click', click);
    window.addEventListener('vr-settings', onSettings);
    document.addEventListener('visibilitychange', onVis);
    return () => { window.removeEventListener('pointerdown', unlock); window.removeEventListener('click', click); window.removeEventListener('vr-settings', onSettings); document.removeEventListener('visibilitychange', onVis); };
  }, []);

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
  const ev = live ? pendingEvent(game) : undefined;
  const liveLabel = ev ? ev.label : userDivision(game).name;
  const skipSeason = () => { audio.sfx('whoosh'); setLast([]); setGame(simulateToEnd(game)); setTab('home'); };
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
            <LiveMatch key={`${game.season}-${game.round}-${ev?.kind ?? 'l'}`} home={clubOf(game, liveResult.homeId)} away={clubOf(game, liveResult.awayId)} result={liveResult}
              userSide={liveResult.homeId === game.userClubId ? 'home' : 'away'} divisionName={liveLabel} stadium={clubOf(game, liveResult.homeId).stadium} onFinish={finishMatch} />
          )}
          {!live && tab === 'home' && <Home game={game} last={last} over={isSeasonOver(game)} onPlay={play} onNextSeason={nextSeason} onSkip={skipSeason} onSeeTables={() => { setTableView('div'); setTab('table'); }} onSeeResults={() => { setTableView('rounds'); setTab('table'); }} onEditLineup={() => setTab('lineup')} onFinance={() => setTab('finance')} onSeeOffers={() => { setTfView('offers'); setTab('transfers'); }} />}
          {!live && tab === 'finance' && <Finance game={game} onChange={setGame} onBack={() => setTab('home')} />}
          {!live && tab === 'lineup' && <Lineup game={game} onChange={setGame} onBack={() => setTab('home')} />}
          {!live && tab === 'squad' && <Squad game={game} onChange={setGame} />}
          {!live && tab === 'table' && <Table game={game} initialView={tableView} />}
          {!live && tab === 'transfers' && <Transfers game={game} onChange={setGame} view={tfView} onView={setTfView} />}
        </main>
        <nav>
          {([['home', '🏠', 'Início'], ['squad', '👕', 'Elenco'], ['table', '📊', 'Tabela'], ['transfers', '🔁', 'Transf.'], ['phone', '📱', 'Celular']] as const).map(([id, icon, label]) => {
            const on = tab === id || (id === 'home' && (tab === 'lineup' || tab === 'finance'));
            return (
              <button key={id} className={on ? 'on' : ''} disabled={!!live} onClick={() => (id === 'phone' ? setPhoneOpen(true) : setTab(id))} aria-label={id === 'transfers' ? 'Transferências' : label} aria-current={on ? 'page' : undefined}>
                <span aria-hidden="true">{icon}</span>{label}
                {id === 'phone' && unreadCount(game) > 0 && <i className="nav-badge" aria-label={`${unreadCount(game)} notificações`}>{unreadCount(game)}</i>}
                {id === 'transfers' && game.offers.length > 0 && <i className="nav-badge" aria-label={`${game.offers.length} propostas`}>{game.offers.length}</i>}
              </button>
            );
          })}
        </nav>
        {phoneOpen && <Phone game={game} onChange={setGame} onClose={() => setPhoneOpen(false)} />}
      </div>
    </>
  );
}
