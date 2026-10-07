// 端到端校验：构造真实对局，验证"失去装备区里的白银狮子必须回复1点体力"
// 用定向发牌 + 脚本化决策驱动完整游戏流程，覆盖三条装备离场路径。
const { Game } = require('../engine/game');
const { makeRiggedDeck } = require('../engine/cards');

const K = (name, suit, rank) => [name, suit, rank];

// 按玩家+决策类型排队脚本动作；函数动作收到 (decision) 可动态生成
const handOf = (g, i, name) => {
  const c = g.players[i].hand.find(x => x.name === name);
  if (!c) throw new Error(`脚本错误：玩家${i}手牌里没有${name}（手牌：${g.players[i].hand.map(x => x.name)}）`);
  return c;
};
const play = (g, i, name, target) => () => {
  const c = handOf(g, i, name);
  return { kind: 'play', cardId: c.id, targets: target == null ? [i] : [target] };
};
// 弃牌阶段：只弃【杀】，保护关键牌
const discardSha = (g, i, n) => () => {
  const ids = g.players[i].hand.filter(c => c.name === '杀').slice(0, n).map(c => c.id);
  return { kind: 'discard', cardIds: ids };
};

function runGame(spec, buildScript) {
  return new Promise((resolve) => {
    const logs = [];
    let g, script = null;
    const ask = async (d) => {
      if (!script) script = buildScript(g); // 只构建一次，队列跨询问持续消费
      const q = script[`${d.playerIdx}:${d.type}`];
      if (q && q.length) {
        const m = q.shift();
        return typeof m === 'function' ? m(d) : m;
      }
      return d.playable[0]; // 默认：end/refuse/skip 等第一个合法项
    };
    g = new Game({
      seed: 42,
      deck: spec, // 引擎内部会调用 makeRiggedDeck(spec)
      generals: ['孙权', '甘宁'],
      first: 0,
      ask,
      onEvent: (e) => {
        if (e.type !== 'log') return;
        logs.push(e.msg);
        // 目标事件出现后立即终止对局，避免后续无关结算
        if (e.msg.includes('失去装备区的【白银狮子】')) g.aborted = true;
      },
    });
    g.run().then(() => resolve({ g, logs }));
  });
}

let pass = 0, fail = 0;
function check(label, cond) {
  if (cond) { pass++; console.log(`PASS ${label}`); }
  else { fail++; console.log(`FAIL ${label}`); }
}
const RECOVER_34 = '甘宁 失去装备区的【白银狮子】，回复1点体力（3→4/4）';

async function main() {
  // ── 对局A：孙权杀甘宁-1血 → 甘宁装备白银狮子 → 孙权过河拆桥弃掉狮子 → 甘宁回血 ──
  {
    const spec = [
      K('杀', '♣', '2'), K('杀', '♣', '3'), K('杀', '♣', '4'), K('过河拆桥', '♠', '3'), // 孙权起手
      K('白银狮子', '♣', 'A'), K('杀', '♦', '6'), K('杀', '♦', '7'), K('杀', '♦', '8'), // 甘宁起手
      K('杀', '♠', '7'), K('杀', '♥', '10'), K('杀', '♦', '10'), K('杀', '♣', 'J'),       // 摸牌
    ];
    const script = (g) => ({
      // t1: 杀→end；t2甘宁装狮子；t3: 过河拆桥→end
      '0:play': [play(g, 0, '杀', 1), { kind: 'end' }, play(g, 0, '过河拆桥', 1)],
      '1:play': [play(g, 1, '白银狮子'), { kind: 'end' }],
      '0:choose': [{ kind: 'chooseArea', area: 'equip' }, (d) => {
        const lion = d.playable.find(m => m.kind === 'chooseCard');
        return { kind: 'chooseCard', cardId: lion.cardId };
      }],
    });
    const { g, logs } = await runGame(spec, script);
    const me = g.players[1];
    check('A: 过河拆桥弃白银狮子触发回血', logs.includes(RECOVER_34));
    check('A: 甘宁体力恢复为4/4', me.hp === 4);
    check('A: 白银狮子进弃牌堆', g.discardPile.includes(me.equips.armor) || g.discardPile.some(c => c.name === '白银狮子'));
    const inv = g.invariant();
    check('A: 牌数守恒154', inv.ok);
  }

  // ── 对局B：孙权装备寒冰剑，杀甘宁-1血 → 甘宁装狮子 → 再杀发动寒冰剑弃狮子+1手牌 → 甘宁回血且免伤 ──
  {
    const spec = [
      K('寒冰剑', '♠', '2'), K('杀', '♣', '2'), K('杀', '♣', '3'), K('杀', '♣', '4'), // 孙权起手
      K('白银狮子', '♣', 'A'), K('杀', '♦', '6'), K('杀', '♦', '7'), K('杀', '♦', '8'),
      K('杀', '♠', '9'), K('杀', '♥', '10'), K('杀', '♦', '10'), K('杀', '♣', '10'),
    ];
    const script = (g) => ({
      // t1: 装寒冰剑→杀→end；t2甘宁装狮子；t3: 杀→发动寒冰剑（弃牌选择：指定装备区的狮子）
      '0:play': [play(g, 0, '寒冰剑'), play(g, 0, '杀', 1), { kind: 'end' }, play(g, 0, '杀', 1)],
      '1:play': [play(g, 1, '白银狮子'), { kind: 'end' }],
      '0:skill_ask': [{ kind: 'skip', skill: '寒冰剑' }, { kind: 'activate', skill: '寒冰剑' }],
      '0:choose': [{ kind: 'chooseArea', area: 'equip' }],
    });
    const { g, logs } = await runGame(spec, script);
    const me = g.players[1];
    check('B: 寒冰剑弃白银狮子触发回血', logs.includes(RECOVER_34));
    check('B: 第二次杀免伤（甘宁体力保持4/4）', me.hp === 4 && logs.filter(l => l.startsWith('甘宁 受到')).length === 1);
    const inv = g.invariant();
    check('B: 牌数守恒154', inv.ok);
  }

  // ── 对局C：孙权杀甘宁-1血 → 甘宁装狮子 → 下回合甘宁用八卦阵替换狮子 → 回血 ──
  {
    const spec = [
      K('杀', '♣', '2'), K('杀', '♣', '3'), K('杀', '♣', '4'), K('杀', '♦', '9'), // 孙权起手
      K('白银狮子', '♣', 'A'), K('八卦阵', '♠', '2'), K('杀', '♦', '6'), K('杀', '♦', '7'), // 甘宁起手
      K('杀', '♠', '9'), K('杀', '♥', '10'), K('杀', '♦', '10'), K('杀', '♣', 'J'),
    ];
    const script = (g) => ({
      // t1: 杀→end；t2甘宁装狮子（弃牌只弃杀）；t3孙权end；t4甘宁装八卦阵替换
      '0:play': [play(g, 0, '杀', 1)],
      '1:play': [play(g, 1, '白银狮子'), { kind: 'end' }, play(g, 1, '八卦阵')],
      '1:discard': [discardSha(g, 1, 2), discardSha(g, 1, 2)],
    });
    const { g, logs } = await runGame(spec, script);
    const me = g.players[1];
    check('C: 替换白银狮子触发回血', logs.includes(RECOVER_34));
    check('C: 甘宁防具换为八卦阵且体力4/4', me.equips.armor && me.equips.armor.name === '八卦阵' && me.hp === 4);
    const inv = g.invariant();
    check('C: 牌数守恒154', inv.ok);
  }

  console.log(`结果：${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
