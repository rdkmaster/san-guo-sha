// 可选项修复校验：麒麟弓双马并存时可任选弃哪匹；寒冰剑弃对手牌时可选手牌/装备区
const { Game } = require('../engine/game');

const K = (name, suit, rank) => [name, suit, rank];

function runGame(spec, buildScript, stopLog) {
  return new Promise((resolve) => {
    const logs = [];
    const asks = [];
    let g, script = null;
    const ask = async (d) => {
      asks.push(`${d.playerIdx}:${d.type}${d.skill ? `:${d.skill}` : ''}`);
      if (!script) script = buildScript(g);
      const q = script[`${d.playerIdx}:${d.type}`];
      if (q && q.length) {
        const m = q.shift();
        return typeof m === 'function' ? m(d) : m;
      }
      return d.playable[0];
    };
    g = new Game({
      seed: 42,
      deck: spec,
      generals: ['孙权', '甘宁'],
      first: 0,
      ask,
      onEvent: (e) => {
        if (e.type !== 'log') return;
        logs.push(e.msg);
        if (stopLog.some(s => e.msg.includes(s))) g.aborted = true;
      },
    });
    g.run().then(() => resolve({ g, logs, asks }));
  });
}

let pass = 0, fail = 0;
function check(label, cond) {
  if (cond) { pass++; console.log(`PASS ${label}`); }
  else { fail++; console.log(`FAIL ${label}`); }
}

(async () => {
  // ── 场景1：麒麟弓，甘宁双马并存，孙权指定弃+1马 ──
  {
    const spec = [
      K('麒麟弓', '♥', '5'), K('杀', '♣', '2'), K('杀', '♣', '3'), K('杀', '♣', '4'), // 孙权起手
      K('赤兔', '♥', '5'), K('绝影', '♠', '5'), K('桃', '♦', '2'), K('桃', '♥', '5'), // 甘宁起手
      K('杀', '♠', '9'), K('杀', '♥', '10'), K('杀', '♦', '10'), K('杀', '♣', '9'), // 牌堆
      K('闪', '♦', '5'), K('闪', '♦', '6'), K('桃', '♥', '3'), K('杀', '♦', '6'),
    ];
    const { g, logs, asks } = await runGame(spec, (g) => {
      const eq = (idx, name) => () => {
        const c = g.players[idx].hand.find(x => x.name === name);
        return { kind: 'play', cardId: c.id };
      };
      const sha = () => {
        const c = g.players[0].hand.find(x => x.name === '杀');
        return { kind: 'play', cardId: c.id, targets: [1] };
      };
      return {
        '0:play': [eq(0, '麒麟弓'), { kind: 'end' }, sha],
        '1:play': [eq(1, '赤兔'), eq(1, '绝影'), { kind: 'end' }],
        '1:respond_sha': [{ kind: 'refuse' }],
        // 双马询问：发动并指定弃 +1马（绝影）
        '0:skill_ask': [() => ({ kind: 'activate', skill: '麒麟弓', cardId: g.players[1].equips.horsePlus.id })],
      };
    }, ['发动【麒麟弓】弃置']);
    check('麒麟弓：触发了坐骑询问', asks.includes('0:skill_ask:麒麟弓'));
    check('麒麟弓：弃掉的是指定的+1马（绝影）', g.players[1].equips.horsePlus === null);
    check('麒麟弓：另一匹-1马保留', g.players[1].equips.horseMinus && g.players[1].equips.horseMinus.name === '赤兔');
    check('麒麟弓：有弃马日志', logs.some(l => l.includes('发动【麒麟弓】弃置')));
  }

  // ── 场景2：寒冰剑，甘宁装白银狮子+有手牌，孙权选先弃装备再暗抽手牌 ──
  {
    const spec = [
      K('寒冰剑', '♠', '2'), K('杀', '♣', '2'), K('杀', '♣', '3'), K('杀', '♣', '4'), // 孙权起手
      K('白银狮子', '♣', 'A'), K('闪', '♥', '2'), K('杀', '♦', '7'), K('杀', '♦', '6'), // 甘宁起手
      K('杀', '♠', '9'), K('杀', '♥', '10'), K('杀', '♦', '10'), K('杀', '♣', '9'), // 牌堆
      K('闪', '♦', '5'), K('闪', '♦', '6'), K('桃', '♥', '3'), K('杀', '♣', 'J'),
    ];
    const { g, logs, asks } = await runGame(spec, (g) => {
      const eq = (idx, name) => () => {
        const c = g.players[idx].hand.find(x => x.name === name);
        return { kind: 'play', cardId: c.id };
      };
      const sha = () => {
        const c = g.players[0].hand.find(x => x.name === '杀');
        return { kind: 'play', cardId: c.id, targets: [1] };
      };
      return {
        '0:play': [eq(0, '寒冰剑'), { kind: 'end' }, sha],
        '1:play': [eq(1, '白银狮子'), { kind: 'end' }],
        '1:discard': [() => {
          const c = g.players[1].hand.find(x => x.name === '杀' && x.suit === '♥');
          return { kind: 'discard', cardIds: [c.id] };
        }],
        '1:respond_sha': [{ kind: 'refuse' }],
        '0:skill_ask': [{ kind: 'activate', skill: '寒冰剑' }],
        // 第1张：选装备区→指定白银狮子；第2张：装备空了只剩手牌（自动暗抽，不再询问）
        '0:choose': [
          () => ({ kind: 'chooseArea', area: 'equip' }),
          () => ({ kind: 'chooseCard', cardId: g.players[1].equips.armor.id }),
        ],
      };
    }, ['发动【寒冰剑】，弃置']);
    check('寒冰剑：触发了发动询问', asks.includes('0:skill_ask:寒冰剑'));
    check('寒冰剑：触发了区域选择', asks.includes('0:choose'));
    check('寒冰剑：指定的装备被弃', g.players[1].equips.armor === null && logs.some(l => l.includes('发动【寒冰剑】，弃置') && l.includes('白银狮子')));
    check('寒冰剑：手牌也被弃一张（共2张）', g.players[1].hand.length === 3);
    check('寒冰剑：伤害被防止（体力4/4）', g.players[1].hp === 4);
  }

  console.log(`结果：${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
})();
