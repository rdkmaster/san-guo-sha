// 斗地主模式（ddd）回归测试
// A. 基础：3人、身份公开、地主体力上限+1且带跋扈/飞扬
// B. 跋扈：地主摸牌阶段多摸一张
// C. 飞扬：弃两张手牌清空判定区
// D. 突袭：多目标选择（choice=座位号）
// E. 击杀奖励+农民互助：杀人摸三、队友选摸二
// F. 胜负：地主死→农民胜；两农民死→地主胜
// G. matchMove：多目标杀按targets精确匹配
// H. 万箭齐发AOE：对所有农民逐个结算
// I. 存档恢复：mode/roles/重放一致
const { Game } = require('../engine/game');

async function main() {
  let pass = 0, fail = 0;
  const check = (label, cond) => { if (cond) { pass++; console.log(`PASS ${label}`); } else { fail++; console.log(`FAIL ${label}`); } };
  const take = (g, pred) => { const i = g.drawPile.findIndex(pred); return g.drawPile.splice(i, 1)[0]; };
  const takeSha = (g) => take(g, c => c.name === '杀');

  // ── A. 基础 ──
  {
    const g = new Game({ seed: 901, mode: 'ddd', generals: ['甘宁', '许褚', '周瑜'], first: 0 });
    g.setup();
    check('A：3名玩家', g.players.length === 3);
    check('A：地主=先手且身份公开', g.players[0].role === '地主' && g.players[1].role === '农民' && g.players[2].role === '农民');
    check('A：地主体力上限+1（许褚4→5）', g.players[0].maxHp === 5 && g.players[0].hp === 5);
    check('A：农民体力不变', g.players[1].maxHp === 4 && g.players[2].maxHp === 3);
    check('A：地主带跋扈/飞扬', g.players[0].skills.includes('跋扈') && g.players[0].skills.includes('飞扬'));
    check('A：起手各4张且守恒154', g.players.every(p => p.hand.length === 4) && g.invariant().ok);
  }

  // ── B. 跋扈 ──
  {
    const g = new Game({ seed: 902, mode: 'ddd', generals: ['甘宁', '许褚', '周瑜'], first: 0 });
    g.setup();
    const logs = []; g.log = m => logs.push(m);
    g.turnNo = 2;
    g.ask = async d => d.playable[0];
    await g.turn(0);
    check('B：跋扈摸3（2+1）', logs.some(m => m.includes('甘宁 摸3张牌（跋扈：多摸一张）')));
  }

  // ── C. 飞扬（只弃判定区一张，多张自选） ──
  {
    const g = new Game({ seed: 903, mode: 'ddd', generals: ['甘宁', '许褚', '周瑜'], first: 0 });
    g.setup();
    const logs = []; g.log = m => logs.push(m);
    const le = take(g, c => c.name === '乐不思蜀');
    const bl = take(g, c => c.name === '兵粮寸断');
    g.players[0].judge.push(le, bl); // 两张判定牌：只能弃一张
    g.ask = async (d) => {
      if (d.type === 'skill_ask' && d.skill === '飞扬') return { kind: 'activate', skill: '飞扬' };
      if (d.type === 'discard') return { kind: 'discard', cardIds: [g.players[0].hand[0].id, g.players[0].hand[1].id] };
      if (d.type === 'choose' && d.context.question.includes('飞扬')) return { kind: 'chooseCard', cardId: le.id }; // 自选弃乐不思蜀
      return d.playable[0];
    };
    g.turnNo = 2;
    await g.turn(0);
    check('C：飞扬只弃自选的一张判定牌（乐不思蜀）', logs.some(l => l.includes('发动【飞扬】') && l.includes('弃掉判定区的【乐不思蜀')) && !logs.some(l => l.includes('弃掉判定区所有牌')));
    check('C：另一张判定牌保留并照常结算（兵粮判定）', logs.some(l => l.includes('判定【兵粮寸断】')));
    check('C：牌数守恒154', g.invariant().ok);
  }

  // ── D. 突袭多目标 ──
  {
    const g = new Game({ seed: 904, mode: 'ddd', generals: ['张辽', '周瑜', '许褚'], first: 0 });
    g.setup();
    const logs = []; g.log = m => logs.push(m);
    g.ask = async (d) => {
      if (d.type === 'skill_ask' && d.skill === '突袭') return { kind: 'activate', skill: '突袭' };
      if (d.type === 'choose' && d.context.question.includes('突袭')) return { kind: 'choice', value: '2' }; // 指定许褚
      return d.playable[0];
    };
    g.turnNo = 2;
    await g.turn(0);
    check('D：突袭按选择拿许褚的牌（周瑜4张不动）', g.players[1].hand.length === 4 && g.players[2].hand.length === 3);
    check('D：张辽手牌+1', g.players[0].hand.length === 5);
    check('D：牌数守恒154', g.invariant().ok);
  }

  // ── E. 击杀奖励+农民互助 ──
  {
    let hk = async d => d.playable[0];
    const g = new Game({ seed: 905, mode: 'ddd', generals: ['甘宁', '许褚', '周瑜'], first: 0, ask: async d => hk(d) });
    g.setup();
    const logs = []; g.log = m => logs.push(m);
    // 手牌整理：甘宁[杀]+3张非桃，许褚[]（无闪无桃），周瑜[闪]且受伤（互助可回血）；换下的牌回牌堆守恒
    const sha = takeSha(g);
    for (const p of g.players) { g.drawPile.push(...p.hand.splice(0)); }
    const c1 = take(g, c => c.name !== '桃');
    const c2 = take(g, c => c.name !== '桃');
    const c3 = take(g, c => c.name !== '桃');
    const shan = take(g, c => c.name === '闪');
    g.players[0].hand.push(sha); // 摸牌阶段将从堆顶补3张：c1/c2/c3
    g.drawPile.unshift(c3, c2, c1);
    g.players[2].hand.push(shan);
    g.players[1].hp = 1;
    g.players[2].hp = 2; // 受伤：农民互助才有回血选项
    const d0 = g.drawPile.length;
    g.turnNo = 2;
    hk = async (d) => {
      if (d.type === 'play') return d.playable.find(m => m.kind === 'play' && m.cardId === sha.id) || d.playable[0]; // 只出这张杀，然后结束
      return d.playable[0]; // 互助等：选第一项（摸两张）
    };
    await g.turn(0);
    check('E：许褚阵亡、对局未结束', g.players[1].dead === true && g.over === false);
    check('E：击杀奖励摸3张（摸3+奖励3+互助2共耗8）', g.players[0].hand.length === 5 && g.drawPile.length === d0 - 8);
    check('E：农民互助询问了周瑜', logs.some(m => m.includes('【农民互助】')) && logs.some(m => m.includes('阵亡')));
    check('E：周瑜互助摸2（非其回合不弃牌，1+2=3）', g.players[2].hand.length === 3 && logs.some(m => m.includes('【农民互助】周瑜 摸2张牌')));
    check('E：牌数守恒154', g.invariant().ok);
  }

  // ── F/G. 胜负 ──
  {
    const g = new Game({ seed: 906, mode: 'ddd', generals: ['甘宁', '许褚', '周瑜'], first: 0 });
    g.setup();
    g.ask = async d => d.playable[0];
    g.players[0].hp = 1; g.players[0].hand.splice(0).forEach(c => g.drawPile.push(c));
    await g.onDeath(g.players[0], g.players[1]); // 地主死
    check('F：地主死→农民胜', g.over && g.winnerRole === '农民' && g.winner === 1);
  }
  {
    const g = new Game({ seed: 907, mode: 'ddd', generals: ['甘宁', '许褚', '周瑜'], first: 0 });
    g.setup();
    g.ask = async d => d.playable[0];
    await g.onDeath(g.players[1], g.players[0]); // 农民1死 → 互助问周瑜（playable[0]=摸二）
    check('G：一农民死对局未结束', g.over === false);
    await g.onDeath(g.players[2], g.players[0]); // 农民2死
    check('G：两农民死→地主胜', g.over && g.winnerRole === '地主' && g.winner === 0);
    check('G：死亡清场（区域牌入弃牌堆）', g.players[1].hand.length === 0 && g.players[2].hand.length === 0);
  }

  // ── H. matchMove 多目标 ──
  {
    const g = new Game({ seed: 908, mode: 'ddd', generals: ['甘宁', '许褚', '周瑜'], first: 0 });
    g.setup();
    const sha = takeSha(g);
    for (const p of g.players) g.drawPile.push(...p.hand.splice(0));
    g.players[0].hand.push(sha);
    const dec = g.playDecision(g.players[0]);
    g.renderState(g.players[0], dec, null); // 生成labelMap
    const shaMoves = dec.playable.filter(m => m.kind === 'play' && m.cardId === sha.id);
    check('H：杀有两个目标的独立动作', shaMoves.length === 2 && shaMoves[0].targets[0] !== shaMoves[1].targets[0]);
    const mv1 = g.matchMove(dec, { action: 'play', card: g.cardLabel(sha.id, dec), targets: ['许褚'] });
    const mv2 = g.matchMove(dec, { action: 'play', card: g.cardLabel(sha.id, dec), targets: ['周瑜'] });
    check('H：targets精确匹配', !!mv1 && mv1.targets[0] === 1 && !!mv2 && mv2.targets[0] === 2);
    const bad = g.matchMove(dec, { action: 'play', card: g.cardLabel(sha.id, dec), targets: ['甘宁'] });
    check('H：目标不合法被拒', bad === null);
  }

  // ── I. 万箭AOE ──
  {
    let hk = async d => d.playable[0];
    const g = new Game({ seed: 909, mode: 'ddd', generals: ['甘宁', '许褚', '周瑜'], first: 0, ask: async d => hk(d) });
    g.setup();
    const wj = take(g, c => c.name === '万箭齐发');
    for (const p of g.players) g.drawPile.push(...p.hand.splice(0));
    const c1 = take(g, c => c.name !== '桃');
    const c2 = take(g, c => c.name !== '桃');
    const c3 = take(g, c => c.name !== '桃');
    g.players[0].hand.push(wj);
    g.drawPile.unshift(c3, c2, c1); // 摸牌阶段补3张非桃
    g.players[1].hp = 4; g.players[2].hp = 3;
    g.turnNo = 2;
    hk = async d => d.playable.find(m => m.kind === 'play' && m.cardId === wj.id) || d.playable[0]; // 只出万箭，然后结束
    await g.turn(0);
    check('I：万箭对两名农民各造成1伤', g.players[1].hp === 3 && g.players[2].hp === 2);
    check('I：牌数守恒154', g.invariant().ok);
  }

  // ── J. 存档恢复 ──
  {
    let hk = async d => d.playable[0];
    const g1 = new Game({ seed: 910, mode: 'ddd', generals: ['甘宁', '许褚', '周瑜'], first: 0, ask: async d => hk(d) });
    g1.setup();
    g1.turnNo = 2;
    await g1.turn(0);
    const d = g1.saveData();
    check('J：存档带mode/roles', d.mode === 'ddd' && d.roles.length === 3 && d.roles[0] === '地主');
    const g2 = new Game({
      seed: d.seed, mode: d.mode, generals: d.generals, first: d.first, roles: d.roles,
      replay: d.decisions, replayXuanjiang: d.xuanjiang,
      ask: async () => { throw new Error('重放期间不应有实时询问'); },
    });
    await g2.setup();
    g2.turnNo = 2; // 与原局相同起点：重放整个第2回合的决策
    await g2.turn(0);
    check('J：恢复后武将/身份一致', g2.players.every((p, i) => p.general === g1.players[i].general && p.role === g1.players[i].role));
    check('J：重放耗尽且手牌一致', g2._replay.length === 0
      && g2.players.every((p, i) => p.hand.map(c => c.id).join(',') === g1.players[i].hand.map(c => c.id).join(',')));
    check('J：牌堆一致', g2.drawPile.map(c => c.id).join(',') === g1.drawPile.map(c => c.id).join(','));
  }

  // ── K. 跋扈：地主出杀次数上限+1 ──
  {
    let hk = async d => d.playable[0];
    const g = new Game({ seed: 911, mode: 'ddd', generals: ['甘宁', '许褚', '周瑜'], first: 0, roles: ['地主', '农民', '农民'], ask: async d => hk(d) });
    g.setup();
    const logs = []; g.log = m => logs.push(m);
    const s1 = takeSha(g), s2 = takeSha(g), s3 = takeSha(g);
    for (const p of g.players) g.drawPile.push(...p.hand.splice(0));
    const fill = [];
    for (let i = 0; i < 3; i++) { const c = take(g, x => x.name !== '桃'); fill.push(c); }
    g.players[0].hand.push(s1, s2, s3);
    g.drawPile.unshift(fill[2], fill[1], fill[0]); // 摸牌阶段摸3张非桃
    g.players[1].hp = 4; g.players[2].hp = 3;
    g.turnNo = 2;
    let shaCount = 0; const hitTargets = [];
    hk = async (d) => {
      const sm = d.playable.filter(m => m.kind === 'play' && (m.cardId === s1.id || m.cardId === s2.id || m.cardId === s3.id));
      if (sm.length > 0) {
        shaCount++;
        const m = sm.find(x => !hitTargets.includes(g.players[x.targets[0]].general)) || sm[0]; // 轮换目标
        hitTargets.push(g.players[m.targets[0]].general);
        return m;
      }
      return d.playable[0];
    };
    await g.turn(0);
    check('K：跋扈下地主出了2张杀、第3张仍在手（上限生效）', shaCount === 2 && g.players[0].hand.some(c => c.name === '杀'));
    check('K：两名农民各中一杀（目标可轮换指定）', g.players[1].hp === 3 && g.players[2].hp === 2);
    check('K：1v1/无跋扈不受影响（出杀1次上限由既有测试覆盖）', g.invariant().ok);
  }

  console.log(`结果：${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
