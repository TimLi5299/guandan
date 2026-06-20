/**
 * memory.js — 掼蛋记牌模块
 *
 * 模拟不同水平玩家的记忆能力：
 *   - 小白 (noob)：几乎不记牌，随机遗忘大部分信息
 *   - 普通 (normal)：记住大牌和炸弹，对小牌模糊
 *   - 专家 (expert)：完整记牌，能推算每家剩余牌型分布
 */

/**
 * 创建一个玩家的记牌器
 * @param {string} level - 'noob' | 'normal' | 'expert'
 * @param {number} seat - 玩家座位
 * @param {number} currentLevel - 当前级牌数字（2-A）
 */
export function createMemory(level, seat, currentLevel) {
  return {
    level,          // 记牌等级
    seat,           // 我的座位
    currentLevel,   // 当前级牌

    // 已出牌统计：rank => 已出数量（共 2 副牌，每张最多 8 张）
    // 小王=15, 大王=16, 级牌=currentLevel
    playedCount: {},      // 真实已出数量（内部维护，不受遗忘影响）
    rememberedCount: {},  // 玩家"记住"的数量（受记忆能力影响）

    // 各座位的出牌历史（专家可追踪每人出了什么）
    seatPlays: { 0: [], 1: [], 2: [], 3: [] },

    // 推算的各座位剩余牌数（专家专属）
    estimatedHandCounts: [27, 27, 27, 27],

    // 已出炸弹记录（各级别都能记住炸弹）
    bombsPlayed: [],

    // 记牌准确度参数（由 level 决定）
    accuracy: {
      noob:   { bigCardMemory: 0.2, smallCardMemory: 0.05, decayPerRound: 0.3 },
      normal: { bigCardMemory: 0.85, smallCardMemory: 0.3, decayPerRound: 0.05 },
      expert: { bigCardMemory: 1.0,  smallCardMemory: 1.0,  decayPerRound: 0.0  },
    }[level] || { bigCardMemory: 0.5, smallCardMemory: 0.2, decayPerRound: 0.1 }
  };
}

/**
 * 判断是否是"大牌"（值得记忆的牌）
 */
function isBigCard(rank, currentLevel) {
  return rank >= 13        // K, A
    || rank === 15         // 小王
    || rank === 16         // 大王
    || rank === currentLevel; // 级牌
}

/**
 * 更新记牌状态：有人出牌时调用
 * @param {object} memory - 记牌器对象（会被 mutate）
 * @param {number} fromSeat - 出牌的座位
 * @param {Array} cards - 出的牌数组 [{rank, suit, id}]
 * @param {boolean} isBombPlay - 是否是炸弹
 */
export function updateMemory(memory, fromSeat, cards, isBombPlay = false) {
  const { level, currentLevel, accuracy } = memory;

  for (const card of cards) {
    const rank = card.rank;

    // 更新真实已出数量
    memory.playedCount[rank] = (memory.playedCount[rank] || 0) + 1;

    // 根据记忆能力决定是否"记住"这张牌
    const big = isBigCard(rank, currentLevel);
    const memoryProb = big ? accuracy.bigCardMemory : accuracy.smallCardMemory;
    const remembered = Math.random() < memoryProb;

    if (remembered) {
      memory.rememberedCount[rank] = (memory.rememberedCount[rank] || 0) + 1;
    }

    // 专家：追踪每个座位的出牌
    if (level === 'expert') {
      memory.seatPlays[fromSeat].push(rank);
    }
  }

  // 各级别都记录炸弹
  if (isBombPlay) {
    memory.bombsPlayed.push({ seat: fromSeat, size: cards.length });
  }

  // 更新估算的手牌数量
  memory.estimatedHandCounts[fromSeat] = Math.max(
    0, memory.estimatedHandCounts[fromSeat] - cards.length
  );
}

/**
 * 记忆衰减：每轮过后调用一次（模拟人类遗忘）
 */
export function decayMemory(memory) {
  const { accuracy } = memory;
  if (accuracy.decayPerRound <= 0) return; // 专家不衰减

  for (const rank in memory.rememberedCount) {
    if (memory.rememberedCount[rank] > 0 && Math.random() < accuracy.decayPerRound) {
      memory.rememberedCount[rank] = Math.max(0, memory.rememberedCount[rank] - 1);
    }
  }
}

/**
 * 查询某个点数还剩多少张（基于记忆，不是真实值）
 * 掼蛋每副牌有 2 套，每种点数共 8 张（4花色 × 2副）
 * 大小王各 4 张
 * @returns {number} 估算剩余张数
 */
export function getRemaining(memory, rank) {
  const totalCards = (rank === 15 || rank === 16) ? 2 : 8; // 修复：双副牌大小王各 2 张（原误写 4 → 单张A/小王永远算不出无敌）
  const played = memory.rememberedCount[rank] || 0;
  return Math.max(0, totalCards - played);
}

/**
 * 获取记牌摘要（用于传给 LLM 的 Prompt）
 * @returns {string} 自然语言描述的记牌信息
 */
export function getMemorySummary(memory, currentLevel) {
  const { level, rememberedCount, bombsPlayed, estimatedHandCounts } = memory;

  if (level === 'noob') {
    return '（你记性不太好，不确定场上出了什么）';
  }

  const lines = [];

  // 已出完的牌（某个点数出完了）
  const exhausted = [];
  for (const [rankStr, count] of Object.entries(rememberedCount)) {
    const rank = parseInt(rankStr);
    const total = (rank === 15 || rank === 16) ? 2 : 8;
    if (count >= total) {
      exhausted.push(rankToName(rank, currentLevel));
    }
  }
  if (exhausted.length > 0) {
    lines.push(`已出完的牌：${exhausted.join('、')}`);
  }

  // 大牌剩余情况（专家额外输出）
  if (level === 'expert') {
    const bigCards = [16, 15, currentLevel, 14, 13]; // 大王、小王、级牌、A、K
    const bigRemaining = bigCards.map(r => {
      const rem = getRemaining(memory, r);
      return `${rankToName(r, currentLevel)}剩${rem}张`;
    }).filter(s => !s.includes('剩0张'));

    if (bigRemaining.length > 0) {
      lines.push(`大牌剩余：${bigRemaining.join('，')}`);
    }

    // 各家手牌数估算
    const counts = estimatedHandCounts.map((c, i) => `座位${i}约${c}张`);
    lines.push(`各家手牌估算：${counts.join('，')}`);
  }

  // 炸弹记录（各级别都有）
  if (bombsPlayed.length > 0) {
    const bombDesc = bombsPlayed.map(b => `座位${b.seat}出了${b.size}张炸弹`).join('，');
    lines.push(`已出炸弹：${bombDesc}`);
  }

  if (lines.length === 0) {
    return level === 'normal' ? '（场上还没出过大牌）' : '（暂无特殊记录）';
  }

  return lines.join('\n');
}

/**
 * 点数转中文名称
 */
function rankToName(rank, currentLevel) {
  if (rank === 16) return '大王';
  if (rank === 15) return '小王';
  if (rank === currentLevel) return `${numToFace(rank)}(级牌)`;
  return numToFace(rank);
}

function numToFace(n) {
  const map = {2:'2',3:'3',4:'4',5:'5',6:'6',7:'7',8:'8',9:'9',10:'10',11:'J',12:'Q',13:'K',14:'A'};
  return map[n] || String(n);
}
