import { useEffect, useRef, useState } from 'react';
import { applyMods, loadMods, modTemplate, parseMod, saveMods, type Mod } from '../data/mods';
import { clearHall, loadHall, type HallEntry } from '../engine/hall';
import { isValidSave, readRawSave } from '../engine/save';
import type { GameState } from '../engine/types';
import { createBackup, deleteBackup, listBackups, restoreBackup, MAX_BACKUPS, type Backup } from '../settings/backups';
import { APP_VERSION, COMMUNITY_LINK } from '../version';
import { Screen } from './Screen';

/* ---------------- Carregar Jogo ---------------- */

function metaOf(raw: string | null): { club: string; season: number; round: number; coach: string } | null {
  if (!raw) return null;
  try {
    const g = JSON.parse(raw) as GameState;
    if (!isValidSave(g)) return null;
    return { club: g.unemployed ? 'Sem clube' : g.clubs[g.userClubId]?.name ?? '?', season: g.season, round: Math.min(g.round, g.totalRounds), coach: g.coach.name };
  } catch { return null; }
}
const when = (ms: number) => new Date(ms).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });

/** Abre o jogo salvo automaticamente ou um backup; também cria backups do jogo atual. */
export function LoadGame({ onBack, onLoaded }: { onBack: () => void; onLoaded: () => void }) {
  const [backups, setBackups] = useState<Backup[]>(() => listBackups());
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null);
  const [ask, setAsk] = useState<string | null>(null);
  const auto = metaOf(readRawSave());

  const create = () => {
    const r = createBackup();
    if (r.ok) { setBackups(listBackups()); setMsg({ text: 'Backup criado.' }); }
    else setMsg({ text: r.reason === 'no-save' ? 'Não há jogo salvo para copiar.' : r.reason === 'limit' ? `Limite de ${MAX_BACKUPS} backups. Apague um para criar outro.` : 'Sem espaço para guardar o backup.', err: true });
  };
  const load = (b: Backup) => { if (restoreBackup(b.id)) onLoaded(); else setMsg({ text: 'Não foi possível abrir este backup.', err: true }); };

  return (
    <Screen title="Carregar Jogo" onBack={onBack}>
      <section>
        <h3>Jogo salvo automaticamente</h3>
        {auto ? (
          <div className="card ld-row">
            <div className="grow"><b>{auto.club}</b><small>{auto.coach} · Temporada {auto.season} · Rodada {auto.round}</small></div>
            <button className="btn main" onClick={onLoaded}>Carregar</button>
          </div>
        ) : <div className="card"><p className="hint" style={{ margin: 0 }}>Nenhum jogo salvo. Comece uma carreira em "Novo Jogo".</p></div>}
      </section>
      <section>
        <h3>Backups ({backups.length}/{MAX_BACKUPS})</h3>
        {backups.length === 0 && <div className="card"><p className="hint" style={{ margin: 0 }}>Nenhum backup encontrado.</p></div>}
        <ul className="un-list">
          {backups.map((b) => (
            <li key={b.id}>
              <div className="grow"><b>{b.clubName}</b><small>Temporada {b.season} · Rodada {Math.min(b.round, 99)} · {when(b.createdAt)}</small></div>
              {ask === b.id ? (
                <div className="un-btns"><button className="btn main" onClick={() => { deleteBackup(b.id); setBackups(listBackups()); setAsk(null); }}>Apagar</button><button className="btn" onClick={() => setAsk(null)}>Voltar</button></div>
              ) : (
                <div className="un-btns"><button className="btn main" onClick={() => load(b)}>Carregar</button><button className="btn" onClick={() => setAsk(b.id)}>Excluir</button></div>
              )}
            </li>
          ))}
        </ul>
        <button className="btn" onClick={create} disabled={!auto}>➕ Criar backup do jogo atual</button>
        {msg && <p className={`tf-notice ${msg.err ? 'err' : ''}`} role="status" style={{ marginTop: 10 }}>{msg.text}</p>}
        <p className="hint">Carregar um backup substitui o jogo salvo atual.</p>
      </section>
    </Screen>
  );
}

/* ---------------- Mods da Comunidade ---------------- */

/** Importa pacotes de dados (JSON) que trocam nomes, cores e estádios dos clubes nas próximas carreiras. */
export function Mods({ onBack }: { onBack: () => void }) {
  const [mods, setMods] = useState<Mod[]>(() => loadMods());
  const [text, setText] = useState('');
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const commit = (next: Mod[]) => { setMods(next); saveMods(next); applyMods(next); };

  const add = (src: string) => {
    const r = parseMod(src);
    if (!r.ok) { setMsg({ text: r.error, err: true }); return; }
    commit([...mods, r.mod]); setText(''); setMsg({ text: `Pacote "${r.mod.name}" instalado (${r.mod.clubs.length} clubes). Vale para as próximas carreiras.` });
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([modTemplate()], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'modelo-de-pacote.json'; a.click(); URL.revokeObjectURL(url);
  };

  return (
    <Screen title="Mods da Comunidade" onBack={onBack}>
      <div className="card">
        <p style={{ margin: 0 }}>Pacotes de dados criados por você ou pela comunidade. Cada pacote troca <b>nomes, siglas, cores, estádios e cidades</b> dos clubes. As mudanças valem para as <b>próximas carreiras</b> (carreiras em andamento não mudam).</p>
        <p className="hint">Comunidade: {COMMUNITY_LINK} · v{APP_VERSION}</p>
      </div>
      <section>
        <h3>Pacotes instalados</h3>
        {mods.length === 0 && <div className="card"><p className="hint" style={{ margin: 0 }}>Nenhum pacote instalado. O jogo usa os dados originais.</p></div>}
        <ul className="un-list">
          {mods.map((m) => (
            <li key={m.id}>
              <div className="grow"><b>{m.name}</b><small>{m.clubs.length} clubes{m.author ? ` · ${m.author}` : ''}{m.version ? ` · v${m.version}` : ''}</small></div>
              <div className="un-btns">
                <button className={`btn ${m.enabled ? 'main' : ''}`} aria-pressed={m.enabled} onClick={() => commit(mods.map((x) => (x.id === m.id ? { ...x, enabled: !x.enabled } : x)))}>{m.enabled ? 'Ligado' : 'Desligado'}</button>
                <button className="btn" onClick={() => commit(mods.filter((x) => x.id !== m.id))}>Remover</button>
              </div>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h3>Instalar pacote</h3>
        <div className="card">
          <input ref={file} type="file" accept="application/json,.json" aria-label="Arquivo do pacote" onChange={async (e) => { const f = e.target.files?.[0]; if (f) add(await f.text()); e.target.value = ''; }} />
          <p className="hint">Ou cole o conteúdo do pacote (JSON):</p>
          <textarea className="md-text" rows={6} value={text} onChange={(e) => setText(e.target.value)} aria-label="Conteúdo do pacote" placeholder='{ "name": "Meu pacote", "clubs": [ { "id": "flamengo", "name": "Meu Time" } ] }' />
          <div className="un-btns" style={{ flexDirection: 'row', marginTop: 8 }}>
            <button className="btn main" disabled={!text.trim()} onClick={() => add(text)}>Instalar</button>
            <button className="btn" onClick={download}>Baixar modelo</button>
          </div>
          {msg && <p className={`tf-notice ${msg.err ? 'err' : ''}`} role="status" style={{ marginTop: 10 }}>{msg.text}</p>}
        </div>
      </section>
    </Screen>
  );
}

/* ---------------- Créditos ---------------- */

export function Credits({ onBack }: { onBack: () => void }) {
  return (
    <Screen title="Créditos" onBack={onBack}>
      <div className="card center">
        <h2>Vida Real FC</h2>
        <p>O simulador da vida real de um treinador</p>
        <small>Versão {APP_VERSION} · Alpha</small>
      </div>
      <section>
        <h3>Equipe</h3>
        <div className="card cr-list">
          <p><b>Ideia e direção do jogo</b><br />O criador do Vida Real FC</p>
          <p><b>Programação, design e áudio</b><br />Desenvolvido com o Claude, da Anthropic</p>
          <p><b>Música e efeitos sonoros</b><br />Sintetizados dentro do jogo (sem arquivos de terceiros)</p>
        </div>
      </section>
      <section>
        <h3>Avisos</h3>
        <div className="card cr-list">
          <p>Nomes de clubes e ligas são usados de forma descritiva. Os jogadores, elencos, valores e resultados são <b>fictícios</b>.</p>
          <p>Escudos e licenças oficiais podem ser adicionados por pacotes de dados (Mods da Comunidade).</p>
          <p>Comunidade: {COMMUNITY_LINK}</p>
        </div>
      </section>
    </Screen>
  );
}

/* ---------------- Sair ---------------- */

export function ExitScreen({ onBack }: { onBack: () => void }) {
  const [done, setDone] = useState(false);
  const leave = () => {
    setDone(true);
    // no aplicativo Android o plugin de saída encerra o app; no navegador, tenta fechar a aba
    try { (window as unknown as { Capacitor?: { Plugins?: { App?: { exitApp?: () => void } } } }).Capacitor?.Plugins?.App?.exitApp?.(); } catch { /* sem plugin */ }
    window.setTimeout(() => { try { window.close(); } catch { /* ignore */ } }, 300);
  };
  return (
    <Screen title="Sair" onBack={onBack}>
      <div className="card center">
        {!done ? (
          <>
            <h2>Sair do jogo?</h2>
            <p>Sua carreira é salva automaticamente. Você pode continuar de onde parou.</p>
            <button className="primary" onClick={leave}>Sim, sair</button>
            <button className="btn home-lineup" onClick={onBack}>Voltar ao menu</button>
          </>
        ) : (
          <>
            <h2>Até logo! 👋</h2>
            <p>Seu progresso está salvo. Você já pode fechar o aplicativo.</p>
            <button className="btn home-lineup" onClick={onBack}>Voltar ao menu</button>
          </>
        )}
      </div>
    </Screen>
  );
}

/* ---------------- Salão de campeões ---------------- */

/** Campeões de todas as ligas e copas, de todas as carreiras e simulações. */
export function HallScreen({ onBack }: { onBack: () => void }) {
  const [list, setList] = useState<HallEntry[]>(() => loadHall());
  const [mode, setMode] = useState<'todos' | 'carreira' | 'simulacao'>('todos');
  const [ask, setAsk] = useState(false);
  useEffect(() => { setList(loadHall()); }, []);
  const shown = list.filter((e) => mode === 'todos' || e.mode === mode);
  const worlds = [...new Set(shown.map((e) => e.world))];
  return (
    <Screen title="Salão de campeões" onBack={onBack}>
      <div className="chips" role="tablist" aria-label="Modo">
        {([['todos', 'Todos'], ['carreira', 'Carreira'], ['simulacao', 'Simulação']] as const).map(([id, l]) => <button key={id} role="tab" aria-selected={mode === id} className={mode === id ? 'on' : ''} onClick={() => setMode(id)}>{l}</button>)}
      </div>
      {shown.length === 0 && <div className="card center"><p className="hint">Nenhum campeão guardado ainda. Termine temporadas na carreira ou use "Simular Anos".</p></div>}
      {worlds.map((w) => (
        <section key={w}>
          <h3>{w}</h3>
          {shown.filter((e) => e.world === w).map((e) => (
            <div key={e.key} className="card hv-year">
              <b className="hv-head" style={{ display: 'block' }}>Temporada {e.season}</b>
              <ul className="hv-champs">
                {e.divisions.map((d, i) => <li key={i}><span>{d.name}</span><b>🏆 {d.champion}</b></li>)}
                {e.cups.map((c, i) => <li key={`c${i}`} className="cup"><span>{c.icon} {c.name}</span><b>{c.champion}</b></li>)}
              </ul>
              {e.states && e.states.length > 0 && <details className="hv-est"><summary>🏟️ Estaduais ({e.states.length})</summary><ul className="hv-champs">{e.states.map((s, i) => <li key={i}><span>{s.name}</span><b>{s.champion}</b></li>)}</ul></details>}
            </div>
          ))}
        </section>
      ))}
      {list.length > 0 && (!ask ? <button className="btn" onClick={() => setAsk(true)}>🗑️ Apagar o salão</button> : (
        <div className="skip-ask" role="alert"><p>Apagar todos os campeões guardados?</p><button className="primary" onClick={() => { clearHall(); setList([]); setAsk(false); }}>Sim, apagar</button><button className="btn" onClick={() => setAsk(false)}>Cancelar</button></div>
      ))}
    </Screen>
  );
}
