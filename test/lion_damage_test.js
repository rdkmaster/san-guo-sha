// 回归校验：白银狮子的伤害规则（标准版）
// 锁定技：受到大于1点的伤害时防止其余伤害，只受到1点；1点伤害无效果（防不了普通杀）
const { Game } = require('../engine/game');

async function main() {
  let pass = 0, fail = 0;
  const check = (label, cond) => { if (cond) { pass++; console.log(`PASS ${label}`); } else { fail++; console.log(`FAIL ${label}`); } };

  const mkWithLion = () => {
    const g = new Game({ seed: 3, generals: ['孙权', '甘宁'], first: 0, ask: async d => d.playable[0], onEvent: () => {} });
    g.setup();
    const lionIdx = g.drawPile.findIndex(c => c.name === '白银狮子');
    const lion = g.drawPile.splice(lionIdx, 1)[0];
    g.players[0].equips.armor = lion;
    return g;
  };

  // 3点伤害（闪电类）→ 只受1点
  {
    const g = mkWithLion();
    const t = g.players[0];
    await g.dealDamage(t, 3, { nature: '雷' });
    check('3点伤害减至1：体力4→3', t.hp === 3);
    check('日志：伤害减至1', g.logLines.some(l => l.includes('白银狮子：伤害减至1')));
  }

  // 2点伤害（酒杀/火杀类）→ 只受1点
  {
    const g = mkWithLion();
    const t = g.players[0];
    await g.dealDamage(t, 2, {});
    check('2点伤害减至1：体力4→3（而非减1得3→2的4→2）', t.hp === 3);
  }

  // 1点伤害（普通杀）→ 无效果，正常受1点
  {
    const g = mkWithLion();
    const t = g.players[0];
    await g.dealDamage(t, 1, {});
    check('1点伤害无减伤：体力4→3且无白银日志', t.hp === 3 && !g.logLines.some(l => l.includes('白银狮子')));
  }

  // 贯石斧（pierced）→ 2点伤害全额生效
  {
    const g = mkWithLion();
    const t = g.players[0];
    await g.dealDamage(t, 2, { pierceArmor: true });
    check('无视防具时全额受伤：体力4→2', t.hp === 2 && !g.logLines.some(l => l.includes('白银狮子：伤害减至1')));
  }

  console.log(`结果：${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
