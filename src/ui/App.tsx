import { useEffect, useState } from 'react';
import { pyramidOf, slotsOfLeague } from '../data/pyramid';
import { getLeague } from '../data/world';
import { audio } from '../audio/audio';
import { isSeasonOver, newCareer, playNext, skipSeasons, startNextSeason, userDivision } from '../engine/game';
import { pendingEvent } from '../engine/events';
import { balanceOf } from '../engine/bank';
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
import { Stadium } from './Stadium';
import { Phone } from './Phone';
import { unreadCount } from '../engine/phone';
import { absRound, pendingCount, urgentMessages } from '../engine/inbox';
import { Lineup } from './Lineup';
import { LiveMatch } from './LiveMatch';
import { recordHall } from '../engine/hall';
import { Credits, ExitScreen, HallScreen, LoadGame, Mods } from './MenuScreens';
import { Squad } from './Squad';
import { Unemployed } from './Unemployed';
import { Table } from './Table';
import { Transfers } from './Transfers';

type Tab = 'home' | 'squad' | 'table' | 'transfers' | 'lineup' | 'finance' | 'stadium'; // 'lineup' é uma tela dentro do Início
/** Telas do app: menu inicial, uma das 8 opções (placeholder) ou a partida em andamento. */
type Screen = 'menu' | MenuOptionId | 'game' | 'hall';

export function App() {
  const [game, setGame] = useState<GameState | null>(() => loadGame());
  const [screen, setScreen] = useState<Screen>('menu');
  const [tab, setTab] = useState<Tab>('home');
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [gateAt, setGateAt] = useState(0);
  const [phoneGate, setPhoneGate] = useState(false);
  const [tableView, setTableView] = useState<'div' | 'rounds' | 'hist'>('div');
  const [tfView, setTfView] = useState<'clubs' | 'buy' | 'offers' | 'news'>('clubs');
  // partida em andamento: o resultado já foi calculado, mas só entra no jogo quando a partida termina
  const [live, setLive] = useState<{ state: GameState; results: MatchResult[] } | null>(null);
  const [last, setLast] = useState<MatchResult[]>([]);

  useEffect(() => { if (game) saveGame(game); }, [game]);
  // salão de campeões: guarda os campeões de cada temporada encerrada
  useEffect(() => { if (game) recordHall(game); }, [game?.history.length]); // eslint-disable-line react-hooks/exhaustive-deps
  // sem clube: some Elenco, Transferências, Finanças e Escalação
  useEffect(() => { if (game?.unemployed && ['squad', 'transfers', 'lineup', 'finance', 'stadium'].includes(tab)) setTab('home'); }, [game?.unemployed, tab]);

  // som: o navegador só libera o áudio depois de um toque; a música toca em todas as telas
  useEffect(() => {
    const unlock = () => { audio.unlock(); audio.setMusic(true); };
    const click = (e: Event) => { const b = (e.target as HTMLElement | null)?.closest('button'); if (b) audio.sfx(/^(‹|←|Voltar|Cancelar|Fechar|✕)/.test(b.textContent?.trim() ?? '') ? 'back' : 'click'); };
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
      season: START_SEASON, userClubId: s.club!.id, divisions: pyramidOf(s.world.countryId, s.world.leagueId), outside: s.world.divisionId === 'br-estaduais' ? s.club! : undefined,
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

  if (screen === 'carregar-jogo') return <LoadGame onBack={toMenu} onLoaded={() => { setGame(loadGame()); setLast([]); setTab('home'); setScreen('game'); }} />;
  if (screen === 'mods') return <Mods onBack={toMenu} />;
  if (screen === 'creditos') return <Credits onBack={toMenu} />;
  if (screen === 'hall') return <HallScreen onBack={toMenu} />;
  if (screen === 'sair') return <ExitScreen onBack={toMenu} />;

  if (screen === 'opcoes') return <>{bg}<Options onBack={toMenu} onRestored={() => setGame(loadGame())} /></>;

  if (screen !== 'game' || !game) {
    const opt = MENU_OPTIONS.find((o) => o.id === screen)!;
    return <>{bg}<Placeholder title={opt.label} note={screen === 'continuar' ? 'Nenhum jogo salvo ainda. Comece em Novo Jogo.' : 'Em breve'} onBack={toMenu} /></>;
  }

  const club = game.clubs[game.userClubId];
  const play = () => { // antes do jogo: avisa de mensagens que vencem e só se resolvem pelo celular
    if (!game.unemployed && urgentMessages(game).length > 0 && gateAt !== absRound(game)) { setGateAt(absRound(game)); setPhoneGate(true); return; }
    doPlay();
  };
  const doPlay = () => { const r = playNext(game); const mine = r.results.some((x) => x.homeId === game.userClubId || x.awayId === game.userClubId); if (game.unemployed || !mine) { setLast(r.results); setGame(r.state); } else setLive(r); }; // sem clube (ou sem jogo seu nesta rodada, como na Série D eliminada): nada para assistir
  const finishMatch = () => { if (live) { setLast(live.results); setGame(live.state); } setLive(null); };
  const liveResult = live?.results.find((r) => r.homeId === game.userClubId || r.awayId === game.userClubId);
  const ev = live ? pendingEvent(game) : undefined;
  const liveLabel = ev ? ev.label : userDivision(game).name;
  const skipSeason = (years = 1) => { audio.sfx('whoosh'); setLast([]); setGame(skipSeasons(game, years)); setTableView('hist'); setTab('table'); };
  const nextSeason = () => { setLast([]); setGame(startNextSeason(game)); };

  return (
    <>
      {bg}
      <div className="app">
        <header style={{ '--club-tint': tintColor(club) } as React.CSSProperties}>
          <div className="gh-id">
            <ClubBadge club={club} size={42} />
            <div>
              <strong>{game.unemployed ? 'Sem clube' : club.name}</strong>
              <small>{game.unemployed ? 'Sem clube' : userDivision(game).name} · Temporada {game.season}</small>
            </div>
          </div>
          <div className="gh-right">
            <span className="gh-money" title={game.unemployed ? 'Seu saldo no banco' : 'Orçamento para transferências'}>{game.unemployed ? formatBudget(balanceOf(game)) : formatBudget(game.budgets[game.userClubId])}</span>
            <button className="ghost" onClick={toMenu} disabled={!!live}>Menu</button>
          </div>
        </header>
        <main>
          {live && liveResult && (
            <LiveMatch key={`${game.season}-${game.round}-${ev?.kind ?? 'l'}`} home={clubOf(game, liveResult.homeId)} away={clubOf(game, liveResult.awayId)} result={liveResult}
              userSide={liveResult.homeId === game.userClubId ? 'home' : 'away'} divisionName={liveLabel} stadium={clubOf(game, liveResult.homeId).stadium} onFinish={finishMatch} />
          )}
          {!live && game.unemployed && tab === 'home' && <Unemployed game={game} over={isSeasonOver(game)} onChange={setGame} onPlay={play} onSkip={() => skipSeason(1)} onNextSeason={nextSeason} onSeeTables={() => { setTableView('rounds'); setTab('table'); }} />}
          {!live && !game.unemployed && tab === 'home' && <Home game={game} onChange={setGame} last={last} over={isSeasonOver(game)} onPlay={play} onNextSeason={nextSeason} onSkip={skipSeason} onSeeTables={() => { setTableView('div'); setTab('table'); }} onSeeResults={() => { setTableView('rounds'); setTab('table'); }} onEditLineup={() => setTab('lineup')} onFinance={() => setTab('finance')} onStadium={() => setTab('stadium')} onSeeOffers={() => { setTfView('offers'); setTab('transfers'); }} />}
          {!live && !game.unemployed && tab === 'stadium' && <Stadium game={game} onChange={setGame} onBack={() => setTab('home')} />}
          {!live && !game.unemployed && tab === 'finance' && <Finance game={game} onChange={setGame} onBack={() => setTab('home')} />}
          {!live && !game.unemployed && tab === 'lineup' && <Lineup game={game} onChange={setGame} onBack={() => setTab('home')} />}
          {!live && !game.unemployed && tab === 'squad' && <Squad game={game} onChange={setGame} />}
          {!live && tab === 'table' && <Table game={game} initialView={tableView} />}
          {!live && !game.unemployed && tab === 'transfers' && <Transfers game={game} onChange={setGame} view={tfView} onView={setTfView} />}
        </main>
        <nav>
          {([['home', '🏠', 'Início'], ['squad', '👕', 'Elenco'], ['table', '📊', 'Tabela'], ['transfers', '🔁', 'Transf.'], ['stadium', '🏟️', 'Estádio'], ['finance', '💰', 'Finanças'], ['phone', '📱', 'Celular']] as const).map(([id, icon, label]) => {
            const on = tab === id || (id === 'home' && tab === 'lineup');
            return (
              <button key={id} className={on ? 'on' : ''} disabled={!!live || (!!game.unemployed && (id === 'squad' || id === 'transfers' || id === 'stadium' || id === 'finance'))} onClick={() => (id === 'phone' ? setPhoneOpen(true) : setTab(id))} aria-label={id === 'transfers' ? 'Transferências' : label} aria-current={on ? 'page' : undefined}>
                <span aria-hidden="true">{icon}</span>{label}
                {id === 'phone' && unreadCount(game) + pendingCount(game) > 0 && <i className="nav-badge" aria-label={`${unreadCount(game) + pendingCount(game)} pendências`}>{unreadCount(game) + pendingCount(game)}</i>}
                {id === 'transfers' && game.offers.length > 0 && <i className="nav-badge" aria-label={`${game.offers.length} propostas`}>{game.offers.length}</i>}
              </button>
            );
          })}
        </nav>
        {phoneGate && (
          <div className="phone-gate" role="dialog" aria-modal="true" aria-label="Pendências no celular">
            <div>
              <h2>📱 Você tem {urgentMessages(game).length} {urgentMessages(game).length === 1 ? 'pendência' : 'pendências'} no celular</h2>
              <p>{urgentMessages(game).map((m) => m.title).join(' · ')}. Vencem no próximo jogo.</p>
              <button className="primary" onClick={() => { setPhoneGate(false); setPhoneOpen(true); }}>Abrir o celular</button>
              <button className="btn" onClick={() => { setPhoneGate(false); doPlay(); }}>Jogar mesmo assim</button>
            </div>
          </div>
        )}
        {phoneOpen && <Phone game={game} onChange={setGame} onClose={() => setPhoneOpen(false)} />}
      </div>
    </>
  );
}
