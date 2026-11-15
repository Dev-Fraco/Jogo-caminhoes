import { balanceOf } from '../engine/bank';
import { coachLevel, jobsOf } from '../engine/jobs';
import { totalFollowers, fmtCount } from '../engine/social';
import { prestigeScore } from '../engine/assets';
import type { CoachTitle, GameState } from '../engine/types';
import { NATIONALITIES, REPUTATIONS } from '../newgame/state';
import { EXPECTATION_LABEL, formatBudget } from '../newgame/format';
import { ClubBadge } from './ClubBadge';
import { ScreenTitle } from './FmParts';

const KIND: Record<CoachTitle['kind'], { icon: string; label: string }> = {
  liga: { icon: '🏆', label: 'Ligas' }, copa: { icon: '🥇', label: 'Copas' }, continental: { icon: '🌎', label: 'Continentais' }, mundial: { icon: '🌍', label: 'Mundiais' }, estadual: { icon: '🏟️', label: 'Estaduais' },
};

/** Perfil do treinador: nível, clube atual, passagens, títulos e números da carreira (tudo vindo do jogo). */
export function CoachProfile({ game, onNext }: { game: GameState; onNext: (t: 'finance' | 'table' | 'home') => void }) {
  const c = game.coach;
  const nat = NATIONALITIES.find((n) => n.id === c.nationality);
  const rep = REPUTATIONS.find((r) => r.id === c.reputation);
  const level = coachLevel(game);
  const points = game.coachPoints ?? 0;
  const toNext = level >= 6 ? 0 : 25 - (points % 25);
  const club = game.clubs[game.userClubId];
  const spells = jobsOf(game);
  const titles = game.titles ?? [];
  const seasons = game.history.length;
  const best = seasons ? Math.min(...game.history.map((h) => h.userPosition)) : undefined;
  const byKind = (Object.keys(KIND) as CoachTitle['kind'][]).map((k) => ({ k, n: titles.filter((t) => t.kind === k).length })).filter((x) => x.n > 0);

  return (
    <>
      <ScreenTitle icon="🧑‍💼" title="Treinador" />
      <section className="card cp-head">
        <div className="cp-avatar" aria-hidden="true">{c.name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase()}</div>
        <div className="grow"><h2>{c.name}</h2><small>{nat?.label ?? '—'} · {rep?.label ?? '—'}</small></div>
      </section>

      <section className="card cp-level">
        <div className="row"><span className="grow">Nível de treinador</span><b>{level} / 6</b></div>
        <div className="cp-bar" role="progressbar" aria-valuenow={level} aria-valuemin={1} aria-valuemax={6}><i style={{ width: `${(level / 6) * 100}%` }} /></div>
        <small>{level >= 6 ? 'Nível máximo.' : `${points} pontos de carreira · faltam ${toNext} para o próximo nível. Subir de divisão e ganhar títulos dá pontos.`}</small>
      </section>

      <section className="card">
        <h3>Clube atual</h3>
        {game.unemployed ? <p className="hint">Sem clube. Veja as propostas de emprego no Início.</p> : (
          <div className="cp-club"><ClubBadge club={club} size={46} /><div className="grow"><b>{club.name}</b><small>Meta da diretoria: {EXPECTATION_LABEL[club.boardExpectation]} · caixa {formatBudget(game.budgets[game.userClubId])}</small></div></div>
        )}
      </section>

      <section className="fm-strip cp-nums" aria-label="Números da carreira">
        <div><small>Temporadas</small><b>{seasons}</b></div>
        <div><small>Títulos</small><b>{titles.length}</b></div>
        <div><small>Melhor posição</small><b>{best ? `${best}º` : '—'}</b></div>
        <div><small>Seguidores</small><b>{fmtCount(totalFollowers(game))}</b></div>
      </section>

      <section className="card">
        <h3>Títulos</h3>
        {titles.length === 0 ? <p className="hint">Nenhum título ainda.</p> : (
          <>
            <div className="chips">{byKind.map(({ k, n }) => <span key={k} className="fm-chip no-caret">{KIND[k].icon} {KIND[k].label}: {n}</span>)}</div>
            <ul className="list">
              {[...titles].reverse().slice(0, 12).map((t, i) => <li key={i}><div className="row"><span className="grow">{KIND[t.kind].icon} {t.competition}<small>{t.clubName}</small></span><b>{t.season}</b></div></li>)}
            </ul>
          </>
        )}
      </section>

      <section className="card">
        <h3>Passagens por clubes</h3>
        <ul className="list">
          {[...spells].reverse().map((s, i) => {
            const cl = game.clubs[s.clubId];
            return <li key={i}><div className="row"><span className="grow">{cl?.name ?? s.clubId}<small>{s.fromSeason}{s.toSeason ? `–${s.toSeason}` : ' – hoje'}{s.ended ? ` · ${s.ended}` : ''}</small></span></div></li>;
          })}
        </ul>
      </section>

      <section className="card">
        <h3>Patrimônio</h3>
        <div className="row"><span className="grow">Saldo no banco / carteira</span><b>{formatBudget(balanceOf(game))}</b></div>
        <div className="row"><span className="grow">Prestígio (bens)</span><b>{prestigeScore(game)} / 10</b></div>
        <div className="chips"><button className="btn" onClick={() => onNext('finance')}>💰 Finanças</button><button className="btn" onClick={() => onNext('table')}>🏆 Competições</button></div>
      </section>
    </>
  );
}
