/**
 * SandboxDealer.js — 教学专用发牌器
 *
 * 支持三种发牌模式：
 *   fixed    - 按课程配置发指定牌（用于演示特定场景）
 *   seeded   - 保证玩家手中包含特定牌型
 *   random   - 标准随机（用于完整对局）
 */

import { createDeck, shuffle, sortCards } from '../game/deck.js';

/**
 * 按教学配置发牌
 * @param {object} config - 课程中的 sandboxConfig
 * @param {number} currentLevel - 当前级牌
 * @returns {Array<Array>} 四个玩家的手牌
 */
export function dealForLesson(config, currentLevel = 2) {
  if (config.mode === 'fixed' && config.fixedHands) {
    return dealFixed(config.fixedHands, currentLevel);
  }
  if (config.mode === 'seeded' && config.requirements) {
    return dealSeeded(config.requirements, currentLevel);
  }
  return dealRandom(currentLevel, config.cardsPerPlayer || 27);
}

/**
 * 固定发牌：按配置中的牌型字符串发牌
 * fixedHands格式: { "0": ["3♠","7♥","K♦"], "1": [...] }
 * 未指定座位的手牌从剩余牌中随机分配
 */
function dealFixed(fixedHands, currentLevel) {
  const deck = createDeck();
  const hands = [[], [], [], []];
  const usedIds = new Set();

  // 解析固定手牌
  for (const [seatStr, cardStrings] of Object.entries(fixedHands)) {
    const seat = parseInt(seatStr);
    for (const cardStr of cardStrings) {
      const card = findCardByString(deck, cardStr, usedIds);
      if (card) {
        hands[seat].push(card);
        usedIds.add(card.id);
      }
    }
  }

  // 剩余牌随机分配到未指定的座位
  const remaining = deck.filter(c => !usedIds.has(c.id));
  const shuffled = shuffle(remaining);
  let idx = 0;
  for (let seat = 0; seat < 4; seat++) {
    const target = fixedHands[seat] ? hands[seat].length : 0;
    // 填充到指定数量（如未指定则不填充）
    while (hands[seat].length < (fixedHands[String(seat)] ? hands[seat].length : 5) && idx < shuffled.length) {
      hands[seat].push(shuffled[idx++]);
    }
  }

  return hands.map(h => sortCards(h, currentLevel));
}

/**
 * 随机发牌（可指定每人张数，用于简化对局）
 */
function dealRandom(currentLevel, cardsPerPlayer = 27) {
  const deck = createDeck();
  const shuffled = shuffle(deck);
  const hands = [[], [], [], []];

  const total = Math.min(cardsPerPlayer * 4, shuffled.length);
  for (let i = 0; i < total; i++) {
    hands[i % 4].push(shuffled[i]);
  }

  return hands.map(h => sortCards(h, currentLevel));
}

/**
 * 条件发牌：保证玩家0手中有特定牌型
 */
function dealSeeded(requirements, currentLevel) {
  // 简单实现：随机发牌后检查是否满足条件，不满足则重发（最多10次）
  for (let attempt = 0; attempt < 10; attempt++) {
    const hands = dealRandom(currentLevel);
    if (checkRequirements(hands[0], requirements, currentLevel)) {
      return hands;
    }
  }
  // 最终兜底：直接随机
  return dealRandom(currentLevel);
}

function checkRequirements(hand, requirements, currentLevel) {
  for (const req of requirements) {
    if (req.type === 'has_bomb') {
      const rankGroups = new Map();
      for (const c of hand) rankGroups.set(c.rank, (rankGroups.get(c.rank) || 0) + 1);
      const hasBomb = [...rankGroups.values()].some(count => count >= 4);
      if (!hasBomb) return false;
    }
    if (req.type === 'has_straight') {
      // 有顺子的材料（5张连续）
      const ranks = hand.filter(c => c.rank >= 3 && c.rank <= 14).map(c => c.rank);
      const uniqueRanks = [...new Set(ranks)].sort((a, b) => a - b);
      let consecutive = 1, max = 1;
      for (let i = 1; i < uniqueRanks.length; i++) {
        if (uniqueRanks[i] === uniqueRanks[i-1] + 1) { consecutive++; max = Math.max(max, consecutive); }
        else consecutive = 1;
      }
      if (max < 5) return false;
    }
  }
  return true;
}

/**
 * 根据字符串表示找到牌（如 "K♠", "小王", "大王"）
 */
function findCardByString(deck, cardStr, usedIds) {
  const suitMap = { '♠': 0, '♥': 1, '♣': 2, '♦': 3 };
  const rankMap = { '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'J':11,'Q':12,'K':13,'A':14 };

  if (cardStr === '大王') {
    return deck.find(c => c.rank === 16 && !usedIds.has(c.id)) || null;
  }
  if (cardStr === '小王') {
    return deck.find(c => c.rank === 15 && !usedIds.has(c.id)) || null;
  }

  // 解析 "K♠" 或 "♠K" 格式
  let suit = -1, rank = -1;
  for (const [sym, val] of Object.entries(suitMap)) {
    if (cardStr.includes(sym)) { suit = val; break; }
  }
  for (const [sym, val] of Object.entries(rankMap)) {
    if (cardStr.replace(/[♠♥♣♦]/g, '') === sym) { rank = val; break; }
  }

  if (suit < 0 || rank < 0) return null;
  return deck.find(c => c.suit === suit && c.rank === rank && !usedIds.has(c.id)) || null;
}
