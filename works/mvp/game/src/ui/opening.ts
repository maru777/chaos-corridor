/**
 * オープニング（タイトル）の流れ。画面の表示（CSS）は、`#opening` の data-phase で切り替える。
 *   splash（ロゴと「TAP TO START」）→ tap → slam（ロゴが「ドン!!」と落ちる）→ menu（ボタンが出る）→ start → closed
 * 対局中でも、メニューボタンで menu に戻れる（closed → openMenu → menu → resume → closed）。
 * 音は、ユーザーが何かを押してからでないと鳴らせないので、最初は無音のロゴを出し、押されたら、音つきで演出する。
 */

export type OpeningPhase = 'splash' | 'slam' | 'menu' | 'closed';
export type OpeningEvent = 'tap' | 'slamDone' | 'start' | 'resume' | 'openMenu';

/** 演出（slam）の長さ（ミリ秒）。CSS の animation と同じにする */
export const SLAM_MS = 1700;

export function nextPhase(phase: OpeningPhase, event: OpeningEvent): OpeningPhase {
  switch (phase) {
    case 'splash':
      return event === 'tap' ? 'slam' : phase;
    case 'slam':
      return event === 'tap' || event === 'slamDone' ? 'menu' : phase;
    case 'menu':
      return event === 'start' || event === 'resume' ? 'closed' : phase;
    case 'closed':
      return event === 'openMenu' ? 'menu' : phase;
  }
}

/** 対局の相手の選び方 */
export type MatchChoice = { readonly vs: 'local' } | { readonly vs: 'cpu'; readonly level: number }; // 'local'（1 台で二人）は、確認用。メニューには出さない

export interface MenuItem {
  readonly id: 'cpu' | 'resume' | 'codex' | 'rules' | 'restart';
  readonly label: string;
  /** 目立たせるボタン */
  readonly primary: boolean;
}

/** メニューのボタン。始めていなければ「はじめる」、始めていれば「つづける」と「最初からやりなおす」 */
export function menuItems(started: boolean): MenuItem[] {
  return [
    ...(started ? ([{ id: 'resume', label: 'つづける', primary: true }] as const) : []),
    { id: 'cpu', label: started ? 'CPU と新しく対戦' : 'CPU と対戦', primary: !started },
    { id: 'codex', label: '技一覧', primary: false },
    { id: 'rules', label: 'あそびかた', primary: false },
    ...(started ? ([{ id: 'restart', label: '同じ相手で、やりなおす', primary: false }] as const) : []),
  ];
}
