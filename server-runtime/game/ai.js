/**
 * ai.js — 掼蛋 NPC AI 逻辑
 */

import { findPlayableHands } from './rules.js';
import { classifyHand, HandType, isWildCard, isBomb } from './handClassifier.js';
import { getNormalizedRank } from './deck.js';

export const AILevel = {
  NOOB: 'noob',
  NORMAL: 'normal',
  EXPERT: 'expert'
};

/**
 * 评估一手牌的"持有价值"（越高越舍不得出）
 */
function evaluateHandValue(cards, currentLevel) {
  let totalValue = 0;
  for (const card of cards) {
    if (isWildCard(card, currentLevel)) {
      totalValue += 100;
    } else if (card.rank === currentLevel) {
      totalValue += 25;
    } else if (card.rank === 16) {
      totalValue += 40;
    } else if (card.rank === 15) {
      totalValue += 35;
    } else {
      totalValue += getNormalizedRank(card.rank, currentLevel);
    }
  }
  return totalValue;
}

/**
 * 领牌时对一手牌的"出牌优先级"评分（越高越应该先出）
 * 长牌型优先：连对/钢板 > 三带二/顺子 > 三张 > 对子 > 单张
 * 同牌型内，主牌点数越小越优先（节省大牌）
 */
function scoreLeadingPlay(cards, currentLevel) {
  const hand = classifyHand(cards, currentLevel);
  const type = hand.type;

  // 牌型基础分（越长越难跟，越值得先出）
  const typeBase = {
    [HandType.STRAIGHT_FLUSH]: 1000,
    [HandType.TRIPLE_STRAIGHT]: 800,   // 钢板
    [HandType.DOUBLE_STRAIGHT]: 700,   // 连对
    [HandType.TRIPLE_PAIR]: 500,       // 三带二
    [HandType.STRAIGHT]: 400,          // 顺子
    [HandType.TRIPLE]: 200,            // 三张
    [HandType.PAIR]: 80,               // 对子
    [HandType.SINGLE]: 30,             // 单张
  };

  const base = typeBase[type] ?? 0;
  if (base === 0) return -1; // 无效牌型不选

  // 同牌型内优先出小牌（节省大牌），用 mainRank 的倒序
  const rankBonus = (20 - hand.mainRank) * 2;

  return base + rankBonus;
}

/**
 * AI 决策函数
 */
export function getAIDecision(hand, gameState, level = AILevel.NORMAL) {
  const { lastPlay, currentLevel, isTeammateWinning } = gameState;

  const hints = findPlayableHands(hand, lastPlay, currentLevel);

  if (hints.length === 0) return null;

  const mustPlay = !lastPlay;

  let decision;
  switch (level) {
    case AILevel.NOOB:
      decision = decideNoob(hints, mustPlay); break;
    case AILevel.EXPERT:
      decision = decideExpert(hints, isTeammateWinning, hand, gameState, mustPlay); break;
    case AILevel.NORMAL:
    default:
      decision = decideNormal(hints, currentLevel, hand, gameState, mustPlay); break;
  }

  if (mustPlay && !decision) {
    return hints[0];
  }
  return decision;
}

/**
 * 小白：随机，30% 概率放弃
 */
function decideNoob(hints, mustPlay = false) {
  if (!mustPlay && Math.random() < 0.3) return null;
  return hints[Math.floor(Math.random() * hints.length)];
}

/**
 * 普通：领牌时按策略优先级，跟牌时选最便宜的
 */
function decideNormal(hints, currentLevel, hand, gameState, mustPlay = false) {
  if (hints.length === 0) return null;

  const { lastPlay } = gameState;

  if (!lastPlay) {
    // 领牌：按"出牌优先级"选最优，避免随意出单张
    const scored = hints
      .map(h => ({ h, score: scoreLeadingPlay(h, currentLevel) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score);
    return scored.length > 0 ? scored[0].h : hints[0];
  }

  // 跟牌：选持有价值最低的（不浪费好牌）
  const sorted = [...hints].sort(
    (a, b) => evaluateHandValue(a, currentLevel) - evaluateHandValue(b, currentLevel)
  );

  const cheapest = sorted[0];
  const cheapValue = evaluateHandValue(cheapest, currentLevel);

  // 保护：不为了跟一个小单张而出万能牌/王
  if (cheapValue >= 35 && hand.length > 8 && !mustPlay) {
    return null;
  }

  return cheapest;
}

/**
 * 专家：领牌策略 + 配合队友 + 合理炸弹
 */
function decideExpert(hints, isTeammateWinning, hand, gameState, mustPlay = false) {
  const { playersHandCounts = [], seat, lastPlay, currentLevel } = gameState;
  const mySeat = seat ?? 0;
  const leftSeat = (mySeat + 3) % 4;
  const rightSeat = (mySeat + 1) % 4;
  const teammateSeat = (mySeat + 2) % 4;

  const leftCount  = playersHandCounts[leftSeat]  ?? 27;
  const rightCount = playersHandCounts[rightSeat]  ?? 27;
  const teammateCount = playersHandCounts[teammateSeat] ?? 27;

  const opponentNearWin = (leftCount > 0 && leftCount <= 5) || (rightCount > 0 && rightCount <= 5);
  // 队友快赢：对手跟牌位（非领牌轮）且队友牌很少
  const teammateNearWin = teammateCount > 0 && teammateCount <= 4;
  // 是否是我管住的（上家是队友）
  const teammateLeading = lastPlay && gameState.lastPlaySeat === teammateSeat;

  const sortedHints = [...hints].sort(
    (a, b) => evaluateHandValue(a, currentLevel) - evaluateHandValue(b, currentLevel)
  );
  const normalPlays = sortedHints.filter(h => !isBombCards(h, currentLevel));
  const bombs      = sortedHints.filter(h =>  isBombCards(h, currentLevel));

  // ── 领牌阶段 ──
  if (!lastPlay) {
    // 队友快赢，我配合出牌让对手难接
    if (teammateNearWin && opponentNearWin) {
      // 双方都快赢，关键时刻：出最强普通牌
      if (normalPlays.length > 0) return normalPlays[normalPlays.length - 1];
    }

    // 领牌：按优先级选（连对/钢板/三带二优先）
    const scored = normalPlays
      .map(h => ({ h, score: scoreLeadingPlay(h, currentLevel) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score);

    if (scored.length > 0) {
      // 如果对手快赢，优先出大牌型抢出完
      if (opponentNearWin) return scored[0].h;
      // 如果下家牌少（≤10），出他难跟的牌型（优先连对/钢板）
      if (rightCount > 0 && rightCount <= 10) return scored[0].h;
      // 正常领牌，按优先级
      return scored[0].h;
    }

    return normalPlays[0] || bombs[0];
  }

  // ── 跟牌阶段 ──

  // 队友是最大的（上家是队友），且不到生死关头 → 放水
  if (teammateLeading && !opponentNearWin) {
    if (teammateNearWin) return null; // 队友快赢，肯定让
    if (Math.random() < 0.65) return null; // 一般让路
  }

  // 生死关头，对手快赢且队友不是最大 → 不惜炸弹
  if (opponentNearWin && !teammateLeading) {
    if (bombs.length > 0) return bombs[0];
    // 没有炸弹就出最大的普通牌
    if (normalPlays.length > 0) return normalPlays[normalPlays.length - 1];
  }

  // 正常跟牌：选最便宜的
  if (normalPlays.length > 0) {
    const play  = normalPlays[0];
    const value = evaluateHandValue(play, currentLevel);

    // 不为跟小牌破坏万能牌
    if (value >= 100 && !opponentNearWin && hand.length > 5) return null;
    // 不为跟小于10的牌动用级牌/王（平均价值高）
    if (lastPlay.mainRank < 10 && (value / play.length) >= 20 && hand.length > 10 && !opponentNearWin) return null;

    return play;
  }

  // 炸弹决策：轻易不出，除非快赢或被逼
  if (bombs.length > 0) {
    if (hand.length < 8 || opponentNearWin) return bombs[0];
    if (!mustPlay && Math.random() > 0.2) return null;
    return bombs[0];
  }

  if (mustPlay) return sortedHints[0] || hints[0];
  return null;
}

/** 判断一组牌是否是炸弹（AI内部用，避免循环引用）*/
function isBombCards(cards, currentLevel) {
  if (cards.length < 4) return false;
  const hand = classifyHand(cards, currentLevel);
  return isBomb(hand.type);
}
