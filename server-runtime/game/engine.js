/**
 * engine.js — 掼蛋游戏引擎（状态机）
 *
 * 管理一局游戏的完整生命周期:
 *   WAITING → DEALING → TRIBUTING → PLAYING → ROUND_END → (下一局 or GAME_OVER)
 */

import { createDeck, shuffle, makeRng, deal, sortCards, handToString } from './deck.js';
import { classifyHand, HandType, HandTypeName, isBomb, isWildCard } from './handClassifier.js';
import { canPlay, evaluateRound, upgradeLevel, checkWin, findPlayableHands } from './rules.js';

/**
 * E2 规则审计：进贡牌力比较值（协会版："进贡手中最大的牌，红心级牌除外"）
 * 牌力顺序：大王(16) > 小王(15) > 级牌(14.5) > A(14) > K(13) > ... > 2
 * 红心级牌（万能牌）不参与进贡，由调用方先过滤
 */
function tributeValue(card, currentLevel) {
  if (card.rank >= 15) return card.rank;        // 大小王
  if (card.rank === currentLevel) return 14.5;  // 非红桃级牌：牌力高于 A、低于小王
  return card.rank;
}

// 游戏阶段
const GamePhase = {
  WAITING: 'waiting',
  DEALING: 'dealing',
  TRIBUTING: 'tributing',
  PLAYING: 'playing',
  ROUND_END: 'round_end',
  GAME_OVER: 'game_over',
};

/**
 * 创建一个新的游戏状态
 */
function createGameState() {
  return {
    phase: GamePhase.WAITING,
    hands: [[], [], [], []],           // 四个玩家的手牌
    currentTurn: 0,                     // 当前出牌的座位号
    lastPlay: null,                     // 上一手出的牌 (classifyHand 的结果)
    lastPlaySeat: -1,                   // 上一手出牌的玩家座位
    passCount: 0,                       // 连续不出的次数
    finishOrder: [],                    // 出完牌的顺序
    team1Level: 2,                      // 队伍1（seat 0,2）当前等级
    team2Level: 2,                      // 队伍2（seat 1,3）当前等级
    currentLevel: 2,                    // 本局级牌 (取赢方的等级)
    roundHistory: [],                   // 本局出牌历史
    bombCount: 0,                       // 本局炸弹数
    isFirstRound: true,                 // 是否是整场的第一局
    turnTimer: null,                    // 出牌倒计时
    tributeState: null,                 // 进贡状态对象，null = 不需要进贡
  };
}

/**
 * 开始新一局
 * @param {object} state - 游戏状态
 * @returns {object} 更新后的状态 + 事件列表
 */
function startRound(state, rng) {
  const events = [];

  // 洗牌发牌（rng 可选：自对弈台传入可种子化 rng → 同批发牌可复现；线上不传=随机）
  const deck = createDeck();
  const shuffled = shuffle(deck, rng);
  const hands = deal(shuffled);

  // 排序每个人的手牌 (按当前级牌权重排序)
  state.hands = hands.map(h => sortCards(h, state.currentLevel));
  state.phase = GamePhase.PLAYING;
  state.lastPlay = null;
  state.lastPlaySeat = -1;
  state.passCount = 0;
  state.finishOrder = [];
  state.roundHistory = [];
  state.bombCount = 0;

  // 确定庄家（第一局从 seat 0 开始, 后续从上一局输方开始）
  if (state.isFirstRound) {
    state.currentTurn = 0;
    state.isFirstRound = false;
  }
  // else: currentTurn 由上局结算决定

  events.push({
    type: 'GAME_START',
    hands: state.hands.map(h => [...h]), // 深拷贝
    currentTurn: state.currentTurn,
    currentLevel: state.currentLevel,
    team1Level: state.team1Level,
    team2Level: state.team2Level,
  });

  events.push({
    type: 'YOUR_TURN',
    seat: state.currentTurn,
  });

  return { state, events };
}

/**
 * 玩家出牌
 * @param {object} state - 游戏状态
 * @param {number} seat - 出牌的座位号
 * @param {number[]} cardIds - 出的牌的 id 数组
 * @returns {{ state, events, error? }}
 */
function playCards(state, seat, cardIds) {
  const events = [];

  // 验证是否轮到该玩家
  if (state.phase !== GamePhase.PLAYING) {
    return { state, events, error: '当前不在出牌阶段' };
  }
  if (state.currentTurn !== seat) {
    return { state, events, error: '还没轮到你出牌' };
  }

  // 找到要出的牌
  const playedCards = [];
  for (const id of cardIds) {
    const card = state.hands[seat].find(c => c.id === id);
    if (!card) {
      return { state, events, error: `找不到牌 id=${id}` };
    }
    playedCards.push(card);
  }

  // 判断上一手牌（如果过了一轮回到自己，则可以自由出）
  let lastPlay = state.lastPlay;
  if (state.lastPlaySeat === seat) {
    lastPlay = null; // 转了一圈没人管，自由出
  }

  // 检查出牌合法性
  const result = canPlay(playedCards, lastPlay, state.currentLevel);
  if (!result.valid) {
    return { state, events, error: result.reason };
  }

  // 出牌成功
  const hand = result.hand;

  // 从手牌中移除
  state.hands[seat] = state.hands[seat].filter(c => !cardIds.includes(c.id));

  // 更新状态
  state.lastPlay = hand;
  state.lastPlaySeat = seat;
  state.passCount = 0;

  // 记录历史
  state.roundHistory.push({
    seat,
    cards: playedCards,
    handType: HandTypeName[hand.type],
    timestamp: Date.now(),
    coachEval: null,   // 教练事后评分（0-100）
    npcReason: null,   // NPC决策摘要字符串
  });

  // 统计炸弹
  if (isBomb(hand.type)) {
    state.bombCount++;
  }

  events.push({
    type: 'CARDS_PLAYED',
    seat,
    cards: playedCards,
    handType: HandTypeName[hand.type],
    remainingCards: state.hands[seat].length,
  });

  // 检查是否出完了
  if (state.hands[seat].length === 0) {
    state.finishOrder.push(seat);
    events.push({
      type: 'PLAYER_FINISHED',
      seat,
      position: state.finishOrder.length,
    });

    // 检查是否结束（两人出完且是同队 或 三人出完）
    const roundEndResult = checkRoundEnd(state);
    if (roundEndResult) {
      return handleRoundEnd(state, events);
    }
  }

  // 轮到下一个人
  advanceTurn(state);

  events.push({
    type: 'YOUR_TURN',
    seat: state.currentTurn,
  });

  return { state, events };
}

/**
 * 玩家不出（PASS）
 */
function pass(state, seat) {
  const events = [];

  if (state.phase !== GamePhase.PLAYING) {
    return { state, events, error: '当前不在出牌阶段' };
  }
  if (state.currentTurn !== seat) {
    return { state, events, error: '还没轮到你' };
  }

  // 如果是自由出牌（上一手是自己的），不能 PASS
  if (state.lastPlay === null || state.lastPlaySeat === seat) {
    return { state, events, error: '你是自由出牌，不能不出' };
  }

  state.passCount++;

  events.push({
    type: 'PLAYER_PASS',
    seat,
  });

  // 轮到下一个人
  advanceTurn(state);

  // 一圈过，取决于上一手出牌的人是否已经出完
  const isLastFull = state.finishOrder.includes(state.lastPlaySeat);
  const remainingCount = 4 - state.finishOrder.length;
  const threshold = isLastFull ? remainingCount : remainingCount - 1;

  if (state.passCount >= threshold) {
    // 一圈过，清空上一手
    state.lastPlay = null;
    state.passCount = 0;

    // 接风逻辑：如果上一手出牌的人已经出完了
    if (isLastFull) {
      const winnerSeat = state.lastPlaySeat;
      const teammate = (winnerSeat + 2) % 4;
      // 优先给对家（队友）接风
      if (!state.finishOrder.includes(teammate)) {
        state.currentTurn = teammate;
      } else {
        // 对家也走掉了，按正常 advanceTurn 已经由上面处理好了（跳到下一个有牌的对手）
        // 这里的 state.currentTurn 已经是 advanceTurn 后的结果，无需额外调整
      }
    } else {
      // 正常流程：回到上一手出牌的人
      state.currentTurn = state.lastPlaySeat;
    }
  }

  events.push({
    type: 'YOUR_TURN',
    seat: state.currentTurn,
  });

  return { state, events };
}

/**
 * 轮转到下一个玩家（跳过已出完的玩家）
 */
function advanceTurn(state) {
  let next = (state.currentTurn + 1) % 4;
  let count = 0;
  while (state.finishOrder.includes(next) && count < 4) {
    next = (next + 1) % 4;
    count++;
  }
  state.currentTurn = next;
}

/**
 * 检查本局是否结束
 * 结束条件：3 个人出完了 或 同队2人都出完了
 */
function checkRoundEnd(state) {
  if (state.finishOrder.length >= 3) return true;

  // 检查同队双上
  if (state.finishOrder.length >= 2) {
    const first = state.finishOrder[0];
    const second = state.finishOrder[1];
    const team1 = [0, 2];
    const team2 = [1, 3];
    if (
      (team1.includes(first) && team1.includes(second)) ||
      (team2.includes(first) && team2.includes(second))
    ) {
      return true;
    }
  }

  return false;
}

/**
 * 处理本局结束
 */
function handleRoundEnd(state, events) {
  state.phase = GamePhase.ROUND_END;

  // 如果只有 2 或 3 人出完，补全出牌顺序
  const allSeats = [0, 1, 2, 3];
  const remaining = allSeats.filter(s => !state.finishOrder.includes(s));
  // 按手牌数量排序剩余玩家
  remaining.sort((a, b) => state.hands[a].length - state.hands[b].length);
  state.finishOrder.push(...remaining);

  // 计算升级
  const result = evaluateRound(state.finishOrder);

  // 应用升级
  if (result.team1Upgrade > 0) {
    state.team1Level = upgradeLevel(state.team1Level, result.team1Upgrade);
  }
  if (result.team2Upgrade > 0) {
    state.team2Level = upgradeLevel(state.team2Level, result.team2Upgrade);
  }

  events.push({
    type: 'ROUND_END',
    finishOrder: state.finishOrder,
    team1Upgrade: result.team1Upgrade,
    team2Upgrade: result.team2Upgrade,
    team1Level: state.team1Level,
    team2Level: state.team2Level,
    description: result.description,
    bombCount: state.bombCount,
  });

  // E2 修正：过 A 判定（协会版第十四条："A 必须打，不得直接升级过 A"）
  // 胜利条件：本局打的是 A 级（currentLevel===14）+ 头游方等级已是 A + 头游的搭档不是末游
  const firstSeat = state.finishOrder[0];
  const firstTeamNum = [0, 2].includes(firstSeat) ? 1 : 2;
  const firstTeamLevel = firstTeamNum === 1 ? state.team1Level : state.team2Level;
  const partnerSeat = (firstSeat + 2) % 4;
  const partnerIsLast = state.finishOrder[3] === partnerSeat;
  const wonAtA = state.currentLevel === 14 && firstTeamLevel >= 14 && !partnerIsLast;

  if (wonAtA) {
    state.phase = GamePhase.GAME_OVER;
    events.push({
      type: 'GAME_OVER',
      winner: firstTeamNum === 1 ? 'team1' : 'team2',
      finalLevel: firstTeamLevel,
    });
  } else {
    // 准备下一局
    // 下一局级牌取赢方当前等级
    if (result.team1Upgrade > 0) {
      state.currentLevel = state.team1Level;
    } else {
      state.currentLevel = state.team2Level;
    }

    // 输方先出牌（最后出完的人）
    state.currentTurn = state.finishOrder[state.finishOrder.length - 1];

    // 检查是否需要进贡
    const tributeCheck = initTribute(state);
    if (tributeCheck.needsTribute) {
      // 需要进贡，设置标志但不自动开始新局
      state.tributeNextRound = tributeCheck.tributeInfo;
      // 此时不改变phase，让调用方决定何时进入进贡阶段
    }
  }

  return { state, events };
}

/**
 * 获取指定玩家可以看到的游戏状态（隐藏其他玩家手牌）
 */
function getPlayerView(state, seat) {
  return {
    phase: state.phase,
    myHand: state.hands[seat],
    otherHandCounts: state.hands.map((h, i) => i === seat ? -1 : h.length),
    currentTurn: state.currentTurn,
    lastPlay: state.lastPlay,
    lastPlaySeat: state.lastPlaySeat,
    finishOrder: state.finishOrder,
    team1Level: state.team1Level,
    team2Level: state.team2Level,
    currentLevel: state.currentLevel,
    isMyTurn: state.currentTurn === seat,
    roundHistory: state.roundHistory.slice(-8), // 最近 8 条
  };
}

/**
 * 获取出牌提示
 */
function getHint(state, seat) {
  if (state.currentTurn !== seat) return [];

  let lastPlay = state.lastPlay;
  if (state.lastPlaySeat === seat) {
    lastPlay = null; // 自由出
  }

  return findPlayableHands(state.hands[seat], lastPlay, state.currentLevel);
}

/**
 * 初始化进贡状态
 * @param {object} state - 游戏状态
 * @returns {object} { needsTribute: bool, tributeInfo: { fromSeats: [], toSeats: [], count: 1|2 } }
 */
function initTribute(state) {
  // 第一局不需要进贡
  if (state.isFirstRound || state.finishOrder.length === 0) {
    return { needsTribute: false, tributeInfo: null };
  }

  const first = state.finishOrder[0];
  const second = state.finishOrder[1];
  const third = state.finishOrder[2];
  const last = state.finishOrder[3];

  const team1 = [0, 2];
  const team2 = [1, 3];
  const firstTeam = team1.includes(first) ? 1 : 2;
  const secondTeam = team1.includes(second) ? 1 : 2;

  // 赢方双上（同队第1、2）：输方两人各贡一张最大牌给赢方
  if (firstTeam === secondTeam) {
    const winTeam = firstTeam === 1 ? team1 : team2;
    const loseTeam = firstTeam === 1 ? team2 : team1;
    return {
      needsTribute: true,
      tributeInfo: {
        fromSeats: loseTeam,    // 输方两人各贡一张
        toSeats: [first, second], // 给赢方两人
        count: 2,               // 每个输方玩家贡1张，共2张
      },
    };
  }

  // 赢方单上：输方末位贡一张最大牌给赢方头游
  const loser = last;
  return {
    needsTribute: true,
    tributeInfo: {
      fromSeats: [loser],       // 输方末位
      toSeats: [first],         // 给赢方头游
      count: 1,                 // 贡1张
    },
  };
}

/**
 * 开始进贡阶段
 * @param {object} state - 游戏状态
 * @param {object} tributeInfo - 进贡信息
 * @returns {object} { state, events }
 */
function startTribute(state, tributeInfo, rng) {
  const events = [];

  // 设置phase为TRIBUTING
  state.phase = GamePhase.TRIBUTING;

  // 新发一局牌（rng 可选，同 startRound）
  const deck = createDeck();
  const shuffled = shuffle(deck, rng);
  const hands = deal(shuffled);

  // 排序每个人的手牌
  state.hands = hands.map(h => sortCards(h, state.currentLevel));

  // E2 新增：抗贡判定（协会版第十条第三款）
  // 单贡：进贡者持 2 张大王免贡；双贡：进贡方二人合计 ≥2 张大王（各 1 张或一人 2 张）免贡
  // 抗贡后由上游（头游）先出牌
  const bigJokers = tributeInfo.fromSeats.reduce(
    (n, s) => n + state.hands[s].filter(c => c.rank === 16).length, 0
  );
  if (bigJokers >= 2) {
    state.tributeState = { ...tributeInfo, tributeCards: {}, returnCards: {}, phase: 'completed', resisted: true };
    state.phase = GamePhase.PLAYING;
    // review-P0 修复：finishOrder 可能已被 NEXT_ROUND 的 startRound 清空 → 用 toSeats[0]（即头游/上游）
    state.currentTurn = tributeInfo.toSeats[0];   // 上游先出
    state.lastPlay = null;
    state.lastPlaySeat = -1;
    state.passCount = 0;

    events.push({
      type: 'GAME_START',
      hands: state.hands.map(h => [...h]),
      phase: 'PLAYING',
      currentTurn: state.currentTurn,
      currentLevel: state.currentLevel,
      team1Level: state.team1Level,
      team2Level: state.team2Level,
    });
    events.push({
      type: 'TRIBUTE_RESISTED',
      fromSeats: tributeInfo.fromSeats,
      bigJokers,
    });
    events.push({ type: 'YOUR_TURN', seat: state.currentTurn });
    return { state, events };
  }

  // 初始化进贡状态
  state.tributeState = {
    fromSeats: tributeInfo.fromSeats,
    toSeats: tributeInfo.toSeats,
    count: tributeInfo.count,
    tributeCards: {},     // { seat: [card] }
    returnCards: {},      // { seat: [card] }
    pairMap: null,        // E2: { toSeat: fromSeat } 收贡-进贡配对（双贡按贡牌大小分配）
    phase: 'waiting_tribute', // 'waiting_tribute' | 'waiting_return' | 'completed'
  };

  // 发送GAME_START事件（包含手牌）
  // v1.1 修复：补 currentLevel/team levels（原缺失 → 还贡 UI 的级牌过滤用旧级牌）
  events.push({
    type: 'GAME_START',
    hands: state.hands.map(h => [...h]),
    phase: 'TRIBUTING',
    tributeInfo: tributeInfo,
    currentTurn: state.currentTurn,
    currentLevel: state.currentLevel,
    team1Level: state.team1Level,
    team2Level: state.team2Level,
  });

  // 发送TRIBUTE_REQUEST事件，通知输方玩家进贡
  events.push({
    type: 'TRIBUTE_REQUEST',
    fromSeats: tributeInfo.fromSeats,
    toSeats: tributeInfo.toSeats,
    tributeCount: tributeInfo.count,
  });

  return { state, events };
}

/**
 * 处理玩家进贡
 * @param {object} state - 游戏状态
 * @param {number} seat - 进贡的玩家座位
 * @param {number} cardId - 进贡的牌 id
 * @returns {object} { state, events, error? }
 */
function handleTribute(state, seat, cardId) {
  const events = [];

  // 验证阶段
  if (state.phase !== GamePhase.TRIBUTING || !state.tributeState) {
    return { state, events, error: '当前不在进贡阶段' };
  }

  if (state.tributeState.phase !== 'waiting_tribute') {
    return { state, events, error: '进贡阶段已结束' };
  }

  // 验证 seat 是否在进贡者列表中
  if (!state.tributeState.fromSeats.includes(seat)) {
    return { state, events, error: '不需要你进贡' };
  }

  // 检查该玩家是否已经进过贡
  if (state.tributeState.tributeCards[seat]) {
    return { state, events, error: '你已经进过贡了' };
  }

  // 找到要进贡的牌
  const card = state.hands[seat].find(c => c.id === cardId);
  if (!card) {
    return { state, events, error: `找不到牌 id=${cardId}` };
  }

  // E2 修正：进贡牌 = 手中最大的牌（协会版：红心级牌除外；大小王、级牌都在范围内，按牌力比较）
  const validCards = state.hands[seat].filter(c => !isWildCard(c, state.currentLevel));
  if (validCards.length === 0) {
    return { state, events, error: '没有可以进贡的牌' };
  }

  validCards.sort((a, b) => tributeValue(b, state.currentLevel) - tributeValue(a, state.currentLevel));
  const maxValue = tributeValue(validCards[0], state.currentLevel);

  // 允许进贡任意一张与最大牌力相同的牌（两副牌可能有等值牌）
  if (tributeValue(card, state.currentLevel) !== maxValue || isWildCard(card, state.currentLevel)) {
    return { state, events, error: '只能进贡最大的牌（红心级牌除外）' };
  }

  // 从手牌中移除
  state.hands[seat] = state.hands[seat].filter(c => c.id !== cardId);

  // 记录进贡
  state.tributeState.tributeCards[seat] = card;

  events.push({
    type: 'TRIBUTE_DONE',
    seat,
    card,
  });

  // 检查是否所有人都进完了
  const allTributeDone = state.tributeState.fromSeats.every(s => state.tributeState.tributeCards[s]);
  if (allTributeDone) {
    // E2 新增：建立收贡-进贡配对（协会版：双贡时上游拿大贡牌、二游拿小贡牌，还贡按配对返还）
    const ts = state.tributeState;
    const givers = [...ts.fromSeats].sort((a, b) =>
      tributeValue(ts.tributeCards[b], state.currentLevel) - tributeValue(ts.tributeCards[a], state.currentLevel)
    );  // 贡牌从大到小排序
    ts.pairMap = {};
    ts.toSeats.forEach((toSeat, i) => { ts.pairMap[toSeat] = givers[i]; });  // toSeats = [头游, 二游]

    // 转入还贡阶段
    ts.phase = 'waiting_return';

    events.push({
      type: 'RETURN_REQUEST',
      fromSeats: ts.toSeats,
      tributeCards: Object.values(ts.tributeCards),
      pairMap: ts.pairMap,   // review: 客户端按收贡-进贡配对判断同队，预过滤 >10 的还贡牌
    });
  }

  return { state, events };
}

/**
 * 处理玩家还贡
 * @param {object} state - 游戏状态
 * @param {number} seat - 还贡的玩家座位
 * @param {number} cardId - 还贡的牌 id
 * @returns {object} { state, events, error? }
 */
function handleReturnTribute(state, seat, cardId) {
  const events = [];

  // 验证阶段
  if (state.phase !== GamePhase.TRIBUTING || !state.tributeState) {
    return { state, events, error: '当前不在进贡阶段' };
  }

  if (state.tributeState.phase !== 'waiting_return') {
    return { state, events, error: '还贡阶段未开始' };
  }

  // 验证 seat 是否在还贡者列表中
  if (!state.tributeState.toSeats.includes(seat)) {
    return { state, events, error: '不需要你还贡' };
  }

  // 检查该玩家是否已经还过贡
  if (state.tributeState.returnCards[seat]) {
    return { state, events, error: '你已经还过贡了' };
  }

  // 找到要还贡的牌
  const card = state.hands[seat].find(c => c.id === cardId);
  if (!card) {
    return { state, events, error: `找不到牌 id=${cardId}` };
  }

  // E2 修正：还贡限制（协会版："还给己方搭档的牌必须是10以下(含10)；还给对方的牌可以为任意牌"）
  // 队内还贡场景：1+4（头游与末游同队）时发生
  const giverSeat = state.tributeState.pairMap?.[seat];
  const sameTeam = giverSeat !== undefined && (giverSeat % 2) === (seat % 2);
  if (sameTeam) {
    if (card.rank > 10 || card.rank === state.currentLevel) {
      // review: 死局放宽——手中确实没有任何 ≤10 非级牌时允许任意牌，避免永久卡死
      const hasLegal = state.hands[seat].some(c => c.rank <= 10 && c.rank !== state.currentLevel);
      if (hasLegal) {
        return { state, events, error: '还给己方搭档的牌必须是10以下（含10）且非级牌' };
      }
    }
  }

  // 从手牌中移除
  state.hands[seat] = state.hands[seat].filter(c => c.id !== cardId);

  // 记录还贡
  state.tributeState.returnCards[seat] = card;

  events.push({
    type: 'RETURN_DONE',
    seat,
    card,
  });

  // 检查是否所有人都还完了
  const allReturnDone = state.tributeState.toSeats.every(s => state.tributeState.returnCards[s]);
  if (allReturnDone) {
    // E2 修正：按 pairMap 配对交换（协会版：上游拿大贡牌并还给贡大牌者，二游拿小贡牌并还给贡小牌者）
    const ts = state.tributeState;
    const pairMap = ts.pairMap;

    for (const toSeat of ts.toSeats) {
      const giver = pairMap[toSeat];
      state.hands[toSeat].push(ts.tributeCards[giver]);    // 收贡方拿到配对的贡牌
      state.hands[giver].push(ts.returnCards[toSeat]);     // 进贡方拿到对应的还贡牌
    }

    // 重新排序每个人的手牌
    state.hands = state.hands.map(h => sortCards(h, state.currentLevel));

    // 标记进贡完成
    ts.phase = 'completed';

    events.push({
      type: 'TRIBUTE_COMPLETED',
      tributeDetails: {
        from: ts.fromSeats,
        to: ts.toSeats,
        pairMap,
        tributeCards: ts.toSeats.map(s => ts.tributeCards[pairMap[s]]),
        returnCards: ts.toSeats.map(s => ts.returnCards[s]),
      },
    });

    // E2 修正：首出权（协会版：单贡由进贡者先出；双贡由贡大牌者先出）
    // pairMap[头游] 即贡牌最大者（单贡时也成立：唯一进贡者配头游）
    // review-P0 修复：finishOrder 已被 NEXT_ROUND 的 startRound 清空 → 改用 ts.toSeats[0]（头游）
    state.phase = GamePhase.PLAYING;
    state.currentTurn = pairMap[ts.toSeats[0]];
    state.lastPlay = null;
    state.lastPlaySeat = -1;
    state.passCount = 0;

    events.push({
      type: 'GAME_START',
      hands: state.hands.map(h => [...h]),
      phase: 'PLAYING',
      currentTurn: state.currentTurn,
      currentLevel: state.currentLevel,
      team1Level: state.team1Level,
      team2Level: state.team2Level,
    });

    events.push({
      type: 'YOUR_TURN',
      seat: state.currentTurn,
    });
  }

  return { state, events };
}

export {
  GamePhase,
  createGameState,
  startRound,
  playCards,
  pass,
  getPlayerView,
  getHint,
  advanceTurn,
  checkRoundEnd,
  initTribute,
  startTribute,
  handleTribute,
  handleReturnTribute,
};
