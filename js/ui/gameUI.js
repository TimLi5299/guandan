/**
 * gameUI.js — 游戏界面控制器
 */

class GameUI {
  constructor() {
    this.currentScreen = 'lobby';
    this.selectedCardIds = new Set();
    this.myHand = [];
    this.mySeat = -1;
    this.lastPlayedCards = {};  // seat -> cards
    this.isMyTurn = false;
    this.currentLevel = 2;
    this.roundCount = 0;
    this.prevTeam1Level = null;
    this.prevTeam2Level = null;
    // Phase 3 任务 3.3：每个 quadrant 的 2500ms 自动淡出 timer
    this.quadrantFadeTimers = { bottom: null, top: null, left: null, right: null };
    // v1.3 记牌器：rank -> 已打出张数
    this.playedCounts = {};
  }

  // ====== v1.3 记牌器 ======
  trackPlayed(cards) {
    for (const c of cards || []) {
      this.playedCounts[c.rank] = (this.playedCounts[c.rank] || 0) + 1;
    }
    this.renderCardCounter();
  }

  resetCardCounter() {
    this.playedCounts = {};
    this.renderCardCounter();
  }

  /** 剩余 = 总张数(王2/其他8) - 已打出 - 我手中 ——即"其他三家手里还有几张" */
  renderCardCounter() {
    const grid = document.getElementById('card-counter-grid');
    if (!grid) return;
    const names = { 2:'2',3:'3',4:'4',5:'5',6:'6',7:'7',8:'8',9:'9',10:'10',11:'J',12:'Q',13:'K',14:'A',15:'小',16:'大' };
    const myCount = {};
    for (const c of this.myHand || []) myCount[c.rank] = (myCount[c.rank] || 0) + 1;
    let html = '';
    for (let r = 2; r <= 16; r++) {
      const total = r >= 15 ? 2 : 8;
      const left = Math.max(0, total - (this.playedCounts[r] || 0) - (myCount[r] || 0));
      const cls = left === 0 ? ' depleted' : '';
      const lvl = r === this.currentLevel ? ' is-level' : '';
      html += `<div class="cc-cell${cls}${lvl}"><span class="cc-rank">${names[r]}</span><span class="cc-left">${left}</span></div>`;
    }
    grid.innerHTML = html;
  }

  // ====== 画面切换 ======
  showScreen(screenName) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(`${screenName}-screen`).classList.add('active');
    this.currentScreen = screenName;
  }

  // ====== 大厅 ======
  setLobbyStatus(text) {
    document.getElementById('lobby-status').textContent = text;
  }

  // ====== 房间 ======
  showRoom(roomId) {
    this.showScreen('room');
    document.getElementById('room-id-display').textContent = roomId;
  }

  updateRoomPlayers(players, mySeat) {
    this.mySeat = mySeat;
    for (let i = 0; i < 4; i++) {
      const seatEl = document.getElementById(`seat-${i}`);
      const player = players[i];

      seatEl.className = 'seat-card';

      if (player) {
        seatEl.classList.add('occupied');
        // 如果是机器人，显示特定头像
        if (player.isNPC) {
          seatEl.querySelector('.seat-avatar').textContent = '🤖';
          seatEl.querySelector('.seat-name').textContent = `${player.nickname} (${this.getDifficultyLabel(player.level)})`;
        } else {
          seatEl.querySelector('.seat-avatar').textContent = i === mySeat ? '🙋' : '👤';
          seatEl.querySelector('.seat-name').textContent = player.nickname || `玩家${i + 1}`;
        }

        let statusHtml = '';
        if (player.ready) {
          seatEl.classList.add('ready');
          statusHtml = '✅ 已准备';
        } else {
          statusHtml = '等待准备...';
        }

        // 如果是机器人且我是房主，显示移除按钮
        const isHost = mySeat === 0;
        if (player.isNPC && isHost) {
          statusHtml += `
            <div class="npc-actions" style="margin-top: 5px;">
              <button class="btn btn-tiny btn-danger" onclick="gameUI.requestRemoveNPC(${i})">移除</button>
            </div>
          `;
        }
        seatEl.querySelector('.seat-status').innerHTML = statusHtml;

        if (i === mySeat) {
          seatEl.classList.add('me');
        }
      } else {
        seatEl.querySelector('.seat-avatar').textContent = '👤';
        seatEl.querySelector('.seat-name').textContent = '等待加入...';
        
        // 房主可以看到“添加机器人”按钮
        const isHost = players[mySeat] && mySeat === 0; // 简单协议: seat 0 是房主
        if (isHost) {
          seatEl.querySelector('.seat-status').innerHTML = `
            <div class="npc-selection">
              <div style="font-size:11px; margin-bottom:4px; color: var(--text-muted);">添加机器人</div>
              <div class="btn-group">
                <button class="btn btn-tiny btn-secondary" onclick="gameUI.confirmAddNPC('noob', ${i})">小白</button>
                <button class="btn btn-tiny btn-secondary" onclick="gameUI.confirmAddNPC('normal', ${i})">普通</button>
                <button class="btn btn-tiny btn-secondary" onclick="gameUI.confirmAddNPC('expert', ${i})">专家</button>
              </div>
            </div>
          `;
        } else {
          seatEl.querySelector('.seat-status').textContent = '';
        }
      }
    }
  }

  confirmAddNPC(level, seatIndex) {
    window.gameSocket.addNPC(level, seatIndex);
  }

  getDifficultyLabel(level) {
    const labels = { noob: '小白', normal: '普通', expert: '专家' };
    return labels[level] || '普通';
  }

  requestRemoveNPC(seatIndex) {
    if (confirm('确定要移除这个机器人吗？')) {
      window.gameSocket.removeNPC(seatIndex);
    }
  }

  showStartButton(isHost) {
    const btn = document.getElementById('start-game-btn');
    btn.style.display = isHost ? 'inline-flex' : 'none';
  }

  // ====== 游戏界面 ======
  startGame(hand, mySeat, currentLevel, team1Level, team2Level) {
    this.showScreen('game');
    this.myHand = hand;
    this.mySeat = mySeat;
    this.selectedCardIds.clear();
    this.lastPlayedCards = {};
    if (currentLevel !== undefined) this.currentLevel = currentLevel;

    this.updateLevelDisplay(currentLevel, team1Level, team2Level);

    // v1.2 发牌动画：dealing class 触发 stagger 入场，动画结束后移除
    const handArea = document.getElementById('hand-area');
    if (handArea) {
      handArea.classList.add('dealing');
      clearTimeout(this._dealingTimer);
      this._dealingTimer = setTimeout(() => handArea.classList.remove('dealing'), 1400);
    }

    this.renderMyHand();
    this.clearAllPlayed();
    this.resetCardCounter();   // v1.3 新局重置记牌器
  }

  updateLevelDisplay(currentLevel, team1Level, team2Level) {
    const rankNames = { 2:'2', 3:'3', 4:'4', 5:'5', 6:'6', 7:'7', 8:'8', 9:'9', 10:'10', 11:'J', 12:'Q', 13:'K', 14:'A' };
    document.getElementById('team1-level').textContent = `🔴 ${rankNames[team1Level] || team1Level}`;
    document.getElementById('team2-level').textContent = `🔵 ${rankNames[team2Level] || team2Level}`;
    document.getElementById('current-level-badge').textContent = `级牌: ${rankNames[currentLevel] || currentLevel}`;
  }

  renderMyHand() {
    const container = document.getElementById('hand-area');
    window.CardRenderer.renderHand(container, this.myHand, this.selectedCardIds);
  }

  toggleCardSelection(cardId) {
    // review-P2 修复：用户开始操作即终止发牌入场动画（否则重渲染触发 27 张牌重播 + 选中抬升被压制）
    const ha = document.getElementById('hand-area');
    if (ha?.classList.contains('dealing')) {
      ha.classList.remove('dealing');
      clearTimeout(this._dealingTimer);
    }
    if (this.selectedCardIds.has(cardId)) {
      this.selectedCardIds.delete(cardId);
    } else {
      this.selectedCardIds.add(cardId);
    }
    this.renderMyHand();
  }

  getSelectedCardIds() {
    return [...this.selectedCardIds];
  }

  clearSelection() {
    this.selectedCardIds.clear();
    this.renderMyHand();
  }

  // 理牌：按点数排序（小到大），同点数按花色排，大小王排最后
  sortHand() {
    this.myHand.sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      return a.suit - b.suit;
    });
    this.selectedCardIds.clear();
    this.renderMyHand();
  }

  // 从手牌中移除已出的牌
  removeCardsFromHand(cardIds) {
    this.myHand = this.myHand.filter(c => !cardIds.includes(c.id));
    this.selectedCardIds.clear();
    this.renderMyHand();
    this.renderCardCounter();   // v1.3 我手牌变化后刷新记牌器
  }

  // 显示某个玩家出的牌
  // Phase 3 任务 3.2：改造为飞入中央舞台对应象限，每张牌错开 40ms
  // Phase 3 任务 3.3：新出牌时其他 quadrant 立即淡出；本 quadrant 排 2500ms 自动淡出
  showPlayedCards(seat, cards, handType) {
    this.lastPlayedCards[seat] = { cards, handType };
    const position = this.getPlayerPosition(seat);  // 'bottom' | 'top' | 'left' | 'right'

    // 任务 3.3：新出牌触发其他 quadrant 立即淡出（"下家出牌后，前一手立即淡出"）
    ['bottom', 'top', 'left', 'right'].forEach(pos => {
      if (pos !== position) this.fadeOutQuadrant(pos);
    });

    // 渲染目标改为中央舞台的对应 quadrant
    const stageContainer = document.getElementById(`stage-${position}`);
    if (stageContainer) {
      // 任务 3.3：取消当前 quadrant 的全部旧 timer（fade + clear）+ 移除 fading-out class
      this._clearQuadrantTimers(position);
      stageContainer.classList.remove('fading-out');

      window.CardRenderer.renderPlayedCards(stageContainer, cards);

      // 给每张牌加 fly-from-${position} class + 错开 40ms 的 animation-delay
      const cardEls = stageContainer.querySelectorAll('.card');
      cardEls.forEach((cardEl, i) => {
        cardEl.classList.add(`flying-from-${position}`);
        cardEl.style.animationDelay = `${i * 40}ms`;
      });

      // 任务 3.3：2500ms 后自动淡出（duration-linger）
      this.quadrantFadeTimers[position] = { fade: setTimeout(() => this.fadeOutQuadrant(position), 2500), clear: null };
    }

    // 中央 play-info 仍显示文字（保持 task 3.3 之前的兼容性）
    // review-P1 修复：动画重启——移除 .zoom → 强制 reflow → 重加，每手牌都能播
    const centerInfo = document.getElementById('play-info');
    const playerName = this.getPlayerName(seat);
    centerInfo.textContent = `${playerName}: ${handType}`;
    centerInfo.classList.remove('zoom');
    void centerInfo.offsetWidth;
    centerInfo.classList.add('zoom');

    // 炸弹特效
    if (handType.includes('炸') || handType.includes('同花顺')) {
      this.triggerBombEffect();
    }
  }

  // Phase 3 任务 3.3：淡出指定象限（duration-normal 250ms 后清空容器）
  // review-P2 修复：内层清空 timer 也保存句柄（原先不可取消 → 接风快出牌时新牌被瞬间抹掉）
  fadeOutQuadrant(position) {
    const stageContainer = document.getElementById(`stage-${position}`);
    if (!stageContainer || stageContainer.children.length === 0) return;

    this._clearQuadrantTimers(position);
    stageContainer.classList.add('fading-out');

    const clearTimer = setTimeout(() => {
      if (stageContainer.classList.contains('fading-out')) {
        stageContainer.innerHTML = '';
        stageContainer.classList.remove('fading-out');
      }
      this.quadrantFadeTimers[position] = null;
    }, 250);
    this.quadrantFadeTimers[position] = { fade: null, clear: clearTimer };
  }

  _clearQuadrantTimers(position) {
    const t = this.quadrantFadeTimers[position];
    if (!t) return;
    if (typeof t === 'object') { clearTimeout(t.fade); clearTimeout(t.clear); }
    else clearTimeout(t);
    this.quadrantFadeTimers[position] = null;
  }

  // review-P1：一圈结束的软清——各象限淡出（替代瞬间硬清，保住赢家制胜牌的视觉余韵）
  softClearStage() {
    ['bottom', 'top', 'left', 'right'].forEach(pos => this.fadeOutQuadrant(pos));
    document.getElementById('play-info').textContent = '';
  }

  triggerBombEffect() {
    const el = document.getElementById('bomb-effect');
    if (!el) return;

    el.classList.remove('animate');
    void el.offsetWidth; // 触发重绘
    el.classList.add('animate');

    // 可以在这里添加震屏效果
    const gameScreen = document.getElementById('game-screen');
    gameScreen.classList.add('shake');
    setTimeout(() => gameScreen.classList.remove('shake'), 500);
  }

  // review 修复：pass 反馈统一进中央舞台 quadrant（原先写到已废弃的 played-{pos} 容器，
  // 自己 pass 时写到不存在的 #played-bottom 被静默吞掉 → 点"不出"零反馈）
  showPass(seat) {
    const position = this.getPlayerPosition(seat);
    const q = document.getElementById(`stage-${position}`);
    if (!q) return;
    q.classList.remove('fading-out');
    q.innerHTML = '<span class="pass-chip">不出</span>';
    // 1.5s 后自动淡出
    if (this.quadrantFadeTimers[position]) {
      const t = this.quadrantFadeTimers[position];
      clearTimeout(t.fade ?? t); clearTimeout(t.clear);
    }
    this.quadrantFadeTimers[position] = { fade: setTimeout(() => this.fadeOutQuadrant(position), 1500), clear: null };
  }

  clearAllPlayed() {
    ['top', 'left', 'right'].forEach(pos => {
      const el = document.getElementById(`played-${pos}`);
      if (el) el.innerHTML = '';
    });
    // Phase 3 任务 3.2：同时清掉新的中央舞台 4 quadrant（跨局/重新发牌时）
    // Phase 3 任务 3.3：同时清掉所有自动淡出 timer，避免跨局残留
    ['bottom', 'top', 'left', 'right'].forEach(pos => {
      this._clearQuadrantTimers(pos);
      const el = document.getElementById(`stage-${pos}`);
      if (el) {
        el.innerHTML = '';
        el.classList.remove('fading-out');
      }
    });
    document.getElementById('play-info').textContent = '';
  }

  // 更新其他玩家的手牌数量
  updateOtherPlayerCount(seat, count) {
    const position = this.getPlayerPosition(seat);
    const countEl = document.getElementById(`player-${position}-count`);
    if (countEl) {
      countEl.textContent = count === -1 ? '10+' : count;
    }
  }

  // 更新轮次高亮
  updateTurnHighlight(currentTurn) {
    // Phase 3 任务 3.1：检测"非我 → 我"切换瞬间，用于触发出牌按钮涌现
    const wasMyTurn = this.isMyTurn;
    this.isMyTurn = currentTurn === this.mySeat;

    // 移除所有高亮
    document.querySelectorAll('.player-info').forEach(el => el.classList.remove('active-turn'));

    if (currentTurn === this.mySeat) {
      // 高亮自己
      this.showMessage('轮到你出牌！');
    } else {
      const position = this.getPlayerPosition(currentTurn);
      const infoEl = document.querySelector(`#player-${position} .player-info`);
      if (infoEl) infoEl.classList.add('active-turn');
    }

    // review-P1 修复：禁用下放到出牌/不出两个按钮——理牌/托管随时可点（原先整组
    // pointer-events:none 导致托管几乎关不掉、NPC 思考期间无法理牌）
    const actionBtns = document.getElementById('action-buttons');
    actionBtns.style.opacity = this.isMyTurn ? '1' : '0.6';
    actionBtns.style.pointerEvents = 'auto';
    const playBtn = document.getElementById('play-btn');
    const passBtn = document.getElementById('pass-btn');
    const hintBtn = document.getElementById('hint-btn');
    if (playBtn) playBtn.disabled = !this.isMyTurn;
    if (passBtn) passBtn.disabled = !this.isMyTurn;
    if (hintBtn) hintBtn.disabled = !this.isMyTurn;   // 提示只在我回合有意义

    // Phase 3 任务 3.1：我的回合刚开始时，出牌按钮一次性涌现（scale 1.04→1.0 spring）
    if (this.isMyTurn && !wasMyTurn) {
      const playBtn = document.getElementById('play-btn');
      if (playBtn) {
        playBtn.classList.remove('summon');
        // 强制 reflow，确保即使连续两次"非我→我"也能重启动画（仿照 triggerBombEffect 的模式）
        void playBtn.offsetWidth;
        playBtn.classList.add('summon');
      }
    }
  }

  // 更新玩家名称
  updatePlayerNames(players) {
    for (let i = 0; i < 4; i++) {
      if (i === this.mySeat || !players[i]) continue;
      const position = this.getPlayerPosition(i);
      const nameEl = document.getElementById(`player-${position}-name`);
      if (nameEl) {
        nameEl.textContent = players[i].nickname || `玩家${i + 1}`;
      }
    }
  }

  // 获取座位相对于自己的位置
  getPlayerPosition(seat) {
    const relative = (seat - this.mySeat + 4) % 4;
    const posMap = { 0: 'bottom', 1: 'right', 2: 'top', 3: 'left' };
    return posMap[relative];
  }

  getPlayerName(seat) {
    const position = this.getPlayerPosition(seat);
    if (position === 'bottom') return '我';
    const nameEl = document.getElementById(`player-${position}-name`);
    return nameEl ? nameEl.textContent : `玩家${seat + 1}`;
  }

  // 显示消息
  // review-P1 修复：管理 timer——原先上一条消息的 setTimeout 会提前清掉后续消息（错误提示闪没）
  showMessage(text, duration = 2000) {
    const el = document.getElementById('game-message');
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(this._msgTimer);
    this._msgTimer = setTimeout(() => el.classList.remove('show'), duration);
  }

  // ====== 结算弹窗 ======
  showRoundResult(data) {
    const rankNames = { 2:'2',3:'3',4:'4',5:'5',6:'6',7:'7',8:'8',9:'9',10:'10',11:'J',12:'Q',13:'K',14:'A' };
    const medals = ['🥇','🥈','🥉','4️⃣'];
    const teamOf = seat => (seat === 0 || seat === 2) ? 'team1' : 'team2';

    // 描述行
    document.getElementById('result-desc').textContent = data.description || '';

    // 名次列表
    const ranksEl = document.getElementById('result-ranks');
    ranksEl.innerHTML = data.finishOrder.map((seat, idx) => {
      const name = seat === this.mySeat ? '你' : this.getPlayerName(seat);
      const team = teamOf(seat);
      return `<div class="result-rank-item rank-${idx + 1}">
        <span class="rank-medal">${medals[idx]}</span>
        <span class="rank-team-dot ${team}"></span>
        <span class="rank-name">${name}</span>
      </div>`;
    }).join('');

    // 等级变化
    const levelsEl = document.getElementById('result-levels');
    const makeBlock = (label, oldLv, newLv, upgrade) => {
      const oldStr = oldLv !== null ? `<span class="level-old">${rankNames[oldLv]||oldLv}</span><span class="level-arrow">→</span>` : '';
      const newStr = `<span class="level-new">${rankNames[newLv]||newLv}</span>`;
      const badge = upgrade > 0
        ? `<span class="upgrade-badge up">+${upgrade}级</span>`
        : `<span class="upgrade-badge same">持平</span>`;
      return `<div class="level-change-block">
        <div class="level-change-label">${label}</div>
        <div class="level-change-value">${oldStr}${newStr}</div>
        ${badge}
      </div>`;
    };
    levelsEl.innerHTML =
      makeBlock('🔴 队伍A', this.prevTeam1Level, data.team1Level, data.team1Upgrade || 0) +
      makeBlock('🔵 队伍B', this.prevTeam2Level, data.team2Level, data.team2Upgrade || 0);

    // 炸弹数
    document.getElementById('result-bombs').textContent = `💣 本局炸弹：${data.bombCount || 0}`;

    document.getElementById('result-overlay').style.display = 'flex';
  }

  hideRoundResult() {
    document.getElementById('result-overlay').style.display = 'none';
  }

  // 更新顶部积分面板（每局结束时调用）
  updateScorePanel(data) {
    this.prevTeam1Level = data.team1Level - (data.team1Upgrade || 0);
    this.prevTeam2Level = data.team2Level - (data.team2Upgrade || 0);
    const rankNames = { 2:'2',3:'3',4:'4',5:'5',6:'6',7:'7',8:'8',9:'9',10:'10',11:'J',12:'Q',13:'K',14:'A' };
    document.getElementById('team1-level').textContent = `🔴 ${rankNames[data.team1Level] || data.team1Level}`;
    document.getElementById('team2-level').textContent = `🔵 ${rankNames[data.team2Level] || data.team2Level}`;
  }

  // 开始新一局时递增局数
  incrementRound() {
    this.roundCount++;
    const badge = document.getElementById('round-badge');
    if (badge) badge.textContent = `第${this.roundCount}局`;
  }

  // 显示还贡 UI（赢家选一张牌还给输家）
  showReturnTributeUI(data) {
    const overlay = document.getElementById('tribute-overlay');
    const title = document.getElementById('tribute-title');
    const desc = document.getElementById('tribute-desc');
    const hint = document.getElementById('tribute-hint-text');
    const receivedArea = document.getElementById('tribute-received');
    const receivedCards = document.getElementById('tribute-received-cards');
    const handArea = document.getElementById('tribute-hand');
    if (!overlay) return;

    this._returnPairMap = data.pairMap || null;   // review: 同队判定用
    const isReturner = data.fromSeats?.includes(this.mySeat);
    if (!isReturner) {
      title.textContent = '等待还贡...';
      desc.textContent = '赢家正在选择还贡的牌';
      hint.textContent = '';
      handArea.innerHTML = '';
      receivedArea.style.display = 'none';
      overlay.style.display = 'flex';
      return;
    }

    title.textContent = '还贡：选一张牌还给输家';
    desc.textContent = '请从手牌中选一张（不能是级牌）还给对方';
    hint.textContent = '还贡规则：不能用级牌还贡';

    // 展示收到的进贡牌（informational）
    if (data.tributeCards && data.tributeCards.length > 0) {
      receivedArea.style.display = 'flex';
      receivedCards.innerHTML = '';
      data.tributeCards.forEach(card => {
        const el = window.CardRenderer.createCardElement(card, { played: true });
        receivedCards.appendChild(el);
      });
    } else {
      receivedArea.style.display = 'none';
    }

    // 渲染自己的手牌供还贡选择
    // review-P0 修复：① 同队还贡（1+4 场景）预过滤 >10 的牌并写明规则 ② 点击后不再立即关弹窗，
    // 等 RETURN_DONE 确认才关（原先被 engine 拒绝后弹窗回不来 → 永久卡死）
    handArea.innerHTML = '';
    const currentLevel = this.currentLevel;
    const giver = this._returnPairMap?.[this.mySeat];
    const sameTeam = giver !== undefined && (giver % 2) === (this.mySeat % 2);
    const hasLegalSmall = this.myHand.some(c => c.rank <= 10 && c.rank !== currentLevel);
    if (sameTeam && hasLegalSmall) {
      hint.textContent = '还贡规则：还给己方搭档的牌必须是 10 以下（含10）且非级牌';
    }
    this.myHand.forEach(card => {
      const el = window.CardRenderer.createCardElement(card);
      const illegal = card.rank === currentLevel
        || (sameTeam && hasLegalSmall && card.rank > 10);
      if (illegal) {
        el.style.opacity = '0.35';
        el.title = card.rank === currentLevel ? '级牌不能用于还贡' : '还给搭档必须是 10 以下（含10）';
      } else {
        el.style.cursor = 'pointer';
        el.addEventListener('click', () => {
          window.gameSocket.send({ type: 'RETURN_TRIBUTE', cardId: card.id });
          // 不关弹窗：等 RETURN_DONE（app.js 监听）确认后关闭；被拒则弹窗仍在可重选
        });
      }
      handArea.appendChild(el);
    });

    overlay.style.display = 'flex';
  }

  /* ════════ v2.4 复盘面板 ════════ */

  /** 打开复盘：data = REPLAY_DATA.log（按局数组） */
  showReplay(log) {
    this._replayLog = log || [];
    this._replayFlags = this._replayFlags || new Set();   // 'round:idx' 标记集
    const overlay = document.getElementById('replay-overlay');
    if (!overlay) return;
    overlay.style.display = 'flex';
    this._renderReplayTabs();
    const last = this._replayLog.length - 1;
    this._renderReplayRound(last >= 0 ? last : 0);
  }

  hideReplay() {
    const overlay = document.getElementById('replay-overlay');
    if (overlay) overlay.style.display = 'none';
  }

  _renderReplayTabs() {
    const tabs = document.getElementById('replay-round-tabs');
    tabs.innerHTML = '';
    this._replayLog.forEach((r, i) => {
      const b = document.createElement('button');
      b.className = 'replay-tab';
      b.textContent = `第${r.round}局`;
      b.addEventListener('click', () => this._renderReplayRound(i));
      tabs.appendChild(b);
    });
  }

  _seatName(seat) {
    if (seat === this.mySeat) return '你';
    return this.getPlayerName(seat);
  }

  _miniCards(cards, currentLevel) {
    // cards: [{r,s}] 精简格式 → 小牌面 HTML
    const suitChar = { 1: '♥', 2: '♦', 3: '♣', 4: '♠' };
    const rankChar = (r) => r === 16 ? '大王' : r === 15 ? '小王' : ({ 11: 'J', 12: 'Q', 13: 'K', 14: 'A' }[r] || r);
    return (cards || []).map(c => {
      const red = c.r >= 15 ? (c.r === 16 ? 'rj' : 'bj') : (c.s === 1 || c.s === 2 ? 'red' : 'black');
      const wild = (c.s === 1 && c.r === currentLevel) ? ' wild' : '';
      const txt = c.r >= 15 ? rankChar(c.r) : `${suitChar[c.s] || ''}${rankChar(c.r)}`;
      return `<span class="mini-card ${red}${wild}">${txt}</span>`;
    }).join('');
  }

  _renderReplayRound(roundIdx) {
    this._replayRoundIdx = roundIdx;
    const r = this._replayLog[roundIdx];
    const list = document.getElementById('replay-list');
    document.querySelectorAll('.replay-tab').forEach((t, i) => t.classList.toggle('active', i === roundIdx));
    if (!r) { list.innerHTML = '<div class="replay-empty">无记录</div>'; return; }
    const lv = r.level;
    const teamOf = (s) => (s % 2 === 0) ? '🔴' : '🔵';

    list.innerHTML = '';
    for (const e of r.entries) {
      const row = document.createElement('div');
      row.className = `replay-row ${e.action}` + (e.seat === ((this.mySeat + 2) % 4) ? ' teammate' : '') + (e.seat === this.mySeat ? ' me' : '');
      const flagKey = `${roundIdx}:${e.idx}`;
      const flagged = this._replayFlags.has(flagKey);
      const prevTxt = e.action === 'play' ? (e.prev ? `压 ${this._seatName(e.prev.seat)}的${e.prev.handType}` : '领牌') : '';
      const npcChips = e.npc?.skills?.length ? e.npc.skills.map(k => `<span class="replay-chip">${k}</span>`).join('') : '';
      const body = e.action === 'pass'
        ? `<span class="replay-pass-label">不出</span>`
        : e.action === 'tribute' || e.action === 'return'
          ? `<span class="replay-trib">${e.handType}</span> ${this._miniCards(e.cards, lv)}`
          : `${this._miniCards(e.cards, lv)} <span class="replay-type">${e.handType}</span>`;
      row.innerHTML = `
        <div class="replay-row-main">
          <span class="replay-no">#${e.idx + 1}</span>
          <span class="replay-seat">${teamOf(e.seat)}${this._seatName(e.seat)}</span>
          ${body}
          <span class="replay-prev">${prevTxt}</span>
          ${npcChips}
          <button class="replay-flag${flagged ? ' on' : ''}" title="标记这手打得不合理">🚩</button>
        </div>`;
      // 展开区（四家手牌 + NPC 理由）
      const detail = document.createElement('div');
      detail.className = 'replay-detail';
      detail.style.display = 'none';
      row.appendChild(detail);

      row.querySelector('.replay-row-main').addEventListener('click', (ev) => {
        if (ev.target.classList.contains('replay-flag')) return;
        const open = detail.style.display !== 'none';
        if (open) { detail.style.display = 'none'; return; }
        if (!detail.dataset.rendered) {
          let html = '';
          if (e.beforeHands) {
            html += '<div class="replay-hands">';
            for (let st = 0; st < 4; st++) {
              html += `<div class="replay-hand-row"><span class="replay-hand-name">${teamOf(st)}${this._seatName(st)}（${e.beforeHands[st].length}张）</span>${this._miniCards(e.beforeHands[st], lv)}</div>`;
            }
            html += '</div>';
          }
          if (e.npc) {
            html += `<div class="replay-npc-reason">🤖 ${e.npc.explanation || ''}${e.npc.notes?.length ? '<br>' + e.npc.notes.join('<br>') : ''}</div>`;
          }
          detail.innerHTML = html || '<div class="replay-empty">（无明细）</div>';
          detail.dataset.rendered = '1';
        }
        detail.style.display = 'block';
      });
      row.querySelector('.replay-flag').addEventListener('click', () => {
        if (this._replayFlags.has(flagKey)) this._replayFlags.delete(flagKey);
        else this._replayFlags.add(flagKey);
        row.querySelector('.replay-flag').classList.toggle('on');
        this._updateFlagCount();
      });
      list.appendChild(row);
    }
    this._updateFlagCount();
  }

  _updateFlagCount() {
    const el = document.getElementById('replay-flag-count');
    if (el) el.textContent = `已标记 ${this._replayFlags?.size || 0} 手`;
  }

  /** 导出标记的手（含完整上下文）→ 返回 JSON 字符串 */
  exportReplayFlags() {
    const out = [];
    for (const key of (this._replayFlags || [])) {
      const [ri, ei] = key.split(':').map(Number);
      const r = this._replayLog[ri];
      const e = r?.entries?.[ei];
      if (!e) continue;
      out.push({
        round: r.round, level: r.level, entryIdx: e.idx,
        seat: e.seat, seatName: this._seatName(e.seat), action: e.action,
        cards: e.cards, handType: e.handType, prev: e.prev,
        beforeHands: e.beforeHands, npc: e.npc,
        // 前后 3 手上下文（看牌局走向）
        context: r.entries.slice(Math.max(0, e.idx - 3), e.idx + 4)
          .map(x => ({ idx: x.idx, seat: x.seat, action: x.action, cards: x.cards, handType: x.handType })),
      });
    }
    return JSON.stringify({ exportedAt: new Date().toISOString(), flags: out }, null, 1);
  }

  // 关闭进贡弹窗
  hideTributeUI() {
    const overlay = document.getElementById('tribute-overlay');
    if (overlay) overlay.style.display = 'none';
    const receivedArea = document.getElementById('tribute-received');
    if (receivedArea) receivedArea.style.display = 'none';
  }

  showGameOver(winner, finalLevel) {
    const overlay = document.getElementById('gameover-overlay');
    const title = document.getElementById('gameover-title');
    const details = document.getElementById('gameover-details');

    const myTeam = (this.mySeat === 0 || this.mySeat === 2) ? 'team1' : 'team2';
    const isWinner = winner === myTeam;

    title.textContent = isWinner ? '🎉 胜利！' : '😢 失败...';
    details.textContent = `${winner === 'team1' ? '🔴 队伍A' : '🔵 队伍B'} 率先打到 A，获得胜利！`;

    overlay.style.display = 'flex';
  }

  hideGameOver() {
    document.getElementById('gameover-overlay').style.display = 'none';
  }
}

window.gameUI = new GameUI();
