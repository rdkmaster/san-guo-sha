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
  '诸葛亮': { hp: 3, kingdom: '蜀', gender: 'm', skills: ['观星', '空城'] },
  '周瑜':   { hp: 3, kingdom: '吴', gender: 'm', skills: ['英姿', '反间'] },
  '许褚':   { hp: 4, kingdom: '魏', gender: 'm', skills: ['裸衣'] },
  '司马懿': { hp: 3, kingdom: '魏', gender: 'm', skills: ['反馈', '鬼才'] },
  // —— 标准版剩余 13 将 ——
  '刘备':   { hp: 4, kingdom: '蜀', gender: 'm', skills: ['仁德', '激将'] },
  '马超':   { hp: 4, kingdom: '蜀', gender: 'm', skills: ['马术', '铁骑'] },
  '郭嘉':   { hp: 3, kingdom: '魏', gender: 'm', skills: ['天妒', '遗计'] },
  '夏侯惇': { hp: 4, kingdom: '魏', gender: 'm', skills: ['刚烈'] },
  '张辽':   { hp: 4, kingdom: '魏', gender: 'm', skills: ['突袭'] },
  '甄姬':   { hp: 3, kingdom: '魏', gender: 'f', skills: ['洛神', '倾国'] },
  '吕蒙':   { hp: 4, kingdom: '吴', gender: 'm', skills: ['克己'] },
  '黄盖':   { hp: 4, kingdom: '吴', gender: 'm', skills: ['苦肉'] },
  '大乔':   { hp: 3, kingdom: '吴', gender: 'f', skills: ['国色', '流离'] },
  '陆逊':   { hp: 3, kingdom: '吴', gender: 'm', skills: ['谦逊', '连营'] },
  '孙尚香': { hp: 3, kingdom: '吴', gender: 'f', skills: ['结姻', '枭姬'] },
  '貂蝉':   { hp: 3, kingdom: '群', gender: 'f', skills: ['离间', '闭月'] },
  '华佗':   { hp: 3, kingdom: '群', gender: 'm', skills: ['急救', '青囊'] },
};

const SKILL_TEXTS = {
  '武圣': '你可以将一张红色牌当【杀】使用或打出。注意：牌包括手牌和装备区里的牌（如红色坐骑、红色武器都可转化），使用后该牌离开装备区。',
  '咆哮': '锁定技。你使用【杀】无次数限制。',
  '龙胆': '你可以将【杀】当【闪】、【闪】当【杀】使用或打出。',
  '无双': '锁定技。你使用【杀】指定目标后，目标需连续使用两张【闪】抵消；与你决斗的角色每次需先打出两张【杀】。',
  '奸雄': '当你受到伤害后，你可以获得造成此伤害的牌。',
  '制衡': '出牌阶段限一次。你可以弃置任意张手牌，然后摸等量的牌。',
  '集智': '当你使用普通锦囊牌时，你可以摸一张牌。注意：延时锦囊（乐不思蜀/闪电/兵粮寸断）不是普通锦囊，使用它们不触发集智。',
  '奇才': '锁定技。你使用锦囊牌无距离限制。',
  '奇袭': '你可以将一张黑色牌当【过河拆桥】使用。',
  '观星': '准备阶段开始时，你可以观看牌堆顶的两张牌（存活角色数），将其中任意张置于牌堆顶，其余置于牌堆底。',
  '空城': '锁定技。若你没有手牌，你不能成为【杀】或【决斗】的目标。',
  '英姿': '摸牌阶段，你可以多摸一张牌。',
  '反间': '出牌阶段限一次。你可以令一名其他角色选择一种花色，然后该角色获得你的一张手牌并展示之，若此牌花色与其所选不同，你对其造成1点伤害。',
  '裸衣': '摸牌阶段，你可以少摸一张牌。若如此做，你本回合使用的【杀】和【决斗】造成的伤害+1。',
  '反馈': '当你受到伤害后，你可以获得伤害来源的一张牌（手牌随机一张，或自选装备区一张）。',
  '鬼才': '一名角色的判定牌生效前，你可以打出一张手牌代替之。',
  // —— 标准版剩余 13 将技能（规则基准：手游版三国杀） ——
  '仁德': '出牌阶段，你可以将任意张手牌交给对手（1v1唯一其他角色）。你于此阶段内累计给出的牌首次达到两张时，回复1点体力。',
  '激将': '主公技。（1v1没有其他蜀势力角色，无法发动。）',
  '马术': '锁定技。你计算与其他角色的距离-1。',
  '铁骑': '当你使用【杀】指定目标后，你可以进行判定，若结果为红色，此【杀】不可被【闪】响应（【八卦阵】也不可发动）。',
  '天妒': '当你的判定牌生效后，你可以获得之（非锁定技，询问后发动）。',
  '遗计': '当你受到1点伤害后，你可以观看牌堆顶的两张牌，将其中至少一张交给对手，其余的牌置入你的手牌。',
  '刚烈': '当你受到伤害后，你可以进行判定，若结果不为红桃，伤害来源须选择一项：弃置两张手牌，或受到1点伤害（来源由你造成）。',
  '突袭': '摸牌阶段，你可以放弃摸牌，改为获得对手的一张手牌（1v1仅一名对手，只能拿一张）。',
  '洛神': '准备阶段开始时，你可以进行判定，若结果为黑色，你获得此判定牌，然后可以再次发动【洛神】。',
  '倾国': '你可以将一张黑色手牌当【闪】使用（响应【杀】/【万箭齐发】）。',
  '克己': '锁定技。若你在出牌阶段内未使用或打出过【杀】，你的弃牌阶段跳过。',
  '苦肉': '出牌阶段，你可以失去1点体力，然后摸两张牌（无次数限制；失去体力不是伤害，不触发受伤后技能）。',
  '国色': '出牌阶段，你可以将一张方块牌（含装备区）当【乐不思蜀】使用。',
  '流离': '当你成为【杀】的目标时，你可以弃置一张牌并将此【杀】转移给你攻击范围内的一名其他角色（不能转移给使用者）。（1v1没有第三名角色，无法发动。）',
  '谦逊': '锁定技。你不能成为【顺手牵羊】或【乐不思蜀】的目标（包括国色转化的【乐不思蜀】）。',
  '连营': '当你失去最后的手牌时，你可以摸一张牌（非锁定技，询问后发动）。',
  '结姻': '出牌阶段限一次。你可以弃置两张手牌，选择一名已受伤的男性角色，你与其各回复1点体力。',
  '枭姬': '当你失去装备区里的一张牌时，你可以摸两张牌。',
  '离间': '出牌阶段限一次。你可以弃置一张牌，令两名男性角色视为对彼此使用【决斗】。（1v1只有一名其他角色，无法发动。）',
  '闭月': '结束阶段开始时，你可以摸一张牌。',
  '跋扈': '斗地主地主技（锁定）。摸牌阶段你多摸一张牌；你每回合使用【杀】的次数上限+1。',
  '飞扬': '斗地主地主技。判定阶段开始时，若你的判定区有牌，你可以弃置两张手牌，弃掉判定区里的一张牌（多张时自选，每回合限一次）。',
  '急救': '你的回合外，你可以将一张红色牌（含装备区）当【桃】使用（含濒死救援）。',
  '青囊': '出牌阶段限一次。你可以弃置一张手牌，选择一名已受伤的角色，其回复1点体力（可自选自己或对手）。',
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
    // 存档/恢复：ask 包装为"重放已记录决策 → 新决策转交真实回调并记录"
    // 决策全记录（含无效重试）保证重放与原局完全一致
    this.decisionLog = [];
    this._replay = Array.isArray(opts.replay) ? opts.replay.slice() : [];
    this.silent = this._replay.length > 0; // 重放期间抑制事件广播（历史已展示过）
    this._liveAsk = null;
    if (opts.ask) {
      this._liveAsk = opts.ask;
      this.ask = async (d) => {
        if (this._replay.length > 0) {
          const m = this._replay.shift();
          this.decisionLog.push(m);
          return m;
        }
        this.silent = false; // 重放耗尽：从存档点继续实时对局
        this.emitState(); // 先补发完整局面（含历史日志），前端才有着落渲染随后的询问
        const move = await this._liveAsk(d);
        try { this.decisionLog.push(JSON.parse(JSON.stringify(move))); } catch (e) { this.decisionLog.push(move); }
        return move;
      };
    }
    this.onEvent = opts.onEvent || (() => {});
    this.rng = opts.seed != null ? mulberry32(opts.seed) : Math.random;
    this.over = false;
    this.aborted = false; // 对局被放弃（重开）时置位，引擎快速终止
    this.winner = null;
    this.winnerRole = null; // 斗地主：胜方阵营（'地主'/'农民'）
    this.mode = '1v1'; // '1v1' | 'ddd'（斗地主，setup按opts重置）
    this.turnNo = 0;
    this.decisionNo = 0;
    this.logLines = [];
    this.cardTaken = false; // 奸雄拿牌标记
    this.limbo = new Set(); // 结算暂离区（五谷展示中/伤害牌结算中），供守恒校验
    this._yingjiQueue = []; // 枭姬触发队列（onLoseEquip同步入队，结算边界flush询问）
  }

  // 牌数守恒：154张（160 - 6铁索）必须全部分布在场
  invariant() {
    let n = this.drawPile.length + this.discardPile.length + this.limbo.size;
    for (const p of this.players) {
      n += p.hand.length + p.judge.length + Object.values(p.equips).filter(Boolean).length;
    }
    return { ok: n === 154, total: n };
  }

  async setup() {
    // 牌堆：定向发牌（测试）或常规洗牌（铁索连环在1v1中不使用）
    this.drawPile = this.opts.deck
      ? makeRiggedDeck(this.opts.deck).filter(c => c.name !== '铁索连环')
      : buildDeck(this.rng).filter(c => c.name !== '铁索连环');
    this.discardPile = [];
    // 无论是否外部指定武将/先手，都按同一顺序消耗随机数：
    // 保证"存档→恢复"（会带上generals/first）时牌堆顺序与原局完全一致
    this.mode = (this.opts.mode === 'ddd') ? 'ddd' : '1v1';
    const playerCount = this.mode === 'ddd' ? 3 : 2;
    const shuffledNames = shuffle(Object.keys(GENERALS), this.rng);
    let names = (this.opts.generals && this.opts.generals.length === playerCount)
      ? this.opts.generals
      : shuffledNames;
    const firstRoll = this.rng();
    this.first = (this.opts.first != null) ? this.opts.first : (firstRoll < 0.5 ? 0 : 1);
    // 开局选将（三选一）：新对局实时询问；恢复带选将的存档时重放选将决策以对齐决策流，
    // 最终武将一律以选将结果为准（与存档generals一致）。选将不额外消耗随机数，牌堆顺序不受影响。
    this._xuanjiang = !!(this.opts.selectGenerals || (this.opts.replay && this.opts.replayXuanjiang));
    if (this._xuanjiang) names = await this.xuanjiangPhase(shuffledNames);
    // 斗地主身份：地主=先手（存档以first为准），农民=其余；地主体力上限+1
    const roles = this.opts.roles
      || Array.from({ length: playerCount }, (_, i) => (this.mode === 'ddd' ? (i === this.first ? '地主' : '农民') : null));
    const mk = (idx, name) => {
      const g = GENERALS[name];
      const role = roles[idx] || null;
      const bonus = (this.mode === 'ddd' && role === '地主') ? 1 : 0; // 斗地主：地主体力上限+1
      const skills = [...g.skills]; // 复制：斗地主地主追加跋扈/飞扬（模式技，展示用；触发逻辑按role判定）
      if (bonus) skills.push('跋扈', '飞扬');
      return {
        idx, general: name, kingdom: g.kingdom, gender: g.gender, skills,
        role, dead: false,
        hp: g.hp + bonus, maxHp: g.hp + bonus,
        hand: [], equips: { weapon: null, armor: null, horsePlus: null, horseMinus: null },
        judge: [], shaUsed: 0, jiuUsed: 0, zhihengUsed: false, fanjianUsed: false, luoyi: false,
        skipPlay: false, skipDraw: false, drunken: false,
        jieyinUsed: false, qingnangUsed: false, shaActed: false, rendeGiven: 0, rendeHealed: false,
      };
    };
    this.players = names.slice(0, playerCount).map((n, i) => mk(i, n));
    this.turnPlayer = this.players[this.first];
    for (const p of this.players) this.draw(p, 4);
    this.setupDone = true;
    if (this.mode === 'ddd') {
      this.log(`斗地主开局：${this.players[this.first].general}（地主，体力上限+1） vs ${this.others(this.players[this.first]).map(q => q.general + '（农民）').join('、')}，地主先手`);
    } else {
      this.log(`对局开始：${this.players[0].general}（玩家） vs ${this.players[1].general}（AI），先手：${this.players[this.first].general}`);
    }
    this.emitState();
  }

  // 开局选将（手游版规则）：每名玩家从3名随机候选武将中选1名出战。
  // 候选取自同一种子的全将池洗牌前3n名（双方/三方不重叠），不额外消耗随机数，牌堆顺序与不选将对局完全一致。
  // 选将期间候选互相保密：快照显示"选将中"，renderState对xuanjiang类型只渲染自己的候选。
  async xuanjiangPhase(shuffledNames) {
    const n = this.mode === 'ddd' ? 3 : 2;
    const cand = [];
    for (let i = 0; i < n; i++) cand.push(shuffledNames.slice(i * 3, i * 3 + 3));
    const mkBlank = (idx) => ({
      idx, general: '选将中', kingdom: null, gender: null, skills: [],
      role: this.mode === 'ddd' ? (idx === this.first ? '地主' : '农民') : null, dead: false,
      hp: 0, maxHp: 0,
      hand: [], equips: { weapon: null, armor: null, horsePlus: null, horseMinus: null },
      judge: [], shaUsed: 0, jiuUsed: 0, zhihengUsed: false, fanjianUsed: false, luoyi: false,
      skipPlay: false, skipDraw: false, drunken: false,
      jieyinUsed: false, qingnangUsed: false, shaActed: false, rendeGiven: 0, rendeHealed: false,
    });
    this.players = cand.map((_, idx) => mkBlank(idx));
    this.selecting = true;
    this.emitState();
    const picks = [];
    for (let idx = 0; idx < n; idx++) {
      const names3 = cand[idx];
      const m = await this.askPlayer(this.players[idx], {
        playerIdx: idx, type: 'xuanjiang',
        playable: names3.map(nm => ({ kind: 'choice', value: nm })),
        context: { question: `【选将】请从三名候选武将中选择一名出战：${names3.join(' / ')}`, candidates: names3, isFirst: idx === this.first },
      });
      const name = (m && m.kind === 'choice' && names3.includes(m.value))
        ? m.value
        : names3[Math.floor(this.rng() * 3)];
      picks.push(name);
      if (!this.silent) this.log(`${idx === 0 ? '玩家' : 'AI' + idx}选择了【${name}】`);
    }
    this.selecting = false;
    if (!this.silent) this.log(`选将完毕：${picks.join(' vs ')}`);
    return picks;
  }

  // 存档快照：种子+武将+先手+定向牌堆+全部已做决策 ⇒ 恢复时重放即可精确续局
  saveData() {
    return {
      version: 1,
      savedAt: new Date().toISOString(),
      seed: this.opts.seed != null ? this.opts.seed : null,
      mode: this.mode || '1v1',
      roles: (this.players || []).map(p => p.role || null),
      generals: (this.players || []).map(p => p.general),
      first: this.first,
      xuanjiang: !!this._xuanjiang, // 选将对局：恢复时须重放选将决策对齐决策流
      deck: this.opts.deck || null, // 定向发牌序列（测试用），常规对局为null（由seed重建）
      turnNo: this.turnNo,
      phase: this.phase || null,
      hp: (this.players || []).map(p => p.hp),
      decisions: this.decisionLog.map(m => JSON.parse(JSON.stringify(m))),
      logs: this.logLines.slice(),
    };
  }

  // ---------- 基础工具 ----------
  other(p) { return this.players[1 - p.idx]; }
  // 模式：'ddd'=斗地主（3人：1地主 vs 2农民，身份公开），默认1v1
  get isDdd() { return this.players.length === 3; }
  // 存活的其他角色（按座次；多目标卡牌/濒死/锦囊结算用）
  others(p) { return this.players.filter(q => q !== p && !q.dead); }
  alivePlayers() { return this.players.filter(q => !q.dead); }
  // 从指定座位起按行动顺序列出存活角色（濒死求援顺序：从当前回合角色开始）
  seatOrderFrom(startIdx) {
    const n = this.players.length;
    const order = [];
    for (let i = 0; i < n; i++) {
      const q = this.players[(startIdx + i) % n];
      if (q && !q.dead) order.push(q);
    }
    return order;
  }
  emitState() { if (!this.silent) this.onEvent({ type: 'state', state: this.snapshot() }); }
  log(msg) { this.logLines.push(msg); if (!this.silent) this.onEvent({ type: 'log', msg, seq: this.logLines.length }); }

  snapshot() {
    const pub = (p) => ({
      general: p.general, kingdom: p.kingdom,
      role: p.role || null, dead: !!p.dead,
      skills: p.skills.map(s => ({ name: s, text: SKILL_TEXTS[s] })),
      hp: Math.max(p.hp, 0), maxHp: p.maxHp, handCount: p.hand.length,
      equips: Object.fromEntries(Object.entries(p.equips).map(([k, v]) => [k, v ? { name: v.name, suit: v.suit, rank: v.rank, subtype: v.subtype, image: v.image } : null])),
      judge: p.judge.map(c => ({ name: c.name, suit: c.suit, rank: c.rank, image: c.image })),
    });
    return {
      over: this.over, winner: this.winner, winnerRole: this.winnerRole || null,
      players: this.players.map(pub),
      // 调试信息：AI（侧1/侧2）手牌，供人类玩家核对AI行为
      aiHand: this.players[1] ? this.players[1].hand.map(c => ({ id: c.id, name: c.name, suit: c.suit, rank: c.rank, subtype: c.subtype, category: c.category, equip: c.equip, image: c.image })) : [],
      aiHand2: this.players[2] ? this.players[2].hand.map(c => ({ id: c.id, name: c.name, suit: c.suit, rank: c.rank, subtype: c.subtype, category: c.category, equip: c.equip, image: c.image })) : [],
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
  // 官方规则：失去装备区里的白银狮子时，回复1点体力（满体力时无回复）；枭姬入队待结算边界询问
  onLoseEquip(owner, card) {
    if (!card || this.over) return;
    if (card.name === '白银狮子') {
      if (owner.hp >= owner.maxHp) {
        this.log(`${owner.general} 失去装备区的【白银狮子】（体力已满，无回复）`);
      } else {
        const before = owner.hp;
        owner.hp = Math.min(owner.maxHp, owner.hp + 1);
        this.log(`${owner.general} 失去装备区的【白银狮子】，回复1点体力（${before}→${owner.hp}/${owner.maxHp}）`);
      }
    }
    this.queueYingji(owner);
  }
  // 取牌离位：手牌或装备区（武圣等技能可转化装备区的牌）
  takeCard(p, cardId) {
    const h = this.inHand(p, cardId);
    if (h) { p.hand = p.hand.filter(c => c !== h); return h; }
    for (const [k, v] of Object.entries(p.equips)) {
      if (v && v.id === cardId) { p.equips[k] = null; this.onLoseEquip(p, v); return v; }
    }
    return null;
  }
  hasCards(p) {
    return p.hand.length > 0 || Object.values(p.equips).some(Boolean) || p.judge.length > 0;
  }
  distance(from, to) {
    // 座次环距离：按存活角色的座次取环向最短距离（斗地主3人环：任意两两相邻=1；死亡者离场后其相邻者视为相邻）
    let d;
    if (this.isDdd) {
      const alive = this.alivePlayers();
      const ia = alive.indexOf(from), ib = alive.indexOf(to);
      if (ia < 0 || ib < 0) return 99;
      const ring = Math.abs(ia - ib), n = alive.length;
      d = Math.min(ring, n - ring);
    } else d = 1;
    // 马术（锁定）：计算与其他角色的距离-1
    return Math.max(1, d + (to.equips.horsePlus ? 1 : 0) - (from.equips.horseMinus ? 1 : 0) - (from.skills.includes('马术') ? 1 : 0));
  }
  attackRange(p) { return p.equips.weapon ? weaponRange(p.equips.weapon) : 1; }
  shaUnlimited(p) {
    return p.skills.includes('咆哮') || (p.equips.weapon && p.equips.weapon.name === '诸葛连弩');
  }
  // 空城（锁定技）：没有手牌时不能成为【杀】/【决斗】的目标
  kongcheng(p) { return p.skills.includes('空城') && p.hand.length === 0; }
  // 谦逊（锁定技）：不能成为【顺手牵羊】/【乐不思蜀】的目标
  qianxun(p) { return p.skills.includes('谦逊'); }

  // 观星：准备阶段观看牌堆顶X张（X=存活角色数，1v1为2），逐张决定置于牌堆顶/底
  async guanxing(p) {
    if (this.over || this.aborted) return;
    const n = Math.min(2, this.drawPile.length);
    if (n === 0) return;
    const decision = {
      playerIdx: p.idx, type: 'skill_ask', skill: '观星',
      playable: [{ kind: 'activate', skill: '观星' }, { kind: 'skip', skill: '观星' }],
      context: { question: `是否发动【观星】观看牌堆顶${n}张牌？` },
    };
    const m = await this.askPlayer(p, decision);
    if (!m || m.kind !== 'activate') return;
    const viewed = this.drawPile.splice(0, n);
    this.log(`${p.general} 发动【观星】，观看牌堆顶${n}张：${viewed.map(cardName).join('、')}`);
    // 一次性决策：亮出全部牌，逐张指定 top(置于牌堆顶)/bottom(置于牌堆底)
    const gx = {
      playerIdx: p.idx, type: 'guanxing',
      playable: [{ kind: 'guanxing', cardIds: viewed.map(c => c.id) }],
      optionCards: viewed,
      context: { question: `【观星】为亮出的${n}张牌逐张指定：top=置于牌堆顶，bottom=置于牌堆底（必须恰好分配完所有牌）` },
    };
    const mv = await this.askPlayer(p, gx);
    let tops = (mv && mv.tops) || [], bottoms = (mv && mv.bottoms) || [];
    // 校验：tops+bottoms 必须恰好把亮出的牌全部分完（不合法→全部置于牌堆顶）
    const ids = new Set([...tops, ...bottoms]);
    const ok = ids.size === viewed.length && viewed.every(c => ids.has(c.id));
    if (!ok) { tops = viewed.map(c => c.id); bottoms = []; this.log('观星分配不完整，默认全部置于牌堆顶'); }
    const topCards = tops.map(id => viewed.find(c => c.id === id)).filter(Boolean);
    const bottomCards = bottoms.map(id => viewed.find(c => c.id === id)).filter(Boolean);
    // 顶部保持指定顺序（先指定的最先被摸到），底部垫在牌堆底
    this.drawPile = [...topCards, ...this.drawPile, ...bottomCards];
    this.emitState();
    this.log(`【观星】完毕（顶：${topCards.map(cardName).join('、') || '无'}｜底：${bottomCards.map(cardName).join('、') || '无'}）`);
  }
  noTrickDistance(p) { return p.skills.includes('奇才'); }

  // 洛神（甄姬）：准备阶段判定，黑色获得判定牌并可再次发动
  async luoshen(p) {
    while (!this.over && !this.aborted) {
      const decision = {
        playerIdx: p.idx, type: 'skill_ask', skill: '洛神',
        playable: [{ kind: 'activate', skill: '洛神' }, { kind: 'skip', skill: '洛神' }],
        context: { question: '是否发动【洛神】进行判定（黑色则获得判定牌，可再次发动）？' },
      };
      const m = await this.askPlayer(p, decision);
      if (!m || m.kind !== 'activate') return;
      const jc0 = this.drawOne();
      if (!jc0) return;
      this.log(`${p.general} 发动【洛神】判定：${cardName(jc0)}`);
      const mod = await this.guicai(p, jc0);
      const jc = mod || jc0;
      if (isBlack(jc)) {
        p.hand.push(jc);
        this.log(`洛神判定为黑色，${p.general} 获得${cardName(jc)}`);
        this.emitState();
      } else {
        this.toDiscard(jc);
        this.log('洛神判定为红色，无效果');
        return;
      }
    }
  }

  // 连营（可选技）：失去最后的手牌时可摸一张——询问是否发动（在失去手牌的结算边界调用）
  async lianyingCheck(p) {
    if (this.over || this.aborted) return;
    if (p.skills && p.skills.includes('连营') && p.hand.length === 0) {
      const m = await this.askPlayer(p, {
        playerIdx: p.idx, type: 'skill_ask', skill: '连营',
        playable: [{ kind: 'activate', skill: '连营' }, { kind: 'skip', skill: '连营' }],
        context: { question: '【连营】你已失去最后的手牌，是否摸一张牌？' },
      });
      if (m && m.kind === 'activate') {
        const n = this.draw(p, 1);
        this.log(`${p.general} 发动【连营】，摸${n}张牌`);
      }
    }
  }
  // 枭姬（孙尚香）：失去装备区牌时摸两张——onLoseEquip是同步的，先入队，在结算边界统一询问
  queueYingji(owner) {
    if (owner.skills && owner.skills.includes('枭姬')) this._yingjiQueue.push(owner);
  }
  async flushYingji() {
    const queue = this._yingjiQueue.splice(0);
    for (const owner of queue) {
      if (this.over || this.aborted) break;
      const decision = {
        playerIdx: owner.idx, type: 'skill_ask', skill: '枭姬',
        playable: [{ kind: 'activate', skill: '枭姬' }, { kind: 'skip', skill: '枭姬' }],
        context: { question: '是否发动【枭姬】摸两张牌？' },
      };
      const m = await this.askPlayer(owner, decision);
      if (m && m.kind === 'activate') {
        const n = this.draw(owner, 2);
        this.log(`${owner.general} 发动【枭姬】摸${n}张牌`);
        this.emitState();
      }
    }
  }

  // ---------- 主循环 ----------
  async run() {
    if (!this.setupDone) await this.setup();
    let cur = this.first;
    while (!this.over && !this.aborted) {
      const p = this.players[cur];
      if (p && !p.dead) await this.turn(cur);
      if (this.over || this.aborted) break;
      // 斗地主：阵亡者跳过，按座次环继续（胜负在死亡结算时判定）
      cur = (cur + 1) % this.players.length;
    }
    return this.winner;
  }

  handLimit(p) { return p.hp; }
  async turn(idx) {
    const p = this.players[idx];
    this.turnNo++;
    this.turnPlayer = p;
    p.shaUsed = 0; p.jiuUsed = 0; p.zhihengUsed = false; p.fanjianUsed = false; p.luoyi = false; p.drunken = false;
    p.skipPlay = false; p.skipDraw = false;
    p.jieyinUsed = false; p.qingnangUsed = false; p.shaActed = false; p.rendeGiven = 0; p.rendeHealed = false;
    const isFirstTurn = (idx === this.first && this.turnNo === 1);
    this.log(`—— 第${this.turnNo}回合：${p.general}${p.role ? `（${p.role}）` : ''}（${p.hp}/${p.maxHp}）——`);
    this.emitState();

    this.phase = '准备';
    if (p.skills.includes('观星')) await this.guanxing(p);
    if (p.skills.includes('洛神')) await this.luoshen(p);
    if (this.over || this.aborted || p.dead) return;
    this.emitState();

    this.phase = '判定';
    // 飞扬（斗地主地主技）：判定阶段开始时，若判定区有牌，可弃置两张手牌弃掉判定区里的一张牌（多张自选，每回合限一次）
    if (p.role === '地主' && p.judge.length > 0 && p.hand.length >= 2 && !this.over && !this.aborted) {
      const fm = await this.askPlayer(p, {
        playerIdx: p.idx, type: 'skill_ask', skill: '飞扬',
        playable: [{ kind: 'activate', skill: '飞扬' }, { kind: 'skip', skill: '飞扬' }],
        context: { question: `【飞扬】你的判定区有${p.judge.map(cardName).join('、')}，是否弃置两张手牌，弃掉其中一张？` },
      });
      if (fm && fm.kind === 'activate') {
        const sel = await this.askPlayer(p, {
          playerIdx: p.idx, type: 'discard', count: 2,
          playable: [{ kind: 'discard' }],
          context: { question: '【飞扬】已发动：请弃置两张手牌' },
        });
        const cards = (sel && sel.kind === 'discard' && sel.cardIds)
          ? [...new Set(sel.cardIds.map(id => this.inHand(p, id)).filter(Boolean))]
          : [];
        if (cards.length === 2) {
          p.hand = p.hand.filter(c => !cards.includes(c));
          // 弃掉判定区的一张牌（多张时自选，其余保留继续结算）
          let jc = p.judge[0];
          if (p.judge.length > 1) {
            const picked = await this.askPick(p, p.judge, '【飞扬】选择判定区弃置的一张牌');
            if (picked) jc = picked;
          }
          p.judge = p.judge.filter(c => c !== jc);
          this.toDiscard([...cards, jc]);
          this.log(`${p.general} 发动【飞扬】，弃置${cards.map(cardName).join('、')}，弃掉判定区的${cardName(jc)}`);
          await this.lianyingCheck(p);
        } else { this.log('【飞扬】弃牌不合法，取消发动'); }
      }
    }
    for (const card of [...p.judge]) {
      if (this.over || this.aborted || p.dead) return;
      await this.resolveDelayed(p, card);
      this.emitState();
    }
    if (this.over || this.aborted || p.dead) return;

    this.phase = '摸牌';
    let yingziDraw = 0;
    if (p.skills.includes('英姿') && !p.skipDraw) {
      // 英姿是可选技：询问是否多摸一张
      const yd = {
        playerIdx: p.idx, type: 'skill_ask', skill: '英姿',
        playable: [{ kind: 'activate', skill: '英姿' }, { kind: 'skip', skill: '英姿' }],
        context: { question: '是否发动【英姿】多摸一张牌？' },
      };
      const ym = await this.askPlayer(p, yd);
      if (ym && ym.kind === 'activate') yingziDraw = 1;
    }
    // 跋扈（斗地主地主技，锁定）：摸牌阶段多摸一张牌
    const bahuDraw = (p.role === '地主') ? 1 : 0;
    let luoyiDraw = 0;
    if (p.skills.includes('裸衣') && !p.skipDraw) {
      // 裸衣是可选技：少摸一张换本回合杀/决斗伤害+1
      const ld = {
        playerIdx: p.idx, type: 'skill_ask', skill: '裸衣',
        playable: [{ kind: 'activate', skill: '裸衣' }, { kind: 'skip', skill: '裸衣' }],
        context: { question: '是否发动【裸衣】少摸一张牌（本回合【杀】和【决斗】伤害+1）？' },
      };
      const lm = await this.askPlayer(p, ld);
      if (lm && lm.kind === 'activate') { luoyiDraw = -1; p.luoyi = true; }
    }
    // 突袭（张辽）：放弃摸牌，改为获得一名其他角色的一张手牌（目标自选）
    let tuxiDone = false;
    const tuxiTargets = (!p.skipDraw && p.skills.includes('突袭')) ? this.others(p).filter(q => q.hand.length > 0) : [];
    if (tuxiTargets.length > 0) {
      const td = {
        playerIdx: p.idx, type: 'skill_ask', skill: '突袭',
        playable: [{ kind: 'activate', skill: '突袭' }, { kind: 'skip', skill: '突袭' }],
        context: { question: '是否发动【突袭】放弃摸牌，改为获得一名其他角色的一张手牌？' },
      };
      const tm = await this.askPlayer(p, td);
      if (tm && tm.kind === 'activate') {
        let o = tuxiTargets[0];
        if (tuxiTargets.length > 1) {
          const sel = await this.askChoosePlayer(p, tuxiTargets, '【突袭】已发动：获得哪名角色的一张手牌？');
          if (sel) o = sel;
        }
        const c = o.hand[Math.floor(this.rng() * o.hand.length)];
        o.hand = o.hand.filter(x => x !== c);
        p.hand.push(c);
        tuxiDone = true;
        this.log(`${p.general} 发动【突袭】，放弃摸牌，获得${o.general}的一张手牌`);
        this.emitState();
      }
    }
    if (p.skipDraw) { this.log(`${p.general} 跳过摸牌阶段`); }
    else if (tuxiDone) {
      // 突袭已代替摸牌
    } else if (isFirstTurn) {
      // 官方1v1平衡规则：先手第一回合摸牌阶段少摸一张（斗地主无此规则，正常摸2张）
      const base = this.mode === 'ddd' ? 2 : 1;
      const n = this.draw(p, base + yingziDraw + luoyiDraw + bahuDraw);
      if (this.mode === 'ddd') this.log(`${p.general} 先手第一回合，摸牌阶段摸${n}张（含跋扈：多摸一张）`);
      else this.log(`${p.general} 先手第一回合，摸牌阶段少摸一张（摸${n}张）`);
    } else {
      const n = this.draw(p, 2 + yingziDraw + luoyiDraw + bahuDraw);
      const parts = [];
      if (yingziDraw) parts.push('英姿：多摸一张');
      if (bahuDraw) parts.push('跋扈：多摸一张');
      if (p.luoyi) parts.push('裸衣：少摸一张，本回合杀/决斗伤害+1');
      this.log(`${p.general} 摸${n}张牌${parts.length ? `（${parts.join('，')}）` : ''}`);
    }
    this.emitState();

    this.phase = '出牌';
    if (p.dead) return; // 斗地主：回合中死亡（如刚烈/苦肉）即回合结束
    if (p.skipPlay) {
      this.log(`${p.general} 跳过出牌阶段`);
    } else {
      let guard = 0;
      while (!this.over && !this.aborted && !p.dead) {
        if (++guard > 60) { this.log('出牌阶段过长，强制结束'); break; }
        const decision = this.playDecision(p);
        const move = await this.askPlayer(p, decision);
        if (!move || move.kind === 'end') break;
        await this.executePlay(p, move);
        this.emitState();
      }
    }
    if (this.over || this.aborted || p.dead) return;

    this.phase = '弃牌';
    // 克己（锁定）：出牌阶段未使用/打出过【杀】则跳过弃牌阶段
    if (p.skills.includes('克己') && !p.shaActed) {
      this.log(`${p.general} 【克己】本回合未使用或打出过【杀】，跳过弃牌阶段`);
    } else {
      let discardGuard = 0;
      const limit = this.handLimit(p);
      while (p.hand.length > limit && !this.over && !this.aborted && !p.dead) {
        if (++discardGuard > 20) { this.log('弃牌阶段异常，自动随机弃置'); break; }
        const n = p.hand.length - limit;
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
        await this.lianyingCheck(p);
        this.emitState();
      }
    }
    // 结束阶段：闭月（貂蝉）
    if (this.over || this.aborted || p.dead) return;
    this.phase = '结束';
    if (p.skills.includes('闭月')) {
      const bm = await this.askPlayer(p, {
        playerIdx: p.idx, type: 'skill_ask', skill: '闭月',
        playable: [{ kind: 'activate', skill: '闭月' }, { kind: 'skip', skill: '闭月' }],
        context: { question: '是否发动【闭月】摸一张牌？' },
      });
      if (bm && bm.kind === 'activate') {
        const n = this.draw(p, 1);
        this.log(`${p.general} 发动【闭月】摸${n}张牌`);
      }
    }
    // 回合边界结算全部落定，守恒校验有意义（结算中途牌在途属正常）
    const inv = this.invariant();
    if (!inv.ok) this.log(`【守恒告警】${inv.total}/154`);
    this.emitState();
  }

  // ---------- 判定区结算 ----------
  // 鬼才：判定牌生效前，司马懿可打出手牌代替之（从判定牌拥有者起按座次逐个询问，改判后原判定牌进弃牌堆）
  async guicai(judgeOwner, jc) {
    const candidates = [judgeOwner, ...this.others(judgeOwner)].filter(q => q.skills.includes('鬼才') && q.hand.length > 0);
    for (const sima of candidates) {
      if (this.over || this.aborted) return null;
      const decision = {
        playerIdx: sima.idx, type: 'skill_ask', skill: '鬼才',
        playable: [{ kind: 'activate', skill: '鬼才' }, { kind: 'skip', skill: '鬼才' }],
        context: { question: `【鬼才】判定牌为 ${cardName(jc)}，是否打出手牌代替之？` },
      };
      const m = await this.askPlayer(sima, decision);
      if (m && m.kind === 'activate') {
        const c = await this.askPick(sima, sima.hand, '【鬼才】打出一手牌作为新的判定牌');
        if (c) {
          sima.hand = sima.hand.filter(x => x !== c);
          this.toDiscard(jc);
          this.log(`${sima.general} 发动【鬼才】，用${cardName(c)}代替判定牌`);
          return c;
        }
      }
    }
    return null;
  }

  async resolveDelayed(p, card) {
    p.judge = p.judge.filter(c => c !== card);
    // 官方规则：判定区的延时锦囊在判定结算前，可被【无懈可击】抵消（抵消则无判定、无效果）
    if (await this.askWuxie(p, card.name)) {
      this.toDiscard(card);
      this.log(`${p.general} 判定区的【${card.name}】被抵消，无判定无效果`);
      return;
    }
    const jc0 = this.drawOne();
    if (!jc0) { this.toDiscard(card); return; }
    this.log(`${p.general} 判定【${card.name}】→ ${cardName(jc0)}`);
    const mod = await this.guicai(p, jc0);
    const jc = mod || jc0;
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
        this.log('未命中，闪电移至下一角色判定区');
        const next = this.seatOrderFrom((p.idx + 1) % this.players.length)[0];
        if (next) next.judge.push(card); else this.toDiscard(card);
      }
    }
    // 天妒（可选技）：郭嘉的判定牌生效后询问是否获得之
    if (p.skills.includes('天妒') && !this.over && !this.aborted) {
      const tm = await this.askPlayer(p, {
        playerIdx: p.idx, type: 'skill_ask', skill: '天妒',
        playable: [{ kind: 'activate', skill: '天妒' }, { kind: 'skip', skill: '天妒' }],
        context: { question: `是否发动【天妒】获得判定牌${cardName(jc)}？` },
      });
      if (tm && tm.kind === 'activate') {
        p.hand.push(jc);
        this.log(`${p.general} 发动【天妒】，获得判定牌${cardName(jc)}`);
      } else this.toDiscard(jc);
    } else this.toDiscard(jc);
    await this.flushYingji();
  }

  // ---------- 伤害与濒死 ----------
  async dealDamage(target, amount, { source = null, card = null, nature = '普通', pierceArmor = false } = {}) {
    if (this.over || amount <= 0) return;
    if (card) this.limbo.add(card); // 结算中的伤害牌暂离（奸雄可取）
    // 官方规则（标准版）：白银狮子=锁定技，受到大于1点的伤害时防止其余伤害，只受到1点；1点伤害无效果
    if (!pierceArmor && amount > 1 && target.equips.armor && target.equips.armor.name === '白银狮子') {
      this.log(`白银狮子：伤害减至1，${target.general} 只受到1点伤害`);
      amount = 1;
    }
    target.hp -= amount;
    this.log(`${target.general} 受到${amount}点${nature === '普通' ? '' : nature}伤害${source ? `（来自${source.general}）` : ''}，体力 ${target.hp + amount}→${target.hp}/${target.maxHp}`);
    this.emitState();
    // 官方时序：先结算濒死求援；受到伤害后的技能（奸雄/反馈）须在被救回后才能发动，阵亡则不询问
    if (target.hp <= 0) await this.dying(target, source);
    if (this.over || this.aborted || target.hp <= 0) return;
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
    // 反馈：受到伤害后，可获得伤害来源的一张牌（手牌随机一张/装备区自选）
    if (target.skills.includes('反馈') && source && source !== target && !this.over && !this.aborted && this.hasCards(source)) {
      const decision = {
        playerIdx: target.idx, type: 'skill_ask', skill: '反馈',
        playable: [{ kind: 'activate', skill: '反馈' }, { kind: 'skip', skill: '反馈' }],
        context: { question: `是否发动【反馈】获得${source.general}的一张牌？` },
      };
      const m = await this.askPlayer(target, decision);
      if (m && m.kind === 'activate') {
        const area = await this.askArea(target, source, '反馈');
        if (area === 'equip') {
          const equips = Object.values(source.equips).filter(Boolean);
          const e = await this.askPick(target, equips, '【反馈】选择要获得的装备牌');
          if (e) {
            for (const [k, v] of Object.entries(source.equips)) if (v === e) source.equips[k] = null;
            this.onLoseEquip(source, e);
            target.hand.push(e);
            this.log(`${target.general} 发动【反馈】，获得${source.general}装备区的${cardName(e)}`);
          }
        } else {
          const c = source.hand[Math.floor(this.rng() * source.hand.length)]; // 手牌区：随机一张（正面朝下摸）
          source.hand = source.hand.filter(x => x !== c);
          target.hand.push(c);
          this.log(`${target.general} 发动【反馈】，获得${source.general}的${cardName(c)}`);
        }
        this.emitState();
      }
    }
    // 遗计（郭嘉）：每受到1点伤害后，可观看牌堆顶两张，至少一张交给对手，其余收入手牌
    if (target.skills.includes('遗计') && source !== target && target.hp > 0) {
      for (let i = 0; i < amount && !this.over && !this.aborted; i++) {
        const askM = await this.askPlayer(target, {
          playerIdx: target.idx, type: 'skill_ask', skill: '遗计',
          playable: [{ kind: 'activate', skill: '遗计' }, { kind: 'skip', skill: '遗计' }],
          context: { question: '是否发动【遗计】观看牌堆顶两张牌（至少一张交给对手，其余收入手牌）？' },
        });
        if (!askM || askM.kind !== 'activate') break;
        const viewed = [];
        for (let j = 0; j < 2; j++) { const c = this.drawOne(); if (c) viewed.push(c); }
        if (viewed.length === 0) break;
        viewed.forEach(c => this.limbo.add(c));
        this.log(`${target.general} 发动【遗计】，观看牌堆顶：${viewed.map(cardName).join('、')}`);
        const decision = {
          playerIdx: target.idx, type: 'choose',
          playable: viewed.map(c => ({ kind: 'chooseCard', cardId: c.id })),
          optionCards: viewed,
          context: { question: '【遗计】已发动：选择至少一张交给对手（其余收入你的手牌）' },
        };
        const m = await this.askPlayer(target, decision);
        let give = (m && m.kind === 'chooseCard') ? viewed.find(c => c.id === m.cardId) : null;
        if (!give) give = viewed[0];
        viewed.splice(viewed.indexOf(give), 1);
        this.limbo.delete(give);
        const receiver = await this.askChoosePlayer(target, this.others(target), '【遗计】将这张牌交给谁？');
        (receiver || this.other(target)).hand.push(give);
        this.log(`${target.general} 将${cardName(give)}交给${(receiver || this.other(target)).general}`);
        if (viewed.length > 0) {
          for (const c of viewed) this.limbo.delete(c);
          target.hand.push(...viewed);
          this.log(`${target.general} 将${viewed.map(cardName).join('、')}收入手牌`);
        }
        this.emitState();
      }
    }
    // 刚烈（夏侯惇）：受到伤害后判定，非红桃则伤害来源弃两张手牌或受到1点伤害
    if (target.skills.includes('刚烈') && source && source !== target && target.hp > 0 && this.drawPile.length + this.discardPile.length > 0) {
      const jc0 = this.drawOne();
      if (jc0) {
        this.log(`${target.general} 发动【刚烈】判定：${cardName(jc0)}`);
        const mod = await this.guicai(target, jc0);
        const jc = mod || jc0;
        this.toDiscard(jc);
        if (jc.suit !== '♥') {
          this.log('刚烈判定非红桃，生效');
          let done = false;
          if (source.hand.length >= 2) {
            const cm = await this.askPlayer(source, {
              playerIdx: source.idx, type: 'choose',
              playable: [{ kind: 'choice', value: 'discard2' }, { kind: 'choice', value: 'hurt' }],
              context: { question: '【刚烈】生效：选择弃置两张手牌，还是受到1点伤害？', options: ['弃两张手牌', '受1点伤害'] },
            });
            const pick = (cm && cm.kind === 'choice' && cm.value) || 'discard2';
            if (pick === 'discard2') {
              const sel = await this.askPlayer(source, {
                playerIdx: source.idx, type: 'discard', count: 2,
                playable: [{ kind: 'discard' }],
                context: { question: '【刚烈】已发动：请弃置两张手牌' },
              });
              const cards = (sel && sel.kind === 'discard' && sel.cardIds)
                ? [...new Set(sel.cardIds.map(id => this.inHand(source, id)).filter(Boolean))]
                : [];
              if (cards.length === 2) {
                source.hand = source.hand.filter(c => !cards.includes(c));
                this.toDiscard(cards);
                this.log(`${source.general} 弃置${cards.map(cardName).join('、')}（刚烈）`);
                await this.lianyingCheck(source);
                done = true;
              }
            }
          }
          if (!done) {
            this.log(`${source.general} 受到【刚烈】的1点伤害`);
            await this.dealDamage(source, 1, { source: target });
          }
        } else this.log('刚烈判定为红桃，无效果');
      }
    }
    await this.flushYingji();
  }

  async dying(target, source = null) {
    // 濒死求援顺序：从当前回合角色开始按行动顺序（回合角色已死则从濒死者开始），濒死者自救优先顺位
    const start = (this.turnPlayer && !this.turnPlayer.dead) ? this.turnPlayer.idx : target.idx;
    const order = this.seatOrderFrom(start);
    let round = 0;
    while (target.hp <= 0 && !this.over) {
      let anyAsked = false;
      for (const helper of order) {
        if (target.hp > 0) break;
        if (helper.dead) continue;
        // 可用救援牌：桃（任何人救任何人）；酒（仅濒死者自救）；
        // 急救（华佗）：回合外可将红色牌（含装备区）当【桃】
        const jiujiu = helper.skills.includes('急救') && this.turnPlayer !== helper;
        const handPool = helper.hand.filter(c => c.name === '桃'
          || (helper === target && c.name === '酒')
          || (jiujiu && c.name !== '桃' && isRed(c)));
        const equipPool = jiujiu ? Object.values(helper.equips).filter(c => c && isRed(c)) : [];
        const usable = handPool.concat(equipPool);
        if (usable.length === 0) continue;
        const decision = {
          playerIdx: helper.idx, type: 'dying',
          playable: usable.map(c => ({ kind: 'tao', cardId: c.id })).concat([{ kind: 'refuse' }]),
          context: { dying: target.general, dyingHp: target.hp },
        };
        const move = await this.askPlayer(helper, decision);
        anyAsked = true;
        if (move && move.kind === 'tao') {
          const card = this.takeCard(helper, move.cardId);
          if (card) {
            this.toDiscard(card);
            const before = target.hp;
            target.hp += 1;
            this.log(`${helper.general} 使用【桃】${card.name !== '桃' ? `（${cardName(card)}转化）` : `（${cardName(card)}）`}，${target.general} 体力 ${before}→${target.hp}/${target.maxHp}`);
            await this.lianyingCheck(helper);
            this.emitState();
          }
        }
      }
      if (!anyAsked) break;
      if (++round > 20) break;
    }
    await this.flushYingji();
    if (target.hp <= 0 && !this.over) await this.onDeath(target, source);
  }

  // 死亡结算：清场 → 击杀奖励 → 农民互助 → 胜负判定
  async onDeath(target, source = null) {
    target.dead = true;
    target.hp = 0;
    // 官方规则：死亡角色区域里的所有牌（手牌/装备区/判定区）置入弃牌堆
    const leftovers = [...target.hand, ...Object.values(target.equips).filter(Boolean), ...target.judge];
    target.hand = [];
    target.judge = [];
    for (const k of Object.keys(target.equips)) target.equips[k] = null;
    this.toDiscard(leftovers);
    this.log(`★ ${target.general}${target.role ? `（${target.role}）` : ''}阵亡！`);
    // 击杀奖励：杀死一名其他角色后摸三张牌（自己苦肉致死无奖励）
    if (source && source !== target && !source.dead && source.hp > 0) {
      const n = this.draw(source, 3);
      this.log(`${source.general} 击杀${target.general}，摸${n}张牌`);
    }
    // 斗地主·农民互助：一名农民阵亡时，另一名农民选择摸两张牌或回复1点体力
    if (this.mode === 'ddd' && target.role === '农民') {
      const mate = this.alivePlayers().find(q => q.role === '农民');
      if (mate) {
        const opts = [{ kind: 'choice', value: 'draw2' }];
        if (mate.hp < mate.maxHp) opts.push({ kind: 'choice', value: 'heal' });
        const cm = await this.askPlayer(mate, {
          playerIdx: mate.idx, type: 'choose',
          playable: opts,
          context: { question: `队友${target.general}阵亡：你选择摸两张牌${opts.length > 1 ? '，还是回复1点体力' : ''}？`, options: opts.length > 1 ? ['摸两张牌', '回复1点体力'] : ['摸两张牌'] },
        });
        const pick = (cm && cm.kind === 'choice' && cm.value) || 'draw2';
        if (pick === 'heal') { const b = mate.hp; mate.hp++; this.log(`【农民互助】${mate.general} 回复1点体力（${b}→${mate.hp}/${mate.maxHp}）`); }
        else { const n = this.draw(mate, 2); this.log(`【农民互助】${mate.general} 摸${n}张牌`); }
        this.emitState();
      }
    }
    // 胜负判定
    if (this.mode === 'ddd') {
      const landlordAlive = this.alivePlayers().some(q => q.role === '地主');
      const farmers = this.alivePlayers().filter(q => q.role === '农民');
      if (!landlordAlive) {
        this.over = true;
        this.winnerRole = '农民';
        this.winner = farmers[0] ? farmers[0].idx : this.players.findIndex(q => q.role === '农民');
        this.log(`★ 地主阵亡！农民阵营获胜`);
      } else if (farmers.length === 0) {
        this.over = true;
        this.winnerRole = '地主';
        this.winner = this.players.findIndex(q => q.role === '地主');
        this.log(`★ 农民全部阵亡！地主获胜`);
      }
    } else {
      this.over = true;
      this.winner = this.other(target).idx;
      this.log(`★ ${target.general} 阵亡！${this.other(target).general} 获胜`);
    }
    this.emitState();
  }

  // ---------- 出牌阶段 ----------
  playDecision(p) {
    const targets = this.others(p); // 存活的其他角色（逐目标生成合法动作）
    const playable = [{ kind: 'end' }];
    // 跋扈（斗地主地主技，锁定）：每回合使用【杀】的次数上限+1（1v1无身份，保持1次）
    const shaLimit = 1 + (p.role === '地主' ? 1 : 0);
    const canSha = this.shaUnlimited(p) || p.shaUsed < shaLimit;
    const range = this.attackRange(p);
    const shaTargets = canSha ? targets.filter(t => this.distance(p, t) <= range && !this.kongcheng(t)) : []; // 空城：无手牌的诸葛亮不能被杀指定

    for (const c of p.hand) {
      const slot = equipSlot(c);
      if (slot) { playable.push({ kind: 'play', cardId: c.id, targets: [p.idx] }); continue; }
      if (c.name === '杀') { for (const t of shaTargets) playable.push({ kind: 'play', cardId: c.id, targets: [t.idx] }); }
      else if (c.name === '桃') { if (p.hp < p.maxHp) playable.push({ kind: 'play', cardId: c.id, targets: [p.idx] }); }
      else if (c.name === '酒') { if (p.jiuUsed === 0) playable.push({ kind: 'play', cardId: c.id, targets: [] }); }
      else if (c.category === '延时锦囊') {
        if (c.name === '闪电') { if (!p.judge.some(x => x.name === '闪电')) playable.push({ kind: 'play', cardId: c.id, targets: [p.idx] }); }
        else {
          for (const t of targets) {
            const distOk = c.name !== '兵粮寸断' || this.noTrickDistance(p) || this.distance(p, t) <= 1;
            // 谦逊（锁定）：陆逊不能成为【乐不思蜀】的目标
            if (distOk && !t.judge.some(x => x.name === c.name) && !(c.name === '乐不思蜀' && this.qianxun(t))) playable.push({ kind: 'play', cardId: c.id, targets: [t.idx] });
          }
        }
      } else if (c.category === '锦囊牌') {
        switch (c.name) {
          case '无中生有': case '桃园结义': case '五谷丰登':
            playable.push({ kind: 'play', cardId: c.id, targets: [] }); break;
          case '过河拆桥': case '顺手牵羊': {
            for (const t of targets) {
              const distOk = c.name !== '顺手牵羊' || this.noTrickDistance(p) || this.distance(p, t) <= 1;
              // 谦逊（锁定）：陆逊不能成为【顺手牵羊】的目标
              if (this.hasCards(t) && distOk && !(c.name === '顺手牵羊' && this.qianxun(t))) playable.push({ kind: 'play', cardId: c.id, targets: [t.idx] });
            }
            break;
          }
          case '南蛮入侵': case '万箭齐发':
            playable.push({ kind: 'play', cardId: c.id, targets: [] }); break; // AOE：所有其他角色
          case '火攻':
            for (const t of targets) playable.push({ kind: 'play', cardId: c.id, targets: [t.idx] }); break;
          case '决斗':
            for (const t of targets) if (!this.kongcheng(t)) playable.push({ kind: 'play', cardId: c.id, targets: [t.idx] }); // 空城不能被决斗指定
            break;
          case '借刀杀人':
            for (const t of targets) if (t.equips.weapon) playable.push({ kind: 'play', cardId: c.id, targets: [t.idx] }); break;
          // 无懈可击不主动使用
        }
      }
    }
    // 转化技（武圣：牌=手牌+装备区，红色装备也能当杀）
    for (const t of shaTargets) {
      if (p.skills.includes('武圣')) {
        for (const c of p.hand) if (isRed(c) && c.name !== '杀') playable.push({ kind: 'play', cardId: c.id, useAs: '杀', targets: [t.idx] });
        for (const c of Object.values(p.equips)) if (c && isRed(c)) playable.push({ kind: 'play', cardId: c.id, useAs: '杀', targets: [t.idx] });
      }
      if (p.skills.includes('龙胆')) {
        for (const c of p.hand) if (c.name === '闪') playable.push({ kind: 'play', cardId: c.id, useAs: '杀', targets: [t.idx] });
      }
    }
    if (p.skills.includes('奇袭')) {
      // 奇袭：任意黑色牌（含装备区里的牌）当【过河拆桥】
      for (const t of targets) {
        if (!this.hasCards(t)) continue;
        for (const c of p.hand) if (isBlack(c)) playable.push({ kind: 'play', cardId: c.id, useAs: '过河拆桥', targets: [t.idx] });
        for (const c of Object.values(p.equips)) if (c && isBlack(c)) playable.push({ kind: 'play', cardId: c.id, useAs: '过河拆桥', targets: [t.idx] });
      }
    }
    // 国色（大乔）：方块牌（含装备区）当【乐不思蜀】（谦逊不能成为目标）
    if (p.skills.includes('国色')) {
      for (const t of targets) {
        if (t.judge.some(x => x.name === '乐不思蜀') || this.qianxun(t)) continue;
        for (const c of p.hand) if (c.suit === '♦' && c.name !== '乐不思蜀') playable.push({ kind: 'play', cardId: c.id, useAs: '乐不思蜀', targets: [t.idx] });
        for (const c of Object.values(p.equips)) if (c && c.suit === '♦') playable.push({ kind: 'play', cardId: c.id, useAs: '乐不思蜀', targets: [t.idx] });
      }
    }
    // 苦肉（黄盖）：出牌阶段可失去1点体力摸两张牌，无次数限制（体力至少1才能发动）
    if (p.skills.includes('苦肉') && p.hp >= 1) {
      playable.push({ kind: 'activate', skill: '苦肉' });
    }
    // 仁德（刘备）：逐张将手牌交给一名其他角色，累计首次达两张回复1点体力
    if (p.skills.includes('仁德') && targets.length > 0) {
      for (const c of p.hand) playable.push({ kind: 'activate', skill: '仁德', cardId: c.id });
    }
    // 结姻（孙尚香）：出牌阶段限一次，弃两张手牌，选择一名已受伤的男性角色，你与其各回1血
    if (p.skills.includes('结姻') && !p.jieyinUsed && p.hand.length >= 2
      && this.others(p).some(t => t.gender === 'm' && t.hp < t.maxHp)) {
      playable.push({ kind: 'activate', skill: '结姻' });
    }
    // 青囊（华佗）：出牌阶段限一次，弃一张手牌，选一名已受伤角色回1血（可自己）
    if (p.skills.includes('青囊') && !p.qingnangUsed && p.hand.length > 0
      && (p.hp < p.maxHp || this.others(p).some(t => t.hp < t.maxHp))) {
      for (const c of p.hand) playable.push({ kind: 'activate', skill: '青囊', cardId: c.id });
    }
    if (p.skills.includes('制衡') && !p.zhihengUsed && (p.hand.length >= 1 || Object.values(p.equips).some(Boolean))) {
      playable.push({ kind: 'skill_zhiheng' });
    }
    // 反间：出牌阶段限一次，需要至少一张手牌交给对方
    if (p.skills.includes('反间') && !p.fanjianUsed && p.hand.length >= 1 && targets.length > 0) {
      playable.push({ kind: 'skill_fanjian' });
    }
    // 丈八蛇矛：任意两张手牌当【杀】（合法池由引擎计算下发，UI/AI不得自行推断）
    if (shaTargets.length > 0 && p.hand.length >= 2 && p.equips.weapon && p.equips.weapon.name === '丈八蛇矛') {
      for (const t of shaTargets) playable.push({ kind: 'sha_combo', cardIds: p.hand.map(c => c.id), targets: [t.idx] });
    }
    return { playerIdx: p.idx, type: 'play', playable, context: {} };
  }

  discardDecision(p, n) {
    return {
      playerIdx: p.idx, type: 'discard', count: n,
      playable: [{ kind: 'discard' }],
      context: { question: `弃牌阶段：手牌${p.hand.length}张，上限${this.handLimit(p)}，需弃置${n}张（cards填编号）` },
    };
  }

  async executePlay(p, move) {
    // 目标解析：出牌动作带targets（斗地主多目标）；主动技按需选择
    const opp = (move.targets && move.targets.length && move.targets[0] !== p.idx)
      ? this.players[move.targets[0]]
      : this.other(p);
    // —— 主动技：制衡 ——
    if (move.kind === 'skill_zhiheng') {
      if (p.zhihengUsed) { this.log('制衡本回合已发动'); return; }
      // 官方规则：制衡可弃置任意张牌（含装备区，不含判定区）
      const cards = [];
      for (const id of new Set(move.cardIds || [])) {
        const c = this.takeCard(p, id);
        if (c) cards.push(c);
      }
      if (cards.length === 0) { this.log('制衡未指定手牌，跳过'); return; }
      p.zhihengUsed = true;
      this.toDiscard(cards);
      const n = this.draw(p, cards.length);
      this.log(`${p.general} 发动【制衡】，弃${cards.length}张摸${n}张`);
      await this.lianyingCheck(p);
      await this.flushYingji();
      return;
    }
    // —— 主动技：反间 ——
    if (move.kind === 'skill_fanjian') {
      if (p.fanjianUsed) { this.log('反间本回合已发动'); return; }
      if (p.hand.length === 0) { this.log('反间需要至少一张手牌'); return; }
      const target = this.isDdd ? await this.askChoosePlayer(p, this.others(p), '【反间】选择一名其他角色发动') : this.other(p);
      if (!target) { this.log('反间没有可用目标'); return; }
      p.fanjianUsed = true;
      await this.fanjian(p, target);
      return;
    }
    // 丈八蛇矛：两张手牌当【杀】（无单卡cardId，必须先于手牌守卫处理）
    if (move.kind === 'sha_combo') {
      const combo = this.takeShaComboCards(p, move.cardIds);
      if (!combo) return;
      const target = (move.targets && move.targets.length) ? this.players[move.targets[0]] : this.other(p);
      await this.resolveSha(p, target, combo.primary, combo.extras);
      return;
    }
    // —— 主动技（activate 形式）：仁德 / 苦肉 / 青囊 / 结姻 ——
    if (move.kind === 'activate') {
      if (move.skill === '仁德') {
        const c = this.inHand(p, move.cardId);
        if (!c) { this.log('仁德：找不到该手牌'); return; }
        const receiver = await this.askChoosePlayer(p, this.others(p), '【仁德】将这张牌交给谁？');
        if (!receiver) { this.log('仁德没有可给的目标'); return; }
        p.hand = p.hand.filter(x => x !== c);
        receiver.hand.push(c);
        p.rendeGiven += 1;
        this.log(`${p.general} 发动【仁德】，将${cardName(c)}交给${receiver.general}（累计${p.rendeGiven}张）`);
        if (!p.rendeHealed && p.rendeGiven >= 2) {
          p.rendeHealed = true;
          if (p.hp < p.maxHp) { const b = p.hp; p.hp++; this.log(`仁德累计给出两张牌，${p.general} 回复1点体力（${b}→${p.hp}/${p.maxHp}）`); }
          else this.log(`仁德累计给出两张牌，${p.general} 体力已满无回复`);
        }
        await this.lianyingCheck(p);
        this.emitState();
        return;
      }
      if (move.skill === '苦肉') {
        const b = p.hp;
        p.hp -= 1; // 失去体力不是伤害：不触发奸雄/反馈/刚烈/遗计，白银狮子无效
        this.log(`${p.general} 发动【苦肉】，失去1点体力（${b}→${p.hp}/${p.maxHp}）`);
        this.emitState();
        if (p.hp <= 0) await this.dying(p);
        if (this.over || this.aborted) return;
        const n = this.draw(p, 2); // 然后：摸两张牌
        this.log(`${p.general} 摸${n}张牌`);
        await this.lianyingCheck(p);
        this.emitState();
        return;
      }
      if (move.skill === '青囊') {
        if (p.qingnangUsed) { this.log('青囊本回合已发动'); return; }
        const c = this.inHand(p, move.cardId);
        if (!c) { this.log('青囊：找不到该手牌'); return; }
        const opts = this.alivePlayers().filter(q => q.hp < q.maxHp).map(q => ({ kind: 'choice', value: String(q.idx) }));
        if (opts.length === 0) { this.log('青囊：没有已受伤的角色'); return; }
        const cm = await this.askPlayer(p, {
          playerIdx: p.idx, type: 'choose',
          playable: opts,
          context: { question: `【青囊】已发动（弃置${cardName(c)}）：回复体力的目标？`, options: this.alivePlayers().filter(q => q.hp < q.maxHp).map(q => q.general) },
        });
        const q = (cm && cm.kind === 'choice' && this.players[parseInt(cm.value, 10)]) || p;
        p.qingnangUsed = true;
        p.hand = p.hand.filter(x => x !== c);
        this.toDiscard(c);
        if (q.hp < q.maxHp) { const b = q.hp; q.hp++; this.log(`${p.general} 发动【青囊】，弃置${cardName(c)}，${q.general} 回复1点体力（${b}→${q.hp}/${q.maxHp}）`); }
        else this.log(`${q.general} 体力已满，青囊无回复`);
        await this.lianyingCheck(p);
        this.emitState();
        return;
      }
      if (move.skill === '结姻') {
        if (p.jieyinUsed) { this.log('结姻本回合已发动'); return; }
        const candidates = this.others(p).filter(t => t.gender === 'm' && t.hp < t.maxHp);
        if (p.hand.length < 2 || candidates.length === 0) { this.log('结姻条件不满足（需两张手牌与一名已受伤的男性角色）'); return; }
        const target = await this.askChoosePlayer(p, candidates, '【结姻】选择一名已受伤的男性角色（你与其各回复1点体力）');
        if (!target) { this.log('结姻条件不满足'); return; }
        let cards;
        if (p.hand.length === 2) cards = p.hand.slice();
        else {
          const sel = await this.askPlayer(p, {
            playerIdx: p.idx, type: 'discard', count: 2,
            playable: [{ kind: 'discard' }],
            context: { question: '【结姻】已发动：请选择弃置两张手牌' },
          });
          cards = (sel && sel.kind === 'discard' && sel.cardIds)
            ? [...new Set(sel.cardIds.map(id => this.inHand(p, id)).filter(Boolean))]
            : [];
        }
        if (cards.length !== 2) { this.log('结姻弃牌不合法，取消发动'); return; }
        p.jieyinUsed = true;
        p.hand = p.hand.filter(c => !cards.includes(c));
        this.toDiscard(cards);
        this.log(`${p.general} 发动【结姻】，弃置${cards.map(cardName).join('、')}`);
        await this.lianyingCheck(p);
        for (const q of [target, p]) {
          if (q.hp < q.maxHp) { const b = q.hp; q.hp++; this.log(`${q.general} 回复1点体力（${b}→${q.hp}/${q.maxHp}）`); }
          else this.log(`${q.general} 体力已满，无回复`);
        }
        this.emitState();
        return;
      }
      return;
    }
    const card = this.takeCard(p, move.cardId);
    if (!card) { this.log('无效动作：找不到该牌（手牌/装备区）'); return; }
    const useAs = move.useAs || card.name;
    this.cardTaken = false;

    if (useAs === '杀') {
      const target = (move.targets && move.targets.length && move.targets[0] !== p.idx) ? this.players[move.targets[0]] : this.other(p);
      if (!target || target.dead || target === p) { this.log('无效动作：目标不可用'); return; }
      await this.resolveSha(p, target, card, null);
      return;
    }
    await this.executeOtherPlay(p, move, card, useAs);
    await this.lianyingCheck(p);
  }

  // 反间：目标选一种花色 → 周瑜交一张手牌并展示 → 花色不同则目标受1点伤害（牌由目标获得）
  async fanjian(p, opp) {
    const suits = ['♥', '♠', '♣', '♦'];
    const sd = {
      playerIdx: opp.idx, type: 'fanjian_suit', skill: '反间',
      playable: suits.map(s => ({ kind: 'fanjian_suit', suit: s })),
      context: { question: `【反间】${p.general}发动反间：请选择一种花色（之后他交给你一张手牌展示，花色不同则你受到1点伤害）` },
    };
    const sm = await this.askPlayer(opp, sd);
    const suit = (sm && sm.kind === 'fanjian_suit' && suits.includes(sm.suit)) ? sm.suit : suits[Math.floor(this.rng() * 4)];
    this.log(`${opp.general} 反间选择花色 ${suit}`);
    const card = await this.askPick(p, p.hand, `【反间】交给${opp.general}一张手牌（对方已选花色 ${suit}）`);
    if (!card) return;
    p.hand = p.hand.filter(c => c !== card);
    opp.hand.push(card);
    this.emitState();
    this.log(`${p.general} 反间交出并展示 ${cardName(card)}`);
    if (card.suit !== suit) {
      this.log(`【反间】花色不同（${card.suit} ≠ ${suit}），${opp.general} 受到1点伤害`);
      // 注意：不传 card——该牌已转移给对方所有，不是"结算中的伤害牌"
      await this.dealDamage(opp, 1, { source: p, nature: '反间' });
    } else {
      this.log(`【反间】花色相同（${card.suit}），无伤害`);
    }
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
    p.shaActed = true; // 克己：使用过【杀】
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
    // 流离（大乔）：成为【杀】的目标时可弃置一张牌，将此【杀】转移给自己攻击范围内的另一名其他角色（不能转移给使用者）
    if (!this.over && opp.skills.includes('流离') && this.hasCards(opp)) {
      const cands = this.others(opp).filter(q => q !== p && this.distance(opp, q) <= this.attackRange(opp));
      if (cands.length > 0) {
        const fm = await this.askPlayer(opp, {
          playerIdx: opp.idx, type: 'skill_ask', skill: '流离',
          playable: [{ kind: 'activate', skill: '流离' }, { kind: 'skip', skill: '流离' }],
          context: { question: '是否发动【流离】弃置一张牌，将此【杀】转移给你攻击范围内的一名其他角色？' },
        });
        if (fm && fm.kind === 'activate') {
          const pool = [...opp.hand, ...Object.values(opp.equips).filter(Boolean)];
          const dc = await this.askPick(opp, pool, '【流离】弃置一张牌');
          if (dc) {
            this.removeOwnCards(opp, [dc]);
            this.toDiscard(dc);
            await this.lianyingCheck(opp);
            const nt = await this.askChoosePlayer(opp, cands, '【流离】将【杀】转移给谁？');
            if (nt) {
              this.log(`${opp.general} 发动【流离】，弃置${cardName(dc)}，将【杀】转移给${nt.general}`);
              opp = nt; // 此后结算以转移后的目标进行
            }
          }
        }
      }
    }
    // 铁骑（马超）：指定目标后可判定，红色则此【杀】不可被【闪】响应
    let tieqiLock = false;
    if (!this.over && p.skills.includes('铁骑')) {
      const td = {
        playerIdx: p.idx, type: 'skill_ask', skill: '铁骑',
        playable: [{ kind: 'activate', skill: '铁骑' }, { kind: 'skip', skill: '铁骑' }],
        context: { question: '是否发动【铁骑】进行判定（红色则此【杀】不可被【闪】响应）？' },
      };
      const tm = await this.askPlayer(p, td);
      if (tm && tm.kind === 'activate') {
        const jc0 = this.drawOne();
        if (jc0) {
          this.log(`${p.general} 发动【铁骑】判定：${cardName(jc0)}`);
          const mod = await this.guicai(p, jc0);
          const jc = mod || jc0;
          this.toDiscard(jc);
          if (isRed(jc)) { tieqiLock = true; this.log('铁骑判定为红色：此【杀】不可被【闪】响应'); }
          else this.log('铁骑判定为黑色，无效果');
        }
      }
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
      if (tieqiLock) {
        dodged = false; // 铁骑红色判定：不可被【闪】响应（含八卦阵），直接进入伤害
      } else {
        for (let i = 0; i < need; i++) {
          const ok = await this.askDodge(p, opp, i, need, '杀');
          if (!ok) { dodged = false; break; }
        }
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
              await this.lianyingCheck(p);
              dodged = false;
            }
          }
        }
      }
      if (!dodged && !this.over) {
        let dmg = 1 + jiuBonus;
        if (p.luoyi) { dmg += 1; this.log('【裸衣】：【杀】伤害+1'); }
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
            // 官方规则：由使用者选择弃置对手的两张牌（手牌暗抽一张，装备区可指定）
            const cards = [];
            while (cards.length < 2 && !this.over) {
              const options = [];
              if (opp.hand.length > 0) options.push('hand');
              if (Object.values(opp.equips).some(Boolean)) options.push('equip');
              if (options.length === 0) break;
              let area = options[0];
              if (options.length === 2) {
                const am = await this.askPlayer(p, {
                  playerIdx: p.idx, type: 'choose',
                  playable: [{ kind: 'chooseArea', area: 'hand' }, { kind: 'chooseArea', area: 'equip' }],
                  context: { question: `【寒冰剑】已发动：选择弃置${opp.general}的手牌（暗抽）或装备（第${cards.length + 1}张）？`, options: ['手牌', '装备'] },
                });
                if (am && am.kind === 'chooseArea' && options.includes(am.area)) area = am.area;
              }
              let picked = null;
              if (area === 'hand') {
                picked = opp.hand[Math.floor(this.rng() * opp.hand.length)];
              } else {
                picked = await this.askPick(p, Object.values(opp.equips).filter(Boolean), `【寒冰剑】：选择${opp.general}的装备（第${cards.length + 1}张）`);
              }
              if (!picked) break;
              if (area === 'equip') {
                for (const [k, v] of Object.entries(opp.equips)) if (v === picked) opp.equips[k] = null;
                this.onLoseEquip(opp, picked);
              } else {
                opp.hand = opp.hand.filter(x => x !== picked);
              }
              cards.push(picked);
            }
            this.toDiscard(cards);
            this.log(cards.length > 0
              ? `${p.general} 发动【寒冰剑】，弃置${opp.general}的${cards.map(cardName).join('、')}`
              : `${p.general} 发动【寒冰剑】，但对手没有可弃置的牌`);
            await this.lianyingCheck(opp);
            await this.flushYingji();
            await this.lianyingCheck(p);
            this.discardSha(card, extras);
            this.emitState(); return;
          }
        }
        await this.dealDamage(opp, dmg, { source: p, card, pierceArmor: pierce, nature: isFire ? '火' : isThunder ? '雷' : '普通' });
        // 麒麟弓：命中后可弃目标一匹坐骑（官方规则：由使用者选择弃哪匹）
        if (!this.over && p.equips.weapon && p.equips.weapon.name === '麒麟弓') {
          const horses = [opp.equips.horsePlus, opp.equips.horseMinus].filter(Boolean);
          if (horses.length > 0) {
            const decision = {
              playerIdx: p.idx, type: 'skill_ask', skill: '麒麟弓',
              playable: horses.map(h => ({ kind: 'activate', skill: '麒麟弓', cardId: h.id }))
                .concat([{ kind: 'skip', skill: '麒麟弓' }]),
              context: { question: '是否发动【麒麟弓】弃置目标的一匹坐骑？（选“发动”=弃置对应的坐骑）' },
            };
            const m = await this.askPlayer(p, decision);
            if (m && m.kind === 'activate') {
              const horse = horses.find(h => h.id === m.cardId) || horses[0];
              if (opp.equips.horsePlus === horse) opp.equips.horsePlus = null; else opp.equips.horseMinus = null;
              this.onLoseEquip(opp, horse); // 白银狮子回血/枭姬入队（若适用）
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
      await this.flushYingji();
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
      if (old) { this.onLoseEquip(p, old); this.toDiscard(old); }
      p.equips[slot] = card;
      this.log(`${p.general} 装备${cardName(card)}${old ? `（替换${old.name}）` : ''}`);
      return;
    }

    // —— 锦囊（含奇袭/武圣/国色等转化） ——
    if (card.category === '锦囊牌' || card.category === '延时锦囊' || useAs !== card.name) {
      const t = (move.targets && move.targets.length && move.targets[0] !== p.idx) ? this.players[move.targets[0]] : this.other(p);
      await this.useTrick(p, card, useAs, t);
      await this.flushYingji();
      return;
    }
    this.toDiscard(card);
    await this.flushYingji();
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
    for (const [k, v] of Object.entries(p.equips)) if (cards.includes(v)) { p.equips[k] = null; this.onLoseEquip(p, v); }
  }
  takeFromOpp(opp, n) {
    const taken = [];
    for (let i = 0; i < n; i++) {
      const equips = Object.values(opp.equips).filter(Boolean);
      if (equips.length > 0) {
        const e = equips[0];
        for (const [k, v] of Object.entries(opp.equips)) if (v === e) opp.equips[k] = null;
        this.onLoseEquip(opp, e);
        taken.push(e);
      } else if (opp.hand.length > 0) {
        const c = opp.hand[Math.floor(this.rng() * opp.hand.length)];
        opp.hand = opp.hand.filter(x => x !== c);
        taken.push(c);
      } else break;
    }
    return taken;
  }

  // 无懈询问（护friend版）：被影响者与其同阵营存活队友依次可打无懈（1v1即仅被影响者）
  async askWuxieProtect(q, name) {
    const mates = [q, ...this.others(q).filter(o => this.mode === 'ddd' && q.role && o.role === q.role)];
    for (const w of mates) {
      if (await this.askWuxie(w, name)) return true;
    }
    return false;
  }
  // 无懈询问（敌对版）： beneficial 锦囊（桃园/五谷）对该角色生效前，其敌对方依次可打无懈
  async askWuxieEnemy(q, name) {
    for (const w of this.others(q)) {
      if (await this.askWuxie(w, name)) return true;
    }
    return false;
  }

  async useTrick(p, card, useAs, target) {
    const opp = target || this.other(p); // 单目标锦囊的目标（AOE分支忽略）
    const name = useAs;
    this.log(`${p.general} 使用【${name}】${useAs !== card.name ? `（${cardName(card)}转化）` : ''}`);
    // 集智：官方规则只在使用【普通锦囊牌】时触发，延时锦囊（乐不思蜀/闪电等）不算
    if (p.skills.includes('集智') && card.category === '锦囊牌') {
      const decision = {
        playerIdx: p.idx, type: 'skill_ask', skill: '集智',
        playable: [{ kind: 'activate', skill: '集智' }, { kind: 'skip', skill: '集智' }],
        context: { question: '是否发动【集智】摸一张牌？' },
      };
      const m = await this.askPlayer(p, decision);
      if (m && m.kind === 'activate') { const n = this.draw(p, 1); this.log(`${p.general} 发动【集智】摸${n}张牌`); }
    }
    // 延时锦囊直接进判定区（国色等转化来的【乐不思蜀】同样走这里；无懈在判定结算前询问）
    if (useAs === '闪电' || useAs === '乐不思蜀' || useAs === '兵粮寸断') {
      if (name === '闪电') p.judge.push(card); else opp.judge.push(card);
      this.log(`【${name}】置于${name === '闪电' ? p.general : opp.general}的判定区`);
      return;
    }
    // 无懈可击（MVP：单目标锦囊询问被影响者及其队友，不追连锁）
    // 多目标锦囊（桃园结义/五谷丰登）：无懈只能抵消对一名角色的效果，逐目标结算见各case
    const isMultiTarget = name === '桃园结义' || name === '五谷丰登' || name === '万箭齐发' || name === '南蛮入侵';
    if (!isMultiTarget && await this.askWuxieProtect(opp, name)) { this.toDiscard(card); return; }

    switch (name) {
      case '无中生有': {
        const n = this.draw(p, 2); this.log(`${p.general} 摸${n}张牌`); break;
      }
      case '桃园结义': {
        for (const q of this.alivePlayers()) {
          if (this.over || this.aborted) break;
          if (q.hp >= q.maxHp) { this.log(`${q.general} 体力已满，无回复`); continue; }
          // 官方规则：无懈可击抵消【桃园结义】对该角色的效果（由敌对方询问）
          if (await this.askWuxieEnemy(q, '桃园结义')) {
            this.log(`【无懈可击】抵消了【桃园结义】对${q.general}的效果`);
            continue;
          }
          const b = q.hp;
          q.hp++;
          this.log(`${q.general} 回复1点体力（${b}→${q.hp}/${q.maxHp}）`);
        }
        break;
      }
      case '五谷丰登': {
        const alive = this.alivePlayers();
        const revealed = [];
        for (let i = 0; i < alive.length; i++) { const c = this.drawOne(); if (c) revealed.push(c); }
        revealed.forEach(c => this.limbo.add(c));
        this.log(`五谷丰登展示：${revealed.map(cardName).join('、') || '无'}`);
        if (revealed.length === 0) break;
        // 官方规则：使用者先选，其余角色按顺序拿剩下的牌；
        // 无懈可击可抵消【五谷丰登】对某个角色的效果（该角色不参与拿牌）
        for (const q of this.seatOrderFrom(p.idx)) {
          if (revealed.length === 0) break;
          if (await this.askWuxieEnemy(q, '五谷丰登')) {
            this.log(`【无懈可击】抵消了【五谷丰登】对${q.general}的效果`);
            continue;
          }
          const decision = {
            playerIdx: q.idx, type: 'choose',
            playable: revealed.map(c => ({ kind: 'chooseCard', cardId: c.id })),
            optionCards: revealed,
            context: { question: '五谷丰登：请选一张牌获得' },
          };
          const m = await this.askPlayer(q, decision);
          const picked = (m && m.kind === 'chooseCard' && revealed.find(c => c.id === m.cardId)) || revealed[0];
          revealed.splice(revealed.indexOf(picked), 1);
          this.limbo.delete(picked);
          q.hand.push(picked);
          this.log(`${q.general} 获得${cardName(picked)}`);
        }
        if (revealed.length > 0) { // 所有效果被抵消时，剩下的展示牌进弃牌堆
          this.toDiscard(revealed);
          revealed.forEach(c => this.limbo.delete(c));
          this.log(`无人获得的展示牌进弃牌堆：${revealed.map(cardName).join('、')}`);
        }
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
            const d = otherSide.luoyi ? 2 : 1; // 裸衣：决斗伤害+1（伤害来源是决斗使用者）
            if (otherSide.luoyi) this.log('【裸衣】：【决斗】伤害+1');
            await this.dealDamage(asker, d, { source: otherSide, card });
            break;
          }
          [asker, otherSide] = [otherSide, asker];
        }
        break;
      }
      case '南蛮入侵': {
        for (const t of this.others(p)) {
          if (this.over || this.aborted) break;
          if (t.equips.armor && t.equips.armor.name === '藤甲') { this.log(`藤甲：南蛮入侵对${t.general}无效`); continue; }
          if (await this.askWuxieProtect(t, '南蛮入侵')) { this.log(`【无懈可击】抵消了【南蛮入侵】对${t.general}的效果`); continue; }
          const ok = await this.askPlaySha(t, p, '南蛮入侵');
          if (!ok) await this.dealDamage(t, 1, { source: p, card });
        }
        break;
      }
      case '万箭齐发': {
        for (const t of this.others(p)) {
          if (this.over || this.aborted) break;
          if (t.equips.armor && t.equips.armor.name === '藤甲') { this.log(`藤甲：万箭齐发对${t.general}无效`); continue; }
          if (await this.askWuxieProtect(t, '万箭齐发')) { this.log(`【无懈可击】抵消了【万箭齐发】对${t.general}的效果`); continue; }
          const ok = await this.askDodge(p, t, 0, 1, '万箭齐发');
          if (!ok) await this.dealDamage(t, 1, { source: p, card });
        }
        break;
      }
      case '火攻': {
        if (opp.hand.length === 0) { this.log(`${opp.general}无手牌，火攻无效果`); break; }
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
            context: { question: `是否弃置一张${shown.suit}手牌，对${opp.general}造成1点火焰伤害？` },
          };
          const m2 = await this.askPlayer(p, decision2);
          if (m2 && m2.kind === 'activate' && this.inHand(p, m2.cardId)) {
            const bc = this.inHand(p, m2.cardId);
            p.hand = p.hand.filter(c => c !== bc);
            this.toDiscard(bc);
            // 官方规则：藤甲=受到的火焰伤害+1（对火攻同样生效）
            const dmg = opp.equips.armor && opp.equips.armor.name === '藤甲' ? 2 : 1;
            if (dmg === 2) this.log('藤甲：火焰伤害+1');
            await this.dealDamage(opp, dmg, { source: p, card, nature: '火' });
          }
        } else this.log(`${p.general} 无同花色手牌，无法火攻`);
        break;
      }
      case '过河拆桥': case '顺手牵羊': {
        if (!this.hasCards(opp)) break;
        const area = await this.askArea(p, opp, name);
        let targetCard = null;
        if (area == null) break; // 对手无可拿的区域（顺手牵羊拿不到判定区）
        if (area === 'hand') {
          if (opp.hand.length > 0) {
            targetCard = opp.hand[Math.floor(this.rng() * opp.hand.length)];
            opp.hand = opp.hand.filter(c => c !== targetCard);
          }
        } else if (area === 'equip') {
          const equips = Object.values(opp.equips).filter(Boolean);
          targetCard = await this.askPick(p, equips, `${name}：选择${opp.general}的装备`);
          if (targetCard) {
            for (const [k, v] of Object.entries(opp.equips)) if (v === targetCard) opp.equips[k] = null;
            this.onLoseEquip(opp, targetCard);
          }
        } else if (area === 'judge') {
          targetCard = await this.askPick(p, opp.judge, `${name}：选择${opp.general}判定区的牌`);
          if (targetCard) opp.judge = opp.judge.filter(c => c !== targetCard);
        }
        if (targetCard) {
          if (name === '过河拆桥') { this.toDiscard(targetCard); this.log(`${p.general} 弃置${opp.general}的${cardName(targetCard)}`); }
          else { p.hand.push(targetCard); this.log(`${p.general} 获得${opp.general}的${cardName(targetCard)}`); }
        }
        break;
      }
      case '借刀杀人': {
        const holder = opp; // 武器持有者
        const weapon = holder.equips.weapon;
        if (!weapon) break;
        // 借刀人指定被杀的目标（1v1即借刀人自己；斗地主可指定除武器持有者外的任意存活角色）
        let victim = p;
        if (this.isDdd) {
          const cands = this.alivePlayers().filter(q => q !== holder);
          victim = await this.askChoosePlayer(p, cands, '【借刀杀人】指定其对谁使用【杀】？') || p;
        }
        // 可打出的杀：手牌本杀/龙胆闪 + 武圣红色牌（含装备区）
        const shaSources = holder.hand.filter(c => c.name === '杀'
          || (holder.skills.includes('武圣') && isRed(c) && c.name !== '杀')
          || (holder.skills.includes('龙胆') && c.name === '闪'))
          .concat(holder.skills.includes('武圣')
            ? Object.values(holder.equips).filter(c => c && isRed(c))
            : []);
        if (shaSources.length === 0 || this.kongcheng(victim)) {
          // 官方规则：目标无【杀】可打出，必须将武器交给借刀人（引擎强制结算）；
          // 被指定的目标空城时被借的【杀】不能指定他，同样强制交刀
          holder.equips.weapon = null;
          p.hand.push(weapon);
          this.log(this.kongcheng(victim)
            ? `${victim.general} 空城不能成为【杀】的目标，${holder.general} 将${horseName(weapon)}交给${p.general}`
            : `${holder.general} 无【杀】可出，将${horseName(weapon)}交给${p.general}`);
          break;
        }
        const decision = {
          playerIdx: holder.idx, type: 'daodao',
          playable: shaSources.map(c => ({ kind: 'daodao_sha', cardId: c.id, useAs: c.name === '杀' ? null : '杀' }))
            .concat([{ kind: 'daodao_give' }]),
          context: { question: `借刀杀人：打出【杀】（对${victim.general}），或将${horseName(weapon)}交给${p.general}？` },
        };
        const m = await this.askPlayer(holder, decision);
        if (m && m.kind === 'daodao_sha') {
          const sha = this.takeCard(holder, m.cardId); // 手牌或装备区（武圣转化）
          if (sha) {
            // 官方规则：借刀令目标对借刀人使用【杀】=正常使用，完整结算
            // （无双两闪、朱雀火杀、仁王盾、藤甲、寒冰/麒麟/古锭/雌雄/贯石斧等全部生效）
            await this.resolveSha(holder, victim, sha);
          } else {
            // 来源牌异常：回退为交武器
            holder.equips.weapon = null;
            p.hand.push(weapon);
            this.log(`${holder.general} 将${horseName(weapon)}交给${p.general}`);
          }
        } else {
          holder.equips.weapon = null;
          p.hand.push(weapon);
          this.log(`${holder.general} 将${horseName(weapon)}交给${p.general}`);
        }
        break;
      }
    }
    if (!this.cardTaken) this.toDiscard(card);
    this.cardTaken = false;
  }

  // ---------- 响应类询问 ----------
  async askDodge(user, target, attempt, need, reason) {
    // 八卦阵（可选判定：先询问是否发动，拒绝则直接进入手牌【闪】询问；青釭剑无视防具）
    const pierce = user && user.equips.weapon && user.equips.weapon.name === '青釭剑';
    if (!pierce && target.equips.armor && target.equips.armor.name === '八卦阵' && this.drawPile.length + this.discardPile.length > 0) {
      const decision = {
        playerIdx: target.idx, type: 'skill_ask', skill: '八卦阵',
        playable: [{ kind: 'activate', skill: '八卦阵' }, { kind: 'skip', skill: '八卦阵' }],
        context: { question: `是否发动【八卦阵】进行判定（红色视为打出【闪】响应${reason}）？` },
      };
      const m = await this.askPlayer(target, decision);
      if (m && m.kind === 'activate') {
        const jc0 = this.drawOne();
        if (jc0) {
          this.log(`${target.general} 发动【八卦阵】判定：${cardName(jc0)}`);
          const mod = await this.guicai(target, jc0);
          const jc = mod || jc0;
          if (isRed(jc)) this.log('八卦阵判定成功，视为使用【闪】');
          else this.log('八卦阵判定失败');
          // 天妒（可选技）：判定牌生效后询问是否获得之
          if (target.skills.includes('天妒') && !this.over && !this.aborted) {
            const tm = await this.askPlayer(target, {
              playerIdx: target.idx, type: 'skill_ask', skill: '天妒',
              playable: [{ kind: 'activate', skill: '天妒' }, { kind: 'skip', skill: '天妒' }],
              context: { question: `是否发动【天妒】获得判定牌${cardName(jc)}？` },
            });
            if (tm && tm.kind === 'activate') {
              target.hand.push(jc);
              this.log(`${target.general} 发动【天妒】，获得判定牌${cardName(jc)}`);
            } else this.toDiscard(jc);
          } else this.toDiscard(jc);
          if (isRed(jc)) return true;
        }
      }
    }
    const shans = target.hand.filter(c => c.name === '闪');
    const longdan = target.skills.includes('龙胆') ? target.hand.filter(c => c.name === '杀') : [];
    const qingguo = target.skills.includes('倾国') ? target.hand.filter(c => isBlack(c) && c.name !== '闪') : [];
    const playable = shans.map(c => ({ kind: 'respond', cardId: c.id }))
      .concat(longdan.map(c => ({ kind: 'respond', cardId: c.id, useAs: '闪' })))
      .concat(qingguo.map(c => ({ kind: 'respond', cardId: c.id, useAs: '闪' })))
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
        this.log(`${target.general} 使用${move.useAs && card.name !== move.useAs ? `【${move.useAs}】（${cardName(card)}转化）` : cardName(card)}抵消${reason}`);
        await this.lianyingCheck(target);
        return true;
      }
    }
    this.log(`${target.general} 不响应${reason}`);
    return false;
  }

  async askPlaySha(responder, user, reason) {
    const shas = responder.hand.filter(c => c.name === '杀');
    // 武圣：红色牌含装备区
    const wusheng = responder.skills.includes('武圣')
      ? responder.hand.filter(c => isRed(c) && c.name !== '杀')
        .concat(Object.values(responder.equips).filter(c => c && isRed(c)))
      : [];
    const longdan = responder.skills.includes('龙胆') ? responder.hand.filter(c => c.name === '闪') : [];
    const playable = shas.map(c => ({ kind: 'respond', cardId: c.id }))
      .concat(wusheng.map(c => ({ kind: 'respond', cardId: c.id, useAs: '杀' })))
      .concat(longdan.map(c => ({ kind: 'respond', cardId: c.id, useAs: '杀' })))
      .concat([{ kind: 'refuse' }]);
    const decision = { playerIdx: responder.idx, type: 'respond_nanman', playable, context: { reason, attacker: user.general } };
    const move = await this.askPlayer(responder, decision);
    if (move && move.kind === 'respond') {
      const card = this.takeCard(responder, move.cardId);
      if (card) {
        this.toDiscard(card);
        responder.shaActed = true; // 克己：打出【杀】也计入
        this.log(`${responder.general} 打出【杀】${move.useAs && card.name !== '杀' ? `（${cardName(card)}${card.equip ? '（装备区）' : ''}转化）` : ''}响应${reason}`);
        await this.lianyingCheck(responder);
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
        await this.lianyingCheck(target);
        // 官方规则：集智在使用普通锦囊牌时触发，无懈可击（含回合外响应）也算使用
        if (target.skills.includes('集智')) {
          const zj = {
            playerIdx: target.idx, type: 'skill_ask', skill: '集智',
            playable: [{ kind: 'activate', skill: '集智' }, { kind: 'skip', skill: '集智' }],
            context: { question: '是否发动【集智】摸一张牌？' },
          };
          const m2 = await this.askPlayer(target, zj);
          if (m2 && m2.kind === 'activate') { const n = this.draw(target, 1); this.log(`${target.general} 发动【集智】摸${n}张牌`); }
        }
        return true;
      }
    }
    return false;
  }

  async askArea(p, opp, name) {
    const options = [];
    // 官方规则：过河拆桥/顺手牵羊都可处置目标区域内任一牌（手牌/装备/判定区）
    if (opp.hand.length > 0) options.push('hand');
    if (Object.values(opp.equips).some(Boolean)) options.push('equip');
    if (opp.judge.length > 0) options.push('judge');
    if (options.length === 0) return null; // 兜底：对手区域内没有任何牌
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
  // 选目标：从候选角色中选择一名（choice=座位号字符串）；取消返回null（仅当允许跳过）
  async askChoosePlayer(p, candidates, question) {
    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0];
    const m = await this.askPlayer(p, {
      playerIdx: p.idx, type: 'choose',
      playable: candidates.map(q => ({ kind: 'choice', value: String(q.idx) })),
      context: { question, options: candidates.map(q => q.general) },
    });
    const idx = (m && m.kind === 'choice') ? parseInt(m.value, 10) : NaN;
    return candidates.find(q => q.idx === idx) || candidates[0];
  }
  async askPlayer(p, decision) {
    // 思考时间优化：没有选择余地的决策不询问，本地直接执行（求闪无闪→不响应、无可出牌→结束等）
    // 例外：discard（playable唯一但真实选择是"弃哪张"）、guanxing（唯一playable但真实选择是分配方案）
    if (decision.playable.length === 1 && !['discard', 'guanxing'].includes(decision.playable[0].kind)) {
      return decision.playable[0];
    }
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
        && (action.value === undefined || x.value === action.value)
        && (action.suit === undefined || x.suit === action.suit)
        && (action.skill === undefined || (x.skill || null) === (action.skill || null))
        // 多目标（斗地主）：指定了targets就必须精确到该目标，不得取第一个同牌动作
        && (action.targets === undefined || (Array.isArray(x.targets) && JSON.stringify(x.targets) === JSON.stringify(action.targets.map(Number)))));
      if (!m) return null;
      if (m.kind === 'discard') return { kind: 'discard', cardIds: (action.cardIds || []).slice() };
      if (m.kind === 'skill_zhiheng') return { kind: 'skill_zhiheng', cardIds: (action.cardIds || []).slice() };
      // 丈八组合：两手牌必须都在引擎计算的合法池内且互不相同（兜底校验）
      if (m.kind === 'sha_combo') {
        const ids = (action.cardIds || []).map(Number);
        const pool = m.cardIds || [];
        return (ids.length === 2 && ids[0] !== ids[1] && ids.every(id => pool.includes(id)))
          ? { kind: 'sha_combo', cardIds: ids, targets: m.targets ? [...m.targets] : undefined } : null;
      }
      // 观星一次性分配：tops/bottoms 数组合法性由 guanxing() 校验
      if (m.kind === 'guanxing') return { kind: 'guanxing', tops: (action.tops || []).slice(), bottoms: (action.bottoms || []).slice() };
      return m;
    }
    // AI的JSON动作
    switch (action.action) {
      case 'end': return playable.find(m => m.kind === 'end') || null;
      case 'guanxing': {
        const m = playable.find(x => x.kind === 'guanxing');
        if (!m) return null;
        const map = (arr) => (arr || []).map(byLabel).filter(x => x != null);
        return { kind: 'guanxing', tops: map(action.tops), bottoms: map(action.bottoms) };
      }
      case 'refuse': return playable.find(m => m.kind === 'refuse') || null;
      case 'skip': return playable.find(m => m.kind === 'skip' && (!action.skill || !decision.skill || m.skill === action.skill)) || null;
      case 'play': case 'respond': {
        const id = byLabel(action.card);
        const kind = action.action === 'play' ? 'play' : 'respond';
        const cands = playable.filter(m => m.kind === kind && m.cardId === id
          && (!m.useAs || !action.useAs || m.useAs === action.useAs));
        if (cands.length === 0) return null;
        // 目标匹配（斗地主多目标）：targets填武将名/'自己'；未写目标且候选唯一时直取
        const want = (action.targets || []).map(x => {
          if (x === '自己' || x === 'self') return decision.playerIdx;
          const q = this.players.find(pl => pl && pl.general === x);
          if (q) return q.idx;
          const n = parseInt(x, 10);
          return Number.isNaN(n) ? null : n;
        }).filter(x => x != null).sort((a, b) => a - b);
        if (cands.length === 1 && want.length === 0) return cands[0];
        return cands.find(m => {
          const mt = [...(m.targets || [])].sort((a, b) => a - b);
          return mt.length === want.length && mt.every((v, i) => v === want[i]);
        }) || null;
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
          return playable.find(m => (m.kind === 'chooseArea' && m.area === action.choice)
            || (m.kind === 'choice' && m.value === action.choice)) || null;
        }
        return null;
      }
      case 'skill': {
        if (action.skill === '制衡') {
          const m = playable.find(mv => mv.kind === 'skill_zhiheng');
          if (!m) return null;
          return { kind: 'skill_zhiheng', cardIds: (action.cards || []).map(byLabel).filter(x => x != null) };
        }
        if (action.skill === '反间') {
          return playable.find(mv => mv.kind === 'skill_fanjian') || null;
        }
        return null;
      }
      case 'fanjian_suit':
        return playable.find(m => m.kind === 'fanjian_suit' && m.suit === action.suit) || null;
      case 'activate': {
        if (action.card != null) {
          const id = byLabel(action.card);
          return playable.find(m => m.kind === 'activate' && m.cardId === id) || null;
        }
        return playable.find(m => m.kind === 'activate' && (!action.skill || !m.skill || m.skill === action.skill)) || null;
      }
      case 'daodao_sha': {
        if (action.card != null) {
          const id = byLabel(action.card);
          return playable.find(m => m.kind === 'daodao_sha' && m.cardId === id) || null;
        }
        return playable.find(m => m.kind === 'daodao_sha' && !m.useAs) || playable.find(m => m.kind === 'daodao_sha') || null;
      }
      case 'daodao_give': return playable.find(m => m.kind === 'daodao_give') || null;
      case 'sha_combo': {
        const combo = playable.find(m => m.kind === 'sha_combo');
        if (!combo) return null;
        const ids = (action.cards || []).map(byLabel).filter(x => x != null);
        const pool = combo.cardIds || [];
        return (ids.length === 2 && ids[0] !== ids[1] && ids.every(id => pool.includes(id)))
          ? { kind: 'sha_combo', cardIds: ids } : null;
      }
      default: return null;
    }
  }

  // ---------- 局面渲染（半结构化Markdown，发给AI/记录） ----------
  renderState(p, decision, retryInfo) {
    const opp = this.other(p);
    const L = [];
    L.push(`# 决策请求 #${++this.decisionNo}`);
    // 选将：局面尚未成立，只渲染自己的候选武将（对方候选保密）
    if (decision.type === 'xuanjiang') {
      L.push('**决策类型**: xuanjiang');
      L.push('');
      L.push('## 选将阶段');
      L.push('对局尚未开始：请从你的三名候选武将中选择一名出战（`{"action":"choose","choice":"武将名"}`）。');
      L.push(`本局你是**${this.first === p.idx ? '先手' : '后手'}**${this.first === p.idx ? '（先手第一回合摸牌阶段少摸一张）' : ''}。`);
      L.push('');
      L.push('## 候选武将');
      for (const n of (decision.context.candidates || [])) {
        const g = GENERALS[n];
        L.push(`- **${n}**（${g.hp}体力）：${g.skills.map(s => `${s}（${SKILL_TEXTS[s] || ''}）`).join('；')}`);
      }
      return L.join('\n');
    }
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
    // 引擎计算的逐牌可出性：牌出现在合法动作的cardId/组合池中=可出（唯一事实来源）
    const usableIds = new Set();
    if (decision.type === 'play' || decision.type === 'respond_sha' || decision.type === 'respond_nanman' || decision.type === 'daodao') {
      for (const m of decision.playable) {
        if (m.cardId != null) usableIds.add(m.cardId);
        if (m.kind === 'sha_combo' && m.cardIds) for (const id of m.cardIds) usableIds.add(id);
      }
    }
    const mark = (c) => usableIds.size === 0 ? '' : (usableIds.has(c.id) ? '✓' : '—');
    const table = ['| 编号 | 牌名 | 花色点数 | 类型 | 可出 |', '|---|---|---|---|---|'];
    p.hand.slice().sort((a, b) => a.id - b.id).forEach((c, i) => {
      const label = `#${i + 1}`;
      decision.labelMap[label] = c.id;
      table.push(`| ${label} | ${c.name}${c.subtype && c.subtype !== '普通杀' ? '(' + c.subtype + ')' : ''} | ${c.suit}${c.rank} | ${c.category}${c.equip ? '(' + c.equip + ')' : ''} | ${mark(c)} |`);
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
    L.push(this.isDdd ? '## 其他角色状态' : '## 对手状态');
    for (const q of this.others(p)) {
      L.push(`### ${q.general}${q.role ? `（${q.role}）` : ''}`);
      L.push(`- 武将: **${q.general}**（体力 ${Math.max(q.hp, 0)}/${q.maxHp}）${q.dead ? '（已阵亡）' : ''}`);
      L.push('- 技能:');
      for (const s of q.skills) L.push(`  - **${s}**：${SKILL_TEXTS[s]}`);
      L.push(`- 装备: 武器-${eq(q.equips.weapon)} | 防具-${eq(q.equips.armor)} | +1马-${eq(q.equips.horsePlus)} | -1马-${eq(q.equips.horseMinus)}`);
      L.push(`- 判定区: ${q.judge.map(cardName).join('、') || '无'}`);
      L.push(`- 手牌: ${q.hand.length}张（不可见）`);
      if (this.isDdd) L.push(`- 你到他的距离: ${this.distance(p, q)}`);
    }
    L.push('');
    L.push('## 公共信息');
    if (this.mode === 'ddd') {
      L.push(`- 模式: 斗地主（3人）——你的身份: ${p.role}；击败所有敌方阵营者获胜`);
      L.push(`- 身份: ${this.players.map(q => `${q.general}=${q.role}${q.dead ? '(阵亡)' : ''}`).join('，')}`);
    }
    L.push(`- 回合: 第${this.turnNo}回合（${this.turnPlayer === p ? '你的' : `${this.turnPlayer ? this.turnPlayer.general : ''}的`}回合，${this.phase || ''}阶段）`);
    if (!this.isDdd) L.push(`- 距离: 你→对手 ${this.distance(p, opp)}；你的攻击范围 ${this.attackRange(p)}`);
    else L.push(`- 你的攻击范围: ${this.attackRange(p)}（距离见各角色信息）`);
    if (decision.type === 'play') {
      const parts = [`杀 ${p.shaUsed}${this.shaUnlimited(p) ? '（无限制）' : '/1'}`, `酒 ${p.jiuUsed}/1`];
      if (p.skills.includes('制衡')) parts.push(`制衡 ${p.zhihengUsed ? '已用' : '未用'}`);
      if (p.skills.includes('反间')) parts.push(`反间 ${p.fanjianUsed ? '已用' : '未用'}`);
      if (p.skills.includes('结姻')) parts.push(`结姻 ${p.jieyinUsed ? '已用' : '未用'}`);
      if (p.skills.includes('青囊')) parts.push(`青囊 ${p.qingnangUsed ? '已用' : '未用'}`);
      if (p.skills.includes('苦肉')) parts.push('苦肉 无次数限制');
      if (p.skills.includes('仁德')) parts.push(`仁德 已给${p.rendeGiven || 0}张${p.rendeHealed ? '（已回血）' : ''}`);
      if (p.luoyi) L.push('- 你已发动【裸衣】：本回合你的【杀】/【决斗】伤害+1');
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
      case 'guanxing': return `\`guanxing\` 为观星亮出的每张牌指定位置（JSON: tops=置于牌堆顶的编号数组, bottoms=置于牌堆底的编号数组，两数组必须恰好包含所有亮出的牌）`;
      case 'skill_zhiheng': return '`skill` 发动【制衡】（JSON: skill=制衡, cards=要弃的编号数组）';
      case 'skill_fanjian': return '`skill` 发动【反间】（JSON: skill=反间；令对手选花色，你交一张手牌展示）';
      case 'fanjian_suit': return `\`fanjian_suit\` 选择花色 ${m.suit}`;
      case 'sha_combo': return '`sha_combo` 发动【丈八蛇矛】：任意两张手牌当【杀】（JSON: cards=两个编号数组）';
      case 'choice': return `\`choose\` 选择 ${m.value}`;
      case 'activate': return `\`activate\` 发动【${m.skill}】${m.cardId != null ? `（card: ${this.desc(m.cardId, decision)}）` : ''}`;
      case 'skip': return `\`skip\` 不发动【${m.skill}】`;
      case 'daodao_sha': return `\`daodao_sha\` 打出【杀】（card: ${this.desc(m.cardId, decision)}）对借刀者`;
      case 'daodao_give': return '`daodao_give` 将武器交给借刀者';
      default: return '`?` ' + m.kind;
    }
  }
}

function horseName(c) { return `【${c.name}】`; }

module.exports = { Game, GENERALS, SKILL_TEXTS, DISCARD_MEMORY };
