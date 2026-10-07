// 回归校验：制衡可弃置装备区里的牌（含白银狮子离场回血联动）
// 场景：孙权掉血后装备白银狮子，再用制衡弃掉它 → 摸1张 + 狮子离场回1血
const { Game } = require('../engine/game');

const K = (n, s, r) => [n, s, r];
const spec = [
  K('白银狮子', '♣', 'A'), K('杀', '♣', '2'), K('杀', '♣', '3'), K('杀', '♣', '4'), // 孙权起手
  K('杀', '♦', '6'), K('杀', '♦', '7'), K('杀', '♦', '8'), K('杀', '♦', '9'),      // 甘宁起手
  K('杀', '♠', '9'), K('杀', '♥', '10'), K('杀', '♦', '10'), K('杀', '♠', '7'),
];

let g;
let lionId = null;
const logs = [];
const queue = {
  // t1 孙权：装狮子→end
  '0:play': [
    () => { const c = g.players[0].hand.find(x => x.name === '白银狮子'); return { kind: 'play', cardId: c.id, targets: [0] }; },
    { kind: 'end' },
    // t3 孙权：制衡弃掉装备区的狮子（手牌为空也能发动）
    () => ({ kind: 'skill_zhiheng', cardIds: [lionId] }),
  ],
  // t2 甘宁：end
  '1:play': [{ kind: 'end' }],
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
    seed: 55, deck: spec, generals: ['孙权', '甘宁'], first: 0, ask,
    onEvent: (e) => {
      if (e.type !== 'log') return;
      logs.push(e.msg);
      if (e.msg.startsWith('孙权 装备【白银狮子')) lionId = g.players[0].equips.armor.id;
      if (e.msg.includes('发动【制衡】')) g.aborted = true;
    },
  });
  g.setup();
  g.players[0].hp = 2; // 掉血铺垫：狮子离场应回血

  await g.run();
  const p0 = g.players[0];

  check('制衡成功弃掉装备区的狮子', p0.equips.armor === null && g.discardPile.some(c => c.name === '白银狮子'));
  check('弃1张摸1张', logs.some(l => l === '孙权 发动【制衡】，弃1张摸1张'));
  check('狮子离场触发回血（2→3/4）', p0.hp === 3 && logs.some(l => l.includes('孙权 失去装备区的【白银狮子】，回复1点体力（2→3/4）')));
  check('牌数守恒154', g.invariant().ok);

  console.log(`结果：${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
