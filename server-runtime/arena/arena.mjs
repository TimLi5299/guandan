/**
 * arena.mjs — 掼蛋 NPC 自对弈胜率台
 *
 * 目标（对应老铁的工作流第 0 步）：可复现、带置信下界、带地板闸门的"尺子"。
 *
 *   ① 同批发牌对照：固定种子发牌，A/B 两版打同一批牌 → 消除牌运噪声（控制方差）
 *   ② 座位轮换：A 先坐 0/2 再坐 1/3，消除先手偏差
 *   ③ 置信下界：输出 95% CI 下界（按铁律"看下界"下结论）
 *   ④ 地板闸门：内置 random 合法 bot；新版打它必须压倒性赢，否则报"可能是 bug"
 *   ⑤ 冻结梯队：可对 ladder/.ladder 里的历史版本逐个跑（先 bash build-ladder.sh）
 *
 * 引擎/发牌/校验全部用【当前工作区】（确定性代码当裁判，铁律 4）；
 * 只有 NPC 决策按"参赛方"切换到对应版本。
 *
 * 用法：
 *   node arena/arena.mjs <A> <B> [场数=400] [--seed 12345]
 *   node arena/arena.mjs --ladder <A> [场数=300]      # A 对全梯队 + 地板
 *
 *   参赛方标识 <A>/<B>：
 *     master / expert / normal / noob / lean   → 工作区引擎 + 该 preset
 *     random                                   → 随机合法地板 bot
 *     v2.1:master / v2.3:master ...            → 冻结梯队某版本的该 preset
 */

import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import {
  createGameState, startRound, startTribute,
  playCards, pass, handleTribute, handleReturnTribute,
} from '../game/engine.js';
import { makeRng } from '../game/deck.js';
import { findPlayableHands } from '../game/rules.js';
import { classifyHand, isBomb as isBombType } from '../game/handClassifier.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LADDER = resolve(__dirname, '.ladder');

/* ─────────────────── 进贡辅助（与 selfplay 同口径） ─────────────────── */
function tributeValue(card, lv) {
  if (card.rank >= 15) return card.rank;
  if (card.rank === lv) return 14.5;
  return card.rank;
}
function pickTributeCard(hand, lv) {
  const valid = hand.filter(c => !(c.suit === 1 && c.rank === lv));
  if (valid.length === 0) return hand[0];
  return valid.sort((a, b) => tributeValue(b, lv) - tributeValue(a, lv))[0];
}
function pickReturnCard(hand, lv) {
  const valid = hand.filter(c => c.rank !== lv && c.rank <= 10);
  if (valid.length === 0) {
    const fb = hand.filter(c => c.rank !== lv);
    return (fb.length > 0 ? fb : hand).sort((a, b) => a.rank - b.rank)[0];
  }
  return valid.sort((a, b) => a.rank - b.rank)[0];
}

/* ─────────────────── 参赛方加载 ─────────────────── */
/**
 * spec 例：'master' | 'random' | 'v2.3:master'
 * 返回 { label, isRandom, profile, mod }  mod = {getDecision, reset, onPlayed}
 */
async function loadAgent(spec) {
  if (spec === 'random') {
    return { label: 'random(地板)', isRandom: true, profile: null, mod: null };
  }
  let versionDir = '..';     // 默认工作区（相对 arena/）
  let presetName = spec;
  let errorRate = 0;
  // "preset@0.5" = 该 preset + 50% 失误率（难度旋钮）
  if (presetName.includes('@')) {
    const [pn, er] = presetName.split('@');
    presetName = pn; errorRate = parseFloat(er) || 0;
  }
  if (presetName.includes(':')) {
    const [ver, preset] = presetName.split(':');
    versionDir = resolve(LADDER, ver);
    presetName = preset;
  }
  const base = versionDir.startsWith('/') ? versionDir : resolve(__dirname, versionDir);
  const npc = await import(resolve(base, 'npc/PracticeNPC.js'));
  const sp = await import(resolve(base, 'npc/SkillProfiles.js'));
  const mem = await import(resolve(base, 'game/llm_ai.js'));
  const profile = sp.NPC_PRESETS[presetName];
  if (!profile) throw new Error(`未知 preset：${presetName}（${spec}）`);
  // 修复：按 preset 传对 level（原硬编码 'expert' → noob 没走 decideNoob、normal 记牌等级错）
  const level = presetName === 'noob' ? 'noob' : presetName === 'normal' ? 'normal' : 'expert';
  return {
    label: spec,
    isRandom: false,
    profile,
    level,
    errorRate,
    mod: {
      getDecision: npc.getPracticeNPCDecision,
      reset: mem.resetMemory,
      onPlayed: mem.onCardsPlayed,
    },
  };
}

/* ─────────────────── 决策视图（与 NPCEngine.buildDecisionView 同形） ─────────────────── */
// 台子用的 S2/S3 求解低配档：双方一致 → 公平，且把"跑几千盘"从小时级压到分钟级。
// 产线浏览器仍用各自默认（更准），台子只为"比较两版强度"服务，低配不影响相对结论。
const ARENA_S2 = { worlds: 6, budget: 40000 };
const ARENA_S3 = { worlds: 12, totalLeftMax: 56 };
function buildView(state, seat, roomId) {
  const isFreePlay = !state.lastPlay || state.lastPlaySeat === seat;
  return {
    lastPlay: isFreePlay ? null : state.lastPlay,
    lastPlaySeat: state.lastPlaySeat,
    currentLevel: state.currentLevel,
    roomId,
    seat,
    isTeammateWinning: !isFreePlay && state.lastPlaySeat === (seat + 2) % 4,
    playersHandCounts: state.hands.map(h => h.length),
    hands: state.hands,
    roundHistory: state.roundHistory,
    _s2opts: ARENA_S2,
    _s3opts: ARENA_S3,
  };
}

function isBombPlay(cards, lv) {
  try { return isBombType(classifyHand(cards, lv).type); } catch { return false; }
}

/* ─────────────────── 单场对局 ─────────────────── */
/**
 * @param seatAgents 长度4，每座位一个 agent
 * @param baseSeed   本场种子（决定每轮发牌；A/B 用同 seed → 同批牌）
 * @returns 0 = team(0,2) 头游 / 1 = team(1,3) 头游 / null = 异常
 */
function playGame(seatAgents, baseSeed) {
  // 关键：把全局 Math.random 临时换成种子化 rng → NPC 决策内部的随机（炸弹降级等）
  // 也变可复现。对工作区 + 冻结梯队所有版本生效，零侵入。finally 恢复。
  const origRandom = Math.random;
  Math.random = makeRng((Math.imul(baseSeed, 2246822519) ^ 0x5bd1e995) >>> 0);
  try {
    return _playGameInner(seatAgents, baseSeed);
  } finally {
    Math.random = origRandom;
  }
}

function _playGameInner(seatAgents, baseSeed) {
  const state = createGameState();
  const botRng = makeRng((baseSeed ^ 0x9e3779b9) >>> 0);
  const roomId = (seat) => `arena_${seat}`;
  let roundIdx = 0;
  const dealRng = () => makeRng((Math.imul(baseSeed, 100003) + roundIdx * 131 + 7) >>> 0);

  const resetMemsThisRound = () => {
    for (let s = 0; s < 4; s++) {
      const a = seatAgents[s];
      if (!a.isRandom) a.mod.reset(roomId(s), s, a.level, state.currentLevel);
    }
  };
  const feed = (fromSeat, cards) => {
    const ht = isBombPlay(cards, state.currentLevel) ? '炸弹' : '';
    for (let s = 0; s < 4; s++) {
      const a = seatAgents[s];
      if (!a.isRandom && s !== fromSeat) a.mod.onPlayed(roomId(s), s, fromSeat, cards, ht);
    }
  };

  const drivePlay = () => {
    let moves = 0;
    while (state.phase === 'playing' && moves++ < 400) {
      const seat = state.currentTurn;
      const hand = state.hands[seat];
      if (!hand || hand.length === 0) return false;
      const a = seatAgents[seat];
      const view = buildView(state, seat, roomId(seat));

      let play = null;
      if (a.isRandom) {
        const hints = findPlayableHands(hand, view.lastPlay, view.currentLevel);
        if (hints.length > 0) {
          const canPass = view.lastPlay != null;
          play = (canPass && botRng() < 0.3) ? null : hints[Math.floor(botRng() * hints.length)];
        }
      } else {
        try { play = a.mod.getDecision(hand, view, a.level, seat, a.profile, a.errorRate).play; }
        catch { play = null; }
      }

      let played = null;
      if (play === null) {
        const r = pass(state, seat);
        if (r.error) {
          const fr = playCards(state, seat, [hand[0].id]);
          if (fr.error) return false;
          played = [hand[0]];
        }
      } else {
        const r = playCards(state, seat, play.map(c => c.id));
        if (r.error) {
          const fr = playCards(state, seat, [hand[0].id]);
          if (fr.error) return false;
          played = [hand[0]];
        } else played = play;
      }
      if (played) feed(seat, played);
    }
    return true;
  };

  const driveTribute = () => {
    const ts = state.tributeState;
    if (!ts || ts.phase === 'completed') return;
    for (const fromSeat of ts.fromSeats) {
      if (ts.tributeCards[fromSeat]) continue;
      const card = pickTributeCard(state.hands[fromSeat], state.currentLevel);
      if (card) handleTribute(state, fromSeat, card.id);
    }
    if (ts.phase !== 'waiting_return') return;
    for (const toSeat of ts.toSeats) {
      if (ts.returnCards[toSeat]) continue;
      const card = pickReturnCard(state.hands[toSeat], state.currentLevel);
      if (card) handleReturnTribute(state, toSeat, card.id);
    }
  };

  // 第一轮
  startRound(state, dealRng()); roundIdx++;
  resetMemsThisRound();
  if (!drivePlay()) return null;

  let guard = 0;
  while (state.phase !== 'game_over' && guard++ < 60) {
    if (state.tributeNextRound) {
      const info = state.tributeNextRound;
      state.tributeNextRound = null;
      startTribute(state, info, dealRng()); roundIdx++;
      driveTribute();
      state.finishOrder = [];
      state.roundHistory = [];
      state.bombCount = 0;
    } else {
      startRound(state, dealRng()); roundIdx++;
    }
    resetMemsThisRound();
    if (state.phase !== 'playing') return null;
    if (!drivePlay()) return null;
  }

  // 头游归属（与 selfplay 同口径：先出完的那一家所属队伍）
  const first = state.finishOrder[0];
  if (first === undefined) return null;
  return (first % 2 === 0) ? 0 : 1;
}

/* ─────────────────── 配对对照 + 座位轮换 ─────────────────── */
function runMatch(agentA, agentB, N, baseSeed) {
  let aWins = 0, bWins = 0, errors = 0;
  for (let i = 0; i < N; i++) {
    const seed = (baseSeed + i * 2654435761) >>> 0;
    // 方向1：A 坐 0/2，B 坐 1/3
    const r1 = playGame([agentA, agentB, agentA, agentB], seed);
    if (r1 === null) errors++; else if (r1 === 0) aWins++; else bWins++;
    // 方向2：B 坐 0/2，A 坐 1/3（同一副牌 → 纯比座位+水平）
    const r2 = playGame([agentB, agentA, agentB, agentA], seed);
    if (r2 === null) errors++; else if (r2 === 1) aWins++; else bWins++;
  }
  return { aWins, bWins, errors };
}

/* ─────────────────── 统计 ─────────────────── */
// 正态近似 95% CI（z=1.96）。返回 [下界, 上界]（百分比）
function ci95(wins, n) {
  if (n === 0) return [0, 0];
  const p = wins / n;
  const se = Math.sqrt(p * (1 - p) / n);
  return [(p - 1.96 * se) * 100, (p + 1.96 * se) * 100];
}

/* ─────────────────── 主流程 ─────────────────── */
async function main() {
  const argv = process.argv.slice(2);
  const seedFlag = argv.indexOf('--seed');
  const baseSeed = seedFlag >= 0 ? parseInt(argv[seedFlag + 1], 10) : 20260614;
  const positional = argv.filter((a, i) => !a.startsWith('--') && !(seedFlag >= 0 && i === seedFlag + 1));

  if (positional[0] === undefined) {
    console.log('用法: node arena/arena.mjs <A> <B> [场数] [--seed S]');
    console.log('     node arena/arena.mjs --ladder <A> [场数]');
    return;
  }

  if (argv.includes('--ladder')) {
    const A = positional[0];
    const N = parseInt(positional[1] || '300', 10);
    const agentA = await loadAgent(A.includes(':') ? A : A);   // 工作区 A
    const ladderVers = ['v2.5', 'v2.3', 'v2.2', 'v2.1'];
    const opponents = [...ladderVers.map(v => `${v}:master`), 'random'];
    console.log(`\n══════ 冻结梯队评测：${A} vs 全梯队（每对 ${N}×2 场，seed=${baseSeed}）══════\n`);
    console.log('  对手'.padEnd(18), '新版头游率', '  95%CI下界', '  判定');
    for (const opp of opponents) {
      let agentB;
      try { agentB = await loadAgent(opp); } catch (e) { console.log(`  ${opp}: 加载失败 ${e.message}`); continue; }
      const t0 = Date.now();
      const { aWins, bWins, errors } = runMatch(agentA, agentB, N, baseSeed);
      const total = aWins + bWins;
      const rate = total ? (aWins / total * 100) : 0;
      const [lo] = ci95(aWins, total);
      const isFloor = opp === 'random';
      let verdict;
      if (isFloor) verdict = lo >= 85 ? '✅ 压倒地板' : '🔴 连地板都赢不动→疑似BUG';
      else verdict = lo > 50 ? '✅ 显著强于' : (rate >= 47 ? '≈ 持平' : '⚠ 弱于');
      console.log(`  ${opp.padEnd(16)} ${rate.toFixed(1).padStart(6)}%   ${lo.toFixed(1).padStart(7)}%   ${verdict}  (${(Date.now()-t0)/1000}s,err${errors})`);
    }
    return;
  }

  const [A, B, nStr] = positional;
  const N = parseInt(nStr || '400', 10);
  const agentA = await loadAgent(A);
  const agentB = await loadAgent(B);
  console.log(`\n═══ ${agentA.label} vs ${agentB.label}  ${N}×2 场  seed=${baseSeed} ═══`);
  const t0 = Date.now();
  const { aWins, bWins, errors } = runMatch(agentA, agentB, N, baseSeed);
  const total = aWins + bWins;
  const rate = total ? (aWins / total * 100) : 0;
  const [lo, hi] = ci95(aWins, total);
  console.log(` ${agentA.label} 头游率: ${rate.toFixed(1)}%   95%CI [${lo.toFixed(1)}%, ${hi.toFixed(1)}%]`);
  console.log(` 有效 ${total} 场 · 错误 ${errors} · ${((Date.now()-t0)/1000).toFixed(1)}s`);
  if (agentB.isRandom) {
    console.log(lo >= 85 ? ' 地板闸门 ✅ 压倒随机 bot' : ' 地板闸门 🔴 连随机 bot 都赢不动 → 疑似 BUG，停下排查');
  } else {
    console.log(lo > 50 ? ` 结论 ✅ ${agentA.label} 显著强于 ${agentB.label}（下界>50%）`
      : (rate >= 47 ? ' 结论 ≈ 两版基本持平（CI 跨 50%）' : ` 结论 ⚠ ${agentA.label} 弱于 ${agentB.label}`));
  }
}

main().catch(e => { console.error(e); process.exit(1); });
