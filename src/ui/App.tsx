import { lazy, useEffect, useRef, useState } from 'react';
import { pyramidOf, slotsOfLeague } from '../data/pyramid';
import { getLeague } from '../data/world';
import { audio } from '../audio/audio';
import { isSeasonOver, newCareer, playNext, userDivision } from '../engine/game';
import { loadSeasonPack, premiumChunk } from '../premium/loader';
import { pendingEvent } from '../engine/events';
import { balanceOf } from '../engine/bank';
import { clubOf, teamOf } from '../engine/lookup';
import { playerMap } from '../engine/plays';
import { loadGame, saveGame } from '../engine/save';
import { useAutosave } from './useAutosave';
import type { GameState, MatchResult } from '../engine/types';
import { START_MONEY, BUDGET_FACTOR, CHALLENGE_DIFFICULTY, CHALLENGE_REPUTATION, START_SEASON, type ChallengeId, type NewGameState } from '../newgame/state';
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
import { calOf, formatDayShort } from '../engine/calendar';
import { advanceToUserMatch } from '../engine/advance';
import { advanceOneDay } from '../engine/daily';
import { homeBlocked, housingSteps } from '../engine/housing';
import { DayCalendar } from './DayCalendar';
import { CalendarScreen } from './CalendarScreen';
import { ResultsSheet } from './ResultsSheet';
import { ShopScreen } from './ShopScreen';
import { CoachProfile } from './CoachProfile';
import { YouthScreen } from './YouthScreen';
import { DEFAULT_PHONE, ownsPhone } from '../engine/phone';
import { Phone } from './Phone';
import { unreadCount } from '../engine/phone';
import { absRound, pendingCount, urgentMessages } from '../engine/inbox';
import { Lineup } from './Lineup';
import { LiveMatch } from './LiveMatch';
import { PremiumGate } from './PremiumGate';
import { recheckExtras, useExtras } from '../premium/usePremium';
import { inTrial, isPremium, modsAllowed, setActiveGame } from '../premium/entitlement';
import { PlanScreen } from '../premium/ui/PlanScreen';
import { PremiumPreview } from '../premium/ui/PremiumPreview';
import { Screen as MenuFrame } from './Screen';
import { hooks } from '../engine/hooks';
const WorldScreen = lazy(() => premiumChunk(() => import('./WorldScreen'))().then((m) => ({ default: m.WorldScreen }))); // (recurso Premium, carregado sob demanda)
import { MatchChoice, type MatchMode } from './MatchChoice';
import { MatchSim } from './MatchSim';
import { healUserLineup, injuredSet } from '../engine/injuries';
import type { Tactic } from '../engine/match';
import { recordHall } from '../engine/hall';
import { Credits, ExitScreen, HallScreen, LoadGame, Mods } from './MenuScreens';
import { Squad } from './Squad';
import { Unemployed } from './Unemployed';
import { Table } from './Table';
import { Transfers } from './Transfers';
import { SideMenu, type MenuTarget } from './SideMenu';

type Tab = 'home' | 'world' | 'calendar' | 'squad' | 'table' | 'transfers' | 'lineup' | 'finance' | 'stadium' | 'shop' | 'profile' | 'youth'; // 'lineup' é uma tela dentro do Início
/** Telas do app: menu inicial, uma das 8 opções (placeholder) ou a partida em andamento. */
type Screen = 'menu' | MenuOptionId | 'game' | 'hall' | 'plano';

export function App() {
  const [game, setGame] = useState<GameState | null>(() => loadGame());
  const extras = useExtras();
  // temporada grátis: a carreira lembra onde começou; o portão dos extras acompanha se ainda está na temporada grátis
  useEffect(() => { setGame((g) => (g && g.freeStart === undefined ? { ...g, freeStart: g.season } : g)); }, [game?.saveName]);
  const trial = game ? inTrial(game) : true;
  useEffect(() => { setActiveGame(game); recheckExtras(); }, [trial]); // eslint-disable-line react-hooks/exhaustive-deps
  // quando o pacote dos extras carrega, saves que ainda não têm as ligas do mundo ganham o estado delas
  useEffect(() => { if (extras === 'on') setGame((g) => (g && !g.world && !g.observer ? hooks.worldTick(hooks.ensureWorld(g)) : g)); }, [extras]);
  const [screen, setScreen] = useState<Screen>('menu');
  // versão grátis: antes de entrar no jogo, a tela de planos mostra o que cada versão tem (uma vez por sessão)
  const planSeen = useRef((() => { try { return isPremium() || sessionStorage.getItem('vr-plan-seen') === '1'; } catch { return isPremium(); } })());
  const planNext = useRef<MenuOptionId | null>(null);
  const [plansOpen, setPlansOpen] = useState(false);
  useEffect(() => { const open = () => setPlansOpen(true); window.addEventListener('vr-open-plans', open); return () => window.removeEventListener('vr-open-plans', open); }, []);
  const [tab, setTab] = useState<Tab>('home');
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [homeGate, setHomeGate] = useState(false);
  const [calAnim, setCalAnim] = useState<{ from: number; to: number } | null>(null);
  const [gateAt, setGateAt] = useState(0);
  const [phoneGate, setPhoneGate] = useState(false);
  const [tableView, setTableView] = useState<'div' | 'rounds' | 'hist' | 'scorers'>('div');
  const [tfView, setTfView] = useState<'clubs' | 'buy' | 'offers' | 'news'>('clubs');
  // partida em andamento: o resultado já foi calculado, mas só entra no jogo quando a partida termina
  const [live, setLive] = useState<{ state: GameState; results: MatchResult[] } | null>(null);
  const [mode, setMode] = useState<MatchMode | null>(null); // escolha antes da partida: assistir ou simular (some ao terminar)
  const [tactics, setTactics] = useState<Tactic[]>([]); // mudanças táticas feitas na partida ao vivo
  const [last, setLast] = useState<MatchResult[]>([]);
  const [sheet, setSheet] = useState<MatchResult[] | null>(null); // resultados de todos os jogos, ao fim de cada partida

  const autosave = useAutosave(game); // salva nos momentos certos e avisa falhas/recuperações
  // salão de campeões: guarda os campeões de cada temporada encerrada
  useEffect(() => { if (game) recordHall(game); }, [game?.history.length]); // eslint-disable-line react-hooks/exhaustive-deps
  // sem clube: some Elenco, Transferências, Finanças e Escalação
  useEffect(() => { if (game?.unemployed && ['squad', 'transfers', 'lineup', 'finance', 'stadium', 'youth', 'calendar'].includes(tab)) setTab('home'); }, [game?.unemployed, tab]);

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
  const goMenu = (t: MenuTarget) => {
    if (t === 'exit') return toMenu();
    if (t === 'phone') return ownsPhone(game!) ? setPhoneOpen(true) : setTab('shop');
    if (t === 'table' || t === 'scorers' || t === 'hist') { setTableView(t === 'table' ? 'div' : t); return setTab('table'); }
    setTab(t);
  };

  // Termina o assistente: cria a carreira na liga escolhida (pirâmide completa) e abre o jogo.
  const startCareer = (s: NewGameState) => {
    const { name, nationality } = s.coach;
    const challenge = s.coach.challenge as ChallengeId;
    const reputation = CHALLENGE_REPUTATION[challenge];
    const career = newCareer({
      saveName: s.setup.saveName, coach: { name, nationality, reputation }, difficulty: CHALLENGE_DIFFICULTY[challenge], mode: s.setup.mode, budgetFactor: BUDGET_FACTOR[challenge],
      season: START_SEASON, userClubId: s.club!.id, divisions: pyramidOf(s.world.countryId, s.world.leagueId), outside: s.world.divisionId === 'br-estaduais' ? s.club! : undefined,
      leagueName: s.world.leagueId === 'brasileirao' ? undefined : getLeague(s.world.countryId, s.world.leagueId)?.name, slots: slotsOfLeague(s.world.leagueId), cup: s.world.leagueId === 'brasileirao',
    });
    setGame({ ...career, homeRequired: true, coachMoney: START_MONEY, phone: { ...DEFAULT_PHONE, noPhone: true } }); // carreira nova: o treinador começa sem celular (compra na Mega-zona Luiz)
    setLast([]); setTab('home'); setScreen('game');
  };

  // Menu inicial. Só "Novo Jogo" e "Continuar" reaproveitam o que já existia (escolha de clube / carreira salva);
  // as outras 6 opções são placeholders até serem desenvolvidas uma a uma.
  const select = (id: MenuOptionId) => {
    if (!planSeen.current && (id === 'novo-jogo' || id === 'continuar')) { planNext.current = id; setScreen('plano'); return; } // (só no grátis) antes de jogar, mostra o que cada versão tem
    if (id === 'continuar' && game) { setTab('home'); setScreen('game'); return; }
    if (id === 'salao-campeoes') { setScreen('hall'); return; }
    setScreen(id);
  };

  if (plansOpen) return <PlanScreen onDone={() => setPlansOpen(false)} />;
  if (screen === 'plano') return <PlanScreen onDone={() => { planSeen.current = true; try { sessionStorage.setItem('vr-plan-seen', '1'); } catch { /* sem armazenamento */ } const id = planNext.current; planNext.current = null; if (id) select(id); else setScreen('menu'); }} />;
  if (screen === 'menu') return <MainMenu onSelect={select} hasSave={!!game} />;

  if (screen === 'novo-jogo') return <NewGame onBack={toMenu} onStart={startCareer} hasSave={!!game} />;

  // Telas internas: a foto de fundo fica fixa atrás do conteúdo
  const bg = <div className="app-bg" aria-hidden="true"><Backdrop /></div>;

  if (screen === 'carregar-jogo') return <LoadGame onBack={toMenu} onLoaded={() => { setGame(loadGame()); autosave.checkNotice(); setLast([]); setTab('home'); setScreen('game'); }} />;
  if (screen === 'mods') return modsAllowed() ? <Mods onBack={toMenu} /> : <MenuFrame title="Mods da Comunidade" onBack={toMenu}><PremiumPreview feature="mods" /></MenuFrame>;
  if (screen === 'creditos') return <Credits onBack={toMenu} />;
  if (screen === 'hall') return <HallScreen onBack={toMenu} />;
  if (screen === 'sair') return <ExitScreen onBack={toMenu} />;

  if (screen === 'opcoes') return <>{bg}<Options onBack={toMenu} onRestored={() => { setGame(loadGame()); autosave.checkNotice(); }} /></>;

  if (screen !== 'game' || !game) {
    const opt = MENU_OPTIONS.find((o) => o.id === screen)!;
    return <>{bg}<Placeholder title={opt.label} note={screen === 'continuar' ? 'Nenhum jogo salvo ainda. Comece em Novo Jogo.' : 'Em breve'} onBack={toMenu} /></>;
  }

  const club = game.clubs[game.userClubId];
  const blocked = () => { if (homeBlocked(game)) { setHomeGate(true); audio.sfx('error'); return true; } return false; }; // carreira nova: precisa de moradia antes de avançar
  const runAdvance = (many: boolean) => { // avançar dia(s): mostra o calendário passando de um dia para o outro
    if (blocked()) return;
    const before = calOf(game).day;
    let next: GameState;
    if (many) { const r = advanceToUserMatch(game); next = r.state; if (r.simulated > 0) setLast(r.results); } // até o seu próximo jogo: as datas só de outros clubes são simuladas no caminho
    else next = advanceOneDay(game);
    const after = calOf(next).day;
    if (next === game) return;
    audio.sfx('whoosh');
    setGame(next);
    if (after > before) setCalAnim({ from: before, to: after });
  };
  const play = () => {
    if (blocked()) return;
    // antes do jogo: avisa de mensagens que vencem e só se resolvem pelo celular
    if (!game.unemployed && ownsPhone(game) && urgentMessages(game).length > 0 && gateAt !== absRound(game)) { setGateAt(absRound(game)); setPhoneGate(true); return; }
    doPlay();
  };
  const doPlay = () => { const g0 = game.luck ? game : { ...game, luck: 1 + Math.floor(Math.random() * 2147483000) }; if (g0 !== game) { setGame(g0); saveGame(g0, { urgent: true }); } const r = playNext(g0); const mine = r.results.some((x) => x.homeId === game.userClubId || x.awayId === game.userClubId); if (game.unemployed || !mine) { setLast(r.results); setGame(r.state); if (!game.unemployed && r.results.length) setSheet(r.results); } else { setTactics([]); setMode(null); setLive(r); } }; // sem clube (ou sem jogo seu nesta rodada, como na Série D eliminada): nada para assistir
  /** Refaz a partida do mesmo ponto com a nova mudança: o que já passou fica igual e o resto muda conforme a mexida. */
  const applyTactic = (t: Tactic) => { const list = [...tactics, t]; setTactics(list); setLive(playNext(game, list)); };
  const finishMatch = () => { setTactics([]); setMode(null); if (live) { setLast(live.results); setGame(live.state); setSheet(live.results); } setLive(null); };
  const liveResult = live?.results.find((r) => r.homeId === game.userClubId || r.awayId === game.userClubId);
  const ev = live ? pendingEvent(game) : undefined;
  const liveLabel = ev ? ev.label : userDivision(game).name;
  // seu time com as mudanças táticas já feitas (formação e escalação); serve para a tela de formação e para os bonecos
  const liveUserTeam = (() => { const t = healUserLineup(game, true).teams[game.userClubId]; const last = tactics[tactics.length - 1]; const st = [...tactics].reverse().find((x) => x.stance)?.stance; return t && last ? { ...t, formation: last.formation, lineup: last.lineup, ...(st ? { stance: st } : {}) } : t; })();
  const liveFormation = (side: 'home' | 'away') => { const id = side === 'home' ? liveResult?.homeId : liveResult?.awayId; return id === game.userClubId && liveUserTeam ? liveUserTeam.formation : teamOf(game, id ?? game.userClubId).formation; };
  const nextSeason = async () => { setLast([]); const pack = await loadSeasonPack(); setGame(pack.startNextSeason(game)); }; // (o pacote da 2ª temporada em diante carrega sob demanda)

  return (
    <>
      {bg}
      <div className="app">
        <header className="tv-bar" style={{ '--club-tint': tintColor(club) } as React.CSSProperties}>
          <button className="tv-burger" onClick={() => setMenuOpen(true)} aria-label="Abrir o menu" aria-expanded={menuOpen} disabled={!!live}><i /><i /><i /></button>
          <div className="tv-id">
            <ClubBadge club={club} size={40} />
            <div>
              <strong>{game.unemployed ? 'Sem clube' : club.name.length > 14 ? club.shortName : club.name}</strong>
              <small>{game.unemployed ? 'Procurando clube' : userDivision(game).name} · {formatDayShort(calOf(game).day)}</small>
            </div>
          </div>
          <div className="tv-right">
            <span className="tv-money" title={game.unemployed ? 'Seu saldo no banco' : 'Orçamento para transferências'}>{game.unemployed ? formatBudget(balanceOf(game)) : formatBudget(game.budgets[game.userClubId])}</span>
            <button className="tv-phone gh-phone" onClick={() => (ownsPhone(game) ? setPhoneOpen(true) : setTab('shop'))} disabled={!!live} aria-label={ownsPhone(game) ? `Celular${unreadCount(game) + pendingCount(game) > 0 ? `, ${unreadCount(game) + pendingCount(game)} pendências` : ''}` : 'Comprar um celular'}>📱{ownsPhone(game) && unreadCount(game) + pendingCount(game) > 0 && <i className="nav-badge">{unreadCount(game) + pendingCount(game)}</i>}</button>
          </div>
        </header>
        <SideMenu game={game} open={menuOpen} current={(tab === 'table' ? (tableView === 'scorers' ? 'scorers' : tableView === 'hist' ? 'hist' : 'table') : tab) as MenuTarget} locked={!!live} onClose={() => setMenuOpen(false)} onGo={goMenu} />
        {(autosave.failure || autosave.notice) && (
          <div className={`save-bar ${autosave.failure ? 'bad' : ''}`} role={autosave.failure ? 'alert' : 'status'}>
            <span>{autosave.failure ?? autosave.notice}</span>
            {autosave.failure ? <button className="mini" onClick={autosave.retry}>Tentar de novo</button> : <button className="mini" onClick={autosave.dismiss}>OK</button>}
          </div>
        )}
        <main>
          {live && liveResult && !mode && <MatchChoice home={clubOf(game, liveResult.homeId)} away={clubOf(game, liveResult.awayId)} divisionName={liveLabel} stadium={clubOf(game, liveResult.homeId).stadium} onChoose={setMode} />}
          {live && liveResult && mode === 'sim' && <MatchSim home={clubOf(game, liveResult.homeId)} away={clubOf(game, liveResult.awayId)} result={liveResult} userSide={liveResult.homeId === game.userClubId ? 'home' : 'away'} onFinish={finishMatch} />}
          {live && liveResult && mode === 'watch' && (
            <LiveMatch players={playerMap(teamOf(game, liveResult.homeId), teamOf(game, liveResult.awayId))} key={`${game.season}-${game.round}-${ev?.kind ?? 'l'}`} home={clubOf(game, liveResult.homeId)} away={clubOf(game, liveResult.awayId)} result={liveResult}
              homeFormation={liveFormation('home')} awayFormation={liveFormation('away')} userTeam={liveUserTeam} unavailable={injuredSet(game)} tacticsUsed={tactics.length} onTactic={applyTactic} userSide={liveResult.homeId === game.userClubId ? 'home' : 'away'} divisionName={liveLabel} stadium={clubOf(game, liveResult.homeId).stadium} onFinish={finishMatch} />
          )}
          {!live && game.unemployed && tab === 'home' && <Unemployed game={game} over={isSeasonOver(game)} onChange={setGame} onPlay={play} onAdvance={() => runAdvance(false)} onAdvanceToMatch={() => runAdvance(true)} onNextSeason={nextSeason} onSeeTables={() => { setTableView('rounds'); setTab('table'); }} />}
          {!live && !game.unemployed && tab === 'home' && <Home game={game} onChange={setGame} last={last} over={isSeasonOver(game)} onPlay={play} onNextSeason={nextSeason} onSeeTables={() => { setTableView('div'); setTab('table'); }} onSeeResults={() => { setTableView('rounds'); setTab('table'); }} onEditLineup={() => setTab('lineup')} onTab={(t) => setTab(t)} onNews={() => setPhoneOpen(true)} onSeeHist={() => { setTableView('hist'); setTab('table'); }} onSeeOffers={() => { setTfView('offers'); setTab('transfers'); }} onAdvance={() => runAdvance(false)} onAdvanceToMatch={() => runAdvance(true)} />}
          {!live && !game.unemployed && tab === 'youth' && <YouthScreen game={game} onChange={setGame} />}
          {!live && tab === 'profile' && <CoachProfile game={game} onNext={(t) => setTab(t)} onChange={setGame} />}
          {!live && tab === 'world' && <PremiumGate feature="world" onBack={() => setTab('home')}><WorldScreen game={game} onChange={setGame} onBack={() => setTab('home')} /></PremiumGate>}
          {!live && tab === 'shop' && <ShopScreen game={game} onChange={setGame} onOpenPhone={() => setPhoneOpen(true)} />}
          {!live && !game.unemployed && tab === 'calendar' && <CalendarScreen game={game} onBack={() => setTab('home')} />}
          {!live && !game.unemployed && tab === 'stadium' && <Stadium game={game} onChange={setGame} onBack={() => setTab('home')} />}
          {!live && !game.unemployed && tab === 'finance' && <Finance game={game} onChange={setGame} onBack={() => setTab('home')} />}
          {!live && !game.unemployed && tab === 'lineup' && <Lineup game={game} onChange={setGame} onBack={() => setTab('home')} />}
          {!live && !game.unemployed && tab === 'squad' && <Squad game={game} onChange={setGame} />}
          {!live && tab === 'table' && <Table key={tableView} game={game} initialView={tableView} />}
          {!live && !game.unemployed && tab === 'transfers' && <Transfers game={game} onChange={setGame} view={tfView} onView={setTfView} />}
        </main>

        {sheet && !live && <ResultsSheet game={game} results={sheet} onClose={() => setSheet(null)} />}
        {calAnim && <DayCalendar game={game} from={calAnim.from} to={calAnim.to} onClose={() => setCalAnim(null)} />}
        {homeGate && (
          <div className="phone-gate" role="dialog" aria-modal="true" aria-label="Moradia necessária">
            <div className="home-gate">
              <h2>🏠 Você ainda não tem onde morar</h2>
              <p>Antes de avançar os dias ou iniciar uma partida, alugue ou compre uma casa. Tudo é feito pelo celular:</p>
              <ol className="hg-steps">
                {housingSteps(game).map((s) => <li key={s.id} className={s.done ? 'done' : ''}><span aria-hidden="true">{s.done ? '✅' : s.icon}</span><span><b>{s.label}</b><small>{s.hint}</small></span></li>)}
              </ol>
              <button className="primary" onClick={() => { setHomeGate(false); if (ownsPhone(game)) setPhoneOpen(true); else setTab('shop'); }}>{ownsPhone(game) ? '📱 Abrir o celular' : '🛒 Ir à Loja comprar um celular'}</button>
              <button className="btn" onClick={() => setHomeGate(false)}>Fechar</button>
            </div>
          </div>
        )}
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
