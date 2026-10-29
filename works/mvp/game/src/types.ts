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
  /**
   * 短い壁（三連壁の能力で置く、1 マス分だけをふさぐ壁）のとき、交点の「どちら側の 1 マスか」（0 か 1）。
   * 指定がなければ、ふつうの壁（2 マス分）。
   * h は列 x + half、v は行 y + half の 1 マスだけをふさぐ。
   */
  readonly half?: 0 | 1;
}

/** 盤に置かれた壁。誰が置いたかを持つ（「回収」で、自分の壁だけを戻せるように） */
export interface Wall extends WallSpec {
  readonly owner: PlayerId;
  /** 鉄壁（能力）で守られた壁。虚無で消されず、回収でも戻せない */
  readonly iron?: boolean;
}

export type AbilityId =
  | 'diagonal'
  | 'reclaim'
  | 'jam'
  | 'leap'
  | 'meteor'
  | 'aegis'
  | 'nova'
  | 'void'
  | 'gravity'
  | 'stasis'
  | 'triwall'
  | 'chaos'
  | 'invert';

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
  /** 短い壁（三連壁の能力）の残り枚数。ふつうの壁の残りとは別 */
  readonly shortWalls: readonly [number, number];
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
  | { readonly type: 'ability'; readonly id: 'meteor' }
  /** 1 手番に 2 回動く。first の 1 回目、second の 2 回目（1 回目でゴールに着くなら、second は要らない） */
  | { readonly type: 'ability'; readonly id: 'nova'; readonly first: Pos; readonly second?: Pos }
  | { readonly type: 'ability'; readonly id: 'void'; readonly wall: WallSpec }
  | { readonly type: 'ability'; readonly id: 'aegis'; readonly wall: WallSpec }
  | { readonly type: 'ability'; readonly id: 'gravity' }
  | { readonly type: 'ability'; readonly id: 'stasis' }
  | { readonly type: 'ability'; readonly id: 'triwall' }
  /** 盤上の壁を、種（seed）で決まる乱数で、すべて置き直す。同じ種なら、同じ結果 */
  | { readonly type: 'ability'; readonly id: 'chaos'; readonly seed: number }
  | { readonly type: 'ability'; readonly id: 'invert' };

export type Action =
  | { readonly type: 'move'; readonly to: Pos }
  | { readonly type: 'wall'; readonly x: number; readonly y: number; readonly o: Orientation; readonly half?: 0 | 1 }
  | AbilityAction;

export type ApplyResult =
  | { readonly ok: true; readonly state: GameState }
  | { readonly ok: false; readonly reason: string };
