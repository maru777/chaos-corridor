import { createRng } from './rng';

/**
 * 先手・後手を決めるコイントス。種（シード）だけで決まるので、対人では、種を共有すれば、両者に同じ結果が出る。
 * 戻り値は、先に動く参加者: 0 = 参加者 A（あなた / プレイヤー1）、1 = 参加者 B（CPU / プレイヤー2）。
 * 手札を配る乱数とは別の流れにしておく（種に定数をまぜる）。
 */
export function tossFirst(seed: number): 0 | 1 {
  const rng = createRng((seed ^ 0x9e3779b9) >>> 0);
  rng(); // 最初の 1 つは、種が近いと似た値になりやすいので捨てる
  return rng() < 0.5 ? 0 : 1;
}

/** 参加者 A の席（0 = 先手・黄、1 = 後手・桃）。コイントスで A が先に動くなら、先手の席に座る */
export function seatOfA(first: 0 | 1): 0 | 1 {
  return first === 0 ? 0 : 1;
}
