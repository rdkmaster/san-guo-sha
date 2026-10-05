// 自测：双随机bot跑完整对局，验证引擎规则闭环（不调droid）
const { Game } = require('../engine/game');

async function playOne(seed, verbose) {
  const logs = [];
  const g = new Game({
    seed,
    ask: async (d) => {
      // 随机但偏向结束出牌（避免每回合顶满60动作）
      let pool = d.playable;
      if (d.type === 'play' && pool.length > 1 && Math.random() < 0.5) {
        const end = pool.find(m => m.kind === 'end');
        if (end) return end;
      }
      return pool[Math.floor(Math.random() * pool.length)];
    },
    onEvent: (e) => { if (verbose && e.type === 'log') logs.push(e.msg); },
  });
  const w = await g.run();
  return { w, turns: g.turnNo, decisions: g.decisionNo, logs, game: g };
}

(async () => {
  const N = 30;
  let p0wins = 0, p1wins = 0;
  const t0 = Date.now();
  for (let seed = 1; seed <= N; seed++) {
    try {
      const r = await playOne(seed, false);
      if (r.w === 0) p0wins++; else p1wins++;
      console.log(`seed=${String(seed).padStart(3)} 胜者=侧${r.w} 回合=${r.turns} 决策=${r.decisions}`);
    } catch (e) {
      console.error(`seed=${seed} 引擎异常：`, e);
      const r = await playOne(seed, true);
      console.error(r.logs.join('\n'));
      process.exit(1);
    }
  }
  console.log(`\n${N}局完成，用时${((Date.now() - t0) / 1000).toFixed(1)}s：先手侧${p0wins}胜 / 后手侧${p1wins}胜`);
})();
