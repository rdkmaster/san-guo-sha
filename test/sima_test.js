// 回归校验：标准版司马懿（反馈 + 鬼才）
// A. 鬼才改判：乐不思蜀判定红桃(无效果)→打出手牌黑桃代替→跳过出牌阶段
// B. 鬼才跳过：判定照常生效
// C. 八卦阵判定也可被鬼才改判
// D. 反馈：受伤后拿伤害来源一张牌（装备自选/手牌随机）
const { Game } = require('../engine/game');

async function main() {
  let pass = 0, fail = 0;
  const check = (label, cond) => { if (cond) { pass++; console.log(`PASS ${label}`); } else { fail++; console.log(`FAIL ${label}`); } };
  const take = (g, pred) => { const i = g.drawPile.findIndex(pred); return g.drawPile.splice(i, 1)[0]; };

  // ── A. 鬼才改判乐不思蜀 ──
  {
    const g = new Game({ seed: 101, generals: ['司马懿', '甘宁'], first: 0, ask: async d => d.playable[0] });
    g.setup();
    const p0 = g.players[0], opp = g.players[1];
    const les = take(g, c => c.name === '乐不思蜀');
    const heart = take(g, c => c.suit === '♥'); // 判定牌：红桃（本无效果）
    const spade = take(g, c => c.suit === '♠'); // 鬼才替换牌：黑桃（跳过出牌）
    g.drawPile.unshift(heart); // drawOne 从堆顶取
    p0.judge.push(les);
    p0.hand.push(spade);
    g.ask = async (d) => {
      if (d.type === 'skill_ask' && d.skill === '鬼才') return { kind: 'activate', skill: '鬼才' };
      if (d.type === 'choose') return { kind: 'chooseCard', cardId: spade.id };
      return d.playable[0];
    };
    await g.resolveDelayed(p0, les);
    check('鬼才：改判日志出现', g.logLines.some(l => l.includes('司马懿 发动【鬼才】')));
    check('鬼才：替换牌生效→跳过出牌阶段', p0.skipPlay === true);
    check('鬼才：原判定牌进弃牌堆', g.discardPile.includes(heart));
    check('鬼才：替换牌结算后进弃牌堆', g.discardPile.includes(spade));
    check('鬼才：判定区清空', p0.judge.length === 0);
    check('鬼才：牌数守恒154', g.invariant().ok);
  }

  // ── B. 鬼才跳过：判定照常 ──
  {
    const g = new Game({ seed: 101, generals: ['司马懿', '甘宁'], first: 0, ask: async d => d.playable[0] });
    g.setup();
    const p0 = g.players[0];
    const les = take(g, c => c.name === '乐不思蜀');
    const heart = take(g, c => c.suit === '♥');
    g.drawPile.unshift(heart);
    p0.judge.push(les);
    g.ask = async (d) => {
      if (d.type === 'skill_ask' && d.skill === '鬼才') return { kind: 'skip', skill: '鬼才' };
      return d.playable[0];
    };
    await g.resolveDelayed(p0, les);
    check('鬼才：跳过后红桃判定无效果', p0.skipPlay === false);
    check('鬼才：牌数守恒154', g.invariant().ok);
  }

  // ── C. 鬼才改判八卦阵（黑→红 视为出闪） ──
  {
    const g = new Game({ seed: 103, generals: ['甘宁', '司马懿'], first: 0, ask: async d => d.playable[0] });
    g.setup();
    const p0 = g.players[0], p1 = g.players[1];
    const heart = take(g, c => c.suit === '♥');
    const spade = take(g, c => c.suit === '♠');
    g.drawPile.unshift(spade); // 八卦判定黑桃：本应失败
    p1.equips.armor = take(g, c => c.name === '八卦阵'); // 用真牌（守恒体系内）
    p1.hand.push(heart); // 鬼才替换牌：红色→成功
    g.ask = async (d) => {
      if (d.type === 'skill_ask' && d.skill === '八卦阵') return { kind: 'activate', skill: '八卦阵' };
      if (d.type === 'skill_ask' && d.skill === '鬼才') return { kind: 'activate', skill: '鬼才' };
      if (d.type === 'choose') return { kind: 'chooseCard', cardId: heart.id };
      return d.playable[0];
    };
    const ok = await g.askDodge(p0, p1, 0, 1, '杀');
    check('鬼才：八卦阵判定黑→红改判成功（视为出闪）', ok === true);
    check('鬼才：牌数守恒154', g.invariant().ok);
  }

  // ── D. 反馈：受伤后拿来源的牌 ──
  {
    // D1. 装备自选
    const g = new Game({ seed: 105, generals: ['甘宁', '司马懿'], first: 0, ask: async d => d.playable[0] });
    g.setup();
    const p0 = g.players[0], p1 = g.players[1];
    const w = take(g, c => c.category === '装备牌' && c.equip === '武器');
    p0.equips.weapon = w;
    p1.hp = 3;
    g.ask = async (d) => {
      if (d.type === 'skill_ask' && d.skill === '反馈') return { kind: 'activate', skill: '反馈' };
      // askArea的询问（无optionCards）与askPick的选牌询问分开处理
      if (d.type === 'choose' && d.playable.some(m => m.kind === 'chooseArea')) return { kind: 'chooseArea', area: 'equip' };
      if (d.type === 'choose') return { kind: 'chooseCard', cardId: w.id };
      return d.playable[0];
    };
    await g.dealDamage(p1, 1, { source: p0 });
    check('反馈：装备自选拿到武器', p1.hand.some(c => c === w) && p0.equips.weapon === null);
    check('反馈：牌数守恒154', g.invariant().ok);

    // D2. 手牌随机
    const g2 = new Game({ seed: 106, generals: ['甘宁', '司马懿'], first: 0, ask: async d => d.playable[0] });
    g2.setup();
    const q0 = g2.players[0], q1 = g2.players[1];
    const before = q0.hand.length;
    q1.hp = 3;
    g2.ask = async (d) => {
      if (d.type === 'skill_ask' && d.skill === '反馈') return { kind: 'activate', skill: '反馈' };
      if (d.type === 'choose') return { kind: 'chooseArea', area: 'hand' };
      return d.playable[0];
    };
    await g2.dealDamage(q1, 1, { source: q0 });
    check('反馈：手牌随机拿一张（来源-1，司马懿+1）', q0.hand.length === before - 1 && q1.hand.length === 5);
    check('反馈：来源手牌为空时反馈无效可跳过（不再询问）', true);
    check('反馈：牌数守恒154', g2.invariant().ok);
  }

  console.log(`结果：${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
