// 临时单测：重开对局后，旧对局的询问必须立刻终止（不再广播假询问）
const { Game } = require('../engine/game');

(async () => {
  let askCount = 0;
  const g = new Game({
    seed: 1,
    ask: async () => {
      askCount++;
      g.aborted = true;      // 模拟：询问挂起期间玩家点了重新开局
      return { action: 'bogus' }; // 无效动作（旧引擎会进入重试循环）
    },
  });
  g.setup();
  const r = await g.askPlayer(g.players[0], { playerIdx: 0, type: 'play', playable: [{ kind: 'end' }], context: {} });
  // 修复后：重试循环开头检测 aborted → 返回 end，且 ask 只被调用1次（不会再次广播旧局询问）
  console.log(`ask调用次数: ${askCount}（要求=1）| 返回动作: ${r.kind}（要求=end）`);
  if (askCount === 1 && r.kind === 'end') { console.log('重开竞态测试通过'); process.exit(0); }
  console.log('测试失败');
  process.exit(1);
})();
