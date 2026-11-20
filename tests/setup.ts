import { installExtras } from '../src/premium/extras';

// Nos testes o jogo roda com todos os recursos (como no Premium). Os testes da fronteira usam `resetHooks()` para simular o jogo grátis.
installExtras();
