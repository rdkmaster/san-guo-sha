// 牌堆加载与洗牌
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const deckData = JSON.parse(fs.readFileSync(path.join(ROOT, '素材', '牌堆.json'), 'utf8'));

// 武器攻击范围（牌堆里已带range，这里兜底）
const WEAPON_RANGE = {
  '诸葛连弩': 1, '雌雄双股剑': 2, '青釭剑': 2, '寒冰剑': 2, '古锭刀': 2,
  '青龙偃月刀': 3, '丈八蛇矛': 3, '贯石斧': 3, '方天画戟': 4, '朱雀羽扇': 4, '麒麟弓': 5,
};

const EQUIP_SLOTS = { '武器': 'weapon', '防具': 'armor', '坐骑+1': 'horsePlus', '坐骑-1': 'horseMinus' };

function isRed(card) { return card.suit === '♥' || card.suit === '♦'; }
function isBlack(card) { return card.suit === '♠' || card.suit === '♣'; }
function isShaName(card) { return card.name === '杀'; }
function equipSlot(card) {
  if (card.category !== '装备牌') return null;
  return EQUIP_SLOTS[card.equip] || null;
}
function weaponRange(card) {
  return card.range || WEAPON_RANGE[card.name] || 1;
}

// 构建洗匀的牌堆（每张牌实例: {id, name, suit, rank, subtype, tag, category, equip, range, effect, image}）
function buildDeck(rng) {
  const random = rng || Math.random;
  const cards = deckData.cards.map((c, i) => ({
    id: i,
    name: c.name,
    suit: c.suit,
    rank: c.rank,
    subtype: c.subtype || null, // 普通杀/雷杀/火杀 或 null
    tag: c.tag || null,         // EX 表示军争专属
    category: c.category,       // 基本牌/锦囊牌/延时锦囊/装备牌
    equip: c.equip || null,
    range: c.range || null,
    effect: c.effect || '',
    image: c.image || null,
  }));
  // Fisher-Yates
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

// 定向发牌：按 [名称, 花色, 点数] 序列从真实牌池取牌（前4张=玩家起手，接下来4张=AI起手，之后为摸牌顺序）
function makeRiggedDeck(spec) {
  const pool = deckData.cards;
  const used = new Set();
  const out = [];
  const clone = (c, id) => ({
    id, name: c.name, suit: c.suit, rank: c.rank, subtype: c.subtype || null, tag: c.tag || null,
    category: c.category, equip: c.equip || null, range: c.range || null, effect: c.effect || '', image: c.image || null,
  });
  // 杀按名字映射到子类（'杀'=普通杀，'火杀'/'雷杀'对应子类）
  const SHA_SUB = { '杀': '普通杀', '火杀': '火杀', '雷杀': '雷杀' };
  for (const [name0, suit, rank] of spec) {
    const sub = SHA_SUB[name0] || null;
    const name = sub ? '杀' : name0;
    const idx = pool.findIndex((c, i) => !used.has(i) && c.name === name && c.suit === suit && c.rank === rank
      && (sub ? (c.subtype || '普通杀') === sub : true));
    if (idx < 0) throw new Error(`定向发牌找不到: ${name0} ${suit}${rank}（或该牌已被用完）`);
    used.add(idx);
    out.push(clone(pool[idx], out.length));
  }
  for (let i = 0; i < pool.length; i++) {
    if (used.has(i)) continue;
    out.push(clone(pool[i], out.length));
  }
  return out;
}

const DECK_STATS = { total: deckData.count };

module.exports = { buildDeck, makeRiggedDeck, isRed, isBlack, isShaName, equipSlot, weaponRange, EQUIP_SLOTS, WEAPON_RANGE, DECK_STATS };
