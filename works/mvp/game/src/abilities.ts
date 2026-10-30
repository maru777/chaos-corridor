import type { AbilityId } from './types';

/** 能力のデータ定義。能力を足すときは、ここに 1 つ足し、rules.ts に効果、tests に単体テストを足す */

export type Rarity = 'UNCOMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';

export const RARITIES: readonly Rarity[] = ['UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY'];

/** ガチャの出やすさ（重み）。レア度が高いほど出にくい */
export const RARITY_WEIGHT: Readonly<Record<Rarity, number>> = {
  UNCOMMON: 46,
  RARE: 31,
  EPIC: 16,
  LEGENDARY: 7,
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
    text: '効果：斜めに 1 マス動く。\n手番：使う。動いたら相手の番。\n制約：斜めの先が盤の内で、障害物がないこと。横→縦、または縦→横の道のどちらかに、障害物がないこと。',
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
    text: '効果：相手が次の番に、壁を置けなくする。動くことだけできる。\n手番：使う。\n制約：相手が、すでに壁を封じられていないこと。',
  },
  {
    id: 'supply',
    name: '静寂の補給',
    reading: 'Silent Supply',
    rarity: 'UNCOMMON',
    text: '効果：手元の壁が 1 枚増える。\n手番：使う。\n制約：いつでも使える。',
  },
  {
    id: 'trapBack',
    name: '逆行の罠',
    reading: 'Reverse Snare',
    rarity: 'UNCOMMON',
    text: '効果：空きマスに罠を仕掛ける。相手のコマが踏むと、動く前のマスに戻される。その手番は無駄になる。\n手番：使わない。仕掛けたあとも続けて動けて、相手には知られない。\n制約：コマ・障害物・ほかの罠がないマスであること。罠は相手には見えない。自分のコマは踏んでも何も起きない。',
  },
  {
    id: 'trapConfiscate',
    name: '強奪の罠',
    reading: 'Plunder Snare',
    rarity: 'UNCOMMON',
    text: '効果：空きマスに罠を仕掛ける。相手のコマが踏むと、相手の手元の壁が 1 枚なくなる。\n手番：使わない。仕掛けたあとも続けて動けて、相手には知られない。\n制約：コマ・障害物・ほかの罠がないマスであること。罠は相手には見えない。自分のコマは踏んでも何も起きない。',
  },
  // ---- RARE ----
  {
    id: 'leap',
    name: '蒼穹の跳躍',
    reading: 'Azure Leap',
    rarity: 'RARE',
    text: '効果：障害物を飛び越えて、上下左右のどれかへ、まっすぐ 2 マス先へ跳ぶ。\n手番：使う。\n制約：着地するマスが盤の内で、障害物がなく、そこからゴールへの道が残ること。',
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
  {
    id: 'trapStun',
    name: '氷牢の罠',
    reading: 'Frost Snare',
    rarity: 'RARE',
    text: '効果：空きマスに罠を仕掛ける。相手のコマが踏むと、相手は次の 1 手番を休む。\n手番：使わない。仕掛けたあとも続けて動けて、相手には知られない。\n制約：コマ・障害物・ほかの罠がないマスであること。罠は相手には見えない。自分のコマは踏んでも何も起きない。',
  },
  {
    id: 'trapShove',
    name: '疾風の罠',
    reading: 'Gale Snare',
    rarity: 'RARE',
    text: '効果：空きマスに罠を仕掛け、向きを決める。相手のコマが踏むと、その向きへ最大 2 マス飛ばされる。壁・コマ・障害物の手前で止まる。\n手番：使わない。仕掛けたあとも続けて動けて、相手には知られない。\n制約：コマ・障害物・ほかの罠がないマスであること。罠は相手には見えない。自分のコマは踏んでも何も起きない。',
  },
  {
    id: 'trapSeal',
    name: '封印の罠',
    reading: 'Seal Snare',
    rarity: 'RARE',
    text: '効果：空きマスに罠を仕掛ける。相手のコマが踏むと、相手は次の手番、Skill と WEAPON が使えなくなる。\n手番：使わない。仕掛けたあとも続けて動けて、相手には知られない。\n制約：コマ・障害物・ほかの罠がないマスであること。罠は相手には見えない。自分のコマは踏んでも何も起きない。',
  },
  {
    id: 'rift',
    name: '大地の亀裂',
    reading: 'Earth Rift',
    rarity: 'RARE',
    text: '効果：盤上の壁を 1 枚、縦と横の向きを入れ替える。相手の壁も自分の壁も選べる。\n手番：使う。\n制約：鉄壁でない、ふつうの長さの壁があること。回したあとも、重ならず、どちらにもゴールへの道が残ること。',
  },
  // ---- EPIC ----
  {
    id: 'nova',
    name: '星爆の連舞',
    reading: 'Nova Waltz',
    rarity: 'EPIC',
    text: '効果：1 手番に、ふつうの動きを 2 回する。1 回目でゴールに着けば、その時点で勝ち。\n手番：使う。2 回動いて相手の番。\n制約：1 回目も 2 回目も、ふつうに動ける先であること。',
  },
  {
    id: 'void',
    name: '虚無の断罪',
    reading: 'Void Judgment',
    rarity: 'EPIC',
    text: '効果：盤上の壁を 1 枚消す。相手の壁も自分の壁も選べる。消した壁は、持ち主の手元に戻る。\n手番：使う。\n制約：鉄壁でない壁があること。',
  },
  {
    id: 'gravity',
    name: '重力の鎖',
    reading: 'Gravity Chain',
    rarity: 'EPIC',
    text: '効果：相手のコマを、ゴールと反対の向きに 1 マス引き戻す。\n手番：使う。\n制約：相手がゴール行にいないこと。引き戻す先が盤の内で、障害物がないこと。間の壁も含む。',
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
    text: '効果：1 マス分の短い壁を、3 枚置けるようになる。壁を置くときに、短い壁を選べる。\n手番：使う。この手番には壁は置かない。\n制約：いつでも使える。',
  },
  {
    id: 'trapGhost',
    name: '虚像の壁',
    reading: 'Phantom Wall',
    rarity: 'EPIC',
    text: '効果：手元の壁を 1 枚使って、見えない壁として置く。相手には見えず、相手のコマが壁の周囲 1 マスに入ると姿を現す。2 歩動く Skill などで、入る前にぶつかったときも姿を現し、その手番は無駄になる。\n手番：使わない。置いたあとも続けて動けて、相手には知られない。\n制約：ふつうの壁と同じ置き方ができる場所であること（重ならず、どちらにもゴールへの道が残ること）。',
  },
  {
    id: 'gate',
    name: '転位の門',
    reading: 'Shift Gate',
    rarity: 'EPIC',
    text: '効果：自分のコマが、同じ行の、左右反対側のマスへ跳ぶ。\n手番：使う。\n制約：中央の列にいないこと。跳ぶ先に、相手のコマや障害物がなく、そこからゴールへの道が残ること。',
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
  {
    id: 'seize',
    name: '奪取の手',
    reading: 'Stealing Hand',
    rarity: 'LEGENDARY',
    text: '効果：盤上の相手の壁を 1 枚、自分の壁にする。回収や虚無で、自分の手元に戻せる。\n手番：使う。\n制約：鉄壁でない、相手の壁が見えていること。',
  },
  {
    id: 'thunder',
    name: '天空の雷霆',
    reading: 'Sky Thunder',
    rarity: 'LEGENDARY',
    text: '効果：相手のコマの周り 3×3 の範囲にある、壁・隕石・罠を、すべて壊す。壊した壁は持ち主の手元に戻る。\n手番：使う。\n制約：その範囲に、壊せる物が 1 つ以上あること。鉄壁は壊れない。',
  },
];

/** 罠系の Skill（手番を使わず、演出もなく、使ったことが相手に知られない） */
export const TRAP_SKILLS: ReadonlySet<AbilityId> = new Set<AbilityId>(['trapStun', 'trapBack', 'trapShove', 'trapGhost', 'trapConfiscate', 'trapSeal']);

export function isTrapSkill(id: AbilityId): boolean {
  return TRAP_SKILLS.has(id);
}

export function abilityDef(id: AbilityId): AbilityDef {
  const def = ABILITIES.find((a) => a.id === id);
  if (!def) throw new Error(`未定義の能力: ${id}`);
  return def;
}
