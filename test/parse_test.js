// 临时单测：parseResult 的 raw/session/action 解析
const { AIPlayer } = require('../engine/ai');
const a = new AIPlayer();
const json = JSON.stringify({
  type: 'result', subtype: 'success', is_error: false,
  result: '保留核心牌。\n{"action": "discard", "cards": ["#1"]}',
  session_id: '81470e95-824b',
});
const r = a.parseResult(json);
console.log('action:', JSON.stringify(r.action), '| session:', r.sessionId, '| raw长度:', r.raw.length);
if (r.action && r.action.action === 'discard' && r.sessionId === '81470e95-824b' && r.raw.length > 0) {
  console.log('parseResult 测试通过');
  process.exit(0);
}
console.log('测试失败');
process.exit(1);
