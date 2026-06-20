/**
 * TeachingNPC.js — 教学NPC
 *
 * 特点：
 *   - 难度固定为 noob，不会碾压新手
 *   - 每次出牌后通过LLM生成简短中文解释（3-15字）
 *   - 如课程要求演示特定场景，会主动配合
 */

// 浏览器版：去掉 https/process，LLM 解释功能禁用，直接走规则生成的降级文案
import { getAIDecision, AILevel } from './PracticeNPC.js';
import { createDecisionLog, inferPrimaryReason, ReasonText } from './NPCDecisionLog.js';

const GEMINI_KEY = '';
const GEMINI_MODEL = 'gemini-2.5-flash';

/**
 * 教学NPC决策：使用noob级贪心，同时生成解释
 */
export async function getTeachingNPCDecision(hand, gameState, seat) {
  // 固定使用 noob 难度
  const play = getAIDecision(hand, { ...gameState, seat }, AILevel.NOOB);
  const action = play ? 'PLAY' : 'PASS';
  const primaryReason = inferPrimaryReason(action, play, gameState, seat);

  // 先用规则生成默认解释（用于LLM超时降级）
  const fallbackExplanation = ReasonText[primaryReason] || (action === 'PASS' ? '这手我不出' : '轮到我出牌了');

  // 尝试LLM生成更自然的解释
  let explanation = fallbackExplanation;
  try {
    explanation = await generateExplanation(play, primaryReason, gameState, seat);
  } catch (e) {
    // 超时或失败，使用降级文案
    explanation = fallbackExplanation;
  }

  const decisionLog = createDecisionLog(action, play, primaryReason);
  decisionLog.explanation = explanation;

  return { play, decisionLog, explanation };
}

/**
 * 调用Gemini生成解释（5秒超时）
 */
async function generateExplanation(play, primaryReason, gameState, seat) {
  const isFreePlay = !gameState.lastPlay || gameState.lastPlaySeat === seat;
  const handCount = (gameState.hands[seat] || []).length;
  const teammateSeat = (seat + 2) % 4;
  const teammateCount = (gameState.hands[teammateSeat] || []).length;

  const context = isFreePlay
    ? `我来领牌（我有${handCount}张牌，队友有${teammateCount}张）`
    : `上家出了牌，我${play ? '选择跟牌' : '选择过牌'}`;

  const prompt = `你是掼蛋游戏的教学NPC，请用一句简短的话（5-15字）解释这步操作。
场景：${context}
原因类型：${ReasonText[primaryReason]}
要求：口语化，面向完全不懂掼蛋的新手，只输出那句话，不加任何其他内容。`;

  return await callGeminiShort(prompt, 5000);
}

/**
 * 浏览器版：直接抛错，让上层走规则降级文案
 */
function callGeminiShort(prompt, timeoutMs = 5000) {
  return Promise.reject(new Error('LLM disabled in browser'));
}
