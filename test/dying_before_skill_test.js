// 回归校验：受到伤害后可发动的技能（奸雄/反馈）若伤害导致濒死，
// 须先结算濒死求援，被救回脱离濒死后才能发动；阵亡则不发动。
// A. 曹操濒死 → 先问【桃】自救 → 救回后才问奸雄
// B. 曹操濒死无桃可救 → 阵亡，不再询问奸雄
const { Game } = require('../engine/game');

async function main() {
  let pass = 0, fail = 0;
  const check = (label, cond) => { if (cond) { pass++; console.log(`PASS ${label}`); } else { fail++; console.log(`FAIL ${label}`); } };
  const take = (g, pred) => { const i = g.drawPile.findIndex(pred); return g.drawPile.splice(i, 1)[0]; };
  // 把双方手牌中匹配的牌移回牌堆底（保证牌数守恒），确保濒死询问顺序可预期
  const stripHands = (g, pred) => {
    for (const p of g.players) {
      const removed = p.hand.filter(pred);
      p.hand = p.hand.filter(c => !pred(c));
      g.drawPile.push(...removed);
    }
  };

  // ── A. 濒死被救回后才能发动奸雄 ──
  {
    const g = new Game({ seed: 201, generals: ['曹操', '甘宁'], first: 0, ask: async d => d.playable[0] });
    g.setup();
    const p0 = g.players[0], p1 = g.players[1];
    const dmgCard = take(g, c => c.category === '锦囊牌'); // 造成伤害的牌（奸雄可拿）
    const tao = take(g, c => c.name === '桃');
    p0.hp = 1;
    // 清掉手中桃/酒，确保自救只能用刚给的这张桃，顺序可预期
    stripHands(g, c => c.name === '桃' || c.name === '酒');
    p0.hand.push(tao);
    const seq = [];
    g.ask = async (d) => {
      seq.push(`${d.playerIdx}:${d.type}:${d.skill || ''}`);
      if (d.type === 'dying') {
        const t = d.playable.find(m => m.kind === 'tao');
        if (t) return { kind: 'tao', cardId: t.cardId };
      }
      if (d.type === 'skill_ask' && d.skill === '奸雄') return { kind: 'activate', skill: '奸雄' };
      return d.playable[0];
    };
    await g.dealDamage(p0, 1, { source: p1, card: dmgCard });
    const dyingIdx = seq.findIndex(s => s.endsWith(':dying:'));
    const jcIdx = seq.findIndex(s => s === '0:skill_ask:奸雄');
    check('A: 濒死时先询问求援', dyingIdx >= 0);
    check('A: 救回脱离濒死后才询问奸雄', jcIdx >= 0 && jcIdx > dyingIdx);
    check('A: 桃自救成功（体力0→1/4）', p0.hp === 1);
    check('A: 救回后奸雄拿到伤害牌', p0.hand.includes(dmgCard));
    check('A: 牌数守恒154', g.invariant().ok);
  }

  // ── B. 濒死阵亡则不发动 ──
  {
    const g = new Game({ seed: 202, generals: ['曹操', '甘宁'], first: 0, ask: async d => d.playable[0] });
    g.setup();
    const p0 = g.players[0], p1 = g.players[1];
    const dmgCard = take(g, c => c.category === '锦囊牌');
    p0.hp = 1;
    // 双方手牌都无桃，且曹操无酒（不能自救）
    stripHands(g, c => c.name === '桃' || c.name === '酒');
    const seq = [];
    g.ask = async (d) => { seq.push(`${d.playerIdx}:${d.type}:${d.skill || ''}`); return d.playable[0]; };
    await g.dealDamage(p0, 1, { source: p1, card: dmgCard });
    check('B: 无桃可救→阵亡，游戏结束', g.over === true && g.winner === 1);
    check('B: 阵亡不询问奸雄', !seq.some(s => s === '0:skill_ask:奸雄'));
    // 直接调用dealDamage时伤害牌留在limbo，此处模拟调用方（杀/闪电结算）的弃牌兜底
    g.limbo.delete(dmgCard);
    g.toDiscard(dmgCard);
    check('B: 牌数守恒154', g.invariant().ok);
  }

  console.log(`结果：${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
