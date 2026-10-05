// 三国杀 1v1 规则引擎：状态机 + 武将技能 + 装备 + 锦囊 + 濒死
// 决策通过注入的 ask 回调（人类→浏览器UI，AI→droid exec，自测→随机），
// 引擎只负责计算合法动作与执行效果，所有动作都经合法性校验（非法→重问3次→随机兜底）。
const { buildDeck, makeRiggedDeck, isRed, isBlack, equipSlot, weaponRange } = require('./cards');

const GENERALS = {
  '关羽':   { hp: 4, kingdom: '蜀', gender: 'm', skills: ['武圣'] },
  '张飞':   { hp: 4, kingdom: '蜀', gender: 'm', skills: ['咆哮'] },
  '赵云':   { hp: 4, kingdom: '蜀', gender: 'm', skills: ['龙胆'] },
  '吕布':   { hp: 4, kingdom: '群', gender: 'm', skills: ['无双'] },
  '曹操':   { hp: 4, kingdom: '魏', gender: 'm', skills: ['奸雄'] },
  '孙权':   { hp: 4, kingdom: '吴', gender: 'm', skills: ['制衡'] },
  '黄月英': { hp: 3, kingdom: '蜀', gender: 'f', skills: ['集智', '奇才'] },
  '甘宁':   { hp: 4, kingdom: '吴', gender: 'm', skills: ['奇袭'] },
};

const SKILL_TEXTS = {
  '武圣': '你可以将一张红色牌当【杀】使用或打出。',
  '咆哮': '锁定技。你使用【杀】无次数限制。',
  '龙胆': '你可以将【杀】当【闪】、【闪】当【杀】使用或打出。',
  '无双': '锁定技。你使用【杀】指定目标后，目标需连续使用两张【闪】抵消；与你决斗的角色每次需先打出两张【杀】。',
  '奸雄': '当你受到伤害后，你可以获得造成此伤害的牌。',
  '制衡': '出牌阶段限一次。你可以弃置任意张手牌，然后摸等量的牌。',
  '集智': '当你使用锦囊牌时，你可以摸一张牌。',
  '奇才': '锁定技。你使用锦囊牌无距离限制。',
  '奇袭': '你可以将一张黑色牌当【过河拆桥】使用。',
};

const DISCARD_MEMORY = 8; // 弃牌堆可见张数（模拟人类记忆上限）
const RANK_ORDER = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor((rng ? rng() : Math.random()) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function cardName(c) {
  if (!c) return '【?】';
  return `【${c.name}${c.subtype && c.subtype !== '普通杀' ? '(' + c.subtype + ')' : ''}${c.suit}${c.rank}】`;
}

class Game {
  constructor(opts) {
    this.opts = opts || {};
    this.ask = opts.ask;                       // async ({playerIdx,type,playable,context,skill,stateMd}) => move|action
    this.onEvent = opts.onEvent || (() => {});
    this.rng = opts.seed != null ? mulberry32(opts.seed) : Math.random;
    this.over = false;
    this.aborted = false; // 对局被放弃（重开）时置位，引擎快速终止
    this.winner = null;
    this.turnNo = 0;
    this.decisionNo = 0;
    this.logLines = [];
    this.cardTaken = false; // 奸雄拿牌标记
    this.limbo = new Set(); // 结算暂离区（五谷展示中/伤害牌结算中），供守恒校验
  }

  // 牌数守恒：154张（160 - 6铁索）必须全部分布在场
  invariant() {
    let n = this.drawPile.length + this.discardPile.length + this.limbo.size;
    for (const p of this.players) {
      n += p.hand.length + p.judge.length + Object.values(p.equips).filter(Boolean).length;
    }
    return { ok: n === 154, total: n };
  }

  setup() {
    // 牌堆：定向发牌（测试）或常规洗牌（铁索连环在1v1中不使用）
    this.drawPile = this.opts.deck
      ? makeRiggedDeck(this.opts.deck).filter(c => c.name !== '铁索连环')
      : buildDeck(this.rng).filter(c => c.name !== '铁索连环');
    this.discardPile = [];
    const names = (this.opts.generals && this.opts.generals.length === 2)
      ? this.opts.generals
      : shuffle(Object.keys(GENERALS), this.rng);
    if (this.opts.first != null) this.first = this.opts.first;
    else this.first = this.rng() < 0.5 ? 0 : 1;
    const mk = (idx, name) => {
      const g = GENERALS[name];
      return {
        idx, general: name, kingdom: g.kingdom, gender: g.gender, skills: g.skills,
        hp: g.hp, maxHp: g.hp,
        hand: [], equips: { weapon: null, armor: null, horsePlus: null, horseMinus: null },
        judge: [], shaUsed: 0, jiuUsed: 0, zhihengUsed: false,
        skipPlay: false, skipDraw: false, drunken: false,
      };
    };
    this.players = [mk(0, names[0]), mk(1, names[1])];
    this.turnPlayer = this.players[this.first];
    for (const p of this.players) this.draw(p, 4);
    this.setupDone = true;
    this.log(`对局开始：${this.players[0].general}（玩家） vs ${this.players[1].general}（AI），先手：${this.players[this.first].general}`);
    this.emitState();
  }

  // ---------- 基础工具 ----------
  other(p) { return this.players[1 - p.idx]; }
  emitState() { this.onEvent({ type: 'state', state: this.snapshot() }); }
  log(msg) { this.logLines.push(msg); this.onEvent({ type: 'log', msg, seq: this.logLines.length }); }

  snapshot() {
    const pub = (p) => ({
      general: p.general, kingdom: p.kingdom,
      skills: p.skills.map(s => ({ name: s, text: SKILL_TEXTS[s] })),
      hp: Math.max(p.hp, 0), maxHp: p.maxHp, handCount: p.hand.length,
      equips: Object.fromEntries(Object.entries(p.equips).map(([k, v]) => [k, v ? { name: v.name, suit: v.suit, rank: v.rank, subtype: v.subtype, image: v.image } : null])),
      judge: p.judge.map(c => ({ name: c.name, suit: c.suit, rank: c.rank, image: c.image })),
    });
    return {
      over: this.over, winner: this.winner,
      players: this.players.map(pub),
      // 调试信息：AI（侧1）手牌，供人类玩家核对AI行为
      aiHand: this.players[1] ? this.players[1].hand.map(c => ({ id: c.id, name: c.name, suit: c.suit, rank: c.rank, subtype: c.subtype, category: c.category, equip: c.equip, image: c.image })) : [],
      discardPile: this.discardPile.slice(-DISCARD_MEMORY).map(c => ({ name: c.name, suit: c.suit, rank: c.rank, image: c.image })),
      discardTotal: this.discardPile.length,
      drawPileCount: this.drawPile.length,
      turnNo: this.turnNo, turnPlayer: this.turnPlayer ? this.turnPlayer.idx : null,
      phase: this.phase || null,
      log: this.logLines.slice(-60),
      logSeq: this.logLines.length,
    };
  }

  // 摸一张（含弃牌堆洗回）
  drawOne() {
    if (this.drawPile.length === 0) {
      if (this.discardPile.length === 0) return null;
      this.drawPile = shuffle(this.discardPile, this.rng);
      this.discardPile = [];
      this.log('牌堆摸空，弃牌堆洗匀作为新牌堆');
    }
    return this.drawPile.shift();
  }
  draw(p, n) {
    let got = 0;
    for (let i = 0; i < n; i++) {
      const c = this.drawOne();
      if (!c) break;
      p.hand.push(c); got++;
    }
    return got;
  }
  toDiscard(cards) {
    if (!Array.isArray(cards)) cards = [cards];
    for (const c of cards) this.limbo.delete(c);
    this.discardPile.push(...cards);
  }
  inHand(p, cardId) { return p.hand.find(c => c.id === cardId) || null; }
  hasCards(p) {
    return p.hand.length > 0 || Object.values(p.equips).some(Boolean) || p.judge.length > 0;
  }
  distance(from, to) {
    return Math.max(1, 1 + (to.equips.horsePlus ? 1 : 0) - (from.equips.horseMinus ? 1 : 0));
  }
  attackRange(p) { return p.equips.weapon ? weaponRange(p.equips.weapon) : 1; }
  shaUnlimited(p) {
    return p.skills.includes('咆哮') || (p.equips.weapon && p.equips.weapon.name === '诸葛连弩');
  }
  noTrickDistance(p) { return p.skills.includes('奇才'); }

  // ---------- 主循环 ----------
  async run() {
    if (!this.setupDone) this.setup();
    let cur = this.first;
    while (!this.over && !this.aborted) {
      await this.turn(cur);
      if (this.over || this.aborted) break;
      cur = 1 - cur;
    }
    return this.winner;
  }

  async turn(idx) {
    const p = this.players[idx];
    this.turnNo++;
    this.turnPlayer = p;
    p.shaUsed = 0; p.jiuUsed = 0; p.zhihengUsed = false; p.drunken = false;
    p.skipPlay = false; p.skipDraw = false;
    const isFirstTurn = (idx === this.first && this.turnNo === 1);
    this.log(`—— 第${this.turnNo}回合：${p.general}（${p.hp}/${p.maxHp}）——`);
    this.emitState();

    this.phase = '判定';
    for (const card of [...p.judge]) {
      if (this.over || this.aborted) return;
      await this.resolveDelayed(p, card);
      this.emitState();
    }
    if (this.over || this.aborted) return;

    this.phase = '摸牌';
    if (p.skipDraw) { this.log(`${p.general} 跳过摸牌阶段`); }
    else if (isFirstTurn) {
      // 官方1v1平衡规则：先手第一回合摸牌阶段少摸一张
      const n = this.draw(p, 1);
      this.log(`${p.general} 先手第一回合，摸牌阶段少摸一张（摸${n}张）`);
    } else {
      const n = this.draw(p, 2);
      this.log(`${p.general} 摸${n}张牌`);
    }
    this.emitState();

    this.phase = '出牌';
    if (p.skipPlay) {
      this.log(`${p.general} 跳过出牌阶段`);
    } else {
      let guard = 0;
      while (!this.over && !this.aborted) {
        if (++guard > 60) { this.log('出牌阶段过长，强制结束'); break; }
        const decision = this.playDecision(p);
        const move = await this.askPlayer(p, decision);
        if (!move || move.kind === 'end') break;
        await this.executePlay(p, move);
        this.emitState();
      }
    }
    if (this.over || this.aborted) return;

    this.phase = '弃牌';
    let discardGuard = 0;
    while (p.hand.length > p.hp && !this.over && !this.aborted) {
      if (++discardGuard > 20) { this.log('弃牌阶段异常，自动随机弃置'); break; }
      const n = p.hand.length - p.hp;
      const decision = this.discardDecision(p, n);
      const move = await this.askPlayer(p, decision);
      let cards = (move && move.kind === 'discard' && move.cardIds)
        ? move.cardIds.map(id => this.inHand(p, id)).filter(Boolean)
        : [];
      // 去重 + 数量校验
      cards = [...new Set(cards)];
      if (cards.length !== n) {
        this.log(`弃牌数量不合法，改为随机弃置${n}张`);
        cards = shuffle(p.hand, this.rng).slice(0, n);
      }
      p.hand = p.hand.filter(c => !cards.includes(c));
      this.toDiscard(cards);
      this.log(`${p.general} 弃置 ${cards.map(cardName).join('、')}`);
      this.emitState();
    }
    // 回合边界结算全部落定，守恒校验有意义（结算中途牌在途属正常）
    const inv = this.invariant();
    if (!inv.ok) this.log(`【守恒告警】${inv.total}/154`);
    this.emitState();
  }

  // ---------- 判定区结算 ----------
  async resolveDelayed(p, card) {
    p.judge = p.judge.filter(c => c !== card);
    const jc = this.drawOne();
    if (!jc) { this.toDiscard(card); return; }
    this.log(`${p.general} 判定【${card.name}】→ ${cardName(jc)}`);
    if (card.name === '乐不思蜀') {
      if (jc.suit !== '♥') { p.skipPlay = true; this.log('判定牌非红桃：跳过出牌阶段'); }
      else this.log('判定牌为红桃：无效果');
      this.toDiscard(card);
    } else if (card.name === '兵粮寸断') {
      if (jc.suit !== '♣') { p.skipDraw = true; this.log('判定牌非梅花：跳过摸牌阶段'); }
      else this.log('判定牌为梅花：无效果');
      this.toDiscard(card);
    } else if (card.name === '闪电') {
      const r = RANK_ORDER.indexOf(jc.rank) + 1;
      if (jc.suit === '♠' && r >= 2 && r <= 9) {
        this.log('黑桃2-9：闪电命中！');
        await this.dealDamage(p, 3, { source: null, card, nature: '雷' });
        if (!this.cardTaken) this.toDiscard(card); // 未被奸雄拿走则进弃牌堆
        this.cardTaken = false;
      } else {
        this.log('未命中，闪电移至对手判定区');
        this.other(p).judge.push(card);
      }
    }
    this.toDiscard(jc);
  }

  // ---------- 伤害与濒死 ----------
  async dealDamage(target, amount, { source = null, card = null, nature = '普通', pierceArmor = false } = {}) {
    if (this.over || amount <= 0) return;
    if (card) this.limbo.add(card); // 结算中的伤害牌暂离（奸雄可取）
    if (!pierceArmor && target.equips.armor && target.equips.armor.name === '白银狮子' && amount > 1) {
      amount = 1; this.log('白银狮子：伤害减为1点');
    }
    target.hp -= amount;
    this.log(`${target.general} 受到${amount}点${nature === '普通' ? '' : nature}伤害${source ? `（来自${source.general}）` : ''}，体力 ${target.hp + amount}→${target.hp}/${target.maxHp}`);
    this.emitState();
    // 奸雄：拿走造成伤害的牌（card 此时未进弃牌堆）
    if (card && !this.cardTaken && target.skills.includes('奸雄')) {
      const decision = {
        playerIdx: target.idx, type: 'skill_ask', skill: '奸雄',
        playable: [{ kind: 'activate', skill: '奸雄' }, { kind: 'skip', skill: '奸雄' }],
        context: { question: `是否发动【奸雄】获得造成伤害的牌${cardName(card)}？` },
      };
      const move = await this.askPlayer(target, decision);
      if (move && move.kind === 'activate') {
        this.cardTaken = true;
        this.limbo.delete(card);
        target.hand.push(card);
        this.log(`${target.general} 发动【奸雄】获得${cardName(card)}`);
      }
    }
    if (target.hp <= 0) await this.dying(target);
  }

  async dying(target) {
    const order = this.turnPlayer === target ? [target, this.other(target)] : [this.other(target), target];
    let round = 0;
    while (target.hp <= 0 && !this.over) {
      let anyAsked = false;
      for (const helper of order) {
        if (target.hp > 0) break;
        const usable = helper.hand.filter(c => c.name === '桃' || (helper === target && c.name === '酒'));
        if (usable.length === 0) continue;
        const decision = {
          playerIdx: helper.idx, type: 'dying',
          playable: usable.map(c => ({ kind: 'tao', cardId: c.id })).concat([{ kind: 'refuse' }]),
          context: { dying: target.general, dyingHp: target.hp },
        };
        const move = await this.askPlayer(helper, decision);
        anyAsked = true;
        if (move && move.kind === 'tao') {
          const card = this.inHand(helper, move.cardId);
          if (card) {
            helper.hand = helper.hand.filter(c => c !== card);
            this.toDiscard(card);
            const before = target.hp;
            target.hp += 1;
            this.log(`${helper.general} 使用${cardName(card)}，${target.general} 体力 ${before}→${target.hp}/${target.maxHp}`);
            this.emitState();
          }
        }
      }
      if (!anyAsked) break;
      if (++round > 20) break;
    }
    if (target.hp <= 0 && !this.over) {
      this.over = true;
      this.winner = this.other(target).idx;
      this.log(`★ ${target.general} 阵亡！${this.other(target).general} 获胜`);
      this.emitState();
    }
  }

  // ---------- 出牌阶段 ----------
  playDecision(p) {
    const opp = this.other(p);
    const playable = [{ kind: 'end' }];
    const canSha = this.shaUnlimited(p) || p.shaUsed === 0;
    const rangeOk = this.distance(p, opp) <= this.attackRange(p);
    const shaOk = canSha && rangeOk;

    for (const c of p.hand) {
      const slot = equipSlot(c);
      if (slot) { playable.push({ kind: 'play', cardId: c.id, targets: [p.idx] }); continue; }
      if (c.name === '杀') { if (shaOk) playable.push({ kind: 'play', cardId: c.id, targets: [opp.idx] }); }
      else if (c.name === '桃') { if (p.hp < p.maxHp) playable.push({ kind: 'play', cardId: c.id, targets: [p.idx] }); }
      else if (c.name === '酒') { if (p.jiuUsed === 0) playable.push({ kind: 'play', cardId: c.id, targets: [] }); }
      else if (c.category === '延时锦囊') {
        if (c.name === '闪电') { if (!p.judge.some(x => x.name === '闪电')) playable.push({ kind: 'play', cardId: c.id, targets: [p.idx] }); }
        else {
          const distOk = c.name !== '兵粮寸断' || this.noTrickDistance(p) || this.distance(p, opp) <= 1;
          if (distOk && !opp.judge.some(x => x.name === c.name)) playable.push({ kind: 'play', cardId: c.id, targets: [opp.idx] });
        }
      } else if (c.category === '锦囊牌') {
        switch (c.name) {
          case '无中生有': case '桃园结义': case '五谷丰登':
            playable.push({ kind: 'play', cardId: c.id, targets: [] }); break;
          case '过河拆桥': case '顺手牵羊': {
            const distOk = c.name !== '顺手牵羊' || this.noTrickDistance(p) || this.distance(p, opp) <= 1;
            if (this.hasCards(opp) && distOk) playable.push({ kind: 'play', cardId: c.id, targets: [opp.idx] });
            break;
          }
          case '南蛮入侵': case '万箭齐发': case '决斗': case '火攻':
            playable.push({ kind: 'play', cardId: c.id, targets: [opp.idx] }); break;
          case '借刀杀人':
            if (opp.equips.weapon) playable.push({ kind: 'play', cardId: c.id, targets: [opp.idx] }); break;
          // 无懈可击不主动使用
        }
      }
    }
    // 转化技
    if (shaOk && p.skills.includes('武圣')) {
      for (const c of p.hand) if (isRed(c) && c.name !== '杀') playable.push({ kind: 'play', cardId: c.id, useAs: '杀', targets: [opp.idx] });
    }
    if (shaOk && p.skills.includes('龙胆')) {
      for (const c of p.hand) if (c.name === '闪') playable.push({ kind: 'play', cardId: c.id, useAs: '杀', targets: [opp.idx] });
    }
    if (p.skills.includes('奇袭') && this.hasCards(opp)) {
      for (const c of p.hand) if (isBlack(c)) playable.push({ kind: 'play', cardId: c.id, useAs: '过河拆桥', targets: [opp.idx] });
    }
    if (p.skills.includes('制衡') && !p.zhihengUsed && p.hand.length >= 1) {
      playable.push({ kind: 'skill_zhiheng' });
    }
    // 丈八蛇矛：任意两张手牌当【杀】
    if (shaOk && p.hand.length >= 2 && p.equips.weapon && p.equips.weapon.name === '丈八蛇矛') {
      playable.push({ kind: 'sha_combo' });
    }
    return { playerIdx: p.idx, type: 'play', playable, context: {} };
  }

  discardDecision(p, n) {
    return {
      playerIdx: p.idx, type: 'discard', count: n,
      playable: [{ kind: 'discard' }],
      context: { question: `弃牌阶段：手牌${p.hand.length}张，上限${p.hp}，需弃置${n}张（cards填编号）` },
    };
  }

  async executePlay(p, move) {
    const opp = this.other(p);
    // —— 主动技：制衡 ——
    if (move.kind === 'skill_zhiheng') {
      if (p.zhihengUsed) { this.log('制衡本回合已发动'); return; }
      let cards = (move.cardIds || []).map(id => this.inHand(p, id)).filter(Boolean);
      cards = [...new Set(cards)];
      if (cards.length === 0) { this.log('制衡未指定手牌，跳过'); return; }
      p.zhihengUsed = true;
      p.hand = p.hand.filter(c => !cards.includes(c));
      this.toDiscard(cards);
      const n = this.draw(p, cards.length);
      this.log(`${p.general} 发动【制衡】，弃${cards.length}张摸${n}张`);
      return;
    }
    // 丈八蛇矛：两张手牌当【杀】（无单卡cardId，必须先于手牌守卫处理）
    if (move.kind === 'sha_combo') {
      const combo = this.takeShaComboCards(p, move.cardIds);
      if (!combo) return;
      await this.resolveSha(p, opp, combo.primary, combo.extras);
      return;
    }
    const card = this.inHand(p, move.cardId);
    if (!card) { this.log('无效动作：找不到该手牌'); return; }
    p.hand = p.hand.filter(c => c !== card);
    const useAs = move.useAs || card.name;
    this.cardTaken = false;

    if (useAs === '杀') { await this.resolveSha(p, opp, card, null); return; }
    await this.executeOtherPlay(p, move, card, useAs);
  }

  // 丈八蛇矛：校验并取出两张不同手牌（离手，结算结束才进弃牌堆）
  takeShaComboCards(p, cardIds) {
    const cards = [...new Set((cardIds || []).map(id => this.inHand(p, id)).filter(Boolean))];
    if (cards.length !== 2) { this.log('丈八蛇矛：需要两张不同的手牌'); return null; }
    p.hand = p.hand.filter(c => !cards.includes(c));
    return { primary: cards[0], extras: [cards[1]] };
  }

  discardSha(card, extras) {
    if (extras && extras.length) this.toDiscard([card, ...extras]);
    else this.toDiscard(card);
  }

  // 雌雄双股剑：异性目标选择弃置一张手牌，或让对方摸一张牌
  async cixiongAsk(attacker, target) {
    const playable = target.hand.map(c => ({ kind: 'chooseCard', cardId: c.id }))
      .concat([{ kind: 'skip', skill: '雌雄双股剑' }]);
    const m = await this.askPlayer(target, {
      playerIdx: target.idx, type: 'choose', skill: '雌雄双股剑',
      playable,
      context: { question: '雌雄双股剑：弃置一张手牌，或skip让对方摸一张牌？' },
    });
    if (m && m.kind === 'chooseCard') {
      const c = this.inHand(target, m.cardId);
      if (c) {
        target.hand = target.hand.filter(x => x !== c);
        this.toDiscard(c);
        this.log(`${target.general} 弃置${cardName(c)}（雌雄双股剑）`);
        return;
      }
    }
    const n = this.draw(attacker, 1);
    this.log(`雌雄双股剑：${attacker.general} 摸${n}张牌`);
  }

  // 杀结算（card=主牌；丈八蛇矛两手牌时extras=[第二张]）
  async resolveSha(p, opp, card, extras) {
    p.shaUsed++;
    const jiuBonus = p.drunken ? 1 : 0;
    p.drunken = false;
    const pierce = !!(p.equips.weapon && p.equips.weapon.name === '青釭剑');
    const zhuque = !!(p.equips.weapon && p.equips.weapon.name === '朱雀羽扇');
    const isThunder = !extras && card.subtype === '雷杀';
    const isFire = (!extras && card.subtype === '火杀') || (zhuque && !isThunder);
    if (extras) this.log(`${p.general} 使用【杀】（丈八蛇矛：${cardName(card)}、${cardName(extras[0])}转化）→ ${opp.general}`);
    else this.log(`${p.general} 使用【杀】${card.name !== '杀' ? `（${cardName(card)}转化）` : ''} → ${opp.general}`);
    if (zhuque && !extras && (!card.subtype || card.subtype === '普通杀')) this.log('朱雀羽扇：普通【杀】视为火【杀】');
    // 雌雄双股剑：对异性目标生效（官方时机：指定目标后）
    if (!this.over && p.equips.weapon && p.equips.weapon.name === '雌雄双股剑' && p.gender !== opp.gender) {
      await this.cixiongAsk(p, opp);
    }
    if (opp.equips.armor && opp.equips.armor.name === '仁王盾' && !pierce && isBlack(card)) {
      this.log('仁王盾：黑色【杀】无效');
      this.discardSha(card, extras); return;
    }
    if (opp.equips.armor && opp.equips.armor.name === '藤甲' && !pierce && !isFire && !isThunder) {
      this.log('藤甲：普通【杀】无效');
      this.discardSha(card, extras); return;
    }
      const need = p.skills.includes('无双') ? 2 : 1;
      let dodged = true; // 目标是否用闪完全抵消
      for (let i = 0; i < need; i++) {
        const ok = await this.askDodge(p, opp, i, need, '杀');
        if (!ok) { dodged = false; break; }
      }
      if (dodged) {
        // 青龙偃月刀：被闪抵消后可追加
        if (p.equips.weapon && p.equips.weapon.name === '青龙偃月刀') {
          let extend = true;
          let guard = 0;
          while (extend && !this.over && ++guard < 8) {
            const shaInHand = p.hand.filter(c => c.name === '杀');
            if (shaInHand.length === 0) break;
            const decision = {
              playerIdx: p.idx, type: 'skill_ask', skill: '青龙偃月刀',
              playable: shaInHand.map(c => ({ kind: 'activate', skill: '青龙偃月刀', cardId: c.id })).concat([{ kind: 'skip', skill: '青龙偃月刀' }]),
              context: { question: '对手已用【闪】抵消，是否发动【青龙偃月刀】再打出一张【杀】继续追杀？' },
            };
            const m = await this.askPlayer(p, decision);
            if (!(m && m.kind === 'activate' && this.inHand(p, m.cardId))) break;
            const sc = this.inHand(p, m.cardId);
            p.hand = p.hand.filter(c => c !== sc);
            this.toDiscard(sc);
            this.log(`${p.general} 发动【青龙偃月刀】追加【杀】`);
            const ok2 = await this.askDodge(p, opp, 0, 1, '杀');
            if (!ok2) { dodged = false; extend = false; }
          }
        }
        // 贯石斧：被闪抵消后弃两张牌强制伤害
        if (dodged && !this.over && p.equips.weapon && p.equips.weapon.name === '贯石斧') {
          const ownCount = p.hand.length + Object.values(p.equips).filter(Boolean).length;
          if (ownCount >= 2) {
            const decision = {
              playerIdx: p.idx, type: 'skill_ask', skill: '贯石斧',
              playable: [{ kind: 'activate', skill: '贯石斧' }, { kind: 'skip', skill: '贯石斧' }],
              context: { question: '是否发动【贯石斧】（弃置两张牌，仍造成伤害）？' },
            };
            const m = await this.askPlayer(p, decision);
            if (m && m.kind === 'activate') {
              // 官方规则：自己选择弃置两张牌（手牌或装备区）
              const pool = [...p.hand, ...Object.values(p.equips).filter(Boolean)];
              let cards;
              if (pool.length === 2) {
                cards = pool.slice();
              } else {
                const sel = await this.askPlayer(p, {
                  playerIdx: p.idx, type: 'discard', count: 2,
                  playable: [{ kind: 'discard', area: 'any' }],
                  context: { question: '【贯石斧】已发动：请选择弃置两张牌（手牌或装备区，cards填编号）' },
                });
                cards = (sel && sel.kind === 'discard' && sel.cardIds)
                  ? [...new Set(sel.cardIds.map(id => pool.find(c => c.id === id)).filter(Boolean))]
                  : [];
                if (cards.length !== 2) {
                  this.log('弃牌数量不合法，改为自动选择');
                  cards = this.ownCardsForAxe(p);
                }
              }
              this.removeOwnCards(p, cards);
              this.toDiscard(cards);
              this.log(`${p.general} 发动【贯石斧】，弃置${cards.map(cardName).join('、')}，强制造成伤害`);
              dodged = false;
            }
          }
        }
      }
      if (!dodged && !this.over) {
        let dmg = 1 + jiuBonus;
        if (isFire && !pierce && opp.equips.armor && opp.equips.armor.name === '藤甲') { dmg += 1; this.log('火杀+藤甲：伤害+1'); }
        if (p.equips.weapon && p.equips.weapon.name === '古锭刀' && opp.hand.length === 0) { dmg += 1; this.log('古锭刀：目标无手牌，伤害+1'); }
        // 寒冰剑：防伤害改为弃两张牌
        if (p.equips.weapon && p.equips.weapon.name === '寒冰剑' && this.hasCards(opp)) {
          const decision = {
            playerIdx: p.idx, type: 'skill_ask', skill: '寒冰剑',
            playable: [{ kind: 'activate', skill: '寒冰剑' }, { kind: 'skip', skill: '寒冰剑' }],
            context: { question: '是否发动【寒冰剑】（防止伤害，改为弃置对手两张牌）？' },
          };
          const m = await this.askPlayer(p, decision);
          if (m && m.kind === 'activate') {
            const cards = this.takeFromOpp(opp, 2);
            this.toDiscard(cards);
            this.log(`${p.general} 发动【寒冰剑】，弃置${opp.general}的${cards.map(cardName).join('、')}`);
            this.discardSha(card, extras);
            this.emitState(); return;
          }
        }
        await this.dealDamage(opp, dmg, { source: p, card, pierceArmor: pierce, nature: isFire ? '火' : isThunder ? '雷' : '普通' });
        // 麒麟弓：命中后可弃目标一匹马
        if (!this.over && p.equips.weapon && p.equips.weapon.name === '麒麟弓') {
          const horses = [opp.equips.horsePlus, opp.equips.horseMinus].filter(Boolean);
          if (horses.length > 0) {
            const decision = {
              playerIdx: p.idx, type: 'skill_ask', skill: '麒麟弓',
              playable: [{ kind: 'activate', skill: '麒麟弓' }, { kind: 'skip', skill: '麒麟弓' }],
              context: { question: '是否发动【麒麟弓】弃置目标的一匹坐骑？' },
            };
            const m = await this.askPlayer(p, decision);
            if (m && m.kind === 'activate') {
              const horse = horses[0];
              if (opp.equips.horsePlus === horse) opp.equips.horsePlus = null; else opp.equips.horseMinus = null;
              this.toDiscard(horse);
              this.log(`${p.general} 发动【麒麟弓】弃置${horseName(horse)}`);
            }
          }
        }
      }
      if (this.cardTaken) {
        // 奸雄拿走主牌，丈八的第二张仍要进弃牌堆
        if (extras && extras.length) this.toDiscard(extras);
        this.cardTaken = false;
      } else this.discardSha(card, extras);
      return;
    }

  // 杀之外的出牌结算（桃/酒/装备/锦囊）
  async executeOtherPlay(p, move, card, useAs) {
    // —— 桃 / 酒 ——
    if (useAs === '桃') {
      const before = p.hp;
      p.hp = Math.min(p.maxHp, p.hp + 1);
      this.log(`${p.general} 使用【桃】，体力 ${before}→${p.hp}/${p.maxHp}`);
      this.toDiscard(card); return;
    }
    if (useAs === '酒') {
      p.jiuUsed = 1; p.drunken = true;
      this.log(`${p.general} 使用【酒】，本回合下一张【杀】伤害+1`);
      this.toDiscard(card); return;
    }

    // —— 装备 ——
    const slot = equipSlot(card);
    if (slot && useAs === card.name) {
      const old = p.equips[slot];
      if (old) this.toDiscard(old);
      p.equips[slot] = card;
      this.log(`${p.general} 装备${cardName(card)}${old ? `（替换${old.name}）` : ''}`);
      return;
    }

    // —— 锦囊（含奇袭/武圣等转化） ——
    if (card.category === '锦囊牌' || card.category === '延时锦囊' || useAs !== card.name) {
      await this.useTrick(p, card, useAs);
      return;
    }
    this.toDiscard(card);
  }

  ownCardsForAxe(p) {
    // 优先弃非桃非闪的手牌，其次随机手牌，最后装备
    let pool = p.hand.filter(c => c.name !== '桃' && c.name !== '闪');
    if (pool.length < 2) pool = pool.concat(p.hand.filter(c => !pool.includes(c)));
    const cards = [];
    for (const c of shuffle(pool, this.rng)) {
      if (cards.length < 2) cards.push(c);
    }
    while (cards.length < 2) {
      const equips = Object.values(p.equips).filter(Boolean).filter(c => !cards.includes(c));
      if (equips.length === 0) break;
      cards.push(equips[0]);
    }
    return cards.slice(0, 2);
  }
  removeOwnCards(p, cards) {
    p.hand = p.hand.filter(c => !cards.includes(c));
    for (const [k, v] of Object.entries(p.equips)) if (cards.includes(v)) p.equips[k] = null;
  }
  takeFromOpp(opp, n) {
    const taken = [];
    for (let i = 0; i < n; i++) {
      const equips = Object.values(opp.equips).filter(Boolean);
      if (equips.length > 0) {
        const e = equips[0];
        for (const [k, v] of Object.entries(opp.equips)) if (v === e) opp.equips[k] = null;
        taken.push(e);
      } else if (opp.hand.length > 0) {
        const c = opp.hand[Math.floor(this.rng() * opp.hand.length)];
        opp.hand = opp.hand.filter(x => x !== c);
        taken.push(c);
      } else break;
    }
    return taken;
  }

  async useTrick(p, card, useAs) {
    const opp = this.other(p);
    const name = useAs;
    this.log(`${p.general} 使用【${name}】${useAs !== card.name ? `（${cardName(card)}转化）` : ''}`);
    // 集智
    if (p.skills.includes('集智')) {
      const decision = {
        playerIdx: p.idx, type: 'skill_ask', skill: '集智',
        playable: [{ kind: 'activate', skill: '集智' }, { kind: 'skip', skill: '集智' }],
        context: { question: '是否发动【集智】摸一张牌？' },
      };
      const m = await this.askPlayer(p, decision);
      if (m && m.kind === 'activate') { const n = this.draw(p, 1); this.log(`${p.general} 发动【集智】摸${n}张牌`); }
    }
    // 延时锦囊直接进判定区
    if (card.category === '延时锦囊' && useAs === card.name) {
      if (name === '闪电') p.judge.push(card); else opp.judge.push(card);
      this.log(`【${name}】置于${name === '闪电' ? p.general : opp.general}的判定区`);
      return;
    }
    // 无懈可击（MVP：仅询问被影响者一次）
    if (await this.askWuxie(opp, name)) { this.toDiscard(card); return; }

    switch (name) {
      case '无中生有': {
        const n = this.draw(p, 2); this.log(`${p.general} 摸${n}张牌`); break;
      }
      case '桃园结义': {
        for (const q of this.players) {
          if (q.hp < q.maxHp) { const b = q.hp; q.hp++; this.log(`${q.general} 回复1点体力（${b}→${q.hp}/${q.maxHp}）`); }
        }
        break;
      }
      case '五谷丰登': {
        const revealed = [];
        for (let i = 0; i < 2; i++) { const c = this.drawOne(); if (c) revealed.push(c); }
        revealed.forEach(c => this.limbo.add(c));
        this.log(`五谷丰登展示：${revealed.map(cardName).join('、') || '无'}`);
        if (revealed.length === 0) break;
        if (revealed.length === 1) { this.limbo.delete(revealed[0]); p.hand.push(revealed[0]); this.log(`${p.general} 获得${cardName(revealed[0])}`); break; }
        const chooser = opp;
        const decision = {
          playerIdx: chooser.idx, type: 'choose',
          playable: revealed.map(c => ({ kind: 'chooseCard', cardId: c.id })),
          optionCards: revealed,
          context: { question: '五谷丰登：请先选一张牌获得' },
        };
        const m = await this.askPlayer(chooser, decision);
        let picked = (m && m.kind === 'chooseCard' && revealed.find(c => c.id === m.cardId)) || revealed[0];
        revealed.splice(revealed.indexOf(picked), 1);
        this.limbo.delete(picked);
        chooser.hand.push(picked);
        this.log(`${chooser.general} 获得${cardName(picked)}`);
        this.limbo.delete(revealed[0]);
        p.hand.push(revealed[0]);
        this.log(`${p.general} 获得${cardName(revealed[0])}`);
        break;
      }
      case '决斗': {
        let asker = opp;    // 决斗由目标先打出杀
        let otherSide = p;
        let guard = 0;
        while (!this.over && ++guard < 30) {
          const k = otherSide.general === '吕布' ? 2 : 1; // 与吕布决斗的角色每次需先打出两张杀
          let out = true;
          for (let i = 0; i < k; i++) {
            const ok = await this.askPlaySha(asker, otherSide, '决斗');
            if (!ok) { out = false; break; }
          }
          if (!out) {
            await this.dealDamage(asker, 1, { source: otherSide, card });
            break;
          }
          [asker, otherSide] = [otherSide, asker];
        }
        break;
      }
      case '南蛮入侵': {
        if (opp.equips.armor && opp.equips.armor.name === '藤甲') { this.log('藤甲：南蛮入侵对目标无效'); break; }
        const ok = await this.askPlaySha(opp, p, '南蛮入侵');
        if (!ok) await this.dealDamage(opp, 1, { source: p, card });
        break;
      }
      case '万箭齐发': {
        if (opp.equips.armor && opp.equips.armor.name === '藤甲') { this.log('藤甲：万箭齐发对目标无效'); break; }
        const ok = await this.askDodge(p, opp, 0, 1, '万箭齐发');
        if (!ok) await this.dealDamage(opp, 1, { source: p, card });
        break;
      }
      case '火攻': {
        if (opp.hand.length === 0) { this.log('对手无手牌，火攻无效果'); break; }
        const decision = {
          playerIdx: opp.idx, type: 'choose',
          playable: opp.hand.map(c => ({ kind: 'chooseCard', cardId: c.id })),
          context: { question: '火攻：请选择一张手牌展示' },
        };
        const m = await this.askPlayer(opp, decision);
        const shown = (m && m.kind === 'chooseCard' && opp.hand.find(c => c.id === m.cardId)) || opp.hand[0];
        this.log(`${opp.general} 展示${cardName(shown)}`);
        const burnable = p.hand.filter(c => c.suit === shown.suit);
        if (burnable.length > 0) {
          const decision2 = {
            playerIdx: p.idx, type: 'skill_ask', skill: '火攻',
            playable: burnable.map(c => ({ kind: 'activate', skill: '火攻', cardId: c.id })).concat([{ kind: 'skip', skill: '火攻' }]),
            context: { question: `是否弃置一张${shown.suit}手牌，对对手造成1点火焰伤害？` },
          };
          const m2 = await this.askPlayer(p, decision2);
          if (m2 && m2.kind === 'activate' && this.inHand(p, m2.cardId)) {
            const bc = this.inHand(p, m2.cardId);
            p.hand = p.hand.filter(c => c !== bc);
            this.toDiscard(bc);
            await this.dealDamage(opp, 1, { source: p, card, nature: '火' });
          }
        } else this.log(`${p.general} 无同花色手牌，无法火攻`);
        break;
      }
      case '过河拆桥': case '顺手牵羊': {
        if (!this.hasCards(opp)) break;
        const area = await this.askArea(p, opp, name);
        let targetCard = null;
        if (area === 'hand') {
          if (opp.hand.length > 0) {
            targetCard = opp.hand[Math.floor(this.rng() * opp.hand.length)];
            opp.hand = opp.hand.filter(c => c !== targetCard);
          }
        } else if (area === 'equip') {
          const equips = Object.values(opp.equips).filter(Boolean);
          targetCard = await this.askPick(p, equips, `${name}：选择对手的装备`);
          if (targetCard) {
            for (const [k, v] of Object.entries(opp.equips)) if (v === targetCard) opp.equips[k] = null;
          }
        } else if (area === 'judge') {
          targetCard = await this.askPick(p, opp.judge, `${name}：选择对手判定区的牌`);
          if (targetCard) opp.judge = opp.judge.filter(c => c !== targetCard);
        }
        if (targetCard) {
          if (name === '过河拆桥') { this.toDiscard(targetCard); this.log(`${p.general} 弃置${opp.general}的${cardName(targetCard)}`); }
          else { p.hand.push(targetCard); this.log(`${p.general} 获得${opp.general}的${cardName(targetCard)}`); }
        }
        break;
      }
      case '借刀杀人': {
        const weapon = opp.equips.weapon;
        if (!weapon || !opp.hand.some(c => c.name === '杀')) break;
        const decision = {
          playerIdx: opp.idx, type: 'daodao',
          playable: [{ kind: 'daodao_sha' }, { kind: 'daodao_give' }],
          context: { question: `借刀杀人：对${p.general}使用【杀】，或将${horseName(weapon)}交给对方？` },
        };
        const m = await this.askPlayer(opp, decision);
        if (m && m.kind === 'daodao_sha') {
          const sha = opp.hand.find(c => c.name === '杀');
          opp.hand = opp.hand.filter(c => c !== sha);
          this.log(`${opp.general} 出【杀】→ ${p.general}（借刀杀人）`);
          const ok = await this.askDodge(opp, p, 0, 1, '杀');
          if (!ok) await this.dealDamage(p, 1, { source: opp, card: sha });
          this.toDiscard(sha);
        } else {
          opp.equips.weapon = null;
          p.hand.push(weapon);
          this.log(`${opp.general} 将${horseName(weapon)}交给${p.general}`);
        }
        break;
      }
    }
    if (!this.cardTaken) this.toDiscard(card);
    this.cardTaken = false;
  }

  // ---------- 响应类询问 ----------
  async askDodge(user, target, attempt, need, reason) {
    // 八卦阵（自动判定；青釭剑无视防具）
    const pierce = user && user.equips.weapon && user.equips.weapon.name === '青釭剑';
    if (!pierce && target.equips.armor && target.equips.armor.name === '八卦阵') {
      const jc = this.drawOne();
      if (jc) {
        this.log(`${target.general} 发动【八卦阵】判定：${cardName(jc)}`);
        this.toDiscard(jc);
        if (isRed(jc)) { this.log('八卦阵判定成功，视为使用【闪】'); return true; }
        this.log('八卦阵判定失败');
      }
    }
    const shans = target.hand.filter(c => c.name === '闪');
    const longdan = target.skills.includes('龙胆') ? target.hand.filter(c => c.name === '杀') : [];
    const playable = shans.map(c => ({ kind: 'respond', cardId: c.id }))
      .concat(longdan.map(c => ({ kind: 'respond', cardId: c.id, useAs: '闪' })))
      .concat([{ kind: 'refuse' }]);
    const decision = {
      playerIdx: target.idx, type: 'respond_sha',
      playable, context: { reason, attempt, need, attacker: user.general },
    };
    const move = await this.askPlayer(target, decision);
    if (move && move.kind === 'respond') {
      const card = this.inHand(target, move.cardId);
      if (card) {
        target.hand = target.hand.filter(c => c !== card);
        this.toDiscard(card);
        this.log(`${target.general} 使用${move.useAs ? `【闪】（${cardName(card)}转化）` : cardName(card)}抵消${reason}`);
        return true;
      }
    }
    this.log(`${target.general} 不响应${reason}`);
    return false;
  }

  async askPlaySha(responder, user, reason) {
    const shas = responder.hand.filter(c => c.name === '杀');
    const wusheng = responder.skills.includes('武圣') ? responder.hand.filter(c => isRed(c) && c.name !== '杀') : [];
    const longdan = responder.skills.includes('龙胆') ? responder.hand.filter(c => c.name === '闪') : [];
    const playable = shas.map(c => ({ kind: 'respond', cardId: c.id }))
      .concat(wusheng.map(c => ({ kind: 'respond', cardId: c.id, useAs: '杀' })))
      .concat(longdan.map(c => ({ kind: 'respond', cardId: c.id, useAs: '杀' })))
      .concat([{ kind: 'refuse' }]);
    const decision = { playerIdx: responder.idx, type: 'respond_nanman', playable, context: { reason, attacker: user.general } };
    const move = await this.askPlayer(responder, decision);
    if (move && move.kind === 'respond') {
      const card = this.inHand(responder, move.cardId);
      if (card) {
        responder.hand = responder.hand.filter(c => c !== card);
        this.toDiscard(card);
        this.log(`${responder.general} 打出【杀】${move.useAs && card.name !== '杀' ? `（${cardName(card)}转化）` : ''}响应${reason}`);
        return true;
      }
    }
    return false;
  }

  async askWuxie(target, trickName) {
    const wuxies = target.hand.filter(c => c.name === '无懈可击');
    if (wuxies.length === 0) return false;
    const decision = {
      playerIdx: target.idx, type: 'wuxie',
      playable: wuxies.map(c => ({ kind: 'wuxie', cardId: c.id })).concat([{ kind: 'refuse' }]),
      context: { trick: trickName },
    };
    const move = await this.askPlayer(target, decision);
    if (move && move.kind === 'wuxie') {
      const card = this.inHand(target, move.cardId);
      if (card) {
        target.hand = target.hand.filter(c => c !== card);
        this.toDiscard(card);
        this.log(`${target.general} 使用【无懈可击】抵消【${trickName}】`);
        return true;
      }
    }
    return false;
  }

  async askArea(p, opp, name) {
    const options = [];
    if (opp.hand.length > 0) options.push('hand');
    if (Object.values(opp.equips).some(Boolean)) options.push('equip');
    // 官方规则：只有过河拆桥能处置判定区的牌，顺手牵羊不能拿判定区
    if (name === '过河拆桥' && opp.judge.length > 0) options.push('judge');
    if (options.length === 1) return options[0];
    const label = { hand: '手牌', equip: '装备', judge: '判定' };
    const decision = {
      playerIdx: p.idx, type: 'choose',
      playable: options.map(o => ({ kind: 'chooseArea', area: o })),
      context: { question: `${name}：选择对手哪个区域的牌？`, options: options.map(o => label[o]) },
    };
    const m = await this.askPlayer(p, decision);
    if (m && m.kind === 'chooseArea' && options.includes(m.area)) return m.area;
    return options[0];
  }

  async askPick(p, cards, question) {
    if (cards.length === 0) return null;
    if (cards.length === 1) return cards[0];
    const decision = {
      playerIdx: p.idx, type: 'choose',
      playable: cards.map(c => ({ kind: 'chooseCard', cardId: c.id })),
      optionCards: cards,
      context: { question, options: cards.map(cardName) },
    };
    const m = await this.askPlayer(p, decision);
    if (m && m.kind === 'chooseCard') return cards.find(c => c.id === m.cardId) || cards[0];
    return cards[0];
  }

  // ---------- 决策统一入口（AI动作映射 + 校验 + 重问 + 兜底） ----------
  async askPlayer(p, decision) {
    const maxTry = 3;
    let lastAction = null;
    for (let i = 0; i < maxTry; i++) {
      if (this.aborted) return { kind: 'end' }; // 对局被放弃，立刻终止，不再发起询问
      const action = await this.ask({
        playerIdx: p.idx, type: decision.type, playable: decision.playable,
        context: decision.context || {}, skill: decision.skill || null,
        count: decision.count || null,
        optionCards: decision.optionCards || null,
        stateMd: this.renderState(p, decision, i > 0 ? { retry: i, lastAction } : null),
      });
      const move = this.matchMove(decision, action);
      if (move) return move;
      lastAction = action;
      if (i < maxTry - 1) this.log(`${p.general} 的动作不合法（第${i + 1}次），重新询问`);
    }
    if (this.aborted) return { kind: 'end' };
    const fallback = decision.playable[Math.floor(this.rng() * decision.playable.length)];
    this.log(`【兜底】${p.general} 随机选择 ${fallback.kind}`);
    return fallback;
  }

  // 把AI的JSON动作（或UI直接给出的move）映射为引擎move
  matchMove(decision, action) {
    if (!action || typeof action !== 'object') return null;
    const playable = decision.playable;
    const byLabel = (label) => {
      if (label == null) return null;
      if (decision.labelMap && decision.labelMap[label] != null) return decision.labelMap[label];
      const n = parseInt(label, 10);
      return Number.isNaN(n) ? null : n;
    };
    // UI直接给出move对象
    if (action.kind) {
      const m = playable.find(x => x.kind === action.kind
        && (action.cardId === undefined || x.cardId === action.cardId)
        && ((x.useAs || null) === (action.useAs || null))
        && (action.area === undefined || x.area === action.area)
        && (action.skill === undefined || (x.skill || null) === (action.skill || null)));
      if (!m) return null;
      if (m.kind === 'discard') return { kind: 'discard', cardIds: (action.cardIds || []).slice() };
      if (m.kind === 'skill_zhiheng') return { kind: 'skill_zhiheng', cardIds: (action.cardIds || []).slice() };
      if (m.kind === 'sha_combo') return { kind: 'sha_combo', cardIds: (action.cardIds || []).slice() };
      return m;
    }
    // AI的JSON动作
    switch (action.action) {
      case 'end': return playable.find(m => m.kind === 'end') || null;
      case 'refuse': return playable.find(m => m.kind === 'refuse') || null;
      case 'skip': return playable.find(m => m.kind === 'skip' && (!action.skill || !decision.skill || m.skill === action.skill)) || null;
      case 'play': case 'respond': {
        const id = byLabel(action.card);
        const kind = action.action === 'play' ? 'play' : 'respond';
        return playable.find(m => m.kind === kind && m.cardId === id
          && (!m.useAs || !action.useAs || m.useAs === action.useAs)) || null;
      }
      case 'tao': {
        const id = byLabel(action.card);
        return playable.find(m => m.kind === 'tao' && m.cardId === id) || null;
      }
      case 'wuxie': {
        const id = byLabel(action.card);
        return playable.find(m => m.kind === 'wuxie' && m.cardId === id) || null;
      }
      case 'discard': {
        if (!playable.some(m => m.kind === 'discard')) return null;
        const ids = (action.cards || []).map(byLabel).filter(x => x != null);
        return { kind: 'discard', cardIds: ids };
      }
      case 'choose': {
        if (action.card != null) {
          const id = byLabel(action.card);
          return playable.find(m => m.kind === 'chooseCard' && m.cardId === id) || null;
        }
        if (action.choice) {
          return playable.find(m => m.kind === 'chooseArea' && m.area === action.choice) || null;
        }
        return null;
      }
      case 'skill': {
        if (action.skill === '制衡') {
          const m = playable.find(mv => mv.kind === 'skill_zhiheng');
          if (!m) return null;
          return { kind: 'skill_zhiheng', cardIds: (action.cards || []).map(byLabel).filter(x => x != null) };
        }
        return null;
      }
      case 'activate': {
        if (action.card != null) {
          const id = byLabel(action.card);
          return playable.find(m => m.kind === 'activate' && m.cardId === id) || null;
        }
        return playable.find(m => m.kind === 'activate' && (!action.skill || !m.skill || m.skill === action.skill)) || null;
      }
      case 'daodao_sha': return playable.find(m => m.kind === 'daodao_sha') || null;
      case 'daodao_give': return playable.find(m => m.kind === 'daodao_give') || null;
      case 'sha_combo': {
        if (!playable.some(m => m.kind === 'sha_combo')) return null;
        const ids = (action.cards || []).map(byLabel).filter(x => x != null);
        return { kind: 'sha_combo', cardIds: ids };
      }
      default: return null;
    }
  }

  // ---------- 局面渲染（半结构化Markdown，发给AI/记录） ----------
  renderState(p, decision, retryInfo) {
    const opp = this.other(p);
    const L = [];
    L.push(`# 决策请求 #${++this.decisionNo}`);
    L.push(`**决策类型**: ${decision.type}`);
    L.push('');
    L.push('## 你的状态');
    L.push(`- 武将: **${p.general}**（体力 ${p.hp}/${p.maxHp}）`);
    L.push('- 技能:');
    for (const s of p.skills) L.push(`  - **${s}**：${SKILL_TEXTS[s]}`);
    const eq = (c) => c ? `${c.name}（${c.suit}${c.rank}）` : '无';
    L.push(`- 装备: 武器-${eq(p.equips.weapon)} | 防具-${eq(p.equips.armor)} | +1马-${eq(p.equips.horsePlus)} | -1马-${eq(p.equips.horseMinus)}`);
    L.push(`- 判定区: ${p.judge.map(cardName).join('、') || '无'}`);
    L.push(`- 手牌 ${p.hand.length}张:`);
    decision.labelMap = {};
    const table = ['| 编号 | 牌名 | 花色点数 | 类型 |', '|---|---|---|---|'];
    p.hand.slice().sort((a, b) => a.id - b.id).forEach((c, i) => {
      const label = `#${i + 1}`;
      decision.labelMap[label] = c.id;
      table.push(`| ${label} | ${c.name}${c.subtype && c.subtype !== '普通杀' ? '(' + c.subtype + ')' : ''} | ${c.suit}${c.rank} | ${c.category}${c.equip ? '(' + c.equip + ')' : ''} |`);
    });
    L.push(...table);
    // 额外候选牌（五谷展示/装备选择等）
    if (decision.optionCards && decision.optionCards.length > 0) {
      L.push('');
      L.push('### 候选牌');
      let n = p.hand.length;
      for (const c of decision.optionCards) {
        const label = `#${n + 1}`;
        decision.labelMap[label] = c.id;
        L.push(`- ${label} ${cardName(c)}`);
        n++;
      }
    }
    L.push('');
    L.push('## 对手状态');
    L.push(`- 武将: **${opp.general}**（体力 ${Math.max(opp.hp, 0)}/${opp.maxHp}）`);
    L.push('- 技能:');
    for (const s of opp.skills) L.push(`  - **${s}**：${SKILL_TEXTS[s]}`);
    L.push(`- 装备: 武器-${eq(opp.equips.weapon)} | 防具-${eq(opp.equips.armor)} | +1马-${eq(opp.equips.horsePlus)} | -1马-${eq(opp.equips.horseMinus)}`);
    L.push(`- 判定区: ${opp.judge.map(cardName).join('、') || '无'}`);
    L.push(`- 手牌: ${opp.hand.length}张（不可见）`);
    L.push('');
    L.push('## 公共信息');
    L.push(`- 回合: 第${this.turnNo}回合（${this.turnPlayer === p ? '你的' : '对手的'}回合，${this.phase || ''}阶段）`);
    L.push(`- 距离: 你→对手 ${this.distance(p, opp)}；你的攻击范围 ${this.attackRange(p)}`);
    if (decision.type === 'play') {
      const parts = [`杀 ${p.shaUsed}${this.shaUnlimited(p) ? '（无限制）' : '/1'}`, `酒 ${p.jiuUsed}/1`];
      if (p.skills.includes('制衡')) parts.push(`制衡 ${p.zhihengUsed ? '已用' : '未用'}`);
      L.push(`- 你本回合已用: ${parts.join(' | ')}`);
      if (p.drunken) L.push('- 你已使用【酒】：下一张【杀】伤害+1');
    }
    const recent = this.discardPile.slice(-DISCARD_MEMORY);
    L.push(`- 弃牌堆（最近${DISCARD_MEMORY}张，更早的记不清了）: ${recent.map(cardName).join('、') || '空'}`);
    L.push(`- 牌堆剩余: 约${this.drawPile.length}张`);
    L.push('');
    if (retryInfo) {
      L.push('## 上次动作不合法（重试）');
      L.push(`你上次输出: \`${JSON.stringify(retryInfo.lastAction)}\`，不在可用动作列表中。请严格按可用动作重新决策。`);
      L.push('');
    }
    L.push('## 本次决策要求');
    if (decision.context && decision.context.question) L.push(`- ${decision.context.question}`);
    if (decision.type === 'respond_sha' && decision.context.reason) {
      L.push(`- ${decision.context.attacker}对你使用【${decision.context.reason}】${decision.context.need > 1 ? `（需第${decision.context.attempt + 1}/${decision.context.need}张闪）` : ''}，需要【闪】响应，否则受到伤害`);
    }
    L.push('');
    L.push('### 可用动作（必须严格选择其一，输出为最后一行JSON）');
    for (const m of decision.playable) L.push(`- ${this.moveLabel(m, decision)}`);
    return L.join('\n');
  }

  cardLabel(cardId, decision) {
    if (decision && decision.labelMap) {
      for (const [label, id] of Object.entries(decision.labelMap)) {
        if (id === cardId) return label;
      }
    }
    return null;
  }
  findCard(cardId) {
    for (const p of this.players) {
      const i = p.hand.findIndex(c => c.id === cardId);
      if (i >= 0) {
        const sorted = p.hand.slice().sort((a, b) => a.id - b.id);
        const j = sorted.findIndex(c => c.id === cardId);
        return { card: p.hand[i], label: `#${j + 1}`, owner: p };
      }
      for (const v of Object.values(p.equips)) if (v && v.id === cardId) return { card: v, label: null, owner: p };
      const jc = p.judge.find(c => c.id === cardId);
      if (jc) return { card: jc, label: null, owner: p };
    }
    for (const c of this.limbo) if (c.id === cardId) return { card: c, label: null, owner: null }; // 五谷展示等暂离区
    return null;
  }
  desc(cardId, decision) {
    const label = this.cardLabel(cardId, decision);
    const found = this.findCard(cardId);
    const name = found ? cardName(found.card) : `【牌${cardId}】`;
    return label ? `${label}${name}` : name;
  }

  moveLabel(m, decision) {
    switch (m.kind) {
      case 'end': return '`end` 结束出牌阶段';
      case 'play': {
        const t = m.targets && m.targets.length
          ? `，目标: ${m.targets.map(i => i === decision.playerIdx ? '自己' : this.players[i].general).join('、')}` : '';
        return `\`play\` 使用 ${this.desc(m.cardId, decision)}${m.useAs ? ` 当【${m.useAs}】` : ''}${t}`;
      }
      case 'respond': return `\`respond\` 用 ${this.desc(m.cardId, decision)}${m.useAs ? ` 当【${m.useAs}】` : ''}响应`;
      case 'refuse': return '`refuse` 不响应/放弃';
      case 'tao': return `\`tao\` 用 ${this.desc(m.cardId, decision)} 救助濒死者`;
      case 'wuxie': return `\`wuxie\` 用 ${this.desc(m.cardId, decision)} 抵消锦囊`;
      case 'discard': return `\`discard\` 弃置${decision.count || ''}张手牌（JSON cards 填编号数组）`;
      case 'chooseCard': return `\`choose\` 选择 ${this.desc(m.cardId, decision)}`;
      case 'chooseArea': return `\`choose\` 选择区域 ${m.area}（手牌/装备/判定）`;
      case 'skill_zhiheng': return '`skill` 发动【制衡】（JSON: skill=制衡, cards=要弃的编号数组）';
      case 'sha_combo': return '`sha_combo` 发动【丈八蛇矛】：任意两张手牌当【杀】（JSON: cards=两个编号数组）';
      case 'activate': return `\`activate\` 发动【${m.skill}】${m.cardId != null ? `（card: ${this.desc(m.cardId, decision)}）` : ''}`;
      case 'skip': return `\`skip\` 不发动【${m.skill}】`;
      case 'daodao_sha': return '`daodao_sha` 对借刀者使用【杀】';
      case 'daodao_give': return '`daodao_give` 将武器交给借刀者';
      default: return '`?` ' + m.kind;
    }
  }
}

function horseName(c) { return `【${c.name}】`; }

module.exports = { Game, GENERALS, SKILL_TEXTS, DISCARD_MEMORY };
