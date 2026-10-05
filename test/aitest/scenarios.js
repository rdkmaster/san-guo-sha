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
        && (!m.useAs || (opts.useAs === m.useAs)) && (!opts.useAs || m.useAs === opts.useAs));
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
      { pass: !g.logLines.some(l => ILLEGAL.test(l)), desc: 'AI全程无非法动作（AI质量信号）', realOnly: true },
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
      { pass: g.logLines.some(l => /发动【奸雄】/.test(l)), desc: '受伤后发动奸雄', realOnly: true },
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
  // 7. 闪电全程：人类脚本把闪电挂到AI判定区（GLM可能自选弃闪电，故由脚本侧强制）→下回合判定
  {
    name: '闪电-判定雷伤',
    generals: ['甘宁', '黄月英'], first: 1, maxAI: 30,
    deck: [
      ['闪电', '♠', 'A'], ['闪', '♦', '2'], ['桃', '♦', '2'], ['杀', '♦', '7'],
      ['杀', '♥', '10'], ['闪', '♦', '5'], ['桃', '♥', '5'], ['杀', '♠', '8'],
      ['杀', '♠', '10'], ['杀', '♥', '10'],
      ['杀', '♣', '8'], ['杀', '♠', '9'],
      ['桃', '♥', '3'],
      ['雷杀', '♠', '5'],
      ['闪', '♦', '6'], ['桃', '♥', '4'], ['闪', '♦', '7'],
    ],
    humanScript: (g) => {
      const H = mkHelpers(g);
      return async (d) => {
        if (d.type === 'respond_sha') return H.play(d, '闪') || H.kindOf(d, 'refuse');
        if (d.type === 'play') return H.play(d, '闪电') || H.kindOf(d, 'end');
        return H.kindOf(d, 'refuse') || d.playable[0];
      };
    },
    expect: (g) => [
      { pass: g.logLines.some(l => /置于甘宁的判定区/.test(l)), desc: '闪电挂到使用者自己判定区（官方规则）' },
      { pass: g.logLines.some(l => /判定【闪电】/.test(l)), desc: '下回合判定阶段进入闪电判定' },
      { pass: g.logLines.some(l => /黑桃2-9：闪电命中/.test(l)), desc: '雷杀♠5判定命中' },
      { pass: g.logLines.some(l => /受到3点雷伤害/.test(l)), desc: '3点雷伤害结算' },
      { pass: !g.logLines.some(l => /守恒告警/.test(l)), desc: '牌数守恒（闪电进弃牌堆恰一次）' },
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
      { pass: !g.logLines.some(l => ILLEGAL.test(l)), desc: 'AI全程无非法动作（AI质量信号）', realOnly: true },
      { pass: !g.logLines.some(l => /守恒告警/.test(l)), desc: '牌数守恒' },
    ],
  },

  // ============ 以下为覆盖度补全（S9-S28） ============

  // 9. 武圣：关羽红牌当杀（脚本侧转化出杀）
  {
    name: '武圣-红牌当杀',
    generals: ['关羽', '曹操'], first: 0, maxAI: 20,
    deck: [
      ['闪', '♥', '2'], ['桃', '♦', '2'], ['闪', '♦', '3'], ['闪', '♦', '4'],
      ['杀', '♠', '8'], ['闪', '♦', '5'], ['桃', '♥', '5'], ['杀', '♣', '9'],
      ['杀', '♥', '10'], ['桃', '♥', '3'], ['闪', '♦', '6'], ['杀', '♦', '7'],
    ],
    humanScript: (g) => {
      const H = mkHelpers(g);
      return async (d) => {
        if (d.type === 'play') return d.playable.find(m => m.kind === 'play' && m.useAs === '杀') || H.kindOf(d, 'end');
        if (d.type === 'respond_sha') return H.play(d, '闪') || H.kindOf(d, 'refuse');
        return H.kindOf(d, 'refuse') || d.playable[0];
      };
    },
    expect: (g) => [
      { pass: g.logLines.some(l => /使用【杀】（【闪♥2】转化）\s*→ 曹操/.test(l)), desc: '关羽用闪当杀（武圣转化）' },
      { pass: !g.logLines.some(l => /守恒告警/.test(l)), desc: '牌数守恒' },
    ],
  },
  // 10. 咆哮：张飞一回合多杀（GLM选择，realOnly）
  {
    name: '咆哮-张飞多杀',
    generals: ['甘宁', '张飞'], first: 1, maxAI: 20,
    deck: [
      ['杀', '♦', '7'], ['桃', '♦', '2'], ['桃', '♥', '3'], ['闪', '♥', '2'],
      ['杀', '♠', '8'], ['杀', '♣', '8'], ['杀', '♠', '9'], ['杀', '♣', '9'],
      ['杀', '♥', '10'], ['闪', '♦', '5'], ['桃', '♥', '5'], ['闪', '♦', '6'],
    ],
    humanScript: (g) => {
      const H = mkHelpers(g);
      return async (d) => {
        if (d.type === 'respond_sha') return H.kindOf(d, 'refuse'); // 故意全不闪，喂咆哮
        return H.kindOf(d, 'end') || d.playable[0];
      };
    },
    expect: (g) => [
      { pass: g.logLines.filter(l => /张飞 使用【杀】 → /.test(l)).length >= 2, desc: '张飞一回合使用≥2次杀（咆哮无次数限制）', realOnly: true },
      { pass: !g.logLines.some(l => /守恒告警/.test(l)), desc: '牌数守恒' },
    ],
  },
  // 11. 龙胆：赵云闪当杀（脚本侧确定性）+ 杀当闪（GLM攻击后，realOnly）
  {
    name: '龙胆-闪杀互转',
    generals: ['赵云', '曹操'], first: 0, maxAI: 20,
    deck: [
      ['闪', '♦', '2'], ['杀', '♣', '8'], ['闪', '♦', '3'], ['杀', '♣', '9'],
      ['杀', '♠', '8'], ['闪', '♦', '5'], ['桃', '♥', '5'], ['杀', '♥', '10'],
      ['杀', '♦', '7'], ['桃', '♥', '3'], ['闪', '♦', '6'], ['杀', '♠', '10'],
    ],
    humanScript: (g) => {
      const H = mkHelpers(g);
      return async (d) => {
        if (d.type === 'play') return d.playable.find(m => m.kind === 'play' && m.useAs === '杀') || H.play(d, '杀') || H.kindOf(d, 'end');
        if (d.type === 'respond_sha') {
          const longdan = d.playable.find(m => m.kind === 'respond' && m.useAs === '闪' && m.cardId != null
            && g.players[0].hand.find(c => c.id === m.cardId)?.name === '杀');
          return longdan || H.play(d, '闪') || H.kindOf(d, 'refuse');
        }
        return H.kindOf(d, 'refuse') || d.playable[0];
      };
    },
    expect: (g) => [
      { pass: g.logLines.some(l => /使用【杀】（【闪♦2】转化）\s*→ 曹操/.test(l)), desc: '赵云闪当杀（龙胆）' },
      { pass: g.logLines.some(l => /（【杀.{1,6}】转化）抵消杀/.test(l)), desc: '赵云杀当闪抵消（龙胆反向）', realOnly: true },
      { pass: !g.logLines.some(l => /守恒告警/.test(l)), desc: '牌数守恒' },
    ],
  },
  // 12. 集智+奇才+顺手牵羊：黄月英用锦囊摸1；对手+1马拉开距离仍可顺手（无距离限制）
  {
    name: '集智奇才-锦囊摸牌无距离',
    generals: ['黄月英', '曹操'], first: 0, maxAI: 20,
    deck: [
      ['无中生有', '♥', '7'], ['顺手牵羊', '♠', '3'], ['桃', '♦', '2'], ['闪', '♥', '2'],
      ['绝影', '♠', '5'], ['杀', '♠', '8'], ['桃', '♥', '5'], ['杀', '♣', '9'],
      ['杀', '♦', '7'], ['闪', '♦', '5'], ['杀', '♥', '10'], ['闪', '♦', '6'],
    ],
    preSetup: (g) => {
      const i = g.players[1].hand.findIndex(c => c.name === '绝影');
      if (i >= 0) g.players[1].equips.horsePlus = g.players[1].hand.splice(i, 1)[0];
    },
    humanScript: (g) => {
      const H = mkHelpers(g);
      return async (d) => {
        if (d.type === 'skill_ask' && d.skill === '集智') return H.kindOf(d, 'activate');
        if (d.type === 'choose' && d.playable.some(m => m.kind === 'chooseArea')) return d.playable.find(m => m.area === 'hand') || d.playable[0];
        if (d.type === 'play') return H.play(d, '无中生有') || H.play(d, '顺手牵羊') || H.kindOf(d, 'end');
        return H.kindOf(d, 'refuse') || d.playable[0];
      };
    },
    expect: (g) => [
      { pass: g.logLines.some(l => /发动【集智】摸1张牌/.test(l)), desc: '集智：用锦囊后摸1' },
      { pass: g.logLines.some(l => /使用【顺手牵羊】/.test(l)), desc: '奇才：+1马距离2仍可顺手' },
      { pass: g.logLines.some(l => /获得曹操的【/.test(l)), desc: '顺手牵羊获得手牌' },
      { pass: !g.logLines.some(l => /守恒告警/.test(l)), desc: '牌数守恒' },
    ],
  },
  // 13. 奇袭：甘宁黑牌当过河拆桥
  {
    name: '奇袭-黑牌当拆桥',
    generals: ['甘宁', '曹操'], first: 0, maxAI: 20,
    deck: [
      ['杀', '♣', '8'], ['杀', '♠', '9'], ['杀', '♣', '2'], ['桃', '♦', '2'],
      ['杀', '♠', '8'], ['闪', '♦', '5'], ['桃', '♥', '5'], ['杀', '♥', '10'],
      ['杀', '♦', '7'], ['闪', '♦', '6'], ['桃', '♥', '3'], ['闪', '♦', '7'],
    ],
    humanScript: (g) => {
      const H = mkHelpers(g);
      return async (d) => {
        if (d.type === 'choose' && d.playable.some(m => m.kind === 'chooseArea')) return d.playable.find(m => m.area === 'hand') || d.playable[0];
        if (d.type === 'play') {
          const qixi = d.playable.find(m => m.kind === 'play' && m.useAs === '过河拆桥');
          return qixi || H.kindOf(d, 'end');
        }
        return H.kindOf(d, 'refuse') || d.playable[0];
      };
    },
    expect: (g) => [
      { pass: g.logLines.some(l => /使用【过河拆桥】（【杀♣8】转化）/.test(l)), desc: '甘宁黑牌当拆桥（奇袭）' },
      { pass: g.logLines.some(l => /弃置曹操的【/.test(l)), desc: '拆桥弃置对手手牌' },
      { pass: !g.logLines.some(l => /守恒告警/.test(l)), desc: '牌数守恒' },
    ],
  },
  // 14. 八卦阵：AI自动判定（红=闪）
  {
    name: '八卦阵-自动判定',
    generals: ['甘宁', '曹操'], first: 0, maxAI: 20,
    deck: [
      ['杀', '♦', '7'], ['杀', '♥', '10'], ['桃', '♦', '2'], ['闪', '♥', '2'],
      ['八卦阵', '♠', '2'], ['杀', '♠', '8'], ['桃', '♥', '5'], ['杀', '♣', '9'],
      ['杀', '♣', '8'], ['桃', '♥', '3'], ['闪', '♦', '5'], ['闪', '♦', '6'],
    ],
    preSetup: (g) => {
      const i = g.players[1].hand.findIndex(c => c.name === '八卦阵');
      if (i >= 0) g.players[1].equips.armor = g.players[1].hand.splice(i, 1)[0];
    },
    humanScript: (g) => {
      const H = mkHelpers(g);
      return async (d) => {
        if (d.type === 'play') return H.play(d, '杀') || H.kindOf(d, 'end');
        return H.kindOf(d, 'refuse') || d.playable[0];
      };
    },
    expect: (g) => [
      { pass: g.logLines.some(l => /发动【八卦阵】判定：/.test(l)), desc: '八卦阵自动判定触发' },
      { pass: g.logLines.some(l => /八卦阵判定成功，视为使用【闪】/.test(l)), desc: '红牌判定成功（牌堆第10张=桃♥3）' },
      { pass: !g.logLines.some(l => /守恒告警/.test(l)), desc: '牌数守恒' },
    ],
  },
  // 15. 仁王盾：黑色杀无效
  {
    name: '仁王盾-黑杀无效',
    generals: ['甘宁', '曹操'], first: 0, maxAI: 20,
    deck: [
      ['杀', '♣', '8'], ['杀', '♦', '7'], ['桃', '♦', '2'], ['闪', '♥', '2'],
      ['仁王盾', '♣', '2'], ['杀', '♠', '8'], ['桃', '♥', '5'], ['杀', '♣', '9'],
      ['杀', '♥', '10'], ['闪', '♦', '5'], ['桃', '♥', '3'], ['闪', '♦', '6'],
    ],
    preSetup: (g) => {
      const i = g.players[1].hand.findIndex(c => c.name === '仁王盾');
      if (i >= 0) g.players[1].equips.armor = g.players[1].hand.splice(i, 1)[0];
    },
    humanScript: (g) => {
      const H = mkHelpers(g);
      return async (d) => {
        if (d.type === 'play') return H.play(d, '杀') || H.kindOf(d, 'end');
        return H.kindOf(d, 'refuse') || d.playable[0];
      };
    },
    expect: (g) => [
      { pass: g.logLines.some(l => /仁王盾：黑色【杀】无效/.test(l)), desc: '黑杀被仁王盾挡下' },
      { pass: !g.logLines.some(l => /守恒告警/.test(l)), desc: '牌数守恒' },
    ],
  },
  // 16. 白银狮子：酒+杀2点伤害减为1
  {
    name: '白银狮子-减伤',
    generals: ['甘宁', '曹操'], first: 0, maxAI: 20,
    deck: [
      ['酒', '♠', '3'], ['杀', '♣', '8'], ['桃', '♦', '2'], ['闪', '♥', '2'],
      ['白银狮子', '♣', 'A'], ['杀', '♠', '8'], ['桃', '♥', '5'], ['杀', '♣', '9'],
      ['杀', '♦', '7'], ['闪', '♦', '5'], ['桃', '♥', '3'], ['闪', '♦', '6'],
    ],
    preSetup: (g) => {
      const i = g.players[1].hand.findIndex(c => c.name === '白银狮子');
      if (i >= 0) g.players[1].equips.armor = g.players[1].hand.splice(i, 1)[0];
    },
    humanScript: (g) => {
      const H = mkHelpers(g);
      return async (d) => {
        if (d.type === 'play') return H.play(d, '酒') || H.play(d, '杀') || H.kindOf(d, 'end');
        return H.kindOf(d, 'refuse') || d.playable[0];
      };
    },
    expect: (g) => [
      { pass: g.logLines.some(l => /白银狮子：伤害减为1点/.test(l)), desc: '2点伤害（酒+杀）被减为1' },
      { pass: g.logLines.some(l => /受到1点伤害/.test(l)), desc: '实际只受到1点' },
      { pass: !g.logLines.some(l => /守恒告警/.test(l)), desc: '牌数守恒' },
    ],
  },
  // 17. 诸葛连弩：杀无次数限制
  {
    name: '连弩-杀无限制',
    generals: ['甘宁', '曹操'], first: 0, maxAI: 20,
    deck: [
      ['诸葛连弩', '♦', 'A'], ['杀', '♣', '8'], ['杀', '♠', '9'], ['杀', '♣', '9'],
      ['杀', '♠', '8'], ['桃', '♥', '5'], ['杀', '♥', '10'], ['桃', '♥', '3'],
      ['杀', '♦', '7'], ['闪', '♦', '5'], ['桃', '♥', '4'], ['闪', '♦', '6'],
    ],
    preSetup: (g) => {
      const i = g.players[0].hand.findIndex(c => c.name === '诸葛连弩');
      if (i >= 0) g.players[0].equips.weapon = g.players[0].hand.splice(i, 1)[0];
    },
    humanScript: (g) => {
      const H = mkHelpers(g);
      return async (d) => {
        if (d.type === 'play') return H.play(d, '杀') || H.kindOf(d, 'end');
        return H.kindOf(d, 'refuse') || d.playable[0];
      };
    },
    expect: (g) => [
      { pass: g.logLines.filter(l => /使用【杀】 → /.test(l)).length >= 3, desc: '同一回合打出≥3次杀（连弩无限制）' },
      { pass: g.logLines.filter(l => /曹操 受到\d+点伤害/.test(l)).length >= 3, desc: '三次杀全部命中' },
      { pass: !g.logLines.some(l => /守恒告警/.test(l)), desc: '牌数守恒' },
    ],
  },
  // 18. 寒冰剑：防伤害改为弃对手两张牌（脚本侧发动）
  {
    name: '寒冰剑-弃牌代伤',
    generals: ['甘宁', '曹操'], first: 0, maxAI: 20,
    deck: [
      ['寒冰剑', '♠', '2'], ['杀', '♣', '8'], ['桃', '♦', '2'], ['闪', '♥', '2'],
      ['杀', '♠', '8'], ['桃', '♥', '5'], ['杀', '♣', '9'], ['杀', '♥', '10'],
      ['杀', '♦', '7'], ['闪', '♦', '5'], ['桃', '♥', '3'], ['闪', '♦', '6'],
    ],
    preSetup: (g) => {
      const i = g.players[0].hand.findIndex(c => c.name === '寒冰剑');
      if (i >= 0) g.players[0].equips.weapon = g.players[0].hand.splice(i, 1)[0];
    },
    humanScript: (g) => {
      const H = mkHelpers(g);
      return async (d) => {
        if (d.type === 'skill_ask' && d.skill === '寒冰剑') return H.kindOf(d, 'activate');
        if (d.type === 'play') return H.play(d, '杀') || H.kindOf(d, 'end');
        return H.kindOf(d, 'refuse') || d.playable[0];
      };
    },
    expect: (g) => [
      { pass: g.logLines.some(l => /发动【寒冰剑】，弃置曹操的/.test(l)), desc: '寒冰剑弃对手两张牌' },
      { pass: (() => { const i = g.logLines.findIndex(l => /发动【寒冰剑】/.test(l)); const j = g.logLines.findIndex(l => /曹操 受到1点伤害（来自甘宁）/.test(l)); return i >= 0 && (j < 0 || j > i + 2); })(), desc: '首杀伤害被防止（其后才有受伤）' },
      { pass: !g.logLines.some(l => /守恒告警/.test(l)), desc: '牌数守恒' },
    ],
  },
  // 19. 贯石斧：被闪后弃两张牌强制命中（脚本侧发动）
  {
    name: '贯石斧-强制命中',
    generals: ['甘宁', '曹操'], first: 0, maxAI: 20,
    deck: [
      ['贯石斧', '♦', '5'], ['杀', '♣', '8'], ['桃', '♦', '2'], ['闪', '♥', '2'],
      ['闪', '♦', '5'], ['桃', '♥', '5'], ['杀', '♣', '9'], ['杀', '♥', '10'],
      ['杀', '♦', '7'], ['闪', '♦', '6'], ['桃', '♥', '3'], ['闪', '♦', '7'],
    ],
    preSetup: (g) => {
      const i = g.players[0].hand.findIndex(c => c.name === '贯石斧');
      if (i >= 0) g.players[0].equips.weapon = g.players[0].hand.splice(i, 1)[0];
    },
    humanScript: (g) => {
      const H = mkHelpers(g);
      return async (d) => {
        if (d.type === 'skill_ask' && d.skill === '贯石斧') return H.kindOf(d, 'activate');
        if (d.type === 'play') return H.play(d, '杀') || H.kindOf(d, 'end');
        return H.kindOf(d, 'refuse') || d.playable[0];
      };
    },
    expect: (g) => [
      { pass: g.logLines.some(l => /发动【贯石斧】，弃置.+强制造成伤害/.test(l)), desc: '被闪后贯石斧强制命中' },
      { pass: g.logLines.some(l => /曹操 受到1点伤害/.test(l)), desc: '伤害结算' },
      { pass: !g.logLines.some(l => /守恒告警/.test(l)), desc: '牌数守恒' },
    ],
  },
  // 20. 麒麟弓：命中后弃目标坐骑（脚本侧发动）
  {
    name: '麒麟弓-弃坐骑',
    generals: ['甘宁', '曹操'], first: 0, maxAI: 20,
    deck: [
      ['麒麟弓', '♥', '5'], ['杀', '♣', '8'], ['桃', '♦', '2'], ['闪', '♥', '2'],
      ['绝影', '♠', '5'], ['杀', '♠', '8'], ['桃', '♥', '5'], ['杀', '♣', '9'],
      ['杀', '♦', '7'], ['闪', '♦', '5'], ['桃', '♥', '3'], ['闪', '♦', '6'],
    ],
    preSetup: (g) => {
      const i = g.players[0].hand.findIndex(c => c.name === '麒麟弓');
      if (i >= 0) g.players[0].equips.weapon = g.players[0].hand.splice(i, 1)[0];
      const j = g.players[1].hand.findIndex(c => c.name === '绝影');
      if (j >= 0) g.players[1].equips.horsePlus = g.players[1].hand.splice(j, 1)[0];
    },
    humanScript: (g) => {
      const H = mkHelpers(g);
      return async (d) => {
        if (d.type === 'skill_ask' && d.skill === '麒麟弓') return H.kindOf(d, 'activate');
        if (d.type === 'play') return H.play(d, '杀') || H.kindOf(d, 'end');
        return H.kindOf(d, 'refuse') || d.playable[0];
      };
    },
    expect: (g) => [
      { pass: g.logLines.some(l => /发动【麒麟弓】弃置【绝影】/.test(l)), desc: '命中后弃置+1马' },
      { pass: !g.logLines.some(l => /守恒告警/.test(l)), desc: '牌数守恒' },
    ],
  },
  // 21. 古锭刀：目标无手牌伤害+1（对手手牌清空置回牌堆顶）
  {
    name: '古锭刀-空手牌加伤',
    generals: ['甘宁', '曹操'], first: 0, maxAI: 20,
    deck: [
      ['古锭刀', '♠', 'A'], ['杀', '♣', '8'], ['桃', '♦', '2'], ['闪', '♥', '2'],
      ['杀', '♠', '8'], ['杀', '♣', '9'], ['杀', '♥', '10'], ['杀', '♥', 'J'],
      ['杀', '♦', '7'], ['闪', '♦', '5'], ['桃', '♥', '5'], ['闪', '♦', '6'],
    ],
    preSetup: (g) => {
      const i = g.players[0].hand.findIndex(c => c.name === '古锭刀');
      if (i >= 0) g.players[0].equips.weapon = g.players[0].hand.splice(i, 1)[0];
      g.drawPile.unshift(...g.players[1].hand); // 对手手牌清空（牌回牌堆顶，守恒不变）
      g.players[1].hand = [];
    },
    humanScript: (g) => {
      const H = mkHelpers(g);
      return async (d) => {
        if (d.type === 'play') return H.play(d, '杀') || H.kindOf(d, 'end');
        return H.kindOf(d, 'refuse') || d.playable[0];
      };
    },
    expect: (g) => [
      { pass: g.logLines.some(l => /古锭刀：目标无手牌，伤害\+1/.test(l)), desc: '空手牌目标伤害+1' },
      { pass: g.logLines.some(l => /曹操 受到2点伤害/.test(l)), desc: '实际2点伤害' },
      { pass: !g.logLines.some(l => /守恒告警/.test(l)), desc: '牌数守恒（手牌回牌堆）' },
    ],
  },
  // 22. 无中生有+桃园结义+五谷丰登（三锦囊连打，五谷对手先选）
  {
    name: '锦囊-无中桃园五谷',
    generals: ['甘宁', '曹操'], first: 0, maxAI: 20,
    deck: [
      ['无中生有', '♥', '7'], ['桃园结义', '♥', 'A'], ['五谷丰登', '♥', '3'], ['杀', '♦', '7'],
      ['杀', '♠', '8'], ['闪', '♦', '5'], ['桃', '♥', '5'], ['杀', '♣', '9'],
      ['杀', '♣', '2'], ['杀', '♠', '9'], ['杀', '♣', '3'], ['杀', '♠', '10'],
      ['桃', '♦', '2'], ['闪', '♥', '2'],
    ],
    preSetup: (g) => { g.players[0].hp = 3; }, // 桃园结义回1点
    humanScript: (g) => {
      const H = mkHelpers(g);
      return async (d) => {
        if (d.type === 'play') {
          return H.play(d, '无中生有') || H.play(d, '桃园结义') || H.play(d, '五谷丰登') || H.kindOf(d, 'end');
        }
        return H.kindOf(d, 'refuse') || d.playable[0];
      };
    },
    expect: (g) => [
      { pass: g.logLines.some(l => /使用【无中生有】/.test(l)) && g.logLines.some(l => /甘宁 摸2张牌/.test(l)), desc: '无中生有摸2' },
      { pass: g.logLines.some(l => /甘宁 回复1点体力（3→4\/4）/.test(l)), desc: '桃园结义回复体力' },
      { pass: g.logLines.some(l => /五谷丰登展示：/.test(l)) && g.logLines.filter(l => /获得【/.test(l)).length >= 2, desc: '五谷展示2张、双方各得1（对手先选）' },
      { pass: !g.logLines.some(l => /守恒告警/.test(l)), desc: '牌数守恒（五谷limbo记账）' },
    ],
  },
  // 23. 南蛮入侵+万箭齐发（对手自动响应，不占杀次数）
  {
    name: '锦囊-南蛮万箭',
    generals: ['甘宁', '曹操'], first: 0, maxAI: 20,
    deck: [
      ['南蛮入侵', '♠', '7'], ['万箭齐发', '♥', 'A'], ['杀', '♦', '7'], ['桃', '♦', '2'],
      ['杀', '♠', '8'], ['闪', '♦', '5'], ['桃', '♥', '5'], ['杀', '♣', '9'],
      ['杀', '♣', '8'], ['闪', '♦', '6'], ['桃', '♥', '3'], ['杀', '♥', '10'],
    ],
    humanScript: (g) => {
      const H = mkHelpers(g);
      return async (d) => {
        if (d.type === 'play') return H.play(d, '南蛮入侵') || H.play(d, '万箭齐发') || H.play(d, '杀') || H.kindOf(d, 'end');
        if (d.type === 'respond_sha') return H.play(d, '闪') || H.kindOf(d, 'refuse');
        return H.kindOf(d, 'refuse') || d.playable[0];
      };
    },
    expect: (g) => [
      { pass: g.logLines.some(l => /打出【杀】.{0,8}响应南蛮入侵/.test(l)), desc: 'AI有杀响应南蛮（GLM选择）', realOnly: true },
      { pass: g.logLines.some(l => /抵消万箭齐发/.test(l)), desc: 'AI出闪抵消万箭（GLM选择）', realOnly: true },
      { pass: g.logLines.some(l => /使用【杀】 → /.test(l)), desc: '万箭后仍可出杀（不占次数）' },
      { pass: !g.logLines.some(l => /守恒告警/.test(l)), desc: '牌数守恒' },
    ],
  },
  // 24. 火攻：展示手牌→同花色弃牌→火焰伤害（脚本侧驱动）
  {
    name: '火攻-展示与烧牌',
    generals: ['甘宁', '曹操'], first: 0, maxAI: 20,
    deck: [
      ['火攻', '♦', 'Q'], ['杀', '♦', '7'], ['桃', '♦', '2'], ['闪', '♥', '2'],
      ['闪', '♦', '5'], ['闪', '♦', '6'], ['闪', '♦', '7'], ['桃', '♦', '3'],
    ],
    humanScript: (g) => {
      const H = mkHelpers(g);
      return async (d) => {
        if (d.type === 'skill_ask' && d.skill === '火攻') return H.kindOf(d, 'activate');
        if (d.type === 'play') return H.play(d, '火攻') || H.kindOf(d, 'end');
        return H.kindOf(d, 'refuse') || d.playable[0];
      };
    },
    expect: (g) => [
      { pass: g.logLines.some(l => /曹操 展示【闪/.test(l)), desc: 'AI展示方块手牌' },
      { pass: g.logLines.some(l => /受到1点火伤害/.test(l)), desc: '弃同花色牌造成火焰伤害' },
      { pass: !g.logLines.some(l => /守恒告警/.test(l)), desc: '牌数守恒' },
    ],
  },
  // 25. 无懈可击：AI自动抵消无中生有
  {
    name: '无懈可击-抵消锦囊',
    generals: ['甘宁', '曹操'], first: 0, maxAI: 20,
    deck: [
      ['无中生有', '♥', '7'], ['杀', '♦', '7'], ['桃', '♦', '2'], ['闪', '♥', '2'],
      ['无懈可击', '♥', 'A'], ['杀', '♠', '8'], ['桃', '♥', '5'], ['杀', '♣', '9'],
      ['杀', '♣', '8'], ['闪', '♦', '5'], ['桃', '♥', '3'], ['闪', '♦', '6'],
    ],
    humanScript: (g) => {
      const H = mkHelpers(g);
      return async (d) => {
        if (d.type === 'play') return H.play(d, '无中生有') || H.play(d, '杀') || H.kindOf(d, 'end');
        return H.kindOf(d, 'refuse') || d.playable[0];
      };
    },
    expect: (g) => [
      { pass: g.logLines.some(l => /使用【无懈可击】抵消【无中生有】/.test(l)), desc: 'AI出无懈抵消无中生有' },
      { pass: (() => { const i = g.logLines.findIndex(l => /使用【无中生有】/.test(l)); return i >= 0 && /使用【无懈可击】抵消【无中生有】/.test(g.logLines[i + 1] || ''); })(), desc: '无中生有紧接被无懈抵消（没有摸2）' },
      { pass: !g.logLines.some(l => /守恒告警/.test(l)), desc: '牌数守恒' },
    ],
  },
  // 26. 乐不思蜀+兵粮寸断：双延时锦囊判定（判定牌♠8非红桃、♦K非梅花，均生效）
  {
    name: '延时锦囊-乐不兵粮',
    generals: ['甘宁', '曹操'], first: 0, maxAI: 20,
    deck: [
      ['乐不思蜀', '♠', '6'], ['兵粮寸断', '♣', '4'], ['杀', '♦', '7'], ['桃', '♦', '2'],
      ['杀', '♠', '8'], ['闪', '♦', '5'], ['桃', '♥', '5'], ['杀', '♣', '9'],
      ['杀', '♣', '8'], ['杀', '♦', 'K'], ['闪', '♦', '6'], ['桃', '♥', '3'],
    ],
    humanScript: (g) => {
      const H = mkHelpers(g);
      return async (d) => {
        if (d.type === 'play') return H.play(d, '乐不思蜀') || H.play(d, '兵粮寸断') || H.play(d, '杀') || H.kindOf(d, 'end');
        return H.kindOf(d, 'refuse') || d.playable[0];
      };
    },
    expect: (g) => [
      { pass: g.logLines.some(l => /判定【乐不思蜀】/.test(l)) && g.logLines.some(l => /判定牌非红桃：跳过出牌阶段/.test(l)), desc: '乐不思蜀生效（判定牌♠8非红桃）' },
      { pass: g.logLines.some(l => /判定【兵粮寸断】/.test(l)) && g.logLines.some(l => /判定牌非梅花：跳过摸牌阶段/.test(l)), desc: '兵粮寸断生效（判定牌♦K非梅花）' },
      { pass: !g.logLines.some(l => /守恒告警/.test(l)), desc: '牌数守恒' },
    ],
  },
  // 27. 濒死救回：AI濒死，脚本出桃救回
  {
    name: '濒死-桃救回',
    generals: ['张飞', '甘宁'], first: 0, maxAI: 20,
    deck: [
      ['杀', '♣', '8'], ['桃', '♦', '2'], ['桃', '♥', '3'], ['闪', '♥', '2'],
      ['杀', '♠', '8'], ['桃', '♥', '5'], ['杀', '♣', '9'], ['杀', '♥', '10'],
      ['杀', '♦', '7'], ['闪', '♦', '5'], ['桃', '♥', '4'], ['闪', '♦', '6'],
    ],
    preSetup: (g) => { g.players[1].hp = 1; },
    humanScript: (g) => {
      const H = mkHelpers(g);
      return async (d) => {
        if (d.type === 'play') return H.play(d, '杀') || H.kindOf(d, 'end');
        return d.playable[0]; // 濒死询问的第一动作是出桃
      };
    },
    expect: (g) => [
      { pass: g.logLines.some(l => /使用【桃.+?】，甘宁 体力 0→1\/4/.test(l)), desc: '濒死时桃救回（0→1）' },
      { pass: !g.logLines.some(l => /守恒告警/.test(l)), desc: '牌数守恒' },
    ],
  },
  // 28. 弃牌堆8张记忆：renderState只显示最近8张
  {
    name: '弃牌堆-8张记忆',
    generals: ['甘宁', '曹操'], first: 0, maxAI: 20,
    deck: [
      ['杀', '♣', '8'], ['杀', '♠', '9'], ['杀', '♦', '7'], ['桃', '♦', '2'],
      ['杀', '♠', '8'], ['闪', '♦', '5'], ['桃', '♥', '5'], ['杀', '♣', '9'],
      ['杀', '♥', '10'], ['闪', '♦', '6'], ['桃', '♥', '3'], ['杀', '♥', 'J'],
    ],
    humanScript: (g) => {
      const H = mkHelpers(g);
      return async (d) => {
        if (d.type === 'respond_sha') return H.kindOf(d, 'refuse');
        return H.play(d, '杀') || d.playable[0];
      };
    },
    expect: (g) => [
      { pass: g.discardPile.length > 8, desc: '弃牌堆超过8张' },
      { pass: (() => { const s = g.renderState(g.players[0], { type: 'play', playable: [{ kind: 'end' }], context: {} }, null); const line = s.split('\n').find(l => l.includes('弃牌堆（最近8张')); return line && (line.match(/【/g) || []).length === 8; })(), desc: 'renderState只渲染最近8张' },
      { pass: !g.logLines.some(l => /守恒告警/.test(l)), desc: '牌数守恒' },
    ],
  },
  // 29. 决斗×无双：与吕布决斗者每轮需两张杀（k=2循环）
  {
    name: '决斗-无双两杀',
    generals: ['吕布', '甘宁'], first: 0, maxAI: 20,
    deck: [
      ['决斗', '♦', 'A'], ['杀', '♦', '7'], ['桃', '♦', '2'], ['闪', '♥', '2'],
      ['杀', '♠', '8'], ['杀', '♣', '8'], ['桃', '♥', '5'], ['杀', '♥', '10'],
      ['杀', '♣', '9'], ['闪', '♦', '5'], ['桃', '♥', '3'], ['闪', '♦', '6'],
    ],
    humanScript: (g) => {
      const H = mkHelpers(g);
      return async (d) => {
        if (d.type === 'play') return H.play(d, '决斗') || H.play(d, '杀') || H.kindOf(d, 'end');
        if (d.type === 'respond_nanman') return H.play(d, '杀') || H.kindOf(d, 'refuse');
        return H.kindOf(d, 'refuse') || d.playable[0];
      };
    },
    expect: (g) => [
      { pass: g.logLines.some(l => /使用【决斗】/.test(l)), desc: '决斗结算' },
      { pass: g.logLines.some(l => /受到1点伤害/.test(l)), desc: '决斗产生伤害' },
      { pass: !g.logLines.some(l => /的动作不合法|守恒告警/.test(l)), desc: '无双两杀循环合法且守恒' },
    ],
  },
  // 30. 拆桥选装备区/判定区；顺手牵羊不得选判定区（官方规则）
  {
    name: '拆桥-装备区判定区',
    generals: ['甘宁', '曹操'], first: 0, maxAI: 20,
    deck: [
      ['过河拆桥', '♠', '3'], ['过河拆桥', '♣', '3'], ['顺手牵羊', '♠', '4'], ['杀', '♦', '7'],
      ['藤甲', '♠', '2'], ['乐不思蜀', '♠', '6'], ['桃', '♥', '5'], ['杀', '♣', '9'],
      ['杀', '♣', '8'], ['闪', '♦', '5'], ['桃', '♥', '3'], ['闪', '♦', '6'],
    ],
    preSetup: (g) => {
      const i = g.players[1].hand.findIndex(c => c.name === '藤甲');
      if (i >= 0) g.players[1].equips.armor = g.players[1].hand.splice(i, 1)[0];
      const j = g.players[1].hand.findIndex(c => c.name === '乐不思蜀');
      if (j >= 0) g.players[1].judge.push(g.players[1].hand.splice(j, 1)[0]);
      g.__cap = { areas: ['hand', 'equip', 'judge'], judgeSeen: {} }; // 顺手→拿手牌；拆桥1→装备区；拆桥2→判定区
    },
    humanScript: (g) => {
      const H = mkHelpers(g);
      return async (d) => {
        if (d.type === 'choose' && d.playable.some(m => m.kind === 'chooseArea')) {
          const q = d.context.question || '';
          g.__cap.judgeSeen[q.split('：')[0]] = d.playable.some(m => m.area === 'judge');
          const want = g.__cap.areas.shift() || 'hand';
          return d.playable.find(m => m.area === want) || d.playable[0];
        }
        if (d.type === 'play') {
          return H.play(d, '顺手牵羊') || H.play(d, '过河拆桥') || H.play(d, '杀') || H.kindOf(d, 'end');
        }
        return H.kindOf(d, 'refuse') || d.playable[0];
      };
    },
    expect: (g) => [
      { pass: g.__cap.judgeSeen['顺手牵羊'] === false, desc: '顺手牵羊不提供判定区选项（官方规则）' },
      { pass: g.__cap.judgeSeen['过河拆桥'] === true, desc: '过河拆桥提供判定区选项' },
      { pass: g.logLines.some(l => /获得曹操的【杀♣9】/.test(l)), desc: '顺手牵羊获得手牌' },
      { pass: g.logLines.some(l => /弃置曹操的【藤甲♠2】/.test(l)), desc: '拆桥选装备区' },
      { pass: g.logLines.some(l => /弃置曹操的【乐不思蜀♠6】/.test(l)), desc: '拆桥选判定区' },
      { pass: !g.logLines.some(l => /守恒告警/.test(l)), desc: '牌数守恒' },
    ],
  },
  // 31. 借刀无杀：官方规则——目标无【杀】可打出，武器被强制移交（引擎代码结算）
  {
    name: '借刀-无杀强制交武器',
    generals: ['甘宁', '吕布'], first: 0, maxAI: 20,
    deck: [
      ['借刀杀人', '♣', 'Q'], ['杀', '♦', '7'], ['桃', '♦', '2'], ['闪', '♥', '2'],
      ['青釭剑', '♠', '6'], ['闪', '♦', '5'], ['桃', '♥', '5'], ['闪', '♦', '6'],
      ['杀', '♣', '8'], ['闪', '♦', '7'], ['桃', '♥', '3'], ['闪', '♦', '4'],
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
      { pass: g.logLines.some(l => /使用【借刀杀人】/.test(l)), desc: '借刀打出' },
      { pass: g.logLines.some(l => /吕布 无【杀】可出，将【青釭剑】交给甘宁/.test(l)), desc: '目标无杀：武器强制移交（官方规则，移交日志=代码路径执行）' },
      { pass: !g.logLines.some(l => /守恒告警/.test(l)), desc: '牌数守恒' },
    ],
  },
  // 32. 火攻无同花色：展示♦而攻方无♦牌 → 无法火攻
  {
    name: '火攻-无同花色',
    generals: ['甘宁', '曹操'], first: 0, maxAI: 20,
    deck: [
      ['火攻', '♥', '3'], ['杀', '♣', '8'], ['桃', '♥', '4'], ['闪', '♥', '2'],
      ['闪', '♦', '5'], ['闪', '♦', '6'], ['闪', '♦', '7'], ['桃', '♦', '3'],
      ['杀', '♣', '2'], ['闪', '♦', '4'], ['桃', '♥', '5'], ['闪', '♦', '8'],
    ],
    humanScript: (g) => {
      const H = mkHelpers(g);
      return async (d) => {
        if (d.type === 'play') return H.play(d, '火攻') || H.play(d, '杀') || H.kindOf(d, 'end');
        return H.kindOf(d, 'refuse') || d.playable[0];
      };
    },
    expect: (g) => [
      { pass: g.logLines.some(l => /甘宁 无同花色手牌，无法火攻/.test(l)), desc: '无同花色：火攻无伤害' },
      { pass: (() => { const i = g.logLines.findIndex(l => /使用【火攻】/.test(l)); const j = g.logLines.findIndex(l => /无同花色手牌/.test(l)); const k = g.logLines.findIndex(l => /受到1点火伤害（来自甘宁）/.test(l)); return i >= 0 && j > i && (k < 0 || k > j); })(), desc: '第一次火攻未造成火焰伤害（后续摸到♦牌后另算）' },
      { pass: !g.logLines.some(l => /守恒告警/.test(l)), desc: '牌数守恒' },
    ],
  },
];

module.exports = { SCENARIOS, mkHelpers, ILLEGAL };
