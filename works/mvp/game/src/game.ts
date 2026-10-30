import { drawAttackOffers } from './attacks';
import { drawAbilities } from './gacha';
import { createRng } from './rng';
import { BOARD_SIZE, WALLS_PER_PLAYER, initialState } from './rules';
import type { AbilityId, AttackId, GameState } from './types';

/** 1 人が最初に持つ能力の数 */
export const ABILITIES_PER_PLAYER = 2;

/** 最初に配られる Skill と、攻撃技の候補（種だけで決まる。Skill の配りは、攻撃技の候補に左右されない） */
export function dealGame(seed: number): { abilities: [AbilityId[], AbilityId[]]; offers: [AttackId[], AttackId[]] } {
  const rng = createRng(seed);
  const first = drawAbilities(rng, ABILITIES_PER_PLAYER);
  const second = drawAbilities(rng, ABILITIES_PER_PLAYER);
  const offers0 = drawAttackOffers(rng);
  const offers1 = drawAttackOffers(rng);
  return { abilities: [first, second], offers: [offers0, offers1] };
}

/**
 * 新しい対局。種（シード）だけで、両者の最初の能力が決まる。
 * 対人では、種を両者で共有すれば、同じ初期状態を作れる。
 * attacks は、それぞれが選んだ攻撃技（攻撃技なしの設定のときは、両方 null）。
 */
export function newGame(seed: number, attacks: readonly [AttackId | null, AttackId | null] = [null, null]): GameState {
  const { abilities } = dealGame(seed);
  return initialState(BOARD_SIZE, WALLS_PER_PLAYER, abilities, attacks, seed);
}
