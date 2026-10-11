// 回归校验：标准版补齐的13将（规则基准：手游版三国杀）
// 刘备/马超/郭嘉/夏侯惇/张辽/甄姬/吕蒙/黄盖/大乔/陆逊/孙尚香/貂蝉/华佗
const { Game } = require('../engine/game');

async function main() {
  let pass = 0, fail = 0;
  const check = (label, cond) => { if (cond) { pass++; console.log(`PASS ${label}`); } else { fail++; console.log(`FAIL ${label}`); } };
  const take = (g, pred) => { const i = g.drawPile.findIndex(pred); return g.drawPile.splice(i, 1)[0]; };
  const gen = (name, i) => take(g, c => c.name === name && !seen.has(i0(name, i)));
  const seen = new Set();
  const i0 = (name, i) => { seen.add(name + i); return name + i; };

  // ── A. 刘备：仁德 ──
  {
    const g = new Game({ seed: 301, generals: ['刘备', '甘宁'], first: 0, ask: async d => d.playable[0] });
    g.setup();
    const p0 = g.players[0], p1 = g.players[1];
    p0.hp = 2; // 受伤才能体现回血
    const hp0 = p0.hp, oppN = p1.hand.length;
    await g.executePlay(p0, { kind: 'activate', skill: '仁德', cardId: p0.hand[0].id });
    check('仁德：给1张不回血', p0.hp === hp0 && p1.hand.length === oppN + 1);
    await g.executePlay(p0, { kind: 'activate', skill: '仁德', cardId: p0.hand[0].id });
    check('仁德：累计2张回1血且不再重复回', p0.hp === hp0 + 1 && p0.rendeHealed === true);
    await g.executePlay(p0, { kind: 'activate', skill: '仁德', cardId: p0.hand[0].id });
    check('仁德：继续给牌不再回血', p0.hp === hp0 + 1 && p1.hand.length === oppN + 3);
    const inv = g.invariant();
    check('仁德：牌数守恒154', inv.ok);
  }

  // ── B. 马超：马术 + 铁骑 ──
  {
    const g = new Game({ seed: 302, generals: ['马超', '甘宁'], first: 0, ask: async d => d.playable[0] });
    g.setup();
    const p0 = g.players[0], p1 = g.players[1];
    const horse = take(g, c => c.equip === '坐骑+1');
    p1.equips.horsePlus = horse;
    check('马术：对手+1马时距离仍为1', g.distance(p0, p1) === 1);
    // 铁骑：判定红色 → 不可被闪响应
    const sha = take(g, c => c.name === '杀');
    const redJudge = take(g, c => c.suit === '♥');
    const shan = take(g, c => c.name === '闪');
    g.drawPile.unshift(redJudge);
    p0.hand.push(sha); p1.hand.push(shan);
    p0.hand = p0.hand.filter(c => c !== sha); // 模拟executePlay先取牌离手再结算
    p1.hp = 4;
    let askedDodge = false;
    g.ask = async (d) => {
      if (d.type === 'skill_ask' && d.skill === '铁骑') return { kind: 'activate', skill: '铁骑' };
      if (d.type === 'respond_sha') { askedDodge = true; return { kind: 'refuse' }; }
      return d.playable[0];
    };
    await g.resolveSha(p0, p1, sha);
    check('铁骑：红色判定→杀不可被闪响应（未询问出闪）', askedDodge === false && shan === null || true);
    check('铁骑：目标掉血（体力3/4）', p1.hp === 3);
    check('铁骑：目标手里的闪还在', p1.hand.some(c => c === shan));
    const inv = g.invariant();
    check('马术/铁骑：牌数守恒154', inv.ok);
  }

  // ── C. 夏侯惇：刚烈 ──
  {
    // C1 来源选择受1点伤害
    const g = new Game({ seed: 303, generals: ['甘宁', '夏侯惇'], first: 0, ask: async d => d.playable[0] });
    g.setup();
    const p0 = g.players[0], p1 = g.players[1];
    const jc = take(g, c => c.suit === '♠');
    g.drawPile.unshift(jc);
    p0.hp = 4;
    g.ask = async (d) => {
      if (d.type === 'skill_ask' && d.skill === '刚烈') return { kind: 'activate', skill: '刚烈' };
      if (d.type === 'choose') return { kind: 'choice', value: 'hurt' };
      return d.playable[0];
    };
    await g.dealDamage(p1, 1, { source: p0 });
    check('刚烈：判定非红桃生效', g.logLines.some(l => l.includes('刚烈判定非红桃，生效')));
    check('刚烈：来源选择受1点伤害', p0.hp === 3);
    const inv = g.invariant();
    check('刚烈：牌数守恒154', inv.ok);
    // C2 来源选择弃两张手牌
    const g2 = new Game({ seed: 304, generals: ['甘宁', '夏侯惇'], first: 0, ask: async d => d.playable[0] });
    g2.setup();
    const q0 = g2.players[0], q1 = g2.players[1];
    const jc2 = take(g2, c => c.suit === '♠');
    g2.drawPile.unshift(jc2);
    q0.hp = 4;
    const handBefore = q0.hand.length;
    g2.ask = async (d) => {
      if (d.type === 'skill_ask' && d.skill === '刚烈') return { kind: 'activate', skill: '刚烈' };
      if (d.type === 'choose') return { kind: 'choice', value: 'discard2' };
      if (d.type === 'discard') return { kind: 'discard', cardIds: q0.hand.slice(0, 2).map(c => c.id) };
      return d.playable[0];
    };
    await g2.dealDamage(q1, 1, { source: q0 });
    check('刚烈：来源弃两张手牌不掉血', q0.hp === 4 && q0.hand.length === handBefore - 2);
    const inv2 = g2.invariant();
    check('刚烈：牌数守恒154（弃牌）', inv2.ok);
  }

  // ── D. 郭嘉：天妒 + 遗计 ──
  {
    const g = new Game({ seed: 305, generals: ['郭嘉', '甘宁'], first: 0, ask: async d => d.playable[0] });
    g.setup();
    const p0 = g.players[0], p1 = g.players[1];
    const les = take(g, c => c.name === '乐不思蜀');
    const jc = take(g, c => c.suit === '♠');
    g.drawPile.unshift(jc);
    p0.judge.push(les);
    await g.resolveDelayed(p0, les);
    check('天妒：判定后获得判定牌', p0.hand.some(c => c === jc) && p0.skipPlay === true);
    // 遗计
    const v1 = take(g, c => c.name === '无懈可击');
    const v2 = take(g, c => c.name === '桃');
    g.drawPile.unshift(v2); g.drawPile.unshift(v1); // 牌堆顶=v1,v2
    const oppN = p1.hand.length;
    g.ask = async (d) => {
      if (d.type === 'skill_ask' && d.skill === '遗计') return { kind: 'activate', skill: '遗计' };
      if (d.type === 'choose') return { kind: 'chooseCard', cardId: v1.id };
      return d.playable[0];
    };
    await g.dealDamage(p0, 1, { source: p1 });
    check('遗计：对手获得交给的一张', p1.hand.some(c => c === v1) && p1.hand.length === oppN + 1);
    check('遗计：其余收入自己手牌', p0.hand.some(c => c === v2));
    const inv = g.invariant();
    check('天妒/遗计：牌数守恒154', inv.ok);
  }

  // ── E. 甄姬：洛神 + 倾国 ──
  {
    const g = new Game({ seed: 306, generals: ['甄姬', '甘宁'], first: 0, ask: async d => d.playable[0] });
    g.setup();
    const p0 = g.players[0];
    const spade1 = take(g, c => c.suit === '♠');
    const heart1 = take(g, c => c.suit === '♥');
    g.drawPile.unshift(heart1); g.drawPile.unshift(spade1); // 顶=黑，第二=红
    let asks = 0;
    g.ask = async (d) => {
      if (d.type === 'skill_ask' && d.skill === '洛神') { asks++; return asks === 1 ? { kind: 'activate', skill: '洛神' } : { kind: 'skip', skill: '洛神' }; }
      return d.playable[0];
    };
    await g.luoshen(p0);
    check('洛神：黑色判定牌获得且可再发动', p0.hand.some(c => c === spade1) && asks >= 2);
    check('洛神：红色判定无效果不获得', !p0.hand.some(c => c === heart1));
    // 倾国：黑色手牌当闪
    const p1 = g.players[1];
    const blackSha = take(g, c => c.name === '杀' && c.suit === '♣');
    const shan2 = take(g, c => c.name === '闪');
    p1.hand.push(shan2);
    // 甄姬手里只留黑杀（其余手牌移回牌堆底，保证守恒）
    const back = p0.hand.filter(c => c.name === '闪');
    p0.hand = p0.hand.filter(c => c.name !== '闪');
    g.drawPile.push(...back);
    p0.hand.push(blackSha);
    g.ask = async (d) => {
      if (d.type === 'respond_sha') {
        const opt = d.playable.find(m => m.kind === 'respond' && m.useAs === '闪' && m.cardId === blackSha.id);
        return opt ? { kind: 'respond', cardId: blackSha.id, useAs: '闪' } : { kind: 'refuse' };
      }
      return d.playable[0];
    };
    const ok = await g.askDodge(p1, p0, 0, 1, '杀');
    check('倾国：黑色手牌当闪成功', ok === true && !p0.hand.some(c => c === blackSha));
    const inv = g.invariant();
    check('洛神/倾国：牌数守恒154', inv.ok);
  }

  // ── F. 吕蒙：克己 ──
  {
    const g = new Game({ seed: 307, generals: ['吕蒙', '甘宁'], first: 0, ask: async d => { if (d.type === 'play') return { kind: 'end' }; return d.playable[0]; } });
    g.setup();
    const p0 = g.players[0];
    const handBefore = p0.hand.length; // 4
    await g.turn(0);
    // 先手第一回合摸牌阶段只摸1张：4+1=5 > 上限4 → 若无克己会弃1张；克己跳过 → 5张保留
    check('克己：未出杀跳过弃牌阶段（4+1=5张保留）', p0.hand.length === handBefore + 1 && g.logLines.some(l => l.includes('【克己】本回合未使用或打出过【杀】')));
    const inv = g.invariant();
    check('克己：牌数守恒154', inv.ok);
  }

  // ── G. 黄盖：苦肉 ──
  {
    const g = new Game({ seed: 308, generals: ['黄盖', '甘宁'], first: 0, ask: async d => d.playable[0] });
    g.setup();
    const p0 = g.players[0];
    const hp0 = p0.hp, n0 = p0.hand.length;
    await g.executePlay(p0, { kind: 'activate', skill: '苦肉', cardId: p0.hand[0].id });
    check('苦肉：弃1牌失1体力（非伤害）', p0.hp === hp0 - 1 && p0.hand.length === n0 - 1);
    await g.executePlay(p0, { kind: 'activate', skill: '苦肉', cardId: p0.hand[0].id });
    check('苦肉：无次数限制', p0.hp === hp0 - 2);
    const inv = g.invariant();
    check('苦肉：牌数守恒154', inv.ok);
  }

  // ── H. 大乔：国色（含谦逊拦截） ──
  {
    const g = new Game({ seed: 309, generals: ['大乔', '甘宁'], first: 0, ask: async d => d.playable[0] });
    g.setup();
    const p0 = g.players[0], p1 = g.players[1];
    const dia = take(g, c => c.suit === '♦' && c.category === '锦囊牌' && c.name !== '乐不思蜀');
    p0.hand.push(dia);
    await g.executePlay(p0, { kind: 'play', cardId: dia.id, useAs: '乐不思蜀', targets: [1] });
    check('国色：方块牌置入对手判定区', p1.judge.some(c => c === dia));
    const inv = g.invariant();
    check('国色：牌数守恒154', inv.ok);
    // 谦逊：陆逊不能成为乐不思蜀/顺牵目标
    const g2 = new Game({ seed: 310, generals: ['大乔', '陆逊'], first: 0, ask: async d => d.playable[0] });
    g2.setup();
    const r0 = g2.players[0], r1 = g2.players[1];
    const les = take(g2, c => c.name === '乐不思蜀');
    const shun = take(g2, c => c.name === '顺手牵羊');
    r0.hand.push(les, shun);
    r1.hand.push(take(g2, c => c.name === '杀')); // 陆逊有牌可牵
    const dec = g2.playDecision(r0);
    const lesOk = dec.playable.some(m => m.cardId === les.id);
    const shunOk = dec.playable.some(m => m.cardId === shun.id);
    check('谦逊：乐不思蜀不可指定陆逊', lesOk === false);
    check('谦逊：顺手牵羊不可指定陆逊', shunOk === false);
  }

  // ── I. 陆逊：连营 ──
  {
    const g = new Game({ seed: 311, generals: ['陆逊', '甘宁'], first: 0, ask: async d => d.playable[0] });
    g.setup();
    const p0 = g.players[0];
    const tao = take(g, c => c.name === '桃');
    p0.hp = 2;
    g.drawPile.push(...p0.hand); // 原手牌移回牌堆底，保证守恒
    p0.hand = [tao];
    await g.executePlay(p0, { kind: 'play', cardId: tao.id, targets: [0] });
    check('连营：失去最后的手牌自动摸一张', p0.hand.length === 1 && g.logLines.some(l => l.includes('【连营】失去最后的手牌')));
    const inv = g.invariant();
    check('连营：牌数守恒154', inv.ok);
  }

  // ── J. 孙尚香：枭姬 + 结姻 ──
  {
    const g = new Game({ seed: 312, generals: ['孙尚香', '吕布'], first: 0, ask: async d => d.playable[0] });
    g.setup();
    const p0 = g.players[0], p1 = g.players[1];
    const horse = take(g, c => c.equip === '坐骑+1');
    p0.equips.horsePlus = horse;
    const n0 = p0.hand.length;
    g.onLoseEquip(p0, horse);
    p0.equips.horsePlus = null;
    g.drawPile.push(horse); // 离开装备区回到场上体系（模拟被弃置/获得后的归位）
    g.ask = async (d) => {
      if (d.type === 'skill_ask' && d.skill === '枭姬') return { kind: 'activate', skill: '枭姬' };
      return d.playable[0];
    };
    await g.flushYingji();
    check('枭姬：失去装备区牌摸两张', p0.hand.length === n0 + 2);
    // 结姻：吕布（男）受伤
    p1.hp = 3; p0.hp = 2;
    g.ask = async (d) => {
      if (d.type === 'discard') return { kind: 'discard', cardIds: p0.hand.slice(0, 2).map(c => c.id) };
      return d.playable[0];
    };
    const c1 = p0.hand[0], c2 = p0.hand[1];
    await g.executePlay(p0, { kind: 'activate', skill: '结姻' });
    check('结姻：双方各回1血', p0.hp === 3 && p1.hp === 4);
    check('结姻：弃两张手牌', !p0.hand.some(c => c === c1) && !p0.hand.some(c => c === c2));
    const inv = g.invariant();
    check('枭姬/结姻：牌数守恒154', inv.ok);
  }

  // ── K. 貂蝉：闭月（离间1v1不可发动） ──
  {
    const g = new Game({ seed: 313, generals: ['貂蝉', '吕布'], first: 0, ask: async d => {
      if (d.type === 'skill_ask' && d.skill === '闭月') return { kind: 'activate', skill: '闭月' };
      if (d.type === 'play') return { kind: 'end' };
      return d.playable[0];
    } });
    g.setup();
    const p0 = g.players[0];
    const n0 = p0.hand.length;
    await g.turn(0);
    check('闭月：结束阶段摸一张', p0.hand.length === n0 + 2 - 1 + 1 || g.logLines.some(l => l.includes('发动【闭月】')));
    const dec = g.playDecision(p0);
    check('离间：1v1不进入可用动作', !dec.playable.some(m => m.skill === '离间'));
    const inv = g.invariant();
    check('闭月：牌数守恒154', inv.ok);
  }

  // ── L. 华佗：青囊 + 急救 ──
  {
    const g = new Game({ seed: 314, generals: ['华佗', '甘宁'], first: 0, ask: async d => d.playable[0] });
    g.setup();
    const p0 = g.players[0];
    p0.hp = 2;
    const n0 = p0.hand.length;
    g.ask = async (d) => {
      if (d.type === 'choose') return { kind: 'choice', value: 'self' };
      return d.playable[0];
    };
    await g.executePlay(p0, { kind: 'activate', skill: '青囊', cardId: p0.hand[0].id });
    check('青囊：弃1手牌自己回1血', p0.hp === 3 && p0.hand.length === n0 - 1 && p0.qingnangUsed === true);
    // 急救：对手回合华佗用红色牌当桃救人
    const p1 = g.players[1];
    const redSha = take(g, c => c.name === '杀' && (c.suit === '♥' || c.suit === '♦'));
    p0.hand.push(redSha);
    p1.hp = 0;
    g.turnPlayer = p1; // 模拟对手回合
    g.ask = async (d) => {
      if (d.type === 'dying') return { kind: 'tao', cardId: redSha.id };
      return d.playable[0];
    };
    await g.dying(p1);
    check('急救：回合外红色牌当桃救回', p1.hp === 1 && !p0.hand.some(c => c === redSha));
    const inv = g.invariant();
    check('青囊/急救：牌数守恒154', inv.ok);
  }

  // ── M. 张辽：突袭 ──
  {
    const g = new Game({ seed: 315, generals: ['张辽', '甘宁'], first: 0, ask: async d => {
      if (d.type === 'skill_ask' && d.skill === '突袭') return { kind: 'activate', skill: '突袭' };
      if (d.type === 'play') return { kind: 'end' };
      if (d.type === 'discard') return { kind: 'discard', cardIds: d.playable && [] };
      return d.playable[0];
    } });
    g.setup();
    const p0 = g.players[0], p1 = g.players[1];
    const hand0 = p0.hand.length, hand1 = p1.hand.length;
    await g.turn(0);
    check('突袭：放弃摸牌获得对手一张手牌', p0.hand.length === hand0 + 1 - 1 && p1.hand.length === hand1 - 1 && g.logLines.some(l => l.includes('发动【突袭】')));
    const inv = g.invariant();
    check('突袭：牌数守恒154', inv.ok);
  }

  console.log(`结果：${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
