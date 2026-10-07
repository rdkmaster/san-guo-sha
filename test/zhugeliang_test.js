// 回归校验：标准版诸葛亮（观星 + 空城）
// A. 空城：诸葛亮无手牌时，对手的【杀】/【决斗】不能指定他（有手牌恢复可指定）
// B. 观星：准备阶段一次性亮出牌堆顶2张，一次决策逐张指定置于牌堆顶/底并生效
const { Game } = require('../engine/game');

async function main() {
  let pass = 0, fail = 0;
  const check = (label, cond) => { if (cond) { pass++; console.log(`PASS ${label}`); } else { fail++; console.log(`FAIL ${label}`); } };

  // ── A. 空城 ──
  {
    const g = new Game({ seed: 7, generals: ['甘宁', '诸葛亮'], first: 0, ask: async d => d.playable[0] });
    g.setup();
    const p0 = g.players[0], zgl = g.players[1];
    // 给甘宁一张杀和一张决斗
    const sha = g.drawPile.find(c => c.name === '杀');
    const juedou = g.drawPile.find(c => c.name === '决斗');
    p0.hand.push(sha, juedou);
    zgl.hand = []; // 空城生效
    let d = g.playDecision(p0);
    check('空城：无手牌时杀不可指定诸葛亮', !d.playable.some(m => m.kind === 'play' && m.cardId === sha.id));
    check('空城：无手牌时决斗不可指定诸葛亮', !d.playable.some(m => m.kind === 'play' && m.cardId === juedou.id));
    check('空城：结束出牌仍可用', d.playable.some(m => m.kind === 'end'));

    zgl.hand.push(g.drawPile.find(c => c.name === '闪')); // 有手牌 → 空城失效
    d = g.playDecision(p0);
    check('空城解除：有手牌时杀可指定', d.playable.some(m => m.kind === 'play' && m.cardId === sha.id));
    check('空城解除：有手牌时决斗可指定', d.playable.some(m => m.kind === 'play' && m.cardId === juedou.id));
    check('诸葛亮注册：3血蜀将双技能', zgl.maxHp === 3 && zgl.skills.join(',') === '观星,空城');
  }

  // ── B. 观星（一次性分配决策） ──
  {
    const g = new Game({ seed: 13, generals: ['诸葛亮', '甘宁'], first: 0, ask: async d => d.playable[0] });
    g.setup();
    const p0 = g.players[0];
    const viewed = [];
    let guanxingAsks = 0;
    // 脚本：发动观星；一次 guanxing 决策把第一张置顶、第二张置底
    g.ask = async (d) => {
      if (d.type === 'skill_ask') return { kind: 'activate', skill: '观星' };
      if (d.type === 'guanxing') {
        guanxingAsks++;
        const [c1, c2] = d.optionCards;
        viewed.push(c1, c2);
        return { kind: 'guanxing', tops: [c1.id], bottoms: [c2.id] };
      }
      return d.playable[0];
    };
    await g.guanxing(p0);
    const [c1, c2] = viewed;
    check('观星：观看了牌堆顶2张', viewed.length === 2);
    check('观星：一次性决策（仅1次分配询问）', guanxingAsks === 1);
    check('观星：第一张置于顶（下次摸到）', c1 && g.drawPile[0] === c1);
    check('观星：第二张置于底', c2 && g.drawPile[g.drawPile.length - 1] === c2);
    check('观星：牌数守恒154', g.invariant().ok);
  }

  // ── C. 观星分配不合法兜底（缺牌 → 全部置于顶） ──
  {
    const g = new Game({ seed: 13, generals: ['诸葛亮', '甘宁'], first: 0, ask: async d => d.playable[0] });
    g.setup();
    const p0 = g.players[0];
    const before = g.drawPile.slice(0, 2);
    g.ask = async (d) => {
      if (d.type === 'skill_ask') return { kind: 'activate', skill: '观星' };
      if (d.type === 'guanxing') return { kind: 'guanxing', tops: [], bottoms: [] }; // 漏分一张
      return d.playable[0];
    };
    await g.guanxing(p0);
    check('观星兜底：分配不完整→全部置于牌堆顶', g.drawPile[0] === before[0] && g.drawPile[1] === before[1]);
    check('观星兜底：牌数守恒154', g.invariant().ok);
  }

  console.log(`结果：${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
