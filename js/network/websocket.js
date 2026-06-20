/**
 * websocket.js — WebSocket 通信封装
 */

class GameSocket {
  constructor() {
    this.ws = null;
    this.handlers = {};
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.playerId = null;
    this.nickname = null;
  }

  connect(url) {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        console.log('✅ WebSocket 已连接');
        this.reconnectAttempts = 0;
        resolve();
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          console.log('📩 收到:', msg.type, msg);
          if (this.handlers[msg.type]) {
            this.handlers[msg.type](msg);
          }
          if (this.handlers['*']) {
            this.handlers['*'](msg);
          }
        } catch (e) {
          console.error('消息解析错误:', e);
        }
      };

      this.ws.onclose = () => {
        console.log('❌ WebSocket 断开');
        if (this.handlers['disconnected']) {
          this.handlers['disconnected']();
        }
      };

      this.ws.onerror = (err) => {
        console.error('WebSocket 错误:', err);
        reject(err);
      };
    });
  }

  send(msg) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
      console.log('📤 发送:', msg.type, msg);
    }
  }

  on(type, handler) {
    this.handlers[type] = handler;
  }

  login(nickname) {
    this.nickname = nickname;
    this.send({ type: 'LOGIN', nickname });
  }

  createRoom() {
    this.send({ type: 'CREATE_ROOM' });
  }

  joinRoom(roomId) {
    this.send({ type: 'JOIN_ROOM', roomId });
  }

  ready() {
    this.send({ type: 'READY' });
  }

  startGame() {
    this.send({ type: 'START_GAME' });
  }

  playCards(cardIds) {
    this.send({ type: 'PLAY_CARDS', cardIds });
  }

  pass() {
    this.send({ type: 'PASS' });
  }

  hint() {
    this.send({ type: 'HINT' });
  }

  addNPC(level, seat, skillProfile) {
    this.send({ type: 'ADD_NPC', level, seat, skillProfile: skillProfile ?? null });
  }

  removeNPC(seat) {
    this.send({ type: 'REMOVE_NPC', seat });
  }

  nextRound() {
    this.send({ type: 'NEXT_ROUND' });
  }
}

// 全局实例
window.gameSocket = new GameSocket();
