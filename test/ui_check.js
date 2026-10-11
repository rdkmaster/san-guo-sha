// UI结构验证：动态注入mock state，jsdom断言（角标/牌背/马标签/尺寸样式）
// 运行: node test/ui_check.js
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

(async () => {
  let html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf-8');
  const i = html.indexOf('const es = new EventSource');
  const j = html.indexOf('function addLog');
  if (i < 0 || j < 0) { console.log('✗ 找不到SSE块锚点'); process.exit(1); }
  const mock = `
state = {
  over: false, turnNo: 5, phase: '出牌', turnPlayer: 0, drawPileCount: 100,
  players: [
    { general:'黄月英', kingdom:'蜀', hp:3, maxHp:3, handCount:4,
      equips:{weapon:{name:'贯石斧',suit:'♦',rank:'5'}, armor:{name:'仁王盾',suit:'♣',rank:'2'}, horsePlus:{name:'大宛',suit:'♠',rank:'K'}, horseMinus:{name:'赤兔',suit:'♥',rank:'5'}},
      judge:[], skills:[{name:'集智',text:'x'}] },
    { general:'关羽', kingdom:'蜀', hp:4, maxHp:4, handCount:3,
      equips:{weapon:null,armor:null,horsePlus:null,horseMinus:null}, judge:[], skills:[{name:'武圣',text:'x'}] },
  ],
  aiHand: [ {id:11,name:'杀',suit:'♣',rank:'6',subtype:'普通杀',image:'素材/牌/杀.png'} ],
  discardPile: [], discardTotal: 0, log: [], logSeq: 0,
};
state.ownHand = [
  {id:1,name:'杀',suit:'♦',rank:'7',subtype:'普通杀',image:'素材/牌/杀.png'},
  {id:2,name:'无中生有',suit:'♥',rank:'J',subtype:'锦囊牌',image:'素材/牌/无中生有.png'},
  {id:3,name:'贯石斧',suit:'♦',rank:'5',subtype:'装备牌',image:'素材/牌/贯石斧.png'},
  {id:4,name:'闪',suit:'♥',rank:'2',subtype:null},
  {id:5,name:'过河拆桥',suit:'♠',rank:'Q',subtype:'锦囊牌',image:'素材/牌/过河拆桥.png'},
  {id:6,name:'大宛',suit:'♠',rank:'K',subtype:null,category:'装备牌',equip:'坐骑+1'},
];
prevHandIds = null;
render();
renderHand1();
`;
  html = html.slice(0, i) + mock + html.slice(j);

  const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'http://localhost/' });
  const doc = dom.window.document;
  let failed = 0;
  const ok = (name, cond) => { console.log((cond ? '✓' : '✗') + ' ' + name); if (!cond) failed++; };

  const cards = doc.querySelectorAll('#hand0 .card');
  ok(`手牌渲染6张 (实际${cards.length})`, cards.length === 6);
  const css = doc.querySelector('style').textContent;
  ok('卡牌尺寸86x120', /\.card \{ width: 86px; height: 120px/.test(css));
  ok('手牌区min-height 128', /min-height: 128px/.test(css));

  const withImg = doc.querySelectorAll('#hand0 .card .corner');
  const cornerTexts = [...withImg].map(e => e.textContent);
  ok(`有图卡牌角标4个: [${cornerTexts.join(', ')}]`, withImg.length === 4 && cornerTexts.join(',') === '♦7,♥J,♦5,♠Q');
  const crRed = doc.querySelector('#hand0 .card .corner.cr');
  ok('红suit角标cr类(♦7)', !!crRed && crRed.textContent === '♦7');
  const cbBlack = doc.querySelector('#hand0 .corner.cb');
  ok('黑suit角标cb类(♠Q)', !!cbBlack && cbBlack.textContent === '♠Q');
  const fb = doc.querySelector('#hand0 .card[data-id="4"] .fallback');
  ok('无图卡fallback含♥2', !!fb && fb.textContent.includes('♥2'));
  const horseNote = doc.querySelector('#hand0 .card[data-id="6"] .tagnote');
  ok('手牌里的马标注+1马', !!horseNote && horseNote.textContent === '+1马');

  const backs = doc.querySelectorAll('#hand1 .card.back');
  ok(`非debug: AI手牌显示3张牌背 (实际${backs.length})`, backs.length === 3);
  ok('牌背样式已定义', /\.card\.back \{ background: repeating-linear-gradient/.test(css));
  const faces = doc.querySelectorAll('#hand1 .card:not(.back)');
  ok('非debug: AI手牌无明牌', faces.length === 0);

  const dbg = doc.getElementById('dbg');
  dbg.checked = true;
  dbg.dispatchEvent(new dom.window.Event('change'));
  const faces2 = doc.querySelectorAll('#hand1 .card:not(.back)');
  ok(`debug: AI手牌亮1张明牌 (实际${faces2.length})`, faces2.length === 1 && faces2[0].textContent.includes('♣6'));

  const bar0 = doc.getElementById('bar0').textContent;
  ok('武器/防具标签', bar0.includes('武器贯石斧♦5') && bar0.includes('防具仁王盾♣2'));
  ok('+1马/-1马区分显示', bar0.includes('+1马大宛♠K') && bar0.includes('-1马赤兔♥5'));

  // ---------- 点选式出牌 ----------
  const w = dom.window;
  w.renderAsk({
    type: 'ask', askId: 1, playerIdx: 0, decisionType: 'play', skill: null,
    question: '你的出牌阶段：请选择要执行的动作',
    options: [
      { kind: 'play', cardId: 1, targets: [1], uiLabel: '使用 【杀♦7】' },
      { kind: 'play', cardId: 5, useAs: '过河拆桥', targets: [1], uiLabel: '使用 【过河拆桥】' },
      { kind: 'end', uiLabel: '结束出牌阶段' },
    ],
  });
  const optsChildren = doc.querySelectorAll('#promptbar .opts > *');
  ok(`备选按钮已隐藏（仅提示+确认容器+结束，实际${optsChildren.length}个元素）`, optsChildren.length === 3);
  ok('结束出牌阶段按钮存在', [...doc.querySelectorAll('#promptbar button')].some(b => b.textContent === '结束出牌阶段'));
  const dimmed = doc.querySelectorAll('#hand0 .card.dimmed');
  ok(`不可出的牌灰化4张 (实际${dimmed.length})`, dimmed.length === 4 && [...dimmed].every(c => ['2','3','4','6'].includes(c.dataset.id)));
  const pickable = doc.querySelectorAll('#hand0 .card.selectable');
  ok(`可出的牌可点选2张 (实际${pickable.length})`, pickable.length === 2 && [...pickable].every(c => ['1','5'].includes(c.dataset.id)));

  // 点选杀 → 确认按钮出现
  doc.querySelector('#hand0 .card[data-id="1"]').click();
  let confirmBtns = [...doc.querySelectorAll('#playconfirm button')];
  ok(`点杀后确认按钮: [${confirmBtns.map(b => b.textContent)}]`, confirmBtns.length === 1 && confirmBtns[0].textContent === '使用 【杀♦7】');

  // 换选拆桥（无组合→单选替换）
  doc.querySelector('#hand0 .card[data-id="5"]').click();
  confirmBtns = [...doc.querySelectorAll('#playconfirm button')];
  ok(`点拆桥后确认按钮替换: [${confirmBtns.map(b => b.textContent)}]`, confirmBtns.length === 1 && confirmBtns[0].textContent === '使用 【过河拆桥】');

  // 确认提交 → promptbar进入已提交状态
  confirmBtns[0].click();
  ok('确认后提交（已提交状态）', doc.querySelector('#promptbar .waiting') !== null);

  // 丈八蛇矛双选流程（新形状：引擎下发sha_combo带合法池cardIds）
  w.renderAsk({
    type: 'ask', askId: 2, playerIdx: 0, decisionType: 'play', skill: null,
    question: '你的出牌阶段：请选择要执行的动作',
    options: [
      { kind: 'play', cardId: 1, targets: [1], uiLabel: '使用 【杀♦7】' },
      { kind: 'sha_combo', cardIds: [1, 2, 3, 4], uiLabel: '丈八蛇矛：两手牌当杀' },
      { kind: 'end', uiLabel: '结束出牌阶段' },
    ],
  });
  ok('丈八池内牌可点、池外不可点（引擎计算唯一事实）',
    [1, 2, 3, 4].every(id => doc.querySelector(`#hand0 .card[data-id="${id}"]`).classList.contains('selectable'))
    && [5, 6].every(id => !doc.querySelector(`#hand0 .card[data-id="${id}"]`).classList.contains('selectable')));
  doc.querySelector('#hand0 .card[data-id="2"]').click();
  ok('丈八只选第一张时无确认按钮', doc.querySelectorAll('#playconfirm button').length === 0);
  doc.querySelector('#hand0 .card[data-id="3"]').click();
  let comboBtns = [...doc.querySelectorAll('#playconfirm button')];
  ok(`两张选齐出现丈八确认: [${comboBtns.map(b => b.textContent)}]`, comboBtns.length === 1 && comboBtns[0].textContent === '丈八蛇矛：两手牌当杀');

  // 池外牌：引擎未纳入合法池 → 不可点、选不齐不出确认（前端不再自行推断）
  w.renderAsk({
    type: 'ask', askId: 3, playerIdx: 0, decisionType: 'play', skill: null,
    question: '你的出牌阶段：请选择要执行的动作',
    options: [
      { kind: 'sha_combo', cardIds: [1, 2], uiLabel: '丈八蛇矛：两手牌当杀' },
      { kind: 'end', uiLabel: '结束出牌阶段' },
    ],
  });
  ok('池外牌不可点', !doc.querySelector('#hand0 .card[data-id="3"]').classList.contains('selectable')
    && doc.querySelector('#hand0 .card[data-id="1"]').classList.contains('selectable'));
  doc.querySelector('#hand0 .card[data-id="1"]').click();
  doc.querySelector('#hand0 .card[data-id="3"]').click();
  ok('选含池外牌无确认按钮', doc.querySelectorAll('#playconfirm button').length === 0);

  // 响应类询问：点选手牌打出（问闪为例）
  w.renderAsk({
    type: 'ask', askId: 4, playerIdx: 0, decisionType: 'respond_sha', skill: null,
    question: '需要响应【杀】',
    options: [
      { kind: 'respond', cardId: 4, uiLabel: '用 【闪♥2】响应' },
      { kind: 'refuse', uiLabel: '不响应' },
    ],
  });
  ok('响应询问：备选按钮隐藏（提示+确认容器+不响应）', doc.querySelectorAll('#promptbar .opts > *').length === 3);
  ok('响应询问：不响应按钮存在', [...doc.querySelectorAll('#promptbar button')].some(b => b.textContent === '不响应'));
  ok('响应询问：仅可响应的牌可点（闪♥2）', doc.querySelector('#hand0 .card[data-id="4"]').classList.contains('selectable')
    && !doc.querySelector('#hand0 .card[data-id="1"]').classList.contains('selectable'));
  ok('响应询问：不可响应的牌灰化', doc.querySelectorAll('#hand0 .card.dimmed').length === 5);
  doc.querySelector('#hand0 .card[data-id="4"]').click();
  const respBtns = [...doc.querySelectorAll('#playconfirm button')];
  ok(`点闪后打出按钮: [${respBtns.map(b => b.textContent)}]`, respBtns.length === 1 && respBtns[0].textContent === '用 【闪♥2】响应');

  // 武圣装备区来源：动作的cardId不在手牌 → 平铺常驻按钮（出牌与响应两种询问）
  w.renderAsk({
    type: 'ask', askId: 5, playerIdx: 0, decisionType: 'play', skill: null,
    question: '你的出牌阶段：请选择要执行的动作',
    options: [
      { kind: 'end', uiLabel: '结束出牌阶段' },
      { kind: 'play', cardId: 99, useAs: '杀', targets: [1], uiLabel: '使用 【赤兔♥5】 当【杀】' },
    ],
  });
  const eqBtns = [...doc.querySelectorAll('#playconfirm button')];
  ok(`装备区转化动作平铺按钮: [${eqBtns.map(b => b.textContent)}]`, eqBtns.length === 1 && eqBtns[0].textContent === '使用 【赤兔♥5】 当【杀】');
  w.renderAsk({
    type: 'ask', askId: 6, playerIdx: 0, decisionType: 'respond_sha', skill: null,
    question: '需要响应【杀】',
    options: [
      { kind: 'respond', cardId: 99, useAs: '杀', uiLabel: '用 【赤兔♥5】 当【杀】响应' },
      { kind: 'refuse', uiLabel: '不响应' },
    ],
  });
  const eqBtns2 = [...doc.querySelectorAll('#playconfirm button')];
  ok(`响应询问的装备区来源按钮: [${eqBtns2.map(b => b.textContent)}]`, eqBtns2.length === 1 && eqBtns2[0].textContent === '用 【赤兔♥5】 当【杀】响应');

  // 制衡多选不受影响
  w.renderAsk({
    type: 'ask', askId: 3, playerIdx: 0, decisionType: 'play', skill: '制衡',
    question: '是否发动【制衡】？', count: 2,
    options: [{ kind: 'skill_zhiheng', uiLabel: '发动【制衡】' }],
  });
  const zhihengPickable = doc.querySelectorAll('#hand0 .card.selectable');
  ok(`制衡仍是全手牌多选 (实际${zhihengPickable.length}张)`, zhihengPickable.length === 6);

  // ---------- 开局选将：头像+信息选项卡 ----------
  w.submitMove = (m) => { w._picked = m; }; // 拦截提交，断言点卡动作
  w.renderAsk({
    type: 'ask', askId: 7, playerIdx: 0, decisionType: 'xuanjiang', skill: null,
    question: '【选将】请从三名候选武将中选择一名出战：刘备 / 郭嘉 / 黄盖',
    options: [
      { kind: 'choice', value: '刘备', uiLabel: '刘备' },
      { kind: 'choice', value: '郭嘉', uiLabel: '郭嘉' },
      { kind: 'choice', value: '黄盖', uiLabel: '黄盖' },
    ],
    candidates: [
      { name: '刘备', hp: 4, kingdom: '蜀', gender: '男', skills: [{ name: '仁德', text: '出牌阶段…' }, { name: '激将', text: '主公技…' }] },
      { name: '郭嘉', hp: 3, kingdom: '魏', gender: '男', skills: [{ name: '天妒', text: '锁定技…' }, { name: '遗计', text: '每受到1点伤害…' }] },
      { name: '黄盖', hp: 4, kingdom: '吴', gender: '男', skills: [{ name: '苦肉', text: '出牌阶段…' }] },
    ],
  });
  const xj = doc.querySelectorAll('#promptbar .xjcard');
  ok(`选将选项卡3张 (实际${xj.length})`, xj.length === 3);
  ok('每张卡带头像（素材/武将/名-头像.png）', doc.querySelectorAll('#promptbar .xjavatar').length === 3
    && [...doc.querySelectorAll('#promptbar .xjavatar')].every(i => i.getAttribute('src').includes('-头像.png')));
  ok('显示体力/势力/技能全文', !!xj[0]
    && xj[0].textContent.includes('❤❤❤❤') && xj[0].textContent.includes('蜀') && xj[0].textContent.includes('仁德')
    && xj[1].textContent.includes('魏') && xj[1].textContent.includes('遗计'));
  xj[1].click();
  ok('点选将卡提交对应choice动作', w._picked && w._picked.kind === 'choice' && w._picked.value === '郭嘉');

  console.log(failed ? `${failed}项失败` : 'UI结构验证全部通过');
  process.exit(failed ? 1 : 0);
})();
