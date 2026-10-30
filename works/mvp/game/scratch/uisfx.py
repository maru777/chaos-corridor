def sub(p, a, b, cnt=1):
    s = open(p, encoding='utf-8').read()
    assert a in s, (p, a[:60])
    open(p, 'w', encoding='utf-8').write(s.replace(a, b, cnt))


sub('src/view/sfx.ts', "/** タイトルのロゴが", """/**
 * メニュー・ボタンの効果音（短く、軽く）。
 * - tap: ふつうのボタン（ピッ）  - confirm: 決定・開始（ピロッ、2 音で上がる）  - back: とじる・戻る（ポッ、下がる）
 */
export type UiSfxKind = 'tap' | 'confirm' | 'back';

export function playUiSfx(kind: UiSfxKind): void {
  const c = getContext();
  if (c === null) return;
  const master = c.createGain();
  master.gain.value = 0.2;
  master.connect(bus(c));
  const t = c.currentTime + 0.003;
  if (kind === 'tap') {
    tone(c, master, 'triangle', 1100, 1700, t, 0.07, 0.8);
    whoosh(c, master, 3000, 1200, t, 0.03, 0.25);
  } else if (kind === 'confirm') {
    tone(c, master, 'triangle', 880, 880, t, 0.09, 0.7);
    tone(c, master, 'triangle', 1320, 1320, t + 0.07, 0.16, 0.8);
    tone(c, master, 'sine', 90, 60, t, 0.1, 0.6);
  } else {
    tone(c, master, 'triangle', 900, 520, t, 0.1, 0.7);
  }
}

/** タイトルのロゴが""")

# main.ts: ボタンを押したとき、全部のボタンで効果音（押せないボタンは鳴らさない）
sub('src/main.ts', "\nrefresh();", """
// ボタンの効果音: とじる・戻る = 下がる音、決定・開始（目立つボタン）= 上がる 2 音、ほかは短いピッ
document.addEventListener('click', (e) => {
  const b = (e.target as Element | null)?.closest('button');
  if (!b || b.disabled) return;
  if (b.id.endsWith('-close')) playUiSfx('back');
  else if (b.classList.contains('primary') || b.classList.contains('level-btn') || b.classList.contains('res-btn')) playUiSfx('confirm');
  else playUiSfx('tap');
});

refresh();""", 1) if False else None
