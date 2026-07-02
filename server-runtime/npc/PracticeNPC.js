/**
 * PracticeNPC.js — 陪练NPC（增强规则AI v3）
 *
 * v2 Quick Wins（已有）：
 *   ① 手牌预分解     决策前把手牌拆成最优组合
 *   ② 记牌器接入     根据已出牌推断剩余/实际最大值
 *   ③ 配合策略       队友领牌主动让；护送队友完成出牌
 *   ④ 炸弹时机       基于"出完所需手数"决定是否动炸弹
 *
 * v3 新增：
 *   ⑤ 出牌顺序优化   领牌时按"对手难跟难度"评分，优先出顺子/连对/钢板；小牌当炮灰先出
 *   ⑥ 残局解算器     全场 ≤28 张时精确规划：优先出"无敌牌型"再清场
 *   ⑦ 级牌/万能牌保护 万能牌永远不单出；级牌只在端局或多张组合里消耗
 *   ⑧ 对手手牌推断   基于记牌器判断"对手出的牌是否无人能打"，避免用大牌去顶必输的牌
 *   ⑨ 信号传递       领牌时编码强/弱信号（小单→示弱，复杂牌型→示强）；读取队友信号调整策略
 */

import { findPlayableHands } from '../game/rules.js';
import { solveEndgame } from './EndgameSolver.js';
import { minTricks, minTricksLoss } from './HandEvaluator.js';
import { NPCConfig } from './NPCConfig.js';
import { simulateMidgame } from './MidgameSimulator.js';
import { isWildCard, classifyHand, isBomb as isBombType, HandType } from '../game/handClassifier.js';
import { getNormalizedRank } from '../game/deck.js';
import { createDecisionLog, inferPrimaryReason, logSkill } from './NPCDecisionLog.js';
import { getMemory } from '../game/llm_ai.js';
import { SKILLS, profileFromLevel } from './SkillProfiles.js';

/** 工具：判断 profile 是否包含某项技能 */
const has = (profile, skill) => profile.has(skill);

/** 判断 profile 是否包含任意一项"高级领牌"技能（R5-R9） */
function hasAnyAdvancedLead(profile) {
  return has(profile, SKILLS.R5)  || has(profile, SKILLS.R6) ||
         has(profile, SKILLS.R7)  || has(profile, SKILLS.R8) || has(profile, SKILLS.R9) ||
         has(profile, SKILLS.R10) || has(profile, SKILLS.R13);
}

export const AILevel = {
  NOOB: 'noob',
  NORMAL: 'normal',
  EXPERT: 'expert'
};

// ⑨ 信号类型
const Signal = {
  STRONG: 'strong',  // 我有控制权，队友跟随
  WEAK:   'weak',    // 我牌弱，队友接管
  NORMAL: 'normal'   // 中性
};

/* ============================================================
 * ① 手牌预分解
 *   贪心：依次找炸弹 → 钢板 → 连对 → 顺子 → 三张 → 对子 → 单张
 *   返回 { groups, tricksNeeded, bombGroups }
 * ========================================================== */
function decomposeHand(hand, currentLevel) {
  if (!hand || hand.length === 0) {
    return { groups: [], tricksNeeded: 0, bombGroups: [] };
  }
  let pool = hand.map(c => ({ ...c }));
  const groups = [];
  const bombGroups = [];

  const rankCount = (cards) => {
    const m = {};
    for (const c of cards) m[c.rank] = (m[c.rank] || 0) + 1;
    return m;
  };

  // 0) 进化修复：万能牌补 3 张成炸——手牌规划默认把万能牌升级进炸弹
  //    （原流程把万能牌当普通级牌划进对子/单张，"配个对子"的浪费由此而来）
  {
    let wildsAvail = pool.filter(c => isWildCard(c, currentLevel));
    while (wildsAvail.length > 0) {
      const naturals = pool.filter(c => !isWildCard(c, currentLevel));
      const counts = rankCount(naturals);
      let best = -1;
      for (const [r, cnt] of Object.entries(counts)) {
        if (cnt === 3 && +r < 15 && +r > best) best = +r;
      }
      if (best < 0) break;
      const trio = naturals.filter(c => c.rank === best);
      const taken = [...trio, wildsAvail[0]];
      const ids = new Set(taken.map(c => c.id));
      pool = pool.filter(c => !ids.has(c.id));
      groups.push({ kind: 'bomb', rank: best, cards: taken });
      bombGroups.push({ rank: best, size: 4 });
      wildsAvail = pool.filter(c => isWildCard(c, currentLevel));
    }
  }

  // 1) 找原生炸弹（4+ 张同 rank）
  while (true) {
    const counts = rankCount(pool);
    let bombRank = -1, bombSize = 0;
    for (const [r, n] of Object.entries(counts)) {
      if (n >= 4 && (n > bombSize || (n === bombSize && +r > bombRank))) {
        bombRank = +r; bombSize = n;
      }
    }
    if (bombRank < 0) break;
    const taken = pool.filter(c => c.rank === bombRank);
    pool = pool.filter(c => c.rank !== bombRank);
    groups.push({ kind: 'bomb', rank: bombRank, cards: taken });
    bombGroups.push({ rank: bombRank, size: bombSize });
  }

  // 2) 找天王炸（4 王）
  const jokers = pool.filter(c => c.rank === 15 || c.rank === 16);
  if (jokers.length === 4) {
    pool = pool.filter(c => c.rank !== 15 && c.rank !== 16);
    groups.push({ kind: 'rocket', rank: 99, cards: jokers });
    bombGroups.push({ rank: 99, size: 4 });
  }

  // 3) 找钢板（连续 2 组三张）
  while (true) {
    const counts = rankCount(pool);
    let bestStart = -1, bestLen = 0;
    for (let r = 2; r <= 13; r++) {
      let len = 0;
      while (r + len <= 14 && (counts[r + len] || 0) >= 3) len++;
      if (len >= 2 && len > bestLen) { bestStart = r; bestLen = len; }
    }
    if (bestStart < 0) break;
    const taken = [];
    for (let r = bestStart; r < bestStart + bestLen; r++) {
      const cards = pool.filter(c => c.rank === r).slice(0, 3);
      taken.push(...cards);
    }
    const ids = new Set(taken.map(c => c.id));
    pool = pool.filter(c => !ids.has(c.id));
    groups.push({ kind: 'triple_straight', rank: bestStart, cards: taken });
  }

  // 4) 找连对（连续 3 对及以上）
  while (true) {
    const counts = rankCount(pool);
    let bestStart = -1, bestLen = 0;
    for (let r = 2; r <= 13; r++) {
      let len = 0;
      while (r + len <= 14 && (counts[r + len] || 0) >= 2) len++;
      if (len >= 3 && len > bestLen) { bestStart = r; bestLen = len; }
    }
    if (bestStart < 0) break;
    const taken = [];
    for (let r = bestStart; r < bestStart + bestLen; r++) {
      const cards = pool.filter(c => c.rank === r).slice(0, 2);
      taken.push(...cards);
    }
    const ids = new Set(taken.map(c => c.id));
    pool = pool.filter(c => !ids.has(c.id));
    groups.push({ kind: 'double_straight', rank: bestStart, cards: taken });
  }

  // 5) 找顺子（连续 5 张）
  while (true) {
    const counts = rankCount(pool);
    let bestStart = -1, bestLen = 0;
    for (let r = 2; r <= 10; r++) {
      let len = 0;
      while (r + len <= 14 && (counts[r + len] || 0) >= 1) len++;
      if (len >= 5 && len > bestLen) { bestStart = r; bestLen = Math.min(len, 8); }
    }
    if (bestStart < 0) break;
    const len = Math.min(bestLen, 5);
    const taken = [];
    for (let r = bestStart; r < bestStart + len; r++) {
      const card = pool.find(c => c.rank === r);
      if (card) taken.push(card);
    }
    const ids = new Set(taken.map(c => c.id));
    pool = pool.filter(c => !ids.has(c.id));
    groups.push({ kind: 'straight', rank: bestStart, cards: taken });
  }

  // 6) 找三张
  {
    const counts = rankCount(pool);
    for (let r = 2; r <= 14; r++) {
      while ((counts[r] || 0) >= 3) {
        const taken = pool.filter(c => c.rank === r).slice(0, 3);
        const ids = new Set(taken.map(c => c.id));
        pool = pool.filter(c => !ids.has(c.id));
        counts[r] -= 3;
        groups.push({ kind: 'triple', rank: r, cards: taken });
      }
    }
  }

  // 7) 找对子
  {
    const counts = rankCount(pool);
    for (let r = 2; r <= 16; r++) {
      while ((counts[r] || 0) >= 2) {
        const taken = pool.filter(c => c.rank === r).slice(0, 2);
        const ids = new Set(taken.map(c => c.id));
        pool = pool.filter(c => !ids.has(c.id));
        counts[r] -= 2;
        groups.push({ kind: 'pair', rank: r, cards: taken });
      }
    }
  }

  // 8) 剩余单张
  for (const c of pool) {
    groups.push({ kind: 'single', rank: c.rank, cards: [c] });
  }

  // 三带二：把孤立三张和孤立对子合并
  const triples = groups.filter(g => g.kind === 'triple');
  const pairs = groups.filter(g => g.kind === 'pair');
  const merged = [];
  const used = new Set();
  for (const t of triples) {
    if (pairs.length === 0) break;
    const p = pairs.find(x => !used.has(x));
    if (!p) break;
    used.add(t); used.add(p);
    merged.push({ kind: 'triple_pair', rank: t.rank, cards: [...t.cards, ...p.cards] });
  }
  const finalGroups = groups.filter(g => !used.has(g)).concat(merged);

  return {
    groups: finalGroups,
    tricksNeeded: finalGroups.length,
    bombGroups
  };
}

/* ============================================================
 * ② 记牌器接入
 * ========================================================== */
function getPlayedCount(memory, rank) {
  if (!memory || !memory.playedCount) return 0;
  return memory.playedCount[rank] || 0;
}

function isEffectivelyMax(rank, kind, memory, currentLevel) {
  // 注意：rank 参数是 normalized mainRank（大王17/小王16/级牌15/其余=raw）
  // 进化修复：原实现把 normalized 当 raw 用且神秘跳过 r=15，级牌/王的推断全错位
  if (!memory) return false;
  if (rank >= 17) return true;   // 大王
  const totalOf = (r) => (r === 15 || r === 16) ? 2 : 8;
  const minNeeded = kind === 'pair' ? 2 : (kind === 'triple' ? 3 : 1);

  for (let r = 2; r <= 16; r++) {   // r 是 raw rank
    if (getNormalizedRank(r, currentLevel) <= rank) continue;  // 压不过
    const remaining = totalOf(r) - getPlayedCount(memory, r);
    if (remaining >= minNeeded) return false;
  }
  return true;
}

/* ============================================================
 * ⑧ 对手手牌推断
 * ========================================================== */

/** 判断"我们的出牌"是否无人能打过（基于记牌推断） */
function isMyPlayUnbeatable(play, memory, currentLevel, includeSequences = false, hand = null) {
  // 进化修复（3 处）：① 比较改 normalized 域（原把 raw 当 normalized，漏判级牌反压）
  // ② 王总张数 4→2（原 bug 使单张 A/小王永远算不出无敌，+55 被大王独占）
  // ③ 可选传 hand：自己拿着的牌不可能在对手手里，扣除后推断更准
  // 已知保守缺口：未建模对手用万能牌配对反压、炸弹炸单张——勿据此做高风险弃大牌决策
  if (!memory || !play || play.length === 0) return false;
  if (looksLikeBomb(play, currentLevel)) return true;

  const len = play.length;
  const needed = len === 1 ? 1 : len === 2 ? 2 : len === 3 ? 3 : 0;
  if (needed > 0) {
    const myNorm = classifyHand(play, currentLevel).mainRank;   // normalized
    const totalOf = (r) => (r === 15 || r === 16) ? 2 : 8;
    for (let r = 2; r <= 16; r++) {   // raw rank
      if (getNormalizedRank(r, currentLevel) <= myNorm) continue;
      let remaining = totalOf(r) - (memory.playedCount[r] || 0);
      if (hand) remaining -= hand.filter(c => c.rank === r).length;
      if (remaining >= needed) return false;
    }
    return true;
  }

  // R10 增强：顺子序列无敌推断
  if (includeSequences) return isSequenceUnbeatable(play, memory, currentLevel);
  return false;
}

/** 进化修复：在按成本升序的候选中找"最便宜但压得死"的一手（最小代价压制，留王断后） */
function cheapestDominant(normalPlays, memory, currentLevel, hand) {
  if (!memory) return null;
  for (const p of normalPlays) {
    if (isMyPlayUnbeatable(p, memory, currentLevel, false, hand)) return p;
  }
  return null;
}

/**
 * R10 增强推断：纯顺子（无万能牌）是否已是场上最高、无人能跟
 * 思路：遍历所有可能"比我高"的同长度顺子，若每条都因某 rank 无牌而不可能，则我的顺子无敌。
 */
function isSequenceUnbeatable(play, memory, currentLevel) {
  if (!memory) return false;
  // 只处理纯顺子（不含万能牌，避免复杂情况）
  const wilds = play.filter(c => isWildCard(c, currentLevel));
  if (wilds.length > 0) return false;

  const sorted = [...play.map(c => c.rank)].sort((a, b) => a - b);
  const len = sorted.length;
  if (len < 5) return false; // 顺子至少 5 张

  // 验证是否连续
  for (let i = 1; i < len; i++) {
    if (sorted[i] !== sorted[i - 1] + 1) return false;
  }

  const startRank = sorted[0];

  // 枚举所有能打过我顺子的"更高起点"顺子
  for (let s = startRank + 1; s <= 14 - len + 1; s++) {
    let counterPossible = true;
    for (let r = s; r < s + len; r++) {
      const played = memory.playedCount[r] || 0;
      const remaining = 8 - played; // 每个普通 rank 共 8 张
      if (remaining <= 0) { counterPossible = false; break; }
    }
    if (counterPossible) return false; // 该反制顺子仍可能存在
  }
  return true; // 所有反制路径均已封死
}

/** 判断"桌面上对手出的牌"是否无人能打过（应该 PASS 省大牌） */
function isLastPlayUnbeatable(lastPlay, memory, currentLevel) {
  if (!memory || !lastPlay) return false;
  const kind = inferKind(lastPlay);
  // 只处理 single/pair/triple
  if (kind === 'other') return false;
  return isEffectivelyMax(lastPlay.mainRank, kind, memory, currentLevel);
}

/* ============================================================
 * ⑨ 信号传递
 * ========================================================== */

/** 根据自己的手牌强度，计算应该发出的信号 */
function computeMySignal(hand, decomp, currentLevel) {
  if (!hand || hand.length === 0) return Signal.NORMAL;
  const bombCount = decomp.bombGroups.length;
  const bigCards = hand.filter(c =>
    c.rank >= 13 || c.rank === currentLevel ||
    c.rank === 15 || c.rank === 16
  ).length;
  const ratio = bigCards / hand.length;
  const hasComplexGroup = decomp.groups.some(g =>
    g.kind === 'straight' || g.kind === 'double_straight' || g.kind === 'triple_straight'
  );

  if (bombCount >= 2 || ratio >= 0.4 || hasComplexGroup) return Signal.STRONG;
  if (ratio <= 0.1 && hand.length >= 10 && bombCount === 0) return Signal.WEAK;
  return Signal.NORMAL;
}

/** 读取队友最近出牌，解码其信号 */
function readTeammateSignal(gameState) {
  const { seat, roundHistory = [] } = gameState;
  if (!roundHistory.length) return Signal.NORMAL;
  const teammateSeat = (seat + 2) % 4;

  for (let i = roundHistory.length - 1; i >= 0; i--) {
    const record = roundHistory[i];
    if (record.seat !== teammateSeat) continue;
    const cards = record.cards || [];
    if (cards.length === 0) continue; // PASS 不计

    const maxRank = Math.max(...cards.map(c => c.rank));
    const isBombPlay = looksLikeBomb(cards);

    if (isBombPlay) return Signal.STRONG;                             // 炸弹 → 强
    if (cards.length >= 4) return Signal.STRONG;                      // 复杂牌型 → 强
    // 审计#4 修复：级牌/王单张 normalized 后是强牌，不能因 raw rank 小就判"示弱"
    //（否则低级牌局队友领级牌单张会被误判弱 → 抢墩）
    const isStrongSingle = maxRank >= 15 || maxRank === gameState.currentLevel;
    if (cards.length === 1 && maxRank <= 7 && !isStrongSingle) return Signal.WEAK;  // 小单张 → 弱
    if (cards.length === 1 && maxRank >= 14) return Signal.STRONG;    // 大单张(A) → 强
    return Signal.NORMAL;
  }
  return Signal.NORMAL;
}

/* ============================================================
 * ⑦ 级牌/万能牌工具函数
 * ========================================================== */
function hasWildCard(play, currentLevel) {
  return play.some(c => isWildCard(c, currentLevel));
}

function hasLevelCard(play, currentLevel) {
  return play.some(c => c.rank === currentLevel && !isWildCard(c, currentLevel));
}

/**
 * 过滤不必要使用级牌/万能牌的选项。
 * 仅在有替代方案时过滤；如果只有含级牌的选项，则不过滤。
 */
function filterLevelCardAbuse(plays, currentLevel, context = 'lead') {
  if (!plays || plays.length === 0) return plays;

  const withoutWild = plays.filter(p => !hasWildCard(p, currentLevel));
  // 万能牌：始终优先避免（除非只有含万能的选项）
  const candidates = withoutWild.length > 0 ? withoutWild : plays;

  if (context === 'lead') {
    // 领牌时：对子/单张不出级牌，除非无他选
    const withoutLevelSingle = candidates.filter(p =>
      !(p.length <= 2 && hasLevelCard(p, currentLevel))
    );
    return withoutLevelSingle.length > 0 ? withoutLevelSingle : candidates;
  }
  return candidates;
}

/* ============================================================
 * ③ 配合策略：判断是否应"主动让"
 * ========================================================== */
function shouldYieldToTeammate(gameState, hand, currentLevel) {
  const { isTeammateWinning, playersHandCounts = [], seat, lastPlay } = gameState;
  if (!isTeammateWinning) return false;
  if (!lastPlay) return false;

  const leftCount  = playersHandCounts[(seat + 3) % 4] || 27;
  const rightCount = playersHandCounts[(seat + 1) % 4] || 27;
  const opponentNearWin = (leftCount > 0 && leftCount <= 4) || (rightCount > 0 && rightCount <= 4);

  if (opponentNearWin) return false;    // 对手快赢 → 必须顶
  // 审计#4 修复：原"≤5张就不让路"会无脑压稳赢的队友抢墩（91.7% 烧掉控制牌）。
  // 改为：仅当能【一手清完】才不让（真抢着走人）；否则即便手少也走正常让路判断
  if (hand.length <= 5) {
    const clearHints = findPlayableHands(hand, lastPlay, currentLevel);
    if (clearHints.some(p => p.length === hand.length)) return false;  // 能一手走人 → 抢
    // 否则 fall through：不为抢一墩白烧控制牌
  }

  // ⑨ 信号：队友示弱时，判断是否需要支援
  const tmSignal = readTeammateSignal(gameState);
  if (tmSignal === Signal.WEAK && hand.length <= 10) {
    // 队友示弱，自己手牌还行 → 不完全让路，保留一定主动权
    return false;
  }

  return true; // 其他场景：让出主动权
}

/* ============================================================
 * ④ 炸弹时机
 * ========================================================== */
function shouldUseBomb(gameState, hand, decomp, opponentNearWin, isResponding, bombPlay = null) {
  const _B = gameState._personaCfg?.bomb || NPCConfig.bomb;   // 批2-① 牌友性格权重（无 persona=原行为）
  if (hand.length <= _B.handTrivial) return true;   // 残局收尾
  if (opponentNearWin) return true;                  // 拦截快赢的对手
  if (decomp.tricksNeeded <= _B.tricksLow) return true;  // 我也快赢，炸弹清场
  // R2 收益化：跟牌没普通牌能压时，按"抢回出牌权的价值"决定（替代原 tricks>4 一刀切禁炸）
  if (!isResponding) return false;
  const tricks = decomp.tricksNeeded;
  const { playersHandCounts = [], seat, currentLevel } = gameState;
  const oppMin = Math.min(playersHandCounts[(seat + 1) % 4] ?? 27, playersHandCounts[(seat + 3) % 4] ?? 27);
  const bombSize = bombPlay ? bombPlay.length : 4;
  let value = 0;
  value += (_B.tricksValueBase - tricks) * _B.tricksValueWeight;   // 越接近赢，抢权越值
  value += (_B.oppThreatBase - oppMin) * _B.oppThreatWeight;        // 对手越少越该拦
  value -= Math.max(0, bombSize - 4) * _B.bombSizeCost;             // 大炸弹更该留
  // 病例修复（外科版）：仅当「拿≥2张万能的炸弹去压一张单牌」时重罚——这正是老铁标的浪费。
  // 普通含万能炸弹（抢权/压对子+）不罚：台子证明那类是净正收益。
  const wildInBomb = bombPlay ? bombPlay.filter(c => isWildCard(c, currentLevel)).length : 0;
  const vsSingle = gameState.lastPlay && (gameState.lastPlay.length === 1 || gameState.lastPlay.type === HandType.SINGLE);
  if (wildInBomb >= 2 && vsSingle) value -= wildInBomb * _B.wildBombCost;
  return value >= _B.useThreshold;
}

/* ============================================================
 * ⑥ 残局解算器
 *   全场剩余 ≤28 张时启用：优先出"无敌牌型"，其次出张数最多的
 * ========================================================== */
function endgameSolve(hand, hints, gameState, currentLevel, memory) {
  const { playersHandCounts = [], seat } = gameState;
  const otherCount = playersHandCounts.reduce((s, c, i) => i === seat ? s : s + (c || 0), 0);
  const totalCards = otherCount + hand.length;
  if (totalCards > 28) return null; // 非残局

  if (!hints || hints.length === 0) return null;
  const normalHints = hints.filter(p => !looksLikeBomb(p, currentLevel));
  if (normalHints.length === 0) return null;

  // 优先：记牌推断的"无敌牌型"
  // 进化修复：无敌【单张】只在清手在望（≤3 手）时才抢先甩——原全场≤28 张就把
  // 大王当"无敌"白烧；多张无敌组合不受限（烧的不是控制单张）
  if (memory) {
    const unbeatable = normalHints.filter(p => isMyPlayUnbeatable(p, memory, currentLevel, false, hand));
    if (unbeatable.length > 0) {
      const big = unbeatable.sort((a, b) =>
        b.length - a.length || evalCardsCost(a, currentLevel) - evalCardsCost(b, currentLevel)
      )[0];
      if (big.length >= 2) return big;
      const dc = decomposeHand(hand, currentLevel);
      if (dc.tricksNeeded <= 3) return big;
      // 无敌单张但清手还远 → 不在此处消耗，交回常规评分
    }
  }

  // 次优：张数最多；进化修复：同长度取成本低的（原 rank 最高 → 无记牌时也甩大牌）
  return normalHints.sort((a, b) => {
    if (b.length !== a.length) return b.length - a.length;
    return evalCardsCost(a, currentLevel) - evalCardsCost(b, currentLevel);
  })[0];
}

/* ============================================================
 * ⑤ 领牌评分
 *   综合考虑牌型难度 + 记牌推断 + 分组损失 + 级牌浪费 + rank
 * ========================================================== */
function scoreLeadPlay(play, hand, gameState, memory, decomp, currentLevel, fullUnbeatable = false, wildAware = false, exactLoss = false) {
  if (!play || play.length === 0) return -Infinity;
  let score = 0;
  const len = play.length;

  // 1. 牌型复杂度：对手越难跟，得分越高
  const _L = gameState._personaCfg?.lead || NPCConfig.lead;   // 批2-① 牌友性格权重（无 persona=原行为）
  if (len >= 6) score += _L.lenBonus[6];        // 长钢板/长连对
  else if (len >= 5) score += _L.lenBonus[5];   // 顺子/连对
  else if (len === 4) score += _L.lenBonus[4];  // 三带一等
  else if (len === 3) score += _L.lenBonus[3];  // 三张
  else if (len === 2) score += _L.lenBonus[2];  // 对子
  // 单张 = 0

  // 2. 记牌推断：无敌牌奖励（进化修复：与清手进度挂钩——原无条件 +55 使
  //    NPC 开局就甩大王"早出占便宜"；现在残局全奖、中盘只奖组合型、控制单张不奖）
  if (memory && isMyPlayUnbeatable(play, memory, currentLevel, fullUnbeatable, hand)) {
    const isControlSingle = len === 1 && (play[0].rank >= 15 || isWildCard(play[0], currentLevel));
    // 病例修复：控制型无敌单张（大王/小王/万能）领出永远不奖励——领牌单出大王是纯浪费
    //（对手 pass 后又轮到我领，大牌白丢）。残局变现靠"一手清完 / 无敌组合牌型"，不是单张大王
    if (isControlSingle) {
      // 不加分
    } else if (hand.length <= _L.unbeatableHandThreshold) {
      score += _L.unbeatableEndgame;   // 残局：无敌【组合】牌赶紧变现
    } else {
      score += _L.unbeatableMidgame;   // 中盘：组合型无敌适度奖励
    }
  }

  // 3. 不破坏分组：破坏越少越好（R16: 精确 DP 账本；否则贪心估计）
  const breakLoss = exactLoss
    ? minTricksLoss(hand, play, currentLevel, decomp.tricksNeeded)
    : breakageLoss(hand, play, currentLevel, decomp);
  score -= breakLoss * _L.breakLossPenalty;
  // 审计#1 修复：领牌"不减总手数"= 白费一手（且常拆炸/割裂手型）。这是结构性损失，
  // 不该被长牌型的长度奖励(+45/+35 + len*4)抵消——加一条硬惩罚。实测 master 领牌
  // 头号低级失误(2.9次/局)，-50 可在样例中翻转（钢板/割裂顺子 → 改出散牌降手数）。
  if (breakLoss >= 1) score -= _L.breakLossHardPenalty;

  // 4. 万能牌扣分（R11启用时顺子中扣分较少，其他场合严格保护）
  const wildCount = play.filter(c => isWildCard(c, currentLevel)).length;
  // 审计#6 修复：万能牌折扣(35)只在它真填【序列牌型】缺口(顺子/连对/钢板)时给；
  // 塞进对子/三张/三带二当垫牌应严格保护(90)——别把百搭牌当普通垫牌浪费。
  let isSeqWild = false;
  if (wildCount > 0 && len >= 5 && wildAware) {
    const t = classifyHand(play, currentLevel).type;
    isSeqWild = (t === HandType.STRAIGHT || t === HandType.DOUBLE_STRAIGHT
      || t === HandType.TRIPLE_STRAIGHT || t === HandType.STRAIGHT_FLUSH);
  }
  const penaltyPerWild = isSeqWild ? _L.wildSeqPenalty : _L.wildOtherPenalty;
  score -= wildCount * penaltyPerWild;

  // 5. 普通级牌扣分（中等保护）
  const levelCount = play.filter(c => c.rank === currentLevel && !isWildCard(c, currentLevel)).length;
  score -= levelCount * _L.levelPenalty;

  // 6. 平均 rank 越低越好（留大牌后手）
  const avgRank = play.reduce((s, c) => s + c.rank, 0) / len;
  score -= avgRank * _L.avgRankPenalty;

  // 7. 出的张数越多越好（一次减少更多手数）
  score += len * _L.lenReward;

  // 8. 进化修复：控制牌（王）保留成本——手牌多时不轻动，残局豁免
  const controlCount = play.filter(c => c.rank >= 15).length;
  if (hand.length > _L.controlReserveHandThreshold) score -= controlCount * _L.controlReserve;

  return score;
}

/* ============================================================
 * R11 万能牌感知拆牌
 * ========================================================== */

/**
 * 尝试利用万能牌填补顺子缺口，返回比贪心分组更优的结果（手数更少），
 * 或原始贪心结果（若无改善）。
 */
function decomposeHandWildAware(hand, currentLevel) {
  const wilds = hand.filter(c => isWildCard(c, currentLevel));
  if (wilds.length === 0) return decomposeHand(hand, currentLevel);

  const baseline = decomposeHand(hand, currentLevel);
  const improved = tryFormStraightWithWilds(hand, wilds, currentLevel);
  if (improved && improved.tricksNeeded < baseline.tricksNeeded) return improved;
  return baseline;
}

/**
 * 在手牌中找最有潜力的 5 张顺子窗口，用万能牌填补缺口后形成顺子，
 * 返回新的完整分组；若无有效改善则返回 null。
 */
function tryFormStraightWithWilds(hand, wilds, currentLevel) {
  const wildCount = wilds.length;
  const regulars  = hand.filter(c => !isWildCard(c, currentLevel));

  // rank → 可用非万能牌列表
  const rankMap = {};
  for (const c of regulars) {
    if (!rankMap[c.rank]) rankMap[c.rank] = [];
    rankMap[c.rank].push(c);
  }

  // 找缺口最少（且 ≤ wildCount）的 5 连区间
  let bestStart = -1, bestGaps = wildCount + 1;
  for (let r = 2; r <= 10; r++) {
    let gaps = 0, hasAny = false;
    for (let i = 0; i < 5; i++) {
      if ((rankMap[r + i] || []).length > 0) hasAny = true;
      else gaps++;
    }
    if (hasAny && gaps > 0 && gaps <= wildCount && gaps < bestGaps) {
      bestGaps = gaps; bestStart = r;
    }
  }
  if (bestStart < 0) return null;

  // 组成顺子：有牌用牌，缺口用万能
  const straightCards = [];
  let wildIdx = 0;
  for (let i = 0; i < 5; i++) {
    const rank = bestStart + i;
    const pool = rankMap[rank] || [];
    if (pool.length > 0) {
      straightCards.push(pool.shift());
    } else {
      straightCards.push(wilds[wildIdx++]);
    }
  }

  // 剩余牌 → 继续贪心分组
  const usedIds = new Set(straightCards.map(c => c.id));
  const remaining = hand.filter(c => !usedIds.has(c.id));
  const restDecomp = decomposeHand(remaining, currentLevel);

  return {
    groups: [{ kind: 'straight', rank: bestStart, cards: straightCards }, ...restDecomp.groups],
    tricksNeeded: 1 + restDecomp.tricksNeeded,
    bombGroups: restDecomp.bombGroups,
  };
}

/* ============================================================
 * R10 形势感知领牌加成
 * ========================================================== */

/**
 * 在 R9 基础评分之上叠加局势动态因子：
 *   · 游戏阶段（终局时鼓励多张组合快速清场）
 *   · 对手快赢（仅出"无敌牌"；弱牌则扣分）
 *   · 护送队友（队友手牌少时，出多张复杂牌拦截对手跟牌）
 */
function adaptiveLeadBonus(play, hand, gameState, memory, currentLevel, opponentNearWin) {
  let delta = 0;
  const { playersHandCounts = [], seat } = gameState;
  const teammateSeat  = (seat + 2) % 4;
  const teammateCount = playersHandCounts[teammateSeat] || 27;

  // 全场剩余牌数 → 游戏进度（0=开局，1=终局）
  const totalLeft    = playersHandCounts.reduce((s, c) => s + (c || 0), 0) + hand.length;
  const gameProgress = Math.max(0, 1 - totalLeft / 108);

  // 终局加速：每多打一张额外得分
  delta += gameProgress * play.length * 4;

  // 对手快赢：无敌牌 +50，弱牌 -35
  if (opponentNearWin) {
    // 病例修复：对手快赢时领牌应【加速清手】（多张牌型抢在对手前走完），而非消耗大牌。
    // 原"无敌牌 +50"把单张大王推成首选——领牌甩大王的元凶之一。
    if (play.length >= 2) {
      delta += play.length * 8;    // 多张牌型：越长越好（清手快 + 难跟）
      const unbeatable = memory && isMyPlayUnbeatable(play, memory, currentLevel, false, hand);
      if (unbeatable) delta += 20; // 多张且无敌：既清手又保出牌权，最优
    } else {
      const c = play[0];
      // 单张：控制牌（王/级牌）领出强烈不鼓励（留作拦截对手最后一手）；小单张清手慢也略减
      delta -= (c.rank >= 15 || c.rank === currentLevel) ? 50 : 8;
    }
  }

  // 护送队友：队友手牌 ≤8 时，多张牌型更难跟，加分
  if (teammateCount > 0 && teammateCount <= 8) {
    delta += (play.length - 1) * 6;
  }

  return delta;
}

/* ============================================================
 * 主决策入口
 * ========================================================== */
export function getAIDecision(hand, gameState, level = AILevel.NORMAL, skillProfile = null) {
  const { lastPlay, currentLevel, roomId, seat } = gameState;
  const hints = findPlayableHands(hand, lastPlay, currentLevel);
  if (hints.length === 0) return null;

  const mustPlay = !lastPlay;

  // 若未显式传入 skillProfile，则从 level 推导（向后兼容）
  const profile = skillProfile ?? profileFromLevel(level);

  let memory = null;
  if (roomId !== undefined && (level === AILevel.NORMAL || level === AILevel.EXPERT)) {
    try { memory = getMemory(roomId, seat, level, currentLevel); } catch (e) { memory = null; }
  }
  // R11：万能牌感知拆牌（比贪心更优；R11 未启用时退回标准分组）
  const decompFn = has(profile, SKILLS.R11) ? decomposeHandWildAware : decomposeHand;
  const decomp = decompFn(hand, currentLevel);
  // R16（第二档）：最少手数精确 DP 覆盖贪心估计——炸弹时机/出口规划/残局判断全部
  // 改用真实账本（贪心拆牌可比最优多 1-2 手，导致"以为还要 5 手其实 3 手"的误判）
  if (has(profile, SKILLS.R16)) {
    decomp.tricksNeeded = Math.min(decomp.tricksNeeded, minTricks(hand, currentLevel));
  }
  const ctx = { ...gameState, _memory: memory, _decomp: decomp, _exactLoss: has(profile, SKILLS.R16) };

  let decision;
  if (level === AILevel.NOOB && profile.size === 0) {
    decision = decideNoob(hints, mustPlay);
  } else {
    decision = decideStrategic(hints, hand, ctx, mustPlay, profile);
  }
  if (mustPlay && !decision) return hints[0];
  return decision;
}

/* ============================================================
 * NOOB：保持简单，30% 故意不出
 * ========================================================== */
function decideNoob(hints, mustPlay = false) {
  if (!mustPlay && Math.random() < 0.3) return null;
  return hints[Math.floor(Math.random() * hints.length)];
}

/* ============================================================
 * 核心：策略型决策（NORMAL 与 EXPERT 共用）
 * ========================================================== */
function decideStrategic(hints, hand, gameState, mustPlay, profile) {
  const {
    lastPlay, currentLevel, seat,
    playersHandCounts = [],
    _memory: memory,
    _decomp: myDecomp
  } = gameState;

  const teammateSeat = (seat + 2) % 4;
  const leftSeat  = (seat + 3) % 4;
  const rightSeat = (seat + 1) % 4;
  const teammateCount = playersHandCounts[teammateSeat] || 27;
  const leftCount  = playersHandCounts[leftSeat]  || 27;
  const rightCount = playersHandCounts[rightSeat] || 27;
  const opponentNearWin = (leftCount > 0 && leftCount <= 5) || (rightCount > 0 && rightCount <= 5);

  // ③ R1 配合：让出主动权（全量）
  if (has(profile, SKILLS.R1) && shouldYieldToTeammate(gameState, hand, currentLevel) && !mustPlay) {
    logSkill(gameState._trace, 'R1', '队友领牌且强势，主动让路（PASS）');
    return null;
  }
  // R1 缺失时：退化为概率让路
  if (!has(profile, SKILLS.R1) && gameState.isTeammateWinning && !mustPlay && Math.random() < 0.5) return null;

  // ─── S1 残局制胜探测（v1.4 大师档，B 路线最小落地）───
  // 设计教训（v1.4 第一版）："替代评分"绕过了 t-test 验证有效的 R9/R7/R8 启发式，净效果归零。
  // 现版只做"制胜路径探测"：残局中找到确定性胜利路径时才接管，其余情况交回常规启发式。
  // 紧急拦截场景（opponentNearWin）不接管。
  if (has(profile, SKILLS.S1) && !opponentNearWin) {
    const totalLeft = playersHandCounts.reduce((a, b) => a + (b || 0), 0);
    if (totalLeft > 0 && totalLeft <= 32 && hand.length <= 12 && hints.length > 0) {
      // 路径 A：一手清完 → 直接锁定
      const clearAll = hints.find(p => p.length === hand.length);
      if (clearAll) {
        logSkill(gameState._trace, 'S1', '残局制胜：一手清完全部手牌');
        return clearAll;
      }
      // 路径 B：两步锁胜——这一手不可压（保出牌权），且剩余牌一手可清完
      if (memory) {
        for (const p of hints.slice(0, 24)) {
          if (!isMyPlayUnbeatable(p, memory, currentLevel, true, hand)) continue;
          const remaining = hand.filter(c => !p.includes(c));
          if (remaining.length === 0) continue;  // 已被路径 A 覆盖
          const remainMin = has(profile, SKILLS.R16)
            ? minTricks(remaining, currentLevel)
            : decomposeHand(remaining, currentLevel).tricksNeeded;
          if (remainMin <= 1) {
            logSkill(gameState._trace, 'S1', `残局制胜：此手不可压 + 剩余一手清完（两步锁胜）`);
            return p;
          }
        }
      }
      // 未找到确定性路径 → 交回常规启发式（R9/R7/R8/R13 等）
    }
  }

  // ─── S2 残局精确求解（第四档）：S1 的快速探测没接管时，做完整的多世界求解 ───
  // 与 S1 不同，S2 在 opponentNearWin 时也接管（拦截决策正是求解器的强项）；
  // 返回 null（未触发/预算爆/全候选必输）时交回启发式抢名次
  if (has(profile, SKILLS.S2)) {
    try {
      const solved = solveEndgame(hand, gameState, currentLevel, gameState._s2opts || {});
      if (solved) {
        if (solved.action === 'pass' && !mustPlay) {
          logSkill(gameState._trace, 'S2', `残局精算：PASS 是最优（${(solved.winRate * 100).toFixed(0)}% 世界必胜）`);
          return null;
        }
        if (solved.action === 'play' && solved.play) {
          logSkill(gameState._trace, 'S2', `残局精算：多世界投票最优解（${(solved.winRate * 100).toFixed(0)}% 世界必胜）`);
          return solved.play;
        }
      }
    } catch (e) { /* 求解器异常不拖垮决策——静默交回启发式 */ }
  }

  // ─── S3 中盘多世界模拟（第三档）：S2 域外的中盘，rollout 统计 + 显著性接管 ───
  // 只在最优候选胜率显著高于次优时改判（S1 第一版教训：模拟噪声不能压过验证过的启发式）
  if (has(profile, SKILLS.S3)) {
    try {
      const sim = simulateMidgame(hand, gameState, currentLevel, gameState._s3opts || {});
      if (sim) {
        if (sim.action === 'pass' && !mustPlay) {
          logSkill(gameState._trace, 'S3', `中盘推演：PASS 显著更优（胜率 ${(sim.winRate * 100).toFixed(0)}%，领先 ${(sim.gap * 100).toFixed(0)}%）`);
          return null;
        }
        if (sim.action === 'play' && sim.play) {
          logSkill(gameState._trace, 'S3', `中盘推演：${sim.play.length} 张方案显著更优（胜率 ${(sim.winRate * 100).toFixed(0)}%，领先 ${(sim.gap * 100).toFixed(0)}%）`);
          return sim.play;
        }
      }
    } catch (e) { /* 模拟异常不拖垮决策 */ }
  }

  const sorted = [...hints].sort((a, b) =>
    evalCardsCost(a, currentLevel) - evalCardsCost(b, currentLevel)
  );
  const normalPlays = sorted.filter(p => !looksLikeBomb(p, currentLevel));
  const bombs = sorted.filter(p => looksLikeBomb(p, currentLevel));

  // ============= 领牌 =============
  if (!lastPlay) {
    return chooseLeading(normalPlays, bombs, hand, myDecomp, gameState, profile, opponentNearWin, memory);
  }

  // ============= 跟牌 =============
  // R1：精确判断队友是否在领牌（没有 R1 时不认为队友领牌，不会主动让）
  const teammateLeading = has(profile, SKILLS.R1) && gameState.isTeammateWinning;

  // 生死关头：对手快赢
  // v1.4 R2 修复：此分支原本无条件执行（所有 profile 包括 noob 都会精准拦截炸），
  // 导致 R2 在三维度 ablation 全不显著（M2 发现的 production bug）。
  // 现纳入 R2 门控：有 R2 → 精准拦截；无 R2 → 20% 随机（与后方炸弹分支的降级模式一致）
  if (opponentNearWin && !teammateLeading) {
    if (bombs.length > 0 && shouldUseBomb(gameState, hand, myDecomp, true, true, bombs[0])) {
      if (has(profile, SKILLS.R2)) {
        logSkill(gameState._trace, 'R2', '生死关头：对手快赢，精准用炸弹拦截');
        return bombs[0];
      }
      if (Math.random() < 0.2) return bombs[0];
    }
    if (normalPlays.length > 0) {
      // 审计#2 修复：opponentNearWin 跟牌只需"赢下这墩夺回出牌权"，用最便宜的能压牌即可。
      // normalPlays 已按 evalCardsCost 升序 → [0] 即最便宜能压。仅当"封死牌(无敌)"不比它贵
      // 时才用 dom（否则原逻辑会把大王甩在对手一张小单上——审计实测 2.4%/跟牌的烧牌源）。
      const cheap = normalPlays[0];
      const dom = cheapestDominant(normalPlays, memory, currentLevel, hand);
      if (dom && evalCardsCost(dom, currentLevel) <= evalCardsCost(cheap, currentLevel)) {
        logSkill(gameState._trace, 'R2', '生死拦截：最便宜的牌恰好压得死（留大牌断后）');
        return dom;
      }
      logSkill(gameState._trace, 'R2', '生死拦截：用最便宜的能压牌赢这墩，留大牌断后');
      return cheap;
    }
  }

  if (normalPlays.length > 0) {
    let candidate = normalPlays[0];

    // ⑧ R6 对手推断（增强版）：桌面牌无敌 → 更主动地 PASS
    if (has(profile, SKILLS.R6) && memory && lastPlay && !opponentNearWin && !teammateLeading) {
      if (isLastPlayUnbeatable(lastPlay, memory, currentLevel)) {
        const cost = evalCardsCost(candidate, currentLevel);
        const avgCost = cost / candidate.length;
        if (cost >= 50 || avgCost >= 15) {
          logSkill(gameState._trace, 'R6', '推断桌面牌已无敌（无人能压），跟牌成本高 → PASS');
          return null;
        }
      }
    }

    // ② R4 记牌推断：lastPlay 是实际最大
    if (has(profile, SKILLS.R4) && memory && lastPlay && !opponentNearWin) {
      const lastKind = inferKind(lastPlay);
      if (isEffectivelyMax(lastPlay.mainRank, lastKind, memory, currentLevel)) {
        const cost = evalCardsCost(candidate, currentLevel);
        if (cost >= 100) {
          logSkill(gameState._trace, 'R4', '记牌推断桌面已是最大，跟牌成本太高 → PASS');
          return null;
        }
      }
    }

    // ⑦ R5 万能牌 / 级牌保护
    if (has(profile, SKILLS.R5) && !opponentNearWin && hand.length > 5) {
      if (hasWildCard(candidate, currentLevel) && lastPlay && lastPlay.mainRank < 11) {
        const nonWild = normalPlays.filter(p => !hasWildCard(p, currentLevel));
        if (nonWild.length > 0) return nonWild[0];
        return null;
      }
      if (hasLevelCard(candidate, currentLevel) && lastPlay && lastPlay.mainRank < 8) {
        const nonLevel = normalPlays.filter(p => !hasLevelCard(p, currentLevel));
        if (nonLevel.length > 0) {
          candidate = nonLevel[0];
        } else {
          return null;
        }
      }
    }

    // 损失函数：R16 精确账本 / 贪心估计
    const lossOf = (cand) => gameState._exactLoss
      ? minTricksLoss(hand, cand, currentLevel, myDecomp.tricksNeeded)
      : breakageLoss(hand, cand, currentLevel, myDecomp);

    // ① R3 拆牌质量：尝试找破坏性更低的替代
    if (has(profile, SKILLS.R3) && hand.length > 8) {
      const breakLoss = lossOf(candidate);
      const ctrlCount = (p) => p.filter(c => c.rank >= 15 || isWildCard(c, currentLevel)).length;
      for (const alt of normalPlays.slice(0, 5)) {
        const altLoss = lossOf(alt);
        // 进化修复：1.3× 成本带宽不允许换入更多王/万能牌（原会用孤张大王替代拆小对）
        if (ctrlCount(alt) > ctrlCount(candidate)) continue;
        if (altLoss < breakLoss && evalCardsCost(alt, currentLevel) <= evalCardsCost(candidate, currentLevel) * 1.3) {
          candidate = alt;
          logSkill(gameState._trace, 'R3', `拆牌优化：换成破坏性更低的替代选项（loss ${breakLoss}→${altLoss}）`);
          break;
        }
      }
    }

    // R12 忍牌保型：R3 优化后仍高破坏且场面不紧急 → 不出（保留手型等好机会）
    if (has(profile, SKILLS.R12) && !mustPlay && !opponentNearWin && !teammateLeading && hand.length > 8) {
      if (lastPlay && lastPlay.mainRank < 10) {
        const loss = lossOf(candidate);
        if (loss >= 2) {
          logSkill(gameState._trace, 'R12', `忍牌保型：跟牌会破坏 ${loss} 个手型组合且场面不紧急 → PASS`);
          return null;
        }
      }
    }

    // R14 顺子保护：跟牌出顺子/连对时，只要有破坏（loss≥1）且场面不紧急，选择不出
    // （顺子比对子难重建，容忍度更低）
    if (has(profile, SKILLS.R14) && !mustPlay && !opponentNearWin && !teammateLeading && hand.length > 8) {
      if (candidate.length >= 5) {
        const cType = classifyHand(candidate, currentLevel).type;
        if (cType === HandType.STRAIGHT || cType === HandType.DOUBLE_STRAIGHT) {
          const loss = lossOf(candidate);
          if (loss >= 1) return null;
        }
      }
    }

    // R15 三张保护：跟牌出三张会破坏三带二组合时，选择不出
    if (has(profile, SKILLS.R15) && !mustPlay && !opponentNearWin && !teammateLeading && hand.length > 8) {
      if (candidate.length === 3) {
        const cType = classifyHand(candidate, currentLevel).type;
        if (cType === HandType.TRIPLE) {
          const loss = lossOf(candidate);
          if (loss >= 1) return null;
        }
      }
    }

    const value = evalCardsCost(candidate, currentLevel);
    const avgVal = value / candidate.length;
    if (value >= 100 && !opponentNearWin && hand.length > 5) return null;
    if (lastPlay && lastPlay.mainRank < 10 && avgVal >= 20 && !opponentNearWin && hand.length > 10) return null;

    return candidate;
  }

  // ④ R2 炸弹时机：队友领牌时永远不动炸弹
  if (bombs.length > 0 && !teammateLeading && shouldUseBomb(gameState, hand, myDecomp, opponentNearWin, true, bombs[0])) {
    // R2 缺失时：随机用炸弹（退化行为）
    if (has(profile, SKILLS.R2)) {
      logSkill(gameState._trace, 'R2', `炸弹时机：${opponentNearWin ? '对手快赢，紧急拦截' : '残局优势'} → 出炸弹`);
      return bombs[0];
    }
    if (Math.random() < 0.2) return bombs[0];
  }
  return null;
}

/* ============================================================
 * ⑤⑥⑦⑨ 领牌策略（全面重写）
 * ========================================================== */
function chooseLeading(normalPlays, bombs, hand, decomp, gameState, profile, opponentNearWin, memory) {
  const { currentLevel, seat, playersHandCounts = [] } = gameState;
  const teammateSeat = (seat + 2) % 4;
  const teammateCount = playersHandCounts[teammateSeat] || 27;
  const rightCount = playersHandCounts[(seat + 1) % 4] || 27;
  const leftCount  = playersHandCounts[(seat + 3) % 4] || 27;

  // ④ R2 炸弹结束：手牌 ≤6 且剩1手就是炸弹
  if (has(profile, SKILLS.R2) && hand.length <= 6 && decomp.tricksNeeded <= 1 && bombs.length > 0) {
    logSkill(gameState._trace, 'R2', '残局炸弹结束：手牌≤6 且剩1手即可清光，直接出炸弹');
    return bombs[0];
  }

  // ③ R1 队友只剩 ≤5 张：清场护送，出最难跟的牌压住对手
  if (has(profile, SKILLS.R1) && teammateCount > 0 && teammateCount <= 5 && normalPlays.length > 0) {
    const difficult = [...normalPlays].sort((a, b) => {
      if (b.length !== a.length) return b.length - a.length;
      return Math.max(...b.map(c => c.rank)) - Math.max(...a.map(c => c.rank));
    });
    // 进化修复：同为最长的候选里，存在"更便宜但压得死"的就用它（A 无人能压时出 A 留王）
    const topLen = difficult[0].length;
    const sameLen = difficult.filter(p => p.length === topLen)
      .sort((a, b) => evalCardsCost(a, currentLevel) - evalCardsCost(b, currentLevel));
    const dom = cheapestDominant(sameLen, memory, currentLevel, hand);
    logSkill(gameState._trace, 'R1', `护送清场：队友只剩 ${teammateCount} 张，出最难跟的牌压住对手`);
    return dom || difficult[0];
  }

  // 对手快赢：出"无敌牌"或"最大张数"
  // R10 在此路径下也启用扩展序列推断
  const fullUnbeatable = has(profile, SKILLS.R10);
  if (opponentNearWin && normalPlays.length > 0) {
    // 病例修复：领牌时"对手快赢"只在【能一手清完】或【有无敌多张牌型】时接管；
    // 否则交回 R9 评分（评分 + adaptiveLeadBonus 偏好多张清手牌型）。
    // 原逻辑无脑出无敌单张/最贵牌 → 领牌甩大王/级牌对，是玩家反馈"NPC 蠢"的最高频来源。
    const clearAll = normalPlays.find(p => p.length === hand.length);
    if (clearAll) return clearAll;
    if ((has(profile, SKILLS.R6) || fullUnbeatable) && memory) {
      const unbeatableMulti = normalPlays
        .filter(p => p.length >= 2 && isMyPlayUnbeatable(p, memory, currentLevel, fullUnbeatable, hand));
      if (unbeatableMulti.length > 0) {
        // 无敌【多张】牌型：既清手又保出牌权，出最长的
        return unbeatableMulti.sort((a, b) => b.length - a.length)[0];
      }
    }
    // 否则不再短路 —— fall through 到下面的 R9 评分
  }

  // 没有任何高级领牌技能：退化为简单按成本出最低的
  if (!hasAnyAdvancedLead(profile)) {
    return normalPlays[0] || bombs[0];
  }

  // ⑦ R5 级牌/万能牌保护：过滤不必要使用级牌的选项
  const filteredPlays = has(profile, SKILLS.R5)
    ? filterLevelCardAbuse(normalPlays, currentLevel, 'lead')
    : normalPlays;

  // ⑥ R8 残局解算器优先
  if (has(profile, SKILLS.R8)) {
    const endgamePlay = endgameSolve(hand, filteredPlays, gameState, currentLevel, memory);
    if (endgamePlay) {
      logSkill(gameState._trace, 'R8', '残局解算：全场剩牌少，找到一个无敌牌型');
      return endgamePlay;
    }
  }

  // ⑤⑨ R9 + R7 出牌评分 + 信号编码
  if (filteredPlays.length > 0) {
    // R7 信号：弱势信号 → 出最小单张告知队友"我很弱"
    if (has(profile, SKILLS.R7)) {
      const signal = computeMySignal(hand, decomp, currentLevel);
      if (signal === Signal.WEAK) {
        const singles = filteredPlays.filter(p => p.length === 1);
        if (singles.length > 0) {
          return singles.sort((a, b) => a[0].rank - b[0].rank)[0];
        }
      }

      if (has(profile, SKILLS.R9)) {
        // R9 + R10 评分排序（R10: 扩展无敌推断 + 形势感知加成）
        const wildAware = has(profile, SKILLS.R11);
        const exitPlan = has(profile, SKILLS.R13) && decomp.tricksNeeded <= 3 && memory;
        const scored = filteredPlays.map(p => {
          let score = scoreLeadPlay(p, hand, gameState, memory, decomp, currentLevel, fullUnbeatable, wildAware, gameState._exactLoss);
          if (fullUnbeatable) {
            score += adaptiveLeadBonus(p, hand, gameState, memory, currentLevel, opponentNearWin);
          }
          // R13 出口规划：快要赢时，偏好能留下无敌下一手的出法
          if (exitPlan) {
            const remaining = hand.filter(c => !p.includes(c));
            if (remaining.length === 0) {
              score += 80; // 此牌打出即清手
            } else {
              const nxtHints = findPlayableHands(remaining, null, currentLevel)
                .filter(np => !looksLikeBomb(np, currentLevel));
              if (nxtHints.some(np => isMyPlayUnbeatable(np, memory, currentLevel, true, remaining))) {
                score += 30; // 下一步有无敌牌型 → 优先走此路
              }
            }
          }
          return { play: p, score };
        }).sort((a, b) => b.score - a.score);

        // R7 强势信号：前3中有复杂牌型优先
        if (signal === Signal.STRONG) {
          const top3 = scored.slice(0, 3);
          const complex = top3.find(s => s.play.length >= 4);
          if (complex) {
            logSkill(gameState._trace, 'R9', `领牌评分：${scored.length} 个候选评分排序后选最高分`);
            logSkill(gameState._trace, 'R7', '强势信号：top3 中有复杂牌型 → 优先打复杂牌');
            return complex.play;
          }
        }
        logSkill(gameState._trace, 'R9', `领牌评分：${scored.length} 个候选评分排序后选最高分（top: ${scored[0].score.toFixed(0)}）`);
        if (exitPlan) logSkill(gameState._trace, 'R13', '出口规划：剩 ≤3 手，加权偏好能留无敌后手的出法');
        return scored[0].play;
      }
    }

    // 只有 R9（±R10，无 R7）：纯评分排序
    if (has(profile, SKILLS.R9)) {
      const wildAware = has(profile, SKILLS.R11);
      const exitPlan = has(profile, SKILLS.R13) && decomp.tricksNeeded <= 3 && memory;
      const scored = filteredPlays.map(p => {
        let score = scoreLeadPlay(p, hand, gameState, memory, decomp, currentLevel, fullUnbeatable, wildAware, gameState._exactLoss);
        if (fullUnbeatable) {
          score += adaptiveLeadBonus(p, hand, gameState, memory, currentLevel, opponentNearWin);
        }
        // R13 出口规划
        if (exitPlan) {
          const remaining = hand.filter(c => !p.includes(c));
          if (remaining.length === 0) {
            score += 80;
          } else {
            const nxtHints = findPlayableHands(remaining, null, currentLevel)
              .filter(np => !looksLikeBomb(np, currentLevel));
            if (nxtHints.some(np => isMyPlayUnbeatable(np, memory, currentLevel, true, remaining))) {
              score += 30;
            }
          }
        }
        return { play: p, score };
      }).sort((a, b) => b.score - a.score);
      logSkill(gameState._trace, 'R9', `领牌评分（无 R7 信号）：${scored.length} 个候选选最高分（top: ${scored[0].score.toFixed(0)}）`);
      if (exitPlan) logSkill(gameState._trace, 'R13', '出口规划：剩 ≤3 手，加权偏好能留无敌后手的出法');
      return scored[0].play;
    }

    // 只有 R5/R6/R8 但无评分：用过滤后的结果按成本最低
    return filteredPlays[0];
  }

  // 兜底
  return normalPlays[0] || bombs[0];
}

/* ============================================================
 * 工具函数
 * ========================================================== */
function evalCardsCost(cards, currentLevel) {
  let total = 0;
  for (const card of cards) {
    if (isWildCard(card, currentLevel)) total += 100;
    else if (card.rank === currentLevel) total += 25;
    else if (card.rank === 16) total += 40;
    else if (card.rank === 15) total += 35;
    else total += getNormalizedRank(card.rank, currentLevel);
  }
  return total;
}

function looksLikeBomb(cards, currentLevel = 0) {
  if (!cards || cards.length < 4) return false;
  // 进化修复：含万能牌时走 classifyHand（原按字面花色判，混花 wild 同花顺被当普通顺子评分）
  if (currentLevel >= 2 && cards.some(c => isWildCard(c, currentLevel))) {
    return isBombType(classifyHand(cards, currentLevel).type);
  }
  const ranks = cards.map(c => c.rank);
  // 同 rank 炸弹
  if (ranks.every(r => r === ranks[0])) return true;
  // 天王炸（4 王）
  if (cards.length === 4 && cards.every(c => c.rank === 15 || c.rank === 16)) return true;
  // 同花顺（5 张相同花色连续）
  if (cards.length >= 5) {
    const suits = cards.map(c => c.suit);
    if (suits.every(s => s === suits[0])) {
      const sr = [...ranks].sort((a, b) => a - b);
      let isStraight = true;
      for (let i = 1; i < sr.length; i++) {
        if (sr[i] !== sr[i - 1] + 1) { isStraight = false; break; }
      }
      if (isStraight) return true;
    }
  }
  return false;
}

function inferKind(lastPlay) {
  if (!lastPlay || !lastPlay.type) return 'single';
  switch (lastPlay.type) {
    case HandType.SINGLE: return 'single';
    case HandType.PAIR:   return 'pair';
    case HandType.TRIPLE: return 'triple';
    default: return 'other';
  }
}

/**
 * 评估"出 candidate 后，剩余手牌的拆牌质量损失"
 */
function breakageLoss(hand, candidate, currentLevel, baseDecomp) {
  if (!candidate || candidate.length === 0) return 0;
  const removeIds = new Set(candidate.map(c => c.id));
  const remaining = hand.filter(c => !removeIds.has(c.id));
  const newDecomp = decomposeHand(remaining, currentLevel);
  const expected = baseDecomp.tricksNeeded - 1;
  return Math.max(0, newDecomp.tricksNeeded - expected);
}

/* ============================================================
 * 包装：Practice NPC 决策
 * ========================================================== */
export function getPracticeNPCDecision(hand, gameState, level = AILevel.NORMAL, seat = 0, skillProfile = null, errorRate = 0) {
  // 难度旋钮：以 errorRate 概率"失误"——随机出一手合法牌(或随机pass)，模拟低水平玩家。
  // 用于平滑覆盖 noob(≈随机)→normal(碾压地板) 之间的难度空档。
  if (errorRate > 0 && Math.random() < errorRate) {
    const hints = findPlayableHands(hand, gameState.lastPlay, gameState.currentLevel);
    let play = null;
    if (hints.length > 0) {
      const canPass = gameState.lastPlay != null;
      play = (canPass && Math.random() < 0.3) ? null : hints[Math.floor(Math.random() * hints.length)];
    }
    return { play, decisionLog: createDecisionLog(play ? 'PLAY' : 'PASS', play, 'random_mistake', [], []) };
  }
  // P1 任务：创建 trace 数组，通过 _trace 字段传入决策路径
  // 内部函数（decideStrategic / chooseLeading 等）可通过 ctx._trace 直接 push 技能记录
  const trace = [];
  const augmentedGameState = { ...gameState, _trace: trace };
  const play = getAIDecision(hand, augmentedGameState, level, skillProfile);
  const action = play ? 'PLAY' : 'PASS';
  const primaryReason = inferPrimaryReason(action, play, gameState, seat);
  const decisionLog = createDecisionLog(action, play, primaryReason, [], trace);
  return { play, decisionLog };
}
