// 构造"白银狮子伤害规则"测试残局（存入测试环境 saves-test/）
// 局面（存档点，轮到玩家出牌）：
//   玩家 孙权 3/4，装备【白银狮子】，手牌无闪（AI的杀必然命中）
//   AI   甘宁 4/4，手牌以【酒】+多张【杀】为主
// 测法（AI回合自动发生，看日志）：
//   1) 普通杀（1点伤害）→ 无"白银狮子"日志，正常掉1血（狮子防不了普通杀）
//   2) 酒+杀（2点伤害）→ 日志"白银狮子：伤害减至1"，只掉1血
// 玩家手上有桃可回血，方便反复观察。
const { Game } = require('../engine/game');
const fs = require('fs');
const path = require('path');

const K = (n, s, r) => [n, s, r];
const spec = [
  // 孙权起手：白银狮子（装备测伤害）+ 两桃（回血观察）+ 一杀，刻意不给闪
  K('白银狮子', '♣', 'A'), K('桃', '♥', '5'), K('桃', '♥', 'Q'), K('杀', '♣', '2'),
  // 甘宁起手：酒 + 三杀（酒杀=2点伤害）
  K('酒', '♠', '3'), K('杀', '♦', '6'), K('杀', '♦', '7'), K('杀', '♦', '8'),
  // 摸牌：t1孙权摸1（先手少摸）→ t2甘宁摸2 → t3孙权摸2
  K('杀', '♣', '5'),
  K('杀', '♠', '9'), K('杀', '♥', '10'),
  K('杀', '♦', '9'), K('杀', '♠', '7'),
  K('杀', '♦', '10'), K('杀', '♣', '10'), K('杀', '♣', 'J'), K('杀', '♦', 'K'),
];

let g;
let saved = null;
let p0PlayCount = 0;

// 持久队列：t1孙权装狮子→end；t2甘宁普通杀打玩家（1点伤害不减免，孙权4→3）→end；t3孙权出牌询问=存档点
const queue = {
  '0:play': [
    () => { const c = g.players[0].hand.find(x => x.name === '白银狮子'); return { kind: 'play', cardId: c.id, targets: [0] }; },
    { kind: 'end' },
  ],
  '1:play': [
    () => { const c = g.players[1].hand.find(x => x.name === '杀'); return { kind: 'play', cardId: c.id, targets: [0] }; },
    { kind: 'end' },
  ],
};

const ask = async (d) => {
  if (d.playerIdx === 0 && d.type === 'play') {
    p0PlayCount++;
    if (p0PlayCount === 3) {
      // t3 孙权的第一个出牌询问 = 残局存档点
      saved = JSON.parse(JSON.stringify(g.saveData()));
      saved.name = '残局_白银狮子伤害';
      g.aborted = true;
      return { kind: 'end' };
    }
  }
  const q = queue[`${d.playerIdx}:${d.type}`];
  if (q && q.length) { const m = q.shift(); return typeof m === 'function' ? m(d) : m; }
  return d.playable[0];
};

async function main() {
  g = new Game({
    seed: 777,
    deck: spec,
    generals: ['孙权', '甘宁'],
    first: 0,
    ask,
    onEvent: () => {},
  });
  await g.run();
  if (!saved) { console.error('FAIL: 未到达存档点'); process.exit(1); }
  // 注意：必须用存档点时刻的快照（saved）。run()后再取会多录一条end，恢复时出牌阶段会被直接结束掉。

  // 校验残局关键状态
  const me = g.players[0], ai = g.players[1];

  const okHp = me.hp === 3;
  const okLion = me.equips.armor && me.equips.armor.name === '白银狮子';
  const okNoShan = !me.hand.some(c => c.name === '闪');
  const okAiHand = ai.hand.some(c => c.name === '酒') && ai.hand.some(c => c.name === '杀');
  const hand = me.hand.map(c => c.name);
  console.log(`残局状态：第${g.turnNo}回合 轮到孙权出牌 | 孙权 ${me.hp}/${me.maxHp} 防具=${me.equips.armor.name}`);
  console.log(`          手牌[${hand.join('、')}]（无闪）| 甘宁 手牌[${ai.hand.map(c => c.name).join('、')}]`);
  console.log(`状态校验: hp=${okHp ? 'OK' : 'FAIL'} 狮子=${okLion ? 'OK' : 'FAIL'} 无闪=${okNoShan ? 'OK' : 'FAIL'} AI有酒杀=${okAiHand ? 'OK' : 'FAIL'}`);
  if (!(okHp && okLion && okNoShan && okAiHand)) process.exit(1);

  const dir = path.join(__dirname, '..', 'saves-test');
  fs.mkdirSync(dir, { recursive: true });
  const fp = path.join(dir, '残局_白银狮子伤害.json');
  fs.writeFileSync(fp, JSON.stringify(saved, null, 1), 'utf8');
  console.log(`已生成（测试环境）: ${fp}（决策记录 ${saved.decisions.length} 条）`);
}
main().catch(e => { console.error(e); process.exit(1); });
