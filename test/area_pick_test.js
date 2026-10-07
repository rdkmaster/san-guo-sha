// 回归校验：过河拆桥/顺手牵羊都可处置目标判定区的牌
// 场景1：孙权顺手牵羊，甘宁判定区只有【闪电】→ 可以拿走（曾经的崩溃场景）
// 场景2：孙权过河拆桥，甘宁判定区有【闪电】→ 弃掉
const { Game } = require('../engine/game');

const K = (n, s, r) => [n, s, r];
function makeSpec(name) {
  const trick = name === '过河拆桥' ? K('过河拆桥', '♠', '3') : K('顺手牵羊', '♦', '3');
  return [
    trick, K('杀', '♣', '2'), K('杀', '♣', '3'), K('杀', '♣', '4'), // 孙权起手
    K('杀', '♦', '6'), K('杀', '♦', '7'), K('杀', '♦', '8'), K('杀', '♦', '9'),      // 甘宁起手
    K('杀', '♠', '9'), K('杀', '♥', '10'), K('杀', '♦', '10'), K('杀', '♠', '7'),
  ];
}

// 甘宁判定区置入闪电（从牌堆移出，不凭空复制）；返回引擎实例
function mkGame(cardName, logs) {
  const g = new Game({
    seed: 8, deck: makeSpec(cardName), generals: ['孙权', '甘宁'], first: 0,
    ask: async (d) => {
      const q = {
        '0:play': [
          () => { const c = g.players[0].hand.find(x => x.name === cardName); return { kind: 'play', cardId: c.id, targets: [1] }; },
          { kind: 'end' },
        ],
        '0:choose': [(d2) => {
          const judge = d2.playable.find(m => m.kind === 'chooseArea' && m.area === 'judge');
          return judge || d2.playable[0];
        }, (d2) => {
          const m = d2.playable.find(mv => mv.kind === 'chooseCard');
          return { kind: 'chooseCard', cardId: m.cardId };
        }],
      }[`${d.playerIdx}:${d.type}`];
      if (q && q.length) { const m = q.shift(); return typeof m === 'function' ? m(d) : m; }
      return d.playable[0];
    },
    onEvent: (e) => {
      if (e.type === 'log') {
        logs.push(e.msg);
        if (e.msg.includes('闪电')) g.aborted = true;
      }
    },
  });
  g.setup();
  const idx = g.drawPile.findIndex(c => c.name === '闪电');
  const bolt = g.drawPile.splice(idx, 1)[0];
  g.players[1].judge.push(bolt);
  return g;
}

async function main() {
  let pass = 0, fail = 0;
  const check = (label, cond) => { if (cond) { pass++; console.log(`PASS ${label}`); } else { fail++; console.log(`FAIL ${label}`); } };

  // 场景1：顺手牵羊拿判定区的闪电
  {
    const logs = [];
    const g = mkGame('顺手牵羊', logs);
    await g.run();
    const p0 = g.players[0], p1 = g.players[1];
    check('顺手牵羊：锦囊正常结算', logs.some(l => l.includes('使用【顺手牵羊】')));
    check('顺手牵羊：孙权获得闪电', p0.hand.some(c => c.name === '闪电'));
    check('顺手牵羊：甘宁判定区清空', p1.judge.length === 0);
    check('顺手牵羊：牌数守恒154', g.invariant().ok);
  }

  // 场景2：过河拆桥弃判定区的闪电
  {
    const logs = [];
    const g = mkGame('过河拆桥', logs);
    await g.run();
    const p1 = g.players[1];
    check('过河拆桥：闪电被弃置', g.discardPile.some(c => c.name === '闪电') && p1.judge.length === 0);
    check('过河拆桥：牌数守恒154', g.invariant().ok);
  }

  console.log(`结果：${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
