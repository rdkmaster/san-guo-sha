// 八卦阵可选判定校验：需要【闪】时先询问是/否，拒绝则不判定；判定失败仍可用手牌【闪】；青釭剑无视防具不询问
const { Game } = require('../engine/game');

const K = (name, suit, rank) => [name, suit, rank];
const isRedSuit = s => s === '♥' || s === '♦';

// 定向发牌：前8张为起手手牌（孙权4+甘宁4），其余进牌堆
function baseSpec() {
  return [
    K('杀', '♣', '2'), K('杀', '♣', '3'), K('杀', '♣', '4'), K('杀', '♦', '6'), // 孙权起手
    K('闪', '♥', '2'), K('闪', '♦', '5'), K('八卦阵', '♠', '2'), K('桃', '♥', '5'), // 甘宁起手
    K('杀', '♠', '9'), K('杀', '♥', '10'), K('桃', '♦', '2'), K('杀', '♦', '7'), // 牌堆补充
    K('闪', '♦', '6'), K('杀', '♦', '10'), K('桃', '♥', '3'), K('杀', '♣', '9'),
  ];
}

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

// 甘宁 t1 装八卦阵；孙权 t2 杀甘宁
function playScripts(g) {
  const end = { kind: 'end' };
  const equipBagua = () => {
    const c = g.players[1].hand.find(x => x.name === '八卦阵');
    return { kind: 'play', cardId: c.id };
  };
  const sha0 = () => {
    const c = g.players[0].hand.find(x => x.name === '杀');
    return { kind: 'play', cardId: c.id, targets: [1] };
  };
  return { end, equipBagua, sha0 };
}

// 把指定颜色的牌顶到牌堆顶（判定用）
function rigTop(g, red) {
  const i = g.drawPile.findIndex(c => isRedSuit(c.suit) === red);
  if (i > 0) { const [c] = g.drawPile.splice(i, 1); g.drawPile.unshift(c); }
}

let pass = 0, fail = 0;
function check(label, cond) {
  if (cond) { pass++; console.log(`PASS ${label}`); }
  else { fail++; console.log(`FAIL ${label}`); }
}

(async () => {
  const dodgeLog = '抵消杀';
  const baguaAsk = '1:skill_ask:八卦阵';

  // ── A：拒绝判定 → 不判定，用手牌【闪】响应 ──
  {
    const spec = baseSpec();
    const { g, logs, asks } = await runGame(spec, (g) => {
      const { end, equipBagua, sha0 } = playScripts(g);
      return {
        '0:play': [end, sha0],
        '1:play': [equipBagua, end],
        '1:skill_ask': [{ kind: 'skip', skill: '八卦阵' }],
        '1:respond_sha': [(d) => ({ kind: 'respond', cardId: g.players[1].hand.find(x => x.name === '闪').id })],
      };
    }, [dodgeLog]);
    check('A: 触发了八卦阵询问', asks.includes(baguaAsk));
    check('A: 拒绝后没有判定', !logs.some(l => l.includes('八卦阵判定')));
    check('A: 手牌【闪】抵消杀', logs.some(l => l.includes('使用【闪') && l.includes(dodgeLog)));
  }

  // ── B：选择判定，牌堆顶为红 → 判定成功视为闪，手牌闪保留 ──
  {
    const spec = baseSpec();
    const { g, logs, asks } = await runGame(spec, (g) => {
      const { end, equipBagua, sha0 } = playScripts(g);
      return {
        '0:play': [end, sha0],
        '1:play': [equipBagua, end],
        // 弃牌阶段确定性弃牌：优先弃非【闪】手牌（随机流对随机弃牌不友好）
        '1:discard': [(d) => {
          const c = g.players[1].hand.find(x => x.name !== '闪') || g.players[1].hand[0];
          return { kind: 'discard', cardIds: [c.id] };
        }],
        '1:skill_ask': [(d) => { rigTop(g, true); return { kind: 'activate', skill: '八卦阵' }; }],
      };
    }, ['八卦阵判定成功']);
    check('B: 触发了八卦阵询问', asks.includes(baguaAsk));
    check('B: 判定成功视为使用【闪】', logs.some(l => l.includes('八卦阵判定成功，视为使用【闪】')));
    check('B: 手牌【闪】未被消耗', g.players[1].hand.filter(c => c.name === '闪').length === 2);
  }

  // ── C：选择判定，牌堆顶为黑 → 判定失败，仍可手牌【闪】响应 ──
  {
    const spec = baseSpec();
    const { logs, asks } = await runGame(spec, (g) => {
      const { end, equipBagua, sha0 } = playScripts(g);
      return {
        '0:play': [end, sha0],
        '1:play': [equipBagua, end],
        '1:skill_ask': [(d) => { rigTop(g, false); return { kind: 'activate', skill: '八卦阵' }; }],
        '1:respond_sha': [(d) => ({ kind: 'respond', cardId: g.players[1].hand.find(x => x.name === '闪').id })],
      };
    }, [dodgeLog]);
    check('C: 判定失败有日志', logs.some(l => l.includes('八卦阵判定失败')));
    check('C: 判定失败后仍可用手牌【闪】', logs.some(l => l.includes('使用【闪') && l.includes(dodgeLog)));
  }

  // ── D：青釭剑无视防具 → 完全不询问 ──
  {
    const spec = baseSpec();
    spec[3] = K('青釭剑', '♠', '6'); // 孙权起手第4张换成青釭剑
    const { logs, asks } = await runGame(spec, (g) => {
      const { end, equipBagua, sha0 } = playScripts(g);
      const equipQinggang = () => {
        const c = g.players[0].hand.find(x => x.name === '青釭剑');
        return { kind: 'play', cardId: c.id };
      };
      return {
        '0:play': [equipQinggang, sha0],
        '1:play': [equipBagua, end],
        '1:respond_sha': [(d) => ({ kind: 'respond', cardId: g.players[1].hand.find(x => x.name === '闪').id })],
      };
    }, [dodgeLog]);
    check('D: 青釭剑下不询问八卦阵', !asks.some(a => a.startsWith('1:skill_ask')));
    check('D: 青釭剑下没有判定', !logs.some(l => l.includes('八卦阵判定')));
    check('D: 仍可手牌【闪】响应', logs.some(l => l.includes('使用【闪') && l.includes(dodgeLog)));
  }

  console.log(`结果：${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
})();
