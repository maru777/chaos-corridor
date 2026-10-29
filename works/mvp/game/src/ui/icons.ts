import type { AbilityId } from '../types';

/**
 * 技のアイコン（SVG）。64×64 の中に、黒縁の太い線で描く。
 * 色は、主役の形が `currentColor`（CSS の color で、レア度の色にする）、脇役が白と赤。
 * 外部の画像は使わず、コードで描く。アイコンを足すときは、ここに 1 つ足す（足し忘れは、テストで見つかる）。
 */

const OUT = '#05030f';
const ACC = 'currentColor';
const WHITE = '#fff';
const RED = '#ff4a5e';

/** 黒縁つきの太い線 */
function line(x1: number, y1: number, x2: number, y2: number, w: number, color: string): string {
  const p = `x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke-linecap="round"`;
  return `<line ${p} stroke="${OUT}" stroke-width="${w + 6}"/><line ${p} stroke="${color}" stroke-width="${w}"/>`;
}

/** 黒縁つきの図形（path） */
function shape(d: string, fill: string, sw = 4): string {
  return `<path d="${d}" fill="${fill}" stroke="${OUT}" stroke-width="${sw}" stroke-linejoin="round"/>`;
}

/** 黒縁つきの太い曲線（塗りなし） */
function curve(d: string, w: number, color: string): string {
  return `<path d="${d}" fill="none" stroke="${OUT}" stroke-width="${w + 6}" stroke-linecap="round"/><path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round"/>`;
}

function circle(cx: number, cy: number, r: number, fill: string, sw = 4): string {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${OUT}" stroke-width="${sw}"/>`;
}

function bar(x: number, y: number, w: number, h: number, fill: string, rot = 0): string {
  const t = rot === 0 ? '' : ` transform="rotate(${rot} ${x + w / 2} ${y + h / 2})"`;
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2" fill="${fill}" stroke="${OUT}" stroke-width="4" stroke-linejoin="round"${t}/>`;
}

/** 星形（とげが n 本）の path */
function starPath(cx: number, cy: number, outer: number, inner: number, n: number): string {
  const pts: string[] = [];
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
    pts.push(`${(cx + Math.cos(a) * r).toFixed(1)} ${(cy + Math.sin(a) * r).toFixed(1)}`);
  }
  return `M${pts.join(' L')} Z`;
}

const ICON_BODIES: Readonly<Record<AbilityId, string>> = {
  // 幻影の斜閃: 斜めに走る矢と、残像
  diagonal:
    line(8, 46, 26, 28, 4, WHITE) +
    line(14, 54, 32, 36, 4, WHITE) +
    line(18, 46, 44, 20, 8, ACC) +
    shape('M58 6 L32 12 L52 32 Z', ACC),

  // 煉獄の回帰: 壁に、もどる矢印
  reclaim: bar(10, 42, 44, 12, ACC) + curve('M50 34 C54 10 14 8 16 28', 5, WHITE) + shape('M16 40 L6 26 L26 26 Z', WHITE),

  // 静寂の電牢: 壁に、禁止のしるし
  jam: bar(10, 28, 44, 12, ACC) + circle(32, 34, 23, 'none', 5).replace('stroke="' + OUT + '"', 'stroke="' + RED + '"') + line(16, 18, 48, 50, 5, RED),

  // 蒼穹の跳躍: 壁を、とびこえる弧
  leap: bar(28, 30, 8, 26, ACC) + curve('M8 54 Q32 -4 56 54', 5, WHITE) + shape('M58 56 L44 52 L56 40 Z', WHITE),

  // 災厄の流星: 尾を引く岩
  meteor:
    line(6, 8, 30, 30, 5, RED) +
    line(4, 22, 20, 36, 4, WHITE) +
    line(18, 6, 34, 20, 4, WHITE) +
    shape('M44 22 L56 30 L56 46 L44 56 L30 52 L24 38 L32 26 Z', ACC) +
    circle(42, 38, 3, OUT, 0) +
    circle(50, 46, 2.5, OUT, 0),

  // 不滅の城壁: 盾
  aegis: shape('M32 4 L56 12 L56 32 C56 46 46 54 32 60 C18 54 8 46 8 32 L8 12 Z', ACC) + bar(18, 28, 28, 10, WHITE) + line(32, 14, 32, 48, 4, WHITE),

  // 星爆の連舞: 星のはじけと、二重の矢
  nova: shape(starPath(32, 32, 29, 14, 8), ACC) + shape('M16 24 L28 32 L16 40 Z', WHITE, 3) + shape('M30 24 L42 32 L30 40 Z', WHITE, 3),

  // 虚無の断罪: すいこまれる渦
  void: circle(32, 32, 26, ACC) + circle(32, 32, 17, WHITE) + circle(32, 32, 9, OUT, 0) + bar(44, 8, 14, 6, ACC, 35) + bar(6, 50, 14, 6, ACC, 35),

  // 重力の鎖: 星と、ひきよせる下向きの矢
  gravity: circle(32, 16, 12, ACC) + line(32, 32, 32, 46, 7, WHITE) + shape('M18 44 L46 44 L32 60 Z', WHITE) + line(22, 18, 42, 14, 2, OUT),

  // 氷刻の静止: 砂時計
  stasis:
    shape('M16 6 H48 V12 L38 30 L48 52 V58 H16 V52 L26 30 L16 12 Z', ACC) +
    shape('M22 54 L42 54 L32 40 Z', WHITE, 3) +
    shape('M24 12 L40 12 L32 26 Z', WHITE, 3),

  // 三重の結界: 短い壁が 3 枚
  triwall: bar(6, 40, 22, 10, ACC) + bar(20, 25, 22, 10, WHITE) + bar(34, 10, 22, 10, ACC),

  // 混沌の創世: ばらばらに回る壁
  chaos:
    circle(32, 32, 6, WHITE) +
    bar(6, 12, 20, 8, ACC, -25) +
    bar(38, 6, 20, 8, WHITE, 40) +
    bar(42, 30, 20, 8, ACC, -60) +
    bar(30, 50, 20, 8, WHITE, 15) +
    bar(4, 38, 20, 8, ACC, 70),

  // 天地の逆転: 向かい合う 2 本の回る矢印
  invert:
    curve('M10 30 A22 22 0 0 1 50 20', 6, ACC) +
    shape('M56 14 L56 32 L40 24 Z', ACC) +
    curve('M54 34 A22 22 0 0 1 14 44', 6, WHITE) +
    shape('M8 50 L8 32 L24 40 Z', WHITE),
};

/** 技のアイコンの SVG（文字列）。色は、親要素の color で決まる（currentColor） */
export function abilityIconSvg(id: AbilityId): string {
  return `<svg class="ability-icon" viewBox="0 0 64 64" aria-hidden="true" focusable="false">${ICON_BODIES[id]}</svg>`;
}

/** アイコンがある技の id の一覧（テストで、全部の技にアイコンがあることを確かめる） */
export const ICON_IDS = Object.keys(ICON_BODIES) as AbilityId[];
