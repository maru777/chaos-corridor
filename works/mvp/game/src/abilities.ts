import type { AbilityId } from './types';

/** 能力のデータ定義。能力を足すときは、ここに 1 つ足し、rules.ts に効果、tests に単体テストを足す */

export type Rarity = 'UNCOMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';

export const RARITIES: readonly Rarity[] = ['UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY'];

/** ガチャの出やすさ（重み）。レア度が高いほど出にくい */
export const RARITY_WEIGHT: Readonly<Record<Rarity, number>> = {
  UNCOMMON: 60,
  RARE: 28,
  EPIC: 10,
  LEGENDARY: 2,
};

export interface AbilityDef {
  readonly id: AbilityId;
  /** 技名。漫画のような「XXXのYYY」の漢字（厨二感のある名前）。声に出して読み上げる */
  readonly name: string;
  /** 技名に添える、英語 2 語の読み（例: Phantom Slash） */
  readonly reading: string;
  /** 声の読み方を直したいときだけ（漢字の読みが不自然なとき）。ひらがな・カタカナで書く */
  readonly shout?: string;
  readonly rarity: Rarity;
  /** 効果の説明（ゲームの内容が分かるもの） */
  readonly text: string;
}

export const ABILITIES: readonly AbilityDef[] = [
  // ---- UNCOMMON ----
  {
    id: 'diagonal',
    name: '幻影の斜閃',
    reading: 'Phantom Slash',
    rarity: 'UNCOMMON',
    text: '効果：斜めに 1 マス動く。\n手番：使う（動いたら相手の番）。\n制約：斜めの先が盤の内で、障害物がないこと。横→縦、または縦→横の道のどちらかに、障害物がないこと。',
  },
  {
    id: 'reclaim',
    name: '煉獄の回帰',
    reading: 'Crimson Recall',
    rarity: 'UNCOMMON',
    text: '効果：盤上の自分の壁を 1 枚、手元に戻す。\n手番：使う。\n制約：自分が置いた壁があること。鉄壁は戻せない。',
  },
  {
    id: 'jam',
    name: '静寂の電牢',
    reading: 'Silent Cage',
    rarity: 'UNCOMMON',
    text: '効果：相手が次の番に、壁を置けなくする（動くことだけできる）。\n手番：使う。\n制約：相手が、すでに壁を封じられていないこと。',
  },
  // ---- RARE ----
  {
    id: 'leap',
    name: '蒼穹の跳躍',
    reading: 'Azure Leap',
    rarity: 'RARE',
    text: '効果：障害物を飛び越えて、上下左右のどれかへ、まっすぐ 2 マス先へ跳ぶ。\n手番：使う。\n制約：着地するマスが盤の内で、障害物がないこと。',
  },
  {
    id: 'meteor',
    name: '災厄の流星',
    reading: 'Calamity Meteor',
    rarity: 'RARE',
    text: '効果：相手のコマの、ゴール側のすぐ前のマスに隕石を落とす。相手が 3 回動くまで、そのマスは通れない。\n手番：使う。\n制約：相手がゴール行にいないこと。そのマスに、障害物がないこと。落としても、どちらにもゴールへの道が残ること。',
  },
  {
    id: 'aegis',
    name: '不滅の城壁',
    reading: 'Eternal Aegis',
    rarity: 'RARE',
    text: '効果：盤上の自分の壁 1 枚を鉄壁にする。虚無で消されず、回収でも戻せなくなる。\n手番：使う。\n制約：鉄壁でない自分の壁があること。',
  },
  // ---- EPIC ----
  {
    id: 'nova',
    name: '星爆の連舞',
    reading: 'Nova Waltz',
    rarity: 'EPIC',
    text: '効果：1 手番に、ふつうの動きを 2 回する。1 回目でゴールに着けば、その時点で勝ち。\n手番：使う（2 回動いて、相手の番）。\n制約：1 回目も 2 回目も、ふつうに動ける先であること。',
  },
  {
    id: 'void',
    name: '虚無の断罪',
    reading: 'Void Judgment',
    rarity: 'EPIC',
    text: '効果：盤上の壁を 1 枚消す（相手の壁も、自分の壁も）。消した壁は、持ち主の手元に戻る。\n手番：使う。\n制約：鉄壁でない壁があること。',
  },
  {
    id: 'gravity',
    name: '重力の鎖',
    reading: 'Gravity Chain',
    rarity: 'EPIC',
    text: '効果：相手のコマを、ゴールと反対の向きに 1 マス引き戻す。\n手番：使う。\n制約：相手がゴール行にいないこと。引き戻す先が盤の内で、障害物がないこと（間の壁も含む）。',
  },
  {
    id: 'stasis',
    name: '氷刻の静止',
    reading: 'Frozen Time',
    rarity: 'EPIC',
    text: '効果：相手を 1 手番休ませる。\n手番：Skill そのものは手番を使わず、続けて自分がもう一度動ける。\n制約：いつでも使える。',
  },
  {
    id: 'triwall',
    name: '三重の結界',
    reading: 'Triple Barrier',
    rarity: 'EPIC',
    text: '効果：1 マス分の短い壁を、3 枚置けるようになる。壁を置くときに、短い壁を選べる。\n手番：使う（この手番には、壁は置かない）。\n制約：いつでも使える。',
  },
  // ---- LEGENDARY ----
  {
    id: 'chaos',
    name: '混沌の創世',
    reading: 'Chaos Genesis',
    rarity: 'LEGENDARY',
    text: '効果：盤上の壁（鉄壁以外）を、すべてランダムに置き直す。どちらにも、ゴールへの道は残る。\n手番：使う。\n制約：鉄壁でない壁が 1 枚以上あること。',
  },
  {
    id: 'invert',
    name: '天地の逆転',
    reading: 'Inverted World',
    rarity: 'LEGENDARY',
    text: '効果：盤を 180 度回す。壁と隕石は反転し、コマは位置を入れ替える。\n手番：使う。\n制約：いつでも使える。',
  },
];

export function abilityDef(id: AbilityId): AbilityDef {
  const def = ABILITIES.find((a) => a.id === id);
  if (!def) throw new Error(`未定義の能力: ${id}`);
  return def;
}
