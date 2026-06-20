/**
 * NPCEngine.js — NPC决策统一入口
 *
 * NPC类型：
 *   'teaching'     教学NPC（固定noob，会解释）
 *   'practice'     陪练NPC（noob/normal/expert）
 *   'competitive'  竞技NPC（全力LLM）
 */

import { getPracticeNPCDecision, getAIDecision, AILevel } from './PracticeNPC.js';
import { getTeachingNPCDecision } from './TeachingNPC.js';
import { getLLMAIDecision, onCardsPlayed, resetMemory, syncMemoryFromHistory } from '../game/llm_ai.js';
import { createDecisionLog, inferPrimaryReason } from './NPCDecisionLog.js';
import { findPlayableHands } from '../game/rules.js';

/**
 * v2.0.1 重大修复：把 engine 原始 state 适配为 PracticeNPC 期望的决策视图。
 *
 * 此前直接透传 room.gameState，缺三个派生字段，导致浏览器对局中：
 * - isTeammateWinning=undefined → R1 让路从不触发（NPC 永不给队友让路）
 * - playersHandCounts 缺失 → 手牌数 fallback 27 → opponentNearWin 恒 false
 *   → R2 生死拦截 / R1 护送清场 / R10 形势感知全部失效，S1 残局探测不触发
 * （selfplay 路径自己构造了这些字段，所以实验室指标正常——实验室与产线行为不一致）
 */
function buildDecisionView(gameState, seat, roomId) {
  const isFreePlay = !gameState.lastPlay || gameState.lastPlaySeat === seat;
  return {
    ...gameState,
    lastPlay: isFreePlay ? null : gameState.lastPlay,  // 接风/边界场景的防御性翻译
    isTeammateWinning: !isFreePlay && gameState.lastPlaySeat === (seat + 2) % 4,
    playersHandCounts: (gameState.hands || []).map(h => (h ? h.length : 0)),
    seat,
    roomId,
  };
}

/**
 * 统一NPC决策入口
 * @param {object} npc - NPC玩家对象 { id, isNPC, level, npcType }
 * @param {number} seat - 座位号
 * @param {Array} hand - 手牌
 * @param {object} gameState - 游戏状态
 * @param {string} roomId - 房间ID（用于记牌器）
 * @returns {Promise<{ play: Card[]|null, decisionLog: object }>}
 */
export async function getNPCDecision(npc, seat, hand, gameState, roomId) {
  const npcType = npc.npcType || 'practice';
  const level = npc.level || AILevel.NORMAL;
  const errorRate = npc.errorRate || 0;   // 难度旋钮：以ε概率随机出牌

  try {
    if (npcType === 'teaching') {
      return await getTeachingNPCDecision(hand, gameState, seat);
    }

    if (npcType === 'practice') {
      // skillProfile 从前端传来是 JSON array，需要转成 Set
      const rawProfile = npc.skillProfile ?? null;
      const skillProfile = rawProfile
        ? (rawProfile instanceof Set ? rawProfile : new Set(rawProfile))
        : null;
      // expert级别在浏览器无LLM时，由 PracticeNPC 走增强规则；保留入口以便服务端有 LLM 时使用
      if (level === AILevel.EXPERT && !skillProfile) {
        try {
          const play = await getLLMAIDecision(seat, hand, gameState, level, roomId);
          const action = play ? 'PLAY' : 'PASS';
          const primaryReason = inferPrimaryReason(action, play, gameState, seat);
          return { play, decisionLog: createDecisionLog(action, play, primaryReason) };
        } catch (e) {
          // LLM 不可用 → 走增强规则（带 roomId 取记牌器）
          return getPracticeNPCDecision(hand, buildDecisionView(gameState, seat, roomId), level, seat, skillProfile, errorRate);
        }
      }
      return getPracticeNPCDecision(hand, buildDecisionView(gameState, seat, roomId), level, seat, skillProfile, errorRate);
    }

    if (npcType === 'competitive') {
      const play = await getLLMAIDecision(seat, hand, gameState, AILevel.EXPERT, roomId);
      const action = play ? 'PLAY' : 'PASS';
      const primaryReason = inferPrimaryReason(action, play, gameState, seat);
      return { play, decisionLog: createDecisionLog(action, play, primaryReason) };
    }

    // 兜底
    return getPracticeNPCDecision(hand, buildDecisionView(gameState, seat, roomId), level, seat, null, errorRate);

  } catch (err) {
    console.error(`[NPCEngine] 决策失败 seat=${seat}:`, err.message);
    // 最终兜底：贪心
    const isFreePlay = !gameState.lastPlay || gameState.lastPlaySeat === seat;
    const play = getAIDecision(hand, {
      lastPlay: isFreePlay ? null : gameState.lastPlay,
      currentLevel: gameState.currentLevel,
      seat,
      playersHandCounts: gameState.hands.map(h => h.length),
      isTeammateWinning: !isFreePlay && gameState.lastPlaySeat === (seat + 2) % 4,
    }, level);
    return { play, decisionLog: createDecisionLog(play ? 'PLAY' : 'PASS', play, 'dispose_weak') };
  }
}

// 重新导出记牌器相关函数（app.js 会用到）
export { onCardsPlayed, resetMemory, syncMemoryFromHistory };
