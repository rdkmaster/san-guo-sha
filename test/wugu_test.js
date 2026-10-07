// 回归校验：五谷丰登的使用者先拿牌（官方规则）
// 场景：孙权使用【五谷丰登】，展示【桃♥5】与【闪♥Q】，孙权先选，甘宁拿剩下的
const { Game } = require('../engine/game');

const K = (n, s, r) => [n, s, r];
const spec = [
  K('五谷丰登', '♥', '3'), K('杀', '♣', '2'), K('杀', '♣', '3'), K('杀', '♣', '4'), // 孙权起手
  K('杀', '♦', '6'), K('杀', '♦', '7'), K('杀', '♦', '8'), K('杀', '♦', '9'),      // 甘宁起手
  K('杀', '♠', '7'),   // t1孙权先手摸1
  K('桃', '♥', '5'), K('闪', '♥', 'Q'), // 五谷展示的两张（紧跟摸牌之后）
  K('杀', '♠', '9'), K('杀', '♥', '10'),
];

let g;
let chooseAskedBy = null; // 五谷选择询问发给了谁
const logs = [];
// 持久队列：只在构建时创建一次，跨询问持续消费
const queue = {
  '0:play': [
    () => { const c = g.players[0].hand.find(x => x.name === '五谷丰登'); return { kind: 'play', cardId: c.id, targets: [] }; },
    { kind: 'end' },
  ],
  '0:choose': [(d2) => {
    const tao = d2.playable.find(m => m.kind === 'chooseCard' && g.findCard(m.cardId)?.card.name === '桃');
    return { kind: 'chooseCard', cardId: (tao || d2.playable[0]).cardId };
  }],
};
const ask = async (d) => {
  if (d.type === 'choose' && chooseAskedBy == null) chooseAskedBy = d.playerIdx; // 记录第一次选择询问（使用者先拿）
  const q = queue[`${d.playerIdx}:${d.type}`];
  if (q && q.length) { const m = q.shift(); return typeof m === 'function' ? m(d) : m; }
  return d.playable[0];
};

async function main() {
  let pass = 0, fail = 0;
  const check = (label, cond) => { if (cond) { pass++; console.log(`PASS ${label}`); } else { fail++; console.log(`FAIL ${label}`); } };

  g = new Game({
    seed: 99, deck: spec, generals: ['孙权', '甘宁'], first: 0, ask,
    onEvent: (e) => {
      if (e.type === 'log') {
        logs.push(e.msg);
        // 两边各拿到一张后即终止：本测试只关心五谷结算，之后无可进攻动作会无限对峙
        if (logs.some(l => l.startsWith('孙权 获得')) && logs.some(l => l.startsWith('甘宁 获得'))) g.aborted = true;
      }
    },
  });
  await g.run();

  const p0 = g.players[0], p1 = g.players[1];
  check('五谷选择询问发给了使用者（孙权）', chooseAskedBy === 0);
  check('孙权获得【桃♥5】', p0.hand.some(c => c.name === '桃' && c.rank === '5'));
  check('甘宁获得剩下的【闪♥Q】', p1.hand.some(c => c.name === '闪' && c.rank === 'Q'));
  const iGet0 = logs.findIndex(l => l.startsWith('孙权 获得'));
  const iGet1 = logs.findIndex(l => l.startsWith('甘宁 获得'));
  check('日志顺序：使用者先获得', iGet0 !== -1 && iGet1 !== -1 && iGet0 < iGet1);
  check('牌数守恒154', g.invariant().ok);

  console.log(`结果：${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
