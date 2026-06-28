/**
 * rules.js — 掼蛋出牌规则校验和比较
 */

import { HandType, classifyHand, isBomb, getBombPower, isWildCard, HandTypeName } from './handClassifier.js';
import { getNormalizedRank } from './deck.js';

/**
 * 比较两手牌的大小
 */
function compareHands(hand1, hand2) {
  if (hand1.type === HandType.INVALID || hand2.type === HandType.INVALID) {
    return 0;
  }

  const bomb1 = isBomb(hand1.type);
  const bomb2 = isBomb(hand2.type);

  // 都是炸弹：比较炸弹威力等级
  if (bomb1 && bomb2) {
    const power1 = getBombPower(hand1.type);
    const power2 = getBombPower(hand2.type);
    if (power1 !== power2) return power1 - power2;
    // 同级别炸弹比 mainRank
    return hand1.mainRank - hand2.mainRank;
  }

  // 只有一方是炸弹：炸弹方赢
  if (bomb1 && !bomb2) return 1;
  if (!bomb1 && bomb2) return -1;

  // 都不是炸弹：必须同牌型、同长度
  if (hand1.type !== hand2.type) return 0;
  if (hand1.length !== hand2.length) return 0;

  return hand1.mainRank - hand2.mainRank;
}

/**
 * 判断 playedCards 能否管得上 lastPlay
 */
function canPlay(playedCards, lastPlay, currentLevel = 2) {
  const hand = classifyHand(playedCards, currentLevel);

  if (hand.type === HandType.INVALID) {
    return { valid: false, hand, reason: '无效的牌型' };
  }

  if (!lastPlay) {
    return { valid: true, hand, reason: '' };
  }

  if (isBomb(hand.type) && !isBomb(lastPlay.type)) {
    return { valid: true, hand, reason: '' };
  }

  if (isBomb(hand.type) && isBomb(lastPlay.type)) {
    const cmp = compareHands(hand, lastPlay);
    if (cmp > 0) return { valid: true, hand, reason: '' };
    return { valid: false, hand, reason: '炸弹不够大' };
  }

  if (hand.type !== lastPlay.type) {
    return { valid: false, hand, reason: '牌型不匹配' };
  }
  if (hand.length !== lastPlay.length) {
    return { valid: false, hand, reason: '张数不匹配' };
  }

  const cmp = compareHands(hand, lastPlay);
  if (cmp > 0) {
    return { valid: true, hand, reason: '' };
  }
  return { valid: false, hand, reason: '牌不够大' };
}

/**
 * 从手牌中查找所有能管上 lastPlay 的出法
 */
function findPlayableHands(handCards, lastPlay, currentLevel = 2) {
  const results = [];
  const wilds = handCards.filter(c => isWildCard(c, currentLevel));
  const regulars = handCards.filter(c => !isWildCard(c, currentLevel));
  const numWilds = wilds.length;

  const rankGroups = new Map();
  for (const card of regulars) {
    if (!rankGroups.has(card.rank)) rankGroups.set(card.rank, []);
    rankGroups.get(card.rank).push(card);
  }

  if (!lastPlay) {
    // 自由出牌：返回单张、对子、三张作为基础提示
    for (const [rank, cards] of rankGroups) {
      results.push([cards[0]]);
      if (cards.length >= 2) results.push(cards.slice(0, 2));
      if (cards.length >= 3) results.push(cards.slice(0, 3));
    }
    // 万能牌（红心级牌）本身也可以单独出（作为级牌出）
    for (const wild of wilds) {
      results.push([wild]);
    }
    // 添加万能牌配合的对子/三张（review 修复：万能牌不得与大小王 rank>=15 组牌型）
    if (numWilds >= 1) {
      for (const [rank, cards] of rankGroups) {
        if (rank >= 15) continue;
        if (cards.length === 1) results.push([cards[0], wilds[0]]);
        if (cards.length === 2) results.push([...cards.slice(0, 2), wilds[0]]);
      }
    }
    // 添加三带二
    for (const [r1, c1] of rankGroups) {
      if (c1.length >= 3) {
        for (const [r2, c2] of rankGroups) {
          if (r1 === r2) continue;
          if (c2.length >= 2) results.push([...c1.slice(0,3), ...c2.slice(0,2)]);
        }
      }
    }

    // review-P1 修复：补连对（3 连对）与钢板（2 连三张）候选——此前 NPC 永远不会领这两类牌型
    const pairRanks = [...rankGroups.keys()].filter(r => r >= 2 && r <= 14 && rankGroups.get(r).length >= 2).sort((a, b) => a - b);
    for (let i = 0; i <= pairRanks.length - 3; i++) {
      const seq = pairRanks.slice(i, i + 3);
      if (seq[0] >= 3 && isConsecutiveArr(seq)) {
        results.push(seq.flatMap(r => rankGroups.get(r).slice(0, 2)));
      }
    }
    const tripleRanks = [...rankGroups.keys()].filter(r => r >= 2 && r <= 14 && rankGroups.get(r).length >= 3).sort((a, b) => a - b);
    for (let i = 0; i <= tripleRanks.length - 2; i++) {
      const seq = tripleRanks.slice(i, i + 2);
      if (seq[0] >= 3 && isConsecutiveArr(seq)) {
        results.push(seq.flatMap(r => rankGroups.get(r).slice(0, 3)));
      }
    }

    // 基础顺子 (简单查找不带万能牌的)
    const sortedRanks = [...rankGroups.keys()].filter(r => r >= 3 && r <= 14).sort((a,b) => a-b);
    for (let i = 0; i <= sortedRanks.length - 5; i++) {
        const seq = sortedRanks.slice(i, i + 5);
        if (isConsecutiveArr(seq)) {
            results.push(seq.map(r => rankGroups.get(r)[0]));
        }
    }

    // 万能牌填补顺子缺口
    if (numWilds >= 1) {
      for (let start = 3; start <= 10; start++) {
        let gaps = 0, hasRegular = false;
        for (let r = start; r < start + 5; r++) {
          if (rankGroups.has(r) && rankGroups.get(r).length > 0) hasRegular = true;
          else gaps++;
        }
        if (hasRegular && gaps > 0 && gaps <= numWilds) {
          const cards = [];
          let wIdx = 0;
          for (let r = start; r < start + 5; r++) {
            const rCards = rankGroups.get(r);
            if (rCards && rCards.length > 0) cards.push(rCards[0]);
            else cards.push(wilds[wIdx++]);
          }
          results.push(cards);
        }
      }
    }

    // 进化修复：rank 炸弹候选——free play 原来连自然炸都不枚举（NPC 领牌永远不能主动出炸），
    // 万能牌补足炸弹（3+1 / 2+2）更是全枚举器缺失（识别层支持、生成层没有 → NPC/提示永远打不出）
    for (const [rank, cards] of rankGroups) {
      if (rank >= 15) continue;   // 王不组 rank 炸（天王炸单独；万能牌也不可替王）
      if (cards.length >= 4) {
        results.push(cards.slice(0, 4));
        if (cards.length > 4) results.push([...cards]);   // 全量大炸（5-8 张）
      } else if (cards.length >= 2 && cards.length + numWilds >= 4) {
        results.push([...cards, ...wilds.slice(0, 4 - cards.length)]);
      }
    }

    // 进化修复：万能牌救孤张——自然三张 + (孤张+万能) 成三带二
    if (numWilds >= 1) {
      for (const [r1, c1] of rankGroups) {
        if (c1.length < 3) continue;
        for (const [r2, c2] of rankGroups) {
          if (r1 === r2 || c2.length !== 1) continue;
          results.push([...c1.slice(0, 3), c2[0], wilds[0]]);
        }
      }
    }

    // 进化修复：万能牌填补连对（3 连对）/ 钢板（2 连三张）缺口
    if (numWilds >= 1) {
      for (const [windowLen, perRank, wantType] of [[3, 2, HandType.DOUBLE_STRAIGHT], [2, 3, HandType.TRIPLE_STRAIGHT]]) {
        for (let start = 3; start <= 14 - windowLen + 1; start++) {
          let need = 0, hasNatural = false;
          const cards = [];
          for (let r = start; r < start + windowLen; r++) {
            const have = (rankGroups.get(r) || []).slice(0, perRank);
            if (have.length > 0) hasNatural = true;
            cards.push(...have);
            need += perRank - have.length;
          }
          if (hasNatural && need > 0 && need <= numWilds) {
            const candidate = [...cards, ...wilds.slice(0, need)];
            const cls = classifyHand(candidate, currentLevel);
            if (cls.type === wantType) results.push(candidate);
          }
        }
      }
    }

    // 查找并添加同花顺提示
    const straightFlushes = findStraightFlushes(handCards, 3, 14, currentLevel);
    results.push(...straightFlushes);

    // 检查天王炸（4张王，rank >= 15）
    const kings = handCards.filter(c => c.rank >= 15);
    if (kings.length >= 4) {
      results.push(kings.slice(0, 4));
    }

    return results.slice(0, 80); // 进化修复：候选含炸弹/wild 组合后 60 会截断
  }

  const lastNormalizedMain = lastPlay.mainRank; 

  if (lastPlay.type === HandType.SINGLE) {
    for (const card of handCards) {
      if (getNormalizedRank(card.rank, currentLevel) > lastNormalizedMain) {
        results.push([card]);
      }
    }
  } else if (lastPlay.type === HandType.PAIR) {
    // 1. 纯对子
    for (const [rank, cards] of rankGroups) {
      if (cards.length >= 2 && getNormalizedRank(rank, currentLevel) > lastNormalizedMain) {
        results.push(cards.slice(0, 2));
      }
    }
    // 2. 1+1
    if (numWilds >= 1) {
      for (const [rank, cards] of rankGroups) {
        if (rank >= 15) continue;   // review 修复：万能牌不与大小王组对
        if (cards.length === 1 && getNormalizedRank(rank, currentLevel) > lastNormalizedMain) {
          results.push([cards[0], wilds[0]]);
        }
      }
    }
  } else if (lastPlay.type === HandType.TRIPLE) {
    for (const [rank, cards] of rankGroups) {
      if (cards.length >= 3 && getNormalizedRank(rank, currentLevel) > lastNormalizedMain) {
        results.push(cards.slice(0, 3));
      }
    }
    if (numWilds >= 1) {
      for (const [rank, cards] of rankGroups) {
        if (rank >= 15) continue;   // review 修复：万能牌不与大小王组三张
        if (cards.length === 2 && getNormalizedRank(rank, currentLevel) > lastNormalizedMain) {
          results.push([...cards.slice(0, 2), wilds[0]]);
        }
      }
    }
  } else if (lastPlay.type === HandType.STRAIGHT) {
    const len = lastPlay.length;
    const sortedRanks = [...rankGroups.keys()].filter(r => r >= 3 && r <= 14).sort((a, b) => a - b);
    for (let i = 0; i <= sortedRanks.length - len; i++) {
      const seq = sortedRanks.slice(i, i + len);
      if (seq.length === len && isConsecutiveArr(seq) && seq[len - 1] > lastPlay.mainRank) {
        results.push(seq.map(r => rankGroups.get(r)[0]));
      }
    }
    // 万能牌填补顺子缺口
    if (numWilds >= 1) {
      for (let start = 3; start <= 14 - len + 1; start++) {
        let gaps = 0, hasRegular = false;
        for (let r = start; r < start + len; r++) {
          if (rankGroups.has(r) && rankGroups.get(r).length > 0) hasRegular = true;
          else gaps++;
        }
        if (hasRegular && gaps > 0 && gaps <= numWilds) {
          const cards = [];
          let wIdx = 0;
          for (let r = start; r < start + len; r++) {
            const rCards = rankGroups.get(r);
            if (rCards && rCards.length > 0) cards.push(rCards[0]);
            else cards.push(wilds[wIdx++]);
          }
          const classified = classifyHand(cards, currentLevel);
          if (classified.type === HandType.STRAIGHT && classified.mainRank > lastPlay.mainRank) {
            results.push(cards);
          }
        }
      }
    }
  } else if (lastPlay.type === HandType.TRIPLE_PAIR) {
    // 三带二：管三张部分
    for (const [r1, c1] of rankGroups) {
      if (c1.length >= 3 && getNormalizedRank(r1, currentLevel) > lastNormalizedMain) {
        for (const [r2, c2] of rankGroups) {
          if (r1 === r2) continue;
          if (c2.length >= 2) results.push([...c1.slice(0,3), ...c2.slice(0,2)]);
        }
      }
    }
    // 进化修复：万能牌补法（原完全缺失）——① 三张+孤张+万能成对 ② 对子+万能成三张+自然对
    if (numWilds >= 1) {
      for (const [r1, c1] of rankGroups) {
        const norm1 = getNormalizedRank(r1, currentLevel);
        if (c1.length >= 3 && norm1 > lastNormalizedMain) {
          const singles = [...rankGroups.entries()].filter(([r2, c2]) => r2 !== r1 && c2.length === 1)
            .sort((a, b) => a[0] - b[0]);
          if (singles.length > 0) results.push([...c1.slice(0, 3), singles[0][1][0], wilds[0]]);
        }
        if (c1.length === 2 && norm1 > lastNormalizedMain) {
          const pairs = [...rankGroups.entries()].filter(([r2, c2]) => r2 !== r1 && c2.length >= 2)
            .sort((a, b) => a[0] - b[0]);
          if (pairs.length > 0) results.push([...c1, wilds[0], ...pairs[0][1].slice(0, 2)]);
        }
      }
    }
  } else if (lastPlay.type === HandType.DOUBLE_STRAIGHT || lastPlay.type === HandType.TRIPLE_STRAIGHT) {
    const len = lastPlay.length;
    const perRank = lastPlay.type === HandType.DOUBLE_STRAIGHT ? 2 : 3;
    const validRanks = [...rankGroups.entries()]
      .filter(([r, cs]) => r >= 3 && r <= 14 && cs.length >= perRank)
      .map(([r]) => r).sort((a, b) => a - b);
    for (let i = 0; i <= validRanks.length - len; i++) {
      const seq = validRanks.slice(i, i + len);
      if (seq.length === len && isConsecutiveArr(seq) && seq[len - 1] > lastPlay.mainRank) {
        results.push(seq.flatMap(r => rankGroups.get(r).slice(0, perRank)));
      }
    }
    // 进化修复：万能牌填补连对/钢板缺口跟牌（原完全缺失）
    if (numWilds >= 1) {
      for (let start = 3; start <= 14 - len + 1; start++) {
        let need = 0, hasNatural = false;
        const cards = [];
        for (let r = start; r < start + len; r++) {
          const have = (rankGroups.get(r) || []).slice(0, perRank);
          if (have.length > 0) hasNatural = true;
          cards.push(...have);
          need += perRank - have.length;
        }
        if (hasNatural && need > 0 && need <= numWilds) {
          const candidate = [...cards, ...wilds.slice(0, need)];
          const cls = classifyHand(candidate, currentLevel);
          if (cls.type === lastPlay.type && cls.mainRank > lastPlay.mainRank) results.push(candidate);
        }
      }
    }
  }

  // 找炸弹
  if (!isBomb(lastPlay.type)) {
    // 普通牌能被炸弹和同花顺压过
    for (const [rank, cards] of rankGroups) {
      if (cards.length >= 4) results.push(cards.slice(0, 4));
    }
    // 进化修复：万能牌补足 4 炸（3+1 / 2+2，原完全缺失）
    if (numWilds >= 1) {
      for (const [rank, cards] of rankGroups) {
        if (rank >= 15 || cards.length >= 4) continue;
        if (cards.length >= 2 && cards.length + numWilds >= 4) {
          results.push([...cards, ...wilds.slice(0, 4 - cards.length)]);
        }
      }
    }

    // 添加同花顺（同花顺是炸弹级别）
    const straightFlushes = findStraightFlushes(handCards, 3, 14, currentLevel);
    results.push(...straightFlushes);

    // 添加天王炸
    const kings = handCards.filter(c => c.rank >= 15);
    if (kings.length >= 4) {
      results.push(kings.slice(0, 4));
    }
  } else {
    // 上一手是炸弹，需要更大的炸弹才能压
    const lastPower = getBombPower(lastPlay.type);

    // 比较四张及以上的牌
    for (const [rank, cards] of rankGroups) {
      if (cards.length >= 4) {
        const bombType = getBombTypeForCount(cards.length);
        const power = getBombPower(bombType);
        // review-P1 修复：同威力炸弹比 normalized rank（级牌炸弹此前永远压不过 raw rank 更大的炸弹）
        if (power > lastPower || (power === lastPower && getNormalizedRank(rank, currentLevel) > lastPlay.mainRank)) {
          results.push(cards);
        }
      }
    }
    // 进化修复：万能牌补炸压炸（补到"刚好能压"的最小张数）
    if (numWilds >= 1) {
      for (const [rank, cards] of rankGroups) {
        if (rank >= 15 || cards.length >= 4 || cards.length < 2) continue;
        for (let size = 4; size <= cards.length + numWilds && size <= 8; size++) {
          const power = getBombPower(getBombTypeForCount(size));
          if (power > lastPower || (power === lastPower && getNormalizedRank(rank, currentLevel) > lastPlay.mainRank)) {
            if (size > cards.length) {
              results.push([...cards, ...wilds.slice(0, size - cards.length)]);
            }
            break;   // 最小可压尺寸即止
          }
        }
      }
    }

    // E3 修复：同花顺候选必须按炸弹威力比较
    // 旧 bug 1：上一手是天王炸/7炸/8炸（威力 > 同花顺）时仍列同花顺 → engine 必拒（"炸弹不够大"）
    // 旧 bug 2：上一手是同花顺时，更大的同花顺反而不被列为候选（漏选项）
    const sfPower = getBombPower(HandType.STRAIGHT_FLUSH);
    if (sfPower > lastPower) {
      results.push(...findStraightFlushes(handCards, 3, 14, currentLevel));
    } else if (lastPlay.type === HandType.STRAIGHT_FLUSH) {
      const bigger = findStraightFlushes(handCards, 3, 14, currentLevel)
        .filter(sf => classifyHand(sf, currentLevel).mainRank > lastPlay.mainRank);
      results.push(...bigger);
    }

    // 如果上一手不是天王炸，检查是否有天王炸
    if (lastPlay.type !== HandType.ROCKET) {
      const kings = handCards.filter(c => c.rank >= 15);
      if (kings.length >= 4) {
        results.push(kings.slice(0, 4));
      }
    }
  }

  return results.slice(0, 32);   // 进化修复：wild 组合候选增多，24 会截掉炸弹
}

function isConsecutiveArr(arr) {
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] - arr[i - 1] !== 1) return false;
  }
  return true;
}

function getBombTypeForCount(count) {
  const map = { 4: HandType.BOMB_4, 5: HandType.BOMB_5, 6: HandType.BOMB_6, 7: HandType.BOMB_7, 8: HandType.BOMB_8 };
  return map[count] || HandType.INVALID;
}

/**
 * 查找同花顺（指定花色的连续牌）
 * @param {Array} handCards - 手牌
 * @param {number} minRank - 最小 rank (默认 3)
 * @param {number} maxRank - 最大 rank (默认 14，不含王牌)
 * @returns {Array} 所有找到的同花顺组合 (Card[][])
 */
function findStraightFlushes(handCards, minRank = 3, maxRank = 14, currentLevel = 2) {
  const result = [];

  // review-P2 修复：原 `c.rank === 17` 恒为假（rank 域 2-16），万能牌补缺同花顺是死代码
  const wilds = handCards.filter(c => isWildCard(c, currentLevel));
  const nonWilds = handCards.filter(c => !isWildCard(c, currentLevel));

  const wildCount = wilds.length;

  // 按花色分组非万能牌
  const suitsMap = new Map();
  for (const card of nonWilds) {
    if (!suitsMap.has(card.suit)) {
      suitsMap.set(card.suit, []);
    }
    suitsMap.get(card.suit).push(card);
  }

  // 对每个花色查找同花顺
  for (const [suit, cards] of suitsMap) {
    // 该花色的所有 rank 值（在 minRank~maxRank 范围内）
    const ranks = cards
      .map(c => c.rank)
      .filter(r => r >= minRank && r <= maxRank);
    const uniqueRanks = Array.from(new Set(ranks)).sort((a, b) => a - b);

    // 查找所有长度 >= 5 的连续序列
    for (let startIdx = 0; startIdx <= uniqueRanks.length - 5; startIdx++) {
      for (let endIdx = startIdx + 5; endIdx <= uniqueRanks.length; endIdx++) {
        const seq = uniqueRanks.slice(startIdx, endIdx);

        // 检查是否连续
        if (!isConsecutiveArr(seq)) continue;

        // 检查该序列需要多少万能牌
        const cardsNeeded = new Map();
        for (const rank of seq) {
          cardsNeeded.set(rank, 1);
        }

        let wildsNeeded = 0;
        const selectedCards = [];
        for (const rank of seq) {
          const cardsOfRank = cards.filter(c => c.rank === rank && c.suit === suit);
          if (cardsOfRank.length > 0) {
            selectedCards.push(cardsOfRank[0]);
          } else {
            wildsNeeded++;
          }
        }

        // 如果万能牌足够，添加到结果
        if (wildsNeeded <= wildCount) {
          const finalCards = [...selectedCards];
          for (let i = 0; i < wildsNeeded; i++) {
            finalCards.push(wilds[i]);
          }
          result.push(finalCards);
        }
      }
    }
  }

  return result;
}

// E2 修复（漏网之鱼）：与 engine 协会版规则对齐——进贡最大牌力的牌（红心级牌除外，王/级牌在范围内）
// 牌力：大王(16) > 小王(15) > 级牌(14.5) > A(14) > ...
function selectTributeCard(hand, currentLevel = 2) {
  const tv = c => c.rank >= 15 ? c.rank : (c.rank === currentLevel ? 14.5 : c.rank);
  const valid = hand.filter(c => !(c.suit === 1 && c.rank === currentLevel));  // 排除红心级牌
  if (valid.length === 0) return hand[0] ?? null;
  return [...valid].sort((a, b) => tv(b) - tv(a))[0];
}

function evaluateRound(finishOrder) {
  const first = finishOrder[0];
  const second = finishOrder[1];
  const last = finishOrder[3];
  const team1Seats = [0, 2];
  const firstTeam = team1Seats.includes(first) ? 1 : 2;
  const secondTeam = team1Seats.includes(second) ? 1 : 2;

  let team1Upgrade = 0, team2Upgrade = 0, description = '';
  if (firstTeam === secondTeam) {
    if (firstTeam === 1) { team1Upgrade = 3; description = '队伍1 双上！升3级'; }
    else { team2Upgrade = 3; description = '队伍2 双上！升3级'; }
  } else {
    const firstPartner = first === 0 ? 2 : first === 2 ? 0 : first === 1 ? 3 : 1;
    const partnerPosition = finishOrder.indexOf(firstPartner);
    if (partnerPosition === 2) {
      if (firstTeam === 1) { team1Upgrade = 2; description = '队伍1 升2级'; }
      else { team2Upgrade = 2; description = '队伍2 升2级'; }
    } else {
      if (firstTeam === 1) { team1Upgrade = 1; description = '队伍1 升1级'; }
      else { team2Upgrade = 1; description = '队伍2 升1级'; }
    }
  }
  return { team1Upgrade, team2Upgrade, description };
}

function upgradeLevel(currentLevel, upgrades) {
  let newLevel = currentLevel + upgrades;
  if (newLevel > 14) newLevel = 14;
  return newLevel;
}

function checkWin(teamLevel) {
  return teamLevel >= 14;
}

export {
  compareHands,
  canPlay,
  findPlayableHands,
  selectTributeCard,
  evaluateRound,
  upgradeLevel,
  checkWin,
  findStraightFlushes,
};
