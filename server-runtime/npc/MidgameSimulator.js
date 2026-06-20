/**
 * MidgameSimulator.js — S3 中盘多世界模拟（第三档进化）
 *
 * 思路（确定化采样 + 启发式 rollout，AI Factory《Spades》ISMCTS 混合方案的轻量版）：
 *   残局之外的中盘，状态空间撑不起 S2 的精确求解，改用统计模拟：
 *   1. 候选裁剪：root 候选按轻量启发排序取 top-K（+ PASS）
 *   2. 世界采样：复用 S2 的"未见牌按剩牌数随机分配"
 *   3. rollout：每世界每候选用轻量策略快速打到头游归属（双方同策略，公平镜像）
 *   4. 显著性接管（S1 翻车教训内化）：模拟是有噪声的，启发式是 32k 局验证过的——
 *      只在最优候选胜率显著高于第二名（差距 ≥ TAKEOVER_GAP）时才改判，
 *      信号不清晰一律交回启发式
 *
 * 已知简化：rollout 策略无配合意识（让队友/信号），头游口径忽略双上细分。
 */

import { findPlayableHands } from '../game/rules.js';
import { classifyHand, isWildCard, HandType, isBomb } from '../game/handClassifier.js';

const TOTAL_LEFT_MAX = 56;     // 触发上限：全场剩牌 ≤56（半场后，开局模拟噪声淹没信号）
const TOP_K = 8;               // root 候选裁剪
const DEFAULT_WORLDS = 28;     // 采样世界数（实测 rollout 仅 ~2ms/决策，加倍降噪）
const TAKEOVER_GAP = 0.15;     // 最优 vs 次优的胜率差阈值，低于此交回启发式
const MAX_ROLLOUT_STEPS = 240; // rollout 步数保险丝

let _seed = 7654321;
function rng() {
  _seed ^= _seed << 13; _seed ^= _seed >>> 17; _seed ^= _seed << 5;
  return ((_seed >>> 0) % 1e9) / 1e9;
}

/* ─────────────────── 轻量 rollout 策略 ─────────────────── */

function quickCost(cards, currentLevel) {
  let t = 0;
  for (const c of cards) {
    if (isWildCard(c, currentLevel)) t += 90;
    else if (c.rank === currentLevel) t += 22;
    else if (c.rank === 16) t += 40;
    else if (c.rank === 15) t += 34;
    else t += c.rank;
  }
  return t;
}

function looksBombQuick(cards) {
  if (cards.length < 4) return false;
  const r0 = cards[0].rank;
  if (cards.every(c => c.rank === r0)) return true;
  if (cards.length === 4 && cards.every(c => c.rank >= 15)) return true;
  return cards.length >= 5;   // 5+ 张能进炸弹候选段的只有同花顺（rollout 粗判足够）
}

/**
 * rollout 单步决策：快而合理（双方同策略 → 偏差对称抵消）
 * @returns {Array|null} 出的牌 / null = PASS
 */
function rolloutPolicy(hand, lastPlay, currentLevel, oppNearWin) {
  const isFree = !lastPlay;
  const hints = findPlayableHands(hand, isFree ? null : lastPlay, currentLevel);
  if (hints.length === 0) return null;

  const normals = [];
  const bombs = [];
  for (const p of hints) {
    (looksBombQuick(p) ? bombs : normals).push(p);
  }

  if (isFree) {
    if (normals.length === 0) return bombs[0] || hints[0];
    // 领牌：长度优先（清手快）、同长度成本低优先
    let best = normals[0], bestLen = normals[0].length, bestCost = quickCost(normals[0], currentLevel);
    for (const p of normals) {
      const c = quickCost(p, currentLevel);
      if (p.length > bestLen || (p.length === bestLen && c < bestCost)) {
        best = p; bestLen = p.length; bestCost = c;
      }
    }
    return best;
  }

  // 跟牌：最小代价能压的
  if (normals.length > 0) {
    let best = normals[0], bestCost = quickCost(normals[0], currentLevel);
    for (const p of normals) {
      const c = quickCost(p, currentLevel);
      if (c < bestCost) { best = p; bestCost = c; }
    }
    // 保守噪声：高成本跟牌 35% 概率忍住不出（防 rollout 系统性激进）
    if (bestCost >= 30 && !oppNearWin && rng() < 0.35) return null;
    return best;
  }
  // 只有炸弹能压：对手快赢必炸，否则 25% 概率炸
  if (bombs.length > 0 && (oppNearWin || rng() < 0.25)) return bombs[0];
  return null;
}

/**
 * 单局 rollout：从给定状态打到头游归属。
 * @returns {boolean} true = myTeam 拿头游
 */
function rollout(hands, startTurn, lastPlay0, lastPlaySeat0, passStreak0, myTeam, currentLevel) {
  // hands 会被修改——调用方负责传副本
  let turn = startTurn;
  let lastPlay = lastPlay0;
  let lastPlaySeat = lastPlaySeat0;
  let passStreak = passStreak0;

  for (let step = 0; step < MAX_ROLLOUT_STEPS; step++) {
    const hand = hands[turn];
    const left = (turn + 3) % 4, right = (turn + 1) % 4;
    const oppNearWin = hands[left].length <= 3 || hands[right].length <= 3;
    const isFree = !lastPlay;

    const play = isFree ? rolloutPolicy(hand, null, currentLevel, oppNearWin)
                        : rolloutPolicy(hand, lastPlay, currentLevel, oppNearWin);

    if (play && play.length > 0) {
      const ids = new Set(play.map(c => c.id));
      hands[turn] = hand.filter(c => !ids.has(c.id));
      if (hands[turn].length === 0) return (turn % 2) === myTeam;   // 头游
      const cls = classifyHand(play, currentLevel);
      lastPlay = { type: cls.type, mainRank: cls.mainRank, length: cls.length };
      lastPlaySeat = turn;
      passStreak = 0;
    } else {
      passStreak++;
      if (passStreak >= 3) { lastPlay = null; passStreak = 0; }
    }
    turn = (turn + 1) % 4;
  }
  // 保险丝触发：按剩牌最少者归属（近似）
  let minSeat = 0;
  for (let s = 1; s < 4; s++) if (hands[s].length < hands[minSeat].length) minSeat = s;
  return (minSeat % 2) === myTeam;
}

/* ─────────────────── 世界采样（与 EndgameSolver 同款） ─────────────────── */

function computeUnseen(myHand, roundHistory, allDealt) {
  const seen = new Set(myHand.map(c => c.id));
  for (const rec of roundHistory || []) {
    for (const c of rec.cards || []) seen.add(c.id);
  }
  return allDealt.filter(c => !seen.has(c.id));
}

function sampleWorld(unseen, myHand, mySeat, handCounts) {
  const pool = [...unseen];
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

/* ─────────────────── 主入口 ─────────────────── */

/**
 * 中盘模拟决策。
 * @returns {null | { action: 'play'|'pass', play, winRate, gap }}
 *   null = 未触发 / 信号不清晰（交回启发式）
 */
export function simulateMidgame(hand, gameState, currentLevel, opts = {}) {
  const { seat, playersHandCounts = [], lastPlay, roundHistory, hands } = gameState;
  const othersTotal = playersHandCounts.reduce((s, c, i) => i === seat ? s : s + (c || 0), 0);
  const totalLeft = othersTotal + hand.length;
  if (totalLeft > (opts.totalLeftMax ?? TOTAL_LEFT_MAX)) return null;

  if (!Array.isArray(hands) || !hands.every(h => Array.isArray(h))) return null;
  let allDealt = hands.flat();
  for (const rec of roundHistory || []) allDealt = allDealt.concat(rec.cards || []);
  const unseen = computeUnseen(hand, roundHistory, allDealt);
  if (unseen.length !== othersTotal) return null;

  const isFree = !lastPlay;
  const rootHints = findPlayableHands(hand, isFree ? null : lastPlay, currentLevel);
  if (rootHints.length === 0) return null;

  // 候选裁剪：跟牌按成本升序、领牌长度降序+成本升序，取 top-K；跟牌补 PASS
  const ranked = [...rootHints].sort((a, b) => isFree
    ? (b.length - a.length || quickCost(a, currentLevel) - quickCost(b, currentLevel))
    : (quickCost(a, currentLevel) - quickCost(b, currentLevel)));
  const actions = ranked.slice(0, opts.topK ?? TOP_K).map(p => ({ action: 'play', play: p }));
  if (!isFree) actions.push({ action: 'pass', play: null });
  if (actions.length < 2) return null;   // 没得选，不浪费模拟

  const worlds = opts.worlds ?? DEFAULT_WORLDS;
  const myTeam = seat % 2;
  const wins = new Array(actions.length).fill(0);

  for (let w = 0; w < worlds; w++) {
    const worldHands = sampleWorld(unseen, hand, seat, playersHandCounts);
    for (let a = 0; a < actions.length; a++) {
      const act = actions[a];
      // 每候选独立副本（rollout 会修改 hands）
      const hcopy = worldHands.map(h => [...h]);
      let win;
      if (act.action === 'play') {
        if (act.play.length === hand.length) { wins[a]++; continue; }
        const cls = classifyHand(act.play, currentLevel);
        if (cls.type === HandType.INVALID) continue;
        const ids = new Set(act.play.map(c => c.id));
        hcopy[seat] = hcopy[seat].filter(c => !ids.has(c.id));
        win = rollout(hcopy, (seat + 1) % 4,
          { type: cls.type, mainRank: cls.mainRank, length: cls.length }, seat, 0,
          myTeam, currentLevel);
      } else {
        win = rollout(hcopy, (seat + 1) % 4, lastPlay, gameState.lastPlaySeat ?? (seat + 3) % 4, 1,
          myTeam, currentLevel);
      }
      if (win) wins[a]++;
    }
  }

  // 显著性接管：最优 vs 次优差距要够大，否则交回启发式（模拟噪声 < 启发式先验）
  // 病例修复（审计 #5）：同胜率 tie-break——清手张数多优先、再成本低优先（与 S2 一致，
  // 候选虽已按 cost 预排序，但显式 length 优先避免"挤牙膏"）。tie-break 不改 gap（同 wins 内选）。
  const _cardCost = (c) => isWildCard(c, currentLevel) ? 90
    : c.rank === currentLevel ? 22 : c.rank === 16 ? 40 : c.rank === 15 ? 34 : c.rank;
  const _len = (act) => act.action === 'pass' ? 0 : act.play.length;
  const _cost = (act) => act.action === 'pass' ? Infinity : act.play.reduce((t, c) => t + _cardCost(c), 0);
  let bestIdx = 0;
  for (let a = 1; a < actions.length; a++) {
    if (wins[a] > wins[bestIdx]) bestIdx = a;
    else if (wins[a] === wins[bestIdx]) {
      if (_len(actions[a]) > _len(actions[bestIdx])
          || (_len(actions[a]) === _len(actions[bestIdx]) && _cost(actions[a]) < _cost(actions[bestIdx]))) {
        bestIdx = a;
      }
    }
  }
  let secondBest = -1;
  for (let a = 0; a < actions.length; a++) {
    if (a !== bestIdx && wins[a] > secondBest) secondBest = wins[a];
  }
  const gap = (wins[bestIdx] - secondBest) / worlds;
  if (gap < (opts.takeoverGap ?? TAKEOVER_GAP)) return null;

  const best = actions[bestIdx];
  return { action: best.action, play: best.play, winRate: wins[bestIdx] / worlds, gap };
}
