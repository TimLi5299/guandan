/**
 * TutorialEngine.js — 教学引擎核心
 *
 * 负责：
 *   - 加载课程配置
 *   - 管理教学步骤进度
 *   - 验证玩家操作
 *   - 推送引导消息
 */

import { dealForLesson } from './SandboxDealer.js';
import { classifyHand, HandTypeName, HandType } from '../game/handClassifier.js';
import { canPlay } from '../game/rules.js';
import { createGameState } from '../game/engine.js';

// 浏览器环境下 lesson 文件名对照表
const LESSON_FILES = {
  '01': '01_card_basics.json',
  '02': '02_hand_types.json',
  '03': '03_bombs.json',
  '04': '04_tribute.json',
  '05': '05_full_game.json',
};

// 内存中存储每个玩家的教学状态
const sessions = new Map();

// 已加载的 lesson JSON 缓存
const lessonCache = new Map();

/**
 * 浏览器版：通过 fetch 同步 + 缓存加载课程
 * 调用前必须用 preloadLesson 异步预加载
 */
export function loadLesson(lessonId) {
  if (lessonCache.has(lessonId)) return lessonCache.get(lessonId);

  // 找出基础 id（"01" 或 "01_card_basics"）
  const baseId = lessonId.split('_')[0];
  if (!LESSON_FILES[baseId]) throw new Error(`找不到课程: ${lessonId}`);
  throw new Error(`课程未预加载: ${lessonId}，请先调用 preloadLesson()`);
}

/**
 * 预加载 lesson JSON（必须在 startLesson 之前调用）
 */
export async function preloadLesson(lessonId) {
  const baseId = lessonId.split('_')[0];
  const file = LESSON_FILES[baseId];
  if (!file) throw new Error(`找不到课程: ${lessonId}`);

  if (lessonCache.has(baseId)) return lessonCache.get(baseId);

  const url = new URL(`./lessons/${file}`, import.meta.url).href;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`加载课程失败: ${file}`);
  const data = await res.json();
  lessonCache.set(baseId, data);
  lessonCache.set(lessonId, data);
  return data;
}

/**
 * 开始一个教学课程
 * @returns { gameState, currentStep, lessonConfig }
 */
export function startLesson(playerId, lessonId) {
  const lesson = loadLesson(lessonId);

  // 创建沙盒游戏状态
  const sandboxConfig = lesson.sandboxConfig || { mode: 'random', cardsPerPlayer: 5 };
  const hands = dealForLesson(sandboxConfig, lesson.currentLevel || 2);

  const gameState = createGameState();
  gameState.hands = hands;
  gameState.phase = 'playing';
  gameState.currentLevel = lesson.currentLevel || 2;
  gameState.currentTurn = 0; // 玩家固定在seat 0
  gameState.isSandbox = true;

  const session = {
    playerId,
    lessonId,
    lesson,
    currentStepIndex: 0,
    gameState,
    completedSteps: [],
    startedAt: Date.now(),
  };

  sessions.set(playerId, session);

  const firstStep = lesson.steps[0];
  return {
    gameState,
    currentStep: firstStep,
    lessonConfig: {
      title: lesson.title,
      totalSteps: lesson.steps.length,
      currentStepIndex: 0,
    }
  };
}

/**
 * 获取当前教学会话
 */
export function getTutorialSession(playerId) {
  return sessions.get(playerId) || null;
}

/**
 * 验证玩家操作是否符合当前教学步骤
 * @param {string} playerId
 * @param {object} action - { type: 'PLAY'|'PASS', cardIds: [] }
 * @returns { correct, explanation, nextStep, completed }
 */
export function validateStep(playerId, action) {
  const session = sessions.get(playerId);
  if (!session) return { correct: false, explanation: '教学会话不存在' };

  const { lesson, currentStepIndex, gameState } = session;
  const step = lesson.steps[currentStepIndex];

  if (!step) return { correct: false, explanation: '课程已完成' };

  const result = checkAction(action, step, gameState);

  if (result.correct) {
    return {
      correct: true,
      explanation: step.onCorrect?.message || '很好！',
    };
  } else {
    return {
      correct: false,
      explanation: result.hint || step.onWrong?.hint || '请再试一次',
    };
  }
}

/**
 * 检查玩家操作是否符合步骤期望
 */
function checkAction(action, step, gameState) {
  const expected = step.expectedAction;

  if (expected === 'PLAY_ANY') {
    return { correct: action.type === 'PLAY', hint: '请出一张或多张牌' };
  }

  if (expected === 'PASS') {
    return { correct: action.type === 'PASS', hint: '请点"不出"按钮' };
  }

  if (expected === 'NEXT') {
    return { correct: true };
  }

  if (expected === 'PLAY_SINGLE') {
    if (action.type !== 'PLAY' || !action.cardIds || action.cardIds.length !== 1) {
      return { correct: false, hint: '请只选一张牌出' };
    }
    return { correct: true };
  }

  if (expected === 'PLAY_PAIR') {
    if (action.type !== 'PLAY' || !action.cardIds || action.cardIds.length !== 2) {
      return { correct: false, hint: '请选两张相同点数的牌' };
    }
    const cards = action.cardIds.map(id => gameState.hands[0].find(c => c.id === id)).filter(Boolean);
    const classified = classifyHand(cards, gameState.currentLevel);
    return {
      correct: classified.type === HandType.PAIR,
      hint: '两张牌的点数必须相同才是对子'
    };
  }

  if (expected === 'PLAY_BOMB') {
    if (action.type !== 'PLAY' || !action.cardIds || action.cardIds.length < 4) {
      return { correct: false, hint: '炸弹需要至少4张相同点数的牌' };
    }
    const cards = action.cardIds.map(id => gameState.hands[0].find(c => c.id === id)).filter(Boolean);
    const classified = classifyHand(cards, gameState.currentLevel);
    return {
      correct: classified.type >= HandType.BOMB_4,
      hint: '选4张或更多相同点数的牌就是炸弹'
    };
  }

  if (expected === 'PLAY_VALID') {
    // 任意合法出牌（相比上家）
    if (action.type !== 'PLAY') return { correct: false, hint: '请出牌' };
    const cards = action.cardIds.map(id => gameState.hands[0].find(c => c.id === id)).filter(Boolean);
    const result = canPlay(cards, gameState.lastPlay, gameState.currentLevel);
    return { correct: result.valid, hint: result.reason || '出牌不合法' };
  }

  // 默认：任何操作都算正确（用于自由探索步骤）
  return { correct: true };
}

/**
 * 推进教学步骤（外部强制跳过）
 */
export function advanceStep(playerId) {
  const session = sessions.get(playerId);
  if (!session) return null;
  session.currentStepIndex = Math.min(session.currentStepIndex + 1, session.lesson.steps.length);
  return session.currentStepIndex < session.lesson.steps.length
    ? session.lesson.steps[session.currentStepIndex]
    : null;
}

/**
 * 获取玩家教学进度
 */
export function getLessonProgress(playerId) {
  const session = sessions.get(playerId);
  if (!session) return null;
  return {
    lessonId: session.lessonId,
    currentStepIndex: session.currentStepIndex,
    totalSteps: session.lesson.steps.length,
    completedSteps: session.completedSteps,
  };
}

/**
 * 清理教学会话
 */
export function clearSession(playerId) {
  sessions.delete(playerId);
}
