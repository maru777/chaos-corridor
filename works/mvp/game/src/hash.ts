import type { GameState } from './types';

/** 壁の順番に依存しない、状態の要約値（対人でずれを検出するために毎ターン比べる） */
export function stateHash(state: GameState): string {
  const walls = state.walls
    .map((w) => `${w.o}${w.x},${w.y}${w.half ?? ''}:${w.owner}${w.iron ? '!' : ''}${w.ghost ? '?' : ''}`)
    .sort()
    .join(';');
  const text = [
    state.size,
    state.pawns.map((p) => `${p.x},${p.y}`).join('|'),
    walls,
    state.wallsLeft.join(','),
    state.shortWalls.join(','),
    state.turn,
    state.winner ?? '-',
    state.abilities.map((list) => [...list].sort().join('+')).join('|'),
    state.wallBlocked.map((b) => (b ? 1 : 0)).join(''),
    state.meteors
      .map((m) => `${m.x},${m.y}:${m.victim}:${m.turnsLeft}`)
      .sort()
      .join(';'),
    state.traps
      .map((t) => `${t.x},${t.y}:${t.owner}:${t.kind}:${t.dx ?? ''},${t.dy ?? ''}`)
      .sort()
      .join(';'),
    state.attacks.map((a) => a ?? '-').join('|'),
    state.attackUsed.map((b) => (b ? 1 : 0)).join(''),
    state.skip.join(','),
    state.sealed.map((b) => (b ? 1 : 0)).join(''),
    state.ply,
    state.rngSeed,
  ].join('#');
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
