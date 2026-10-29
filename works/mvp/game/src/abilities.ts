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
  /** 漢字の名前 */
  readonly name: string;
  /** 横文字の読み（技名のように添える） */
  readonly reading: string;
  readonly rarity: Rarity;
  readonly text: string;
}

export const ABILITIES: readonly AbilityDef[] = [
  {
    id: 'diagonal',
    name: '斜行',
    reading: 'ダイアゴナル',
    rarity: 'UNCOMMON',
    text: '斜めに 1 マス動く（手番を使う）',
  },
  {
    id: 'reclaim',
    name: '回収',
    reading: 'リクレイム',
    rarity: 'UNCOMMON',
    text: '置いた自分の壁を 1 枚戻す（手番を使う）',
  },
  {
    id: 'jam',
    name: '電波妨害',
    reading: 'ジャミング',
    rarity: 'UNCOMMON',
    text: '相手の次の手番では、壁を置けなくする（手番を使う）',
  },
];

export function abilityDef(id: AbilityId): AbilityDef {
  const def = ABILITIES.find((a) => a.id === id);
  if (!def) throw new Error(`未定義の能力: ${id}`);
  return def;
}
