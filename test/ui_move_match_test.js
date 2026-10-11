// UI动作匹配校验：浏览器提交的move对象在matchMove中必须按 suit/value 精确匹配
// 回归背景：反间选♦曾被匹配到第一个选项♥（matchMove只按kind找）
const { Game } = require('../engine/game');

let pass = 0, fail = 0;
function check(label, cond) {
  if (cond) { pass++; console.log(`PASS ${label}`); }
  else { fail++; console.log(`FAIL ${label}`); }
}

(async () => {
  const g = new Game({ seed: 1, generals: ['周瑜', '甘宁'], first: 0, ask: async d => d.playable[0] });
  g.setup();

  // ── matchMove 单元：fanjian_suit 四个花色各自精确匹配 ──
  const sd = { playerIdx: 1, type: 'fanjian_suit', playable: ['♥', '♠', '♣', '♦'].map(s => ({ kind: 'fanjian_suit', suit: s })) };
  for (const s of ['♥', '♠', '♣', '♦']) {
    const m = g.matchMove(sd, { kind: 'fanjian_suit', suit: s });
    check(`matchMove：花色${s} 精确匹配`, m && m.suit === s);
  }

  // ── matchMove 单元：choice 按 value 匹配（刚烈/青囊同类，回归保护） ──
  const cd = { playerIdx: 0, type: 'choose', playable: [{ kind: 'choice', value: 'discard2' }, { kind: 'choice', value: 'hurt' }] };
  check('matchMove：choice=hurt 匹配第二项', (g.matchMove(cd, { kind: 'choice', value: 'hurt' }) || {}).value === 'hurt');
  check('matchMove：choice=discard2 匹配第一项', (g.matchMove(cd, { kind: 'choice', value: 'discard2' }) || {}).value === 'discard2');

  // ── 端到端：反间目标选♦，周瑜交♠ → 花色不同受伤 ──
  {
    const logs = [];
    const g2 = new Game({ seed: 9, generals: ['周瑜', '甘宁'], first: 0, ask: async d => d.playable[0] });
    g2.setup();
    g2.onEvent = (e) => { if (e.type === 'log') logs.push(e.msg); };
    const p0 = g2.players[0], opp = g2.players[1];
    const take = (pred) => { const i = g2.drawPile.findIndex(pred); return g2.drawPile.splice(i, 1)[0]; };
    const spadeSha = take(c => c.name === '杀' && c.suit === '♠');
    p0.hand.push(spadeSha, take(c => c.name === '杀' && c.suit === '♦'));
    opp.hp = 4;
    g2.ask = async (dd) => {
      if (dd.type === 'fanjian_suit') return { kind: 'fanjian_suit', suit: '♦' }; // 目标选方片
      if (dd.type === 'choose') return { kind: 'chooseCard', cardId: spadeSha.id }; // 周瑜交黑桃
      return { kind: 'end' };
    };
    await g2.executePlay(p0, { kind: 'skill_fanjian' });
    check('反间e2e：日志显示选择花色 ♦', logs.some(l => l.includes('反间选择花色 ♦')));
    check('反间e2e：♠≠♦ 花色不同受伤（4→3）', opp.hp === 3);
  }

  // ── 端到端：反间目标选♦，周瑜交♦ → 花色相同无伤害 ──
  {
    const logs = [];
    const g3 = new Game({ seed: 11, generals: ['周瑜', '甘宁'], first: 0, ask: async d => d.playable[0] });
    g3.setup();
    g3.onEvent = (e) => { if (e.type === 'log') logs.push(e.msg); };
    const p0 = g3.players[0], opp = g3.players[1];
    const take = (pred) => { const i = g3.drawPile.findIndex(pred); return g3.drawPile.splice(i, 1)[0]; };
    const diaSha = take(c => c.name === '杀' && c.suit === '♦');
    p0.hand.push(diaSha);
    opp.hp = 4;
    g3.ask = async (dd) => {
      if (dd.type === 'fanjian_suit') return { kind: 'fanjian_suit', suit: '♦' };
      if (dd.type === 'choose') return { kind: 'chooseCard', cardId: diaSha.id }; // 交方片
      return { kind: 'end' };
    };
    await g3.executePlay(p0, { kind: 'skill_fanjian' });
    check('反间e2e：♦=♦ 无伤害（4→4）', opp.hp === 4 && !logs.some(l => l.includes('花色不同')));
  }

  console.log(`结果：${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
})();
