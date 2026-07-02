/**
 * server-runtime/index.js
 * 浏览器内运行的「假服务端」—— 复用原 app.js 的消息分发逻辑，
 * 但去掉 Express/WebSocket/SQLite，全部在内存中跑，单玩家 + 3 NPC。
 */

import { RoomManager } from './game/room.js';
import { getNPCDecision, onCardsPlayed, resetMemory } from './npc/NPCEngine.js';
import {
  startLesson, validateStep, getTutorialSession, advanceStep, clearSession, preloadLesson
} from './tutorial/TutorialEngine.js';
import { startTribute, handleTribute, handleReturnTribute } from './game/engine.js';
import { selectTributeCard, findPlayableHands } from './game/rules.js';
import { NPC_PRESETS } from './npc/SkillProfiles.js';
import { minTricks } from './npc/HandEvaluator.js';   // 批1-② Par 手数标尺（只读 DP）

export class LoopbackServer {
  constructor(opts = {}) {
    this.roomManager = new RoomManager();
    this.connections = new Map(); // playerId -> { send: fn, roomId, nickname }
    this.outboundQueue = []; // 暂存对玩家的消息
    // v1.1 断局恢复：每次游戏状态变更后回调（snapshot 或 null=清存档）。不传则零开销
    this.onStateChange = opts.onStateChange || null;
  }

  /** v1.1 断局恢复：序列化可恢复的房间快照（纯数据，JSON 安全） */
  _snapshot(room) {
    return {
      version: 1,
      savedAt: Date.now(),
      roomId: room.id,
      hostId: room.hostId,
      players: room.players.map(p => p ? {
        id: p.id, nickname: p.nickname, isNPC: !!p.isNPC,
        level: p.level ?? null, skillProfile: p.skillProfile ?? null,
        npcType: p.npcType ?? null, ready: true, connected: true,
      } : null),
      gameState: room.gameState,
    };
  }

  /** v1.1 断局恢复：状态变更后持久化（GAME_OVER 清档） */
  _persist(room) {
    if (!this.onStateChange || !room?.gameState) return;
    try {
      const phase = room.gameState.phase;
      if (phase === 'game_over') this.onStateChange(null);
      else if (phase === 'playing' || phase === 'tributing' || phase === 'round_end') this.onStateChange(this._snapshot(room));
    } catch (e) { /* 持久化失败不影响游戏 */ }
  }

  /** 客户端注册一个 listener 接收消息 */
  attach(playerId, sendFn) {
    this.connections.set(playerId, { send: sendFn, roomId: null, nickname: null });
  }

  /** 客户端发消息进入服务端 */
  async dispatch(playerId, msg) {
    const conn = this.connections.get(playerId);
    if (!conn) return;
    const send = (m) => conn.send(m);

    try {
      switch (msg.type) {
        case 'LOGIN': {
          const nickname = msg.nickname || '玩家';
          conn.nickname = nickname;
          send({ type: 'LOGIN_OK', playerId, nickname });

          // pendingLesson（教学触发）
          if (this.pendingLesson) {
            const lessonId = this.pendingLesson;
            this.pendingLesson = null;
            await this.dispatch(playerId, { type: 'START_TUTORIAL', lessonId });
          }
          break;
        }

        // v1.1 断局恢复：从快照重建房间并续接游戏
        case 'RESTORE_GAME': {
          const snap = msg.snapshot;
          if (!snap || snap.version !== 1 || !snap.gameState ||
              !['playing', 'tributing', 'round_end'].includes(snap.gameState.phase)) {
            send({ type: 'RESTORE_FAILED', reason: '存档无效或已过期' });
            break;
          }
          const room = this.roomManager.restoreRoom(snap, playerId);
          conn.roomId = room.id;
          const mySeat = room.players.findIndex(p => p && !p.isNPC);
          const gs = room.gameState;

          send({ type: 'RESTORE_OK', roomId: room.id, mySeat });

          // review: round_end 快照——结算已看过，恢复后直接续接下一局（进贡或发牌）
          if (gs.phase === 'round_end') {
            await this.dispatch(playerId, { type: 'NEXT_ROUND' });
            break;
          }

          // 重发 GAME_START（全量手牌，由 _broadcastGameEvents 按 seat 裁剪）+ 按 phase 续接
          // NPC 调度 / 进贡自动化 / 记牌器重置 / 重新持久化 均由 _broadcastGameEvents 统一触发
          const events = [{
            type: 'GAME_START',
            hands: gs.hands.map(h => [...h]),
            currentTurn: gs.currentTurn,
            currentLevel: gs.currentLevel,
            team1Level: gs.team1Level,
            team2Level: gs.team2Level,
          }];
          // review-P1 修复：恢复到一圈中段时重放上一手牌（否则玩家要压"看不见的牌"）
          if (gs.phase === 'playing' && gs.lastPlay && gs.lastPlaySeat >= 0 && !gs.finishOrder.includes(gs.lastPlaySeat)) {
            events.push({
              type: 'CARDS_PLAYED',
              seat: gs.lastPlaySeat,
              cards: gs.lastPlay.cards || [],
              handType: '上一手',
              remainingCards: gs.hands[gs.lastPlaySeat].length,
              isReplay: true,
            });
          }
          // review-P1 修复：用 roundHistory 重建客户端记牌器（否则恢复后剩余张数系统性虚高）
          const playedCounts = {};
          for (const rec of gs.roundHistory || []) {
            for (const c of rec.cards || []) playedCounts[c.rank] = (playedCounts[c.rank] || 0) + 1;
          }
          events.push({ type: 'COUNTER_SYNC', playedCounts });

          if (gs.phase === 'playing') {
            events.push({ type: 'YOUR_TURN', seat: gs.currentTurn });
          } else if (gs.tributeState?.phase === 'waiting_tribute') {
            // review-P2 修复：过滤已交贡的座位，避免重发弹窗+必然报错
            const pending = gs.tributeState.fromSeats.filter(s2 => !gs.tributeState.tributeCards[s2]);
            events.push({ type: 'TRIBUTE_REQUEST', fromSeats: pending, toSeats: gs.tributeState.toSeats, tributeCount: gs.tributeState.count });
          } else if (gs.tributeState?.phase === 'waiting_return') {
            const pendingR = gs.tributeState.toSeats.filter(s2 => !gs.tributeState.returnCards[s2]);
            events.push({ type: 'RETURN_REQUEST', fromSeats: pendingR, tributeCards: Object.values(gs.tributeState.tributeCards), pairMap: gs.tributeState.pairMap });
          }
          this._broadcastGameEvents(room, events);
          break;
        }

        case 'CREATE_ROOM': {
          const room = this.roomManager.createRoom(playerId, conn.nickname);
          conn.roomId = room.roomId;
          send({ type: 'ROOM_CREATED', roomId: room.roomId });
          this._broadcastRoomUpdate(room);
          break;
        }

        case 'JOIN_ROOM': {
          const room = this.roomManager.getRoom(msg.roomId);
          if (!room) { send({ type: 'ERROR', message: '房间不存在' }); return; }
          const result = room.join(playerId, conn.nickname);
          if (!result.success) { send({ type: 'ERROR', message: result.error }); return; }
          conn.roomId = room.roomId;
          send({ type: 'JOINED_ROOM', roomId: room.roomId, seat: result.seat });
          this._broadcastRoomUpdate(room);
          break;
        }

        case 'READY': {
          const room = this.roomManager.getRoom(conn.roomId);
          if (!room) return;
          room.toggleReady(playerId);
          this._broadcastRoomUpdate(room);
          break;
        }

        case 'ADD_NPC': {
          const room = this.roomManager.getRoom(conn.roomId);
          if (!room) return;
          const result = room.addNPC(msg.level, msg.seat, msg.skillProfile ?? null, msg.errorRate ?? 0);
          if (result.error) { send({ type: 'ERROR', message: result.error }); return; }
          this._broadcastRoomUpdate(room);
          break;
        }

        case 'REMOVE_NPC': {
          const room = this.roomManager.getRoom(conn.roomId);
          if (!room) return;
          if (room.kickNPC(msg.seat)) this._broadcastRoomUpdate(room);
          break;
        }

        case 'START_GAME': {
          const room = this.roomManager.getRoom(conn.roomId);
          if (!room) return;
          if (room.hostId !== playerId) {
            send({ type: 'ERROR', message: '只有房主可以开始游戏' }); return;
          }
          const result = room.startGame(msg.seed);   // 批1-③：可选种子(每日一局)
          if (result.error) { send({ type: 'ERROR', message: result.error }); return; }
          this._broadcastGameEvents(room, result.events);
          break;
        }

        case 'PLAY_CARDS': {
          const room = this.roomManager.getRoom(conn.roomId);
          if (!room) return;
          const result = room.handlePlayCards(playerId, msg.cardIds);
          if (result.error) { send({ type: 'ERROR', message: result.error }); return; }
          this._broadcastGameEvents(room, result.events);
          break;
        }

        case 'PASS': {
          const room = this.roomManager.getRoom(conn.roomId);
          if (!room) return;
          const result = room.handlePass(playerId);
          if (result.error) { send({ type: 'ERROR', message: result.error }); return; }
          this._broadcastGameEvents(room, result.events);
          break;
        }

        case 'HINT': {
          const room = this.roomManager.getRoom(conn.roomId);
          if (!room) return;
          const hints = room.getHintForPlayer(playerId);
          send({ type: 'HINT_RESULT', hints: hints.slice(0, 5) });
          break;
        }

        // v2.0.1 托管修复：用真 NPC 引擎（expert 档）代打，替代原"hint[0]=最小单张"
        case 'GET_REPLAY': {
          // v2.4 复盘：返回全场记录（剥离内部字段）。批1-①：回显 silent 供客户端静默归档
          const silent = !!msg.silent;
          const room = this.roomManager.getRoom(conn.roomId);
          if (!room || !room.replayLog) { conn.send({ type: 'REPLAY_DATA', log: [], silent }); break; }
          const log = room.replayLog.map(r => ({
            round: r.round, level: r.level, team1Level: r.team1Level, team2Level: r.team2Level,
            finishOrder: r.finishOrder, entries: r.entries,
          }));
          conn.send({ type: 'REPLAY_DATA', log, silent });
          break;
        }

      case 'AUTO_PLAY': {
          const room = this.roomManager.getRoom(conn.roomId);
          if (!room?.gameState || room.gameState.phase !== 'playing') break;
          const seat = room.players.findIndex(p => p && p.id === playerId);
          if (seat < 0 || room.gameState.currentTurn !== seat) break;

          const hand = room.gameState.hands[seat];
          let play = null;
          try {
            const pseudoNPC = { level: 'expert', npcType: 'practice', skillProfile: [...NPC_PRESETS.expert] };
            const result = await getNPCDecision(pseudoNPC, seat, hand, room.gameState, room.id);
            play = result.play;
          } catch (e) { /* 决策失败走 fallback */ }

          let result = play
            ? room.handlePlayCards(playerId, play.map(c => c.id))
            : room.handlePass(playerId);
          // fallback：决策被 engine 拒（如自由出牌不能 PASS）→ 出提示列表第一手
          if (result?.error) {
            const hints = room.getHintForPlayer(playerId);
            if (hints.length > 0) {
              result = room.handlePlayCards(playerId, hints[0].map(c => c.id));
            }
          }
          if (result?.events) this._broadcastGameEvents(room, result.events);
          break;
        }

        case 'TRIBUTE': {
          const room = this.roomManager.getRoom(conn.roomId);
          if (!room || !room.gameState) return;
          const seat = room.players.findIndex(p => p && p.id === playerId);
          const result = handleTribute(room.gameState, seat, msg.cardId);
          if (result.error) { send({ type: 'ERROR', message: result.error }); return; }
          room.gameState = result.state;
          this._broadcastGameEvents(room, result.events);
          break;
        }

        case 'RETURN_TRIBUTE': {
          const room = this.roomManager.getRoom(conn.roomId);
          if (!room || !room.gameState) return;
          const seat = room.players.findIndex(p => p && p.id === playerId);
          const result = handleReturnTribute(room.gameState, seat, msg.cardId);
          if (result.error) { send({ type: 'ERROR', message: result.error }); return; }
          room.gameState = result.state;
          // review-P2 修复：删除双重 NPC 调度（_broadcastGameEvents 内已统一处理 YOUR_TURN）
          this._broadcastGameEvents(room, result.events);
          break;
        }

        case 'NEXT_ROUND': {
          const room = this.roomManager.getRoom(conn.roomId);
          if (!room) return;
          // review-P0 根治：需进贡时直接 startTribute——原先误走 room.nextRound() 的 startRound，
          // 既多发一次牌，又清空 finishOrder 导致进贡完成后 currentTurn=undefined 全场死锁
          if (room.gameState?.tributeNextRound) {
            if (room.gameState.phase !== 'round_end') {
              send({ type: 'ERROR', message: '当前不在结算阶段' }); return;
            }
            room.players.forEach(p => { if (p) p.ready = false; });
            const tributeInfo = room.gameState.tributeNextRound;
            room.gameState.tributeNextRound = null;
            room.gameState.finishOrder = [];
            room.gameState.roundHistory = [];
            room.gameState.bombCount = 0;
            const tributeResult = startTribute(room.gameState, tributeInfo);
            room.gameState = tributeResult.state;
            this._broadcastGameEvents(room, tributeResult.events);
          } else {
            const result = room.nextRound();
            if (result.error) { send({ type: 'ERROR', message: result.error }); return; }
            this._broadcastGameEvents(room, result.events);
          }
          break;
        }

        case 'START_TUTORIAL': {
          try {
            await preloadLesson(msg.lessonId);
            const { gameState, currentStep, lessonConfig } = startLesson(playerId, msg.lessonId);
            send({
              type: 'TUTORIAL_STARTED',
              lessonId: msg.lessonId,
              lessonConfig,
              hand: gameState.hands[0],
              currentLevel: gameState.currentLevel,
              currentStep,
            });
          } catch (e) {
            send({ type: 'ERROR', message: `课程加载失败: ${e.message}` });
          }
          break;
        }

        case 'TUTORIAL_ACTION': {
          const tutSession = getTutorialSession(playerId);
          if (!tutSession) { send({ type: 'ERROR', message: '没有进行中的教学' }); return; }
          const tutAction = msg.action || {};

          if (tutAction.type === 'NEXT') {
            const nextStep = advanceStep(playerId);
            send({
              type: 'TUTORIAL_FEEDBACK',
              correct: true,
              explanation: '',
              nextStep,
              nextStepIndex: tutSession.currentStepIndex,
              completed: !nextStep,
            });
            return;
          }

          const tutResult = validateStep(playerId, tutAction);
          const response = {
            type: 'TUTORIAL_FEEDBACK',
            correct: tutResult.correct,
            explanation: tutResult.explanation || '',
            nextStep: null,
            nextStepIndex: tutSession.currentStepIndex,
            completed: false,
            playedCardIds: [],
          };

          if (tutResult.correct) {
            if (tutAction.type === 'PLAY' && tutAction.cardIds?.length > 0) {
              response.playedCardIds = tutAction.cardIds;
              tutSession.gameState.hands[0] = tutSession.gameState.hands[0]
                .filter(c => !tutAction.cardIds.includes(c.id));
            }
            const nextStep = advanceStep(playerId);
            response.nextStep = nextStep;
            response.nextStepIndex = tutSession.currentStepIndex;
            response.completed = !nextStep;
          }
          send(response);
          break;
        }

        default:
          send({ type: 'ERROR', message: `未知消息类型: ${msg.type}` });
      }
    } catch (err) {
      console.error('[Loopback] dispatch 出错', err);
      send({ type: 'ERROR', message: '服务异常: ' + err.message });
    }
  }

  // ====== 内部辅助 ======

  _broadcastRoomUpdate(room) {
    for (const player of room.players) {
      if (!player || player.isNPC) continue;
      const conn = this.connections.get(player.id);
      if (!conn) continue;
      try {
        const view = room.getViewForPlayer(player.id);
        conn.send({ type: 'ROOM_UPDATE', ...view });
      } catch (e) { /* 忽略 */ }
    }
  }

  /**
   * v2.4 复盘记录器：CARDS_PLAYED/PLAYER_PASS 记每手（含出牌前四家手牌——由
   * 当前手牌 + 刚出的牌重建，PASS 无变化直接快照）；GAME_START 开新局容器。
   * NPC 决策理由由 _handleNPCTurn 在出牌成功后补写到 room._replayLast。
   */
  _recordReplay(room, event) {
    if (!room.replayLog) room.replayLog = [];
    const gs = room.gameState;
    if (!gs) return;

    if (event.type === 'GAME_START' && (event.phase || 'PLAYING') === 'PLAYING') {
      room.replayLog.push({
        round: room.replayLog.length + 1,
        level: event.currentLevel,
        team1Level: event.team1Level,
        team2Level: event.team2Level,
        entries: [],
        finishOrder: null,
      });
      return;
    }
    const cur = room.replayLog[room.replayLog.length - 1];
    if (!cur) return;

    const slim = (c) => ({ r: c.rank, s: c.suit });
    if (event.type === 'CARDS_PLAYED' && !event.isReplay) {
      // 出牌前手牌重建：当前（已扣牌）+ 刚出的
      const before = gs.hands.map((h, i) => {
        const now = (h || []).map(slim);
        return i === event.seat ? now.concat((event.cards || []).map(slim)) : now;
      });
      const entry = {
        idx: cur.entries.length,
        seat: event.seat,
        action: 'play',
        cards: (event.cards || []).map(slim),
        handType: event.handType || '',
        beforeHands: before,
        counts: before.map(h => h.length),
        prev: cur._lastPlayCtx || null,   // 压的是谁的什么（领牌为 null）
        npc: null,
      };
      cur.entries.push(entry);
      room._replayLast = entry;
      cur._lastPlayCtx = { seat: event.seat, handType: event.handType || '', n: (event.cards || []).length };
    } else if (event.type === 'PLAYER_PASS') {
      const before = gs.hands.map(h => (h || []).map(slim));
      const entry = {
        idx: cur.entries.length,
        seat: event.seat,
        action: 'pass',
        cards: [],
        handType: '',
        beforeHands: before,
        counts: before.map(h => h.length),
        prev: cur._lastPlayCtx || null,
        npc: null,
      };
      cur.entries.push(entry);
      room._replayLast = entry;
    } else if (event.type === 'TURN_UPDATE' && event.isNewTrick) {
      cur._lastPlayCtx = null;   // 新 trick：之后第一手是领牌
    } else if (event.type === 'ROUND_END') {
      cur.finishOrder = event.finishOrder || null;
      cur._lastPlayCtx = null;
    } else if (event.type === 'TRIBUTE_DONE') {
      cur.entries.push({ idx: cur.entries.length, seat: event.seat, action: 'tribute',
        cards: event.card ? [slim(event.card)] : [], handType: '进贡', beforeHands: null, counts: null, prev: null, npc: null });
    } else if (event.type === 'RETURN_DONE') {
      cur.entries.push({ idx: cur.entries.length, seat: event.seat, action: 'return',
        cards: event.card ? [slim(event.card)] : [], handType: '还贡', beforeHands: null, counts: null, prev: null, npc: null });
    }
  }

  _broadcastGameEvents(room, events) {
    // ── 复盘记录器（v2.4）：每手全量记录，供局后复盘/病例导出 ──
    for (const event of events) {
      try { this._recordReplay(room, event); } catch (e) { /* 复盘记录失败不影响对局 */ }
      // 批1-② Par 手数标尺：开打时刻(换贡后手牌定型)对人类手牌算"最少手数"标准杆，
      // 局末在 ROUND_END 上附 par + 实际手数。只读 minTricks DP，不碰任何决策。
      try {
        if (event.type === 'GAME_START' && (event.phase || 'PLAYING') === 'PLAYING') {
          const hs = room.players.findIndex(p => p && !p.isNPC);
          room._parInfo = (hs >= 0 && room.gameState?.hands?.[hs]?.length)
            ? { seat: hs, par: minTricks(room.gameState.hands[hs], room.gameState.currentLevel) }
            : null;
        } else if (event.type === 'ROUND_END' && room._parInfo) {
          const cur = room.replayLog?.[room.replayLog.length - 1];
          event.par = room._parInfo.par;
          event.parTricks = cur ? cur.entries.filter(e => e.seat === room._parInfo.seat && e.action === 'play').length : null;
        }
      } catch (e) { /* Par 计算失败不影响对局 */ }
    }
    for (const player of room.players) {
      if (!player || player.isNPC) continue;
      const conn = this.connections.get(player.id);
      if (!conn) continue;

      const seat = room.players.findIndex(p => p && p.id === player.id);
      for (const event of events) {
        try {
          if (event.type === 'GAME_START') {
            conn.send({
              type: 'GAME_START',
              hand: event.hands[seat],
              currentTurn: event.currentTurn,
              currentLevel: event.currentLevel,
              team1Level: event.team1Level,
              team2Level: event.team2Level,
              mySeat: seat,
              phase: event.phase || 'PLAYING',   // review: 客户端需区分 TRIBUTING/PLAYING（局数计数/发牌音效）
            });
          } else if (event.type === 'YOUR_TURN') {
            // 新 trick = 上一手为空（上一轮结束），或者出牌权回到了发起者（全员PASS）
            const isNewTrick = !room.gameState.lastPlay || room.gameState.lastPlaySeat === event.seat;
            conn.send({
              type: 'TURN_UPDATE',
              currentTurn: event.seat,
              isMyTurn: event.seat === seat,
              isNewTrick,
            });
          } else if (event.type === 'CARDS_PLAYED') {
            const isMasked = event.seat !== seat && event.remainingCards > 10;
            conn.send({ ...event, remainingCards: isMasked ? -1 : event.remainingCards });
          } else {
            conn.send(event);
          }
        } catch (e) { /* ignore */ }
      }
    }

    // 更新 NPC 记牌器
    const cardsPlayedEvent = events.find(e => e.type === 'CARDS_PLAYED');
    if (cardsPlayedEvent) {
      for (let s = 0; s < 4; s++) {
        const p = room.players[s];
        if (p && p.isNPC) {
          onCardsPlayed(room.id, s, cardsPlayedEvent.seat, cardsPlayedEvent.cards || [], cardsPlayedEvent.handType);
        }
      }
    }
    const gameStartEvent = events.find(e => e.type === 'GAME_START');
    if (gameStartEvent) {
      for (let s = 0; s < 4; s++) {
        const p = room.players[s];
        if (p && p.isNPC) {
          resetMemory(room.id, s, p.level || 'expert', gameStartEvent.currentLevel);
        }
      }
    }

    // 检查是否轮到 NPC 出牌
    const turnEvent = events.find(e => e.type === 'YOUR_TURN');
    if (turnEvent) {
      const nextPlayer = room.players[turnEvent.seat];
      if (nextPlayer && nextPlayer.isNPC) this._handleNPCTurn(room, turnEvent.seat);
    }

    // 进贡阶段：让 NPC 自动选最大牌进贡
    const tributeReq = events.find(e => e.type === 'TRIBUTE_REQUEST');
    if (tributeReq) {
      for (const fromSeat of tributeReq.fromSeats) {
        const player = room.players[fromSeat];
        if (player && player.isNPC) this._handleNPCTribute(room, fromSeat);
      }
    }

    // 还贡阶段：让 NPC 自动选小牌还贡
    const returnReq = events.find(e => e.type === 'RETURN_REQUEST');
    if (returnReq) {
      for (const toSeat of returnReq.fromSeats) {
        const player = room.players[toSeat];
        if (player && player.isNPC) this._handleNPCReturn(room, toSeat);
      }
    }

    // v1.1 断局恢复：所有游戏事件广播完后持久化最新状态
    this._persist(room);
  }

  /**
   * NPC 自动进贡：选手中除王外最大的非级牌
   */
  _handleNPCTribute(room, seat) {
    const delay = 600 + Math.random() * 600;
    setTimeout(() => {
      if (!room.gameState || !room.gameState.tributeState) return;
      if (room.gameState.tributeState.phase !== 'waiting_tribute') return;
      if (room.gameState.tributeState.tributeCards[seat]) return; // 已交过

      const hand = room.gameState.hands[seat];
      const card = selectTributeCard(hand, room.gameState.currentLevel);  // E2: 传级牌，按协会版牌力选最大
      if (!card) return;

      const result = handleTribute(room.gameState, seat, card.id);
      if (result.error) {
        console.warn('[NPC tribute] 失败', seat, result.error);
        return;
      }
      room.gameState = result.state;
      this._broadcastGameEvents(room, result.events);
    }, delay);
  }

  /**
   * NPC 自动还贡：选最小的非级牌（保留好牌打）
   */
  _handleNPCReturn(room, seat) {
    const delay = 600 + Math.random() * 600;
    setTimeout(() => {
      if (!room.gameState || !room.gameState.tributeState) return;
      if (room.gameState.tributeState.phase !== 'waiting_return') return;
      if (room.gameState.tributeState.returnCards[seat]) return;

      const hand = room.gameState.hands[seat];
      const currentLevel = room.gameState.currentLevel;
      // E2: 优先选 ≤10 的最小非级牌；review 修复：同队还贡时 tier2 兜底不再选 >10（会被 engine 拒）
      const giver = room.gameState.tributeState?.pairMap?.[seat];
      const sameTeam = giver !== undefined && (giver % 2) === (seat % 2);
      const candidates = hand
        .filter(c => c.rank !== currentLevel && c.rank <= 10)
        .sort((a, b) => a.rank - b.rank);
      const card = candidates[0]
        || (!sameTeam ? hand.filter(c => c.rank !== currentLevel && c.rank < 15).sort((a, b) => a.rank - b.rank)[0] : null)
        || hand.filter(c => c.rank !== currentLevel).sort((a, b) => a.rank - b.rank)[0]   // 同队死局由 engine 端放宽
        || hand[0];
      if (!card) return;

      const result = handleReturnTribute(room.gameState, seat, card.id);
      if (result.error) {
        console.warn('[NPC return] 失败', seat, result.error);
        return;
      }
      room.gameState = result.state;
      this._broadcastGameEvents(room, result.events);

      // 进贡完成后，事件链里会触发 PLAYING + 第一个出牌人的 YOUR_TURN
      // 已由 _broadcastGameEvents 的 turnEvent 检测处理
    }, delay);
  }

  _handleNPCTurn(room, seat) {
    const npc = room.players[seat];
    // 新 trick 开始（自由出牌）时给玩家更多时间看清上一手结果
    const isFreePlay = !room.gameState.lastPlay || room.gameState.lastPlaySeat === seat;
    const thinkDelay = isFreePlay ? 2000 + Math.random() * 500 : 800 + Math.random() * 400;

    setTimeout(async () => {
      if (!room.gameState || room.gameState.currentTurn !== seat) return;
      const hand = room.gameState.hands[seat];

      let play = null, decisionLog = null;
      try {
        const result = await getNPCDecision(npc, seat, hand, room.gameState, room.id);
        play = result.play;
        decisionLog = result.decisionLog;
      } catch (err) {
        console.warn('[NPC] 决策失败', err);
      }

      if (!room.gameState || room.gameState.currentTurn !== seat) return;

      let result = play
        ? room.handlePlayCards(npc.id, play.map(c => c.id))
        : room.handlePass(npc.id);

      // review-P1 修复：NPC 决策被 engine 拒绝时强制兜底（出提示第一手 / 反向 pass），
      // 原先静默吞掉 → 整桌永久卡死且无任何日志
      if (result?.error) {
        console.warn('[NPC] 决策被拒，兜底重打', seat, result.error);
        const hints = findPlayableHands(room.gameState.hands[seat],
          (room.gameState.lastPlaySeat === seat || !room.gameState.lastPlay) ? null : room.gameState.lastPlay,
          room.gameState.currentLevel);
        if (hints.length > 0) {
          result = room.handlePlayCards(npc.id, hints[0].map(c => c.id));
        } else if (play) {
          result = room.handlePass(npc.id);
        }
        if (result?.error) {
          console.error('[NPC] 兜底仍失败，跳过本手', seat, result.error);
          return;
        }
      }

      if (result?.events) {
        if (decisionLog && room.gameState.roundHistory?.length > 0) {
          const lastRecord = room.gameState.roundHistory[room.gameState.roundHistory.length - 1];
          if (lastRecord) lastRecord.npcReason = decisionLog.explanation;
        }
        this._broadcastGameEvents(room, result.events);
        // v2.4 复盘：把 NPC 决策理由补写到刚记录的复盘条目
        // （必须在 _broadcastGameEvents 之后——记录器在那里面创建 entry 并设 _replayLast）
        if (decisionLog && room._replayLast && room._replayLast.seat === seat && !room._replayLast.npc) {
          room._replayLast.npc = {
            skills: decisionLog.activatedSkills || [],
            explanation: decisionLog.explanation || '',
            notes: (decisionLog.skillNotes || []).map(t => `${t.skill}: ${t.note}`),
          };
        }

        // P1.2 任务：NPC 决策广播给所有玩家（移除 teaching 限制）
        // 客户端在 ?debug=1 模式下决定是否显示信息泡（payload 单次 < 1KB，开销可忽略）
        if (decisionLog) {
          for (const player of room.players) {
            if (!player || player.isNPC) continue;
            const conn = this.connections.get(player.id);
            if (conn) {
              conn.send({
                type: 'NPC_EXPLAIN',
                seat,
                action: decisionLog.action,
                explanation: decisionLog.explanation,
                primaryReason: decisionLog.primaryReason,
                activatedSkills: decisionLog.activatedSkills || [],
                skillNotes: decisionLog.skillNotes || [],
              });
            }
          }
        }
      }
    }, thinkDelay);
  }
}
