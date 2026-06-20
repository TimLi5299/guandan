/**
 * deck.js — 掼蛋牌组定义、洗牌、发牌
 *
 * 两副标准扑克牌（含大小王），共 108 张。
 *
 * Card 表示:
 *   { suit, rank, id }
 *   suit: 0=♠, 1=♥, 2=♣, 3=♦, 4=Joker
 *   rank: 2-14  (2=2, ..., 10=10, 11=J, 12=Q, 13=K, 14=A)
 *         15=小王(Black Joker), 16=大王(Red Joker)
 *   id:   0-107 全局唯一
 */

const SUIT_NAMES = ['♠', '♥', '♣', '♦', '🃏'];
const RANK_NAMES = {
  2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8',
  9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A',
  15: '小王', 16: '大王'
};

/**
 * 创建一副完整的 108 张牌（两副扑克）
 */
function createDeck() {
  const cards = [];
  let id = 0;

  // 两副牌
  for (let copy = 0; copy < 2; copy++) {
    // 每副 52 张普通牌
    for (let suit = 0; suit <= 3; suit++) {
      for (let rank = 2; rank <= 14; rank++) {
        cards.push({ suit, rank, id: id++ });
      }
    }
    // 小王
    cards.push({ suit: 4, rank: 15, id: id++ });
    // 大王
    cards.push({ suit: 4, rank: 16, id: id++ });
  }

  return cards; // 108 张
}

/**
 * 可种子化随机数发生器（mulberry32）。
 * 用途：自对弈胜率台需要"同一批发牌让两版各打一遍"以消除牌运噪声。
 * 线上游戏不传种子 → 退回 Math.random（行为不变）。
 * @param {number} seed - 32 位整数种子
 * @returns {() => number} 返回 [0,1) 的确定性随机函数
 */
function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fisher-Yates 洗牌
 * @param {Array} cards
 * @param {() => number} [rng] - 可选随机源（默认 Math.random）。传入可种子化 rng → 可复现
 */
function shuffle(cards, rng = Math.random) {
  const arr = [...cards];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * 发牌：将 108 张牌分给 4 个玩家，每人 27 张
 * @returns {Array<Array>} 四个玩家的手牌
 */
function deal(shuffledDeck) {
  const hands = [[], [], [], []];
  shuffledDeck.forEach((card, i) => {
    hands[i % 4].push(card);
  });
  return hands;
}

/**
 * 获取归一化权重（级牌大于 A，小于王）
 */
function getNormalizedRank(rank, currentLevel) {
  if (rank === 16) return 17; // 大王
  if (rank === 15) return 16; // 小王
  if (rank === currentLevel) return 15; // 级牌
  return rank;
}

/**
 * 获取牌的排序权重（用于手牌排序显示）
 * 掼蛋中牌的大小: 2 < 3 < ... < A < 级牌 < 小王 < 大王
 */
function getCardSortWeight(card, currentLevel = 2) {
  return getNormalizedRank(card.rank, currentLevel);
}

/**
 * 对手牌排序（从小到大）
 */
function sortCards(cards, currentLevel = 2) {
  return [...cards].sort((a, b) => {
    const diff = getCardSortWeight(a, currentLevel) - getCardSortWeight(b, currentLevel);
    if (diff !== 0) return diff;
    return a.suit - b.suit;
  });
}

/**
 * 获取牌的显示名称
 */
function cardToString(card) {
  if (card.rank >= 15) return RANK_NAMES[card.rank];
  return `${SUIT_NAMES[card.suit]}${RANK_NAMES[card.rank]}`;
}

/**
 * 将手牌转为可读字符串
 */
function handToString(cards) {
  return cards.map(cardToString).join(' ');
}

/**
 * 按 rank 分组统计
 * @returns {Map<number, Card[]>} rank -> cards[]
 */
function groupByRank(cards) {
  const groups = new Map();
  for (const card of cards) {
    if (!groups.has(card.rank)) {
      groups.set(card.rank, []);
    }
    groups.get(card.rank).push(card);
  }
  return groups;
}

/**
 * 按 suit 分组统计
 * @returns {Map<number, Card[]>} suit -> cards[]
 */
function groupBySuit(cards) {
  const groups = new Map();
  for (const card of cards) {
    if (!groups.has(card.suit)) {
      groups.set(card.suit, []);
    }
    groups.get(card.suit).push(card);
  }
  return groups;
}

export {
  SUIT_NAMES,
  RANK_NAMES,
  createDeck,
  shuffle,
  makeRng,
  deal,
  sortCards,
  getCardSortWeight,
  getNormalizedRank,
  cardToString,
  handToString,
  groupByRank,
  groupBySuit
};
