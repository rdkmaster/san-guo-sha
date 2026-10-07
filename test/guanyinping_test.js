// 回归校验：自创武将关银屏（虎啸 + 将门）
// A. 虎啸发动：亮3张拿红色（ rigged 红/红/黑 → 摸2黑1进弃牌堆）
// B. 虎啸跳过：不强制
// C. 将门：手牌上限4（hp3+1），弃牌阶段少弃一张
const { Game } = require('../engine/game');

async function main() {
  let pass = 0, fail = 0;
  const check = (label, cond) => { if (cond) { pass++; console.log(`PASS ${label}`); } else { fail++; console.log(`FAIL ${label}`); } };
  const take = (g, pred) => { const i = g.drawPile.findIndex(pred); return g.drawPile.splice(i, 1)[0]; };

  // ── A. 虎啸发动 ──
  {
    const g = new Game({ seed: 201, generals: ['关银屏', '甘宁'], first: 0, ask: async d => d.playable[0] });
    g.setup();
    const p0 = g.players[0];
    const before = p0.hand.length, discBefore = g.discardPile.length, pileBefore = g.drawPile.length;
    const c1 = take(g, c => c.suit === '♥');
    const c2 = take(g, c => c.suit === '♦');
    const c3 = take(g, c => c.suit === '♠');
    g.drawPile.unshift(c3, c2, c1); // 堆顶三张：红红黑
    g.ask = async (d) => {
      if (d.type === 'skill_ask' && d.skill === '虎啸') return { kind: 'activate', skill: '虎啸' };
      return d.playable[0];
    };
    await g.huxiao(p0);
    check('虎啸：获得两张红色牌', p0.hand.some(c => c === c1) && p0.hand.some(c => c === c2));
    check('虎啸：黑色牌进弃牌堆', g.discardPile.includes(c3));
    check('虎啸：手牌+2弃牌+1牌堆-3', p0.hand.length === before + 2 && g.discardPile.length === discBefore + 1 && g.drawPile.length === pileBefore - 3);
    check('虎啸：牌数守恒154', g.invariant().ok);
  }

  // ── B. 虎啸跳过 ──
  {
    const g = new Game({ seed: 202, generals: ['关银屏', '甘宁'], first: 0, ask: async d => d.playable[0] });
    g.setup();
    const p0 = g.players[0];
    const before = p0.hand.length;
    g.ask = async (d) => {
      if (d.type === 'skill_ask' && d.skill === '虎啸') return { kind: 'skip', skill: '虎啸' };
      return d.playable[0];
    };
    await g.huxiao(p0);
    check('虎啸：跳过后不亮牌不摸牌', p0.hand.length === before);
    check('虎啸：牌数守恒154', g.invariant().ok);
  }

  // ── C. 将门：手牌上限+1 ──
  {
    const g = new Game({ seed: 203, generals: ['关银屏', '甘宁'], first: 0, ask: async d => d.playable[0] });
    g.setup();
    const p0 = g.players[0];
    const logs = [];
    g.log = (m) => { logs.push(m); };
    check('将门：手牌上限为hp+1=4', g.handLimit(p0) === 4);
    // 跑一个完整回合（虎啸跳过以隔离将门）：初始4张+摸2=6张 > 上限4 → 弃2（若无将门会弃3）
    g.turnNo = 2;
    let huxiaoSkipped = false;
    g.ask = async (d) => {
      if (d.type === 'skill_ask' && d.skill === '虎啸') { huxiaoSkipped = true; return { kind: 'skip', skill: '虎啸' }; }
      return d.playable[0];
    };
    await g.turn(0);
    check('将门：虎啸已跳过（隔离测试）', huxiaoSkipped === true && !logs.some(l => l.includes('发动【虎啸】')));
    const discLine = logs.find(l => /^关银屏 弃置 /.test(l));
    const discarded = discLine ? discLine.replace(/^关银屏 弃置 /, '').split('、').length : 0;
    check('将门：弃牌阶段只需弃2张（无将门会弃3）', discarded === 2);
    check('将门：回合结束手牌数=上限4', p0.hand.length === 4);
    check('将门：牌数守恒154', g.invariant().ok);
  }

  console.log(`结果：${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
