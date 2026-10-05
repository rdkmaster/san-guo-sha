// 借刀杀人：武圣目标用红牌转化打出杀（新shaSources分支）
const { Game } = require('../engine/game');

(async () => {
  const g = new Game({ seed: 31, generals: ['甘宁', '关羽'], first: 0, deck: [
    // p0初始（甘宁）
    ['借刀杀人', '♣', 'Q'], ['杀', '♦', '7'], ['桃', '♦', '2'], ['闪', '♥', '2'],
    // p1初始（关羽）：无真杀，有红牌可武圣转化 + 闪
    ['青釭剑', '♠', '6'], ['闪', '♦', '5'], ['桃', '♥', '5'], ['闪', '♦', '6'],
    // 牌堆
    ['杀', '♣', '8'], ['闪', '♦', '7'], ['桃', '♥', '3'], ['闪', '♦', '4'],
  ], ask: async d => {
    if (g.turnNo > 2) { g.aborted = true; return { kind: 'end' }; }
    if (d.playerIdx === 0 && d.type === 'play') {
      const dd = g.players[0].hand.find(c => c.name === '借刀杀人');
      if (dd) return d.playable.find(m => m.kind === 'play' && m.cardId === dd.id);
      return d.playable.find(m => m.kind === 'end');
    }
    // 关羽被借刀：用闪♦5武圣转化打出杀（不交武器）
    if (d.type === 'daodao') {
      return d.playable.find(m => m.kind === 'daodao_sha' && m.useAs === '杀') || d.playable[0];
    }
    return d.playable[0];
  } });
  await g.setup();
  g.players[1].equips.weapon = g.players[1].hand.splice(g.players[1].hand.findIndex(c => c.name === '青釭剑'), 1)[0];
  await g.run();
  const conv = g.logLines.some(l => /关羽 出【杀】（【闪♦5】转化）→ 甘宁/.test(l));
  const weaponKept = g.players[1].equips.weapon && g.players[1].equips.weapon.name === '青釭剑';
  const dmg = g.logLines.some(l => /甘宁 受到1点伤害/.test(l)) || g.logLines.some(l => /甘宁 使用【闪】.*抵消/.test(l));
  console.log('武圣转化出杀:', conv ? '✓' : '✗', '| 武器保留:', weaponKept ? '✓' : '✗', '| 杀结算发生:', dmg ? '✓' : '✗');
  g.logLines.filter(l => /借刀|出【杀】|转化/.test(l)).slice(0, 4).forEach(l => console.log(' ', l.slice(0, 70)));
  console.log('守恒:', g.invariant().total);
})();
