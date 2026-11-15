import { hashString } from '../engine/rng';

const ADULT = 15, YOUTH = 6;
/** Retrato do jogador: sorteado do conjunto de rostos (sempre o mesmo para o mesmo jogador); jogadores jovens usam rostos de garotos da base. */
export const faceUrl = (id: string, age: number): string => {
  const h = hashString(id);
  return age < 21 ? `assets/faces/y${String((h % YOUTH) + 1).padStart(2, '0')}.jpg` : `assets/faces/a${String((h % ADULT) + 1).padStart(2, '0')}.jpg`;
};

export function Face({ id, age, size = 44 }: { id: string; age: number; size?: number }) {
  return <img className="face" src={faceUrl(id, age)} alt="" width={size} height={size} loading="lazy" draggable={false} style={{ width: size, height: size }} />;
}
