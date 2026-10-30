import type { Rarity } from '../abilities';
import { THUNDER_HITS_MS } from './bolt';
import { MOVE_RECIPES, WALL_RECIPES, pickVariant, pitchJitter, playerPitch } from './sfxrecipes';
import type { SfxRecipe } from './sfxrecipes';

/**
 * 効果音。音の素材は使わず、ブラウザの音声機能で合成する。音量は控えめ。
 * - 能力を使ったとき: レア度が高いほど、長く・厚くなる（playSfx）。
 * - コマの移動・壁を置く: 数種類をランダムに選ぶ。同じ音は続かず、高さを少しずらし、先手と後手で高さを変える
 *   （playMoveSfx / playWallSfx。音の作り方のデータは sfxrecipes.ts）。
 */

let ctx: AudioContext | null = null;
let noiseBuffer: AudioBuffer | null = null;

function getContext(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null;
  if (ctx === null) ctx = new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/**
 * 全部の音が通る出口。軽い残響（リバーブ）と、音量をそろえる圧縮（コンプレッサー）で、ぺらぺらした合成音に、広がりと厚みを足す。
 * 残響の素材は、減衰するノイズをコードで作る（音の素材ファイルは使わない）。
 */
let busNode: GainNode | null = null;

function bus(c: AudioContext): GainNode {
  if (busNode !== null) return busNode;
  const input = c.createGain();
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.knee.value = 12;
  comp.ratio.value = 5;
  comp.attack.value = 0.003;
  comp.release.value = 0.2;
  const reverb = c.createConvolver();
  const len = Math.floor(c.sampleRate * 1.6);
  const ir = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
  }
  reverb.buffer = ir;
  const wet = c.createGain();
  wet.gain.value = 0.28;
  input.connect(comp);
  input.connect(reverb);
  reverb.connect(wet).connect(comp);
  comp.connect(c.destination);
  busNode = input;
  return input;
}

function getNoise(c: AudioContext): AudioBuffer {
  if (noiseBuffer === null) {
    noiseBuffer = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  return noiseBuffer;
}

/** 音の高さを変えながら鳴らす（周波数は from から to へ） */
function tone(c: AudioContext, out: AudioNode, type: OscillatorType, from: number, to: number, start: number, dur: number, vol: number): void {
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(vol, start + Math.min(0.03, dur / 4));
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  // 角のある波（のこぎり・矩形）は、高い成分をやわらげて、耳に刺さらないようにする
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(type === 'sine' ? 12000 : Math.min(9000, Math.max(from, to) * 7), start);
  filter.frequency.exponentialRampToValueAtTime(type === 'sine' ? 12000 : Math.max(500, Math.min(from, to) * 4), start + dur);
  filter.connect(gain).connect(out);
  // 少しずらした 2 つの音を重ねて、厚みを出す（コーラス）。高い音の 2 倍の成分も、少し足す
  const layers: { detune: number; gain: number; mult: number; type: OscillatorType }[] =
    type === 'sine'
      ? [
          { detune: 0, gain: 1, mult: 1, type },
          { detune: 0, gain: 0.22, mult: 2, type },
        ]
      : [
          { detune: -8, gain: 0.6, mult: 1, type },
          { detune: 8, gain: 0.6, mult: 1, type },
        ];
  for (const l of layers) {
    const osc = c.createOscillator();
    const g = c.createGain();
    g.gain.value = l.gain;
    osc.type = l.type;
    osc.detune.value = l.detune;
    osc.frequency.setValueAtTime(from * l.mult, start);
    osc.frequency.exponentialRampToValueAtTime(Math.max(to * l.mult, 1), start + dur);
    osc.connect(g).connect(filter);
    osc.start(start);
    osc.stop(start + dur + 0.05);
  }
}

/** 風を切る音（ノイズの帯域を動かす） */
function whoosh(c: AudioContext, out: AudioNode, from: number, to: number, start: number, dur: number, vol: number): void {
  const src = c.createBufferSource();
  src.buffer = getNoise(c);
  const filter = c.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = 1.2;
  filter.frequency.setValueAtTime(from, start);
  filter.frequency.exponentialRampToValueAtTime(to, start + dur);
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(vol, start + dur * 0.6);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  src.connect(filter).connect(gain).connect(out);
  src.start(start);
  src.stop(start + dur + 0.05);
}

const NOTE = { C4: 261.6, E4: 329.6, G4: 392, C5: 523.3, E5: 659.3, G5: 784, B5: 987.8, C6: 1046.5, E6: 1318.5 };

/** impactSec: 見せ場（衝撃）までの秒数。そこに合わせて低音と和音を鳴らす */
export function playSfx(rarity: Rarity, impactSec: number): void {
  const c = getContext();
  if (c === null) return;
  const master = c.createGain();
  master.gain.value = 0.22;
  master.connect(bus(c));
  const t0 = c.currentTime + 0.02;
  const hit = t0 + impactSec;

  if (rarity === 'UNCOMMON') {
    whoosh(c, master, 600, 3000, t0, impactSec, 0.5);
    tone(c, master, 'triangle', NOTE.G5, NOTE.C6, hit, 0.25, 0.5);
  } else if (rarity === 'RARE') {
    // 水: 水滴（高い音から低い音へ急に落ちる丸い音）と、澄んだ 2 音
    whoosh(c, master, 400, 3000, t0, impactSec, 0.35);
    [0.1, 0.22, 0.34].forEach((dt, i) => tone(c, master, 'sine', 1500 - i * 200, 500, t0 + dt * impactSec * 2, 0.12, 0.5));
    tone(c, master, 'triangle', NOTE.E5, NOTE.E5, hit, 0.5, 0.45);
    tone(c, master, 'triangle', NOTE.B5, NOTE.B5, hit + 0.1, 0.6, 0.4);
  } else if (rarity === 'EPIC') {
    whoosh(c, master, 300, 5000, t0, impactSec, 0.8);
    tone(c, master, 'sine', 90, 38, hit, 0.7, 0.9);
    for (const f of [NOTE.C5, NOTE.E5, NOTE.G5]) tone(c, master, 'sawtooth', f, f, hit, 1.0, 0.12);
    tone(c, master, 'triangle', NOTE.C6, NOTE.C6, hit + 0.15, 0.8, 0.3);
  } else {
    // 雷: 最初に、画面の中央へ落ちる雷が「ドドドン」と 3 発（だんだん強く）。そのあと名前が決まり、長い和音が続く
    THUNDER_HITS_MS.forEach((ms, i) => thunderHit(c, master, t0 + ms / 1000, 0.7 + i * 0.25));
    tone(c, master, 'sine', 80, 30, hit, 0.9, 0.7);
    for (const f of [NOTE.C4, NOTE.E4, NOTE.G4, NOTE.C5, NOTE.G5]) tone(c, master, 'sawtooth', f, f, hit, 2.2, 0.1);
    [NOTE.C6, NOTE.E6, NOTE.G5, NOTE.C6, NOTE.E6].forEach((f, i) => tone(c, master, 'triangle', f, f, hit + 0.2 + i * 0.16, 0.9, 0.3));
  }
}

// 前回鳴らした音の番号（同じ音が続かないように覚えておく）
const lastVariant = { move: -1, wall: -1 };

/** 音の作り方（データ）どおりに鳴らす。pitch は、全体の高さの倍率 */
function playRecipe(c: AudioContext, out: AudioNode, recipe: SfxRecipe, start: number, pitch: number): void {
  for (const v of recipe.voices) {
    const t = start + v.at;
    if (v.kind === 'tone') tone(c, out, v.wave ?? 'sine', v.from * pitch, v.to * pitch, t, v.dur, v.vol);
    else whoosh(c, out, v.from * pitch, v.to * pitch, t, v.dur, v.vol);
  }
}

/**
 * 音を 1 つ選んで鳴らし、その音の名前（擬音。例: コツ）を返す。画面の擬音の文字を、鳴った音に合わせるため。
 * 音が出せない環境でも、選んで名前は返す（文字だけは変わる）。
 */
function playVariant(kind: 'move' | 'wall', recipes: readonly SfxRecipe[], player: 0 | 1): string {
  const index = pickVariant(recipes.length, lastVariant[kind], Math.random);
  lastVariant[kind] = index;
  const recipe = recipes[index];
  if (!recipe) return '';
  const c = getContext();
  if (c !== null) {
    const master = c.createGain();
    master.gain.value = kind === 'wall' ? 0.3 : 0.22;
    master.connect(bus(c));
    playRecipe(c, master, recipe, c.currentTime + 0.005, playerPitch(player) * pitchJitter(Math.random));
  }
  return recipe.name;
}

/** コマが動く音（軽くて短い）。player は、動かした人。鳴らした音の名前を返す */
export function playMoveSfx(player: 0 | 1): string {
  return playVariant('move', MOVE_RECIPES, player);
}

/** 壁を置く音（重くて、衝撃がある）。player は、置いた人。鳴らした音の名前を返す */
export function playWallSfx(player: 0 | 1): string {
  return playVariant('wall', WALL_RECIPES, player);
}

/** 強さの札が、1 枚ずつ、勢いよく出てくるときの、低い「ダン！」（step が進むほど、少し高く、強く） */
export function playThudSfx(step: number): void {
  const c = getContext();
  if (c === null) return;
  const master = c.createGain();
  master.gain.value = 0.34 + Math.min(step, 5) * 0.03;
  master.connect(bus(c));
  const t = c.currentTime + 0.005;
  const base = 78 + step * 7;
  tone(c, master, 'sine', base * 2.2, base * 0.55, t, 0.34, 1.0);
  tone(c, master, 'triangle', base * 1.1, base * 0.5, t, 0.22, 0.5);
  whoosh(c, master, 500, 90, t, 0.1, 0.6);
}

/** タイトルのロゴが「ドン!!」と落ちる音: 風を切る音 → 重い衝撃 → 長い和音ときらめき */
export function playTitleSfx(): void {
  const c = getContext();
  if (c === null) return;
  const master = c.createGain();
  master.gain.value = 0.26;
  master.connect(bus(c));
  const t0 = c.currentTime + 0.02;
  const hit = t0 + 0.38;
  whoosh(c, master, 300, 6000, t0, 0.38, 0.8);
  thunderHit(c, master, hit, 1.1);
  for (const f of [NOTE.C4, NOTE.G4, NOTE.C5, NOTE.E5]) tone(c, master, 'sawtooth', f, f, hit, 1.6, 0.1);
  [NOTE.G5, NOTE.C6, NOTE.E6].forEach((f, i) => tone(c, master, 'triangle', f, f, hit + 0.25 + i * 0.14, 0.7, 0.28));
}

/** 雷が落ちる音: 鋭い破裂（高い帯域のノイズ）→ 重い低音 → 長く尾を引くごろごろ */
function thunderHit(c: AudioContext, out: AudioNode, start: number, vol: number): void {
  whoosh(c, out, 6000, 2000, start - 0.01, 0.12, 1.2 * vol);
  tone(c, out, 'sine', 110, 28, start, 0.7, 1.0 * vol);
  whoosh(c, out, 900, 120, start, 0.7, 0.8 * vol);
}
