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
  ok(`手牌渲染5张 (实际${cards.length})`, cards.length === 5);
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

  console.log(failed ? `${failed}项失败` : 'UI结构验证全部通过');
  process.exit(failed ? 1 : 0);
})();
