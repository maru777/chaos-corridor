import { drawAbilities } from './gacha';
import { createRng } from './rng';
import { BOARD_SIZE, WALLS_PER_PLAYER, initialState } from './rules';
import type { GameState } from './types';

/** 1 人が最初に持つ能力の数 */
export const ABILITIES_PER_PLAYER = 2;

/**
 * 新しい対局。種（シード）だけで、両者の最初の能力が決まる。
 * 対人では、種を両者で共有すれば、同じ初期状態を作れる。
 */
export function newGame(seed: number): GameState {
  const rng = createRng(seed);
  const first = drawAbilities(rng, ABILITIES_PER_PLAYER);
  const second = drawAbilities(rng, ABILITIES_PER_PLAYER);
  return initialState(BOARD_SIZE, WALLS_PER_PLAYER, [first, second]);
}
