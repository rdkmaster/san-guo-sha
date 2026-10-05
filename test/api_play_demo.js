// 演示：不开界面，纯API对局（读SSE局面 → 决策 → POST动作）
const http = require('http');
function post(path, body) {
  return new Promise((ok) => {
    const r = http.request({ host: 'localhost', port: 3000, path, method: 'POST', headers: { 'Content-Type': 'application/json' } },
      res => { let b = ''; res.on('data', d => b += d); res.on('end', () => ok(b)); });
    r.end(JSON.stringify(body));
  });
}
function watch(onEvent, ms) {
  return new Promise((done) => {
    const req = http.get('http://localhost:3000/api/events', res => {
      let buf = '';
      res.on('data', d => {
        buf += d.toString();
        let idx;
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const raw = buf.slice(0, idx); buf = buf.slice(idx + 2);
          if (raw.startsWith('data: ')) { try { onEvent(JSON.parse(raw.slice(6))); } catch (e) {} }
        }
      });
      setTimeout(() => { res.destroy(); done(); }, ms);
    });
  });
}
let myHand = [];
let aiHandDbg = [];
const decisions = [];
(async () => {
  console.log('开局:', await post('/api/start', {}));
  await watch((e) => {
    if (e.type === 'state') { myHand = e.state.ownHand || []; aiHandDbg = e.state.aiHand || []; }
    else if (e.type === 'ask' && e.playerIdx === 0) {
      // 极简策略：能出杀就杀，桃只在受伤时吃，否则第一个动作/结束
      let pick = e.options.find(o => o.kind === 'play' && o.useAs !== '杀' && o.cardId != null && (myHand.find(c => c.id === o.cardId) || {}).name === '杀');
      if (!pick && e.decisionType === 'play') pick = e.options.find(o => o.kind === 'end');
      if (!pick) pick = e.options[0];
      const handStr = myHand.map(c => `${c.name}${c.suit}${c.rank}`).join('、');
      console.log(`[我] ${e.decisionType} | 我的手牌: ${handStr} | 选: ${pick.uiLabel || pick.kind}`);
      decisions.push(pick);
      post('/api/action', { move: pick });
    }
    else if (e.type === 'ailog') { console.log(`[AI] ${e.msg.slice(0, 70)}`); }
  }, 100000);
  console.log(`\n演示结束：共替玩家做了${decisions.length}次决策（纯API，未开界面）`);
})();
