import { playCoinSfx, playTossResultSfx } from '../view/sfx';
/** コイントスの画面。結果（誰が先手か）は、呼ぶ側が先に決めておく。ここは、見せるだけ */

export interface TossView {
  /** 参加者 A・B の名前（コインの表と裏） */
  readonly a: string;
  readonly b: string;
  /** 先に動く参加者（0 = A、1 = B） */
  readonly first: 0 | 1;
  /** 先手の席の呼び名（例: 先手）と、後手の席の呼び名 */
  readonly firstSeat: string;
  readonly secondSeat: string;
}

/** 結果の文。例: 「あなたが 先手。CPU は 後手」 */
export function tossResultText(v: TossView): string {
  const winner = v.first === 0 ? v.a : v.b;
  const loser = v.first === 0 ? v.b : v.a;
  return `${winner} が ${v.firstSeat}！　${loser} は ${v.secondSeat}`;
}

const SPIN_MS = 2300;

/** 結果を、漫画のコマのように組む: 大きな「先手」の札と、名前の札、あとの人の小さな札 */
function fillResult(box: HTMLElement, v: TossView): void {
  // 自分（参加者 A）から見て、自分が先手か後手かを、いちばん大きく出す（相手が先手、では、ぱっと分かりづらい）
  const mine = v.first === 0 ? v.firstSeat : v.secondSeat;
  const theirs = v.first === 0 ? v.secondSeat : v.firstSeat;
  const mk = (cls: string, text: string) => {
    const e = document.createElement('span');
    e.className = cls;
    const t = document.createElement('b');
    t.textContent = text;
    e.appendChild(t);
    return e;
  };
  const big = mk(`res-first${v.first === 0 ? '' : ' late'}`, mine);
  box.replaceChildren(mk('res-name', `${v.a} は`), big, mk('res-second', `${v.b} は ${theirs}`));
}

/** コインを回して、結果を見せる。タップ（または少し待つ）と終わる。動きを減らす設定のときは、回さずに結果だけ出す */
export function showToss(view: TossView, beforeStart: () => Promise<void> = () => Promise.resolve()): Promise<() => void> {
  const root = document.getElementById('toss');
  const coin = document.getElementById('coin');
  const lift = coin?.parentElement;
  const shadow = document.querySelector('.coin-shadow');
  const faceA = document.getElementById('coin-a');
  const faceB = document.getElementById('coin-b');
  const result = document.getElementById('toss-result');
  const hint = document.getElementById('toss-hint');
  if (!root || !coin || !lift || !shadow || !faceA || !faceB || !result || !hint) return Promise.resolve(() => undefined);
  faceA.textContent = view.a;
  faceB.textContent = view.b;
  result.replaceChildren();
  root.classList.remove('flash');
  result.classList.remove('show');
  hint.hidden = true;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // 表（A）が上で止まるなら 0 度、裏（B）なら 180 度。その前に、何度か回る
  const end = 360 * 5 + (view.first === 0 ? 0 : 180);
  coin.style.setProperty('--end', `${reduce ? (view.first === 0 ? 0 : 180) : end}deg`);
  root.style.setProperty('--spin', `${reduce ? 0 : SPIN_MS}ms`);
  const parts = [coin, lift, shadow];
  for (const e of parts) e.classList.remove('spin');
  root.hidden = false;
  root.classList.remove('enter');
  return beforeStart().then(
    () =>
      new Promise<() => void>((resolve) => {
  root.classList.add('enter');
  if (!reduce) window.setTimeout(() => playCoinSfx(SPIN_MS), 160); // コインが落ちてくる動きに合わせて、はじく音から
  void coin.offsetWidth; // 回転のやり直しのため、再描画させる
  for (const e of parts) e.classList.add('spin');

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      root.removeEventListener('click', onTap);
      resolve(() => {
        root.hidden = true;
      });
    };
    let revealed = false;
    const reveal = () => {
      if (revealed) return;
      revealed = true;
      playTossResultSfx();
      fillResult(result, view);
      result.classList.add('show');
      root.classList.add('flash');
      hint.hidden = false;
      window.setTimeout(finish, 2600);
    };
    const onTap = () => {
      if (revealed) finish();
      else reveal();
    };
    root.addEventListener('click', onTap);
    window.setTimeout(reveal, reduce ? 0 : SPIN_MS + 100);
  }),
  );
}
