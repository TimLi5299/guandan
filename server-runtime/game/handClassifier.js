/**
 * handClassifier.js — 掼蛋牌型识别
 *
 * 牌型列表（从小到大）:
 *   SINGLE        单张
 *   PAIR          对子 (2张相同)
 *   TRIPLE        三同张 (3张相同)
 *   TRIPLE_PAIR   三带二 (3+2)
 *   STRAIGHT      顺子 (5+张连续, 不含2和王)
 *   DOUBLE_STRAIGHT 连对 (3+对连续)
 *   TRIPLE_STRAIGHT 钢板/三连同张 (2+组三连续)
 *   BOMB_4        4张炸弹
 *   BOMB_5        5张炸弹
 *   BOMB_6        6张炸弹
 *   STRAIGHT_FLUSH 同花顺 (5+张同花色连续)
 *   BOMB_7        7张炸弹
 *   BOMB_8        8张炸弹
 *   ROCKET        天王炸 (4个王)
 */

import { groupByRank, groupBySuit, getNormalizedRank } from './deck.js';

// 牌型常量
const HandType = {
  INVALID: 0,
  SINGLE: 1,
  PAIR: 2,
  TRIPLE: 3,
  TRIPLE_PAIR: 4,       // 三带二
  STRAIGHT: 5,          // 顺子
  DOUBLE_STRAIGHT: 6,   // 连对
  TRIPLE_STRAIGHT: 7,   // 钢板
  BOMB_4: 100,
  BOMB_5: 101,
  BOMB_6: 102,
  STRAIGHT_FLUSH: 103,  // 同花顺
  BOMB_7: 104,
  BOMB_8: 105,
  ROCKET: 200,          // 天王炸 (4王)
};

const HandTypeName = {
  [HandType.INVALID]: '无效',
  [HandType.SINGLE]: '单张',
  [HandType.PAIR]: '对子',
  [HandType.TRIPLE]: '三同张',
  [HandType.TRIPLE_PAIR]: '三带二',
  [HandType.STRAIGHT]: '顺子',
  [HandType.DOUBLE_STRAIGHT]: '连对',
  [HandType.TRIPLE_STRAIGHT]: '钢板',
  [HandType.BOMB_4]: '炸弹(4)',
  [HandType.BOMB_5]: '炸弹(5)',
  [HandType.BOMB_6]: '炸弹(6)',
  [HandType.STRAIGHT_FLUSH]: '同花顺',
  [HandType.BOMB_7]: '炸弹(7)',
  [HandType.BOMB_8]: '炸弹(8)',
  [HandType.ROCKET]: '天王炸',
};

/**
 * 判断 rank 是否可以参与顺子（2 和王不能参与）
 */
function canBeInStraight(rank) {
  return rank >= 3 && rank <= 14; // 3 - A
}

// getNormalizedRank 已从 deck.js 导入

/**
 * 判断是否是万能牌（红桃级牌）
 */
function isWildCard(card, currentLevel) {
  return card.suit === 1 && card.rank === currentLevel;
}

/**
 * 检查 ranks 是否连续
 */
function isConsecutive(ranks) {
  if (ranks.length < 2) return true;
  const sorted = [...ranks].sort((a, b) => a - b);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - sorted[i - 1] !== 1) return false;
  }
  return true;
}

/**
 * 识别一组牌的牌型
 * @param {Card[]} cards - 要出的牌
 * @param {number} currentLevel - 当前级牌的 rank (2-14)
 * @returns {{ type: number, mainRank: number, length: number, cards: Card[] }}
 *          type=HandType, mainRank=用于比较的主要 rank, length=顺子等的长度
 */
function classifyHand(cards, currentLevel = 2) {
  if (!cards || cards.length === 0) {
    return { type: HandType.INVALID, mainRank: 0, length: 0, cards };
  }

  const n = cards.length;
  const wilds = cards.filter(c => isWildCard(c, currentLevel));
  const regulars = cards.filter(c => !isWildCard(c, currentLevel));
  const numWilds = wilds.length;

  // === 天王炸 (4王) 优先级最高，且万能牌不能参与 ===
  if (n === 4 && cards.every(c => c.rank >= 15)) {
    return { type: HandType.ROCKET, mainRank: 100, length: 4, cards };
  }

  // 如果全是万能牌，它们可以作为级牌的任何倍数
  if (numWilds === n) {
    const mainRank = getNormalizedRank(currentLevel, currentLevel);
    if (n === 1) return { type: HandType.SINGLE, mainRank, length: 1, cards };
    if (n === 2) return { type: HandType.PAIR, mainRank, length: 2, cards };
    if (n === 3) return { type: HandType.TRIPLE, mainRank, length: 3, cards };
    if (n >= 4 && n <= 8) {
      const bombTypes = { 4: HandType.BOMB_4, 5: HandType.BOMB_5, 6: HandType.BOMB_6, 7: HandType.BOMB_7, 8: HandType.BOMB_8 };
      return { type: bombTypes[n], mainRank, length: n, cards };
    }
  }

  const rankGroups = groupByRank(regulars);
  const regularRanks = [...rankGroups.keys()].sort((a, b) => a - b);

  // === 简单类型：单张、对子、三张、炸弹 ===
  // 如果所有非万能牌 rank 相同
  // review 修复：万能牌不得与大小王(rank>=15)组成对/三/炸（病例：领牌甩 [大王+万能] 当对子）
  if (rankGroups.size === 1 && !(regularRanks[0] >= 15 && numWilds > 0)) {
    const r = regularRanks[0];
    const mainRank = getNormalizedRank(r, currentLevel);
    if (n === 1) return { type: HandType.SINGLE, mainRank, length: 1, cards };
    if (n === 2) return { type: HandType.PAIR, mainRank, length: 2, cards };
    if (n === 3) return { type: HandType.TRIPLE, mainRank, length: 3, cards };
    if (n >= 4 && n <= 8) {
      const bombTypes = { 4: HandType.BOMB_4, 5: HandType.BOMB_5, 6: HandType.BOMB_6, 7: HandType.BOMB_7, 8: HandType.BOMB_8 };
      return { type: bombTypes[n], mainRank, length: n, cards };
    }
  }

  // === 三带二 (3+2) ===
  if (n === 5) {
    // 情况 1: R1(3) + R2(2) (已由上面逻辑处理 rankGroups.size === 1 的情况，即全是万能牌或全是一样不成立)
    // 情况 2: R1(3) + R2(1) + W(1)
    // 情况 3: R1(2) + R2(2) + W(1)
    // 情况 4: R1(2) + R2(1) + W(2)
    // 逻辑：找能不能凑出一个三张和一个对子
    // 进化修复：万能牌分配择优——同一组牌可能有多种解释（如 A,A,万能,9,9 既可
    // 解释为 A 三带 9 对、也可为 9 三带 A 对），原实现取第一个可行解（升序遍历 =
    // 最小 rank 当三张），导致玩家/NPC 的高解释出牌被引擎按低解释误拒。现取 mainRank 最大解。
    let bestTriplePair = null;
    for (const r1 of regularRanks) {
      // 尝试把 r1 作为三张的基准
      const neededForTriple = Math.max(0, 3 - rankGroups.get(r1).length);
      if (neededForTriple <= numWilds) {
        const remainingWilds = numWilds - neededForTriple;
        let feasible = false;
        // 在剩余的中找对子
        for (const r2 of regularRanks) {
          if (r1 === r2) continue;
          const neededForPair = Math.max(0, 2 - rankGroups.get(r2).length);
          if (neededForPair <= remainingWilds) { feasible = true; break; }
        }
        // 如果没有其他 regular rank，且还有至少 2 张 wild card，则 wild card 自己成对
        if (!feasible && regularRanks.length === 1 && remainingWilds >= 2) feasible = true;
        if (feasible) {
          const mr = getNormalizedRank(r1, currentLevel);
          if (!bestTriplePair || mr > bestTriplePair.mainRank) {
            bestTriplePair = { type: HandType.TRIPLE_PAIR, mainRank: mr, length: 5, cards };
          }
        }
      }
    }
    if (bestTriplePair) return bestTriplePair;
  }

  // === 同花顺 (5+张) ===
  const sfResult = checkStraightFlush(cards, currentLevel);
  if (sfResult) return sfResult;

  // === 顺子 (5+张) ===
  if (n >= 5 && cards.every(c => c.rank <= 14)) {
    // 检查是否能补全顺子
    const sr = checkStraight(cards, currentLevel);
    if (sr) return sr;
  }

  // === 连对 (3+对) ===
  if (n >= 6 && n % 2 === 0) {
    const dr = checkDoubleStraight(cards, currentLevel);
    if (dr) return dr;
  }

  // === 钢板 (2+组三) ===
  if (n >= 6 && n % 3 === 0) {
    const tr = checkTripleStraight(cards, currentLevel);
    if (tr) return tr;
  }

  return { type: HandType.INVALID, mainRank: 0, length: 0, cards };
}

/**
 * 检查同花顺（5+张同花色连续，不含2和王）
 */
function checkStraightFlush(cards, currentLevel = 2) {
  const n = cards.length;
  if (n < 5) return null;

  const wilds = cards.filter(c => isWildCard(c, currentLevel));
  const regulars = cards.filter(c => !isWildCard(c, currentLevel));
  const numWilds = wilds.length;

  if (regulars.length === 0) {
    // 全是万能牌？理论上不可能出现在 5 张牌中（只有2张红桃级牌），除非多副牌
    // 但这里假设最多 2 张万能牌。如果regulars为空，说明n张万能牌，n>2不可能。
    return null;
  }

  // 所有 regular 牌必须同花色
  const suit = regulars[0].suit;
  if (suit >= 4 || regulars.some(c => c.suit !== suit)) return null;

  // 检查是否能成顺子
  const sr = checkStraight(cards, currentLevel);
  if (sr) {
    return { ...sr, type: HandType.STRAIGHT_FLUSH };
  }
  return null;
}

/**
 * 检查顺子（5+张连续，不含2和王）
 */
function checkStraight(cards, currentLevel) {
  const n = cards.length;
  const regulars = cards.filter(c => !isWildCard(c, currentLevel));
  const numWilds = n - regulars.length;

  if (regulars.some(c => !canBeInStraight(c.rank))) return null;

  const rankGroups = groupByRank(regulars);
  if (rankGroups.size !== regulars.length) return null; // 不能有重复 rank

  const ranks = [...rankGroups.keys()].sort((a, b) => a - b);
  const minR = ranks[0];
  const maxR = ranks[ranks.length - 1];

  // 跨度检查：max - min + 1 必须 <= n
  if (maxR - minR + 1 > n) return null;

  // 顺子的 mainRank 是最大的 rank
  // 注意：万能牌可以补在最高位
  const mainRank = Math.min(14, maxR + (n - (maxR - minR + 1)));

  return { type: HandType.STRAIGHT, mainRank, length: n, cards };
}

/**
 * 检查连对 (3+对)
 */
function checkDoubleStraight(cards, currentLevel) {
  const n = cards.length;
  const numPairs = n / 2;
  const regulars = cards.filter(c => !isWildCard(c, currentLevel));
  const numWilds = n - regulars.length;
  
  if (regulars.some(c => !canBeInStraight(c.rank))) return null;

  const rankGroups = groupByRank(regulars);
  let wildCount = numWilds;
  const pairsNeeded = [];

  // 获取 regular 涉及的所有 rank
  const ranks = [...rankGroups.keys()].sort((a, b) => a - b);
  const minR = ranks[0];
  const maxR = ranks[ranks.length - 1];

  // 尝试滑动窗口确定可能的 rank 范围
  // 连对范围长度为 numPairs
  for (let startR = Math.max(3, maxR - numPairs + 1); startR <= Math.min(14 - numPairs + 1, minR); startR++) {
    let cost = 0;
    for (let r = startR; r < startR + numPairs; r++) {
      const have = (rankGroups.get(r) || []).length;
      if (have > 2) { cost = 999; break; } // 一个 rank 不能超过 2 张（如果把万能牌排除外）
      cost += (2 - have);
    }
    if (cost <= numWilds) {
      return { type: HandType.DOUBLE_STRAIGHT, mainRank: startR + numPairs - 1, length: numPairs, cards };
    }
  }
  return null;
}

/**
 * 检查钢板 (2+组三)
 */
function checkTripleStraight(cards, currentLevel) {
  const n = cards.length;
  const numTriples = n / 3;
  const regulars = cards.filter(c => !isWildCard(c, currentLevel));
  const numWilds = n - regulars.length;

  if (regulars.some(c => !canBeInStraight(c.rank))) return null;

  const rankGroups = groupByRank(regulars);
  const ranks = [...rankGroups.keys()].sort((a, b) => a - b);
  const minR = ranks[0];
  const maxR = ranks[ranks.length - 1];

  for (let startR = Math.max(3, maxR - numTriples + 1); startR <= Math.min(14 - numTriples + 1, minR); startR++) {
    let cost = 0;
    for (let r = startR; r < startR + numTriples; r++) {
      const have = (rankGroups.get(r) || []).length;
      if (have > 3) { cost = 999; break; }
      cost += (3 - have);
    }
    if (cost <= numWilds) {
      return { type: HandType.TRIPLE_STRAIGHT, mainRank: startR + numTriples - 1, length: numTriples, cards };
    }
  }
  return null;
}

/**
 * 判断是否是炸弹类型（包括同花顺、天王炸）
 */
function isBomb(handType) {
  return handType >= HandType.BOMB_4;
}

/**
 * 获取炸弹的威力等级（用于比较不同类型炸弹）
 * 4张 < 5张 < 6张 < 同花顺 < 7张 < 8张 < 天王炸
 */
function getBombPower(handType) {
  const powers = {
    [HandType.BOMB_4]: 1,
    [HandType.BOMB_5]: 2,
    [HandType.BOMB_6]: 3,
    [HandType.STRAIGHT_FLUSH]: 4,
    [HandType.BOMB_7]: 5,
    [HandType.BOMB_8]: 6,
    [HandType.ROCKET]: 7,
  };
  return powers[handType] || 0;
}

export {
  HandType,
  HandTypeName,
  classifyHand,
  checkStraightFlush,
  isBomb,
  getBombPower,
  canBeInStraight,
  isConsecutive,
  isWildCard,
};
