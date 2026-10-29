import type { GameState } from './types';

/** 壁の順番に依存しない、状態の要約値（対人でずれを検出するために毎ターン比べる） */
export function stateHash(state: GameState): string {
  const walls = state.walls
    .map((w) => `${w.o}${w.x},${w.y}`)
    .sort()
    .join(';');
  const text = [
    state.size,
    state.pawns.map((p) => `${p.x},${p.y}`).join('|'),
    walls,
    state.wallsLeft.join(','),
    state.turn,
    state.winner ?? '-',
  ].join('#');
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
