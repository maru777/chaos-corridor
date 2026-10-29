import type { GameState, Pos, WallSpec } from './types';

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
export function isBlocked(walls: readonly WallSpec[], a: Pos, b: Pos): boolean {
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

/**
 * コマを無視して、壁と通行不可のマス（隕石）を避けて、ゴール行に着けるか。
 * blockedCells は、通れないマス（始点は含めない）
 */
export function hasPathToGoal(size: number, walls: readonly WallSpec[], from: Pos, goalY: number, blockedCells: readonly Pos[] = []): boolean {
  const blocked = new Set<number>(blockedCells.map((p) => p.y * size + p.x));
  const seen = new Set<number>([from.y * size + from.x]);
  const queue: Pos[] = [from];
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i] as Pos;
    if (cur.y === goalY) return true;
    for (const d of DIRS) {
      const next = { x: cur.x + d.x, y: cur.y + d.y };
      if (!inBounds(size, next) || isBlocked(walls, cur, next)) continue;
      const key = next.y * size + next.x;
      if (seen.has(key) || blocked.has(key)) continue;
      seen.add(key);
      queue.push(next);
    }
  }
  return false;
}

/** どちらのコマも、ゴールへの道が残っているか。隕石で通れないマス（state.meteors と extraBlocked）も避けて数える */
export function bothHavePath(
  state: Pick<GameState, 'size' | 'pawns' | 'meteors'>,
  walls: readonly WallSpec[],
  extraBlocked: readonly Pos[] = [],
): boolean {
  const blocked = [...state.meteors, ...extraBlocked];
  return (
    hasPathToGoal(state.size, walls, state.pawns[0], goalRow(state.size, 0), blocked) &&
    hasPathToGoal(state.size, walls, state.pawns[1], goalRow(state.size, 1), blocked)
  );
}
