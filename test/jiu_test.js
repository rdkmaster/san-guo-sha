// 专项校验：酒只加成"本回合下一张【杀】"，不会加成整回合所有【杀】
// A. 咆哮张飞：酒+杀=2伤，紧接着的第二张杀=1伤（若=5血则说明酒加成了所有杀）
// B. 酒后的杀被【闪】抵消：酒照常消耗，下一张杀无加成
const { Game } = require('../engine/game');

async function main() {
  let pass = 0, fail = 0;
  const check = (label, cond) => { if (cond) { pass++; console.log(`PASS ${label}`); } else { fail++; console.log(`FAIL ${label}`); } };
  const stripShans = (g, opp) => {
    const shans = opp.hand.filter(c => c.name === '闪');
    g.drawPile.push(...shans);
    opp.hand = opp.hand.filter(c => !shans.includes(c));
  };

  // ── A. 酒只加成下一张杀 ──
  {
    const g = new Game({ seed: 5, generals: ['张飞', '甘宁'], first: 0, ask: async d => d.playable[0] });
    g.setup();
    const p0 = g.players[0], opp = g.players[1];
    stripShans(g, opp);
    const take = (pred) => { const i = g.drawPile.findIndex(pred); return g.drawPile.splice(i, 1)[0]; };
    const jiu = take(c => c.name === '酒');
    const sha1 = take(c => c.name === '杀');
    const sha2 = take(c => c.name === '杀');
    p0.hand.push(jiu, sha1, sha2);
    opp.hp = 9;
    let usedSha = 0;
    g.ask = async (d) => {
      if (d.type !== 'play') return d.playable[0];
      if (p0.hand.includes(jiu)) return { kind: 'play', cardId: jiu.id, targets: [0] };
      if (usedSha === 0 && p0.hand.includes(sha1)) { usedSha = 1; return { kind: 'play', cardId: sha1.id, targets: [1] }; }
      if (usedSha === 1 && p0.hand.includes(sha2)) { usedSha = 2; return { kind: 'play', cardId: sha2.id, targets: [1] }; }
      return { kind: 'end' };
    };
    await g.executePlay(p0, { kind: 'play', cardId: jiu.id, targets: [0] });
    await g.executePlay(p0, { kind: 'play', cardId: sha1.id, targets: [1] });
    check('酒：下一张杀伤害+1（9→7）', opp.hp === 7);
    await g.executePlay(p0, { kind: 'play', cardId: sha2.id, targets: [1] });
    check('酒：再加成的第二张杀恢复1伤（7→6而非5）', opp.hp === 6);
    check('酒：牌数守恒154', g.invariant().ok);
  }

  // ── B. 酒后的杀被闪抵消：酒已消耗 ──
  {
    const g = new Game({ seed: 9, generals: ['张飞', '甘宁'], first: 0, ask: async d => d.playable[0] });
    g.setup();
    const p0 = g.players[0], opp = g.players[1];
    const take = (pred) => { const i = g.drawPile.findIndex(pred); return g.drawPile.splice(i, 1)[0]; };
    const jiu = take(c => c.name === '酒');
    const sha1 = take(c => c.name === '杀');
    const sha2 = take(c => c.name === '杀');
    const shan = take(c => c.name === '闪');
    p0.hand.push(jiu, sha1, sha2);
    opp.hand.push(shan);
    opp.hp = 9;
    let shaPlayed = 0;
    g.ask = async (d) => {
      if (d.type === 'respond_sha' && opp.hand.includes(shan)) return { kind: 'respond', cardId: shan.id };
      if (d.type !== 'play') return d.playable[0];
      if (p0.hand.includes(jiu)) return { kind: 'play', cardId: jiu.id, targets: [0] };
      if (shaPlayed === 0 && p0.hand.includes(sha1)) { shaPlayed = 1; return { kind: 'play', cardId: sha1.id, targets: [1] }; }
      if (shaPlayed === 1 && p0.hand.includes(sha2)) { shaPlayed = 2; return { kind: 'play', cardId: sha2.id, targets: [1] }; }
      return { kind: 'end' };
    };
    await g.executePlay(p0, { kind: 'play', cardId: jiu.id, targets: [0] });
    await g.executePlay(p0, { kind: 'play', cardId: sha1.id, targets: [1] });
    check('酒：被闪抵消不掉血（9→9）', opp.hp === 9);
    await g.executePlay(p0, { kind: 'play', cardId: sha2.id, targets: [1] });
    check('酒：闪抵消后酒已消耗，第二张杀1伤（9→8）', opp.hp === 8);
    check('酒：牌数守恒154', g.invariant().ok);
  }

  console.log(`结果：${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
