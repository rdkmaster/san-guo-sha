// droid exec 封装：把局面发给GLM-5.3-Flash决策，带回JSON动作
// 首次调用附带规则教材+协议全文；后续 -s 会话续接（AI自己记得历史）
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const WORKSPACE = path.join(ROOT, 'workspace');
const TMPDIR = path.join(WORKSPACE, '_game');
const LOGDIR = path.join(ROOT, '_logs');

class AIPlayer {
  constructor(opts = {}) {
    this.model = opts.model || 'glm-5.3-flash';
    this.reasoning = opts.reasoning || 'high';
    this.timeoutMs = opts.timeoutMs || 300000;
    this.onDetail = opts.onDetail || null; // ({n, prompt, reply, durSec, action, sessionId}) => void
    this.sessionId = null;
    this.callCount = 0;
    this.rulesDoc = null;
    if (!fs.existsSync(TMPDIR)) fs.mkdirSync(TMPDIR, { recursive: true });
    if (!fs.existsSync(LOGDIR)) fs.mkdirSync(LOGDIR, { recursive: true });
  }

  loadDocs() {
    if (this.rulesDoc) return this.rulesDoc;
    const rules = fs.readFileSync(path.join(ROOT, '素材', '规则-1v1.md'), 'utf8');
    const protocol = fs.readFileSync(path.join(ROOT, '素材', 'ai-协议.md'), 'utf8');
    this.rulesDoc = `# 教材一：游戏规则\n\n${rules}\n\n# 教材二：决策协议\n\n${protocol}\n\n# 教材三：首个决策局面\n\n`;
    return this.rulesDoc;
  }

  resetSession() {
    this.sessionId = null;
    this.callCount = 0;
  }

  // 输入：{stateMd}；输出：解析出的动作对象（失败返回 null，由引擎兜底）
  async decide(stateMd, onLog = () => {}) {
    this.callCount++;
    const first = !this.sessionId;
    const prompt = first ? this.loadDocs() + stateMd : stateMd;
    const promptFile = path.join(TMPDIR, `prompt_${Date.now()}.md`);
    fs.writeFileSync(promptFile, prompt, 'utf8');

    const args = ['exec', '-m', this.model, '-r', this.reasoning, '-o', 'json', '-f', promptFile];
    if (!first) args.push('-s', this.sessionId);

    const t0 = Date.now();
    const out = await this.run(args, onLog);
    fs.unlinkSync(promptFile);

    const parsed = this.parseResult(out);
    const dur = ((Date.now() - t0) / 1000).toFixed(1);
    if (parsed.sessionId) this.sessionId = parsed.sessionId;
    const logFile = path.join(LOGDIR, `ai_${Date.now()}_d${this.callCount}.log`);
    fs.writeFileSync(logFile, `=== 决策#${this.callCount} ${dur}s session=${this.sessionId} ===\n--- 局面 ---\n${stateMd}\n--- 回复 ---\n${parsed.raw}\n`, 'utf8');

    if (parsed.action) {
      onLog(`AI决策 ${dur}s: ${JSON.stringify(parsed.action)}`);
      if (this.onDetail) this.onDetail({ n: this.callCount, prompt: stateMd, reply: parsed.raw, durSec: dur, action: parsed.action, sessionId: this.sessionId });
      return parsed.action;
    }
    onLog(`AI回复无法解析（${dur}s），交由引擎处理`);
    if (this.onDetail) this.onDetail({ n: this.callCount, prompt: stateMd, reply: parsed.raw, durSec: dur, action: null, sessionId: this.sessionId });
    return null;
  }

  run(args, onLog) {
    return new Promise((resolve) => {
      const child = spawn('droid', args, {
        cwd: WORKSPACE,
        shell: true,
        windowsHide: true,
        env: { ...process.env },
      });
      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => {
        onLog('AI调用超时');
        try { child.kill(); } catch (e) {}
        resolve('');
      }, this.timeoutMs);
      child.stdout.on('data', d => { stdout += d.toString(); });
      child.stderr.on('data', d => { stderr += d.toString(); });
      child.on('close', () => {
        clearTimeout(timer);
        if (stderr.trim()) {
          // 过滤无害噪音：证书警告（中文用户名路径编码问题，CLI自行忽略）、乱码行
          const lines = stderr.split('\n').map(s => s.trim())
            .filter(s => s && !/ignoring extra certs|warn:|.load failed/i.test(s))
            .filter(s => /[^\x00-\xff]/.test(s) === false || /[\u4e00-\u9fa5]/.test(s)); // 丢纯乱码行
          if (lines.length) onLog(`[droid] ${lines[0].slice(0, 120)}`);
        }
        resolve(stdout);
      });
      child.on('error', () => { clearTimeout(timer); resolve(''); });
    });
  }

  // droid -o json 输出: {"type":"result",...,"result":"...","session_id":"..."}
  parseResult(stdout) {
    let sessionId = null;
    let text = '';
    try {
      // stdout 可能有warning混入，取含"type":"result"的行
      const line = stdout.split('\n').reverse().find(l => l.includes('"type":"result"'));
      if (line) {
        const j = JSON.parse(line.trim());
        sessionId = j.session_id || null;
        text = j.result || '';
      }
    } catch (e) { text = stdout; }
    if (!sessionId) {
      const m = stdout.match(/session_id["']?\s*[:=]\s*["']([0-9a-f-]{8,})/i);
      if (m) sessionId = m[1];
    }
    // 回复末行应为JSON动作
    let action = null;
    const lines = text.split('\n').map(s => s.trim()).filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) {
      const l = lines[i].replace(/^```(json)?|```$/g, '').trim();
      if (l.startsWith('{') && l.endsWith('}')) {
        try { action = JSON.parse(l); } catch (e) { action = null; }
        break;
      }
      if (lines[i].startsWith('{') && lines[i].endsWith('}')) {
        try { action = JSON.parse(lines[i]); } catch (e) { action = null; }
        break;
      }
    }
    if (!action) {
      // 兜底：找第一段看起来像JSON的花括号块
      const m = text.match(/\{[^{}]*\}/);
      if (m) { try { action = JSON.parse(m[0]); } catch (e) { action = null; } }
    }
    return { action, sessionId, raw: text };
  }
}

module.exports = { AIPlayer };
