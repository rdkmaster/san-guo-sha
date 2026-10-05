// 异常检测器：扫描对局日志与终局状态，输出问题列表（不依赖场景断言，每局都跑）
module.exports = function detectAnomalies(game) {
  const probs = [];
  const L = game.logLines;
  // A1: 满血用桃
  L.forEach((l) => {
    const m = l.match(/使用【桃】，体力 (\d+)→(\d+)\/(\d+)/);
    if (m && +m[1] === +m[3]) probs.push(`A1 满血用桃: ${l}`);
  });
  for (let i = 0; i < L.length; i++) {
    // A2: 被闪抵消却扣血（贯石斧强制除外）
    const dodge = L[i].match(/^(.+) 使用.*抵消杀$/);
    if (dodge) {
      const t = dodge[1];
      for (let j = i + 1; j < Math.min(i + 5, L.length); j++) {
        if (L[j].startsWith(`${t} 发动【贯石斧】`)) break;
        if (L[j].startsWith(`${t} 受到`) && L[j].includes('伤害')) { probs.push(`A2 被闪仍扣血: ${L[i]} → ${L[j]}`); break; }
        if (L[j].includes('青龙偃月刀') || /使用.*抵消杀/.test(L[j])) continue;
        break;
      }
    }
    // A3: 不响应杀却没扣血（寒冰剑替代除外）
    const noResp = L[i].match(/^(.+) 不响应杀$/);
    if (noResp) {
      const t = noResp[1];
      let j = i + 1, replaced = false;
      while (j < L.length) {
        const N = L[j];
        if (/^白银狮子.*未受到伤害/.test(N)) { replaced = true; break; } // 白银减为0：本就无伤害行
        if (/^火杀\+藤甲|^古锭刀|^白银狮子/.test(N)) { j++; continue; }
        if (/的动作不合法|弃牌数量不合法|守恒告警|【兜底】/.test(N)) { j++; continue; } // 引擎噪音行，跳过继续找伤害
        if (/发动【寒冰剑】/.test(N)) { replaced = true; break; }
        break;
      }
      if (!replaced && !(L[j] || '').startsWith(`${t} 受到`)) probs.push(`A3 不响应杀未扣血: ${L[i]} → ${L[j] || 'EOF'}`);
    }
    // A4: 判定规则抽查（兵粮寸断梅花过关/乐不思蜀红桃过关）
    if (/判定【兵粮寸断】/.test(L[i]) && /判定牌为红桃：无效果/.test(L[i + 1] || '')) probs.push(`A4 兵粮寸断误用红桃规则: ${L[i]}`);
    if (/判定【乐不思蜀】/.test(L[i]) && /判定牌为梅花：无效果/.test(L[i + 1] || '')) probs.push(`A4 乐不思蜀误用梅花规则: ${L[i]}`);
  }
  // A5: 牌数守恒
  const inv = game.invariant();
  if (!inv.ok) probs.push(`A5 牌数守恒破坏: ${inv.total}/154`);
  return probs;
};
