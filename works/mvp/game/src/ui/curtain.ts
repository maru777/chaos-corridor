/**
 * 場面の切り替え。急に切り替えず、いったん暗転（フェード）してから、赤い線を引いた幕が、斜めに「シュッ！」と抜けて、次の場面が出る。
 * cover → （幕の裏で場面を入れ替える）→ reveal の順。cover したままなら、次の場面も、そのまま入れ替えられる。
 */

const COVER_MS = 340;
const REVEAL_MS = 460;

function curtainEl(): HTMLElement | null {
  return document.getElementById('curtain');
}

function reduced(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

let covered = false;

export function isCovered(): boolean {
  return covered;
}

/** 画面を暗転させる。すでに暗ければ、すぐ終わる */
export async function coverScreen(): Promise<void> {
  const el = curtainEl();
  if (el === null || covered) return;
  covered = true;
  el.style.visibility = 'visible';
  el.style.pointerEvents = 'auto';
  el.style.transform = 'skewX(-12deg)';
  if (reduced()) {
    el.style.opacity = '1';
    return;
  }
  const anim = el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: COVER_MS, easing: 'ease-in', fill: 'forwards' });
  await anim.finished.catch(() => undefined);
  el.style.opacity = '1';
  anim.cancel();
}

/** 暗転をほどき、幕が斜めに抜けて、場面が出る */
export async function revealScreen(): Promise<void> {
  const el = curtainEl();
  if (el === null || !covered) return;
  if (!reduced()) {
    const anim = el.animate(
      [{ transform: 'translateX(0) skewX(-12deg)' }, { transform: 'translateX(130%) skewX(-12deg)' }],
      { duration: REVEAL_MS, easing: 'cubic-bezier(0.7, 0, 0.2, 1)', fill: 'forwards' },
    );
    await anim.finished.catch(() => undefined);
  }
  el.style.visibility = 'hidden';
  el.style.pointerEvents = 'none';
  el.style.opacity = '0';
  el.style.transform = 'none';
  el.getAnimations().forEach((a) => a.cancel());
  covered = false;
}
