/**
 * loopback.js — 静态托管下用于替代 WebSocket 的本地"假服务器"适配器
 *
 * 与 GameSocket 完全相同的 API（connect / send / on），但消息走的是
 * 本地 LoopbackServer，单玩家 + 3 个 NPC 直接在浏览器跑。
 */

import { LoopbackServer } from '../../server-runtime/index.js';

const SAVE_KEY = 'guandan_save_v1';

class LoopbackSocket {
  constructor() {
    this.handlers = {};
    this.playerId = null;
    this.nickname = null;
    // v1.1 断局恢复：游戏状态变更时写 localStorage，GAME_OVER 时清档
    this.server = new LoopbackServer({
      onStateChange: (snapshot) => {
        try {
          if (snapshot) localStorage.setItem(SAVE_KEY, JSON.stringify(snapshot));
          else localStorage.removeItem(SAVE_KEY);
        } catch (e) { /* localStorage 不可用（隐私模式等）时静默跳过 */ }
      },
    });
    this._connected = false;
  }

  /** v1.1 断局恢复：是否存在可恢复的存档 */
  hasSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const snap = JSON.parse(raw);
      return snap?.version === 1 && ['playing', 'tributing'].includes(snap?.gameState?.phase);
    } catch (e) { return false; }
  }

  /** v1.1 断局恢复：恢复上一局（需先 login） */
  restoreGame() {
    try {
      const snap = JSON.parse(localStorage.getItem(SAVE_KEY));
      this.send({ type: 'RESTORE_GAME', snapshot: snap });
    } catch (e) { /* 存档损坏 */ }
  }

  /** v1.1 断局恢复：丢弃存档 */
  clearSave() {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
  }

  async connect(_url) {
    this.playerId = `local_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    this.server.attach(this.playerId, (msg) => this._dispatchToClient(msg));
    this._connected = true;
    console.log('🦞 Loopback 连接已建立 (单机演示模式)');
    return Promise.resolve();
  }

  send(msg) {
    if (!this._connected) return;
    console.log('📤 [Loopback] →', msg.type, msg);
    // 异步分发，避免同步调用栈
    Promise.resolve().then(() => this.server.dispatch(this.playerId, msg));
  }

  on(type, handler) {
    this.handlers[type] = handler;
  }

  _dispatchToClient(msg) {
    console.log('📩 [Loopback] ←', msg.type, msg);
    if (this.handlers[msg.type]) this.handlers[msg.type](msg);
    if (this.handlers['*']) this.handlers['*'](msg);
  }

  // 与 GameSocket 一致的便捷方法
  login(nickname) { this.nickname = nickname; this.send({ type: 'LOGIN', nickname }); }
  createRoom() { this.send({ type: 'CREATE_ROOM' }); }
  joinRoom(roomId) { this.send({ type: 'JOIN_ROOM', roomId }); }
  ready() { this.send({ type: 'READY' }); }
  startGame() { this.send({ type: 'START_GAME' }); }
  playCards(cardIds) { this.send({ type: 'PLAY_CARDS', cardIds }); }
  pass() { this.send({ type: 'PASS' }); }
  hint() { this.send({ type: 'HINT' }); }
  addNPC(level, seat, skillProfile, errorRate = 0) { this.send({ type: 'ADD_NPC', level, seat, skillProfile: skillProfile ?? null, errorRate }); }
  removeNPC(seat) { this.send({ type: 'REMOVE_NPC', seat }); }
  nextRound() { this.send({ type: 'NEXT_ROUND' }); }
}

window.gameSocket = new LoopbackSocket();
