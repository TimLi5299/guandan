/**
 * llm_ai.js — 基于 LLM 的掼蛋 AI 决策层
 *
 * 架构：
 *   规则引擎 → 计算所有合法出牌（已有）
 *   LLM 层   → 接收局面描述 + 合法出牌列表，输出策略选择（本文件）
 *   降级机制 → LLM 超时/报错时，自动回退到贪心算法
 */

// 浏览器版：去掉 https/process，LLM 调用不可用，全部回退到规则 AI
import { getAIDecision, AILevel } from './ai.js';
import { findPlayableHands } from './rules.js';
import { HandTypeName, isBomb } from './handClassifier.js';
import { createMemory, updateMemory, decayMemory, getMemorySummary } from './memory.js';

// 每个 NPC 的记牌器（key: seat_roomId）
const npcMemories = new Map();

const GEMINI_KEY = ''; // 浏览器环境不调 LLM
const GEMINI_MODEL = 'gemini-2.5-flash';
const LLM_TIMEOUT_MS = 8000;

// 花色符号
const SUIT_SYMBOLS = ['♠', '♥', '♦', '♣', '🃏'];

// 点数文字
function rankToStr(rank, level) {
  if (rank === 16) return '大王';
  if (rank === 15) return '小王';
  if (rank === level) return `${numToFace(rank)}(级牌)`;
  return numToFace(rank);
}

function numToFace(n) {
  const map = { 2:'2',3:'3',4:'4',5:'5',6:'6',7:'7',8:'8',9:'9',10:'10',11:'J',12:'Q',13:'K',14:'A' };
  return map[n] || String(n);
}

function cardToStr(card, level) {
  if (card.rank >= 15) return SUIT_SYMBOLS[4] + rankToStr(card.rank, level);
  return SUIT_SYMBOLS[card.suit || 0] + rankToStr(card.rank, level);
}

function cardsToStr(cards, level) {
  return cards.map(c => cardToStr(c, level)).join(' ');
}

/**
 * 获取或创建 NPC 的记牌器
 */
export function getMemory(roomId, seat, level, currentLevel) {
  const key = `${roomId}_${seat}`;
  if (!npcMemories.has(key)) {
    npcMemories.set(key, createMemory(level, seat, currentLevel));
  }
  return npcMemories.get(key);
}

/**
 * 从 roundHistory 同步记牌（处理 NPC 刚加入时的历史补录）
 */
export function syncMemoryFromHistory(roomId, seat, level, state) {
  const key = `${roomId}_${seat}`;
  // 重置记牌器
  const mem = createMemory(level, seat, state.currentLevel);
  npcMemories.set(key, mem);

  // 回放历史
  for (const record of (state.roundHistory || [])) {
    if (record.seat !== seat) { // 自己的牌不需要记
      const isBombPlay = record.handType && record.handType.includes('炸弹');
      updateMemory(mem, record.seat, record.cards || [], isBombPlay);
    }
  }
  return mem;
}

/**
 * 新的一轮开始时重置记牌器
 */
export function resetMemory(roomId, seat, level, currentLevel) {
  const key = `${roomId}_${seat}`;
  npcMemories.set(key, createMemory(level, seat, currentLevel));
}

/**
 * 有人出牌时更新记牌
 */
export function onCardsPlayed(roomId, seat, fromSeat, cards, handType) {
  const key = `${roomId}_${seat}`;
  const mem = npcMemories.get(key);
  if (!mem) return;
  if (fromSeat === seat) return; // 自己出的牌不需要"记"

  const isBombPlay = handType && (handType.includes('炸弹') || handType.includes('同花顺'));
  updateMemory(mem, fromSeat, cards, isBombPlay);
}

/**
 * 构建传给 LLM 的 Prompt
 */
function buildPrompt(mySeat, hand, legalPlays, state, memory = null) {
  const level = state.currentLevel;
  const isFreePlay = !state.lastPlay || state.lastPlaySeat === mySeat;
  const teammateSeat = (mySeat + 2) % 4;
  const leftSeat = (mySeat + 3) % 4;
  const rightSeat = (mySeat + 1) % 4;

  const handCounts = state.hands.map(h => h.length);
  
  // 局面描述
  const situation = [
    `当前打：${numToFace(level)}级（${numToFace(level)}是主牌/级牌，♥${numToFace(level)}是万能牌）`,
    `你的座位：${mySeat}（队友是座位${teammateSeat}，对手是座位${leftSeat}和${rightSeat}）`,
    `各人剩余牌数：你(${handCounts[mySeat]}) 右家(${handCounts[rightSeat]}) 队友(${handCounts[teammateSeat]}) 左家(${handCounts[leftSeat]})`,
  ].join('\n');

  // 当前局面
  const lastPlayDesc = isFreePlay
    ? '当前轮到你领牌（自由出牌）'
    : `上家(座位${state.lastPlaySeat}) 出了：【${HandTypeName[state.lastPlay.type]} ${cardsToStr(state.lastPlay.cards || [], level)}】，你需要管上或者过`;

  // 你的手牌
  const handDesc = '你的手牌：' + cardsToStr(hand, level);

  // 合法出牌列表（最多显示 12 个，避免 Prompt 太长）
  const displayPlays = legalPlays.slice(0, 12);
  const playsDesc = '可以出的牌：\n' + displayPlays.map((play, i) => {
    if (!play || play.length === 0) return `  [${i}] 过牌`;
    return `  [${i}] ${cardsToStr(play, level)}`;
  }).join('\n');

  // 已出牌记录（最近 8 手）
  const recentHistory = (state.roundHistory || []).slice(-8).map(h =>
    `  座位${h.seat}: ${cardsToStr(h.cards, level)} (${h.handType})`
  ).join('\n');
  const historyDesc = recentHistory ? `最近出牌记录：\n${recentHistory}` : '（本局刚开始）';

  // 记牌信息（根据 AI 级别显示不同详细程度）
  const memorySummary = memory ? getMemorySummary(memory, level) : null;
  const memoryDesc = memorySummary ? `\n记牌信息：\n${memorySummary}` : '';

  // 掼蛋策略提示
  const strategyHints = `
掼蛋关键策略：
- 队友牌少（≤5张）时，尽量让路，不要截断队友的牌权
- 对手（左家/右家）牌少（≤5张）时，要想办法拦截或逼炸
- 炸弹是稀缺资源，不到关键时刻不轻易用
- 级牌和万能牌价值极高，轻易不出
- 领牌时优先出对手难跟的牌型（连对、钢板）顶住下家
- 顺子不能含2，级牌在顺子里作为普通牌对应的数字`.trim();

  const prompt = `你是一个掼蛋高手，请为我选择最优出牌。

${situation}
${lastPlayDesc}
${handDesc}

${playsDesc}

${historyDesc}${memoryDesc}

${strategyHints}

请选择最优出牌。只输出一个数字（合法出牌列表的序号），不要解释。
如果应该过牌则输出 -1。
只输出数字，例如：3`;

  return { prompt, displayPlays };
}

/**
 * 浏览器版：直接抛错，强制走规则 AI fallback（getAIDecision）
 */
function callGemini(prompt, timeoutMs = LLM_TIMEOUT_MS) {
  return Promise.reject(new Error('LLM disabled in browser'));
}

/**
 * LLM AI 决策主函数
 * @param {number} seat - 当前玩家座位
 * @param {Array} hand - 手牌
 * @param {Object} state - 完整游戏状态（含 lastPlay, lastPlaySeat, currentLevel, hands, roundHistory）
 * @param {string} fallbackLevel - 降级时使用的贪心 AI 等级
 * @returns {Promise<Array|null>} 要出的牌，null 表示过牌
 */
export async function getLLMAIDecision(seat, hand, state, fallbackLevel = AILevel.EXPERT, roomId = null) {
  const isFreePlay = !state.lastPlay || state.lastPlaySeat === seat;
  const effectiveLastPlay = isFreePlay ? null : state.lastPlay;

  // 获取或初始化记牌器
  let memory = null;
  if (roomId) {
    memory = getMemory(roomId, seat, fallbackLevel, state.currentLevel);
  }

  // 获取合法出牌列表
  const legalPlays = findPlayableHands(hand, effectiveLastPlay, state.currentLevel);

  // 没有合法出牌
  if (legalPlays.length === 0) {
    return isFreePlay ? hand.slice(0, 1) : null;
  }

  try {
    const { prompt, displayPlays } = buildPrompt(seat, hand, legalPlays, state, memory);

    const responseText = await callGemini(prompt);

    // 解析 LLM 输出的数字
    const match = responseText.match(/-?\d+/);
    if (!match) throw new Error(`LLM 返回非数字: "${responseText}"`);

    const idx = parseInt(match[0]);

    if (idx === -1) {
      // LLM 选择过牌
      return isFreePlay ? legalPlays[0] : null; // 自由出牌时不能过，取第一个合法出牌
    }

    if (idx >= 0 && idx < displayPlays.length) {
      return displayPlays[idx];
    }

    throw new Error(`LLM 返回越界 index: ${idx}, 合法范围 0-${displayPlays.length - 1}`);

  } catch (err) {
    // 降级到贪心算法
    const aiState = {
      seat,
      lastPlay: effectiveLastPlay,
      currentLevel: state.currentLevel,
      isTeammateWinning: !isFreePlay && state.lastPlaySeat === (seat + 2) % 4,
      playersHandCounts: state.hands.map(h => h.length)
    };
    console.warn(`[LLM降级] 座位${seat}: ${err.message} → 使用贪心算法`);
    return getAIDecision(hand, aiState, fallbackLevel);
  }
}

/**
 * 测试函数：用当前游戏状态跑一次 LLM 决策，打印 Prompt 和结果
 */
export async function testLLMDecision(seat, hand, state) {
  const isFreePlay = !state.lastPlay || state.lastPlaySeat === seat;
  const effectiveLastPlay = isFreePlay ? null : state.lastPlay;
  const legalPlays = findPlayableHands(hand, effectiveLastPlay, state.currentLevel);

  const { prompt } = buildPrompt(seat, hand, legalPlays, state);
  console.log('\n=== LLM Prompt ===');
  console.log(prompt);
  console.log('\n=== 合法出牌数量 ===', legalPlays.length);

  const result = await getLLMAIDecision(seat, hand, state);
  console.log('\n=== LLM 决策结果 ===');
  console.log(result ? result.map(c => `${c.rank}`).join(',') : '过牌');
  return result;
}
