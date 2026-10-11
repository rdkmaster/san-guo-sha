// 开局选将（三选一）回归测试
// A. 新对局：双方各从3名不重叠候选中选1，属性/技能/起手牌正确
// B. 非法选择被重问，合法后生效
// C. 连续非法走随机兜底，结果仍是候选之一
// D. 存档恢复：重放选将决策后武将/手牌/牌堆与原局完全一致
// E. 旧式存档（无选将记录）：指定generals直接生效，不触发选将
// F. AI动作格式映射：{action:'choose',choice:武将名}
const { Game } = require('../engine/game');

async function main() {
  let pass = 0, fail = 0;
  const check = (label, cond) => { if (cond) { pass++; console.log(`PASS ${label}`); } else { fail++; console.log(`FAIL ${label}`); } };

  // ── A. 新对局三选一 ──
  const seen = [];
  const seenFirst = [];
  const g1 = new Game({
    seed: 421, selectGenerals: true, first: 0,
    ask: async (d) => {
      if (d.type === 'xuanjiang') { seen.push(d.context.candidates.slice()); seenFirst.push(d.context.isFirst); }
      return d.playable[0];
    },
  });
  await g1.setup();
  check('A：双方各询问一次选将', seen.length === 2);
  check('A：候选各3名且互不相同', seen.every(c => c.length === 3 && new Set(c).size === 3));
  check('A：双方候选不重叠', seen[0].every(n => !seen[1].includes(n)));
  check('A：选中各自第一候选', g1.players[0].general === seen[0][0] && g1.players[1].general === seen[1][0]);
  check('A：体力=武将体力上限', g1.players.every(p => p.hp === p.maxHp && p.maxHp === require('../engine/game').GENERALS[p.general].hp));
  check('A：技能与将池一致', g1.players.every(p => JSON.stringify(p.skills) === JSON.stringify(require('../engine/game').GENERALS[p.general].skills)));
  check('A：起手各4张', g1.players.every(p => p.hand.length === 4));
  check('A：载荷注明先手（first=0 → 玩家true/AI false）', seenFirst[0] === true && seenFirst[1] === false);
  check('A：牌数守恒154', g1.invariant().ok);
  check('A：选将决策全记录', g1.decisionLog.length === 2 && g1.decisionLog.every(m => m.kind === 'choice'));

  // ── B. 非法选择重问 ──
  let xjCalls = 0;
  const seen2 = [];
  const g2 = new Game({
    seed: 422, selectGenerals: true, first: 0,
    ask: async (d) => {
      if (d.type !== 'xuanjiang') return d.playable[0];
      xjCalls++; seen2.push(d.context.candidates.slice());
      if (xjCalls === 1) return { kind: 'choice', value: '不存在的武将' }; // 非法 → 引擎重问
      return { kind: 'choice', value: d.context.candidates[1] };
    },
  });
  await g2.setup();
  check('B：P0被重问（非法1次+合法1次）+P1一次', xjCalls === 3 && seen2.length === 3);
  check('B：P0选中第2候选', g2.players[0].general === seen2[0][1]);
  check('B：P1同样选中第2候选（钩子对2/3次都返回candidates[1]）', g2.players[1].general === seen2[2][1]);
  check('B：牌数守恒154', g2.invariant().ok);

  // ── C. 全非法 → 随机兜底仍是候选 ──
  const g3 = new Game({
    seed: 423, selectGenerals: true, first: 0,
    ask: async (d) => (d.type === 'xuanjiang' ? { kind: 'choice', value: '乱写' } : d.playable[0]),
  });
  await g3.setup();
  check('C：兜底选中的是候选之一', g3.players[0].general !== '乱写' && g3.players[1].general !== '乱写');
  check('C：牌数守恒154', g3.invariant().ok);

  // ── D. 存档恢复：重放选将决策 ──
  const d = g1.saveData();
  check('D：存档带xuanjiang标记', d.xuanjiang === true && d.generals.length === 2);
  const g4 = new Game({
    seed: d.seed, generals: d.generals, first: d.first,
    replay: d.decisions, replayXuanjiang: d.xuanjiang,
    ask: async () => { throw new Error('重放期间不应有实时询问'); },
  });
  await g4.setup();
  check('D：恢复后武将与原局一致', g4.players[0].general === g1.players[0].general && g4.players[1].general === g1.players[1].general);
  check('D：重放耗尽（决策流对齐）', g4._replay.length === 0);
  check('D：决策日志与原局一致', JSON.stringify(g4.decisionLog) === JSON.stringify(g1.decisionLog));
  check('D：牌堆顺序一致', g4.drawPile.map(c => c.id).join(',') === g1.drawPile.map(c => c.id).join(','));
  check('D：起手手牌一致', g4.players.every((p, i) => p.hand.map(c => c.id).join(',') === g1.players[i].hand.map(c => c.id).join(',')));
  check('D：体力一致', g4.players.every((p, i) => p.hp === g1.players[i].hp && p.maxHp === g1.players[i].maxHp));

  // ── E. 旧式存档（无选将）：generals直接生效 ──
  const pool = Object.keys(require('../engine/game').GENERALS);
  const n0 = pool.find(n => n === '刘备') || pool[0];
  const n1 = pool[pool.indexOf(n0) + 1];
  let oldAsked = 0;
  const g5 = new Game({
    seed: 77, generals: [n0, n1], first: 0,
    replay: [], replayXuanjiang: false,
    ask: async (dv) => { if (dv.type === 'xuanjiang') oldAsked++; return dv.playable[0]; },
  });
  await g5.setup();
  check('E：不触发选将询问', oldAsked === 0);
  check('E：武将为指定值', g5.players[0].general === n0 && g5.players[1].general === n1);

  // ── F. AI动作格式映射 ──
  const g6 = new Game({ seed: 1, generals: [n0, n1], ask: async x => x.playable[0] });
  await g6.setup();
  const dec = { type: 'xuanjiang', playable: [{ kind: 'choice', value: n0 }, { kind: 'choice', value: n1 }] };
  const mv = g6.matchMove(dec, { action: 'choose', choice: n1 });
  check('F：choose/choice映射为选将动作', !!mv && mv.kind === 'choice' && mv.value === n1);
  check('F：非法武将名被拒', g6.matchMove(dec, { action: 'choose', choice: '不存在' }) === null);

  console.log(`结果：${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
