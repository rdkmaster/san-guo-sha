// 观星UI冒烟测试：双栏（牌堆顶/牌堆底）渲染 + 拖拽辅助函数 + 提交顺序
// 运行：node test/guanxing_ui_test.js （需 node_modules 里有 jsdom）
const path = require('path');
let JSDOM;
try { JSDOM = require('jsdom').JSDOM; }
catch { try { JSDOM = require(path.join(__dirname, '..', 'node_modules', 'jsdom')).JSDOM; }
catch { JSDOM = require('D:/Codes/三国杀/node_modules/jsdom').JSDOM; } }

const fs = require('fs');
const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

let submitted = null;
const dom = new JSDOM(html, {
  url: 'http://localhost/',
  runScripts: 'dangerously',
  beforeParse(window) {
    window.EventSource = class { constructor() {} close() {} };
    window.fetch = async (_url, opts) => {
      submitted = JSON.parse(opts.body).move;
      return { json: async () => ({}) };
    };
  },
});
const { window } = dom;
const { document } = window;
const fail = msg => { console.error('FAIL ' + msg); process.exitCode = 1; };
const ok = msg => console.log('PASS ' + msg);

const cards = [
  { id: 1, name: '杀', suit: '♠', rank: 7 },
  { id: 2, name: '闪', suit: '♥', rank: 3 },
];
window.state = { players: {} }; // render() 需要的兜底
document.getElementById('dbg').checked = false;

// ---- 渲染：默认全部在牌堆顶栏 ----
window.renderAsk({
  decisionType: 'guanxing',
  optionCards: cards,
  context: { question: '' },
});
const zones = document.querySelectorAll('.gxzone');
if (zones.length === 2) ok('渲染出 牌堆顶/牌堆底 两个投放栏'); else fail(`应有2个栏，实际${zones.length}`);
const topIds = [...zones[0].querySelectorAll('.gxcard')].map(e => +e.dataset.cid);
const botIds = [...zones[1].querySelectorAll('.gxcard')].map(e => +e.dataset.cid);
if (topIds.join() === '1,2' && botIds.length === 0) ok('默认全部亮牌在牌堆顶栏'); else fail(`默认分栏异常 top=${topIds} bottom=${botIds}`);

// ---- 点击切换：点第一张 → 移到牌堆底 ----
zones[0].querySelector('.gxcard').click();
const botAfterClick = [...document.querySelectorAll('.gxzone')[1].querySelectorAll('.gxcard')].map(e => +e.dataset.cid);
if (botAfterClick.join() === '1') ok('点击卡片可切换到牌堆底栏'); else fail(`点击后底栏=${botAfterClick}`);

// ---- gxMove：移回牌堆顶并指定序位 ----
window.eval('gxMove(1, "top")');
if (window.eval('guanxingTop.join()') === '2,1') ok('gxMove：牌1移回牌堆顶栏末尾'); else fail('gxMove 顺序异常：' + window.eval('guanxingTop.join()'));

// ---- gxSwap：栏内交换顺序 ----
window.eval('gxSwap(2, 1)');
if (window.eval('guanxingTop.join()') === '1,2') ok('gxSwap：栏内交换两张牌顺序'); else fail('栏内交换异常：' + window.eval('guanxingTop.join()'));

// ---- gxSwap：跨栏交换（1在顶栏，2放底栏后交换）----
window.eval('gxMove(2, "bottom")'); // 顶[1] 底[2]
window.eval('gxSwap(1, 2)');        // 1→底栏序位0，2→顶栏序位0
if (window.eval('guanxingTop.join()') === '2' && window.eval('guanxingBottom.join()') === '1') ok('gxSwap：跨栏交换位置'); else fail(`跨栏交换异常 top=${window.eval('guanxingTop.join()')} bottom=${window.eval('guanxingBottom.join()')}`);

// ---- 确认提交：顺序与栏内一致 ----
document.querySelectorAll('#promptbar button').forEach(b => { if (b.textContent === '确认观星') b.click(); });
if (submitted && submitted.kind === 'guanxing' && submitted.tops.join() === '2' && submitted.bottoms.join() === '1') {
  ok('确认观星：按栏内顺序提交 tops/bottoms');
} else fail('提交内容异常：' + JSON.stringify(submitted));

console.log(`结果：${process.exitCode ? '存在失败' : '全部通过'}`);
