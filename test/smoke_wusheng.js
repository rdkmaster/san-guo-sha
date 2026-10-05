// 武圣：红色牌含装备区（官方规则）——赤兔♥5当杀使用，马槽清空+伤害
const { Game, SKILL_TEXTS } = require('../engine/game');

(async () => {
  console.log('技能文本提醒AI:', SKILL_TEXTS['武圣'].includes('装备区') ? '✓ 含装备区说明' : '✗');
  const g = new Game({ seed: 41, generals: ['关羽', '吕布'], first: 0, deck: [
    // 关羽初始：赤兔在手（脚本预装-1马位），无其他红牌干扰转化断言
    ['赤兔', '♥', '5'], ['闪', '♦', '8'], ['桃', '♦', '2'], ['闪', '♥', '2'],
    // 吕布初始（脚本让其不闪，吃伤害）
    ['闪', '♦', '5'], ['杀', '♦', '8'], ['桃', '♥', '5'], ['杀', '♠', '8'],
    // 牌堆
    ['闪', '♦', '6'], ['闪', '♦', '7'], ['闪', '♦', '4'], ['闪', '♦', '3'],
    ['杀', '♣', '5'], ['杀', '♣', '6'],
  ], ask: async d => {
    if (g.turnNo > 2) { g.aborted = true; return { kind: 'end' }; }
    if (d.playerIdx === 0 && d.type === 'play') {
      const chitu = g.players[0].equips.horseMinus;
      const m = chitu && d.playable.find(x => x.kind === 'play' && x.cardId === chitu.id && x.useAs === '杀');
      if (m) return m;
      return d.playable.find(x => x.kind === 'end');
    }
    if (d.playerIdx === 1 && d.type === 'respond_sha') return d.playable.find(x => x.kind === 'refuse');
    if (d.type === 'play') return d.playable.find(x => x.kind === 'end');
    return d.playable[0];
  } });
  await g.setup();
  const chitu = g.players[0].hand.splice(g.players[0].hand.findIndex(c => c.name === '赤兔'), 1)[0];
  g.players[0].equips.horseMinus = chitu;
  await g.run();
  const usedAsSha = g.logLines.some(l => /关羽 使用【杀】（【赤兔♥5】.*转化）/.test(l));
  const slotEmpty = g.players[0].equips.horseMinus === null;
  const dmg = g.logLines.some(l => /吕布 受到1点伤害（来自关羽）/.test(l));
  console.log('赤兔当杀使用:', usedAsSha ? '✓' : '✗ |', g.logLines.filter(l => l.includes('使用【杀】')).slice(0, 2).join(' | '));
  console.log('-1马槽清空:', slotEmpty ? '✓' : '✗');
  console.log('吕布掉血:', dmg ? '✓' : '✗');
  console.log('守恒:', g.invariant().total);
})();
