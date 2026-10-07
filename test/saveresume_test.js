// 端到端校验：存档/恢复功能
// 原理：引擎确定性（固定种子+决策全记录），恢复时重放历史决策即可精确续局。
// 本测试构造一局完整对局，中途存档，然后用存档恢复一局新Game跑完，
// 断言：恢复局与原局（不中断直接跑完）的日志、胜者、决策记录完全一致。
const { Game } = require('../engine/game');

function mkAsk(counter, onAsk) {
  return async (d) => {
    counter.n++;
    if (onAsk) onAsk(counter.n, d);
    // 固定策略：优先第一个非end动作（让对局能推进），否则end/refuse
    const pool = d.playable;
    const move = pool.length > 1 ? pool[1] : pool[0];
    return move;
  };
}

async function main() {
  let pass = 0, fail = 0;
  const check = (label, cond) => { if (cond) { pass++; console.log(`PASS ${label}`); } else { fail++; console.log(`FAIL ${label}`); } };

  const seed = 20261006;
  const SAVE_AT = 15; // 第15次决策时存档

  // ── 原局：一路跑到结束，第SAVE_AT次决策时抓取存档快照 ──
  let saved = null;
  const counter1 = { n: 0 };
  const g1 = new Game({
    seed, generals: ['孙权', '甘宁'], first: 0,
    ask: mkAsk(counter1, (n) => { if (n === SAVE_AT) saved = JSON.parse(JSON.stringify(g1.saveData())); }),
  });
  const winner1 = await g1.run();
  check('原局正常结束且抓到存档', !!saved && saved.decisions.length === SAVE_AT - 1);

  // ── 恢复局：从存档重建（重放历史决策），跑完后必须与原局完全一致 ──
  const counter2 = { n: 0 };
  const g2 = new Game({
    seed: saved.seed,
    generals: saved.generals,
    first: saved.first,
    deck: saved.deck,
    replay: saved.decisions,
    ask: mkAsk(counter2, null),
  });
  const winner2 = await g2.run();

  check('恢复局日志与原局逐行一致', JSON.stringify(g1.logLines) === JSON.stringify(g2.logLines));
  check('恢复局胜者与原局一致', winner1 === winner2);
  check('恢复局决策记录与原局总数一致', g1.decisionLog.length === g2.decisionLog.length && g1.decisionLog.length > SAVE_AT + 10);
  check('恢复局回合数一致', g1.turnNo === g2.turnNo);
  check('恢复局牌数守恒154', g2.invariant().ok);

  // ── 再恢复一次（存档点更早），确认任意存档点都可精确续局 ──
  const saved2 = JSON.parse(JSON.stringify({ ...saved, decisions: saved.decisions.slice(0, 7), logs: saved.logs.slice(0, 20) }));
  const g3 = new Game({
    seed: saved2.seed, generals: saved2.generals, first: saved2.first,
    deck: saved2.deck, replay: saved2.decisions,
    ask: mkAsk({ n: 0 }, null),
  });
  const winner3 = await g3.run();
  check('更早存档点恢复同样一致', winner3 === winner1 && JSON.stringify(g1.logLines) === JSON.stringify(g3.logLines));

  console.log(`结果：${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
