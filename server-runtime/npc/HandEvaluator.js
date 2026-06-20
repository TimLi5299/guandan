/**
 * HandEvaluator.js — 最少手数精确评估（第二档进化，R16）
 *
 * 核心：minTricks(hand) = 这副手牌最少几手能出完。
 * PerfectDou（网易，NeurIPS 2022）奖励设计的核心思想——"要不要拆顺子/动炸弹"
 * 全部退化成同一道算术题：出这手后剩余 minTricks 是否变差。
 *
 * 实现：锚定最小 rank 的记忆化 DP（标准斗地主 AI 套路，避免组合重复枚举）。
 *   - 普通牌 (rank 2-14) 进 DP：单/对/三/三带二/炸弹/顺子(5)/连对(3×2)/钢板(2×3)
 *   - 大小王不参与序列牌型：单独折算（对=1手，单=1手；天王炸前置抽出）
 *   - 万能牌（红桃级牌）：贪心预分配（补3张成炸 > 补顺子缺口 > 还原级牌），
 *     与"当级牌"方案取最小——非全枚举，但覆盖实战主流用法
 *   - 全局 memo（按 rank-counts 键）：同一决策的 30 个候选剩余手牌大量共享子状态
 *
 * 口径与引擎一致：顺子固定 5 张（窗口 3..14）、连对固定 3 对、钢板固定 2 组三张，
 * 2 不参与顺子，级牌按 raw rank 参与序列。
 */

import { isWildCard } from '../game/handClassifier.js';

// 全局 memo：counts 键 → 最少手数。容量上限防内存膨胀（超限整体清空，代价是冷启动）
const MEMO = new Map();
const MEMO_LIMIT = 400000;

/** counts: 长度 13 的数组，idx 0..12 ↔ rank 2..14 */
function countsKey(counts) {
  return String.fromCharCode(...counts.map(c => 48 + c));
}

function dpMinTricks(counts) {
  // 找最小非零 rank
  let anchor = -1;
  for (let i = 0; i < 13; i++) {
    if (counts[i] > 0) { anchor = i; break; }
  }
  if (anchor < 0) return 0;

  const key = countsKey(counts);
  const hit = MEMO.get(key);
  if (hit !== undefined) return hit;

  const n = counts[anchor];
  let best = Infinity;
  const tryMove = (mutate) => {
    mutate(1);
    const sub = 1 + dpMinTricks(counts);
    if (sub < best) best = sub;
    mutate(-1);
  };

  // 单张
  tryMove(d => { counts[anchor] -= d; });
  // 对子
  if (n >= 2) tryMove(d => { counts[anchor] -= 2 * d; });
  // 三张
  if (n >= 3) tryMove(d => { counts[anchor] -= 3 * d; });
  // 三带二（锚为三张，枚举搭档对子）
  if (n >= 3) {
    for (let p = 0; p < 13; p++) {
      if (p === anchor || counts[p] < 2) continue;
      tryMove(d => { counts[anchor] -= 3 * d; counts[p] -= 2 * d; });
    }
  }
  // 炸弹（4+ 张全出；部分出牌的拆分由 单/对/三 分支组合覆盖）
  if (n >= 4) tryMove(d => { counts[anchor] -= n * d; });
  // 顺子（锚为起点，5 张，rank 3..14 即 idx 1..12；锚=idx0(rank2) 不起顺）
  if (anchor >= 1 && anchor + 4 <= 12) {
    let ok = true;
    for (let i = anchor; i < anchor + 5; i++) if (counts[i] < 1) { ok = false; break; }
    if (ok) tryMove(d => { for (let i = anchor; i < anchor + 5; i++) counts[i] -= d; });
  }
  // 连对（3 连对）
  if (anchor >= 1 && anchor + 2 <= 12 && n >= 2) {
    let ok = true;
    for (let i = anchor; i < anchor + 3; i++) if (counts[i] < 2) { ok = false; break; }
    if (ok) tryMove(d => { for (let i = anchor; i < anchor + 3; i++) counts[i] -= 2 * d; });
  }
  // 钢板（2 连三张）
  if (anchor >= 1 && anchor + 1 <= 12 && n >= 3) {
    if (counts[anchor + 1] >= 3) {
      tryMove(d => { counts[anchor] -= 3 * d; counts[anchor + 1] -= 3 * d; });
    }
  }

  if (MEMO.size >= MEMO_LIMIT) MEMO.clear();
  MEMO.set(key, best);
  return best;
}

/** 普通牌（rank 2-14，已去 wild/王）→ counts 数组 */
function toCounts(cards) {
  const counts = new Array(13).fill(0);
  for (const c of cards) {
    if (c.rank >= 2 && c.rank <= 14) counts[c.rank - 2]++;
  }
  return counts;
}

/** 王的手数：天王炸（4王=1手）已由调用方决定是否成立；这里按 对/单 折算 */
function jokerTricks(n15, n16) {
  const pair15 = n15 >= 2 ? 1 : n15;   // 2张=1手对，1张=1手单
  const pair16 = n16 >= 2 ? 1 : n16;
  return pair15 + pair16;
}

/**
 * 最少手数评估入口。
 * @param {Array} hand - 手牌
 * @param {number} currentLevel - 级牌
 * @returns {number} 最少手数
 */
export function minTricks(hand, currentLevel) {
  if (!hand || hand.length === 0) return 0;

  const wilds = [];
  const jokers15 = [];
  const jokers16 = [];
  const regulars = [];
  for (const c of hand) {
    if (isWildCard(c, currentLevel)) wilds.push(c);
    else if (c.rank === 15) jokers15.push(c);
    else if (c.rank === 16) jokers16.push(c);
    else regulars.push(c);
  }

  // 天王炸：4 王单独成 1 手（比 2 手对子优）
  let jt;
  if (jokers15.length + jokers16.length === 4 && jokers15.length === 2) {
    jt = 1;
  } else {
    jt = jokerTricks(jokers15.length, jokers16.length);
  }

  const baseCounts = toCounts(regulars);

  if (wilds.length === 0) {
    return dpMinTricks(baseCounts) + jt;
  }

  // wild 赋值方案（贪心候选集，各方案跑 DP 取最小）：
  // ① 还原为级牌（自然用法）
  // ② 补 3 张成炸（每个恰 3 张的 rank）
  // ③ 补顺子缺口（缺 1 张的 5 连窗口取首个）
  // 1-2 张 wild 的组合空间很小，直接小枚举
  const w = wilds.length;   // 1 或 2
  const assignOptions = new Set();
  // 单个 wild 的候选 rank 集合
  const candRanks = new Set([currentLevel]);
  for (let r = 2; r <= 14; r++) {
    const i = r - 2;
    if (baseCounts[i] === 3) candRanks.add(r);          // 补炸
    if (baseCounts[i] === 1 || baseCounts[i] === 2) candRanks.add(r);  // 补对/三/序列
  }
  // 缺口窗口候选：枚举所有 5 连窗口中缺额 ≤w 的缺口 rank
  for (let start = 3; start <= 10; start++) {
    const gaps = [];
    for (let r = start; r < start + 5; r++) {
      if (baseCounts[r - 2] === 0) gaps.push(r);
    }
    if (gaps.length > 0 && gaps.length <= w) gaps.forEach(r => candRanks.add(r));
  }

  const ranksArr = [...candRanks];
  let best = Infinity;
  if (w === 1) {
    for (const r of ranksArr) {
      baseCounts[r - 2]++;
      const v = dpMinTricks(baseCounts) + jt;
      baseCounts[r - 2]--;
      if (v < best) best = v;
    }
  } else {
    // w === 2：枚举无序对（含同 rank ×2）
    for (let a = 0; a < ranksArr.length; a++) {
      for (let b = a; b < ranksArr.length; b++) {
        baseCounts[ranksArr[a] - 2]++;
        baseCounts[ranksArr[b] - 2]++;
        const v = dpMinTricks(baseCounts) + jt;
        baseCounts[ranksArr[a] - 2]--;
        baseCounts[ranksArr[b] - 2]--;
        if (v < best) best = v;
      }
    }
  }
  return best;
}

/**
 * R16 版拆牌损失：出 candidate 后剩余手牌的最少手数增量
 * （对照 PracticeNPC.breakageLoss 的贪心版，这是精确账本）
 */
export function minTricksLoss(hand, candidate, currentLevel, baseMin = null) {
  if (!candidate || candidate.length === 0) return 0;
  const base = baseMin ?? minTricks(hand, currentLevel);
  const ids = new Set(candidate.map(c => c.id));
  const remaining = hand.filter(c => !ids.has(c.id));
  const after = minTricks(remaining, currentLevel);
  return Math.max(0, after - (base - 1));   // 理想情况：出 1 手少 1 手
}
