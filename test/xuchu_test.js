// 回归校验：标准版许褚（裸衣）
// A. 裸衣发动：少摸一张（2→1），本回合杀伤害+1
// B. 裸衣跳过：正常摸2张，无加成
// C. 裸衣决斗伤害+1；D. 酒+裸衣叠加
const { Game } = require('../engine/game');

async function main() {
  let pass = 0, fail = 0;
  const check = (label, cond) => { if (cond) { pass++; console.log(`PASS ${label}`); } else { fail++; console.log(`FAIL ${label}`); } };
  // 把对手手里的闪（含龙胆杀）移回牌堆，保证攻击必然命中，同时牌数守恒
  const stripShans = (g, opp) => {
    const shans = opp.hand.filter(c => c.name === '闪' || (c.name === '杀' && opp.skills.includes('龙胆')));
    g.drawPile.push(...shans);
    opp.hand = opp.hand.filter(c => !shans.includes(c));
    return shans.length;
  };

  // ── A. 裸衣发动：少摸一张 + 杀伤害+1 ──
  {
    const g = new Game({ seed: 66, generals: ['许褚', '甘宁'], first: 0, ask: async d => d.playable[0] });
    g.setup();
    const p0 = g.players[0], opp = g.players[1];
    const logs = [];
    g.log = (m) => { logs.push(m); };
    stripShans(g, opp);
    const sha = (() => { const i = g.drawPile.findIndex(c => c.name === '杀'); return g.drawPile.splice(i, 1)[0]; })();
    p0.hand.push(sha);
    opp.hp = 4;
    let shaPlayed = false;
    g.ask = async (d) => {
      if (d.type === 'skill_ask' && d.skill === '裸衣') return { kind: 'activate', skill: '裸衣' };
      if (d.type === 'play' && !shaPlayed) { shaPlayed = true; return { kind: 'play', cardId: sha.id, targets: [1] }; }
      return d.playable[0];
    };
    g.turnNo = 2;
    await g.turn(0);
    check('裸衣：摸牌阶段只摸1张', logs.some(m => m.includes('许褚 摸1张牌（裸衣：少摸一张，本回合杀/决斗伤害+1）')));
    check('裸衣：杀伤害+1（甘宁4→2）', opp.hp === 2);
    check('裸衣：牌数守恒154', g.invariant().ok);
  }

  // ── B. 裸衣跳过：不强制 ──
  {
    const g = new Game({ seed: 66, generals: ['许褚', '甘宁'], first: 0, ask: async d => d.playable[0] });
    g.setup();
    const p0 = g.players[0], opp = g.players[1];
    const logs = [];
    g.log = (m) => { logs.push(m); };
    stripShans(g, opp);
    const sha = (() => { const i = g.drawPile.findIndex(c => c.name === '杀'); return g.drawPile.splice(i, 1)[0]; })();
    p0.hand.push(sha);
    opp.hp = 4;
    let shaPlayed = false;
    g.ask = async (d) => {
      if (d.type === 'skill_ask' && d.skill === '裸衣') return { kind: 'skip', skill: '裸衣' };
      if (d.type === 'play' && !shaPlayed) { shaPlayed = true; return { kind: 'play', cardId: sha.id, targets: [1] }; }
      return d.playable[0];
    };
    g.turnNo = 2;
    await g.turn(0);
    check('裸衣：跳过后正常摸2张（不强制）', logs.some(m => m === '许褚 摸2张牌'));
    check('裸衣：跳过无加成（甘宁4→3）', opp.hp === 3);
  }

  // ── C. 裸衣决斗伤害+1 ──
  {
    const g = new Game({ seed: 77, generals: ['许褚', '甘宁'], first: 0, ask: async d => d.playable[0] });
    g.setup();
    const p0 = g.players[0], opp = g.players[1];
    const juedou = (() => { const i = g.drawPile.findIndex(c => c.name === '决斗'); return g.drawPile.splice(i, 1)[0]; })();
    p0.hand.push(juedou);
    g.drawPile.push(...opp.hand); // 对手交还全部手牌（无杀可打出），保持守恒
    opp.hand = [];
    opp.hp = 4;
    p0.luoyi = true; // 摸牌阶段直接调用executePlay，跳过了裸衣询问，直接置位
    g.ask = async (d) => d.playable[0];
    await g.executePlay(p0, { kind: 'play', cardId: juedou.id, targets: [1] });
    check('裸衣：决斗伤害+1（甘宁4→2）', opp.hp === 2);
    check('裸衣：牌数守恒154', g.invariant().ok);
  }

  // ── D. 酒+裸衣叠加：杀伤害3 ──
  {
    const g = new Game({ seed: 88, generals: ['许褚', '甘宁'], first: 0, ask: async d => d.playable[0] });
    g.setup();
    const p0 = g.players[0], opp = g.players[1];
    stripShans(g, opp);
    const take = (pred) => { const i = g.drawPile.findIndex(pred); return g.drawPile.splice(i, 1)[0]; };
    const jiu = take(c => c.name === '酒');
    const sha = take(c => c.name === '杀');
    p0.hand.push(jiu, sha);
    opp.hp = 4;
    p0.luoyi = true;
    g.ask = async (d) => d.playable[0];
    await g.executePlay(p0, { kind: 'play', cardId: jiu.id, targets: [0] });
    await g.executePlay(p0, { kind: 'play', cardId: sha.id, targets: [1] });
    check('裸衣：酒+裸衣杀伤害3（甘宁4→1）', opp.hp === 1);
    check('裸衣：牌数守恒154', g.invariant().ok);
  }

  console.log(`结果：${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
