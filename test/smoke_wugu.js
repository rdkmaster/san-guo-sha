// 五谷丰登：人类侧选项标签能解析展示区牌名（findCard补limbo）+ 选牌流程
const { Game } = require('../engine/game');

(async () => {
  let chooseAskSeen = null;
  const g = new Game({ seed: 21, generals: ['黄月英', '关羽'], first: 0, deck: [
    // p0初始
    ['五谷丰登', '♥', '3'], ['杀', '♦', '7'], ['桃', '♦', '2'], ['闪', '♥', '2'],
    // p1初始
    ['闪', '♦', '8'], ['杀', '♦', '8'], ['桃', '♥', '5'], ['杀', '♠', '8'],
    // 牌堆：五谷展示2张 + 后续
    ['无懈可击', '♥', 'K'], ['诸葛连弩', '♣', 'A'], ['闪', '♦', '6'], ['闪', '♦', '7'],
    ['杀', '♣', '5'], ['杀', '♣', '6'],
  ], ask: async d => {
    if (g.turnNo > 2) { g.aborted = true; return { kind: 'end' }; }
    const p0 = g.players[0];
    if (d.playerIdx === 0) {
      if (d.type === 'play') {
        const wugu = p0.hand.find(c => c.name === '五谷丰登');
        if (wugu) return d.playable.find(m => m.kind === 'play' && m.cardId === wugu.id);
        return d.playable.find(m => m.kind === 'end');
      }
      return d.playable[0];
    }
    // p1（关羽）被问五谷选牌
    if (d.type === 'choose' && d.playable[0] && d.playable[0].kind === 'chooseCard') {
      chooseAskSeen = {
        optionCount: d.playable.length,
        findCard解析: d.playable.map(m => { const f = g.findCard(m.cardId); return f ? f.card.name + f.card.suit + f.card.rank : '?'; }),
      };
      // 选第二张（无懈可击）
      return d.playable[1];
    }
    if (d.type === 'play') return d.playable.find(m => m.kind === 'end');
    return d.playable[0];
  } });
  await g.setup();
  await g.run();
  const p1 = g.players[1];
  const logs = g.logLines.filter(l => l.includes('五谷丰登') || l.includes('获得'));
  console.log('选牌询问:', chooseAskSeen ? `✓ ${chooseAskSeen.optionCount}个选项，findCard解析=[${chooseAskSeen.findCard解析.join(', ')}]` : '✗ 未出现');
  console.log('选项全部解析出牌名（无?）:', chooseAskSeen && chooseAskSeen.findCard解析.every(s => !s.includes('?')) ? '✓' : '✗');
  const pick2 = chooseAskSeen ? chooseAskSeen.findCard解析[1] : '';
  const pick1 = chooseAskSeen ? chooseAskSeen.findCard解析[0] : '';
  console.log(`关羽获得选项2(${pick2}):`, p1.hand.some(c => c.name + c.suit + c.rank === pick2) ? '✓' : '✗');
  console.log(`黄月英获得剩余选项1(${pick1}):`, g.players[0].hand.some(c => c.name + c.suit + c.rank === pick1) ? '✓' : '✗');
  console.log('--- 相关日志 ---');
  logs.forEach(l => console.log(l.slice(0, 70)));
  console.log('守恒:', g.invariant().total);
})();
