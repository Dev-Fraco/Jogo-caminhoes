import { priceIndex } from '../engine/economy';
import { formatDay, calOf } from '../engine/calendar';
import { coachMoneyOf, coachSalary, gateOf, nextPayday, payrollOf, setWageCover, WAGE_COVER_OPTIONS, wageCoverOf, wageOf } from '../engine/finance';
import type { GameState, Position } from '../engine/types';
import { formatBudget } from '../newgame/format';
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
      <ScreenTitle icon="💰" title="Finanças" />
      <div className="card center fin-cash">
        <small>Caixa do clube</small>
        <h2 className={budget < 0 ? 'neg' : ''}>{budget < 0 ? '−' : ''}{formatBudget(Math.abs(budget))}</h2>
        {budget < 0 && <p className="hint">⚠️ No vermelho: diretoria e elenco ficam insatisfeitos e você não consegue contratar.</p>}
      </div>

      <section>
        <h3>Inflação</h3>
        <div className="card">
          <div className="row"><span className="grow">Preços acumulados desde o início</span><b>{priceIndex(game) <= 1 ? '0%' : `+${((priceIndex(game) - 1) * 100).toFixed(1).replace('.', ',')}%`}</b></div>
          <div className="row"><span className="grow">Inflação do último ano</span><b>{game.inflation ? `${(game.inflation.rate * 100).toFixed(1).replace('.', ',')}%` : '—'}</b></div>
          <p className="hint">Todo ano os preços de jogadores, salários, bilheteria, receitas e bens (carros, casas, aluguéis) sobem. Contratos, financiamentos e aluguéis já assinados mantêm o valor combinado.</p>
        </div>
      </section>

      <section>
        <h3>Folha de pagamento</h3>
        <div className="card">
          <div className="row"><span className="grow">Salários por ano</span><b>{formatBudget(payroll)}</b></div>
          <div className="row"><span className="grow">Salários dos atletas por mês</span><b>{formatBudget(perMonth)}</b></div>
          <div className="row"><span className="grow">Próximo pagamento (todo dia 5)</span><b>{formatDay(nextPayday(calOf(game).day))}</b></div>
          <div className="row"><span className="grow">Bilheteria por jogo em casa</span><b>{formatBudget(gateOf(game, id))}</b></div>
          <div className="row"><span className="grow">Seu salário (pago pelo clube)</span><b>{formatBudget(coachSalary(game) / 12)}/mês</b></div>
        </div>
      </section>

      <section>
        <h3>Pagar salários do seu bolso</h3>
        <div className="card">
          <div className="row"><span className="grow">Seu dinheiro pessoal</span><b>{formatBudget(wallet)}</b></div>
          <p className="hint">Você recebe o seu salário a cada rodada. Escolha quanto da folha dos atletas você paga com o seu dinheiro; o clube paga o resto. Se o seu dinheiro acabar, o clube volta a pagar tudo.</p>
          <div className="chips" role="radiogroup" aria-label="Parte da folha paga pelo treinador">
            {WAGE_COVER_OPTIONS.map((p) => (
              <button key={p} role="radio" aria-checked={cover === p} className={cover === p ? 'on' : ''} onClick={() => onChange(setWageCover(game, p))}>
                {p === 0 ? 'Clube paga' : `${p}%`}
              </button>
            ))}
          </div>
          {cover > 0 && <p className="hint">Você paga {formatBudget((perMonth * cover) / 100)} por mês.</p>}
        </div>
      </section>

      <section>
        <h3>Balanço da temporada {game.season}</h3>
        <div className="card">
          <div className="row"><span className="grow">Bilheteria</span><b className="pos">+ {formatBudget(ledger.gate)}</b></div>
          <div className="row"><span className="grow">Salários pagos pelo clube</span><b className="neg">− {formatBudget(ledger.wages)}</b></div>
          <div className="row"><span className="grow">Salários pagos por você</span><b>{formatBudget(ledger.coachCover)}</b></div>
          <div className="row"><span className="grow">Seu salário</span><b className="neg">− {formatBudget(ledger.coachSalary)}</b></div>
          <div className="row"><span className="grow">Resultado parcial</span><b className={net < 0 ? 'neg' : 'pos'}>{net < 0 ? '−' : '+'} {formatBudget(Math.abs(net))}</b></div>
          <p className="hint">As receitas de TV, premiações e o acesso são pagos no fim da temporada.</p>
        </div>
      </section>

      <section>
        <h3>Salários do elenco</h3>
        <ul className="list">
          {players.map((p) => (
            <li key={p.id}><div className="row"><span className="grow">{p.name}<small>{POS[p.pos]} · {p.age} anos · overall {p.strength}</small></span><b>{formatBudget(wageOf(game, id, p) / 12)}/mês</b></div></li>
          ))}
        </ul>
      </section>
    </>
  );
}
