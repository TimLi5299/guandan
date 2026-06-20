#!/usr/bin/env node
/**
 * selfplay.mjs — 掼蛋 NPC 自战模拟
 *
 * 用法:
 *   node server-runtime/selfplay.mjs [局数=10] [级别=expert|normal|noob]
 *   node server-runtime/selfplay.mjs --ablation [局数=20]
 *
 * 输出统计：胜率、PASS率、队友让路合规率、炸弹拦截率、进贡正确率、异常行为
 * --ablation 模式：逐项去掉 R1-R9，与基准（全技能）对比，量化每项技能的贡献
 */

import {
  createGameState, startRound, playCards, pass,
  initTribute, startTribute, handleTribute, handleReturnTribute
} from './game/engine.js';
import { getPracticeNPCDecision, AILevel } from './npc/PracticeNPC.js';
import { resetMemory, onCardsPlayed } from './game/llm_ai.js';
import { SKILLS, NPC_PRESETS } from './npc/SkillProfiles.js';
import { isBomb as isBombType } from './game/handClassifier.js';

// ─────────── 参数解析 ───────────
const args = process.argv.slice(2);
const ABLATION_MODE = args.includes('--ablation');
const VS_MODE = args.includes('--vs');   // v1.4: --vs presetA presetB N（A/B 队对抗，跑双方向）
const numArgs = args.filter(a => !a.startsWith('--'));

// M1 v1.0 任务：--repeat M 参数，每个条件独立重跑 M 次以支持 t-test
function parseFlagInt(flag, defaultValue) {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return defaultValue;
  const v = parseInt(args[idx + 1]);
  return Number.isFinite(v) && v > 0 ? v : defaultValue;
}
const REPEAT = parseFlagInt('--repeat', 1);

let N_GAMES, levelStr, LEVEL, PROFILE;

if (ABLATION_MODE) {
  N_GAMES  = parseInt(numArgs[0]) || 20;
  LEVEL    = AILevel.EXPERT;
  PROFILE  = NPC_PRESETS.expert;
} else {
  N_GAMES  = parseInt(numArgs[0]) || 10;
  levelStr = (numArgs[1] || 'expert').toLowerCase();
  LEVEL    = levelStr === 'normal' ? AILevel.NORMAL
           : levelStr === 'noob'   ? AILevel.NOOB
           :                         AILevel.EXPERT;
  PROFILE  = NPC_PRESETS[levelStr] ?? NPC_PRESETS.expert;
}

// ─────────── 统计累积（每次 runNGames 独立） ───────────
function makeStats() {
  return {
    roundsPlayed: 0,
    team1Wins: 0,
    team2Wins: 0,
    totalDecisions: 0,
    totalPasses: 0,
    shouldYield: 0,
    didYield: 0,
    bombOpportunities: 0,
    bombsUsed: 0,
    tributeTotal: 0,
    tributeMaxCard: 0,
    returnTotal: 0,
    returnSmall: 0,
    totalTricks: 0,
    totalBombs: 0,
    anomalies: [],
    errors: 0,
    errorDetails: [],   // E1 任务 instrumentation：每条错误的分类 + 上下文
  };
}

// E1 任务 instrumentation：把错误分类 + 上下文 push 进 errorDetails
// 限制总条数避免内存爆，每类前 10 条已经足够找模式
function logError(S, type, ctx) {
  S.errors++;
  const sameTypeCount = S.errorDetails.filter(e => e.type === type).length;
  if (sameTypeCount < 10) {
    S.errorDetails.push({ type, ctx });
  }
}

// ─────────── 工具 ───────────
function looksLikeBomb(cards) {
  if (!cards || cards.length < 4) return false;
  const ranks = cards.map(c => c.rank);
  if (ranks.every(r => r === ranks[0])) return true;
  if (cards.length === 4 && cards.every(c => c.rank === 15 || c.rank === 16)) return true;
  if (cards.length >= 5) {
    const suits = cards.map(c => c.suit);
    if (suits.every(s => s === suits[0])) {
      const sr = [...ranks].sort((a, b) => a - b);
      for (let i = 1; i < sr.length; i++) if (sr[i] !== sr[i - 1] + 1) return false;
      return true;
    }
  }
  return false;
}

function hasBombInHand(hand) {
  const rc = {};
  for (const c of hand) rc[c.rank] = (rc[c.rank] || 0) + 1;
  if (Object.values(rc).some(n => n >= 4)) return true;
  const jokers = hand.filter(c => c.rank === 15 || c.rank === 16);
  if (jokers.length >= 4) return true;
  const bySuit = {};
  for (const c of hand) (bySuit[c.suit] = bySuit[c.suit] || []).push(c.rank);
  for (const ranks of Object.values(bySuit)) {
    if (ranks.length < 5) continue;
    const sorted = [...ranks].sort((a, b) => a - b);
    for (let i = 0; i <= sorted.length - 5; i++) {
      if (sorted[i + 4] - sorted[i] === 4) return true;
    }
  }
  return false;
}

// ─────────── 进贡选牌 ───────────
// E2 同步：与 engine 的协会版规则对齐——进贡手中最大的牌（红心级牌除外，王/级牌在范围内，按牌力比较）
// 牌力：大王(16) > 小王(15) > 级牌(14.5) > A(14) > ...（与 engine.tributeValue 保持一致）
function tributeValue(card, currentLevel) {
  if (card.rank >= 15) return card.rank;
  if (card.rank === currentLevel) return 14.5;
  return card.rank;
}
function pickTributeCard(hand, currentLevel) {
  const valid = hand.filter(c => !(c.suit === 1 && c.rank === currentLevel));  // 排除红心级牌
  if (valid.length === 0) return hand[0];
  return valid.sort((a, b) => tributeValue(b, currentLevel) - tributeValue(a, currentLevel))[0];
}

// 还贡：选最小的非级牌（rank 最小天然满足"队内还贡 ≤10"的协会限制）
function pickReturnCard(hand, currentLevel) {
  const valid = hand.filter(c => c.rank !== currentLevel && c.rank <= 10);
  if (valid.length === 0) {
    // 兜底：全手 >10 或全是级牌（极罕见），选最小非级牌
    const fallback = hand.filter(c => c.rank !== currentLevel);
    return (fallback.length > 0 ? fallback : hand).sort((a, b) => a.rank - b.rank)[0];
  }
  return valid.sort((a, b) => a.rank - b.rank)[0];
}

// ─────────── 驱动进贡阶段 ───────────
function driveTribute(state, S) {
  const ts = state.tributeState;
  if (!ts || ts.phase === 'completed') return;

  for (const fromSeat of ts.fromSeats) {
    if (ts.tributeCards[fromSeat]) continue;
    const card = pickTributeCard(state.hands[fromSeat], state.currentLevel);
    if (!card) {
      logError(S, 'E1_pickTributeCard_null', { fromSeat, handSize: state.hands[fromSeat].length, level: state.currentLevel });
      continue;
    }
    const r = handleTribute(state, fromSeat, card.id);
    if (r.error) {
      logError(S, 'E2_handleTribute_error', { fromSeat, cardRank: card.rank, errorMsg: r.error });
      continue;
    }
    S.tributeTotal++;
    const maxCard = pickTributeCard(state.hands[fromSeat].concat([card]), state.currentLevel);
    if (!maxCard || card.rank >= maxCard.rank) S.tributeMaxCard++;
  }

  if (ts.phase !== 'waiting_return') return;
  for (const toSeat of ts.toSeats) {
    if (ts.returnCards[toSeat]) continue;
    const card = pickReturnCard(state.hands[toSeat], state.currentLevel);
    if (!card) {
      logError(S, 'E3_pickReturnCard_null', { toSeat, handSize: state.hands[toSeat].length, level: state.currentLevel });
      continue;
    }
    const r = handleReturnTribute(state, toSeat, card.id);
    if (r.error) {
      logError(S, 'E4_handleReturnTribute_error', { toSeat, cardRank: card.rank, errorMsg: r.error });
      continue;
    }
    S.returnTotal++;
    if (card.rank <= 8) S.returnSmall++;
  }
}

// ─────────── 记牌器喂入（与产线 index.js 同口径，修复实验室记牌盲区） ───────────
const ARENA_ROOM_ID = 'selfplay_arena';
function feedMemories(fromSeat, cards) {
  const handType = looksLikeBomb(cards) ? '炸弹' : '';
  for (let s = 0; s < 4; s++) {
    if (s !== fromSeat) onCardsPlayed(ARENA_ROOM_ID, s, fromSeat, cards, handType);
  }
}
function resetAllMemories(currentLevel) {
  for (let s = 0; s < 4; s++) resetMemory(ARENA_ROOM_ID, s, LEVEL, currentLevel);
}

// ─────────── 驱动出牌（一局） ───────────
function drivePlay(state, S, profile) {
  const MAX_MOVES = 400;
  let moves = 0;

  while (state.phase === 'playing' && moves++ < MAX_MOVES) {
    const seat = state.currentTurn;
    const hand = state.hands[seat];

    if (!hand || hand.length === 0) {
      logError(S, 'E5_empty_hand_in_play', { seat, handsAllSizes: state.hands.map(h => h?.length ?? 'null'), phase: state.phase });
      break;
    }

    const isFreePlay = !state.lastPlay || state.lastPlaySeat === seat;
    const teammateSeat = (seat + 2) % 4;
    const isTeammateWinning = !isFreePlay && state.lastPlaySeat === teammateSeat;
    const lCount = state.hands[(seat + 3) % 4].length;
    const rCount = state.hands[(seat + 1) % 4].length;
    const opponentNearWin = (lCount > 0 && lCount <= 5) || (rCount > 0 && rCount <= 5);

    const shouldYield = !isFreePlay && isTeammateWinning && hand.length > 5 && !opponentNearWin;
    const canBomb = !isFreePlay && opponentNearWin && hasBombInHand(hand);

    const gameState = {
      lastPlay: isFreePlay ? null : state.lastPlay,
      lastPlaySeat: state.lastPlaySeat,
      currentLevel: state.currentLevel,
      roomId: ARENA_ROOM_ID,   // 记牌盲区修复：实验室此前不传 roomId → memory 恒 null
      seat,
      isTeammateWinning,
      playersHandCounts: state.hands.map(h => h.length),
      hands: state.hands,
      roundHistory: state.roundHistory,
    };

    // v1.4 --vs 模式：profile 可为 per-seat 数组
    const seatProfile = Array.isArray(profile) ? profile[seat] : profile;
    const { play } = getPracticeNPCDecision(hand, gameState, LEVEL, seat, seatProfile);
    S.totalDecisions++;

    if (shouldYield) {
      S.shouldYield++;
      if (play === null) {
        S.didYield++;
      } else if (S.anomalies.length < 30) {
        S.anomalies.push(
          `未让路 seat=${seat}(${hand.length}张) tmSeat=${teammateSeat} → rank=${play.map(c=>c.rank).join(',')}`
        );
      }
    }

    const canBombReal = canBomb && !isTeammateWinning;
    if (canBombReal) {
      S.bombOpportunities++;
      if (play && looksLikeBomb(play)) S.bombsUsed++;
    }

    if (play === null) {
      S.totalPasses++;
      const r = pass(state, seat);
      if (r.error) {
        const forced = [hand[0]];
        const fr = playCards(state, seat, [hand[0].id]);
        if (fr.error) {
          logError(S, 'E6_pass_then_fallback_failed', {
            seat, handSize: hand.length, isFreePlay,
            passError: r.error, fallbackError: fr.error,
            firstCardRank: hand[0].rank, lastPlayRank: state.lastPlay?.mainRank
          });
          break;
        }
        feedMemories(seat, forced);
      }
    } else {
      const r = playCards(state, seat, play.map(c => c.id));
      if (r.error) {
        const forced = [hand[0]];
        const fr = playCards(state, seat, [hand[0].id]);
        if (fr.error) {
          logError(S, 'E7_play_then_fallback_failed', {
            seat, handSize: hand.length, isFreePlay,
            playRanks: play.map(c => c.rank), playError: r.error, fallbackError: fr.error,
            lastPlayRank: state.lastPlay?.mainRank, lastPlayType: state.lastPlay?.type
          });
          break;
        }
        feedMemories(seat, forced);
      } else {
        feedMemories(seat, play);
      }
    }
  }

  if (moves >= MAX_MOVES) {
    logError(S, 'E8_max_moves_reached', { handsSizes: state.hands.map(h => h?.length ?? 0), phase: state.phase });
  }

  S.totalTricks += state.roundHistory.length;
  S.totalBombs  += state.bombCount;
  S.roundsPlayed++;

  if (state.finishOrder.length >= 2) {
    const [f1, f2] = state.finishOrder;
    const t1 = [0, 2], t2 = [1, 3];
    if (t1.includes(f1) && t1.includes(f2)) S.team1Wins++;
    else if (t2.includes(f1) && t2.includes(f2)) S.team2Wins++;
    else if (t1.includes(f1)) S.team1Wins++;
    else S.team2Wins++;
  }
}

// ─────────── 运行单场完整游戏 ───────────
function runOneGame(S, profile) {
  const state = createGameState();
  startRound(state);
  resetAllMemories(state.currentLevel);
  drivePlay(state, S, profile);

  const MAX_ROUNDS = 60;
  let roundsThisGame = 1;

  while (state.phase !== 'game_over' && roundsThisGame < MAX_ROUNDS) {
    if (state.tributeNextRound) {
      const tributeInfo = state.tributeNextRound;
      state.tributeNextRound = null;
      startTribute(state, tributeInfo);
      driveTribute(state, S);
      state.finishOrder  = [];
      state.roundHistory = [];
      state.bombCount    = 0;
    } else {
      startRound(state);
    }
    resetAllMemories(state.currentLevel);

    if (state.phase !== 'playing') {
      logError(S, 'E9_phase_not_playing_after_round', { phase: state.phase, roundsThisGame, finishOrder: state.finishOrder });
      break;
    }
    drivePlay(state, S, profile);
    roundsThisGame++;
  }
}

// ─────────── 运行 N 场并返回统计 ───────────
function runNGames(n, profile) {
  const S = makeStats();
  for (let g = 0; g < n; g++) {
    runOneGame(S, profile);
  }
  return S;
}

// ─────────── 统计 → 指标 ───────────
function calcMetrics(S) {
  const avgTricks = S.roundsPlayed > 0 ? S.totalTricks / S.roundsPlayed : 0;
  const yieldRate = S.shouldYield > 0 ? S.didYield / S.shouldYield * 100 : null;
  const blockRate = S.bombOpportunities > 0 ? S.bombsUsed / S.bombOpportunities * 100 : null;
  const passRate  = S.totalDecisions > 0 ? S.totalPasses / S.totalDecisions * 100 : 0;
  return { avgTricks, yieldRate, blockRate, passRate };
}

// ─────────── 普通模式报告 ───────────
function printReport(S, n, label, elapsed) {
  const { avgTricks, yieldRate, blockRate, passRate } = calcMetrics(S);
  const total  = S.team1Wins + S.team2Wins;
  const t1Rate = total > 0 ? (S.team1Wins / total * 100).toFixed(1) : '?';
  const t2Rate = total > 0 ? (S.team2Wins / total * 100).toFixed(1) : '?';

  const bar = '='.repeat(54);
  console.log(`\n${bar}`);
  console.log(` 掼蛋 NPC 自战结果  (${n}场 / ${S.roundsPlayed}局 · ${label} · ${elapsed}s)`);
  console.log(bar);
  console.log(` 胜率   Team 0/2 = ${t1Rate}%   Team 1/3 = ${t2Rate}%`);
  console.log(` 平均手数/局: ${avgTricks.toFixed(1)}   平均炸弹/局: ${(S.totalBombs/S.roundsPlayed).toFixed(2)}`);
  console.log(` PASS率: ${passRate.toFixed(1)}%   总决策: ${S.totalDecisions}`);
  console.log('');
  console.log(' 行为指标:');

  const yr = yieldRate !== null ? yieldRate.toFixed(1) + '%' : 'N/A';
  const br = blockRate !== null ? blockRate.toFixed(1) + '%' : 'N/A';
  const ym = yieldRate === null ? '' : yieldRate >= 85 ? '✅' : yieldRate >= 70 ? '⚠ ' : '❌';
  const bm = blockRate === null ? '' : blockRate >= 60 ? '✅' : blockRate >= 40 ? '⚠ ' : '❌';

  console.log(`   队友领先让路率:  ${String(yr).padStart(7)}  ${ym}  (目标>85%, 样本${S.shouldYield})`);
  console.log(`   对手快完炸弹拦:  ${String(br).padStart(7)}  ${bm}  (目标>60%, 样本${S.bombOpportunities})`);

  if (S.anomalies.length > 0) {
    const show = S.anomalies.slice(0, 5);
    console.log(`\n 异常行为（共${S.anomalies.length}条，前5条）:`);
    show.forEach(a => console.log(`   ⚠  ${a}`));
  }
  if (S.errors > 0) {
    console.log(`\n ❌ 引擎/逻辑错误: ${S.errors} 次`);
    // E1 任务 instrumentation：分类汇总
    const byType = {};
    for (const e of S.errorDetails) {
      byType[e.type] = (byType[e.type] || 0) + 1;
    }
    // 估算每类总数（errorDetails 每类最多保留 10 条样本）
    const totalSamples = S.errorDetails.length;
    console.log(`\n 错误分类（详细样本前 ${totalSamples} 条，每类≤10）：`);
    for (const [type, count] of Object.entries(byType).sort((a,b) => b[1] - a[1])) {
      console.log(`   ${type.padEnd(36)} 样本 ${count}`);
    }
    console.log('\n 错误样本明细（前 5 条）:');
    S.errorDetails.slice(0, 5).forEach((e, i) => {
      console.log(`   [${i+1}] ${e.type}`);
      console.log(`        ${JSON.stringify(e.ctx)}`);
    });
  }
  console.log('');
}

// ─────────── 消融测试报告 ───────────
function printAblationReport(baseline, ablationResults, n) {
  const bm = calcMetrics(baseline);
  const bar = '='.repeat(60);

  console.log(`\n${bar}`);
  console.log(` 掼蛋 NPC 技能消融测试  (每组 ${n} 场)`);
  console.log(bar);
  console.log(` 基准 (全技能 expert):`);
  console.log(`   平均手数=${bm.avgTricks.toFixed(1)}  让路率=${bm.yieldRate !== null ? bm.yieldRate.toFixed(1)+'%' : 'N/A'}  炸弹拦=${bm.blockRate !== null ? bm.blockRate.toFixed(1)+'%' : 'N/A'}`);
  console.log('');
  console.log(' 各技能贡献（去掉后 vs 基准）:');
  console.log(' ' + '-'.repeat(58));

  const skillNames = {
    [SKILLS.R1]: 'R1 队友让路     ',
    [SKILLS.R2]: 'R2 炸弹时机     ',
    [SKILLS.R3]: 'R3 拆牌优化     ',
    [SKILLS.R4]: 'R4 记牌推断     ',
    [SKILLS.R5]: 'R5 级牌保护     ',
    [SKILLS.R6]: 'R6 对手推断     ',
    [SKILLS.R7]: 'R7 信号传递     ',
    [SKILLS.R8]: 'R8 残局解算     ',
    [SKILLS.R9]: 'R9 领牌评分     ',
  };

  for (const { skill, S } of ablationResults) {
    const m = calcMetrics(S);
    const dTricks = m.avgTricks - bm.avgTricks;
    const sign = dTricks >= 0 ? '+' : '';
    const impact = Math.abs(dTricks) >= 3 ? '⬆ 显著' : Math.abs(dTricks) >= 1 ? '△ 有效' : '~ 微弱';
    const yr = m.yieldRate !== null ? m.yieldRate.toFixed(1) + '%' : 'N/A';
    console.log(
      ` 去掉 ${skillNames[skill] ?? skill.padEnd(16)} ` +
      `手数=${m.avgTricks.toFixed(1)} (Δ${sign}${dTricks.toFixed(1)})  ` +
      `让路=${yr}  ${impact}`
    );
  }
  console.log(' ' + '-'.repeat(58));
  console.log('');
}

// ─────────── M1 v1.0：统计工具（mean/std/Welch t-test）───────────

function mean(arr) {
  return arr.reduce((s, x) => s + x, 0) / arr.length;
}
function std(arr, mn = mean(arr)) {
  if (arr.length < 2) return 0;
  return Math.sqrt(arr.reduce((s, x) => s + (x - mn) ** 2, 0) / (arr.length - 1));
}

// Abramowitz & Stegun 26.2.17 标准正态 CDF 近似（误差 < 7.5e-8）
function normalCdf(z) {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = z < 0 ? -1 : 1;
  z = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + p * z);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-z * z);
  return 0.5 * (1 + sign * y);
}

// Welch's t-test（不假设方差相等）。df ≥ 20 时正态近似的 p-value 误差很小
function welchTTest(s1, s2) {
  const m1 = mean(s1), m2 = mean(s2);
  const v1 = std(s1, m1) ** 2, v2 = std(s2, m2) ** 2;
  const n1 = s1.length, n2 = s2.length;
  const se = Math.sqrt(v1 / n1 + v2 / n2);
  if (se === 0) return { t: 0, df: Infinity, p: 1 };
  const t = (m1 - m2) / se;
  const df = (v1 / n1 + v2 / n2) ** 2 /
             ((v1 / n1) ** 2 / (n1 - 1) + (v2 / n2) ** 2 / (n2 - 1));
  // 正态近似（双侧 p 值）；df ≥ 20 时与精确 t-distribution 差异 < 1%
  const p = 2 * (1 - normalCdf(Math.abs(t)));
  return { t, df, p };
}

// ─────────── M2: 三维度统计分析 ───────────

// 从一组 stats 中抽出指定指标的 sample 数组（过滤 null）
function extractSamples(statsArr, metricName) {
  return statsArr.map(calcMetrics).map(m => m[metricName]).filter(v => v !== null);
}

// 通用：对一个维度跑 t-test 表
function analyzeDimension(label, baselineSamples, ablationResults, skillNames) {
  const bMean = mean(baselineSamples), bStd = std(baselineSamples, bMean);
  const baseLine = label === 'avgTricks'
    ? `   平均手数 = ${bMean.toFixed(2)} ± ${bStd.toFixed(2)}`
    : label === 'yieldRate'
    ? `   让路率   = ${bMean.toFixed(2)}% ± ${bStd.toFixed(2)}%`
    : `   炸弹拦截 = ${bMean.toFixed(2)}% ± ${bStd.toFixed(2)}%`;
  console.log(baseLine);
  return ablationResults.map(({ skill, runs }) => {
    const samples = extractSamples(runs, label);
    if (samples.length < 2) return { skill, t: 0, p: 1, mean: 0, std: 0, delta: 0 };
    const m = mean(samples), s = std(samples, m);
    const delta = m - bMean;
    const tt = welchTTest(samples, baselineSamples);
    return { skill, mean: m, std: s, delta, t: tt.t, p: tt.p };
  });
}

function fmtTtest(row, label) {
  const sig = row.p < 0.001 ? '***' : row.p < 0.01 ? '**' : row.p < 0.05 ? '*' : '';
  const sign = row.delta >= 0 ? '+' : '';
  const fmt = label === 'avgTricks' ? 2 : 1;
  const unit = label === 'avgTricks' ? '' : '%';
  return `${row.mean.toFixed(fmt)}${unit}±${row.std.toFixed(fmt)}${unit} ${sign}${row.delta.toFixed(fmt)} t=${row.t.toFixed(2).padStart(7)} p=${row.p.toFixed(4)}${sig}`;
}

// ─────────── M1 v1.0 / M2：带统计的消融报告（三维度）───────────
function printAblationReportWithStats(baselineRuns, ablationResults, n, repeat) {
  const bar = '='.repeat(110);
  const skillNames = {
    [SKILLS.R1]: 'R1 队友让路', [SKILLS.R2]: 'R2 炸弹时机',
    [SKILLS.R3]: 'R3 拆牌优化', [SKILLS.R4]: 'R4 记牌推断',
    [SKILLS.R5]: 'R5 级牌保护', [SKILLS.R6]: 'R6 对手推断',
    [SKILLS.R7]: 'R7 信号传递', [SKILLS.R8]: 'R8 残局解算',
    [SKILLS.R9]: 'R9 领牌评分', [SKILLS.R10]: 'R10 形势领牌',
    [SKILLS.R11]: 'R11 万能拆牌', [SKILLS.R12]: 'R12 忍牌保型',
    [SKILLS.R13]: 'R13 出口规划', [SKILLS.R14]: 'R14 顺子保护',
    [SKILLS.R15]: 'R15 三张保护',
  };

  console.log(`\n${bar}`);
  console.log(` 掼蛋 NPC 技能消融测试 + Welch's t-test  (每组 ${n} 场 × ${repeat} 次重复)  ——三维度`);
  console.log(bar);
  console.log(` 基准 (全技能 expert):`);

  // 三维度的 baseline samples
  const bTricks = extractSamples(baselineRuns, 'avgTricks');
  const bYield  = extractSamples(baselineRuns, 'yieldRate');
  const bBlock  = extractSamples(baselineRuns, 'blockRate');

  // 三维度跑 t-test
  const tricksRows = analyzeDimension('avgTricks', bTricks, ablationResults, skillNames);
  const yieldRows  = analyzeDimension('yieldRate', bYield,  ablationResults, skillNames);
  const blockRows  = analyzeDimension('blockRate', bBlock,  ablationResults, skillNames);

  console.log('');
  console.log(' 三维度 t-test 矩阵（去掉 vs 基准，每行 3 个 p-value 表明该技能在 3 维度上的显著性）:');
  console.log(' ' + '-'.repeat(108));
  console.log(' ' +
    'Skill               '.padEnd(18) +
    '手数 (avg±std Δ t p)              '.padEnd(38) +
    '让路率% (avg±std Δ t p)            '.padEnd(36) +
    '拦截率% (avg±std Δ t p)            '
  );
  console.log(' ' + '-'.repeat(108));

  for (let i = 0; i < tricksRows.length; i++) {
    const tr = tricksRows[i], yr = yieldRows[i], br = blockRows[i];
    const sigT = tr.p < 0.05 ? (tr.p < 0.001 ? '***' : tr.p < 0.01 ? '**' : '*') : ' ';
    const sigY = yr.p < 0.05 ? (yr.p < 0.001 ? '***' : yr.p < 0.01 ? '**' : '*') : ' ';
    const sigB = br.p < 0.05 ? (br.p < 0.001 ? '***' : br.p < 0.01 ? '**' : '*') : ' ';
    const skillName = skillNames[tr.skill] ?? tr.skill;
    const cell = (row, sig, fmt = 2, unit = '') => {
      const sign = row.delta >= 0 ? '+' : '';
      return `${row.mean.toFixed(fmt)}${unit} Δ${sign}${row.delta.toFixed(fmt)}${unit} p=${row.p.toFixed(3)}${sig}`;
    };
    console.log(' ' +
      skillName.padEnd(18) +
      cell(tr, sigT, 2).padEnd(38) +
      cell(yr, sigY, 1, '%').padEnd(36) +
      cell(br, sigB, 1, '%')
    );
  }
  console.log(' ' + '-'.repeat(108));
  console.log(' 显著性: * p<.05  ** p<.01  *** p<.001  (双侧 t-test)');
  console.log('');

  // 三维度矩阵已涵盖手数维度，旧的 ranking 块删除
}

// ─────────── v1.4: --vs 对抗模式 ───────────
function runVsMode() {
  const t0 = Date.now();
  const presetA = numArgs[0], presetB = numArgs[1];
  const N = parseInt(numArgs[2]) || 500;
  const pA = NPC_PRESETS[presetA], pB = NPC_PRESETS[presetB];
  if (!pA || !pB) {
    console.error(`未知 preset：${presetA} / ${presetB}（可用：${Object.keys(NPC_PRESETS).join(', ')}）`);
    process.exit(1);
  }
  const half = Math.floor(N / 2);
  console.log(`\n对抗模式：${presetA}(A队) vs ${presetB}(B队)，共 ${half * 2} 场（双方向各 ${half}）...`);

  // 方向 1：A 队坐 seat 0/2
  const S1 = runNGames(half, [pA, pB, pA, pB]);
  // 方向 2：A 队坐 seat 1/3（消除先手偏差）
  const S2 = runNGames(half, [pB, pA, pB, pA]);

  const aWins = S1.team1Wins + S2.team2Wins;
  const total = S1.team1Wins + S1.team2Wins + S2.team1Wins + S2.team2Wins;
  const rate = (aWins / total * 100).toFixed(1);
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n===== ${presetA} vs ${presetB}（${total} 场有效 · ${elapsed}s）=====`);
  console.log(` ${presetA} 胜率: ${rate}%   （方向1: ${S1.team1Wins}/${S1.team1Wins + S1.team2Wins}, 方向2: ${S2.team2Wins}/${S2.team1Wins + S2.team2Wins}）`);
  console.log(` 错误: ${S1.errors + S2.errors}`);
}

// ─────────── 主循环 ───────────
function main() {
  const t0 = Date.now();

  if (VS_MODE) { runVsMode(); return; }

  if (ABLATION_MODE) {
    if (REPEAT === 1) {
      // 兼容老用法：单次 ablation
      console.log(`\n运行消融测试，每组 ${N_GAMES} 场...`);
      const baseline = runNGames(N_GAMES, NPC_PRESETS.expert);
      const ablationResults = [];
      for (const [id, skill] of Object.entries(SKILLS)) {
        const withoutSkill = new Set([...NPC_PRESETS.expert].filter(s => s !== skill));
        const S = runNGames(N_GAMES, withoutSkill);
        ablationResults.push({ skill, S });
      }
      const elapsed = ((Date.now() - t0) / 1000).toFixed(2);
      console.log(`(用时 ${elapsed}s)`);
      printAblationReport(baseline, ablationResults, N_GAMES);
    } else {
      // M1 v1.0 新增：M 次重复 + Welch's t-test
      const totalGames = (1 + Object.keys(SKILLS).length) * REPEAT * N_GAMES;
      console.log(`\n运行消融测试 + t-test，每组 ${N_GAMES} 场 × ${REPEAT} 次重复 (共 ${totalGames} 局)...`);

      const baselineRuns = [];
      for (let i = 0; i < REPEAT; i++) {
        baselineRuns.push(runNGames(N_GAMES, NPC_PRESETS.expert));
      }
      const ablationResults = [];
      for (const [id, skill] of Object.entries(SKILLS)) {
        const withoutSkill = new Set([...NPC_PRESETS.expert].filter(s => s !== skill));
        const runs = [];
        for (let i = 0; i < REPEAT; i++) {
          runs.push(runNGames(N_GAMES, withoutSkill));
        }
        ablationResults.push({ skill, runs });
      }
      const elapsed = ((Date.now() - t0) / 1000).toFixed(2);
      console.log(`(用时 ${elapsed}s)`);
      printAblationReportWithStats(baselineRuns, ablationResults, N_GAMES, REPEAT);
    }
  } else {
    const S = runNGames(N_GAMES, PROFILE);
    const elapsed = ((Date.now() - t0) / 1000).toFixed(2);
    const label = `${levelStr || 'expert'}`;
    printReport(S, N_GAMES, label, elapsed);
  }
}

main();
