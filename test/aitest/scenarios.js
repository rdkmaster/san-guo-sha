// 场景库：定向发牌 + 人类侧脚本 + 断言
// deck: 发牌顺序 [名,花色,点数]，前4张=侧0(人类脚本)起手，5-8张=侧1(AI)起手，之后为摸牌/判定顺序
//   杀=普通杀，火杀/雷杀=对应子类（真实牌池取牌）
// humanScript(g): 侧0决策脚本 (decision) => move
// expect(g): [{pass, desc, realOnly?}] realOnly断言仅在--real模式检查
// preSetup(g): 发牌后微调（装备/体力）
function mkHelpers(game) {
  return {
    game,
    play(d, name, opts = {}) {
      return d.playable.find(m => ['play', 'respond', 'tao', 'wuxie'].includes(m.kind) && m.cardId != null
        && game.players[d.playerIdx].hand.find(c => c.id === m.cardId)?.name === name
        && (!opts.useAs || m.useAs === opts.useAs));
    },
    kindOf: (d, kind) => d.playable.find(m => m.kind === kind),
  };
}
const ILLEGAL = /的动作不合法/;

const SCENARIOS = [
  // 1. 无双：吕布(人类脚本)杀赵云(AI)——AI需两张闪
  {
    name: '无双-吕布杀需两闪',
    generals: ['吕布', '赵云'], first: 0, maxAI: 20,
    deck: [
      ['杀', '♠', '7'], ['杀', '♣', '8'], ['杀', '♠', '9'], ['杀', '♣', '9'],
      ['闪', '♦', '2'], ['闪', '♦', '3'], ['桃', '♦', '2'], ['杀', '♥', 'J'],
      ['闪', '♦', '4'], ['闪', '♦', '5'], ['闪', '♦', '6'], ['桃', '♥', '5'],
    ],
    humanScript: (g) => {
      const H = mkHelpers(g);
      return async (d) => {
        if (d.type === 'play') return H.play(d, '杀') || H.kindOf(d, 'end');
        if (d.type === 'respond_sha') return H.play(d, '闪') || H.kindOf(d, 'refuse');
        return H.kindOf(d, 'refuse') || d.playable[0];
      };
    },
    expect: (g) => [
      { pass: !g.logLines.some(l => ILLEGAL.test(l)), desc: '无双流程AI动作全部合法' },
      { pass: !g.logLines.some(l => /守恒告警/.test(l)), desc: '牌数守恒' },
    ],
  },
  // 2. 藤甲在场：AI(甘宁)面对藤甲曹操，火杀+1/普杀无效
  {
    name: '藤甲-火杀vs普杀',
    generals: ['曹操', '甘宁'], first: 1, maxAI: 20,
    deck: [
      ['藤甲', '♠', '2'], ['杀', '♣', '8'], ['杀', '♠', '9'], ['杀', '♣', '9'],
      ['火杀', '♥', '7'], ['杀', '♥', '10'], ['桃', '♦', '2'], ['酒', '♠', '3'],
      ['桃', '♥', '3'], ['闪', '♦', '5'], ['闪', '♦', '6'], ['桃', '♥', '5'],
    ],
    preSetup: (g) => {
      const i = g.players[0].hand.findIndex(c => c.name === '藤甲');
      if (i >= 0) g.players[0].equips.armor = g.players[0].hand.splice(i, 1)[0];
    },
    humanScript: (g) => {
      const H = mkHelpers(g);
      return async (d) => {
        if (d.type === 'respond_sha') return H.kindOf(d, 'refuse');
        return H.kindOf(d, 'end') || d.playable[0];
      };
    },
    expect: (g) => [
      { pass: g.logLines.some(l => /火杀\+藤甲：伤害\+1/.test(l) || /受到[123]点伤害/.test(l)), desc: 'AI用火杀穿透藤甲（含酒加成）' },
      { pass: !g.logLines.some(l => /藤甲：普通【杀】无效/.test(l)), desc: 'AI没有用普杀浪费在藤甲上', realOnly: true },
    ],
  },
  // 3. 青龙偃月刀：AI(曹操)被闪后发动追杀
  {
    name: '青龙刀-被闪追杀',
    generals: ['甘宁', '曹操'], first: 1, maxAI: 20,
    deck: [
      ['闪', '♦', '5'], ['杀', '♠', '9'], ['杀', '♣', '9'], ['桃', '♦', '2'],
      ['青龙偃月刀', '♠', '5'], ['杀', '♣', '8'], ['杀', '♥', 'J'], ['桃', '♥', '4'],
      ['闪', '♦', '6'], ['闪', '♦', '7'], ['杀', '♠', '10'], ['桃', '♥', '5'],
    ],
    preSetup: (g) => {
      const i = g.players[1].hand.findIndex(c => c.name === '青龙偃月刀');
      if (i >= 0) g.players[1].equips.weapon = g.players[1].hand.splice(i, 1)[0];
    },
    humanScript: (g) => {
      const H = mkHelpers(g);
      return async (d) => {
        if (d.type === 'respond_sha') return H.play(d, '闪') || H.kindOf(d, 'refuse');
        return H.kindOf(d, 'end') || d.playable[0];
      };
    },
    expect: (g) => [
      { pass: g.logLines.some(l => /发动【青龙偃月刀】/.test(l)), desc: 'AI被闪后发动青龙刀追杀', realOnly: true },
      { pass: g.logLines.some(l => /曹操 受到|甘宁 受到/.test(l)), desc: '追杀造成伤害' },
    ],
  },
  // 4. 曹操满血不吃桃 + 受伤奸雄
  {
    name: '曹操-满血不吃桃+奸雄',
    generals: ['甘宁', '曹操'], first: 1, maxAI: 20,
    deck: [
      ['杀', '♥', '10'], ['闪', '♦', '2'], ['桃', '♦', '2'], ['杀', '♦', '7'],
      ['杀', '♠', '8'], ['桃', '♥', '3'], ['杀', '♦', '8'], ['闪', '♦', '5'],
      ['闪', '♦', '6'], ['桃', '♥', '5'], ['杀', '♠', '10'], ['杀', '♥', '10'],
    ],
    humanScript: (g) => {
      const H = mkHelpers(g);
      return async (d) => {
        if (d.type === 'respond_sha') return H.kindOf(d, 'refuse');
        const sha = H.play(d, '杀');
        return sha || H.kindOf(d, 'end');
      };
    },
    expect: (g) => [
      { pass: !g.logLines.some(l => /曹操 使用【桃】/.test(l) && g.logLines.indexOf(l) < g.logLines.findIndex(x => /曹操 受到\d+点伤害/.test(x))), desc: '满血阶段曹操不吃桃' },
      { pass: g.logLines.some(l => /发动【奸雄】/.test(l)), desc: '受伤后发动奸雄' },
    ],
  },
  // 5. 决斗+奸雄：决斗牌应被AI曹操拿走
  {
    name: '决斗-奸雄拿决斗牌',
    generals: ['甘宁', '曹操'], first: 0, maxAI: 20,
    deck: [
      ['决斗', '♦', 'A'], ['杀', '♣', '8'], ['杀', '♠', '9'], ['杀', '♣', '9'],
      ['杀', '♥', '10'], ['桃', '♦', '2'], ['杀', '♦', '8'], ['闪', '♦', '5'],
      ['闪', '♦', '6'], ['桃', '♥', '5'], ['杀', '♠', '10'], ['杀', '♥', '10'],
    ],
    humanScript: (g) => {
      const H = mkHelpers(g);
      return async (d) => {
        if (d.type === 'play') return H.play(d, '决斗') || H.kindOf(d, 'end');
        if (d.type === 'respond_nanman') return H.play(d, '杀') || H.kindOf(d, 'refuse');
        return H.kindOf(d, 'refuse') || d.playable[0];
      };
    },
    expect: (g) => [
      { pass: g.logLines.some(l => /发动【奸雄】获得【决斗/.test(l)), desc: '奸雄拿走决斗牌' },
      { pass: !g.logLines.some(l => /守恒告警/.test(l)), desc: '牌数守恒（limbo记账正确）' },
    ],
  },
  // 6. 制衡：AI(孙权)满手闪无杀，应发动制衡换牌
  {
    name: '制衡-孙权换牌',
    generals: ['曹操', '孙权'], first: 1, maxAI: 25,
    deck: [
      ['杀', '♥', '10'], ['闪', '♦', '2'], ['桃', '♦', '2'], ['杀', '♦', '7'],
      ['闪', '♦', '3'], ['闪', '♦', '4'], ['闪', '♦', '6'], ['闪', '♦', '7'],
      ['杀', '♠', '8'], ['桃', '♥', '3'], ['杀', '♠', '10'], ['杀', '♥', '10'],
    ],
    humanScript: (g) => {
      const H = mkHelpers(g);
      return async (d) => {
        if (d.type === 'respond_sha') return H.kindOf(d, 'refuse');
        return H.kindOf(d, 'end') || d.playable[0];
      };
    },
    expect: (g) => [
      { pass: g.logLines.some(l => /发动【制衡】，弃\d+张摸\d+张/.test(l)), desc: '孙权发动制衡且弃X摸X被正确执行', realOnly: true },
      { pass: !g.logLines.some(l => /找不到该手牌/.test(l)), desc: '制衡执行无"找不到牌"错误' },
    ],
  },
  // 7. 闪电全程：AI(黄月英)挂闪电→下回合判定→观察雷伤/濒死/自救
  {
    name: '闪电-判定与濒死自救',
    generals: ['甘宁', '黄月英'], first: 1, maxAI: 30,
    deck: [
      ['杀', '♥', '10'], ['闪', '♦', '2'], ['桃', '♦', '2'], ['杀', '♦', '7'],
      ['闪电', '♠', 'A'], ['杀', '♦', '8'], ['闪', '♦', '5'], ['桃', '♥', '5'],
      ['杀', '♠', '10'], ['杀', '♥', '10'],
      ['雷杀', '♠', '6'], ['桃', '♥', '6'],
    ],
    humanScript: (g) => {
      const H = mkHelpers(g);
      return async (d) => {
        if (d.type === 'respond_sha') return H.play(d, '闪') || H.kindOf(d, 'refuse');
        return H.kindOf(d, 'end') || d.playable[0];
      };
    },
    expect: (g) => [
      { pass: g.logLines.some(l => /置于黄月英的判定区/.test(l)), desc: 'AI把闪电挂到自己判定区' },
      { pass: g.logLines.some(l => /判定【闪电】/.test(l)), desc: '下回合进入闪电判定' },
    ],
  },
  // 8. 借刀杀人：人类借AI(吕布)的刀，AI有武器有杀，观察其选择
  {
    name: '借刀杀人-AI的刀被借',
    generals: ['甘宁', '吕布'], first: 0, maxAI: 25,
    deck: [
      ['借刀杀人', '♣', 'Q'], ['杀', '♣', '8'], ['杀', '♠', '9'], ['杀', '♣', '9'],
      ['青釭剑', '♠', '6'], ['杀', '♥', '10'], ['桃', '♦', '2'], ['闪', '♦', '5'],
      ['闪', '♦', '6'], ['桃', '♥', '5'], ['杀', '♠', '10'], ['杀', '♥', '10'],
    ],
    preSetup: (g) => {
      const i = g.players[1].hand.findIndex(c => c.name === '青釭剑');
      if (i >= 0) g.players[1].equips.weapon = g.players[1].hand.splice(i, 1)[0];
    },
    humanScript: (g) => {
      const H = mkHelpers(g);
      return async (d) => {
        if (d.type === 'play') return H.play(d, '借刀杀人') || H.kindOf(d, 'end');
        if (d.type === 'respond_sha') return H.play(d, '闪') || H.kindOf(d, 'refuse');
        return H.kindOf(d, 'refuse') || d.playable[0];
      };
    },
    expect: (g) => [
      { pass: g.logLines.some(l => /借刀杀人/.test(l)) && g.logLines.some(l => /出【杀】→|交给/.test(l)), desc: '借刀流程走通（AI出杀或交刀）' },
      { pass: !g.logLines.some(l => ILLEGAL.test(l)), desc: 'AI的daodao决策合法' },
    ],
  },
];

module.exports = { SCENARIOS, mkHelpers, ILLEGAL };
