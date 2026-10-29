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
    text: '斜めに 1 マス動く（手番を使う）',
  },
  {
    id: 'reclaim',
    name: '煉獄の回帰',
    reading: 'Crimson Recall',
    rarity: 'UNCOMMON',
    text: '置いた自分の壁を 1 枚戻す。鉄壁は戻せない（手番を使う）',
  },
  {
    id: 'jam',
    name: '静寂の電牢',
    reading: 'Silent Cage',
    rarity: 'UNCOMMON',
    text: '相手の次の手番では、壁を置けなくする（手番を使う）',
  },
  // ---- RARE ----
  {
    id: 'leap',
    name: '蒼穹の跳躍',
    reading: 'Azure Leap',
    rarity: 'RARE',
    text: '壁を越えて、まっすぐ 2 マス先へ跳ぶ（手番を使う）',
  },
  {
    id: 'meteor',
    name: '災厄の流星',
    reading: 'Calamity Meteor',
    rarity: 'RARE',
    text: '相手の前のマスに隕石を落とし、相手が 3 回動くまで、そのマスを通行不可にする（手番を使う）',
  },
  {
    id: 'aegis',
    name: '不滅の城壁',
    reading: 'Eternal Aegis',
    rarity: 'RARE',
    text: '自分の壁 1 枚を鉄壁にする。虚無で消されず、回収でも戻せなくなる（手番を使う）',
  },
  // ---- EPIC ----
  {
    id: 'nova',
    name: '星爆の連舞',
    reading: 'Nova Waltz',
    rarity: 'EPIC',
    text: '1 手番に 2 回動く（手番を使う）',
  },
  {
    id: 'void',
    name: '虚無の断罪',
    reading: 'Void Judgment',
    rarity: 'EPIC',
    text: '盤上の壁 1 枚を消す。消した壁は、持ち主の手元に戻る。鉄壁は消せない（手番を使う）',
  },
  {
    id: 'gravity',
    name: '重力の鎖',
    reading: 'Gravity Chain',
    rarity: 'EPIC',
    text: '相手のコマを、ゴールと反対の向きに 1 マス引き戻す。壁・端・コマ・隕石があると使えない（手番を使う）',
  },
  {
    id: 'stasis',
    name: '氷刻の静止',
    reading: 'Frozen Time',
    rarity: 'EPIC',
    text: '相手を 1 手番休ませる。続けて自分がもう一度動く（手番を使う）',
  },
  {
    id: 'triwall',
    name: '三重の結界',
    reading: 'Triple Barrier',
    rarity: 'EPIC',
    text: '1 マス分の短い壁を、3 枚置けるようになる。壁を置くときに、短い壁を選べる（手番を使う）',
  },
  // ---- LEGENDARY ----
  {
    id: 'chaos',
    name: '混沌の創世',
    reading: 'Chaos Genesis',
    rarity: 'LEGENDARY',
    text: '盤上の壁（鉄壁以外）を、すべてランダムに置き直す。どちらのコマにも、ゴールへの道は残る（手番を使う）',
  },
  {
    id: 'invert',
    name: '天地の逆転',
    reading: 'Inverted World',
    rarity: 'LEGENDARY',
    text: '盤を 180 度回す。壁と隕石は反転し、コマは、位置を入れ替える（手番を使う）',
  },
];

export function abilityDef(id: AbilityId): AbilityDef {
  const def = ABILITIES.find((a) => a.id === id);
  if (!def) throw new Error(`未定義の能力: ${id}`);
  return def;
}
