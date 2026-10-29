import type { AbilityId, GameState, PlayerId } from '../types';

/**
 * 手札の見え方。1 台の画面を 2 人で使うので、相手に手札を見せないための決まり。
 * - 手札は、ふだんは伏せて（裏向きで）、枚数だけ見える。
 * - 手番の人が「手札を見る」を押したときだけ、その人の手札が見える。手番が替わると、また伏せる。
 * - 相手の手札は、ぜったいに見えない（枚数だけ）。
 * - 勝負がついたあとは、両方の手札を見せる（種明かし）。
 * - デバッグ（showAll）のときだけ、すべて見える。
 */

/** 手札の中身。見えないときは null（枚数だけが見える） */
export function visibleCards(state: GameState, player: PlayerId, revealed: boolean, showAll = false): readonly AbilityId[] | null {
  if (state.winner !== null || showAll) return state.abilities[player];
  if (player === state.turn && revealed) return state.abilities[player];
  return null;
}

/** 手札の枚数（相手にも見える） */
export function handCount(state: GameState, player: PlayerId): number {
  return state.abilities[player].length;
}
