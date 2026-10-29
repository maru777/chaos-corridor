import { ABILITIES, RARITIES, RARITY_WEIGHT } from './abilities';
import type { AbilityDef } from './abilities';
import { randomInt } from './rng';
import type { AbilityId } from './types';

/**
 * 能力のガチャ。種つきの乱数だけで決まるので、同じ種なら同じ結果になる（対人で、同じ手札を再現できる）。
 * まずレア度を重みで選び、そのレア度の中から能力を選ぶ。同じ能力は重ならない。
 * 能力がまだ無いレア度は飛ばして、残りで重みを計算し直す。
 */
export function drawAbilities(rng: () => number, count: number, pool: readonly AbilityDef[] = ABILITIES): AbilityId[] {
  const rest = [...pool];
  const out: AbilityId[] = [];
  for (let i = 0; i < count && rest.length > 0; i++) {
    const rarities = RARITIES.filter((r) => rest.some((a) => a.rarity === r));
    const total = rarities.reduce((sum, r) => sum + RARITY_WEIGHT[r], 0);
    let roll = rng() * total;
    let picked = rarities[rarities.length - 1] as (typeof RARITIES)[number];
    for (const r of rarities) {
      roll -= RARITY_WEIGHT[r];
      if (roll < 0) {
        picked = r;
        break;
      }
    }
    const candidates = rest.filter((a) => a.rarity === picked);
    const chosen = candidates[randomInt(rng, candidates.length)] as AbilityDef;
    out.push(chosen.id);
    rest.splice(rest.indexOf(chosen), 1);
  }
  return out;
}
