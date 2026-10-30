def sub(p, a, b, cnt=1):
    s = open(p, encoding='utf-8').read()
    assert a in s, (p, a[:60])
    open(p, 'w', encoding='utf-8').write(s.replace(a, b, cnt))


p = 'src/main.ts'
sub(p, "function debugGold(delta: number): void {", """/**
 * デバッグ: 相手が技を使ったときの表示を見る。いまの対局の、相手（CPU 戦では CPU）の番にして、本物の手札から、使える技を 1 つ使わせる。
 * 相手の色のカットイン、上のプレイヤーカードで、使った技が表向きになる様子、手番の移りが見られる。
 */
function debugFoeSkill(): void {
  if (busy || state.winner !== null) return;
  const foe: PlayerId = cpuSeat ?? (state.turn === 0 ? 1 : 0);
  const asFoe: GameState = { ...state, turn: foe };
  const acts = legalActions(asFoe).filter((a) => a.type === 'ability');
  if (acts.length === 0) {
    say('相手が、いま使える技がない（もう使い切った、または、条件に合わない）');
    return;
  }
  const act = acts[Math.floor(Math.random() * acts.length)] as Action;
  state = asFoe;
  mode = 'move';
  play(act);
}

function debugGold(delta: number): void {""")
sub(p, "  const forceRow = mkRow([", "  const foeRow = mkRow([['相手が技を使う（本物の手札から）', debugFoeSkill]]);\n  const forceRow = mkRow([")
sub(p, "title('勝敗を、いまの対局につける（CPU 戦で、結果・Gold まで）'), forceRow,", "title('相手が技を使ったときの表示'), foeRow, title('勝敗を、いまの対局につける（CPU 戦で、結果・Gold まで）'), forceRow,")
