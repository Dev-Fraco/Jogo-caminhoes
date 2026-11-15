import { assetsOf, currentRental } from './assets';
import { chipOf, isInstalled, ownsPhone } from './phone';
import { hasBank } from './bank';
import type { GameState } from './types';

/** Tem onde morar? (casa comprada ou alugada) */
export const hasHome = (g: GameState) => assetsOf(g).houses.length > 0 || !!currentRental(g);
/** Carreira nova sem moradia: não deixa avançar dias nem iniciar partida. */
export const homeBlocked = (g: GameState) => !!g.homeRequired && !hasHome(g);

export interface HousingStep { id: string; icon: string; label: string; hint: string; done: boolean }
/** Passo a passo para conseguir uma casa (tudo precisa ser feito pelo celular). */
export function housingSteps(g: GameState): HousingStep[] {
  const phone = ownsPhone(g);
  const apps = isInstalled(g, 'corretor') && isInstalled(g, 'banco');
  return [
    { id: 'phone', icon: '📱', label: 'Comprar um celular', hint: 'Aba Loja (Mega-zona Luiz): a 1ª compra é em dinheiro.', done: phone },
    { id: 'chip', icon: '💳', label: 'Comprar um chip', hint: 'Na mesma loja. O número recebe o código por SMS para criar contas.', done: !!chipOf(g) },
    { id: 'apps', icon: '🛍️', label: 'Instalar o Corretor de Imóveis e o Banco', hint: 'Loja de Apps do celular (use um Wi-Fi grátis ou dados móveis).', done: apps },
    { id: 'bank', icon: '🏦', label: 'Abrir sua conta no Banco', hint: 'O aluguel e a compra da casa são pagos por Pix.', done: hasBank(g) },
    { id: 'home', icon: '🏠', label: 'Alugar ou comprar uma casa', hint: 'No app Corretor de Imóveis.', done: hasHome(g) },
  ];
}
