// 武器特效冒烟：青釭剑/朱雀羽扇/雌雄双股剑/丈八蛇矛
const { Game } = require('../engine/game');

// 杀的普通play动作（排除奇袭/武圣等转化move）
const shaMove = (g, d) => d.playable.find(m => m.kind === 'play' && !m.useAs
  && g.players[d.playerIdx].hand.find(c => c.id === m.cardId)?.name === '杀');
const equipMove = (g, d, name) => d.playable.find(m => m.kind === 'play' && !m.useAs
  && g.players[d.playerIdx].hand.find(c => c.id === m.cardId)?.name === name);

(async () => {
  // 1) 青釭剑 vs 藤甲：普杀穿透（无"藤甲：普通【杀】无效"日志）
  {
    const g = new Game({ seed: 3, generals: ['甘宁', '曹操'], first: 0, deck: [
      ['青釭剑', '♠', '6'], ['杀', '♦', '7'], ['桃', '♦', '2'], ['闪', '♥', '2'],
      ['藤甲', '♠', '2'], ['闪', '♦', '5'], ['桃', '♥', '5'], ['杀', '♠', '8'],
      ['杀', '♥', '10'], ['闪', '♦', '6'], ['桃', '♥', '3'], ['闪', '♦', '7'],
    ], ask: async d => {
      if (g.turnNo > 60) { g.aborted = true; return { kind: 'end' }; }
      if (d.playerIdx === 0 && d.type === 'play') {
        return equipMove(g, d, '青釭剑') || shaMove(g, d) || d.playable.find(m => m.kind === 'end');
      }
      if (d.playerIdx === 1 && d.type === 'play') return d.playable.find(m => m.kind === 'end');
      return d.playable[0];
    } });
    await g.setup();
    g.players[0].equips.weapon = g.players[0].hand.splice(g.players[0].hand.findIndex(c => c.name === '青釭剑'), 1)[0];
    g.players[1].equips.armor = g.players[1].hand.splice(g.players[1].hand.findIndex(c => c.name === '藤甲'), 1)[0];
    await g.run();
    console.log('1) 青釭vs藤甲:', !g.logLines.some(l => l.includes('藤甲：普通【杀】无效')) && g.logLines.some(l => /曹操 受到/.test(l)) ? '穿透✓' : '✗',
      '| 守恒', g.invariant().total);
  }
  // 2) 朱雀羽扇 vs 藤甲：普杀视为火杀 → 无效变有效且伤害+1（2点）
  {
    const g = new Game({ seed: 4, generals: ['甘宁', '曹操'], first: 0, deck: [
      ['朱雀羽扇', '♦', 'A'], ['杀', '♦', '7'], ['桃', '♦', '2'], ['闪', '♥', '2'],
      ['藤甲', '♠', '2'], ['杀', '♠', '8'], ['桃', '♥', '5'], ['杀', '♥', '10'],
      ['杀', '♥', 'J'], ['闪', '♦', '6'], ['桃', '♥', '3'], ['闪', '♦', '7'],
    ], ask: async d => {
      if (g.turnNo > 60) { g.aborted = true; return { kind: 'end' }; }
      if (d.playerIdx === 0 && d.type === 'play') {
        return equipMove(g, d, '朱雀羽扇') || shaMove(g, d) || d.playable.find(m => m.kind === 'end');
      }
      if (d.playerIdx === 1 && d.type === 'play') return d.playable.find(m => m.kind === 'end');
      return d.playable[0];
    } });
    await g.setup();
    g.players[0].equips.weapon = g.players[0].hand.splice(g.players[0].hand.findIndex(c => c.name === '朱雀羽扇'), 1)[0];
    g.players[1].equips.armor = g.players[1].hand.splice(g.players[1].hand.findIndex(c => c.name === '藤甲'), 1)[0];
    await g.run();
    const ok = g.logLines.some(l => l.includes('朱雀羽扇：普通【杀】视为火【杀】'))
      && g.logLines.some(l => l.includes('火杀+藤甲：伤害+1'))
      && g.logLines.some(l => /曹操 受到2点/.test(l));
    console.log('2) 朱雀vs藤甲:', ok ? '火杀生效+伤害2✓' : '✗', '|', g.logLines.filter(l => /朱雀|火杀/.test(l)).map(l => l.slice(0, 40)).join(' | '));
  }
  // 3) 雌雄双股剑：甘宁(m)杀黄月英(f)，目标skip → 攻击者摸1
  {
    const g = new Game({ seed: 5, generals: ['甘宁', '黄月英'], first: 0, deck: [
      ['雌雄双股剑', '♠', '2'], ['杀', '♦', '7'], ['桃', '♦', '2'], ['闪', '♥', '2'],
      ['闪', '♦', '5'], ['杀', '♦', '8'], ['桃', '♥', '5'], ['杀', '♠', '8'],
      ['闪', '♦', '6'], ['闪', '♦', '7'], ['桃', '♥', '3'], ['闪', '♦', '4'],
    ], ask: async d => {
      if (g.turnNo > 60) { g.aborted = true; return { kind: 'end' }; }
      if (d.type === 'choose' && d.skill === '雌雄双股剑') return d.playable.find(m => m.kind === 'skip');
      if (d.playerIdx === 0 && d.type === 'play') {
        return equipMove(g, d, '雌雄双股剑') || shaMove(g, d) || d.playable.find(m => m.kind === 'end');
      }
      if (d.playerIdx === 1 && d.type === 'play') return d.playable.find(m => m.kind === 'end');
      return d.playable[0];
    } });
    await g.setup();
    g.players[0].equips.weapon = g.players[0].hand.splice(g.players[0].hand.findIndex(c => c.name === '雌雄双股剑'), 1)[0];
    await g.run();
    const draws = g.logLines.filter(l => l === '雌雄双股剑：甘宁 摸1张牌').length;
    console.log('3) 雌雄skip:', draws > 0 ? `摸1触发${draws}次✓` : '✗', '| 守恒', g.invariant().total);
  }
  // 4) 丈八蛇矛：两张闪当杀打出
  {
    const g = new Game({ seed: 6, generals: ['甘宁', '曹操'], first: 0, deck: [
      ['丈八蛇矛', '♠', 'Q'], ['闪', '♦', '2'], ['闪', '♦', '3'], ['杀', '♦', '7'],
      ['闪', '♦', '5'], ['杀', '♦', '8'], ['桃', '♥', '5'], ['杀', '♠', '8'],
      ['闪', '♦', '6'], ['闪', '♦', '7'], ['桃', '♥', '3'], ['闪', '♦', '4'],
    ], ask: async d => {
      if (g.turnNo > 60) { g.aborted = true; return { kind: 'end' }; }
      if (d.playerIdx === 0 && d.type === 'play') {
        if (d.playable.some(m => m.kind === 'sha_combo') && g.players[0].hand.filter(c => c.name === '闪').length >= 2) {
          return { kind: 'sha_combo', cardIds: g.players[0].hand.filter(c => c.name === '闪').slice(0, 2).map(c => c.id) };
        }
        return equipMove(g, d, '丈八蛇矛') || d.playable.find(m => m.kind === 'end');
      }
      if (d.playerIdx === 1 && d.type === 'play') return d.playable.find(m => m.kind === 'end');
      return d.playable[0];
    } });
    await g.setup();
    g.players[0].equips.weapon = g.players[0].hand.splice(g.players[0].hand.findIndex(c => c.name === '丈八蛇矛'), 1)[0];
    await g.run();
    const comboLogs = g.logLines.filter(l => l.includes('丈八蛇矛：') && l.includes('转化'));
    console.log('4) 丈八:', comboLogs.length ? `${comboLogs.length}次两手牌当杀✓` : '✗',
      '|', comboLogs[0]?.slice(0, 60), '| 守恒', g.invariant().total);
  }
  // 5) 贯石斧：发动后玩家自选两张（手牌+装备区），强制伤害
  {
    let axeSelectionFired = false;
    const g = new Game({ seed: 11, generals: ['黄月英', '关羽'], first: 0, deck: [
      ['贯石斧', '♦', '5'], ['杀', '♦', '7'], ['仁王盾', '♣', '2'], ['闪', '♥', '2'],
      ['闪', '♦', '8'], ['杀', '♦', '8'], ['桃', '♥', '5'], ['杀', '♠', '8'],
      ['闪', '♦', '6'], ['闪', '♦', '7'], ['闪', '♦', '4'], ['闪', '♦', '3'],
      ['杀', '♣', '5'], ['杀', '♣', '6'],
    ], ask: async d => {
      if (g.turnNo > 2) { g.aborted = true; return { kind: 'end' }; }
      const p0 = g.players[0];
      if (d.playerIdx === 0) {
        if (d.type === 'play') {
          const axe = p0.hand.find(c => c.name === '贯石斧');
          if (axe) return d.playable.find(m => m.kind === 'play' && m.cardId === axe.id);
          const armor = p0.hand.find(c => c.name === '仁王盾');
          if (armor) return d.playable.find(m => m.kind === 'play' && m.cardId === armor.id);
          const sha = p0.hand.find(c => c.name === '杀');
          if (sha) return d.playable.find(m => m.kind === 'play' && m.cardId === sha.id);
          return d.playable.find(m => m.kind === 'end');
        }
        if (d.type === 'skill_ask' && d.skill === '贯石斧') return d.playable.find(m => m.kind === 'activate');
        if (d.type === 'discard' && d.playable[0] && d.playable[0].area === 'any') {
          axeSelectionFired = true;
          const shan = p0.hand.find(c => c.name === '闪');
          return { kind: 'discard', cardIds: [shan.id, p0.equips.armor.id] }; // 1手牌+1装备
        }
        if (d.type === 'discard') {
          const n = d.count || 1;
          return { kind: 'discard', cardIds: p0.hand.slice(0, n).map(c => c.id) };
        }
        return d.playable[0];
      }
      if (d.type === 'respond_sha') {
        const shan = g.players[1].hand.find(c => c.name === '闪');
        if (shan) return d.playable.find(m => m.kind === 'respond' && m.cardId === shan.id);
        return d.playable.find(m => m.kind === 'refuse');
      }
      if (d.type === 'play') return d.playable.find(m => m.kind === 'end');
      return d.playable[0];
    } });
    await g.setup();
    await g.run();
    const p0 = g.players[0];
    const axeLog = g.logLines.find(l => l.includes('贯石斧') && l.includes('强制造成伤害'));
    const ok = axeSelectionFired && axeLog && axeLog.includes('仁王盾♣2') && axeLog.includes('闪♥2')
      && g.logLines.some(l => /关羽 受到1点伤害/.test(l))
      && p0.equips.armor === null && p0.equips.weapon && p0.equips.weapon.name === '贯石斧';
    console.log('5) 贯石斧自选:', ok ? '选牌询问+弃装备手牌各1+强制伤害✓' : '✗', '|', axeLog?.slice(0, 60), '| 守恒', g.invariant().total);
  }
})();
