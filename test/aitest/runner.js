// AI测试跑批器
// 用法:
//   node test/aitest/runner.js --stub        快速dry-run（双方随机，验证场景布置与引擎）
//   node test/aitest/runner.js --real        真实GLM测试（侧1走droid）
//   node test/aitest/runner.js --real --only 无双
const path = require('path');
const fs = require('fs');
const { Game } = require('../../engine/game');
const { AIPlayer } = require('../../engine/ai');
const { SCENARIOS } = require('./scenarios');
const detectAnomalies = require('./anomalies');

const ROOT = path.join(__dirname, '..', '..');
const MODE = process.argv.includes('--real') ? 'real' : 'stub';
const onlyIdx = process.argv.indexOf('--only');
const ONLY = onlyIdx >= 0 ? process.argv[onlyIdx + 1] : null;
const STUB_SEED = 20261005; // stub固定种子，dry-run可复现

// stub随机源：每场景独立播种（此前用裸Math.random，跨场景流漂移导致断言闪断）
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
let stubRng = Math.random;

async function runScenario(sc, idx) {
  const t0 = Date.now();
  let aiDecisions = 0;
  const maxAI = sc.maxAI || 25;
  let ai = null;
  stubRng = mulberry32(STUB_SEED + idx * 7919);
  if (MODE === 'real') ai = new AIPlayer({ model: 'glm-5.3-flash', reasoning: 'high' });

  const game = new Game({
    seed: MODE === 'stub' ? STUB_SEED : Math.floor(Math.random() * 1e9),
    generals: sc.generals,
    first: sc.first,
    deck: sc.deck,
    ask: async (d) => {
      if (d.playerIdx === 1) {
        if (++aiDecisions > maxAI) { game.aborted = true; return { kind: 'end' }; }
        if (MODE === 'stub') {
          // 战术类随机；触发/救助/选牌类配合（playable[0]），保证引擎路径被确定性覆盖
          const tactical = ['play', 'respond_sha', 'respond_nanman', 'discard', 'daodao'];
          return tactical.includes(d.type)
            ? d.playable[Math.floor(stubRng() * d.playable.length)]
            : d.playable[0];
        }
        return await ai.decide(d.stateMd, () => {});
      }
      return await sc.humanScript(game)(d);
    },
    onEvent: () => {},
  });
  game.setup();
  if (sc.preSetup) sc.preSetup(game);
  const preInv = game.invariant();

  const winner = await game.run();
  const anomalies = detectAnomalies(game);
  const asserts = sc.expect(game)
    .filter(a => !(MODE === 'stub' && a.realOnly))
    .map(a => ({ ...a, pass: !!a.pass }));
  const illegal = game.logLines.filter(l => /的动作不合法/.test(l)).length;
  const fallback = game.logLines.filter(l => l.includes('【兜底】')).length;
  const transcript = game.logLines.join('\n');
  return {
    name: sc.name, ok: !anomalies.length && asserts.every(a => a.pass) && preInv.ok,
    winner, turns: game.turnNo, aiDecisions: Math.min(aiDecisions, maxAI),
    illegal, fallback, anomalies, asserts, preInv,
    durSec: ((Date.now() - t0) / 1000).toFixed(0),
    transcript,
  };
}

(async () => {
  const list = ONLY ? SCENARIOS.filter(s => s.name.includes(ONLY)) : SCENARIOS;
  fs.mkdirSync(path.join(__dirname, 'transcripts'), { recursive: true });
  const results = [];
  for (let i = 0; i < list.length; i++) {
    const sc = list[i];
    process.stdout.write(`▶ ${sc.name} (${MODE}) ... `);
    try {
      const r = await runScenario(sc, i);
      results.push(r);
      fs.writeFileSync(path.join(__dirname, 'transcripts', `${sc.name.replace(/[\\/:*?"<>|]/g, '_')}.log`), r.transcript, 'utf8');
      console.log(`${r.ok ? '✓ PASS' : '✗ FAIL'} ${r.durSec}s AI决策${r.aiDecisions} 非法${r.illegal} 兜底${r.fallback}${r.anomalies.length ? ' 异常:' + r.anomalies.length : ''}`);
      for (const a of r.asserts) if (!a.pass) console.log(`    断言失败: ${a.desc}`);
      for (const a of r.anomalies) console.log(`    异常: ${a}`);
    } catch (e) {
      results.push({ name: sc.name, ok: false, error: String(e && e.stack || e), asserts: [], anomalies: [], aiDecisions: 0, illegal: 0, fallback: 0 });
      console.log('✗ 引擎异常');
      console.log(String(e && e.stack || e).split('\n').slice(0, 4).join('\n'));
    }
  }
  // 报告
  const pass = results.filter(r => r.ok).length;
  let md = `# AI测试报告 (${MODE}) ${new Date().toLocaleString('zh-CN')}\n\n`;
  md += `结果: ${pass}/${results.length} 通过\n\n`;
  md += `| 场景 | 结果 | 回合 | AI决策 | 非法动作 | 兜底 | 问题 |\n|---|---|---|---|---|---|---|\n`;
  for (const r of results) {
    const issues = (r.anomalies || []).concat((r.asserts || []).filter(a => !a.pass).map(a => '断言失败: ' + a.desc));
    md += `| ${r.name} | ${r.ok ? '✓' : '✗'} | ${r.turns ?? '-'} | ${r.aiDecisions ?? '-'} | ${r.illegal} | ${r.fallback} | ${issues.join('<br>') || '-'} |\n`;
  }
  fs.writeFileSync(path.join(__dirname, 'report.md'), md, 'utf8');
  console.log(`\n报告: test/aitest/report.md (${pass}/${results.length} 通过)`);
  process.exit(0);
})();
