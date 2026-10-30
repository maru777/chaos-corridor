p = 'src/main.ts'
s = open(p, encoding='utf-8').read()
marker = "\nrefresh();\n"
i = s.rindex(marker)
add = """
// ボタンの効果音: とじる・戻る = 下がる音、決定・開始（目立つボタン）= 上がる 2 音、ほかは短いピッ（押せないボタンは鳴らさない）
document.addEventListener('click', (e) => {
  const b = (e.target as Element | null)?.closest('button');
  if (!b || b.disabled) return;
  if (b.id.endsWith('-close')) playUiSfx('back');
  else if (b.classList.contains('primary') || b.classList.contains('level-btn') || b.classList.contains('res-btn')) playUiSfx('confirm');
  else playUiSfx('tap');
});
"""
s = s[:i] + add + s[i:]
open(p, 'w', encoding='utf-8').write(s)
