// 专项校验：杀的闪避逻辑（回归测试）
// 规则1: "X 不响应杀" 之后的下一行必须是 "X 受到...伤害"
// 规则2: "X 使用【闪】...抵消杀" 之后允许出现 青龙追加/八卦/贯石斧/下一张闪，
//        但在出现"贯石斧强制"之前不允许 "X 受到...伤害（来自Z）"
const { Game } = require('../engine/game');

async function playLogs(seed) {
  const logs = [];
  const g = new Game({
    seed,
    ask: async (d) => {
      let pool = d.playable;
      if (d.type === 'play' && pool.length > 1 && Math.random() < 0.5) {
        const end = pool.find(m => m.kind === 'end');
        if (end) return end;
      }
      return pool[Math.floor(Math.random() * pool.length)];
    },
    onEvent: (e) => { if (e.type === 'log') logs.push(e.msg); },
  });
  await g.run();
  return logs;
}

function check(logs) {
  const problems = [];
  for (let i = 0; i < logs.length; i++) {
    const L = logs[i];
    const noResp = L.match(/^(.+) 不响应杀$/);
    if (noResp) {
      const t = noResp[1];
      // 跳过伤害修正行与寒冰剑代替行
      let j = i + 1;
      let replaced = false;
      while (j < logs.length) {
        const N = logs[j];
        if (/^白银狮子.*未受到伤害/.test(N)) { replaced = true; break; } // 白银减为0：本就无伤害行
        if (/^火杀\+藤甲/.test(N) || /^古锭刀/.test(N) || /^白银狮子/.test(N)) { j++; continue; }
        if (/发动【寒冰剑】/.test(N)) { replaced = true; break; }
        break;
      }
      if (!replaced) {
        const next = logs[j] || '';
        if (!next.startsWith(`${t} 受到`)) {
          problems.push(`规则1违反@${i}: "${L}" → 第${j - i}行 "${next}"`);
        }
      }
    }
    const dodge = L.match(/^(.+) 使用.*抵消杀$/);
    if (dodge) {
      const t = dodge[1];
      // 向后最多看4行
      for (let j = i + 1; j < Math.min(i + 5, logs.length); j++) {
        const N = logs[j];
        if (N.startsWith(`${t} 发动【贯石斧】`)) break; // 强制伤害合法
        if (N.startsWith(`${t} 受到`) && N.includes('伤害')) {
          problems.push(`规则2违反@${i}: "${L}" → 第${j - i}行后 "${N}"`);
          break;
        }
        if (N.includes('发动【青龙偃月刀】') || N.includes('使用【闪】')) continue; // 追杀/再闪，继续看
        break; // 其他事件（伤害结算已走别的分支）
      }
    }
  }
  return problems;
}

(async () => {
  let all = 0;
  for (let seed = 1; seed <= 50; seed++) {
    const logs = await playLogs(seed);
    const p = check(logs);
    if (p.length) { console.log(`seed=${seed} 发现问题:`); p.forEach(x => console.log('  ' + x)); all += p.length; }
  }
  console.log(all === 0 ? '\n50局校验通过：闪避逻辑正确' : `\n共${all}处问题`);
  process.exit(all === 0 ? 0 : 1);
})();
