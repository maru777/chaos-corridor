import type { GameState, Pos, Wall } from './types';

export const DIRS: readonly Pos[] = [
  { x: 0, y: -1 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 1, y: 0 },
];

export function inBounds(size: number, p: Pos): boolean {
  return p.x >= 0 && p.y >= 0 && p.x < size && p.y < size;
}

/** 隣り合う 2 マスの間が壁でふさがれているか */
export function isBlocked(walls: readonly Wall[], a: Pos, b: Pos): boolean {
  if (a.y === b.y) {
    const wx = Math.min(a.x, b.x);
    return walls.some((w) => w.o === 'v' && w.x === wx && (w.y === a.y || w.y === a.y - 1));
  }
  const wy = Math.min(a.y, b.y);
  return walls.some((w) => w.o === 'h' && w.y === wy && (w.x === a.x || w.x === a.x - 1));
}

/** 先手(0)は下段から上端へ、後手(1)は上段から下端へ向かう */
export function goalRow(size: number, player: 0 | 1): number {
  return player === 0 ? 0 : size - 1;
}

/** コマを無視して、壁だけでゴール行に着けるか */
export function hasPathToGoal(size: number, walls: readonly Wall[], from: Pos, goalY: number): boolean {
  const seen = new Set<number>([from.y * size + from.x]);
  const queue: Pos[] = [from];
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i] as Pos;
    if (cur.y === goalY) return true;
    for (const d of DIRS) {
      const next = { x: cur.x + d.x, y: cur.y + d.y };
      if (!inBounds(size, next) || isBlocked(walls, cur, next)) continue;
      const key = next.y * size + next.x;
      if (seen.has(key)) continue;
      seen.add(key);
      queue.push(next);
    }
  }
  return false;
}

export function bothHavePath(state: Pick<GameState, 'size' | 'pawns'>, walls: readonly Wall[]): boolean {
  return (
    hasPathToGoal(state.size, walls, state.pawns[0], goalRow(state.size, 0)) &&
    hasPathToGoal(state.size, walls, state.pawns[1], goalRow(state.size, 1))
  );
}
