import { useState } from 'react';
import { audio } from '../audio/audio';
import { prestigeScore } from '../engine/assets';
import { APP_INFO, canPost, contextOf, fit, fmtCount, growthPct, handleOf, POST_TYPES, postType, publish, socialOf, trendOf, type PostResult, type SocialApp as App } from '../engine/social';
import type { GameState, SocialPost } from '../engine/types';
import { ClubBadge } from './ClubBadge';
import { Face } from './Face';
import { AppTabs } from './AppKit';
import { phoneOf } from '../engine/phone';

interface Props { app: App; game: GameState; onChange: (g: GameState) => void; onHome?: () => void }
type Tab = 'profile' | 'insights' | 'post';

const LAST_LABEL = { win: 'vitória', draw: 'empate', loss: 'derrota' } as const;

/** LinstaGrã e TikiTeko: perfil com seguidores, insights e posts que sobem ou descem os seguidores conforme o momento do time. */
export function SocialApp({ app, game, onChange, onHome }: Props) {
  const info = APP_INFO[app];
  const [tab, setTab] = useState<Tab>('profile');
  const [shown, setShown] = useState<{ post: SocialPost; result: PostResult } | null>(null);
  const [err, setErr] = useState<string | undefined>();
  const p = socialOf(game)[app];
  const club = game.clubs[game.userClubId];
  const growth = growthPct(p);
  const ctx = contextOf(game);
  const prestige = prestigeScore(game);
  const trend = app === 'tikiteko' ? trendOf(game) : null;
  const allowed = POST_TYPES.filter((t) => t.apps.includes(app) && t.id !== 'selfie'); // a selfie é postada pelo app Câmera
  const can = canPost(game, app);

  const doPost = (id: string) => {
    const r = publish(game, app, id);
    if (!r.ok) { setErr(r.error); audio.sfx('error'); return; }
    onChange(r.state); setShown({ post: r.post, result: r.result }); setErr(undefined);
    audio.sfx(r.result.delta >= 0 ? (r.result.viral ? 'goal' : 'notify') : 'error');
  };

  const bell = phoneOf(game).notifications.filter((n) => !n.read).length;
  const change = (t: Tab) => { setTab(t); setShown(null); setErr(undefined); };
  return (
    <>
    <div className={`ph-app-screen so so2 so-${app}`}>
      <div className="so-head">
        <span className="so-logo">{info.icon}</span><b>{info.name}</b>
        {bell > 0 && <span className="so-bell" aria-label={`${bell} notificações`}>🔔<em>{Math.min(bell, 9)}</em></span>}
      </div>
      <div className="so-pills" role="tablist">
        {([['profile', 'Perfil'], ['insights', 'Insights'], ['post', 'Postar']] as const).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => change(id)}>{label}</button>
        ))}
      </div>

      {tab === 'profile' && (
        <>
          <div className="so-profile">
            <span className="so-ring"><Face id={`coach:${game.coach.name}`} age={34} size={64} /></span>
            <div className="grow">
              <b>{game.coach.name} <i className="so-verified" aria-label="Verificado">✔</i></b><small>{handleOf(game)} · Treinador do {club.name}</small>
            </div>
            <ClubBadge club={club} size={54} />
          </div>
          <div className="so-stats">
            <div><b>{p.posts.length}</b><small>Posts</small></div>
            <div><b>{fmtCount(p.followers)}</b><small>Seguidores</small></div>
            <div><b className={growth >= 0 ? 'in' : 'out'}>{growth >= 0 ? '+' : ''}{growth.toFixed(1).replace('.', ',')}%</b><small>Últimas rodadas</small></div>
          </div>
          {ctx.last && <p className={`so-alert ${ctx.last}`}><span aria-hidden="true">📣</span><span>Último jogo: <b>{LAST_LABEL[ctx.last]}</b>{Math.abs(ctx.streak) >= 2 ? ` • sequência de ${Math.abs(ctx.streak)} ${ctx.streak > 0 ? 'vitórias' : 'derrotas'}` : ''}. {ctx.last === 'win' ? 'A torcida está animada!' : ctx.last === 'loss' ? 'Os seguidores estão cobrando.' : ''}</span></p>}
          <div className="bk2-h"><h3>Posts</h3></div>
          {p.posts.length === 0 && (
            <div className="so-empty">
              <span aria-hidden="true">🎬</span>
              <b>Você ainda não postou.</b>
              <p>Toque em "Postar" para criar seu primeiro conteúdo.</p>
              <button className="so-cta" onClick={() => change('post')}>＋ Postar agora</button>
            </div>
          )}
          <ul className="so-posts">{p.posts.slice(0, 10).map((x) => <PostRow key={x.id} p={x} unit={info.unit} />)}</ul>
        </>
      )}

      {tab === 'insights' && (
        <>
          <div className="so-stats">
            <div><b>{fmtCount(p.followers)}</b><small>seguidores</small></div>
            <div><b>{fmtCount(p.posts.reduce((t, x) => t + x.views, 0))}</b><small>visualizações</small></div>
            <div><b>{fmtCount(p.posts.reduce((t, x) => t + x.likes, 0))}</b><small>{info.unit}</small></div>
          </div>
          <h3>Seguidores ao longo das rodadas</h3>
          <Spark values={p.history.map((h) => h.followers)} />
          <h3>Resumo</h3>
          <div className="ph-card">
            <div className="ph-row static"><span className="grow">Crescimento recente</span><b className={growth >= 0 ? 'in' : 'out'}>{growth >= 0 ? '+' : ''}{growth.toFixed(1).replace('.', ',')}%</b></div>
            <div className="ph-row static"><span className="grow">Posts virais</span><b>{p.posts.filter((x) => x.viral).length}</b></div>
            <div className="ph-row static"><span className="grow">Melhor post</span><b>{p.posts.length ? fmtCount(Math.max(...p.posts.map((x) => x.delta))) + ' seg.' : '—'}</b></div>
            <div className="ph-row static"><span className="grow">Engajamento médio</span><b>{p.posts.length ? ((p.posts.reduce((t, x) => t + x.likes, 0) / Math.max(1, p.posts.reduce((t, x) => t + x.views, 0))) * 100).toFixed(1).replace('.', ',') + '%' : '—'}</b></div>
            <div className="ph-row static"><span className="grow">Prestígio dos seus bens</span><b>{prestige}/30</b></div>
            <div className="ph-row static"><span className="grow">Renda de publicidade</span><b>R$ {Math.round(p.adIncome).toLocaleString('pt-BR')}</b></div>
          </div>
          <p className="bk-sub">Contratos de publicidade pagam todo mês, conforme os seguidores, direto na sua conta do Banco.</p>
        </>
      )}

      {tab === 'post' && (
        <>
          {shown ? (
            <div className={`so-result ${shown.result.backlash ? 'bad' : 'good'}`} role="status">
              <span className="so-big">{shown.result.viral ? '🔥' : shown.result.backlash ? '😬' : '👏'}</span>
              <h2>{shown.result.viral ? 'Viralizou!' : shown.result.backlash ? 'A torcida não gostou…' : 'Post publicado!'}</h2>
              <p className={shown.result.delta >= 0 ? 'in' : 'out'}><b>{shown.result.delta >= 0 ? '+' : '−'}{fmtCount(Math.abs(shown.result.delta))} seguidores</b></p>
              <p className="bk-sub">{fmtCount(shown.result.views)} visualizações · {fmtCount(shown.result.likes)} {info.unit}</p>
              <button className="ph-btn pri" onClick={() => { setShown(null); setTab('profile'); }}>Ver perfil</button>
            </div>
          ) : (
            <>
              {trend && <p className="so-trend">🔥 Tendência da semana: <b>{trend.icon} {trend.label}</b> (rende mais)</p>}
              <p className="bk-sub">{can ? 'Escolha o que postar. O resultado depende do momento do time.' : 'Você já postou nesta rodada. Jogue a próxima partida para postar de novo.'}</p>
              <ul className="so-types">
                {allowed.map((t) => {
                  const f = fit(t.kind, ctx.last, prestige);
                  const tone = f.mult > 0.9 ? 'good' : f.mult < 0 ? 'bad' : 'mid';
                  return (
                    <li key={t.id}><button disabled={!can} onClick={() => doPost(t.id)}>
                      <span className="ph-ico big">{t.icon}</span>
                      <span className="grow"><b>{t.label}</b><small>{t.hint}</small></span>
                      <i className={`so-tag ${tone}`}>{tone === 'good' ? 'Bom agora' : tone === 'bad' ? 'Arriscado' : 'Neutro'}</i>
                    </button></li>
                  );
                })}
              </ul>
              {err && <p className="ph-pad-msg err" role="alert">{err}</p>}
            </>
          )}
        </>
      )}
    </div>
    <AppTabs items={[
      { icon: '🏠', label: 'Início', onClick: () => onHome?.() },
      { icon: '📊', label: 'Insights', on: tab === 'insights', onClick: () => change('insights') },
      { icon: '＋', label: 'Postar', center: true, on: tab === 'post', onClick: () => change('post') },
      { icon: '👤', label: 'Perfil', on: tab === 'profile', onClick: () => change('profile') },
    ]} />
    </>
  );
}

function PostRow({ p, unit }: { p: SocialPost; unit: string }) {
  const t = postType(p.type);
  return (
    <li>
      {p.photo ? <img className="so-thumb" src={p.photo} alt="" /> : <span className="ph-ico">{t?.icon ?? '📝'}</span>}
      <span className="grow"><b>{p.text}{p.viral ? ' 🔥' : ''}</b><small>Temp. {p.season}, rodada {p.round} · {fmtCount(p.likes)} {unit}</small></span>
      <b className={p.delta >= 0 ? 'in' : 'out'}>{p.delta >= 0 ? '+' : '−'}{fmtCount(Math.abs(p.delta))}</b>
    </li>
  );
}

/** Gráfico simples de barras com os seguidores. */
function Spark({ values }: { values: number[] }) {
  const max = Math.max(1, ...values), min = Math.min(...values);
  const span = Math.max(1, max - min);
  return (
    <div className="so-spark" role="img" aria-label={`Seguidores: de ${fmtCount(values[0] ?? 0)} para ${fmtCount(values[values.length - 1] ?? 0)}`}>
      {values.map((v, i) => <i key={i} style={{ height: `${20 + ((v - min) / span) * 80}%` }} />)}
    </div>
  );
}
