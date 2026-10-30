/** コイントスの画面。結果（誰が先手か）は、呼ぶ側が先に決めておく。ここは、見せるだけ */

export interface TossView {
  /** 参加者 A・B の名前（コインの表と裏） */
  readonly a: string;
  readonly b: string;
  /** 先に動く参加者（0 = A、1 = B） */
  readonly first: 0 | 1;
  /** 先手の席の呼び名（例: 先手（黄））と、後手の席の呼び名 */
  readonly firstSeat: string;
  readonly secondSeat: string;
}

/** 結果の文。例: 「あなたが 先手（黄）。CPU は 後手（桃）」 */
export function tossResultText(v: TossView): string {
  const winner = v.first === 0 ? v.a : v.b;
  const loser = v.first === 0 ? v.b : v.a;
  return `${winner} が ${v.firstSeat}！　${loser} は ${v.secondSeat}`;
}

const SPIN_MS = 2300;

/** コインを回して、結果を見せる。タップ（または少し待つ）と終わる。動きを減らす設定のときは、回さずに結果だけ出す */
export function showToss(view: TossView): Promise<void> {
  const root = document.getElementById('toss');
  const coin = document.getElementById('coin');
  const faceA = document.getElementById('coin-a');
  const faceB = document.getElementById('coin-b');
  const result = document.getElementById('toss-result');
  const hint = document.getElementById('toss-hint');
  if (!root || !coin || !faceA || !faceB || !result || !hint) return Promise.resolve();
  faceA.textContent = view.a;
  faceB.textContent = view.b;
  result.textContent = '';
  result.classList.remove('show');
  hint.hidden = true;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // 表（A）が上で止まるなら 0 度、裏（B）なら 180 度。その前に、何度か回る
  const end = 360 * 5 + (view.first === 0 ? 0 : 180);
  coin.style.setProperty('--end', `${reduce ? (view.first === 0 ? 0 : 180) : end}deg`);
  coin.style.setProperty('--spin', `${reduce ? 0 : SPIN_MS}ms`);
  coin.classList.remove('spin');
  root.hidden = false;
  void coin.offsetWidth; // 回転のやり直しのため、再描画させる
  coin.classList.add('spin');

  return new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      root.hidden = true;
      root.removeEventListener('click', onTap);
      resolve();
    };
    let revealed = false;
    const reveal = () => {
      if (revealed) return;
      revealed = true;
      result.textContent = tossResultText(view);
      result.classList.add('show');
      hint.hidden = false;
      window.setTimeout(finish, 2600);
    };
    const onTap = () => {
      if (revealed) finish();
      else reveal();
    };
    root.addEventListener('click', onTap);
    window.setTimeout(reveal, reduce ? 0 : SPIN_MS + 100);
  });
}
