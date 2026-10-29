import type { Rarity } from '../abilities';

/**
 * 能力を使ったときの効果音。音の素材は使わず、ブラウザの音声機能で合成する。
 * レア度が高いほど、長く・厚くなる。音量は控えめ。
 */

let ctx: AudioContext | null = null;
let noiseBuffer: AudioBuffer | null = null;

function getContext(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null;
  if (ctx === null) ctx = new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
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
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, start);
  osc.frequency.exponentialRampToValueAtTime(Math.max(to, 1), start + dur);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(vol, start + Math.min(0.03, dur / 4));
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(gain).connect(out);
  osc.start(start);
  osc.stop(start + dur + 0.05);
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
  master.connect(c.destination);
  const t0 = c.currentTime + 0.02;
  const hit = t0 + impactSec;

  if (rarity === 'UNCOMMON') {
    whoosh(c, master, 600, 3000, t0, impactSec, 0.5);
    tone(c, master, 'triangle', NOTE.G5, NOTE.C6, hit, 0.25, 0.5);
  } else if (rarity === 'RARE') {
    whoosh(c, master, 400, 4000, t0, impactSec, 0.6);
    tone(c, master, 'triangle', NOTE.E5, NOTE.E5, hit, 0.5, 0.45);
    tone(c, master, 'triangle', NOTE.B5, NOTE.B5, hit + 0.1, 0.6, 0.4);
  } else if (rarity === 'EPIC') {
    whoosh(c, master, 300, 5000, t0, impactSec, 0.8);
    tone(c, master, 'sine', 90, 38, hit, 0.7, 0.9);
    for (const f of [NOTE.C5, NOTE.E5, NOTE.G5]) tone(c, master, 'sawtooth', f, f, hit, 1.0, 0.12);
    tone(c, master, 'triangle', NOTE.C6, NOTE.C6, hit + 0.15, 0.8, 0.3);
  } else {
    // 低いうなりが上がっていき、衝撃で爆発し、長い和音と、きらめく高音が続く
    tone(c, master, 'sawtooth', 55, 220, t0, impactSec, 0.18);
    whoosh(c, master, 200, 7000, t0, impactSec, 1.0);
    tone(c, master, 'sine', 100, 30, hit, 1.1, 1.0);
    whoosh(c, master, 3000, 400, hit, 0.9, 0.9);
    for (const f of [NOTE.C4, NOTE.E4, NOTE.G4, NOTE.C5, NOTE.G5]) tone(c, master, 'sawtooth', f, f, hit, 2.2, 0.1);
    [NOTE.C6, NOTE.E6, NOTE.G5, NOTE.C6, NOTE.E6].forEach((f, i) => tone(c, master, 'triangle', f, f, hit + 0.2 + i * 0.16, 0.9, 0.3));
  }
}
