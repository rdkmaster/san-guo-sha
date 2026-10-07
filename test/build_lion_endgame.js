// 构造"白银狮子回血"测试残局：
// 局面（存档点，轮到玩家出牌）：
//   玩家 孙权 4/4，手牌：过河拆桥♠3 / 顺手牵羊♦3 / 杀♣3 / 杀♠7 / 杀♦9 / 杀♠9
//   AI   甘宁 3/4，装备【白银狮子】，手牌3张杀
// 测法：用 过河拆桥/顺手牵羊 拿掉甘宁的白银狮子 → 日志出现"失去装备区的【白银狮子】，回复1点体力（3→4/4）"，甘宁回满4血
// 产物：saves/残局_白银狮子.json → 打开页面点"继续对局"即可亲手测试
const { Game } = require('../engine/game');
const fs = require('fs');
const path = require('path');

const K = (n, s, r) => [n, s, r];
const spec = [
  // 孙权起手：杀（先打AI一刀）+ 残局要用的两张锦囊 + 一张杀
  K('杀', '♣', '2'), K('杀', '♣', '3'), K('过河拆桥', '♠', '3'), K('顺手牵羊', '♦', '3'),
  // 甘宁起手：白银狮子 + 三张杀
  K('白银狮子', '♣', 'A'), K('杀', '♦', '6'), K('杀', '♦', '7'), K('杀', '♦', '8'),
  // 摸牌：t1孙权摸1（先手少摸）→ t2甘宁摸2 → t3孙权摸2 → 恢复后的摸牌
  K('杀', '♠', '7'),
  K('杀', '♥', '10'), K('杀', '♦', '10'),
  K('杀', '♦', '9'), K('杀', '♠', '9'),
  K('杀', '♣', '5'), K('杀', '♠', '10'), K('杀', '♣', '10'), K('杀', '♠', '8'), K('杀', '♣', 'J'), K('杀', '♦', 'K'),
];

let g;
let saved = null;
let p0PlayCount = 0;

const play = (i, name, target) => () => {
  const c = g.players[i].hand.find(x => x.name === name);
  if (!c) throw new Error(`脚本错误：玩家${i}没有${name}`);
  return { kind: 'play', cardId: c.id, targets: target == null ? [i] : [target] };
};
const discardSha = (i, n) => () => ({
  kind: 'discard',
  cardIds: g.players[i].hand.filter(c => c.name === '杀').slice(0, n).map(c => c.id),
});

const script = {
  // t1 孙权：杀→end
  '0:play': [play(0, '杀', 1), { kind: 'end' }],
  // t1 甘宁：无闪不响应（默认refuse）
  // t2 甘宁：装白银狮子→end；弃牌阶段只弃杀
  '1:play': [play(1, '白银狮子'), { kind: 'end' }],
  '1:discard': [discardSha(1, 2)],
};

const ask = async (d) => {
  if (d.playerIdx === 0 && d.type === 'play') {
    p0PlayCount++;
    if (p0PlayCount === 3) {
      // 第3回合孙权的第一个出牌询问 = 残局存档点
      saved = JSON.parse(JSON.stringify(g.saveData()));
      saved.name = '残局_白银狮子';
      g.aborted = true;
      return { kind: 'end' };
    }
  }
  const q = script[`${d.playerIdx}:${d.type}`];
  if (q && q.length) {
    const m = q.shift();
    return typeof m === 'function' ? m(d) : m;
  }
  return d.playable[0];
};

async function main() {
  g = new Game({
    seed: 20261006,
    deck: spec,
    generals: ['孙权', '甘宁'],
    first: 0,
    ask,
    onEvent: () => {},
  });
  await g.run();
  if (!saved) { console.error('FAIL: 未到达存档点'); process.exit(1); }

  // 校验残局关键状态
  const me = g.players[0], ai = g.players[1];
  const okHp = ai.hp === 3;
  const okLion = ai.equips.armor && ai.equips.armor.name === '白银狮子';
  const okTurn = g.turnNo === 3;
  const hand = me.hand.map(c => c.name);
  const okHand = hand.includes('过河拆桥') && hand.includes('顺手牵羊');
  console.log(`残局状态：第${g.turnNo}回合 轮到孙权出牌 | 孙权 ${me.hp}/${me.maxHp} 手牌[${hand.join('、')}]`);
  console.log(`          甘宁 ${ai.hp}/${ai.maxHp} 防具=${ai.equips.armor ? ai.equips.armor.name : '无'}`);
  console.log(`状态校验: hp=${okHp ? 'OK' : 'FAIL'} 狮子=${okLion ? 'OK' : 'FAIL'} 回合=${okTurn ? 'OK' : 'FAIL'} 手牌=${okHand ? 'OK' : 'FAIL'}`);
  if (!(okHp && okLion && okTurn && okHand)) process.exit(1);

  const dir = path.join(__dirname, '..', 'saves');
  fs.mkdirSync(dir, { recursive: true });
  const fp = path.join(dir, '残局_白银狮子.json');
  fs.writeFileSync(fp, JSON.stringify(saved, null, 1), 'utf8');
  console.log(`已生成: ${fp}（决策记录 ${saved.decisions.length} 条）`);
}
main().catch(e => { console.error(e); process.exit(1); });
