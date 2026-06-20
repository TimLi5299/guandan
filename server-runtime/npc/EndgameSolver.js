/**
 * EndgameSolver.js — S2 残局精确求解（第四档进化）
 *
 * 思路（确定化采样 + 完美信息博弈求解，桥牌 GIB / Spades ISMCTS 的轻量同款）：
 *   1. 触发：三家对手剩牌合计 ≤ WORLD_CARD_LIMIT 且自己手牌 ≤ HAND_LIMIT
 *   2. 采样：未见牌 = 全部已发牌 − 我的手牌 − roundHistory 已出牌，
 *      按各家剩牌数随机分配生成 K 个"可能世界"
 *   3. 求解：每个世界做 2v2 完美信息 α-β 记忆化搜索，目标 = 我方拿头游
 *      （头游前无人出完 → 无需模拟接风/名次细节，状态机极简）
 *   4. 投票：对真实视角的每个候选动作（含 PASS），取各世界平均胜率最高者
 *   5. 兜底：预算超限 / 全候选必输 → 返回 null 交回启发式（按启发式抢名次）
 *
 * 已知简化（接受的精度损失）：
 *   - 目标函数只看头游归属，不优化双上/名次细分
 *   - 进贡换牌的牌张情报未注入采样（影响极小）
 */

import { findPlayableHands } from '../game/rules.js';
import { classifyHand, isBomb, isWildCard, HandType } from '../game/handClassifier.js';

const WORLD_CARD_LIMIT = 18;   // 三家对手剩牌合计上限（扩域 16→18；20 实测全爆预算）
const HAND_LIMIT = 13;         // 自己手牌上限（12→13）
const DEFAULT_WORLDS = 8;      // 采样世界数（浏览器主线程同步计算，控制单次决策 <1.5s）
const NODE_BUDGET = 110000;    // 每世界搜索节点预算（fail-fast 最坏 ≈1.4s，浏览器实测 150k 偶发 2.2s 卡顿）

/* ─────────────────── 世界采样 ─────────────────── */

/** 未见牌 = 双副牌全集 − 我的手牌 − 本局已出牌（按 id 精确扣除） */
function computeUnseen(myHand, roundHistory, allDealt) {
  const seen = new Set(myHand.map(c => c.id));
  for (const rec of roundHistory || []) {
    for (const c of rec.cards || []) seen.add(c.id);
  }
  return allDealt.filter(c => !seen.has(c.id));
}

/** 把 unseen 随机分给三家（数量 = playersHandCounts），返回 hands[4] */
function sampleWorld(unseen, myHand, mySeat, handCounts, rng) {
  const pool = [...unseen];
  // Fisher-Yates
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const hands = [null, null, null, null];
  hands[mySeat] = [...myHand];
  let offset = 0;
  for (let s = 0; s < 4; s++) {
    if (s === mySeat) continue;
    const n = handCounts[s] || 0;
    hands[s] = pool.slice(offset, offset + n);
    offset += n;
  }
  return hands;
}

/* ─────────────────── 完美信息求解 ─────────────────── */

/** 手牌缓存键（同 rank 同花色等价归并） */
function handKey(hand) {
  return hand.map(c => c.rank * 8 + c.suit).sort((a, b) => a - b).join(',');
}

function lastPlayKey(lastPlay) {
  return lastPlay ? `${lastPlay.type}:${lastPlay.mainRank}:${lastPlay.length}` : 'F';
}

/**
 * α-β 记忆化搜索。返回 true = 我方（mySeat 队）拿头游。
 * state: { hands, turn, lastPlay, lastPlaySeat, passStreak }
 */
function solve(state, myTeam, currentLevel, memo, budget) {
  if (budget.nodes-- <= 0) throw budget.ABORT;

  const { hands, turn, lastPlay, lastPlaySeat, passStreak } = state;
  const key = `${turn}|${lastPlayKey(lastPlay)}|${passStreak}|${hands.map(handKey).join('|')}`;
  const hit = memo.get(key);
  if (hit !== undefined) return hit;

  const hand = hands[turn];
  const isMyTeam = (turn % 2) === myTeam;
  const isFree = !lastPlay;

  const hints = findPlayableHands(hand, isFree ? null : lastPlay, currentLevel);
  let result = null;

  // 候选动作：能出的牌（去重）+ PASS（跟牌时）
  for (const play of hints) {
    if (play.length === hand.length) {
      // 此手清完 → 头游归属即刻判定
      result = isMyTeam;
      if (isMyTeam === true) break;
      continue;
    }
    const cls = classifyHand(play, currentLevel);
    if (cls.type === HandType.INVALID) continue;
    const ids = new Set(play.map(c => c.id));
    const nextHands = hands.map((h, i) => i === turn ? h.filter(c => !ids.has(c.id)) : h);
    const sub = solve({
      hands: nextHands,
      turn: (turn + 1) % 4,
      lastPlay: { type: cls.type, mainRank: cls.mainRank, length: cls.length },
      lastPlaySeat: turn,
      passStreak: 0,
    }, myTeam, currentLevel, memo, budget);
    if (sub === isMyTeam) { result = sub; break; }   // 当前方找到必胜走法
    result = sub;
  }

  // PASS（跟牌时永远合法）
  if (!isFree && !(result === isMyTeam)) {
    const nextStreak = passStreak + 1;
    const trickEnds = nextStreak >= 3;
    const sub = solve({
      hands,
      turn: (turn + 1) % 4,
      lastPlay: trickEnds ? null : lastPlay,
      lastPlaySeat,
      passStreak: trickEnds ? 0 : nextStreak,
    }, myTeam, currentLevel, memo, budget);
    result = sub;
    // 注：若前面已有 result 且都输，PASS 的结果直接覆盖（任一可行动作的 minimax 值
    // 在二值目标下：当前方只要存在一个 isMyTeam 结果即必胜，否则必输——上面循环
    // 已在找到必胜时 break，到这里说明出牌全输，PASS 是最后的机会）
  }

  if (result === null) result = !isMyTeam;   // 无任何合法动作（理论不可达）
  memo.set(key, result);
  return result;
}

/* ─────────────────── 主入口 ─────────────────── */

let _seed = 1234567;
function rng() {
  // xorshift（不用 Math.random：决策可复现便于排查）
  _seed ^= _seed << 13; _seed ^= _seed >>> 17; _seed ^= _seed << 5;
  return ((_seed >>> 0) % 1e9) / 1e9;
}

/**
 * 残局精确求解入口。
 * @returns {null | { action: 'play'|'pass', play: cards[]|null, winRate: number }}
 *   null = 未触发 / 预算爆 / 全候选必输（交回启发式）
 */
export function solveEndgame(hand, gameState, currentLevel, opts = {}) {
  const { seat, playersHandCounts = [], lastPlay, roundHistory, hands } = gameState;
  const othersTotal = playersHandCounts.reduce((s, c, i) => i === seat ? s : s + (c || 0), 0);
  if (othersTotal === 0 || othersTotal > WORLD_CARD_LIMIT) return null;
  if (hand.length === 0 || hand.length > HAND_LIMIT) return null;

  // 已发牌全集：从引擎传入的 hands + roundHistory 重建（浏览器/selfplay 都有 hands）
  // 注意：hands 是上帝视角，仅用于重建"全部已发牌的牌面集合"，采样时仍按未知洗牌——
  // 不读对手真实持牌分布，只读"哪些牌还活着"（这与人类记牌等价：27×4 张明牌已知发出）
  let allDealt;
  if (Array.isArray(hands) && hands.every(h => Array.isArray(h))) {
    allDealt = hands.flat();
    for (const rec of roundHistory || []) allDealt = allDealt.concat(rec.cards || []);
  } else {
    return null;   // 无法重建牌面（缺上帝视角字段）→ 不触发
  }

  const unseen = computeUnseen(hand, roundHistory, allDealt);
  // 数量自洽校验：未见牌数必须等于对手剩牌合计，否则放弃（状态不一致时宁可不接管）
  if (unseen.length !== othersTotal) return null;

  const isFree = !lastPlay;
  const myLastPlay = isFree ? null : lastPlay;
  const rootHints = findPlayableHands(hand, myLastPlay, currentLevel);
  const actions = rootHints.map(p => ({ action: 'play', play: p }));
  if (!isFree) actions.push({ action: 'pass', play: null });
  if (actions.length === 0) return null;

  const worlds = opts.worlds ?? DEFAULT_WORLDS;
  const myTeam = seat % 2;
  const wins = new Array(actions.length).fill(0);
  let validWorlds = 0;

  for (let w = 0; w < worlds; w++) {
    const worldHands = sampleWorld(unseen, hand, seat, playersHandCounts, rng);
    const budget = { nodes: opts.budget ?? NODE_BUDGET, ABORT: Symbol('abort') };
    const memo = new Map();
    // bug 修复：票数先记在世界局部，完整跑完才合并——原先爆预算世界的半截票
    // 污染总票数（winRate 可超 1）
    const winsThisWorld = new Array(actions.length).fill(0);
    try {
      for (let a = 0; a < actions.length; a++) {
        const act = actions[a];
        let win;
        if (act.action === 'play') {
          if (act.play.length === hand.length) { winsThisWorld[a] = 1; continue; }   // 一手清完
          const cls = classifyHand(act.play, currentLevel);
          if (cls.type === HandType.INVALID) continue;
          const ids = new Set(act.play.map(c => c.id));
          win = solve({
            hands: worldHands.map((h, i) => i === seat ? h.filter(c => !ids.has(c.id)) : h),
            turn: (seat + 1) % 4,
            lastPlay: { type: cls.type, mainRank: cls.mainRank, length: cls.length },
            lastPlaySeat: seat,
            passStreak: 0,
          }, myTeam, currentLevel, memo, budget);
        } else {
          const nextStreak = 1;   // 我 PASS：从我开始重新计 streak（已有 lastPlay 在桌）
          // 注意：真实引擎的 passStreak 是从 lastPlaySeat 之后累计的；此处保守近似为 1，
          // 误差方向是低估 PASS 后 trick 提前结束的可能 → PASS 评估略保守，可接受
          win = solve({
            hands: worldHands,
            turn: (seat + 1) % 4,
            lastPlay: myLastPlay,
            lastPlaySeat: gameState.lastPlaySeat ?? (seat + 3) % 4,
            passStreak: nextStreak,
          }, myTeam, currentLevel, memo, budget);
        }
        if (win) winsThisWorld[a] = 1;
      }
      for (let a = 0; a < actions.length; a++) wins[a] += winsThisWorld[a];
      validWorlds++;
      // 早停：已有动作在 ≥6 个有效世界全胜 → 不再采样
      if (validWorlds >= 6 && wins.some(x => x === validWorlds)) break;
    } catch (e) {
      if (e !== budget.ABORT) throw e;
      // 该世界预算爆 → 丢弃（不计入 validWorlds）
      // fail-fast：首个世界就爆说明局面解不动，别再烧剩余世界（产线延迟保护）
      if (w === 0) return null;
    }
  }

  if (validWorlds < Math.max(3, worlds / 3)) return null;   // 大多数世界爆预算 → 不可信

  // 病例修复（审计 #3/#5/#7）：同胜率时 tie-break——① 清手张数多优先（对子一手清光 >
  // 单张挤牙膏）② 张数相同再取资源成本最低（同样必胜不甩大王/级牌）。
  // 原先只比 winRate、平局取最先枚举者（恰是单张/大牌），是残局"挤牙膏/甩大王"的根因。
  const cardCost = (c) => isWildCard(c, currentLevel) ? 90
    : c.rank === currentLevel ? 22 : c.rank === 16 ? 40 : c.rank === 15 ? 34 : c.rank;
  const actCost = (act) => act.action === 'pass' ? Infinity : act.play.reduce((t, c) => t + cardCost(c), 0);
  const actLen = (act) => act.action === 'pass' ? 0 : act.play.length;
  let bestIdx = -1, bestRate = -1, bestLen = -1, bestCost = Infinity;
  for (let a = 0; a < actions.length; a++) {
    const rate = wins[a] / validWorlds;
    const len = actLen(actions[a]);
    const cost = actCost(actions[a]);
    const better = rate > bestRate + 1e-9
      || (Math.abs(rate - bestRate) <= 1e-9 && (len > bestLen || (len === bestLen && cost < bestCost)));
    if (better) { bestRate = rate; bestIdx = a; bestLen = len; bestCost = cost; }
  }

  if (bestRate < 0.5) return null;   // 没有过半胜率的路径 → 交回启发式抢名次
  const best = actions[bestIdx];
  return { action: best.action, play: best.play, winRate: bestRate };
}
