// 回归校验：奇袭（甘宁）可将装备区里的黑色牌当【过河拆桥】使用
// 场景：甘宁先装备白银狮子♣A（黑），掉血后把它当过河拆桥转化打出 → 狮子离场触发回血，弃掉孙权的手牌
const { Game } = require('../engine/game');

const K = (n, s, r) => [n, s, r];
const spec = [
  K('白银狮子', '♣', 'A'), K('杀', '♦', '6'), K('杀', '♦', '7'), K('杀', '♦', '8'), // 甘宁起手
  K('闪', '♥', 'Q'), K('杀', '♣', '2'), K('杀', '♣', '3'), K('杀', '♣', '4'),       // 孙权起手
  K('杀', '♠', '9'), K('杀', '♥', '10'), K('杀', '♦', '10'), K('杀', '♠', '7'),
];

let g;
let lionId = null;
let equipOptionSeen = false;
const logs = [];
const queue = {
  // t1 甘宁：装白银狮子→end
  '0:play': [
    () => { const c = g.players[0].hand.find(x => x.name === '白银狮子'); return { kind: 'play', cardId: c.id, targets: [0] }; },
    { kind: 'end' },
    // t3 甘宁：奇袭转化装备区的狮子当过河拆桥
    () => { const c = g.players[0].equips.armor; return { kind: 'play', cardId: c.id, useAs: '过河拆桥', targets: [1] }; },
  ],
  // t2 孙权：杀甘宁（掉血铺垫）→end
  '1:play': [
    (d) => {
      const sha = d.playable.find(m => m.kind === 'play' && g.players[1].hand.find(x => x.id === m.cardId && x.name === '杀'));
      g.players[0].hp = 2; // 掉血铺垫：狮子离场时应回血
      return { kind: 'play', cardId: sha.cardId, targets: [0] };
    },
    { kind: 'end' },
  ],
};
const ask = async (d) => {
  if (d.playerIdx === 0 && d.type === 'play') {
    const opt = (d.playable || []).find(m => m.kind === 'play' && m.useAs === '过河拆桥' && m.cardId === lionId);
    if (opt) equipOptionSeen = true; // 装备区的黑色牌出现在奇袭合法动作里
  }
  const q = queue[`${d.playerIdx}:${d.type}`];
  if (q && q.length) { const m = q.shift(); return typeof m === 'function' ? m(d) : m; }
  return d.playable[0];
};

async function main() {
  let pass = 0, fail = 0;
  const check = (label, cond) => { if (cond) { pass++; console.log(`PASS ${label}`); } else { fail++; console.log(`FAIL ${label}`); } };

  g = new Game({
    seed: 21, deck: spec, generals: ['甘宁', '孙权'], first: 0, ask,
    onEvent: (e) => {
      if (e.type !== 'log') return;
      logs.push(e.msg);
      if (e.msg.startsWith('甘宁 装备【白银狮子')) lionId = g.players[0].equips.armor.id;
      if (e.msg.includes('弃置孙权的')) g.aborted = true;
    },
  });
  await g.run();

  const p0 = g.players[0];
  check('装备区黑色牌出现在奇袭合法动作中', equipOptionSeen);
  check('狮子作为过河拆桥打出后离开装备区', p0.equips.armor === null);
  check('狮子离场触发回血（1→2/4：先吃普通杀1点掉到1，再离场回1）', logs.some(l => l.includes('甘宁 失去装备区的【白银狮子】，回复1点体力（1→2/4）')));
  check('弃掉了孙权的一张手牌（随机）', logs.some(l => /弃置孙权的【/.test(l)));
  check('狮子进弃牌堆', g.discardPile.some(c => c.name === '白银狮子'));
  check('牌数守恒154', g.invariant().ok);

  console.log(`结果：${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
