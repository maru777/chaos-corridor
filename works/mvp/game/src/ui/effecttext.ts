/**
 * 技の説明は、「効果：」「手番：」「制約：」の 3 行。見出し（ラベル）だけ色を変えて、読みやすくする。
 * 文字列の分解（parseEffect）は、画面に依存しない。fillEffect が、それを画面の部品にする。
 */

export interface EffectLine {
  /** 見出し（効果・手番・制約）。見出しのない行は null */
  readonly label: string | null;
  readonly body: string;
}

const LABELS = ['効果', '手番', '制約'] as const;

export function parseEffect(text: string): EffectLine[] {
  return text.split('\n').map((line): EffectLine => {
    for (const l of LABELS) {
      const head = `${l}：`;
      if (line.startsWith(head)) return { label: l, body: line.slice(head.length) };
    }
    return { label: null, body: line };
  });
}

/** 説明を、見出しに色をつけた行にして、box に入れる。extra は、最後に足す 1 行（例: もう一度タップで使う） */
export function fillEffect(box: HTMLElement, text: string, extra?: string): void {
  box.replaceChildren();
  const lines = parseEffect(text);
  if (extra !== undefined) lines.push({ label: null, body: extra });
  for (const l of lines) {
    const row = document.createElement('span');
    row.className = 'eff-line';
    if (l.label !== null) {
      const tag = document.createElement('b');
      tag.className = 'eff-label';
      tag.textContent = `${l.label}：`;
      row.appendChild(tag);
    }
    row.appendChild(document.createTextNode(l.body));
    box.appendChild(row);
  }
}
