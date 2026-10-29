import type { Rarity } from '../abilities';

/**
 * 技名を声に出す（叫ぶ）。ブラウザの音声読み上げ（Web Speech）を使う。
 * 限界: 声の種類は端末ごとに違い、感情は付けられない。レア度が高いほど、低く・ゆっくり・力強く読ませる。
 * 本物の叫びにするなら、録音した音声ファイルに差し替える（その場合も、ここを置き換えるだけ）。
 */

export interface VoiceParams {
  readonly rate: number;
  readonly pitch: number;
  readonly volume: number;
}

export const VOICE_PARAMS: Readonly<Record<Rarity, VoiceParams>> = {
  UNCOMMON: { rate: 1.0, pitch: 1.1, volume: 0.9 },
  RARE: { rate: 0.95, pitch: 1.0, volume: 0.95 },
  EPIC: { rate: 0.85, pitch: 0.8, volume: 1 },
  LEGENDARY: { rate: 0.72, pitch: 0.55, volume: 1 },
};

/** 日本語の声から、自然に聞こえやすいものを選ぶ（Natural / Online / Neural → Google → その他の順） */
export function pickVoice<T extends { readonly name: string; readonly lang: string }>(voices: readonly T[]): T | undefined {
  const ja = voices.filter((v) => v.lang.toLowerCase().startsWith('ja'));
  return ja.find((v) => /natural|online|neural/i.test(v.name)) ?? ja.find((v) => /google/i.test(v.name)) ?? ja[0];
}

function available(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
}

// 声の一覧は、最初は空のことがある。読み込まれたら保持する
let voices: SpeechSynthesisVoice[] = [];
if (available()) {
  voices = speechSynthesis.getVoices();
  speechSynthesis.addEventListener('voiceschanged', () => {
    voices = speechSynthesis.getVoices();
  });
}

let timer: number | undefined;

export function stopVoice(): void {
  window.clearTimeout(timer);
  if (available()) speechSynthesis.cancel();
}

/** delayMs 後に、text を声に出す（技名が決まる瞬間に合わせる） */
export function shout(text: string, rarity: Rarity, delayMs: number): void {
  if (!available()) return;
  stopVoice();
  timer = window.setTimeout(() => {
    const u = new SpeechSynthesisUtterance(`${text}！`);
    const p = VOICE_PARAMS[rarity];
    u.lang = 'ja-JP';
    u.rate = p.rate;
    u.pitch = p.pitch;
    u.volume = p.volume;
    const voice = pickVoice(voices);
    if (voice) u.voice = voice;
    speechSynthesis.speak(u);
  }, Math.max(0, delayMs));
}
