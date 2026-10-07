// 回归校验：黄月英回合外使用【无懈可击】也触发【集智】摸一张牌
// 场景：甘宁使用【无中生有】→ 黄月英（集智）用【无懈可击】抵消 → 可发动集智摸1张
const { Game } = require('../engine/game');

const K = (n, s, r) => [n, s, r];
const spec = [
  K('无中生有', '♥', '7'), K('杀', '♣', '2'), K('杀', '♣', '3'), K('杀', '♣', '4'), // 甘宁起手
  K('无懈可击', '♥', 'A'), K('杀', '♦', '6'), K('杀', '♦', '7'), K('杀', '♦', '8'), // 黄月英起手
  K('杀', '♠', '9'), K('杀', '♥', '10'), K('杀', '♦', '10'), K('杀', '♠', '7'),
];

let g;
const logs = [];
const queue = {
  // 甘宁 t1：无中生有→end
  '0:play': [
    () => { const c = g.players[0].hand.find(x => x.name === '无中生有'); return { kind: 'play', cardId: c.id, targets: [] }; },
    { kind: 'end' },
  ],
  // 黄月英：用无懈抵消 → 发动集智
  '1:wuxie': [() => { const c = g.players[1].hand.find(x => x.name === '无懈可击'); return { kind: 'wuxie', cardId: c.id }; }],
  '1:skill_ask': [{ kind: 'activate', skill: '集智' }],
};
const ask = async (d) => {
  const q = queue[`${d.playerIdx}:${d.type}`];
  if (q && q.length) { const m = q.shift(); return typeof m === 'function' ? m(d) : m; }
  return d.playable[0];
};

async function main() {
  let pass = 0, fail = 0;
  const check = (label, cond) => { if (cond) { pass++; console.log(`PASS ${label}`); } else { fail++; console.log(`FAIL ${label}`); } };

  g = new Game({
    seed: 11, deck: spec, generals: ['甘宁', '黄月英'], first: 0, ask,
    onEvent: (e) => {
      if (e.type === 'log') {
        logs.push(e.msg);
        if (e.msg.includes('发动【集智】')) g.aborted = true; // 断言点达成即收
      }
    },
  });
  await g.run();

  const p1 = g.players[1];
  check('黄月英使用无懈抵消了无中生有', logs.some(l => l.includes('黄月英 使用【无懈可击】抵消【无中生有】')));
  check('集智在回合外无懈后触发摸1张', logs.some(l => l === '黄月英 发动【集智】摸1张牌'));
  check('无中生有的摸牌被抵消（甘宁没摸2张）', !logs.some(l => l.includes('甘宁 摸2张牌')));
  check('黄月英手牌数正确（4-1无懈+1集智=4）', p1.hand.length === 4);
  check('牌数守恒154', g.invariant().ok);

  console.log(`结果：${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
