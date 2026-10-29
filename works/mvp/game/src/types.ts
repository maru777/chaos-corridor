export type PlayerId = 0 | 1;

export interface Pos {
  readonly x: number;
  readonly y: number;
}

/** 'h': 横向きの壁（上下のマスの間）、'v': 縦向きの壁（左右のマスの間）。x, y は 0..size-2 の交点 */
export type Orientation = 'h' | 'v';

/** 壁の位置と向き（置く前の指定や、置けるかの判定に使う） */
export interface WallSpec {
  readonly x: number;
  readonly y: number;
  readonly o: Orientation;
}

/** 盤に置かれた壁。誰が置いたかを持つ（「回収」で、自分の壁だけを戻せるように） */
export interface Wall extends WallSpec {
  readonly owner: PlayerId;
}

export type AbilityId = 'diagonal' | 'reclaim' | 'jam' | 'leap' | 'meteor';

/** 隕石が落ちて、通れなくなったマス。victim（落とされた相手）が turnsLeft 回動くと消える */
export interface Meteor extends Pos {
  readonly victim: PlayerId;
  readonly turnsLeft: number;
}

export interface GameState {
  readonly size: number;
  readonly pawns: readonly [Pos, Pos];
  readonly walls: readonly Wall[];
  readonly wallsLeft: readonly [number, number];
  readonly turn: PlayerId;
  readonly winner: PlayerId | null;
  /** それぞれが持っている、まだ使っていない能力（1 つの能力は 1 局に 1 回） */
  readonly abilities: readonly [readonly AbilityId[], readonly AbilityId[]];
  /** true の人は、自分の次の手番では壁を置けない（電波妨害）。その手番が終わると解ける */
  readonly wallBlocked: readonly [boolean, boolean];
  /** 隕石で通れなくなっているマス（どちらのコマも通れない） */
  readonly meteors: readonly Meteor[];
}

export type AbilityAction =
  | { readonly type: 'ability'; readonly id: 'diagonal'; readonly to: Pos }
  | { readonly type: 'ability'; readonly id: 'reclaim'; readonly wall: WallSpec }
  | { readonly type: 'ability'; readonly id: 'jam' }
  | { readonly type: 'ability'; readonly id: 'leap'; readonly to: Pos }
  | { readonly type: 'ability'; readonly id: 'meteor' };

export type Action =
  | { readonly type: 'move'; readonly to: Pos }
  | { readonly type: 'wall'; readonly x: number; readonly y: number; readonly o: Orientation }
  | AbilityAction;

export type ApplyResult =
  | { readonly ok: true; readonly state: GameState }
  | { readonly ok: false; readonly reason: string };
