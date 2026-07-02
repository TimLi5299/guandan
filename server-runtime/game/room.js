/**
 * room.js — 房间管理器
 *
 * 管理游戏房间的创建、加入、准备、开始等。
 */

import { createGameState, startRound, playCards, pass, getPlayerView, getHint, GamePhase } from './engine.js';
import { makeRng } from './deck.js';   // 批1-③ 每日一局：种子发牌
import { PERSONAS } from '../npc/Personas.js';   // 批2-① 茶馆牌友群像

class Room {
  constructor(roomId, hostId) {
    this.roomId = roomId;
    this.id = roomId;       // v1.1 修复：index.js 多处使用 room.id（此前为 undefined，记牌器 key 失效）
    this.hostId = hostId;
    this.players = [null, null, null, null]; // 4 个座位
    this.gameState = null;
    this.createdAt = Date.now();
    this.lastActivityAt = Date.now();
  }

  /**
   * 玩家加入房间
   * @returns {{ success, seat, error }}
   */
  join(playerId, nickname) {
    // 检查是否已在房间中
    const existingSeat = this.players.findIndex(p => p && p.id === playerId);
    if (existingSeat >= 0) {
      return { success: true, seat: existingSeat, error: null };
    }

    // 找空座位
    const emptySeat = this.players.findIndex(p => p === null);
    if (emptySeat < 0) {
      return { success: false, seat: -1, error: '房间已满' };
    }

    this.players[emptySeat] = {
      id: playerId,
      nickname: nickname || `玩家${emptySeat + 1}`,
      ready: false,
      connected: true,
      isNPC: false,
    };

    this.lastActivityAt = Date.now();
    return { success: true, seat: emptySeat, error: null };
  }

  /**
   * 添加机器人 (NPC)
   */
  addNPC(level = 'normal', seatIndex = -1, skillProfile = null, errorRate = 0, persona = null) {
    let targetSeat = seatIndex;
    if (targetSeat === -1 || targetSeat < 0 || targetSeat >= 4) {
      targetSeat = this.players.findIndex(p => p === null);
    }

    if (targetSeat < 0 || this.players[targetSeat] !== null) {
      return { success: false, error: '该位置已有人或房间已满' };
    }

    const npcId = `npc_${Math.random().toString(36).substr(2, 9)}`;
    // 昵称：persona → 牌友大名；否则按 skillProfile/level（原逻辑）
    let nickname;
    if (persona && PERSONAS[persona]) {
      nickname = PERSONAS[persona].name;
    } else if (skillProfile !== null && Array.isArray(skillProfile)) {
      const n = skillProfile.length;
      const total = 9;
      if (n === 0)     nickname = '小白机器人';
      else if (n >= total) nickname = '专家机器人';
      else nickname = `定制机器人`;
    } else {
      const names = { noob: '小白机器人', normal: '普通机器人', expert: '专家机器人' };
      nickname = names[level] || '机器人';
    }

    this.players[targetSeat] = {
      id: npcId,
      nickname,
      ready: true, // 机器人自动准备
      connected: true,
      isNPC: true,
      level: level,
      skillProfile: skillProfile, // null = 按 level 默认；Array = 指定技能列表
      errorRate: errorRate,       // 难度旋钮：以ε概率随机出牌（0=满血）
      persona: persona,           // 批2-①：牌友 id（NPCEngine 按 Personas.js 单源解析）
    };

    this.lastActivityAt = Date.now();
    return { success: true, seat: targetSeat };
  }

  /**
   * 移除机器人
   */
  kickNPC(seatIndex) {
    if (seatIndex < 0 || seatIndex >= 4) return false;
    const p = this.players[seatIndex];
    if (p && p.isNPC) {
      this.players[seatIndex] = null;
      this.lastActivityAt = Date.now();
      return true;
    }
    return false;
  }

  /**
   * 玩家离开房间
   */
  leave(playerId) {
    const seat = this.players.findIndex(p => p && p.id === playerId);
    if (seat < 0) return false;

    // 游戏中不能离开，只能断线
    if (this.gameState && this.gameState.phase === GamePhase.PLAYING) {
      this.players[seat].connected = false;
      return true;
    }

    this.players[seat] = null;
    this.lastActivityAt = Date.now();
    return true;
  }

  /**
   * 玩家准备/取消准备
   */
  toggleReady(playerId) {
    const seat = this.players.findIndex(p => p && p.id === playerId);
    if (seat < 0) return false;
    this.players[seat].ready = !this.players[seat].ready;
    this.lastActivityAt = Date.now();
    return true;
  }

  /**
   * 检查是否所有人都准备了
   */
  allReady() {
    return this.players.every(p => p !== null && p.ready);
  }

  /**
   * 开始游戏
   */
  startGame(seed) {
    if (!this.allReady()) {
      return { success: false, error: '还有人没准备' };
    }

    this.gameState = createGameState();
    // 批1-③ 每日一局：带种子=确定性发牌（同种子同牌）；不带=原行为(Math.random)完全不变
    const result = startRound(this.gameState, seed ? makeRng(seed >>> 0) : undefined);
    this.gameState = result.state;
    this.lastActivityAt = Date.now();

    return { success: true, events: result.events };
  }

  /**
   * 出牌
   */
  handlePlayCards(playerId, cardIds) {
    if (!this.gameState) return { error: '游戏未开始' };

    const seat = this.players.findIndex(p => p && p.id === playerId);
    if (seat < 0) return { error: '你不在房间中' };

    const result = playCards(this.gameState, seat, cardIds);
    this.gameState = result.state;
    this.lastActivityAt = Date.now();

    return result;
  }

  /**
   * 不出（PASS）
   */
  handlePass(playerId) {
    if (!this.gameState) return { error: '游戏未开始' };

    const seat = this.players.findIndex(p => p && p.id === playerId);
    if (seat < 0) return { error: '你不在房间中' };

    const result = pass(this.gameState, seat);
    this.gameState = result.state;
    this.lastActivityAt = Date.now();

    return result;
  }

  /**
   * 开始下一局
   */
  nextRound() {
    if (!this.gameState || this.gameState.phase !== GamePhase.ROUND_END) {
      return { error: '当前不在结算阶段' };
    }

    // 重置准备状态
    this.players.forEach(p => { if (p) p.ready = false; });

    const result = startRound(this.gameState);
    this.gameState = result.state;
    this.lastActivityAt = Date.now();

    return { success: true, events: result.events };
  }

  /**
   * 获取指定玩家视角的状态
   */
  getViewForPlayer(playerId) {
    const seat = this.players.findIndex(p => p && p.id === playerId);
    if (seat < 0) return null;

    return {
      roomId: this.roomId,
      players: this.players.map(p => p ? {
        nickname: p.nickname,
        ready: p.ready,
        connected: p.connected,
      } : null),
      seat,
      gameView: this.gameState ? getPlayerView(this.gameState, seat) : null,
    };
  }

  /**
   * 获取出牌提示
   */
  getHintForPlayer(playerId) {
    if (!this.gameState) return [];
    const seat = this.players.findIndex(p => p && p.id === playerId);
    if (seat < 0) return [];
    return getHint(this.gameState, seat);
  }

  /**
   * 重连
   */
  reconnect(playerId) {
    const seat = this.players.findIndex(p => p && p.id === playerId);
    if (seat < 0) return false;
    this.players[seat].connected = true;
    this.lastActivityAt = Date.now();
    return true;
  }

  /**
   * 获取房间摘要
   */
  getSummary() {
    return {
      roomId: this.roomId,
      playerCount: this.players.filter(p => p !== null).length,
      phase: this.gameState ? this.gameState.phase : 'waiting',
    };
  }
}

/**
 * 房间管理器 — 管理所有房间
 */
class RoomManager {
  constructor() {
    this.rooms = new Map();
  }

  /**
   * 创建房间
   */
  createRoom(hostId, hostNickname) {
    const roomId = this._generateRoomId();
    const room = new Room(roomId, hostId);
    room.join(hostId, hostNickname);
    this.rooms.set(roomId, room);
    return room;
  }

  /**
   * v1.1 断局恢复：从快照重建房间
   * 真人玩家的 id 换成新连接的 playerId（刷新后 id 会变）；NPC 配置原样还原
   */
  restoreRoom(snapshot, humanId) {
    const room = new Room(snapshot.roomId, humanId);
    room.players = snapshot.players.map(p => {
      if (!p) return null;
      return p.isNPC ? { ...p } : { ...p, id: humanId, connected: true };
    });
    room.gameState = snapshot.gameState;
    this.rooms.set(room.roomId, room);
    return room;
  }

  /**
   * 获取房间
   */
  getRoom(roomId) {
    return this.rooms.get(roomId) || null;
  }

  /**
   * 删除房间
   */
  removeRoom(roomId) {
    this.rooms.delete(roomId);
  }

  /**
   * 清理过期房间（30 分钟无活动）
   */
  cleanup() {
    const now = Date.now();
    const timeout = 30 * 60 * 1000; // 30 min
    for (const [roomId, room] of this.rooms) {
      if (now - room.lastActivityAt > timeout) {
        this.rooms.delete(roomId);
      }
    }
  }

  /**
   * 生成 8 位房间号
   */
  _generateRoomId() {
    let id;
    do {
      id = String(Math.floor(10000000 + Math.random() * 90000000));
    } while (this.rooms.has(id));
    return id;
  }
}

export { Room, RoomManager };
