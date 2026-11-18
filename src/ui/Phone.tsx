import { useEffect, useRef, useState } from 'react';
import { audio } from '../audio/audio';
import { calOf, formatDayLong, formatDayShort, matchTimeOf } from '../engine/calendar';
import { clubOf } from '../engine/lookup';
import { upcomingMatches } from '../engine/upcoming';
import { appsUsed, connOf, downloadMs, INSTALL_MS, modelOf, needsInternet, netState, openDelayMs } from '../engine/phone';
import { changePin, checkPin, clearNotifications, hasPin, installApp, installedApps, isInstalled, markAllRead, phoneOf, PIN_LENGTH, registerPin, STORE_APPS, uninstallApp, updatePhoneSettings, WALLPAPERS, appById } from '../engine/phone';
import type { GameState } from '../engine/types';
import { BankApp } from './BankApp';
import { CasinoApp } from './CasinoApp';
import { DealerApp } from './DealerApp';
import { NewsApp } from './NewsApp';
import { MessagesApp } from './MessagesApp';
import { pendingCount } from '../engine/inbox';
import { RealtorApp } from './RealtorApp';
import { CalcApp, QuickPanel } from './QuickPanel';
import { ChipApp } from './ChipApp';
import { NetFibraApp } from './NetFibraApp';
import { APP_ICON, GameIcon } from './gameIcons';
import type { PhoneApp } from '../engine/phone';

/** Ícone do app: a imagem nova quando existe; senão o emoji. */
const AppIco = ({ a }: { a: PhoneApp }) => (APP_ICON[a.id] ? <GameIcon name={APP_ICON[a.id]} /> : <>{a.icon}</>);
import { AccountGate } from './AccountGate';
import { HoldScan } from './AppKit';
import { needsAccount, ACCOUNT_APPS } from '../engine/accounts';
import { SocialApp } from './SocialApp';
import './phone.css';

interface Props { game: GameState; onChange: (g: GameState) => void; onClose: () => void }
type Screen = 'home' | 'loja' | 'config' | string;

const clock = () => new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const MAX_TRIES = 5;

/** Ícones da barra de status: Wi-Fi, sinal e bateria (desenhados, não emoji). */
function StatusIcons({ wifi, signal = true }: { wifi: boolean; signal?: boolean }) {
  return (
    <span className="ph-sicons" aria-hidden="true">
      {wifi && <svg viewBox="0 0 24 18" width="16" height="12"><path d="M2 6.5a14 14 0 0 1 20 0M5.5 10a9 9 0 0 1 13 0M9 13.3a4.3 4.3 0 0 1 6 0" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /><circle cx="12" cy="16" r="1.6" fill="currentColor" /></svg>}
      {signal && <svg viewBox="0 0 20 16" width="16" height="12"><rect x="1" y="11" width="3" height="4" rx="1" fill="currentColor" /><rect x="6" y="8" width="3" height="7" rx="1" fill="currentColor" /><rect x="11" y="5" width="3" height="10" rx="1" fill="currentColor" /><rect x="16" y="1" width="3" height="14" rx="1" fill="currentColor" /></svg>}
    </span>
  );
}
const Battery = () => <span className="ph-batt" aria-hidden="true"><svg viewBox="0 0 28 14" width="24" height="12"><rect x="1" y="1" width="23" height="12" rx="3.5" fill="none" stroke="currentColor" strokeWidth="1.6" /><rect x="3" y="3" width="19" height="8" rx="2" fill="currentColor" /><rect x="25" y="5" width="2" height="4" rx="1" fill="currentColor" /></svg>92%</span>;

/** Teclado numérico com bolinhas do PIN. `onDone` recebe os 4 dígitos. */
function PinPad({ title, hint, error, onDone, shake }: { title: string; hint?: string; error?: string; onDone: (pin: string) => void; shake?: number }) {
  const [pin, setPin] = useState('');
  useEffect(() => { setPin(''); }, [shake, title]);
  const press = (d: string) => {
    if (pin.length >= PIN_LENGTH) return;
    const n = pin + d;
    setPin(n);
    if (n.length === PIN_LENGTH) window.setTimeout(() => onDone(n), 120);
  };
  return (
    <div className="ph-pad">
      <p className="ph-pad-title">{title}</p>
      <div className={`ph-dots ${shake ? 'shake' : ''}`} key={shake} aria-label={`${pin.length} de ${PIN_LENGTH} dígitos`}>
        {Array.from({ length: PIN_LENGTH }, (_, i) => <i key={i} className={i < pin.length ? 'on' : ''} />)}
      </div>
      <p className={`ph-pad-msg ${error ? 'err' : ''}`} role="status">{error ?? hint ?? ' '}</p>
      <div className="ph-keys">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => <button key={d} onClick={() => press(d)} aria-label={d}>{d}</button>)}
        <span />
        <button onClick={() => press('0')} aria-label="0">0</button>
        <button onClick={() => setPin(pin.slice(0, -1))} aria-label="Apagar">⌫</button>
      </div>
    </div>
  );
}

/** Celular do treinador: abre com animação, pede o PIN (cadastra no primeiro acesso) e tem Loja de Apps e Configurações. */
export function Phone({ game, onChange, onClose }: Props) {
  const ph = phoneOf(game);
  const s = ph.settings;
  const [locked, setLocked] = useState(true);
  const [screen, setScreen] = useState<Screen>('home');
  const [firstPin, setFirstPin] = useState<string | null>(null);
  const [err, setErr] = useState<string | undefined>();
  const [shake, setShake] = useState(0);
  const [tries, setTries] = useState(0);
  const [waitUntil, setWaitUntil] = useState(0);
  const [now, setNow] = useState(clock());
  const [closing, setClosing] = useState(false);
  const [panel, setPanel] = useState(false);
  const [target, setTarget] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const lastSms = ph.sms?.[0]?.id;
  const seenSms = useRef(lastSms);
  useEffect(() => { if (lastSms && lastSms !== seenSms.current) { seenSms.current = lastSms; setToast(ph.sms![0].text); const t = window.setTimeout(() => setToast(null), 9000); return () => window.clearTimeout(t); } }, [lastSms]); // eslint-disable-line react-hooks/exhaustive-deps
  const pullY = useRef<number | null>(null);
  const [offer, setOffer] = useState(false); // depois de criar o PIN: oferece cadastrar a digital
  const gameRef = useRef(game); gameRef.current = game;

  useEffect(() => { const t = window.setInterval(() => setNow(clock()), 15000); return () => window.clearInterval(t); }, []);

  const bad = (msg: string) => { setErr(msg); setShake((n) => n + 1); audio.sfx('error'); };
  const go = (id: string) => {
    if (!needsInternet(id)) { setScreen(id); return; }
    setTarget(id);
    setScreen(netState(gameRef.current).speed === 'none' ? 'nonet' : 'boot');
  };
  const unlock = () => { setLocked(false); setScreen('home'); setErr(undefined); setTries(0); audio.sfx('unlock'); };

  const submitLock = (pin: string) => {
    if (Date.now() < waitUntil) return bad('Aguarde alguns segundos para tentar de novo.');
    if (!hasPin(game)) {
      if (firstPin === null) {
        if (!/^\d+$/.test(pin)) return bad('Use só números.');
        setFirstPin(pin); setErr(undefined); setShake((n) => n + 1); return;
      }
      const r = registerPin(game, firstPin, pin);
      if (!r.ok) { setFirstPin(null); return bad(r.error); }
      onChange(r.state); setOffer(true); audio.sfx('unlock'); return;
    }
    if (checkPin(game, pin)) return unlock();
    const n = tries + 1; setTries(n);
    if (n >= MAX_TRIES) { setWaitUntil(Date.now() + 30000); setTries(0); return bad('Muitas tentativas. Aguarde 30 segundos.'); }
    bad(`PIN incorreto. ${MAX_TRIES - n} ${MAX_TRIES - n === 1 ? 'tentativa restante' : 'tentativas restantes'}.`);
  };

  const close = () => { setClosing(true); window.setTimeout(onClose, 380); };
  const conn = connOf(game);
  const wall = WALLPAPERS.find((w) => w.id === s.wallpaper)!.css;
  const unread = ph.notifications.filter((n) => !n.read).length;

  return (
    <div className={`ph-overlay ${closing ? 'out' : ''}`} role="dialog" aria-modal="true" aria-label="Celular">
      <div className={`ph-device ${s.dark ? 'dark' : 'light'} ${s.bigText ? 'big' : ''}`}>
        <i className="ph-notch ph-cam" aria-hidden="true" />
        <div className="ph-screen" style={{ filter: `brightness(${s.brightness / 100})` }}>
          <div className="ph-wall" style={{ background: wall }} />
          <div className="ph-status ph-pull" role="button" tabIndex={0} aria-label="Abrir painel rápido (puxe para baixo)" onClick={() => setPanel(true)} onKeyDown={(e) => { if (e.key === 'Enter') setPanel(true); }}
            onPointerDown={(e) => { pullY.current = e.clientY; }} onPointerMove={(e) => { if (pullY.current !== null && e.clientY - pullY.current > 30) { pullY.current = null; setPanel(true); } }} onPointerUp={() => { pullY.current = null; }}>
            <span className="ph-sl">{locked ? 'Vida Real FC' : now}<StatusIcons wifi={conn.wifi} signal={false} /></span>
            <span className="ph-sr">{unread > 0 && !s.dnd ? `🔔 ${unread} ` : ''}{s.dnd ? '🌙 ' : ''}{conn.airplane ? '✈️ ' : ''}{conn.mobileData ? '5G ' : ''}<StatusIcons wifi={false} /><Battery /></span>
          </div>
          {toast && !s.dnd && <button className="ph-toast" onClick={() => { setToast(null); setScreen('mensagens'); }} aria-live="polite">💬 {toast}</button>}
          {panel && <QuickPanel game={game} onChange={onChange} onClose={() => setPanel(false)} onCalc={() => setScreen('calc')} canCalc={!locked} />}

          {locked ? (
            offer ? <FingerOffer onYes={() => { onChange(updatePhoneSettings(gameRef.current, { fingerprint: true })); setOffer(false); unlock(); }} onNo={() => { setOffer(false); unlock(); }} />
            : <LockScreen game={game} now={now} onSubmit={submitLock} firstPin={firstPin} err={err} shake={shake} onReset={() => { setFirstPin(null); setErr(undefined); }} onFinger={unlock} />
          ) : (
            <>
              {ACCOUNT_APPS.includes(screen) && needsAccount(game, screen) ? <AccountGate game={game} app={screen} onChange={onChange} /> : <>
              {screen === 'home' && <HomeScreen game={game} onOpen={go} />}
              {screen === 'boot' && <Boot game={game} id={target} onDone={() => setScreen(target)} />}
              {screen === 'nonet' && <NoNet game={game} id={target} onPanel={() => setPanel(true)} />}
              {screen === 'loja' && <Store game={game} onChange={onChange} onOpen={go} getGame={() => gameRef.current} onPanel={() => setPanel(true)} />}
              {screen === 'config' && <Settings game={game} onChange={onChange} />}
              {screen === 'banco' && <BankApp game={game} onChange={onChange} onHome={() => setScreen('home')} />}
              {screen === 'concessionaria' && <DealerApp game={game} onChange={onChange} onOpenApp={go} onHome={() => setScreen('home')} />}
              {screen === 'corretor' && <RealtorApp game={game} onChange={onChange} onOpenApp={go} onHome={() => setScreen('home')} />}
              {screen === 'cassino' && <CasinoApp game={game} onChange={onChange} onOpenApp={go} />}
              {screen === 'noticias' && <NewsApp game={game} />}
              {screen === 'calc' && <CalcApp />}
              {screen === 'netfibra' && <NetFibraApp game={game} onChange={onChange} onOpenApp={go} />}
              {screen === 'internetchip' && <ChipApp game={game} onChange={onChange} onOpenApp={go} />}
              {screen === 'mensagens' && <MessagesApp game={game} onChange={onChange} />}
              {(screen === 'linstagra' || screen === 'tikiteko') && <SocialApp app={screen} game={game} onChange={onChange} onHome={() => setScreen('home')} />}
              {!['home', 'loja', 'config', 'banco', 'concessionaria', 'corretor', 'linstagra', 'tikiteko', 'cassino', 'noticias', 'mensagens', 'calc', 'boot', 'nonet', 'internetchip', 'netfibra'].includes(screen) && <SoonApp id={screen} />}
              </>}
              <button className="ph-homebar" onClick={() => setScreen('home')} aria-label="Início do celular" />
            </>
          )}
        </div>
        <button className="ph-power" onClick={close} aria-label="Guardar o celular">⏻</button>
      </div>
    </div>
  );
}

/** Sensor de digital: é preciso segurar o dedo por 1 s para a leitura. */
const Finger = ({ onDone, label }: { onDone: () => void; label: string }) => <HoldScan onDone={onDone} label={label} />;

function FingerOffer({ onYes, onNo }: { onYes: () => void; onNo: () => void }) {
  const [reg, setReg] = useState(false);
  return (
    <div className="ph-lock">
      <div className="ph-offer">
        <h2>Desbloqueio por digital</h2>
        <p>Quer abrir o celular segurando o dedo no sensor, sem digitar o PIN?</p>
        {!reg ? (
          <>
            <button className="ph-btn pri" onClick={() => setReg(true)}>Cadastrar digital</button>
            <button className="ph-link" onClick={onNo}>Agora não</button>
          </>
        ) : <Finger label="Segure o dedo no sensor (1 s) para cadastrar" onDone={onYes} />}
      </div>
    </div>
  );
}

function LockScreen({ game, now, onSubmit, firstPin, err, shake, onReset, onFinger }: { game: GameState; now: string; onSubmit: (pin: string) => void; firstPin: string | null; err?: string; shake: number; onReset: () => void; onFinger: () => void }) {
  const ph = phoneOf(game);
  const registering = !hasPin(game);
  const [torch, setTorch] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const finger = !registering && !!ph.settings.fingerprint;
  const [usePin, setUsePin] = useState(false);
  const nextGame = upcomingMatches(game, 1)[0];
  const today = calOf(game).day;
  const hm = now;
  return (
    <div className={`ph-lock ${torch ? 'torch' : ''}`}>
      <div className="ph-lockico" aria-hidden="true">🔒</div>
      <div className="ph-time" aria-live="off">{hm}</div>
      <div className="ph-date">{formatDayLong(today)}</div>
      <div className="ph-next">
        <span className="ph-next-ico" aria-hidden="true">📅</span>
        <span className="ph-next-t"><b>Próximo jogo</b><small>{nextGame ? `${clubOf(game, nextGame.homeId).name} x ${clubOf(game, nextGame.awayId).name}` : 'Sem jogos marcados'}</small></span>
        {nextGame && <span className="ph-next-d">{nextGame.day === today ? 'Hoje' : formatDayShort(nextGame.day)} • {matchTimeOf(nextGame.day)}</span>}
      </div>
      {!ph.settings.dnd && ph.notifications.filter((n) => !n.read).slice(0, 2).map((n) => (
        <div className="ph-notif" key={n.id}><b>{appById(n.app)?.icon} {appById(n.app)?.name ?? n.app}</b><span>{n.text}</span></div>
      ))}
      {finger && !usePin ? (
        <>
          <Finger label="Segure o dedo no sensor (1 s) para desbloquear" onDone={onFinger} />
          <button className="ph-link" onClick={() => setUsePin(true)}>Usar PIN</button>
        </>
      ) : registering ? (
        <>
          <PinPad key={firstPin === null ? 'a' : 'b'} title={firstPin === null ? 'Crie o seu PIN' : 'Confirme o PIN'} hint={firstPin === null ? `${PIN_LENGTH} números. Você vai usá-lo toda vez que abrir o celular.` : 'Digite o mesmo PIN de novo.'} error={err} shake={shake} onDone={onSubmit} />
          {firstPin !== null && <button className="ph-link" onClick={onReset}>Começar de novo</button>}
        </>
      ) : (
        <PinPad title="Digite o PIN" error={err} shake={shake} onDone={onSubmit} />
      )}
      {note && <p className="ph-lock-note" role="status">{note}</p>}
      <div className="ph-lockbar">
        <button className="ph-round" aria-label={torch ? 'Desligar a lanterna' : 'Ligar a lanterna'} aria-pressed={torch} onClick={() => setTorch(!torch)}>🔦</button>
        <span style={{ flex: 1 }} />
        <button className="ph-round" aria-label="Câmera" onClick={() => { setNote('A câmera do celular ainda não funciona.'); window.setTimeout(() => setNote(null), 2500); }}>📷</button>
      </div>
    </div>
  );
}

function HomeScreen({ game, onOpen }: { game: GameState; onOpen: (id: string) => void }) {
  const apps = installedApps(game);
  const ph = phoneOf(game);
  const unread = ph.notifications.filter((n) => !n.read).length;
  return (
    <div className="ph-home">
      <div className="ph-grid">
        {apps.map((a) => (
          <button key={a.id} className="ph-app" onClick={() => onOpen(a.id)}>
            <span className="ph-ico"><AppIco a={a} />{a.id === 'banco' && unread > 0 && <em>{unread}</em>}{a.id === 'mensagens' && pendingCount(game) > 0 && <em>{pendingCount(game)}</em>}</span>
            <small>{a.name}</small>
          </button>
        ))}
      </div>
      {apps.length === 3 && <p className="ph-tip">Abra a Loja de Apps para baixar novos aplicativos.</p>}
    </div>
  );
}

type Job = { phase: 'down' | 'inst'; pct: number };

/** Tela de abertura de um app: a conexão ruim deixa o carregamento lento. */
function Boot({ game, id, onDone }: { game: GameState; id: string; onDone: () => void }) {
  const net = netState(game);
  const ms = openDelayMs(game);
  const app = appById(id);
  const [pct, setPct] = useState(0);
  useEffect(() => {
    const t0 = Date.now();
    const iv = window.setInterval(() => { const p = Math.min(100, ((Date.now() - t0) / ms) * 100); setPct(p); if (p >= 100) { window.clearInterval(iv); onDone(); } }, 80);
    return () => window.clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="ph-app-screen ph-boot" aria-busy="true">
      <span className="ph-ico big">{app ? <AppIco a={app} /> : '📱'}</span>
      <h2>{app?.name ?? 'Abrindo'}</h2>
      <div className="ph-prog" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${pct}%` }} /></div>
      <p className={net.speed === 'slow' ? 'bad' : ''}>{net.speed === 'slow' ? '⚠️ Conexão ruim… carregando devagar' : 'Carregando…'}</p>
    </div>
  );
}

/** Sem internet: o app não abre até ligar o Wi-Fi (e escolher a rede) ou os dados móveis. */
function NoNet({ game, id, onPanel }: { game: GameState; id: string; onPanel: () => void }) {
  const net = netState(game);
  const app = appById(id);
  return (
    <div className="ph-app-screen ph-boot">
      <span className="ph-ico big">{app ? <AppIco a={app} /> : '📱'}</span>
      <h2>Sem conexão</h2>
      <p>{net.label}. {net.note}</p>
      <button className="ph-btn pri" onClick={onPanel}>Abrir painel rápido</button>
    </div>
  );
}

/** Loja de Apps: instalar mostra o download (mais lento com conexão ruim), depois "instalando", e só então o botão Abrir. */
function Store({ game, onChange, onOpen, getGame, onPanel }: { game: GameState; onChange: (g: GameState) => void; onOpen: (id: string) => void; getGame: () => GameState; onPanel: () => void }) {
  const [q, setQ] = useState('');
  const [jobs, setJobs] = useState<Record<string, Job>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const timers = useRef<Record<string, number>>({});
  useEffect(() => () => { Object.values(timers.current).forEach((t) => window.clearInterval(t)); }, []);
  const net = netState(game);
  const list = STORE_APPS.filter((a) => `${a.name} ${a.category} ${a.blurb}`.toLowerCase().includes(q.toLowerCase()));

  const start = (id: string) => {
    if (appsUsed(getGame()) + Object.keys(timers.current).length >= modelOf(getGame()).apps) { setMsg('Memória cheia: remova um app ou compre um celular melhor na Mega-zona Luiz.'); audio.sfx('error'); return; }
    if (netState(getGame()).speed === 'none') { setMsg('Sem internet: ligue o Wi-Fi (e escolha uma rede) ou os dados móveis para baixar.'); audio.sfx('error'); return; }
    setMsg(null);
    const dl = downloadMs(getGame());
    const t0 = Date.now();
    setJobs((j) => ({ ...j, [id]: { phase: 'down', pct: 0 } }));
    timers.current[id] = window.setInterval(() => {
      const el = Date.now() - t0;
      if (el < dl) { setJobs((j) => ({ ...j, [id]: { phase: 'down', pct: (el / dl) * 100 } })); return; }
      if (el < dl + INSTALL_MS) { setJobs((j) => (j[id]?.phase === 'inst' ? j : { ...j, [id]: { phase: 'inst', pct: 100 } })); return; }
      window.clearInterval(timers.current[id]);
      delete timers.current[id];
      onChange(installApp(getGame(), id));
      audio.sfx('cash');
      setJobs((j) => { const n = { ...j }; delete n[id]; return n; });
    }, 100);
  };

  return (
    <div className="ph-app-screen">
      <h2>🛍️ Loja de Apps</h2>
      <p className={`ph-netline ${net.speed}`}>{net.kind === 'fibra' ? '⚡ NetFibra · downloads ultrarrápidos' : net.kind === '5g' ? '⚡ 5G · downloads rápidos' : net.kind === 'wifi' ? '⚠️ Wi-Fi grátis: conexão ruim, downloads lentos' : '🚫 Sem internet'}</p>
      <p className="ph-netline">💾 Memória: {appsUsed(game)}/{modelOf(game).apps >= 99 ? '∞' : modelOf(game).apps} apps · {modelOf(game).name}</p>
      {msg && <p className="ph-warn" role="alert">{msg} {msg.startsWith('Sem internet') && <button className="ph-link" onClick={onPanel}>Abrir painel</button>}</p>}
      <input className="ph-search" placeholder="Buscar apps" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar apps" />
      <ul className="ph-store">
        {list.map((a) => {
          const have = isInstalled(game, a.id);
          const job = jobs[a.id];
          return (
            <li key={a.id}>
              <span className="ph-ico big"><AppIco a={a} /></span>
              <div className="grow"><b>{a.name}</b><small>{a.category} · {a.size} · ⭐ {a.rating}</small><small>{a.blurb}</small></div>
              {job ? (
                <div className="ph-job" role="status">
                  {job.phase === 'down' ? (
                    <><div className="ph-prog"><i style={{ width: `${job.pct}%` }} /></div><small>Baixando… {Math.round(job.pct)}%{net.speed === 'slow' ? ' (conexão ruim)' : ''}</small></>
                  ) : (
                    <><div className="ph-prog busy"><i /></div><small>Instalando<span className="ph-dots3" aria-hidden="true" /></small></>
                  )}
                </div>
              ) : have ? (
                <div className="ph-btns"><button className="ph-btn" onClick={() => onOpen(a.id)}>Abrir</button><button className="ph-btn ghost" onClick={() => onChange(uninstallApp(game, a.id))}>Remover</button></div>
              ) : (
                <button className="ph-btn pri" onClick={() => start(a.id)}>Instalar</button>
              )}
            </li>
          );
        })}
        {list.length === 0 && <li className="ph-empty">Nenhum app encontrado.</li>}
      </ul>
    </div>
  );
}

function SoonApp({ id }: { id: string }) {
  const a = appById(id);
  return (
    <div className="ph-app-screen center">
      <span className="ph-ico big">{a ? <AppIco a={a} /> : '❓'}</span>
      <h2>{a?.name ?? 'App'}</h2>
      <p>Este app chega na próxima atualização do jogo.</p>
    </div>
  );
}

function Toggle({ label, note, on, onClick }: { label: string; note?: string; on: boolean; onClick: () => void }) {
  return (
    <button className="ph-row" role="switch" aria-checked={on} onClick={onClick}>
      <span className="grow"><b>{label}</b>{note && <small>{note}</small>}</span>
      <i className={`ph-sw ${on ? 'on' : ''}`} />
    </button>
  );
}

function Settings({ game, onChange }: { game: GameState; onChange: (g: GameState) => void }) {
  const ph = phoneOf(game);
  const s = ph.settings;
  const set = (p: Partial<typeof s>) => onChange(updatePhoneSettings(game, p));
  const [pinForm, setPinForm] = useState<{ cur: string; a: string; b: string } | null>(null);
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null);
  const savePin = () => {
    if (!pinForm) return;
    const r = changePin(game, pinForm.cur, pinForm.a, pinForm.b);
    if (!r.ok) { setMsg({ text: r.error, err: true }); audio.sfx('error'); return; }
    onChange(r.state); setPinForm(null); setMsg({ text: 'PIN alterado.' }); audio.sfx('unlock');
  };
  const digits = (v: string) => v.replace(/\D/g, '').slice(0, PIN_LENGTH);
  return (
    <div className="ph-app-screen">
      <h2>⚙️ Configurações</h2>

      <h3>Tela</h3>
      <div className="ph-card">
        <p className="ph-label">Papel de parede</p>
        <div className="ph-walls">
          {WALLPAPERS.map((w) => <button key={w.id} className={s.wallpaper === w.id ? 'on' : ''} style={{ background: w.css }} aria-label={w.label} aria-pressed={s.wallpaper === w.id} onClick={() => set({ wallpaper: w.id })} />)}
        </div>
        <label className="ph-label" htmlFor="ph-bright">Brilho: {s.brightness}%</label>
        <input id="ph-bright" type="range" min={30} max={100} value={s.brightness} onChange={(e) => set({ brightness: Number(e.target.value) })} />
        <Toggle label="Tema escuro" on={s.dark} onClick={() => set({ dark: !s.dark })} />
        <Toggle label="Texto grande" note="Aumenta as letras dos apps." on={s.bigText} onClick={() => set({ bigText: !s.bigText })} />
      </div>

      <h3>Som e notificações</h3>
      <div className="ph-card">
        <Toggle label="Sons do celular" note="Toques e avisos." on={s.sounds} onClick={() => set({ sounds: !s.sounds })} />
        <Toggle label="Vibração" on={s.vibration} onClick={() => set({ vibration: !s.vibration })} />
        <Toggle label="Não perturbe" note="Esconde avisos na tela de bloqueio e silencia o celular." on={s.dnd} onClick={() => set({ dnd: !s.dnd })} />
        <button className="ph-btn" onClick={() => onChange(clearNotifications(markAllRead(game)))} disabled={ph.notifications.length === 0}>Limpar notificações ({ph.notifications.length})</button>
      </div>

      <h3>Segurança</h3>
      <div className="ph-card">
        <Toggle label="Desbloqueio por digital" note="Abre o celular sem o PIN e confirma senhas de apps (como o Banco) com o dedo." on={!!s.fingerprint} onClick={() => set({ fingerprint: !s.fingerprint })} />
        {!pinForm ? <button className="ph-btn" onClick={() => { setPinForm({ cur: '', a: '', b: '' }); setMsg(null); }}>🔐 Alterar PIN</button> : (
          <div className="ph-form">
            <input inputMode="numeric" type="password" placeholder="PIN atual" value={pinForm.cur} onChange={(e) => setPinForm({ ...pinForm, cur: digits(e.target.value) })} aria-label="PIN atual" />
            <input inputMode="numeric" type="password" placeholder="Novo PIN" value={pinForm.a} onChange={(e) => setPinForm({ ...pinForm, a: digits(e.target.value) })} aria-label="Novo PIN" />
            <input inputMode="numeric" type="password" placeholder="Confirmar novo PIN" value={pinForm.b} onChange={(e) => setPinForm({ ...pinForm, b: digits(e.target.value) })} aria-label="Confirmar novo PIN" />
            <div className="ph-btns"><button className="ph-btn pri" onClick={savePin}>Salvar</button><button className="ph-btn ghost" onClick={() => setPinForm(null)}>Cancelar</button></div>
          </div>
        )}
        {msg && <p className={`ph-pad-msg ${msg.err ? 'err' : ''}`} role="status">{msg.text}</p>}
      </div>

      <h3>Sobre o aparelho</h3>
      <div className="ph-card ph-about">
        <div className="ph-row static"><span className="grow">Modelo</span><b>VR Phone Pro</b></div>
        <div className="ph-row static"><span className="grow">Apps instalados</span><b>{ph.installed.length + 2}</b></div>
        <div className="ph-row static"><span className="grow">Armazenamento usado</span><b>{Math.round(ph.installed.reduce((t, id) => t + (parseInt(appById(id)?.size ?? '0', 10) || 0), 0) + 2200)} MB de 128 GB</b></div>
        <div className="ph-row static"><span className="grow">Sistema</span><b>VR OS 1.0</b></div>
      </div>
    </div>
  );
}
