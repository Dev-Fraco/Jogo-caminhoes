import { useState } from 'react';
import { acceptAnyOffer } from '../engine/abroad';
import { declineOffer, offerClub, resign } from '../engine/jobs';
import { moodLabel } from '../engine/morale';
import type { GameState } from '../engine/types';
import { EXPECTATION_LABEL } from '../newgame/format';
import { ClubBadge } from './ClubBadge';

function Meter({ label, value, note }: { label: string; value: number; note?: string }) {
  const tone = value >= 60 ? 'good' : value >= 40 ? 'mid' : 'bad';
  return (
    <div className="mo">
      <div className="mo-head"><span>{label}</span><b>{moodLabel(value)} <em>{value}</em></b></div>
      <div className="mo-bar" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value} aria-valuetext={`${moodLabel(value)}, ${value} de 100`}>
        <i className={tone} style={{ width: `${value}%` }} />
      </div>
      {note && <small>{note}</small>}
    </div>
  );
}

/** Carreira (na tela do Treinador): propostas de emprego de outros clubes, moral (equipe, dirigentes e torcida) e pedido de demissão.
 *  Estas opções saíram da tela de Início para ela ficar só com o jogo, a escalação, a classificação, as notícias e os resultados. */
export function CareerPanel({ game, onChange }: { game: GameState; onChange: (g: GameState) => void }) {
  const [askLeave, setAskLeave] = useState(false);
  const [askJob, setAskJob] = useState<string | null>(null);
  const m = game.morale, expectation = game.clubs[game.userClubId].boardExpectation;
  return (
    <>
      {(game.jobOffers ?? []).length > 0 && (
        <section>
          <h3>Propostas de emprego</h3>
          <ul className="un-list">
            {(game.jobOffers ?? []).map((o) => {
              const c = offerClub(game, o);
              return (
                <li key={o.clubId} className="un-offer">
                  <ClubBadge club={c} size={40} />
                  <div className="grow"><b>{c.name}</b><small>{o.foreign ? `🌍 ${o.foreign.countryName} · ${o.foreign.leagueName} · ` : ''}Reputação {'★'.repeat(c.reputation)} · meta: {EXPECTATION_LABEL[c.boardExpectation]}</small></div>
                  {askJob === o.clubId ? (
                    <div className="un-btns"><button className="btn main" onClick={() => { const r = acceptAnyOffer(game, o.clubId); if (r.ok) onChange(r.state); setAskJob(null); }}>Confirmar saída</button><button className="btn" onClick={() => setAskJob(null)}>Voltar</button></div>
                  ) : (
                    <div className="un-btns"><button className="btn main" onClick={() => setAskJob(o.clubId)}>Aceitar</button><button className="btn" onClick={() => onChange(declineOffer(game, o.clubId))}>Recusar</button></div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
      <section>
        <h3>Moral</h3>
        <div className="card mo-card">
          <Meter label="Equipe" value={m.team} note="Influencia o desempenho do time em campo." />
          <Meter label="Dirigentes" value={m.board} note={`Meta da diretoria: ${EXPECTATION_LABEL[expectation]}.`} />
          <Meter label="Torcida" value={m.fans} note="Reage aos resultados, principalmente em casa." />
        </div>
      </section>
      <section>
        <h3>Carreira</h3>
        {!askLeave ? <button className="btn" onClick={() => setAskLeave(true)}>🧳 Pedir demissão</button> : (
          <div className="skip-ask" role="alert">
            <p>Pedir demissão do {game.clubs[game.userClubId].name}? Você fica sem clube e sem indenização, mas pode receber propostas de outros clubes.</p>
            <button className="primary" onClick={() => { setAskLeave(false); onChange(resign(game)); }}>Sim, pedir demissão</button>
            <button className="btn" onClick={() => setAskLeave(false)}>Cancelar</button>
          </div>
        )}
      </section>
    </>
  );
}
