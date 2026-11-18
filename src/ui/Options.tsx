import { useEffect, useRef, useState, type ReactNode } from 'react';
import { t, type StringKey } from '../i18n/strings';
import { createBackup, deleteBackup, listBackups, MAX_BACKUPS, restoreBackup, type Backup } from '../settings/backups';
import { DEFAULT_SETTINGS, LANGUAGES, loadSettings, saveSettings, type Graphics, type Language, type Settings, type SimSpeed } from '../settings/settings';

/** Bloco da tela. Novas seções (vídeo, controles, acessibilidade...) são só mais um <Section>. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="opt-section">
      <h3>{title}</h3>
      <div className="opt-card">{children}</div>
    </section>
  );
}

function Slider({ id, label, value, disabled, onChange }: { id: string; label: string; value: number; disabled: boolean; onChange: (v: number) => void }) {
  return (
    <div className={`opt-row ${disabled ? 'off' : ''}`}>
      <label htmlFor={id}>{label}</label>
      <input id={id} type="range" min={0} max={100} step={1} value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} />
      <output htmlFor={id}>{value}</output>
    </div>
  );
}

const SPEEDS: SimSpeed[] = ['slow', 'normal', 'fast'];
const LOCALE: Record<Language, string> = { 'pt-BR': 'pt-BR', en: 'en-US', es: 'es-ES' };

interface Props { onBack: () => void; onRestored: () => void }

export function Options({ onBack, onRestored }: Props) {
  const [saved, setSaved] = useState<Settings>(() => loadSettings()); // último estado salvo
  const [draft, setDraft] = useState<Settings>(saved); // o que está na tela
  const [backups, setBackups] = useState<Backup[]>(() => listBackups());
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [confirm, setConfirm] = useState<{ id: string; kind: 'restore' | 'delete' } | null>(null);
  const timer = useRef<number>();

  const lang = draft.language; // o idioma escolhido traduz a tela na hora, mesmo antes de salvar
  const tr = (k: StringKey, v?: Record<string, string | number>) => t(lang, k, v);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  const say = (text: string, error = false) => {
    setMsg({ text, error });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMsg(null), 3500);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const set = (patch: Partial<Settings>) => setDraft((d) => ({ ...d, ...patch }));
  const setAudio = (patch: Partial<Settings['audio']>) => setDraft((d) => ({ ...d, audio: { ...d.audio, ...patch } }));

  const save = () => {
    if (saveSettings(draft)) { setSaved(draft); say(tr('options.saved')); } else say(tr('options.saveError'), true);
  };
  const cancel = () => setDraft(saved);
  const defaults = () => setDraft(structuredClone(DEFAULT_SETTINGS));

  const create = () => {
    const r = createBackup();
    if (r.ok) { setBackups(listBackups()); say(tr('options.backups.created')); return; }
    const key = r.reason === 'no-save' ? 'options.backups.err.nosave' : r.reason === 'limit' ? 'options.backups.err.limit' : 'options.backups.err.storage';
    say(tr(key, { n: MAX_BACKUPS }), true);
  };

  // Restaurar e Excluir pedem uma segunda confirmação na própria tela (o confirm() do navegador não funciona em todos os ambientes).
  const act = (b: Backup, kind: 'restore' | 'delete') => {
    if (confirm?.id !== b.id || confirm.kind !== kind) { setConfirm({ id: b.id, kind }); return; }
    setConfirm(null);
    if (kind === 'delete') { deleteBackup(b.id); setBackups(listBackups()); return; }
    if (restoreBackup(b.id)) { onRestored(); say(tr('options.backups.restored')); } else say(tr('options.backups.err.restore'), true);
  };

  const muted = draft.audio.muted;
  const fmt = (ms: number) => new Date(ms).toLocaleString(LOCALE[lang], { dateStyle: 'short', timeStyle: 'short' });

  return (
    <div className="app">
      <header>
        <div><strong>{tr('options.title')}</strong></div>
        <button className="ghost" onClick={onBack}>{tr('options.back')}</button>
      </header>

      <main className="opt-main">
        <Section title={tr('options.language')}>
          <div className="opt-row">
            <label htmlFor="opt-lang">{tr('options.language.label')}</label>
            <select id="opt-lang" value={draft.language} onChange={(e) => set({ language: e.target.value as Language })}>
              {LANGUAGES.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
            </select>
          </div>
        </Section>

        <Section title={tr('options.game')}>
          <div className="opt-row">
            <label htmlFor="opt-autosave">
              {tr('options.autosave')}
              <small>{tr('options.autosave.hint')}</small>
            </label>
            <input id="opt-autosave" type="checkbox" className="check" checked={draft.autosave} onChange={(e) => set({ autosave: e.target.checked })} />
          </div>
          <div className="opt-row">
            <label htmlFor="opt-speed">{tr('options.speed')}</label>
            <select id="opt-speed" value={draft.simSpeed} onChange={(e) => set({ simSpeed: e.target.value as SimSpeed })}>
              {SPEEDS.map((s) => <option key={s} value={s}>{tr(`options.speed.${s}` as StringKey)}</option>)}
            </select>
          </div>
          <div className="opt-row">
            <label htmlFor="opt-gfx">{tr('options.graphics')}<small>{tr('options.graphics.hint')}</small></label>
            <select id="opt-gfx" value={draft.graphics ?? 'medium'} onChange={(e) => set({ graphics: e.target.value as Graphics })}>
              {(['low', 'medium', 'high'] as const).map((q) => <option key={q} value={q}>{tr(`options.graphics.${q}` as StringKey)}</option>)}
            </select>
          </div>
        </Section>

        <Section title={tr('options.audio')}>
          <Slider id="opt-master" label={tr('options.audio.master')} value={draft.audio.master} disabled={muted} onChange={(v) => setAudio({ master: v })} />
          <Slider id="opt-music" label={tr('options.audio.music')} value={draft.audio.music} disabled={muted} onChange={(v) => setAudio({ music: v })} />
          <Slider id="opt-sfx" label={tr('options.audio.sfx')} value={draft.audio.sfx} disabled={muted} onChange={(v) => setAudio({ sfx: v })} />
          <div className="opt-row">
            <label htmlFor="opt-mute">{tr('options.audio.mute')}</label>
            <input id="opt-mute" type="checkbox" className="check" checked={muted} onChange={(e) => setAudio({ muted: e.target.checked })} />
          </div>
        </Section>

        <Section title={tr('options.backups')}>
          <button className="primary small" onClick={create}>{tr('options.backups.create')}</button>
          {backups.length === 0 ? (
            <p className="opt-empty">{tr('options.backups.none')}</p>
          ) : (
            <ul className="backups">
              {backups.map((b) => (
                <li key={b.id}>
                  <div className="grow">
                    <b>{fmt(b.createdAt)}</b>
                    <small>{tr('options.backups.item', { club: b.clubName, season: b.season, round: b.round })}</small>
                  </div>
                  {(['restore', 'delete'] as const).map((kind) => {
                    const asking = confirm?.id === b.id && confirm.kind === kind;
                    return (
                      <button key={kind} className={`mini ${kind === 'delete' ? 'danger' : ''} ${asking ? 'asking' : ''}`} onClick={() => act(b, kind)}>
                        {asking ? tr('options.backups.confirm') : tr(kind === 'restore' ? 'options.backups.restore' : 'options.backups.delete')}
                      </button>
                    );
                  })}
                  {confirm?.id === b.id && <span className="ask">{tr(confirm.kind === 'restore' ? 'options.backups.confirmRestore' : 'options.backups.confirmDelete')}</span>}
                </li>
              ))}
            </ul>
          )}
        </Section>
      </main>

      <footer className="opt-foot">
        <div className="opt-status" role="status">
          {msg ? <span className={msg.error ? 'err' : 'ok'}>{msg.text}</span> : dirty ? <span>{tr('options.unsaved')}</span> : null}
        </div>
        <div className="opt-actions">
          <button className="btn" onClick={defaults}>{tr('options.defaults')}</button>
          <button className="btn" onClick={cancel} disabled={!dirty}>{tr('options.cancel')}</button>
          <button className="btn main" onClick={save} disabled={!dirty}>{tr('options.save')}</button>
        </div>
      </footer>
    </div>
  );
}
