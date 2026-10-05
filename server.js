// 三国杀 1v1 服务端：静态文件 + SSE 推送 + 人类/AI决策桥接
// 启动: node server.js   → http://localhost:3000
const http = require('http');
const fs = require('fs');
const path = require('path');
const { Game } = require('./engine/game');
const { AIPlayer } = require('./engine/ai');

const ROOT = __dirname;
const PORT = process.env.PORT || 3000;
const MODEL = process.env.AI_MODEL || 'glm-5.3-flash';
const REASONING = process.env.AI_REASONING || 'high';

let game = null;
let ai = null;
let running = false;
let askSeq = 0;
let pendingHumanAsk = null;
let lastAskPayload = null;
let sseClients = [];

function broadcast(event) {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of sseClients) { try { res.write(data); } catch (e) {} }
}

function decorate(state) {
  if (game && !state.over) {
    state.ownHand = game.players[0].hand.map(c => ({
      id: c.id, name: c.name, suit: c.suit, rank: c.rank, subtype: c.subtype,
      category: c.category, equip: c.equip, image: c.image,
    }));
  }
  return state;
}

function defaultQuestion(d) {
  switch (d.type) {
    case 'play': return '你的出牌阶段：请选择要执行的动作';
    case 'respond_sha': return `需要响应【${(d.context && d.context.reason) || '杀'}】`;
    case 'respond_nanman': return `需要打出【杀】响应${(d.context && d.context.reason) || ''}`;
    case 'dying': return `濒死求援：${(d.context && d.context.dying) || ''}`;
    case 'wuxie': return `是否使用【无懈可击】抵消【${(d.context && d.context.trick) || ''}】？`;
    case 'discard': return (d.context && d.context.question) || '弃牌阶段';
    case 'choose': return (d.context && d.context.question) || '请选择';
    case 'skill_ask': return (d.context && d.context.question) || '是否发动技能？';
    case 'daodao': return (d.context && d.context.question) || '借刀杀人';
    default: return '请决策';
  }
}

function moveUiLabel(d, m) {
  const desc = (cardId) => {
    if (!game) return '?';
    const found = game.findCard(cardId);
    return found ? `【${found.card.name}${found.card.suit}${found.card.rank}】` : '?';
  };
  switch (m.kind) {
    case 'end': return '结束出牌阶段';
    case 'play': {
      const base = m.useAs ? `${desc(m.cardId)} 当【${m.useAs}】` : desc(m.cardId);
      return `使用 ${base}`;
    }
    case 'respond': return `用 ${desc(m.cardId)}${m.useAs ? ` 当【${m.useAs}】` : ''}响应`;
    case 'refuse': return '不响应';
    case 'tao': return `用 ${desc(m.cardId)} 救`;
    case 'wuxie': return `用 ${desc(m.cardId)} 抵消`;
    case 'discard': return `弃置${d.count || ''}张（点选手牌后确认）`;
    case 'chooseCard': return `选择 ${desc(m.cardId)}`;
    case 'sha_combo': return '丈八蛇矛：两手牌当杀';
    case 'chooseArea': return { hand: '拿手牌（随机）', equip: '拿装备', judge: '拿判定区牌' }[m.area] || m.area;
    case 'skill_zhiheng': return `发动【制衡】（点选手牌后确认）`;
    case 'activate': return `发动【${m.skill}】${m.cardId != null ? `（用 ${desc(m.cardId)}）` : ''}`;
    case 'skip': return `不发动【${m.skill}】`;
    case 'daodao_sha': return '出【杀】';
    case 'daodao_give': return '交出武器';
    default: return m.kind;
  }
}

function askHuman(d) {
  return new Promise((resolve) => {
    pendingHumanAsk = { resolve };
    lastAskPayload = {
      type: 'ask',
      askId: ++askSeq,
      playerIdx: d.playerIdx,
      decisionType: d.type,
      skill: d.skill || null,
      question: (d.context && d.context.question) || defaultQuestion(d),
      count: d.count || (d.context && d.context.count) || null,
      options: d.playable.map(m => ({ ...m, uiLabel: moveUiLabel(d, m) })),
    };
    // 人类决策也完整入日志（对称于AI决策，局后可完整复盘）
    appendGameLog(`\n【人类决策 #${askSeq}】类型: ${lastAskPayload.decisionType} | ${lastAskPayload.question}`);
    appendGameLog(`可用动作: ${lastAskPayload.options.map(o => o.uiLabel).join(' / ') || '（点选手牌）'}`);
    broadcast(lastAskPayload);
  });
}

function fmtTime(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

let gameGen = 0; // 对局代数：重开时旧对局的异步回调自动失效
let appendGameLog = () => {}; // 当前对局的日志器（startGame时按gen重建）
function abandonCurrentGame() {
  if (game) game.aborted = true;
  if (pendingHumanAsk) { pendingHumanAsk.resolve(null); pendingHumanAsk = null; }
  lastAskPayload = null;
  appendGameLog('（该对局被放弃：玩家点了重新开局）');
}

async function startGame() {
  if (running) abandonCurrentGame();
  const gen = ++gameGen;
  // 日志器绑定gen：文件名带gen防同秒重置碰撞，旧对局尾巴不漏写进新文件
  const logFile = path.join(ROOT, '_logs', `对局_${fmtTime(new Date())}_${gen}.log`);
  appendGameLog = (line) => {
    if (gen !== gameGen) return;
    try { fs.appendFileSync(logFile, line + '\n', 'utf8'); } catch (e) {}
  };
  ai = new AIPlayer({
    model: MODEL, reasoning: REASONING,
    onDetail: (d) => {
      // 完整记录每次AI决策（对局日志文件 + UI提示）
      appendGameLog(`\n${'='.repeat(60)}\n【AI决策 #${d.n}】耗时 ${d.durSec}s  会话 ${d.sessionId}\n解析动作: ${JSON.stringify(d.action)}\n--- 发送给AI的局面 ---\n${d.prompt}\n--- AI回复 ---\n${d.reply}\n`);
      broadcast({ type: 'aidetail', n: d.n, durSec: d.durSec, reply: d.reply });
    },
  });
  game = new Game({
    ask: async (d) => {
      if (d.playerIdx === 1) {
        broadcast({ type: 'aiThinking', phase: d.type });
        const action = await ai.decide(d.stateMd, m => broadcast({ type: 'ailog', msg: m }));
        return action; // 引擎负责映射+校验+兜底
      }
      return await askHuman(d);
    },
    onEvent: (e) => {
      if (gen !== gameGen) return; // 旧对局收尾事件不再广播/入日志
      if (e.type === 'state') broadcast({ type: 'state', state: decorate(e.state) });
      else {
        broadcast(e);
        if (e.type === 'log') appendGameLog(e.msg);
      }
    },
  });
  running = true;
  appendGameLog(`对局开始 ${new Date().toLocaleString('zh-CN')} | 模型: ${MODEL} (reasoning: ${REASONING})`);
  broadcast({ type: 'gameStart', model: MODEL });
  game.run().then((w) => {
    if (gen !== gameGen) return; // 已被新对局取代，不再广播
    running = false;
    appendGameLog(`\n对局结束：${game.players[w] ? game.players[w].general + '（侧' + w + '）' : w} 获胜`);
    broadcast({ type: 'gameOver', winner: w, winnerName: game.players[w] ? game.players[w].general : null });
  }).catch(err => {
    if (gen !== gameGen) return;
    running = false;
    appendGameLog(`引擎异常: ${String(err && err.stack || err)}`);
    broadcast({ type: 'error', msg: String(err && err.stack || err) });
  });
  return { ok: true, logFile: path.join(ROOT, '_logs') };
}

function serveStatic(req, res, urlPath) {
  let p = decodeURIComponent(urlPath);
  if (p === '/') p = '/public/index.html';
  let filePath;
  if (p.startsWith('/素材/')) filePath = path.join(ROOT, p.slice(1));
  else filePath = path.join(ROOT, p.replace(/^\//, ''));
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    const ext = path.extname(filePath).toLowerCase();
    const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json; charset=utf-8' }[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');
  if (u.pathname === '/api/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
    res.write(`data: ${JSON.stringify({ type: 'hello', running, model: MODEL })}\n\n`);
    sseClients.push(res);
    if (game) res.write(`data: ${JSON.stringify({ type: 'state', state: decorate(game.snapshot()) })}\n\n`);
    if (pendingHumanAsk && lastAskPayload) res.write(`data: ${JSON.stringify(lastAskPayload)}\n\n`);
    req.on('close', () => { sseClients = sseClients.filter(c => c !== res); });
    return;
  }
  if (req.method === 'POST') {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 1e6) req.destroy(); });
    req.on('end', async () => {
      let payload = {};
      try { payload = JSON.parse(body || '{}'); } catch (e) {}
      if (u.pathname === '/api/start') {
        const r = await startGame();
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(r));
      } else if (u.pathname === '/api/action') {
        if (!pendingHumanAsk) {
          res.writeHead(409, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false, error: '当前没有等待你的决策' }));
          return;
        }
        const move = payload.move;
        const resolver = pendingHumanAsk.resolve;
        pendingHumanAsk = null;
        lastAskPayload = null;
        appendGameLog(`人类选择: ${JSON.stringify(move)}`);
        broadcast({ type: 'askDone' });
        resolver(move);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true }));
      } else {
        res.writeHead(404); res.end();
      }
    });
    return;
  }
  serveStatic(req, res, u.pathname);
});

server.listen(PORT, () => {
  console.log(`三国杀服务已启动: http://localhost:${PORT}`);
  console.log(`AI模型: ${MODEL} (reasoning: ${REASONING})`);
});
