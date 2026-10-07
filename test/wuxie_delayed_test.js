// 回归校验：判定区的延时锦囊在判定前可被【无懈可击】抵消
// 场景1：孙权判定区有【乐不思蜀】且手握【无懈可击】→ 用无懈抵消：无判定、不跳过出牌
// 场景2（对照）：不用无懈 → 正常判定（判定牌非红桃 → 跳过出牌阶段）
const { Game } = require('../engine/game');

const K = (n, s, r) => [n, s, r];
// 牌堆顺序：p0手牌4张、p1手牌4张，然后判定牌从spec[8]开始抽
function makeSpec() {
  return [
    K('无懈可击', '♥', 'A'), K('杀', '♣', '2'), K('杀', '♣', '3'), K('杀', '♣', '4'), // 孙权起手
    K('杀', '♦', '6'), K('杀', '♦', '7'), K('杀', '♦', '8'), K('杀', '♦', '9'),      // 甘宁起手
    K('杀', '♠', '9'),   // 判定牌（黑桃非红桃 → 乐不思蜀生效）
    K('杀', '♠', '9'), K('杀', '♥', '10'), K('杀', '♦', '10'), K('杀', '♠', '7'),
  ];
}

function mkGame(wuxieHolder, logs, abortOn) {
  const g = new Game({
    seed: 5, deck: makeSpec(), generals: ['孙权', '甘宁'], first: 0,
    ask: async (d) => {
      if (d.type === 'wuxie') {
        if (wuxieHolder.id == null) return { kind: 'refuse' };
        return { kind: 'wuxie', cardId: wuxieHolder.id };
      }
      return d.playable[0];
    },
    onEvent: (e) => {
      if (e.type === 'log') {
        logs.push(e.msg);
        if (abortOn && abortOn(e.msg)) g.aborted = true; // 目标事件出现后终止（本测试只关心判定阶段）
      }
    },
  });
  g.setup();
  const leIdx = g.drawPile.findIndex(c => c.name === '乐不思蜀');
  const le = g.drawPile.splice(leIdx, 1)[0]; // 从牌堆移出再置入判定区，避免凭空多一张
  g.players[0].judge.push(le);
  return g;
}

async function main() {
  let pass = 0, fail = 0;
  const check = (label, cond) => { if (cond) { pass++; console.log(`PASS ${label}`); } else { fail++; console.log(`FAIL ${label}`); } };

  // 场景1：用无懈抵消
  {
    const logs = [];
    const holder = { id: null };
    const g = mkGame(holder, logs, l => l.includes('被抵消'));
    const wx = g.players[0].hand.find(c => c.name === '无懈可击');
    if (!wx) throw new Error('孙权起手没有无懈可击');
    holder.id = wx.id;
    await g.run();
    const p0 = g.players[0];
    check('无懈抵消：日志含无懈记录', logs.some(l => l.includes('使用【无懈可击】抵消【乐不思蜀】')));
    check('无懈抵消：无判定发生', !logs.some(l => l.startsWith('孙权 判定【')));
    check('无懈抵消：不跳过出牌阶段', p0.skipPlay === false);
    check('无懈抵消：乐不思蜀进弃牌堆', g.discardPile.some(c => c.name === '乐不思蜀'));
    check('无懈抵消：判定区清空', p0.judge.length === 0);
    check('无懈抵消：牌数守恒154', g.invariant().ok);
  }

  // 场景2（对照）：不使用无懈 → 判定生效
  {
    const logs = [];
    const g = mkGame({ id: null }, logs, l => l.includes('跳过出牌阶段'));
    await g.run();
    const p0 = g.players[0];
    check('对照：正常判定发生', logs.some(l => l.startsWith('孙权 判定【乐不思蜀】')));
    check('对照：判定牌非红桃 → 跳过出牌阶段', p0.skipPlay === true && logs.some(l => l.includes('跳过出牌阶段')));
    check('对照：乐不思蜀进弃牌堆', g.discardPile.some(c => c.name === '乐不思蜀'));
  }

  console.log(`结果：${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
