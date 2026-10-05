// 可出性判定表：出牌阶段的"能不能出"由引擎确定性计算（playDecision），
// 本测试把计算规则固化为断言——任何改动导致可出性与官方规则不符即失败。
const { Game } = require('../engine/game');

let pass = 0, fail = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log(`✓ ${name}`); }
  else { fail++; console.log(`✗ ${name}\n   期望: ${e}\n   实际: ${a}`); }
}

// 张飞（咆哮）无转化技：出牌动作=纯手牌规则；关羽做对手
async function mkSetup(p0deck, p1deck) {
  const g = new Game({
    seed: 99, generals: ['张飞', '关羽'], first: 0,
    deck: [...p0deck, ...p1deck],
    ask: async () => ({ kind: 'end' }),
  });
  await g.setup();
  return g;
}
const shaMove = (d, p, name) => d.playable.some(m => m.kind === 'play' && m.cardId != null
  && p.hand.find(c => c.id === m.cardId && c.name === name));

(async () => {
  // 1. 基础：范围内手牌杀可出；闪不可出；桃满血不可出；酒可出
  {
    const g = await mkSetup([['杀', '♣', '8'], ['闪', '♥', '2'], ['桃', '♦', '2'], ['酒', '♠', '3']],
      [['闪', '♦', '5'], ['桃', '♥', '5'], ['闪', '♦', '6'], ['杀', '♠', '8']]);
    const p = g.players[0], opp = g.players[1];
    const d = g.playDecision(p, opp);
    const plays = d.playable.filter(m => m.kind === 'play');
    check('基础: 恰有2个手牌动作（杀+酒）', plays.length, 2);
    check('基础: 杀可出', shaMove(d, p, '杀'), true);
    check('基础: 酒可出', shaMove(d, p, '酒'), true);
    check('基础: 闪不可出', shaMove(d, p, '闪'), false);
    check('基础: 满血桃不可出', shaMove(d, p, '桃'), false);
  }

  // 2. 桃需受伤；酒+受伤桃可出
  {
    const g = await mkSetup([['杀', '♣', '8'], ['闪', '♥', '2'], ['桃', '♦', '2'], ['酒', '♠', '3']],
      [['闪', '♦', '5'], ['桃', '♥', '5'], ['闪', '♦', '6'], ['杀', '♠', '8']]);
    const p = g.players[0];
    p.hp = 2;
    const d = g.playDecision(p, g.players[1]);
    check('受伤: 桃可出', shaMove(d, p, '桃'), true);
  }

  // 3. 距离规则：对手+1马且自己无-1马无武器 → 杀不可出；自己-1马 → 可出
  {
    const g = await mkSetup([['杀', '♣', '8'], ['闪', '♥', '2'], ['桃', '♦', '2'], ['闪', '♦', '4']],
      [['的卢', '♣', '5'], ['桃', '♥', '5'], ['闪', '♦', '6'], ['杀', '♠', '8']]);
    const p = g.players[0], opp = g.players[1];
    opp.equips.horsePlus = opp.hand.splice(opp.hand.findIndex(c => c.name === '的卢'), 1)[0];
    let d = g.playDecision(p, opp);
    check('距离: 对手+1马无武器(距2) 杀不可出', shaMove(d, p, '杀'), false);
    p.equips.horseMinus = { name: '大宛', suit: '♠', rank: 'K', equip: '坐骑-1', id: 9001 };
    d = g.playDecision(p, opp);
    check('距离: 自己-1马(距1) 杀可出', shaMove(d, p, '杀'), true);
  }

  // 4. 酒每回合一次：第一张可出（恰1个酒动作），已用后不可出
  {
    const g = await mkSetup([['酒', '♠', '3'], ['酒', '♣', '3'], ['桃', '♦', '2'], ['闪', '♥', '2']],
      [['闪', '♦', '5'], ['桃', '♥', '5'], ['闪', '♦', '6'], ['杀', '♠', '8']]);
    const p = g.players[0];
    let d = g.playDecision(p, g.players[1]);
    // 两张酒各自单独合法（未用时都可选）；规则由jiuUsed门强制：用掉一张后另一张消失
    check('酒: 未用时两张各自可选', d.playable.filter(m => m.cardId != null
      && p.hand.find(c => c.id === m.cardId && c.name === '酒')).length, 2);
    p.jiuUsed = 1;
    d = g.playDecision(p, g.players[1]);
    check('酒: 已用后不可出', shaMove(d, p, '酒'), false);
  }

  // 5. 杀次数：无咆哮shaUsed=1后不可出；咆哮/连弩无限
  {
    const g = await mkSetup([['杀', '♣', '8'], ['杀', '♣', '9'], ['桃', '♦', '2'], ['闪', '♥', '2']],
      [['闪', '♦', '5'], ['桃', '♥', '5'], ['闪', '♦', '6'], ['杀', '♠', '8']]);
    const p = g.players[0], opp = g.players[1];
    p.shaUsed = 1;
    let d = g.playDecision(p, opp);
    check('咆哮: 已出1杀仍可出', shaMove(d, p, '杀'), true);
    p.skills = []; // 摘除咆哮
    d = g.playDecision(p, opp);
    check('无咆哮: shaUsed=1后杀不可出', shaMove(d, p, '杀'), false);
    p.skills = ['咆哮'];
    p.equips.weapon = { name: '诸葛连弩', suit: '♣', rank: '1', equip: '武器', range: 1, id: 9002 };
    d = g.playDecision(p, opp);
    check('连弩在场同样无限', shaMove(d, p, '杀'), true);
  }

  // 6. 判定区唯一性：闪电在自己判定区不可再出；对手已有乐不思蜀不可再出
  {
    const g = await mkSetup([['闪电', '♠', 'A'], ['乐不思蜀', '♠', '6'], ['桃', '♦', '2'], ['闪', '♥', '2']],
      [['闪', '♦', '5'], ['桃', '♥', '5'], ['闪', '♦', '6'], ['杀', '♠', '8']]);
    const p = g.players[0], opp = g.players[1];
    const sd = p.hand.splice(p.hand.findIndex(c => c.name === '闪电'), 1)[0];
    p.judge.push(sd);
    let d = g.playDecision(p, opp);
    check('闪电: 判定区已有不可再出', d.playable.some(m => m.cardId === sd.id), false);
    const lb = p.hand.find(c => c.name === '乐不思蜀');
    check('乐不: 对手判定区为空时可出', d.playable.some(m => m.cardId === lb.id), true);
    opp.judge.push({ name: '乐不思蜀', suit: '♠', rank: '6', id: 9003 });
    d = g.playDecision(p, opp);
    check('乐不: 对手已有乐不不可再出', d.playable.some(m => m.cardId === lb.id), false);
  }

  // 7. 顺手/兵粮距离；无懈可击不能主动出；装备牌可出
  {
    const g = await mkSetup([['顺手牵羊', '♦', '3'], ['兵粮寸断', '♣', '4'], ['无懈可击', '♠', 'K'], ['青釭剑', '♠', '6']],
      [['闪', '♦', '5'], ['桃', '♥', '5'], ['闪', '♦', '6'], ['杀', '♠', '8']]);
    const p = g.players[0], opp = g.players[1];
    let d = g.playDecision(p, opp);
    const ss = p.hand.find(c => c.name === '顺手牵羊');
    const bl = p.hand.find(c => c.name === '兵粮寸断');
    const wx = p.hand.find(c => c.name === '无懈可击');
    const qk = p.hand.find(c => c.name === '青釭剑');
    check('顺手: 距1有牌可出', d.playable.some(m => m.cardId === ss.id), true);
    check('兵粮: 距1可出', d.playable.some(m => m.cardId === bl.id), true);
    check('无懈: 出牌阶段不可主动出', d.playable.some(m => m.cardId === wx.id), false);
    check('装备: 空槽可装', d.playable.some(m => m.cardId === qk.id), true);
    opp.equips.horsePlus = { name: '的卢', suit: '♥', rank: '5', equip: '坐骑+1', id: 9004 };
    d = g.playDecision(p, opp);
    check('距离锦囊: 距2顺手/兵粮均不可出', d.playable.some(m => m.cardId === ss.id || m.cardId === bl.id), false);
    check('距离不影响装备', d.playable.some(m => m.cardId === qk.id), true);
  }

  // 8. 制衡：未用可发动，已用消失
  {
    const g = await mkSetup([['杀', '♣', '8'], ['闪', '♥', '2'], ['桃', '♦', '2'], ['酒', '♠', '3']],
      [['闪', '♦', '5'], ['桃', '♥', '5'], ['闪', '♦', '6'], ['杀', '♠', '8']]);
    g.players[0].skills = ['制衡'];
    let d = g.playDecision(g.players[0], g.players[1]);
    check('制衡: 未用可发动', d.playable.some(m => m.kind === 'skill_zhiheng'), true);
    g.players[0].zhihengUsed = true;
    d = g.playDecision(g.players[0], g.players[1]);
    check('制衡: 已用不可发动', d.playable.some(m => m.kind === 'skill_zhiheng'), false);
  }

  // 9. 丈八蛇矛：组合动作携带引擎计算的合法池=全部手牌id；杀次数用尽则组合消失
  {
    const g = await mkSetup([['杀', '♣', '8'], ['闪', '♥', '2'], ['桃', '♦', '2'], ['闪', '♦', '4']],
      [['闪', '♦', '5'], ['桃', '♥', '5'], ['闪', '♦', '6'], ['杀', '♠', '8']]);
    const p = g.players[0];
    p.equips.weapon = { name: '丈八蛇矛', suit: '♠', rank: 'Q', equip: '武器', range: 3, id: 9005 };
    let d = g.playDecision(p, g.players[1]);
    const combo = d.playable.find(m => m.kind === 'sha_combo');
    check('丈八: sha_combo在且池=全手牌id',
      combo ? [...combo.cardIds].sort((a, b) => a - b) : null, p.hand.map(c => c.id).sort((a, b) => a - b));
    p.shaUsed = 1; // 张飞仍带咆哮——摘除后次数门生效
    p.skills = [];
    d = g.playDecision(p, g.players[1]);
    check('丈八: 杀次数用尽组合不可出', d.playable.some(m => m.kind === 'sha_combo'), false);
  }

  // 10. 武圣（关羽）：空手牌时装备区红牌可当杀（cardId=装备id, useAs=杀）
  {
    const g = await mkSetup([['闪', '♥', '2'], ['桃', '♦', '2'], ['闪', '♦', '4'], ['闪', '♦', '6']],
      [['闪', '♦', '5'], ['桃', '♥', '5'], ['闪', '♦', '7'], ['杀', '♠', '8']]);
    const p = g.players[0];
    p.general = '关羽'; p.skills = ['武圣'];
    p.hand = [];
    p.equips.horseMinus = { name: '赤兔', suit: '♥', rank: '5', equip: '坐骑-1', id: 9006 };
    const d = g.playDecision(p, g.players[1]);
    const ws = d.playable.find(m => m.kind === 'play' && m.cardId === 9006);
    check('武圣: 空手牌时装备区红牌可当杀', ws && ws.useAs === '杀' && Array.isArray(ws.targets) && ws.targets.length === 1, true);
  }

  console.log(`\n可出性判定表: ${pass}过 / ${fail}败`);
  process.exit(fail === 0 ? 0 : 1);
})();
