export type PlayerId = 0 | 1;

export interface Pos {
  readonly x: number;
  readonly y: number;
}

/** 'h': 横向きの壁（上下のマスの間）、'v': 縦向きの壁（左右のマスの間）。x, y は 0..size-2 の交点 */
export type Orientation = 'h' | 'v';

export interface Wall {
  readonly x: number;
  readonly y: number;
  readonly o: Orientation;
}

export interface GameState {
  readonly size: number;
  readonly pawns: readonly [Pos, Pos];
  readonly walls: readonly Wall[];
  readonly wallsLeft: readonly [number, number];
  readonly turn: PlayerId;
  readonly winner: PlayerId | null;
}

export type Action =
  | { readonly type: 'move'; readonly to: Pos }
  | { readonly type: 'wall'; readonly x: number; readonly y: number; readonly o: Orientation };

export type ApplyResult =
  | { readonly ok: true; readonly state: GameState }
  | { readonly ok: false; readonly reason: string };
