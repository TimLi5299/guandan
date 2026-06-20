/**
 * NPCDecisionLog.js — NPC决策透明度日志
 * 每次NPC出牌时生成结构化决策摘要，供教学模式和复盘使用
 */

// 主因分类枚举
export const PrimaryReason = {
  TEAMMATE_WINNING:  'teammate_winning',   // 队友快赢，让路
  BLOCK_OPPONENT:    'block_opponent',     // 阻截对手
  CONSERVE_BOMB:     'conserve_bomb',      // 保留炸弹
  USE_BOMB_CRITICAL: 'use_bomb_critical',  // 关键时刻用炸弹
  LEAD_STRONG:       'lead_strong',        // 强势领牌
  DISPOSE_WEAK:      'dispose_weak',       // 处理废牌
  FREE_PLAY_MIN:     'free_play_min',      // 领牌兜底
  PASS_DEFER:        'pass_defer',         // 过牌让权
};

// 主因对应的中文解释模板（教学NPC会用到）
export const ReasonText = {
  [PrimaryReason.TEAMMATE_WINNING]:  '队友牌快出完了，我让路给他',
  [PrimaryReason.BLOCK_OPPONENT]:    '对手牌不多了，我必须管上阻截',
  [PrimaryReason.CONSERVE_BOMB]:     '局面不紧张，炸弹留到关键时刻用',
  [PrimaryReason.USE_BOMB_CRITICAL]: '对手快赢了，必须用炸弹打断',
  [PrimaryReason.LEAD_STRONG]:       '领牌阶段，出对手难跟的牌型压制',
  [PrimaryReason.DISPOSE_WEAK]:      '用最便宜的牌管上，保留好牌',
  [PrimaryReason.FREE_PLAY_MIN]:     '我来领牌，先出小牌试探',
  [PrimaryReason.PASS_DEFER]:        '队友正在掌控局面，我不出干扰',
};

/**
 * 创建决策日志对象
 */
export function createDecisionLog(action, cards, primaryReason, alternativesConsidered = [], skillTrace = null) {
  return {
    action,                    // 'PLAY' | 'PASS'
    cards: cards || [],        // 出的牌（PASS时为空）
    primaryReason,             // PrimaryReason枚举值
    explanation: ReasonText[primaryReason] || '',  // 面向玩家的中文解释
    alternativesConsidered,    // [{ cards, rejectedReason }]
    // P1 任务：技能追踪（哪些 R 技能在本次决策中触发了）
    activatedSkills: skillTrace ? [...new Set(skillTrace.map(t => t.skill))] : [],
    skillNotes: skillTrace || [],   // [{ skill: 'R3', note: '拆牌优化推荐...' }]
    confidence: 0.8,           // 决策置信度（规则AI固定0.8，LLM可覆盖）
    timestamp: Date.now(),
  };
}

/**
 * P1 任务：技能追踪 helper
 * 在 PracticeNPC 决策路径中，每个 R 技能分支触发时调用 logSkill 记录
 *
 * 用法：const trace = []; logSkill(trace, 'R3', '拆牌优化推荐 X 替代 Y');
 *      ...最后 createDecisionLog(action, cards, reason, [], trace)
 *
 * trace 对象通过 ctx._trace 携带，避免修改 decideStrategic 等函数签名
 */
export function logSkill(trace, skill, note) {
  if (!trace || !Array.isArray(trace)) return;
  trace.push({ skill, note });
}

/**
 * 把 skillTrace 渲染为一段中文摘要，用于 UI 信息泡显示
 * 例：'R3 拆牌优化推荐 X | R10 形势加权降低出牌优先级'
 */
export function renderSkillTrace(skillTrace) {
  if (!skillTrace || skillTrace.length === 0) return '';
  return skillTrace.map(t => `${t.skill} ${t.note}`).join(' | ');
}

/**
 * 推断主因（供规则AI使用，LLM决策时主因由Prompt解析）
 */
export function inferPrimaryReason(action, cards, gameState, seat) {
  const { lastPlay, lastPlaySeat, hands, currentLevel } = gameState;
  const isFreePlay = !lastPlay || lastPlaySeat === seat;
  const teammateSeat = (seat + 2) % 4;
  const leftSeat = (seat + 3) % 4;
  const rightSeat = (seat + 1) % 4;
  const teammateCount = (hands[teammateSeat] || []).length;
  const leftCount = (hands[leftSeat] || []).length;
  const rightCount = (hands[rightSeat] || []).length;
  const opponentNearWin = (leftCount > 0 && leftCount <= 5) || (rightCount > 0 && rightCount <= 5);
  const isTeammateWinning = !isFreePlay && lastPlaySeat === teammateSeat;

  if (action === 'PASS') {
    if (isTeammateWinning) return PrimaryReason.TEAMMATE_WINNING;
    return PrimaryReason.PASS_DEFER;
  }

  // 出牌场景
  const isBombPlay = cards && cards.length >= 4;
  // 病例修复：「阻截对手」只在【跟牌】时成立——领牌时没有对象可阻截，
  // 原逻辑领牌+对手快赢也标"管上阻截"，复盘里误导玩家
  if (!isFreePlay && opponentNearWin) {
    return isBombPlay ? PrimaryReason.USE_BOMB_CRITICAL : PrimaryReason.BLOCK_OPPONENT;
  }
  if (isFreePlay) {
    return (cards && cards.length > 1) ? PrimaryReason.LEAD_STRONG : PrimaryReason.FREE_PLAY_MIN;
  }
  if (isBombPlay) return PrimaryReason.CONSERVE_BOMB;
  return PrimaryReason.DISPOSE_WEAK;
}
