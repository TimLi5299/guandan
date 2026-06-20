/**
 * app.js — 掼蛋客户端入口
 *
 * 连接 WebSocket，绑定事件处理，协调 UI 和网络。
 */

(function () {
  let socket; // 延迟绑定，因为 loopback 是 ES module 异步加载
  const ui = window.gameUI;
  const isStaticHost = !!window.__GUANDAN_STATIC_HOST__;

  // P1.2：?debug=1 模式开关——通过 body class 让 CSS 控制信息泡显隐
  const isDebugMode = location.search.includes('debug=1');
  if (isDebugMode) {
    document.body.classList.add('debug-mode');
    console.log('[NPC] 调试模式已开启（?debug=1），NPC 决策信息泡将在每次出牌时显示');
  }

  // ====== v1.3 托管 + 读秒 ======
  let autoPlay = false;        // 托管开关
  const hintCache = { key: null, idx: 0 };   // review: 提示循环游标
  let turnTimerId = null;      // 读秒 interval
  const TURN_SECONDS = 20;

  function autoPlayOneHand() {
    // v2.0.1 修复：托管改走真 NPC 引擎（expert 档代打），不再用 hint[0]（最小单张）
    socket.send({ type: 'AUTO_PLAY' });
  }

  function stopTurnTimer() {
    if (turnTimerId) { clearInterval(turnTimerId); turnTimerId = null; }
    const el = document.getElementById('turn-timer');
    if (el) el.style.display = 'none';
  }

  function startTurnTimer() {
    stopTurnTimer();
    const el = document.getElementById('turn-timer');
    if (!el) return;
    let left = TURN_SECONDS;
    el.style.display = '';
    el.textContent = left;
    el.classList.remove('urgent');
    turnTimerId = setInterval(() => {
      left--;
      el.textContent = left;
      if (left <= 5) el.classList.add('urgent');
      if (left <= 0) {
        stopTurnTimer();
        ui.showMessage('超时，自动出牌', 1500);
        autoPlayOneHand();   // 超时自动打一手
      }
    }, 1000);
  }

  // ====== v1.3 本地战绩 + 段位 ======
  const STATS_KEY = 'guandan_stats';
  function loadStats() {
    try { return JSON.parse(localStorage.getItem(STATS_KEY)) || { games: 0, wins: 0, points: 0 }; }
    catch (e) { return { games: 0, wins: 0, points: 0 }; }
  }
  function rankOf(points) {
    if (points >= 500) return '💎 钻石';
    if (points >= 250) return '🏆 铂金';
    if (points >= 100) return '🥇 黄金';
    if (points >= 30)  return '🥈 白银';
    return '🥉 青铜';
  }
  function refreshStatsUI() {
    const s = loadStats();
    const wrap = document.getElementById('player-stats');
    if (!wrap) return;
    if (s.games === 0) { wrap.style.display = 'none'; return; }
    wrap.style.display = '';
    document.getElementById('stats-rank').textContent = rankOf(s.points);
    const rate = Math.round(s.wins / s.games * 100);
    document.getElementById('stats-record').textContent = `${s.games} 场 · 胜率 ${rate}% · 积分 ${s.points}`;
  }
  function recordGameResult(didWin) {
    const s = loadStats();
    s.games++;
    if (didWin) { s.wins++; s.points += 10; }
    else s.points = Math.max(0, s.points - 5);
    try { localStorage.setItem(STATS_KEY, JSON.stringify(s)); } catch (e) {}
    refreshStatsUI();
  }

  // ====== 单人模式配置 ======
  let appMode = 'solo';   // 'solo' | 'multi'
  let isSoloLaunch = false;

  // 技能 ID 列表（与 SkillProfiles.js 对应）
  const ALL_SKILL_IDS = [
    'r1_yield', 'r2_bomb_timing', 'r3_decomp_quality', 'r4_memory',
    'r5_level_guard', 'r6_opponent_infer', 'r7_signal', 'r8_endgame', 'r9_lead_score',
    'r10_adaptive_lead', 'r11_wild_decomp', 'r12_hold_back', 'r13_exit_plan', 'r14_seq_guard', 'r15_triple_guard',
    's1_endgame_search',
  ];
  const EXPERT_SKILLS = ALL_SKILL_IDS.filter(s => s !== 'r5_level_guard' && s !== 's1_endgame_search');
  const PROFILE_SKILLS = {
    expert:   EXPERT_SKILLS,                                  // 14 规则,无搜索
    expertS2: [...EXPERT_SKILLS, 's2_endgame_exact'],         // 规则 + S2 残局精算
    master:   ['r1_yield', 'r2_bomb_timing', 'r3_decomp_quality', 'r9_lead_score',
               'r10_adaptive_lead', 'r11_wild_decomp', 'r12_hold_back', 's1_endgame_search',
               's2_endgame_exact', 'r16_min_tricks', 's3_midgame_sim'],  // 全搜索（须与 SkillProfiles.master 同步）
  };
  // 5 档难度（胜率台标定：统一 expert 基础 + 失误率梯度,顶档加搜索）
  // 失误率 = 以该概率随机出牌（"会打但偶尔送",比纯随机更有意思）。台阶 75~82% 单调可感知。
  const DIFFICULTY = {
    newbie:   { label: '新手', icon: '🐣', desc: '会打牌但常失误，新手能赢',   skills: 'expert',   error: 0.55 },
    casual:   { label: '休闲', icon: '🎲', desc: '偶尔失误，有来有回',         skills: 'expert',   error: 0.35 },
    advanced: { label: '进阶', icon: '🎯', desc: '很少失误，要动脑',           skills: 'expert',   error: 0.15 },
    pro:      { label: '高手', icon: '🧠', desc: '残局会精算，难缠',           skills: 'expertS2', error: 0 },
    master:   { label: '大师', icon: '👑', desc: '全程搜索，顶级水平',         skills: 'master',   error: 0 },
  };
  const PROFILE_LABELS = Object.fromEntries(Object.entries(DIFFICULTY).map(([k, v]) => [k, v.label]));
  const SKILL_INFO = [
    { id: 'r1_yield',          label: '让队友',   desc: '队友领牌时主动让路' },
    { id: 'r2_bomb_timing',    label: '炸弹时机', desc: '对手快赢时精准用炸' },
    { id: 'r3_decomp_quality', label: '拆牌优化', desc: '跟牌选破坏最小方案' },
    { id: 'r4_memory',         label: '记牌',     desc: '记住场上已出的牌' },
    { id: 'r5_level_guard',    label: '护大牌',   desc: '不轻易消耗级牌/万能牌' },
    { id: 'r6_opponent_infer', label: '读对手',   desc: '推断对手无法应对的牌' },
    { id: 'r7_signal',         label: '传信号',   desc: '出牌时向队友暗示强弱' },
    { id: 'r8_endgame',        label: '残局',     desc: '少牌时精确规划出牌' },
    { id: 'r9_lead_score',     label: '出牌评分', desc: '评分挑选最优领牌' },
    { id: 'r10_adaptive_lead', label: '形势感知', desc: '按局势动态调整领牌策略' },
    { id: 'r11_wild_decomp',   label: '万能拆牌', desc: '利用万能牌填补顺子缺口' },
    { id: 'r12_hold_back',     label: '忍牌保型', desc: '避免破坏关键组合，适时不出' },
    { id: 'r13_exit_plan',     label: '出口规划', desc: '快要赢时优先留下无敌后手，加速清手' },
    { id: 's2_endgame_exact',  label: '残局精算', desc: '残局推演所有可能，找到必胜路线' },
    { id: 'r16_min_tricks',    label: '全局算账', desc: '精确计算最少几手出完，拆牌不再凭感觉' },
    { id: 's3_midgame_sim',    label: '中盘推演', desc: '中盘模拟数百种牌局走向，明显更优时改判' },
    { id: 'r14_seq_guard',     label: '顺子保护', desc: '跟牌时避免用顺子破坏手型，留作主动领牌' },
    { id: 'r15_triple_guard',  label: '三张保护', desc: '跟牌时避免拆散三带二组合，保留复合牌型' },
    { id: 's1_endgame_search', label: '残局制胜', desc: '残局探测确定性胜利路径（大师档专属）' },
  ];

  // 每个 NPC 座位的当前配置（seat → { profile, customSkills }）
  const soloConfig = {
    2: { profile: 'advanced' },  // 队友
    1: { profile: 'advanced' },  // 对手一
    3: { profile: 'advanced' },  // 对手二
  };

  /** 返回某座位的 skillProfile 数组（按难度档对应的技能集） */
  function getSeatSkillArray(seat) {
    const d = DIFFICULTY[soloConfig[seat].profile] || DIFFICULTY.advanced;
    return [...PROFILE_SKILLS[d.skills]];
  }

  /** 返回某座位的 level 字符串（5 档统一以 expert 引擎运行，差异由 skills 数组 + errorRate 表达） */
  function getSeatLevel(seat) {
    return 'expert';
  }

  /** 返回某座位的失误率（难度旋钮） */
  function getSeatError(seat) {
    const d = DIFFICULTY[soloConfig[seat].profile] || DIFFICULTY.advanced;
    return d.error;
  }
  function _unusedLevelTail(seat) {
    const cfg = soloConfig[seat];
    if (cfg.profile === 'master') return 'expert';
    return cfg.profile;
  }

  /** 初始化技能面板 DOM（在 bindUIEvents 之后调用一次） */
  function initSkillPanels() {
    for (const seat of [1, 2, 3]) {
      const panel = document.getElementById(`skill-panel-${seat}`);
      if (!panel) continue;
      panel.innerHTML = `<div class="skill-panel-title">⚙️ 自选技能</div>
        <div class="skill-grid">${SKILL_INFO.map(s => `
          <label class="skill-item">
            <input type="checkbox" class="skill-checkbox" data-seat="${seat}" data-skill="${s.id}">
            <span><span class="skill-item-label">${s.label}</span><span class="skill-item-desc">${s.desc}</span></span>
          </label>`).join('')}
        </div>`;
      // 绑定 checkbox 变化
      panel.querySelectorAll('.skill-checkbox').forEach(cb => {
        cb.addEventListener('change', () => {
          const s = parseInt(cb.dataset.seat);
          const skill = cb.dataset.skill;
          const skills = soloConfig[s].customSkills;
          if (cb.checked) { if (!skills.includes(skill)) skills.push(skill); }
          else { const idx = skills.indexOf(skill); if (idx >= 0) skills.splice(idx, 1); }
        });
      });
    }
  }

  /** 切换某座位的难度档（更新 UI + 状态） */
  function selectProfile(seat, profile, prevProfile) {
    soloConfig[seat].profile = profile;
    const nameEl = document.getElementById(`slot-name-${seat}`);
    if (nameEl) nameEl.textContent = PROFILE_LABELS[profile] || profile;
    const descEl = document.getElementById(`slot-desc-${seat}`);
    if (descEl) descEl.textContent = DIFFICULTY[profile]?.desc || '';
  }

  // 等 gameSocket 就绪（loopback 是 ES module，异步注册到 window）
  async function waitForSocket() {
    if (window.gameSocket) return window.gameSocket;
    return new Promise((resolve) => {
      const tryGet = () => {
        if (window.gameSocket) resolve(window.gameSocket);
        else setTimeout(tryGet, 50);
      };
      window.addEventListener('gameSocketReady', () => resolve(window.gameSocket), { once: true });
      tryGet();
    });
  }

  // ====== 初始化 ======
  async function init() {
    socket = await waitForSocket();
    bindSocketEvents();
    bindUIEvents();

    if (isStaticHost) {
      // 静态模式：本地 loopback 服务器
      try {
        await socket.connect('loopback');
        ui.setLobbyStatus('🦞 本地模式 · 选择 NPC 配置后点击「开始对战」');
        // v1.1 断局恢复：检测存档，显示"继续上一局"
        if (socket.hasSave?.()) {
          const btn = document.getElementById('resume-game-btn');
          if (btn) btn.style.display = '';
        }
      } catch (e) {
        ui.setLobbyStatus('本地引擎初始化失败');
      }
    } else {
      // 真服务器
      try {
        const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${proto}//${window.location.host}`;
        await socket.connect(wsUrl);
        ui.setLobbyStatus('已连接到服务器 ✅');
      } catch (e) {
        ui.setLobbyStatus('连接服务器失败 ❌ 请刷新重试');
      }
    }
  }

  // ====== WebSocket 事件 ======
  function bindSocketEvents() {
    socket.on('LOGIN_OK', (msg) => {
      socket.playerId = msg.playerId;
      socket.nickname = msg.nickname;
      ui.setLobbyStatus(`欢迎, ${msg.nickname}! 创建或加入房间吧`);
      // 如果是点击教程按钮触发的登录，自动开始对应课程
      if (socket.pendingLesson) {
        const lessonId = socket.pendingLesson;
        socket.pendingLesson = null;
        socket.send({ type: 'START_TUTORIAL', lessonId });
      }
    });

    socket.on('ROOM_CREATED', (msg) => {
      // 单人模式：跳过房间等待页，直接配置 NPC 并开始
      if (isSoloLaunch) {
        isSoloLaunch = false;
        setTimeout(() => {
          for (const seat of [1, 2, 3]) {
            const level = getSeatLevel(seat);
            const skills = getSeatSkillArray(seat);
            socket.addNPC(level, seat, skills, getSeatError(seat));
          }
          socket.ready();
          setTimeout(() => socket.startGame(), 400);
        }, 150);
        return; // 不跳转到房间页
      }
      // 多人模式：正常进入房间等待页
      ui.showRoom(msg.roomId);
      ui.showStartButton(true);
    });

    socket.on('JOINED_ROOM', (msg) => {
      ui.showRoom(msg.roomId);
      ui.showStartButton(false);
    });

    socket.on('ROOM_UPDATE', (msg) => {
      ui.updateRoomPlayers(msg.players, msg.seat);

      // 在房间页面时检查是否是房主
      if (ui.currentScreen === 'room') {
        // 简单处理: 第一个进来的是房主
        const allReady = msg.players.every(p => p !== null && p.ready);
        const allJoined = msg.players.every(p => p !== null);
        if (allReady && allJoined) {
          ui.showStartButton(true);
        }
      }

      // 如果在游戏中，更新玩家名称
      if (ui.currentScreen === 'game') {
        ui.updatePlayerNames(msg.players);
      }
    });

    socket.on('GAME_START', (msg) => {
      // review-P1 修复：进贡阶段的 GAME_START（发牌看牌选贡）不计局数、不播发牌音——
      // 原先进贡局收到两次 GAME_START，局数每局 +2、发牌动画播两遍
      if (msg.phase !== 'TRIBUTING') {
        ui.incrementRound();
        window.soundManager?.deal();
      }
      ui.startGame(msg.hand, msg.mySeat, msg.currentLevel, msg.team1Level, msg.team2Level);
      // Fix：直接用 GAME_START 里的 currentTurn 激活按钮，不依赖后续 TURN_UPDATE
      if (msg.currentTurn !== undefined) {
        ui.updateTurnHighlight(msg.currentTurn);
      }
    });

    socket.on('TURN_UPDATE', (msg) => {
      // review-P1 修复：新 trick 用淡出软清（原先硬清——赢家的制胜牌瞬间闪没，
      // 然后玩家盯 2 秒空舞台）
      if (msg.isNewTrick) {
        ui.softClearStage();
      }
      ui.updateTurnHighlight(msg.currentTurn);
      // v1.2 音效：轮到我
      if (msg.isMyTurn) window.soundManager?.myTurn();
      // v1.3 托管 / 读秒
      if (msg.isMyTurn) {
        if (autoPlay) {
          stopTurnTimer();
          setTimeout(() => { if (autoPlay) autoPlayOneHand(); }, 900);
        } else {
          startTurnTimer();
        }
      } else {
        stopTurnTimer();
      }
    });

    socket.on('CARDS_PLAYED', (msg) => {
      ui.showPlayedCards(msg.seat, msg.cards, msg.handType);
      ui.trackPlayed(msg.cards);   // v1.3 记牌器累计
      if (msg.seat === ui.mySeat) stopTurnTimer();   // v1.3 我出牌后停读秒

      // v1.2 音效 + 语音播报
      const sm = window.soundManager;
      const isBombType = msg.handType && (msg.handType.includes('炸') || msg.handType.includes('同花顺'));
      if (isBombType) sm?.bomb(); else sm?.playCard();
      sm?.speak(msg.handType || '');

      // 更新其他玩家手牌数
      if (msg.seat !== ui.mySeat) {
        ui.updateOtherPlayerCount(msg.seat, msg.remainingCards);
      } else {
        // 自己出的牌, 更新手牌
        const playedIds = msg.cards.map(c => c.id);
        ui.removeCardsFromHand(playedIds);
      }
    });

    socket.on('PLAYER_PASS', (msg) => {
      // v1.2 音效 + 语音（仅 NPC 的"不出"播报，自己不出不报避免吵）
      window.soundManager?.pass();
      if (msg.seat !== ui.mySeat) window.soundManager?.speak('不出');
      // review-P2 修复：自己 pass 后清掉残留选中的牌（防下回合误打出）+ 即时回执
      if (msg.seat === ui.mySeat) {
        ui.clearSelection();
        stopTurnTimer();
      }
      ui.showPass(msg.seat);
    });

    socket.on('PLAYER_FINISHED', (msg) => {
      const name = msg.seat === ui.mySeat ? '你' : ui.getPlayerName(msg.seat);
      ui.showMessage(`${name} 出完了！第${msg.position}名 🎉`, 3000);
    });

    socket.on('ROUND_END', (msg) => {
      ui.updateScorePanel(msg);
      ui.showRoundResult(msg);
      // v1.2 音效：按我队是否升级播放胜/负/升级音
      const sm = window.soundManager;
      const myTeamUpgrade = (ui.mySeat === 0 || ui.mySeat === 2) ? msg.team1Upgrade : msg.team2Upgrade;
      if (myTeamUpgrade >= 2) sm?.levelUp();
      else if (myTeamUpgrade > 0) sm?.win();
      else sm?.lose();
    });

    socket.on('GAME_OVER', (msg) => {
      // v1.3 战绩：记录本场胜负
      const myTeam = (ui.mySeat === 0 || ui.mySeat === 2) ? 'team1' : 'team2';
      recordGameResult(msg.winner === myTeam);
      stopTurnTimer();
      // review-P1 修复：托管跨场不再残留（原先新一场开局即被 AI 代打）
      autoPlay = false;
      const ab = document.getElementById('auto-btn');
      if (ab) { ab.classList.remove('auto-on'); ab.textContent = '🤖 托管'; }
      window.soundManager?.speak(msg.winner === myTeam ? '恭喜获胜' : '再接再厉');
      setTimeout(() => {
        ui.hideRoundResult();
        ui.showGameOver(msg.winner, msg.finalLevel);
      }, 1000);
    });

    socket.on('HINT_RESULT', (msg) => {
      if (msg.hints && msg.hints.length > 0) {
        // review-P2 修复：提示循环切换——同一回合连点提示按 1/5 → 2/5 → ... 浏览备选
        const key = JSON.stringify(msg.hints.map(h => h.map(c => c.id)));
        if (hintCache.key === key) {
          hintCache.idx = (hintCache.idx + 1) % msg.hints.length;
        } else {
          hintCache.key = key;
          hintCache.idx = 0;
        }
        const pick = msg.hints[hintCache.idx];
        ui.selectedCardIds.clear();
        for (const card of pick) ui.selectedCardIds.add(card.id);
        ui.renderMyHand();
        ui.showMessage(`出法 ${hintCache.idx + 1}/${msg.hints.length}（再点提示切换）`, 1500);
      } else {
        ui.showMessage('没有能管住的牌 😅', 1500);
      }
    });

    socket.on('TUTORIAL_STARTED', (msg) => {
      handleTutorialStarted(msg);
    });

    socket.on('TUTORIAL_FEEDBACK', (msg) => {
      handleTutorialFeedback(msg);
    });

    socket.on('NPC_EXPLAIN', (msg) => {
      // P1.2：debug 模式 → 每个 NPC 位卡旁的 trace bubble；非 debug → 原全局 explanation
      if (isDebugMode && msg.activatedSkills && msg.activatedSkills.length > 0) {
        showNPCTraceBubble(msg);
      } else if (msg.explanation) {
        showNPCExplain(msg.seat, msg.explanation);
      }
    });

    // review-P2：抗贡提示（输方持双大王免贡——此前该事件无人处理，玩家完全无感知）
    socket.on('TRIBUTE_RESISTED', () => {
      ui.showMessage('输方手握双大王，抗贡成功！本局免进贡', 3000);
      window.soundManager?.speak('抗贡');
    });

    // review：进贡/还贡确认后才关弹窗（配合 gameUI 的"点击不立即关"修复）
    socket.on('TRIBUTE_DONE', (msg) => {
      if (msg.seat === ui.mySeat) ui.hideTributeUI();
    });
    socket.on('RETURN_DONE', (msg) => {
      if (msg.seat === ui.mySeat) ui.hideTributeUI();
    });

    // v2.4 复盘：服务端返回复盘数据 → 打开面板
    socket.on('REPLAY_DATA', (msg) => {
      if (!msg.log || msg.log.length === 0) {
        ui.showMessage('暂无复盘记录（本场还没打完一手）', 2000);
        return;
      }
      ui.showReplay(msg.log);
    });

    // review：断局恢复时重建记牌器（原先恢复后剩余张数系统性虚高）
    socket.on('COUNTER_SYNC', (msg) => {
      ui.playedCounts = msg.playedCounts || {};
      ui.renderCardCounter();
    });

    // v1.1 断局恢复：恢复失败（存档无效/损坏）
    socket.on('RESTORE_FAILED', (msg) => {
      ui.setLobbyStatus(`恢复失败：${msg.reason || '存档无效'}，请开始新对局`);
      socket.clearSave?.();
      const btn = document.getElementById('resume-game-btn');
      if (btn) btn.style.display = 'none';
    });

    socket.on('TRIBUTE_REQUEST', (msg) => {
      showTributeUI(msg);
    });

    socket.on('TRIBUTE_DONE', (msg) => {
      ui.showMessage(`座位${msg.seat}已完成进贡`);
    });

    socket.on('RETURN_REQUEST', (msg) => {
      ui.showReturnTributeUI(msg);
    });

    socket.on('RETURN_DONE', (msg) => {
      ui.showMessage(`座位${msg.seat}已还贡`);
    });

    socket.on('TRIBUTE_COMPLETED', () => {
      ui.hideTributeUI();
    });

    socket.on('ERROR', (msg) => {
      ui.showMessage(msg.message, 2000);
      console.error('服务端错误:', msg.message);
    });

    socket.on('disconnected', () => {
      ui.showMessage('与服务器断开连接 😢', 5000);
    });
  }

  // ====== UI 事件绑定 ======
  function bindUIEvents() {

    // ── 模式切换 ──
    document.getElementById('solo-mode-btn').addEventListener('click', () => {
      appMode = 'solo';
      document.getElementById('solo-mode-btn').classList.add('active');
      document.getElementById('multi-mode-btn').classList.remove('active');
      document.getElementById('solo-panel').style.display = 'block';
      document.getElementById('multi-panel').style.display = 'none';
    });
    document.getElementById('multi-mode-btn').addEventListener('click', () => {
      appMode = 'multi';
      document.getElementById('multi-mode-btn').classList.add('active');
      document.getElementById('solo-mode-btn').classList.remove('active');
      document.getElementById('multi-panel').style.display = 'block';
      document.getElementById('solo-panel').style.display = 'none';
    });

    // ── 单人模式：profile tab 切换 ──
    document.querySelectorAll('.profile-tabs').forEach(tabGroup => {
      const seat = parseInt(tabGroup.dataset.seat);
      tabGroup.querySelectorAll('.profile-tab').forEach(tab => {
        tab.addEventListener('click', () => {
          const newProfile = tab.dataset.profile;
          const prevProfile = soloConfig[seat].profile;
          // 更新 active 样式
          tabGroup.querySelectorAll('.profile-tab').forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          selectProfile(seat, newProfile, prevProfile);
        });
      });
    });

    // ── 单人模式：开始对战 ──
    document.getElementById('solo-start-btn').addEventListener('click', () => {
      // review-P2 修复：放弃未完成的上一局 → 记一败（防刷胜率）；roundCount 跨场清零
      if (socket.hasSave?.()) {
        recordGameResult(false);
        socket.clearSave?.();
        ui.showMessage('上一局未打完，已按弃局记一败', 2500);
        const rbtn = document.getElementById('resume-game-btn');
        if (rbtn) rbtn.style.display = 'none';
      }
      ui.roundCount = 0;
      const nickname = document.getElementById('nickname-input').value.trim() || '玩家';
      isSoloLaunch = true;
      socket.login(nickname);
      setTimeout(() => socket.createRoom(), 150);
    });

    // ── v1.1 断局恢复：继续上一局 ──
    document.getElementById('resume-game-btn')?.addEventListener('click', () => {
      const nickname = document.getElementById('nickname-input').value.trim() || '玩家';
      socket.login(nickname);
      setTimeout(() => socket.restoreGame(), 150);
    });

    // ── v1.2 音效总开关 ──
    const soundBtn = document.getElementById('sound-toggle-btn');
    if (soundBtn) {
      const syncIcon = () => { soundBtn.textContent = window.soundManager?.enabled ? '🔊' : '🔇'; };
      syncIcon();
      soundBtn.addEventListener('click', () => { window.soundManager?.toggle(); syncIcon(); });
    }

    // ── v1.3 托管开关 ──
    document.getElementById('auto-btn')?.addEventListener('click', () => {
      autoPlay = !autoPlay;
      const btn = document.getElementById('auto-btn');
      btn.classList.toggle('auto-on', autoPlay);
      btn.textContent = autoPlay ? '🤖 托管中' : '🤖 托管';
      ui.showMessage(autoPlay ? '已开启托管，AI 代打' : '已取消托管', 1500);
      if (autoPlay && ui.isMyTurn) { stopTurnTimer(); autoPlayOneHand(); }
      if (!autoPlay && ui.isMyTurn) startTurnTimer();
    });

    // ── v1.3 记牌器开关 ──
    document.getElementById('counter-toggle-btn')?.addEventListener('click', () => {
      const panel = document.getElementById('card-counter');
      if (panel) panel.style.display = panel.style.display === 'none' ? '' : 'none';
      ui.renderCardCounter();
    });

    // ── v1.3 大厅战绩显示 ──
    refreshStatsUI();

    // ── v2.4 复盘按钮 ──
    const requestReplay = () => socket.send({ type: 'GET_REPLAY' });
    document.getElementById('replay-btn-round')?.addEventListener('click', requestReplay);
    document.getElementById('replay-btn-final')?.addEventListener('click', requestReplay);
    document.getElementById('replay-close-btn')?.addEventListener('click', () => ui.hideReplay());
    document.getElementById('replay-export-btn')?.addEventListener('click', () => {
      const json = ui.exportReplayFlags();
      const n = (JSON.parse(json).flags || []).length;
      if (n === 0) { ui.showMessage('先点 🚩 标记不合理的手再导出', 2000); return; }
      // 复制到剪贴板 + 下载文件双保险
      try { navigator.clipboard?.writeText(json); } catch (e) {}
      const blob = new Blob([json], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `guandan-replay-flags-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      ui.showMessage(`已导出 ${n} 手（已复制到剪贴板 + 下载 JSON）`, 3000);
    });

    // ── review-P1 修复：切后台暂停读秒 + 停语音（原先后台读秒照走、超时自动代打、语音照播）──
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        stopTurnTimer();
        try { speechSynthesis.cancel(); } catch (e) {}
      } else if (ui.isMyTurn && !autoPlay && ui.currentScreen === 'game') {
        startTurnTimer();   // 回来后重新给整段读秒时间
      }
    });

    // 大厅 - 创建房间（多人模式）
    document.getElementById('create-room-btn').addEventListener('click', () => {
      const nickname = document.getElementById('nickname-input').value.trim() || '匿名玩家';
      socket.login(nickname);
      setTimeout(() => socket.createRoom(), 200);
    });

    // 大厅 - 加入房间
    document.getElementById('join-room-btn').addEventListener('click', () => {
      const nickname = document.getElementById('nickname-input').value.trim() || '匿名玩家';
      const roomId = document.getElementById('room-id-input').value.trim();
      if (!roomId) {
        ui.setLobbyStatus('请输入房间号');
        return;
      }
      socket.login(nickname);
      setTimeout(() => socket.joinRoom(roomId), 200);
    });

    // 房间 - 复制房间号
    document.getElementById('copy-room-id-btn').addEventListener('click', () => {
      const roomId = document.getElementById('room-id-display').textContent;
      navigator.clipboard.writeText(roomId).then(() => {
        ui.showMessage('房间号已复制 📋');
      }).catch(() => {
        // 降级方案
        prompt('请复制房间号:', roomId);
      });
    });

    // 房间 - 准备
    document.getElementById('ready-btn').addEventListener('click', () => {
      socket.ready();
    });

    // 房间 - 开始游戏
    document.getElementById('start-game-btn').addEventListener('click', () => {
      socket.startGame();
    });

    // 游戏 - 出牌
    document.getElementById('play-btn').addEventListener('click', () => {
      const cardIds = ui.getSelectedCardIds();
      if (cardIds.length === 0) {
        ui.showMessage('请先选择要出的牌');
        return;
      }
      // 教学模式走 TUTORIAL_ACTION 通道
      if (ui.isTutorialMode) {
        socket.send({ type: 'TUTORIAL_ACTION', action: { type: 'PLAY', cardIds } });
      } else {
        socket.playCards(cardIds);
      }
    });

    // 游戏 - 不出
    document.getElementById('pass-btn').addEventListener('click', () => {
      if (ui.isTutorialMode) {
        socket.send({ type: 'TUTORIAL_ACTION', action: { type: 'PASS' } });
      } else {
        socket.pass();
      }
    });

    // 游戏 - 理牌
    document.getElementById('sort-btn').addEventListener('click', () => {
      ui.sortHand();
    });

    // 游戏 - 提示
    document.getElementById('hint-btn').addEventListener('click', () => {
      if (ui.isTutorialMode) {
        ui.showMessage('教学模式：按提示选牌后点出牌');
      } else {
        socket.hint();
      }
    });

    // 结算 - 下一局
    document.getElementById('next-round-btn').addEventListener('click', () => {
      ui.hideRoundResult();
      socket.nextRound();
    });

    // 游戏结束 - 回大厅
    document.getElementById('back-to-lobby-btn').addEventListener('click', () => {
      ui.hideGameOver();
      ui.showScreen('lobby');
    });
  }

  // ====== 教学模式处理 ======

  // 大厅页教学课程按钮
  document.querySelectorAll('.btn-tutorial').forEach(btn => {
    btn.addEventListener('click', () => {
      const lessonId = btn.dataset.lesson;
      // 如果还没登录，先自动登录（pendingLesson 在 LOGIN_OK 里处理）
      if (!socket.playerId) {
        const nickname = document.getElementById('nickname-input').value.trim() || '新手玩家';
        socket.pendingLesson = lessonId;   // 暂存，LOGIN_OK 后自动发送
        socket.login(nickname);
      } else {
        socket.send({ type: 'START_TUTORIAL', lessonId });
      }
    });
  });

  // 教学"继续"按钮
  document.getElementById('tutorial-next-btn')?.addEventListener('click', () => {
    socket.send({ type: 'TUTORIAL_ACTION', action: { type: 'NEXT' } });
  });

  // 当前教学课程元信息（跨步骤保留 totalSteps）
  let _tutorialMeta = { title: '教学', totalSteps: 3 };

  // 处理服务端推送的教学消息
  function handleTutorialStarted(data) {
    // 标记进入教学模式（影响出牌/不出按钮的消息路由）
    ui.isTutorialMode = true;
    // 保存课程元信息，供后续步骤使用
    _tutorialMeta = {
      title: data.lessonConfig?.title || '教学',
      totalSteps: data.lessonConfig?.totalSteps || 3,
    };
    // 用 startGame 初始化游戏界面（切屏 + 渲染手牌）
    ui.startGame(data.hand || [], 0, data.currentLevel || 2, 2, 2);
    // 教学模式：玩家始终是 seat 0 的回合，开启出牌按钮
    ui.updateTurnHighlight(0);
    // 显示教学引导浮层
    showTutorialStep(data.currentStep, data.lessonConfig);
  }

  function showTutorialStep(step, lessonConfig) {
    if (!step) {
      hideTutorialOverlay();
      return;
    }
    const overlay = document.getElementById('tutorial-overlay');
    const progress = document.getElementById('tutorial-progress');
    const prompt = document.getElementById('tutorial-prompt');
    const nextBtn = document.getElementById('tutorial-next-btn');

    const title = lessonConfig?.title || _tutorialMeta.title;
    const total = lessonConfig?.totalSteps || _tutorialMeta.totalSteps;
    const idx = lessonConfig?.currentStepIndex ?? 0;

    overlay.style.display = 'block';
    progress.textContent = `${title} · 步骤 ${idx + 1}/${total}`;
    prompt.textContent = step.prompt || '';

    // NEXT类型步骤显示"继续"按钮，其他类型（需要出牌）隐藏
    nextBtn.style.display = (step.expectedAction === 'NEXT') ? 'inline-block' : 'none';
  }

  function hideTutorialOverlay() {
    document.getElementById('tutorial-overlay').style.display = 'none';
  }

  function handleTutorialFeedback(data) {
    if (data.completed) {
      ui.isTutorialMode = false;  // 退出教学模式
      hideTutorialOverlay();
      const prompt = document.getElementById('tutorial-prompt');
      const overlay = document.getElementById('tutorial-overlay');
      if (prompt) prompt.textContent = '🎉 课程完成！你已掌握这一关的内容。';
      if (overlay) overlay.style.display = 'block';
      setTimeout(() => {
        hideTutorialOverlay();
        // 回到大厅
        ui.showScreen('lobby');
      }, 3000);
      return;
    }
    if (data.correct) {
      // 出牌成功：从手牌中移除已出的牌
      if (data.playedCardIds && data.playedCardIds.length > 0) {
        ui.removeCardsFromHand(data.playedCardIds);
      }
      if (data.nextStep) {
        showTutorialStep(data.nextStep, {
          title: _tutorialMeta.title,
          currentStepIndex: data.nextStepIndex,
          totalSteps: _tutorialMeta.totalSteps,
        });
      }
      if (data.explanation) {
        ui.showMessage(data.explanation, 1500);
      }
    } else {
      // 操作错误：在浮层内显示提示，2秒后恢复
      const prompt = document.getElementById('tutorial-prompt');
      if (prompt) {
        const original = prompt.textContent;
        prompt.textContent = '💡 ' + (data.explanation || '请按提示操作');
        setTimeout(() => { prompt.textContent = original; }, 2500);
      }
    }
  }

  function showNPCExplain(seat, explanation) {
    const bubble = document.getElementById('npc-explain-bubble');
    if (!bubble) return;
    bubble.textContent = `🤖 ${explanation}`;
    bubble.style.display = 'block';
    clearTimeout(window._npcBubbleTimer);
    window._npcBubbleTimer = setTimeout(() => { bubble.style.display = 'none'; }, 4000);
  }

  // P1.2：debug 模式下，把 NPC trace 显示在对应位卡旁的信息泡
  // 内容：主因（PrimaryReason 中文解释）+ 技能 chip 列表 + skillNotes 详细
  // 显示时长：duration-linger (2500ms)，与 stage-quadrant 出牌停留同步
  const npcBubbleTimers = { top: null, left: null, right: null };
  function showNPCTraceBubble(msg) {
    // 把 absolute seat 映射到相对位置（与 gameUI.getPlayerPosition 同逻辑）
    const position = ui.getPlayerPosition(msg.seat);
    if (position === 'bottom') return;  // 自己不显示 trace（自己不是 NPC）
    const bubble = document.getElementById(`npc-trace-${position}`);
    if (!bubble) return;

    const skillsHtml = msg.activatedSkills.map(s =>
      `<span class="npc-trace-skill-chip">${s.toUpperCase()}</span>`
    ).join('');
    const notesHtml = (msg.skillNotes || []).map(note =>
      `<li><b>${note.skill}</b>: ${escapeHtml(note.note)}</li>`
    ).join('');
    const action = msg.action === 'PASS' ? '不出' : '出牌';

    bubble.innerHTML = `
      <div class="npc-trace-header">${action}：${escapeHtml(msg.explanation || '')}</div>
      <div class="npc-trace-skills">${skillsHtml}</div>
      <ul class="npc-trace-notes">${notesHtml}</ul>
    `;
    bubble.classList.add('visible');

    // 清掉该位置的旧 timer，避免快速 NPC 决策时 timer 互相打架
    if (npcBubbleTimers[position]) clearTimeout(npcBubbleTimers[position]);
    npcBubbleTimers[position] = setTimeout(() => {
      bubble.classList.remove('visible');
    }, 2500);
  }

  // 基础 HTML 转义，避免 trace 中的 < > 符号破坏 innerHTML（虽然技能 note 都是受控字符串）
  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function showTributeUI(data) {
    const overlay = document.getElementById('tribute-overlay');
    const title = document.getElementById('tribute-title');
    const desc = document.getElementById('tribute-desc');
    const hint = document.getElementById('tribute-hint-text');

    if (!overlay) return;
    // 进贡阶段始终隐藏"收到进贡"区域（还贡阶段才显示）
    const receivedArea = document.getElementById('tribute-received');
    if (receivedArea) receivedArea.style.display = 'none';

    const isSender = data.fromSeats?.includes(ui.mySeat);
    title.textContent = isSender ? '进贡：选一张最大的牌' : '等待进贡...';
    desc.textContent = isSender ? '请选择你手中最大的牌进贡给赢家' : '等待其他玩家进贡';
    hint.textContent = '进贡规则：输方需要把手中最大的牌送给上局赢家';
    overlay.style.display = 'flex';

    if (isSender) {
      // v1.1 修复：用 CardRenderer 正常渲染牌面（原 textContent 裸数字 → 白板 bug）
      // 并按协会版牌力高亮合法进贡牌（最大牌力、红心级牌除外），非法牌降透明且不可点
      const handArea = document.getElementById('tribute-hand');
      if (handArea && ui.myHand) {
        const lv = ui.currentLevel;
        const tv = c => c.rank >= 15 ? c.rank : (c.rank === lv ? 14.5 : c.rank);
        const valid = ui.myHand.filter(c => !(c.suit === 1 && c.rank === lv));
        const maxValue = valid.length > 0 ? Math.max(...valid.map(tv)) : -1;

        handArea.innerHTML = '';
        ui.myHand.forEach(card => {
          const el = window.CardRenderer.createCardElement(card);
          const isLegal = !(card.suit === 1 && card.rank === lv) && tv(card) === maxValue;
          if (isLegal) {
            el.classList.add('tribute-legal');
            el.style.cursor = 'pointer';
            el.onclick = () => {
              // review：不立即关弹窗，等 TRIBUTE_DONE 确认（与还贡同模式，被拒可重选）
              socket.send({ type: 'TRIBUTE', cardId: card.id });
            };
          } else {
            el.style.opacity = '0.35';
            el.title = '进贡必须选手中最大的牌（红心级牌除外）';
          }
          handArea.appendChild(el);
        });
      }
    }
  }

  // 页面加载完后初始化
  window.addEventListener('DOMContentLoaded', init);
})();
