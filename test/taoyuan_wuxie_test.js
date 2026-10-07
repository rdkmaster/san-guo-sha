// 回归校验：桃园结义是多目标锦囊，无懈可击只能抵消对一名角色的效果
// 场景1：孙权(2/4)使用桃园结义，甘宁(3/4)用无懈只抵消孙权的回复 → 甘宁正常回满，孙权不回
// 场景2（对照）：无人用无懈 → 双方各回1点
const { Game } = require('../engine/game');

const K = (n, s, r) => [n, s, r];
function makeSpec(withWuxie) {
  return [
    K('桃园结义', '♥', 'A'), K('杀', '♣', '2'), K('杀', '♣', '3'), K('杀', '♣', '4'), // 孙权起手
    ...(withWuxie
      ? [K('无懈可击', '♠', 'J'), K('杀', '♦', '6'), K('杀', '♦', '7'), K('杀', '♦', '8')] // 甘宁起手（带无懈）
      : [K('杀', '♦', '6'), K('杀', '♦', '7'), K('杀', '♦', '8'), K('杀', '♦', '9')]),
    K('杀', '♠', '9'), K('杀', '♥', '10'), K('杀', '♦', '10'), K('杀', '♠', '7'),
  ];
}

function mkGame(withWuxie, logs) {
  const g = new Game({
    seed: 33, deck: makeSpec(withWuxie), generals: ['孙权', '甘宁'], first: 0,
    ask: async (d) => {
      const q = {
        '0:play': [
          () => {
            g.players[0].hp = 2; // 双方掉血铺垫
            g.players[1].hp = 3;
            const c = g.players[0].hand.find(x => x.name === '桃园结义');
            return { kind: 'play', cardId: c.id, targets: [] };
          },
          { kind: 'end' },
        ],
        // 甘宁：抵消桃园结义对孙权的回复
        '1:wuxie': [() => { const c = g.players[1].hand.find(x => x.name === '无懈可击'); return { kind: 'wuxie', cardId: c.id }; }],
      }[`${d.playerIdx}:${d.type}`];
      if (q && q.length) { const m = q.shift(); return typeof m === 'function' ? m(d) : m; }
      return d.playable[0];
    },
    onEvent: (e) => {
      if (e.type === 'log') {
        logs.push(e.msg);
        if (e.msg.includes('甘宁 回复1点体力')) g.aborted = true; // 甘宁的回复是最后一步，结算完即收
      }
    },
  });
  g.setup();
  return g;
}

async function main() {
  let pass = 0, fail = 0;
  const check = (label, cond) => { if (cond) { pass++; console.log(`PASS ${label}`); } else { fail++; console.log(`FAIL ${label}`); } };

  // 场景1：甘宁用无懈只抵消孙权的回复
  {
    const logs = [];
    const g = mkGame(true, logs);
    await g.run();
    const p0 = g.players[0], p1 = g.players[1];
    check('无懈抵消了桃园结义对孙权的效果', logs.some(l => l.includes('抵消了【桃园结义】对孙权的效果')));
    check('孙权未回复（仍2/4）', p0.hp === 2);
    check('甘宁正常回复（3→4/4）', p1.hp === 4 && logs.some(l => l === '甘宁 回复1点体力（3→4/4）'));
    check('牌数守恒154', g.invariant().ok);
  }

  // 场景2（对照）：无人用无懈 → 双方各回1点
  {
    const logs = [];
    const g = mkGame(false, logs);
    await g.run();
    const p0 = g.players[0], p1 = g.players[1];
    check('孙权回复（2→3/4）', p0.hp === 3 && logs.some(l => l === '孙权 回复1点体力（2→3/4）'));
    check('甘宁回复（3→4/4）', p1.hp === 4 && logs.some(l => l === '甘宁 回复1点体力（3→4/4）'));
    check('牌数守恒154', g.invariant().ok);
  }

  console.log(`结果：${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
