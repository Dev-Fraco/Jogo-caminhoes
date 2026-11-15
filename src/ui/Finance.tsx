import { priceIndex } from '../engine/economy';
import { formatDay, calOf } from '../engine/calendar';
import { coachMoneyOf, coachSalary, gateOf, nextPayday, payrollOf, setWageCover, WAGE_COVER_OPTIONS, wageCoverOf, wageOf } from '../engine/finance';
import type { GameState, Position } from '../engine/types';
import { formatBudget } from '../newgame/format';
import { Face } from './Face';
import { ScreenTitle } from './FmParts';

const POS: Record<Position, string> = { GK: 'GOL', DEF: 'DEF', MID: 'MEI', ATT: 'ATA' };

interface Props { game: GameState; onChange: (g: GameState) => void; onBack?: () => void }

/** Finanças: caixa, folha de pagamento, bilheteria, salário do treinador e a opção de pagar os salários do próprio bolso. */
export function Finance({ game, onChange }: Props) {
  const id = game.userClubId;
  const payroll = payrollOf(game, id);
  const perMonth = payroll / 12;
  const cover = wageCoverOf(game);
  const wallet = coachMoneyOf(game);
  const ledger = game.ledger && game.ledger.season === game.season ? game.ledger : { gate: 0, wages: 0, coachCover: 0, coachSalary: 0 };
  const budget = game.budgets[id];
  const players = [...game.teams[id].players].sort((a, b) => wageOf(game, id, b) - wageOf(game, id, a));
  const net = ledger.gate - ledger.wages - ledger.coachSalary;

  return (
    <>
      <ScreenTitle icon="💰" title="Finanças – Salários" />
      <div className="card mk-card fin-top">
        <div><small>Caixa do clube</small><b className={budget < 0 ? 'neg' : ''}>{budget < 0 ? '−' : ''}{formatBudget(Math.abs(budget))}</b></div>
        <div><small>Folha por mês</small><b>{formatBudget(perMonth)}</b></div>
        <div><small>Próx. pagamento</small><b>{formatDay(nextPayday(calOf(game).day))}</b></div>
      </div>
      {budget < 0 && <p className="mk-info neg"><span aria-hidden="true">⚠️</span> No vermelho: diretoria e elenco ficam insatisfeitos e você não consegue contratar.</p>}

      <div className="card mk-card fin-pocket">
        <img className="fin-art" src="assets/ui/salary-clip.jpg" alt="" />
        <div className="fin-pocket-r">
          <b className="fin-h">Pagar salários do seu bolso</b>
          <p>Você recebe o seu salário a cada rodada. Escolha quanto da folha de salários você paga com o seu dinheiro; o clube paga o resto. Se o seu dinheiro acabar, o clube volta a pagar tudo.</p>
        </div>
        <div className="fin-wallet"><span>👛 Seu dinheiro pessoal</span><b>{formatBudget(wallet)}</b></div>
        <div className="mk-presets four" role="radiogroup" aria-label="Parte da folha paga pelo treinador">
          {WAGE_COVER_OPTIONS.map((p) => (
            <button key={p} role="radio" aria-checked={cover === p} className={cover === p ? 'on' : ''} onClick={() => onChange(setWageCover(game, p))}>{p === 0 ? '👥 Clube paga' : `${p}%`}</button>
          ))}
        </div>
        {cover > 0 && <p className="hint" style={{ margin: '8px 0 0' }}>Você paga {formatBudget((perMonth * cover) / 100)} por mês.</p>}
      </div>

      <section className="mk-sec">
        <h3><span aria-hidden="true">📊</span> Balanço da temporada {game.season}</h3>
        <div className="card mk-card fin-bal">
          <img className="fin-art" src="assets/ui/finance-chart.jpg" alt="" />
          <div className="mk-rows">
            <div><span>🎟️ Bilheteria</span><b className="pos">+ {formatBudget(ledger.gate)}</b></div>
            <div><span>👥 Salários pagos pelo clube</span><b className="neg">− {formatBudget(ledger.wages)}</b></div>
            <div><span>👤 Salários pagos por você</span><b>{formatBudget(ledger.coachCover)}</b></div>
            <div><span>👛 Seu salário</span><b className="neg">− {formatBudget(ledger.coachSalary)}</b></div>
            <div><span>📈 Resultado parcial</span><b className={net < 0 ? 'neg' : 'pos'}>{net < 0 ? '−' : '+'} {formatBudget(Math.abs(net))}</b></div>
          </div>
        </div>
        <p className="mk-info"><span aria-hidden="true">ℹ️</span> As receitas de TV, premiações e o acesso são pagos no fim da temporada.</p>
      </section>

      <section className="mk-sec">
        <h3><span aria-hidden="true">🧾</span> Folha e custos</h3>
        <div className="card mk-card">
          <div className="mk-rows">
            <div><span>Salários por ano</span><b>{formatBudget(payroll)}</b></div>
            <div><span>Bilheteria por jogo em casa</span><b>{formatBudget(gateOf(game, id))}</b></div>
            <div><span>Seu salário (pago pelo clube)</span><b>{formatBudget(coachSalary(game) / 12)}/mês</b></div>
            <div><span>Preços acumulados (inflação)</span><b>{priceIndex(game) <= 1 ? '0%' : `+${((priceIndex(game) - 1) * 100).toFixed(1).replace('.', ',')}%`}</b></div>
            <div><span>Inflação do último ano</span><b>{game.inflation ? `${(game.inflation.rate * 100).toFixed(1).replace('.', ',')}%` : '—'}</b></div>
          </div>
          <p className="hint" style={{ margin: '8px 0 0' }}>Todo ano os preços de jogadores, salários, bilheteria e bens sobem. Contratos, financiamentos e aluguéis já assinados mantêm o valor combinado.</p>
        </div>
      </section>

      <section className="mk-sec">
        <h3><span aria-hidden="true">👥</span> Salários do elenco</h3>
        <ul className="fin-list">
          {players.map((p) => (
            <li key={p.id} className="mk-card fin-row">
              <Face id={p.id} age={p.age} size={40} />
              <span className="grow"><b>{p.name}</b><small>{POS[p.pos]} · {p.age} anos · Overall {p.strength}</small></span>
              <span className="fin-pill">💰 {formatBudget(wageOf(game, id, p) / 12)}/mês</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
