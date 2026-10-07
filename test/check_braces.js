// 括号深度扫描（临时诊断工具）
const src = require('fs').readFileSync('./engine/game.js', 'utf8').split('\n');
let depth = 0, inStr = null, inComment = false, inLineComment = false;
for (let i = 0; i < src.length; i++) {
  const line = src[i];
  for (let j = 0; j < line.length; j++) {
    const c = line[j], n = line[j + 1];
    if (inLineComment) break;
    if (inComment) { if (c === '*' && n === '/') { inComment = false; j++; } continue; }
    if (c === '/' && n === '/') { inLineComment = true; break; }
    if (c === '/' && n === '*') { inComment = true; j++; continue; }
    if (c === "'" || c === '"' || c === '`') { if (inStr === c) inStr = null; else if (!inStr) inStr = c; continue; }
    if (inStr) continue;
    if (c === '{' || c === '(' || c === '[') depth++;
    if (c === '}' || c === ')' || c === ']') depth--;
  }
  inLineComment = false;
  if (i > 410 && i < 620 && depth !== 1) console.log(`line ${i + 1}: depth=${depth}  ${line.slice(0, 60)}`);
}
console.log('final depth:', depth);
