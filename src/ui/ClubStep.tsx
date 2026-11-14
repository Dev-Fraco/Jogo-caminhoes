import { useMemo, useState } from 'react';
import { ESTADUAIS } from '../data/br_estaduais';
import { getClubs, sortByName, type ClubData } from '../data/clubs';
import { generateSquad } from '../engine/squad';
import { getCountry, getDivision, getLeague } from '../data/world';
import { EXPECTATION_LABEL, formatBudget } from '../newgame/format';
import type { WorldSelection } from '../newgame/state';
import { squadOverall } from '../newgame/squadInfo';
import { ClubBadge } from './ClubBadge';
import './clubstep.css';

const Stars = ({ n }: { n: number }) => (
  <span className="cc-stars" role="img" aria-label={`Reputação ${n} de 5`}>
    {[1, 2, 3, 4, 5].map((i) => <span key={i} className={i <= n ? 'on' : ''}>{i <= n ? '★' : '☆'}</span>)}
  </span>
);

const PinIcon = () => (
  <svg className="cc-ico" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M8 1a5 5 0 0 0-5 5c0 3.6 5 9 5 9s5-5.4 5-9a5 5 0 0 0-5-5Zm0 7a2 2 0 1 1 0-4 2 2 0 0 1 0 4Z" /></svg>
);

const Swatch = ({ club }: { club: ClubData }) => (
  <span className="cc-swatch" role="img" aria-label={`Cores: ${club.primaryColor} e ${club.secondaryColor}`}>
    <i style={{ background: club.primaryColor }} /><i style={{ background: club.secondaryColor }} />
  </span>
);

interface Props {
  world: WorldSelection;
  selected: ClubData | null;
  onSelect: (club: ClubData) => void;
  /** Abre o elenco do clube. `opener` é o botão clicado, para devolver o foco ao fechar. */
  onViewSquad: (club: ClubData, opener: HTMLElement) => void;
}

/** Etapa 3 — Escolha do Clube: grade de cartões com os clubes da divisão escolhida na Etapa 2. */
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const slugOf = (s: string) => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Formulário para criar o seu próprio clube: ele começa pelo estadual do estado escolhido (na Série B, se o estado tiver). */
function CreateClub({ initial, onCreate, onCancel }: { initial: ClubData | null; onCreate: (c: ClubData) => void; onCancel: () => void }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [short, setShort] = useState(initial?.shortName ?? '');
  const [c1, setC1] = useState(initial?.primaryColor ?? '#1e6bff');
  const [c2, setC2] = useState(initial?.secondaryColor ?? '#ffffff');
  const [uf, setUf] = useState(initial?.uf ?? 'SP');
  const [city, setCity] = useState(initial?.city ?? '');
  const [stadium, setStadium] = useState(initial?.stadium ?? '');
  const [err, setErr] = useState<string | undefined>();
  const submit = () => {
    const n = name.trim();
    if (n.length < 2 || n.length > 30) { setErr('O nome do clube deve ter de 2 a 30 letras.'); return; }
    const sh = (short.trim() || n.replace(/[^A-Za-zÀ-ú]/g, '').slice(0, 3)).toUpperCase().slice(0, 3);
    if (sh.length < 2) { setErr('Informe uma sigla de 2 ou 3 letras.'); return; }
    const id = `meu-${slugOf(n)}`;
    const cityName = city.trim() || ESTADUAIS.find((e) => e.uf === uf)?.state || uf;
    onCreate({
      id, name: n, shortName: sh, badge: `assets/badges/${id}.png`, primaryColor: c1, secondaryColor: c2, stadium: stadium.trim() || `Estádio ${cityName}`, city: cityName,
      budget: 1_500_000, boardExpectation: 'mid', reputation: 1, uf, custom: true,
      squad: generateSquad({ id, name: n, short: sh, color: c1, strength: 48 }, 2026),
    });
  };
  return (
    <div className="cc-create" role="group" aria-label="Criar clube">
      <h3>Criar meu clube</h3>
      <label>Nome do clube<input value={name} maxLength={30} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Real Esperança" /></label>
      <label>Sigla (3 letras)<input value={short} maxLength={3} onChange={(e) => setShort(e.target.value.toUpperCase())} placeholder="RES" /></label>
      <div className="cc-colors"><label>Cor 1<input type="color" value={c1} onChange={(e) => setC1(e.target.value)} /></label><label>Cor 2<input type="color" value={c2} onChange={(e) => setC2(e.target.value)} /></label></div>
      <label>Estado do estadual<select value={uf} onChange={(e) => setUf(e.target.value)}>{ESTADUAIS.map((e) => <option key={e.uf} value={e.uf}>{e.state} ({e.uf}){e.clubs.length ? '' : ''}</option>)}</select></label>
      <label>Cidade<input value={city} maxLength={30} onChange={(e) => setCity(e.target.value)} placeholder="Opcional" /></label>
      <label>Estádio<input value={stadium} maxLength={30} onChange={(e) => setStadium(e.target.value)} placeholder="Opcional" /></label>
      <p className="cc-note">Seu clube nasce pequeno (R$ 1,5 mi, elenco fraco) e entra na divisão mais baixa do estadual. Para chegar à Série D, suba no estadual e termine entre os 2 primeiros da Série A estadual.</p>
      {err && <p className="nw-error" role="alert">{err}</p>}
      <div className="cc-actions"><button type="button" className="nw-btn go" onClick={submit}>Criar e escolher</button><button type="button" className="nw-btn" onClick={onCancel}>Cancelar</button></div>
    </div>
  );
}

export function ClubStep({ world, selected, onSelect, onViewSquad }: Props) {
  const estadual = world.divisionId === 'br-estaduais';
  const [uf, setUf] = useState('all');
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const all = useMemo(() => sortByName(getClubs(world.divisionId)), [world.divisionId]);
  const clubs = estadual ? all.filter((c) => (uf === 'all' || c.uf === uf) && (!q || norm(c.name).includes(norm(q)))) : all;
  const country = getCountry(world.countryId);
  const league = getLeague(world.countryId, world.leagueId);
  const division = getDivision(world.countryId, world.leagueId, world.divisionId);

  return (
    <div>
      <p className="cc-context">
        <span aria-hidden="true">{country?.flag}</span> {country?.name} › {league?.name} › <strong>{division?.name}</strong>
        {clubs.length > 0 && <em>{division && clubs.length < division.teams ? `${clubs.length} de ${division.teams} clubes` : `${clubs.length} clubes`}</em>}
      </p>

      {estadual && (
        <div className="cc-estadual">
          <p className="cc-note">Clubes que só jogam estadual começam pelo campeonato do estado e sonham em chegar à Série D. Ou crie o seu.</p>
          {!creating && <button type="button" className="nw-btn go" onClick={() => setCreating(true)}>➕ {selected?.custom ? 'Editar meu clube' : 'Criar meu clube'}</button>}
          {selected?.custom && !creating && <p className="cc-note">Clube criado: <b>{selected.name}</b> ({selected.uf}).</p>}
          {creating && <CreateClub initial={selected?.custom ? selected : null} onCreate={(c) => { onSelect(c); setCreating(false); }} onCancel={() => setCreating(false)} />}
          {!creating && (
            <div className="cc-filters">
              <input type="search" aria-label="Buscar clube" placeholder="Buscar clube" value={q} onChange={(e) => setQ(e.target.value)} />
              <select aria-label="Estado" value={uf} onChange={(e) => setUf(e.target.value)}>
                <option value="all">Todos os estados</option>
                {ESTADUAIS.map((e) => <option key={e.uf} value={e.uf}>{e.state} ({e.uf})</option>)}
              </select>
            </div>
          )}
        </div>
      )}

      {creating ? null : clubs.length === 0 ? (
        <div className="nw-soon">
          <h2>Sem clubes ainda</h2>
          <p className="nw-soon-sub">Os clubes desta divisão ainda não foram cadastrados. Volte e escolha outra divisão.</p>
          <p className="nw-soon-tag">Em breve</p>
        </div>
      ) : (
        <div className="cc-grid" role="radiogroup" aria-label="Clube">
          {clubs.map((c) => (
            <div key={c.id} className="cc-item">
              <label className="cc">
                <input type="radio" name="nw-club" value={c.id} checked={selected?.id === c.id} onChange={() => onSelect(c)} />
                <span className="cc-body">
                  <span className="cc-top">
                    <ClubBadge club={c} size={60} />
                    <span className="cc-title">
                      <span className="cc-name">{c.name}</span>
                      <span className="cc-short">{c.shortName}<Swatch club={c} /></span>
                    </span>
                  </span>
                  <span className="cc-venue"><PinIcon />{c.stadium} · {c.city}</span>
                  <span className="cc-meta">
                    <span className="cc-budget"><small>Orçamento</small>{formatBudget(c.budget)}</span>
                    <span className="cc-budget"><small>Overall</small>{squadOverall(c.squad)}</span>
                    <span className={`cc-exp ${c.boardExpectation}`} title="Meta da diretoria">{EXPECTATION_LABEL[c.boardExpectation]}</span>
                    <Stars n={c.reputation} />
                  </span>
                  <span className="cc-check" aria-hidden="true">✓</span>
                </span>
              </label>
              <button type="button" className="cc-squad-btn" aria-label={`Ver elenco do ${c.name}`} onClick={(e) => onViewSquad(c, e.currentTarget)}>Ver elenco</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
