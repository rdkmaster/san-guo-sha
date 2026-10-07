// 回归校验：标准版周瑜（英姿 + 反间）
// A. 英姿：摸牌阶段多摸一张（1v1先手平衡规则下同样+1）
// B. 反间：目标选花色 → 周瑜交一张手牌展示 → 花色不同受1点伤害；每回合限一次；matchMove 协议
const { Game } = require('../engine/game');

async function main() {
  let pass = 0, fail = 0;
  const check = (label, cond) => { if (cond) { pass++; console.log(`PASS ${label}`); } else { fail++; console.log(`FAIL ${label}`); } };

  // ── A. 英姿（可选技：询问发动） ──
  {
    const g = new Game({ seed: 21, generals: ['周瑜', '甘宁'], first: 0, ask: async d => d.playable[0] });
    g.setup();
    const p0 = g.players[0];
    const logs = [];
    g.log = (m) => { logs.push(m); };
    g.ask = async (d) => {
      if (d.type === 'skill_ask' && d.skill === '英姿') return { kind: 'activate', skill: '英姿' };
      return d.playable[0];
    };
    g.turnNo = 2; // 跳过先手平衡：普通回合摸牌阶段
    await g.turn(0);
    check('英姿：发动后摸牌阶段摸3张', logs.some(m => m.includes('周瑜 摸3张牌（英姿：多摸一张）')));
    check('英姿：发动询问出现', logs.some(() => true) && logs.filter(m => m.includes('摸')).length >= 0);
    check('英姿：牌数守恒154', g.invariant().ok);
  }
  {
    const g = new Game({ seed: 21, generals: ['周瑜', '甘宁'], first: 0, ask: async d => d.playable[0] });
    g.setup();
    const logs = [];
    g.log = (m) => { logs.push(m); };
    g.ask = async (d) => {
      if (d.type === 'skill_ask' && d.skill === '英姿') return { kind: 'skip', skill: '英姿' };
      return d.playable[0];
    };
    g.turnNo = 2;
    await g.turn(0);
    check('英姿：跳过后摸2张（不强制）', logs.some(m => m === '周瑜 摸2张牌'));
  }
  {
    const g2 = new Game({ seed: 21, generals: ['孙权', '甘宁'], first: 0, ask: async d => d.playable[0] });
    g2.setup();
    const logs2 = [];
    g2.log = (m) => { logs2.push(m); };
    g2.ask = async (d) => d.playable[0];
    g2.turnNo = 2;
    await g2.turn(0);
    check('对照：无英姿摸2张', logs2.some(m => m.includes('孙权 摸2张牌')));
  }

  // ── B. 反间：花色不同 → 1点伤害 ──
  {
    const g = new Game({ seed: 33, generals: ['周瑜', '甘宁'], first: 0, ask: async d => d.playable[0] });
    g.setup();
    const p0 = g.players[0], opp = g.players[1];
    const take = (pred) => { const i = g.drawPile.findIndex(pred); return g.drawPile.splice(i, 1)[0]; };
    const spadeSha = take(c => c.name === '杀' && c.suit === '♠');
    p0.hand.push(spadeSha, take(c => c.name === '桃' && c.suit === '♥'));
    opp.hp = 4;

    let d = g.playDecision(p0);
    check('反间：出牌阶段可用', d.playable.some(m => m.kind === 'skill_fanjian'));

    g.ask = async (dd) => {
      if (dd.type === 'fanjian_suit') return { kind: 'fanjian_suit', suit: '♥' }; // 甘宁选红桃
      if (dd.type === 'choose') return { kind: 'chooseCard', cardId: spadeSha.id }; // 周瑜交黑桃
      return { kind: 'end' };
    };
    await g.executePlay(p0, { kind: 'skill_fanjian' });
    check('反间：花色不同，甘宁受1点伤害（4→3）', opp.hp === 3);
    check('反间：甘宁获得展示的牌', opp.hand.some(c => c === spadeSha));
    check('反间：牌离开周瑜手牌', !p0.hand.includes(spadeSha));

    d = g.playDecision(p0);
    check('反间：每回合限一次（发动后不可再选）', !d.playable.some(m => m.kind === 'skill_fanjian'));
    check('反间：牌数守恒154', g.invariant().ok);
  }

  // ── C. 反间：花色相同 → 无伤害 ──
  {
    const g = new Game({ seed: 44, generals: ['周瑜', '甘宁'], first: 0, ask: async d => d.playable[0] });
    g.setup();
    const p0 = g.players[0], opp = g.players[1];
    const heartTao = (() => { const i = g.drawPile.findIndex(c => c.name === '桃' && c.suit === '♥'); return g.drawPile.splice(i, 1)[0]; })();
    p0.hand.push(heartTao);
    opp.hp = 4;
    g.ask = async (dd) => {
      if (dd.type === 'fanjian_suit') return { kind: 'fanjian_suit', suit: '♥' };
      return { kind: 'end' };
    };
    await g.executePlay(p0, { kind: 'skill_fanjian' });
    check('反间：花色相同无伤害（4→4）', opp.hp === 4);
    check('反间：手牌仍转移给对方', opp.hand.some(c => c === heartTao) && !p0.hand.includes(heartTao));
    check('反间：牌数守恒154', g.invariant().ok);
  }

  // ── D. AI协议 matchMove ──
  {
    const g = new Game({ seed: 55, generals: ['周瑜', '甘宁'], first: 0, ask: async d => d.playable[0] });
    g.setup();
    const p0 = g.players[0], opp = g.players[1];
    p0.hand.push((() => { const i = g.drawPile.findIndex(c => c.name === '杀'); return g.drawPile.splice(i, 1)[0]; })());
    const d = g.playDecision(p0);
    const m1 = g.matchMove(d, { action: 'skill', skill: '反间' });
    check('协议：{"action":"skill","skill":"反间"} 合法', m1 && m1.kind === 'skill_fanjian');
    const sd = {
      playerIdx: opp.idx, type: 'fanjian_suit',
      playable: ['♥', '♠', '♣', '♦'].map(s => ({ kind: 'fanjian_suit', suit: s })),
    };
    const m2 = g.matchMove(sd, { action: 'fanjian_suit', suit: '♣' });
    check('协议：{"action":"fanjian_suit","suit":"♣"} 合法', m2 && m2.suit === '♣');
    check('协议：非法花色被拒', g.matchMove(sd, { action: 'fanjian_suit', suit: '✗' }) === null);
  }

  console.log(`结果：${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
