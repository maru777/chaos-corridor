import { randomInt } from './rng';
import type { AttackId } from './types';

/**
 * 攻撃技のデータ定義。1 人に 1 つ、公開の状態で持ち、1 局に 1 回、手番を使って撃つ。
 * 攻撃技を足すときは、ここに 1 つ足し、rules.ts の attackOutcome に効果、ui/icons.ts にアイコン、tests に単体テストを足す。
 */
export interface AttackDef {
  readonly id: AttackId;
  readonly name: string;
  readonly reading: string;
  readonly shout?: string;
  /** 効果の説明（Skill と同じ「効果／手番／制約」の 3 行） */
  readonly text: string;
}

export const ATTACKS: readonly AttackDef[] = [
  {
    id: 'atkMeteor',
    name: '終焉の隕石',
    reading: 'Doom Meteor',
    text: '効果：盤全体のランダムな 1 マスに隕石を落とす。そのマスに触れている壁と罠を壊す。コマがいれば、そのコマは 1 回休み（自分のコマでも）。空きマスなら、隕石が残って 3 回動くまで通れない。\n手番：使う。\n制約：落ちる場所は、ゴールへの道を完全にふさがないマスから選ばれる。',
  },
  {
    id: 'atkLaser',
    name: '貫光の裁き',
    reading: 'Piercing Laser',
    text: '効果：横一列か縦一列を選んで撃つ。その列にある壁・隕石・罠を、最大 3 つ壊す（相手の物から先に）。コマには当たらない。\n手番：使う。\n制約：その列に壊せる物があること。鉄壁は壊れない。',
  },
  {
    id: 'atkShock',
    name: '覇王の衝撃',
    reading: 'Tyrant Shock',
    text: '効果：自分のコマの周り 3×3 の範囲にある、壁・隕石・罠を、すべて壊す。自分の進路を開く。\n手番：使う。\n制約：その範囲に、壊せる物があること。鉄壁は壊れない。',
  },
  {
    id: 'atkFreeze',
    name: '絶対零度の刻',
    reading: 'Absolute Zero',
    text: '効果：相手を 2 手番休ませる。\n手番：使う。\n制約：いつでも撃てる。',
  },
  {
    id: 'atkBomb',
    name: '爆炎の絨毯',
    reading: 'Carpet Blast',
    text: '効果：好きなマスを中心にした 3×3 の範囲にある、壁・隕石・罠を、すべて壊す。\n手番：使う。\n制約：その範囲に、壊せる物があること。鉄壁は壊れない。',
  },
  {
    id: 'atkSwarm',
    name: '流星群の宴',
    reading: 'Meteor Swarm',
    text: '効果：盤全体のランダムな 3 マスに隕石を落とす。それぞれ、相手が 3 回動くまで通れない。\n手番：使う。\n制約：落ちる場所は、コマのいないマスで、ゴールへの道を完全にふさがないマスから選ばれる。',
  },
  {
    id: 'atkPlunder',
    name: '略奪の宣告',
    reading: 'Plunder Decree',
    text: '効果：相手の手元の壁を 2 枚、自分の手元に奪う。\n手番：使う。\n制約：相手の手元に、壁が残っていること。',
  },
  {
    id: 'atkSwap',
    name: '運命の交錯',
    reading: 'Crossed Fate',
    text: '効果：自分のコマと相手のコマの位置を入れ替える。\n手番：使う。\n制約：入れ替えて、どちらかがゴール行に着いてしまうときは使えない。入れ替えたあとも、どちらにもゴールへの道が残ること。',
  },
  {
    id: 'atkGale',
    name: '烈風の怒涛',
    reading: 'Raging Gale',
    text: '効果：相手のコマを、ゴールと反対の向きに、最大 2 マス吹き飛ばす（壁・コマ・障害物の手前で止まる）。\n手番：使う。\n制約：相手がゴール行にいないこと。1 マス以上動かせること。',
  },
  {
    id: 'atkMines',
    name: '地雷原の祝祭',
    reading: 'Minefield',
    text: '効果：盤全体のランダムな 3 マスに、ランダムな種類の罠を仕掛ける。罠は相手には見えない。自分のコマは踏んでも何も起きない。\n手番：使う。\n制約：空きマスがあること。',
  },
];

export function attackDef(id: AttackId): AttackDef {
  const def = ATTACKS.find((a) => a.id === id);
  if (!def) throw new Error(`未定義の攻撃技: ${id}`);
  return def;
}

/** 攻撃技の候補の数（この中から 1 つ選ぶ） */
export const ATTACK_OFFERS = 3;

/** 種つきの乱数で、重ならない候補を引く */
export function drawAttackOffers(rng: () => number, count: number = ATTACK_OFFERS): AttackId[] {
  const rest = ATTACKS.map((a) => a.id);
  const out: AttackId[] = [];
  for (let i = 0; i < count && rest.length > 0; i++) out.push(rest.splice(randomInt(rng, rest.length), 1)[0] as AttackId);
  return out;
}
