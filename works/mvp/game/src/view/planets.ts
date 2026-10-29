/**
 * 背景に浮かぶ惑星のデータ（宇宙テーマ）。大きさ・色・位置・輪の有無を、ここで決める。
 * 描画は space.ts。惑星を足すときは、ここに 1 つ足すだけ。
 * 位置は、盤から遠い奥（z が小さい）と、盤の下（y が負）に置く。カメラは盤を斜め上から見下ろすので、画面の上のほうに見える。
 */

export type Rgb = readonly [number, number, number];

export interface PlanetRing {
  /** 輪の内側・外側の半径（惑星の半径に対する倍率） */
  readonly inner: number;
  readonly outer: number;
  readonly color: number;
  /** 輪の傾き（ラジアン） */
  readonly tilt: number;
}

export interface PlanetDef {
  readonly name: string;
  readonly radius: number;
  readonly pos: readonly [number, number, number];
  /** 縞の 2 色（0〜1 の RGB）と、縁の光の色 */
  readonly colA: Rgb;
  readonly colB: Rgb;
  readonly rim: Rgb;
  /** 惑星のまわりの暈（ハロ）の色 */
  readonly halo: number;
  /** 縞の細かさ。大きいほど細かい */
  readonly bandFreq: number;
  /** 模様の乱数の種 */
  readonly seed: number;
  /** 自転の速さ（ラジアン/秒） */
  readonly spin: number;
  readonly ring?: PlanetRing;
}

export const PLANETS: readonly PlanetDef[] = [
  {
    name: '橙の大惑星',
    radius: 9,
    pos: [24, -28, -78],
    colA: [0.98, 0.45, 0.2],
    colB: [1.0, 0.82, 0.4],
    rim: [1.0, 0.85, 0.55],
    halo: 0xff9a4a,
    bandFreq: 5.5,
    seed: 3,
    spin: 0.02,
  },
  {
    name: '青桃の惑星',
    radius: 6,
    pos: [-15, -20, -56],
    colA: [0.16, 0.55, 0.95],
    colB: [0.95, 0.45, 0.85],
    rim: [0.55, 0.85, 1.0],
    halo: 0x4a86ff,
    bandFreq: 3.2,
    seed: 1,
    spin: 0.03,
  },
  {
    name: '輪のある惑星',
    radius: 4.6,
    pos: [-34, -24, -84],
    colA: [0.62, 0.4, 0.95],
    colB: [0.95, 0.75, 1.0],
    rim: [0.9, 0.8, 1.0],
    halo: 0xb48cff,
    bandFreq: 4.5,
    seed: 7,
    spin: 0.025,
    ring: { inner: 1.5, outer: 2.35, color: 0xf3d9ff, tilt: 0.5 },
  },
  {
    name: '青緑の小惑星',
    radius: 3.2,
    pos: [7, -17, -44],
    colA: [0.1, 0.8, 0.7],
    colB: [0.7, 1.0, 0.5],
    rim: [0.7, 1.0, 0.9],
    halo: 0x40ffc0,
    bandFreq: 7,
    seed: 5,
    spin: 0.05,
  },
  {
    name: '黄の遠い星',
    radius: 2.4,
    pos: [34, -14, -60],
    colA: [0.95, 0.8, 0.2],
    colB: [1.0, 0.95, 0.6],
    rim: [1.0, 0.95, 0.7],
    halo: 0xffd84a,
    bandFreq: 6,
    seed: 11,
    spin: 0.04,
  },
  {
    name: '赤い月',
    radius: 1.7,
    pos: [-12, -12, -40],
    colA: [0.95, 0.3, 0.4],
    colB: [1.0, 0.65, 0.55],
    rim: [1.0, 0.75, 0.7],
    halo: 0xff5a6a,
    bandFreq: 9,
    seed: 9,
    spin: 0.08,
  },
];
