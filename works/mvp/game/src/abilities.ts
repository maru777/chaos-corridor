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
    reading: 'Crimson Return',
    rarity: 'UNCOMMON',
    text: '置いた自分の壁を 1 枚戻す（手番を使う）',
  },
  {
    id: 'jam',
    name: '静寂の電牢',
    reading: 'Silent Cage',
    rarity: 'UNCOMMON',
    text: '相手の次の手番では、壁を置けなくする（手番を使う）',
  },
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
];

export function abilityDef(id: AbilityId): AbilityDef {
  const def = ABILITIES.find((a) => a.id === id);
  if (!def) throw new Error(`未定義の能力: ${id}`);
  return def;
}
