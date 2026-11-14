import { useEffect, useRef, useState } from 'react';
import { audio } from '../audio/audio';
import { changePin, checkPin, clearNotifications, hasPin, installApp, installedApps, isInstalled, markAllRead, phoneOf, PIN_LENGTH, registerPin, STORE_APPS, uninstallApp, updatePhoneSettings, WALLPAPERS, appById } from '../engine/phone';
import type { GameState } from '../engine/types';
import { BankApp } from './BankApp';
import { CasinoApp } from './CasinoApp';
import { DealerApp } from './DealerApp';
import { NewsApp } from './NewsApp';
import { RealtorApp } from './RealtorApp';
import { SocialApp } from './SocialApp';
import './phone.css';

interface Props { game: GameState; onChange: (g: GameState) => void; onClose: () => void }
type Screen = 'home' | 'loja' | 'config' | string;

const clock = () => new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const MAX_TRIES = 5;

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
  const gameRef = useRef(game); gameRef.current = game;

  useEffect(() => { const t = window.setInterval(() => setNow(clock()), 15000); return () => window.clearInterval(t); }, []);

  const bad = (msg: string) => { setErr(msg); setShake((n) => n + 1); audio.sfx('error'); };
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
      onChange(r.state); unlock(); return;
    }
    if (checkPin(game, pin)) return unlock();
    const n = tries + 1; setTries(n);
    if (n >= MAX_TRIES) { setWaitUntil(Date.now() + 30000); setTries(0); return bad('Muitas tentativas. Aguarde 30 segundos.'); }
    bad(`PIN incorreto. ${MAX_TRIES - n} ${MAX_TRIES - n === 1 ? 'tentativa restante' : 'tentativas restantes'}.`);
  };

  const close = () => { setClosing(true); window.setTimeout(onClose, 380); };
  const wall = WALLPAPERS.find((w) => w.id === s.wallpaper)!.css;
  const unread = ph.notifications.filter((n) => !n.read).length;

  return (
    <div className={`ph-overlay ${closing ? 'out' : ''}`} role="dialog" aria-modal="true" aria-label="Celular">
      <div className={`ph-device ${s.dark ? 'dark' : 'light'} ${s.bigText ? 'big' : ''}`}>
        <i className="ph-notch" aria-hidden="true" />
        <div className="ph-screen" style={{ filter: `brightness(${s.brightness / 100})` }}>
          <div className="ph-wall" style={{ background: wall }} />
          <div className="ph-status"><span>{now}</span><span>{unread > 0 && !s.dnd ? `🔔 ${unread} ` : ''}{s.dnd ? '🌙 ' : ''}📶 🔋</span></div>

          {locked ? (
            <LockScreen game={game} now={now} onSubmit={submitLock} firstPin={firstPin} err={err} shake={shake} onReset={() => { setFirstPin(null); setErr(undefined); }} />
          ) : (
            <>
              {screen === 'home' && <HomeScreen game={game} onOpen={setScreen} />}
              {screen === 'loja' && <Store game={game} onChange={onChange} onOpen={setScreen} />}
              {screen === 'config' && <Settings game={game} onChange={onChange} />}
              {screen === 'banco' && <BankApp game={game} onChange={onChange} />}
              {screen === 'concessionaria' && <DealerApp game={game} onChange={onChange} onOpenApp={setScreen} />}
              {screen === 'corretor' && <RealtorApp game={game} onChange={onChange} onOpenApp={setScreen} />}
              {screen === 'cassino' && <CasinoApp game={game} onChange={onChange} onOpenApp={setScreen} />}
              {screen === 'noticias' && <NewsApp game={game} />}
              {(screen === 'linstagra' || screen === 'tikiteko') && <SocialApp app={screen} game={game} onChange={onChange} />}
              {!['home', 'loja', 'config', 'banco', 'concessionaria', 'corretor', 'linstagra', 'tikiteko', 'cassino', 'noticias'].includes(screen) && <SoonApp id={screen} />}
              <button className="ph-homebar" onClick={() => setScreen('home')} aria-label="Início do celular" />
            </>
          )}
        </div>
        <button className="ph-power" onClick={close} aria-label="Guardar o celular">⏻</button>
      </div>
    </div>
  );
}

function LockScreen({ game, now, onSubmit, firstPin, err, shake, onReset }: { game: GameState; now: string; onSubmit: (pin: string) => void; firstPin: string | null; err?: string; shake: number; onReset: () => void }) {
  const ph = phoneOf(game);
  const registering = !hasPin(game);
  const [show, setShow] = useState(false);
  return (
    <div className="ph-lock">
      <div className="ph-time" aria-live="off">{now}</div>
      <div className="ph-date">Temporada {game.season} · Rodada {Math.min(game.round, game.totalRounds)}</div>
      {!ph.settings.dnd && ph.notifications.filter((n) => !n.read).slice(0, 3).map((n) => (
        <div className="ph-notif" key={n.id}><b>{appById(n.app)?.icon} {appById(n.app)?.name ?? n.app}</b><span>{n.text}</span></div>
      ))}
      {!show ? (
        <button className="ph-unlock" onClick={() => setShow(true)}>{registering ? '🔐 Toque para cadastrar o PIN' : '🔓 Toque para desbloquear'}</button>
      ) : registering ? (
        <>
          <PinPad key={firstPin === null ? 'a' : 'b'} title={firstPin === null ? 'Crie o seu PIN' : 'Confirme o PIN'} hint={firstPin === null ? `${PIN_LENGTH} números. Você vai usá-lo toda vez que abrir o celular.` : 'Digite o mesmo PIN de novo.'} error={err} shake={shake} onDone={onSubmit} />
          {firstPin !== null && <button className="ph-link" onClick={onReset}>Começar de novo</button>}
        </>
      ) : (
        <PinPad title="Digite o PIN" error={err} shake={shake} onDone={onSubmit} />
      )}
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
            <span className="ph-ico">{a.icon}{a.id === 'banco' && unread > 0 && <em>{unread}</em>}</span>
            <small>{a.name}</small>
          </button>
        ))}
      </div>
      {apps.length === 2 && <p className="ph-tip">Abra a Loja de Apps para baixar novos aplicativos.</p>}
    </div>
  );
}

function Store({ game, onChange, onOpen }: { game: GameState; onChange: (g: GameState) => void; onOpen: (id: string) => void }) {
  const [q, setQ] = useState('');
  const list = STORE_APPS.filter((a) => `${a.name} ${a.category} ${a.blurb}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="ph-app-screen">
      <h2>🛍️ Loja de Apps</h2>
      <input className="ph-search" placeholder="Buscar apps" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar apps" />
      <ul className="ph-store">
        {list.map((a) => {
          const have = isInstalled(game, a.id);
          return (
            <li key={a.id}>
              <span className="ph-ico big">{a.icon}</span>
              <div className="grow"><b>{a.name}</b><small>{a.category} · {a.size} · ⭐ {a.rating}</small><small>{a.blurb}</small></div>
              {have ? (
                <div className="ph-btns"><button className="ph-btn" onClick={() => onOpen(a.id)}>Abrir</button><button className="ph-btn ghost" onClick={() => onChange(uninstallApp(game, a.id))}>Remover</button></div>
              ) : (
                <button className="ph-btn pri" onClick={() => { onChange(installApp(game, a.id)); audio.sfx('cash'); }}>Instalar</button>
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
      <span className="ph-ico big">{a?.icon ?? '❓'}</span>
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
