/**
 * soundManager.js — v1.2 音效与语音播报
 *
 * 设计原则（HANDBOOK 决策 1：克制但高级）：
 * - 全部 Web Audio 实时合成，零素材依赖（不引入 mp3/wav）
 * - 音色偏"物理质感"（短促、低增益、快衰减），拒绝喜庆爆音
 * - 语音播报用 Web Speech API（zh-CN），报牌型与关键事件
 * - 总开关持久化到 localStorage（guandan_sound）
 */
(function () {
  const PREF_KEY = 'guandan_sound';

  class SoundManager {
    constructor() {
      this.ctx = null;
      this.enabled = localStorage.getItem(PREF_KEY) !== 'off';
      this._voice = null;
    }

    _ensure() {
      if (!this.enabled) return false;
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return false;
        this.ctx = new AC();
      }
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return true;
    }

    /** 基础音：freq(Hz)、dur(s)、type 波形、peak 峰值增益、when 延迟(s) */
    _tone(freq, dur, type = 'sine', peak = 0.12, when = 0) {
      if (!this._ensure()) return;
      const t0 = this.ctx.currentTime + when;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(peak, t0 + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g).connect(this.ctx.destination);
      osc.start(t0); osc.stop(t0 + dur + 0.05);
    }

    /** 噪声脉冲：卡牌的"嗒"、炸弹的"轰" */
    _noise(dur, peak = 0.2, filterFreq = 1800, when = 0) {
      if (!this._ensure()) return;
      const t0 = this.ctx.currentTime + when;
      const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = filterFreq;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(peak, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(filter).connect(g).connect(this.ctx.destination);
      src.start(t0);
    }

    // ── 事件音 ──────────────────────────────────────────────
    playCard()  { this._noise(0.08, 0.18, 2200); }                              // 出牌：纸牌拍桌的"嗒"
    pass()      { this._tone(220, 0.10, 'sine', 0.05); }                        // 不出：极轻低音
    deal() {                                                                     // 发牌：快速三连嗒
      for (let i = 0; i < 3; i++) this._noise(0.05, 0.10, 2600, i * 0.07);
    }
    myTurn()    { this._tone(660, 0.09, 'sine', 0.10); this._tone(880, 0.12, 'sine', 0.10, 0.09); }  // 轮到我：双音叮咚
    bomb() {                                                                     // 炸弹：低频轰 + 噪声
      this._tone(70, 0.5, 'sawtooth', 0.22);
      this._noise(0.35, 0.25, 500);
    }
    win() {                                                                      // 本局胜：三音上扬
      [523, 659, 784].forEach((f, i) => this._tone(f, 0.22, 'triangle', 0.12, i * 0.12));
    }
    lose()      { this._tone(330, 0.25, 'triangle', 0.08); this._tone(262, 0.4, 'triangle', 0.08, 0.18); }  // 本局负：下行
    levelUp() {                                                                  // 升级：四音琶音
      [523, 659, 784, 1047].forEach((f, i) => this._tone(f, 0.25, 'triangle', 0.13, i * 0.1));
    }

    /** 语音播报（zh-CN）：牌型 / 关键事件 */
    speak(text) {
      if (!this.enabled || !('speechSynthesis' in window) || !text) return;
      try {
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'zh-CN';
        u.rate = 1.25;
        u.volume = 0.85;
        speechSynthesis.cancel();   // 抢占式：新事件打断旧播报，避免堆积
        speechSynthesis.speak(u);
      } catch (e) { /* 静默 */ }
    }

    toggle() {
      this.enabled = !this.enabled;
      localStorage.setItem(PREF_KEY, this.enabled ? 'on' : 'off');
      if (!this.enabled) { try { speechSynthesis.cancel(); } catch (e) {} }
      return this.enabled;
    }
  }

  window.soundManager = new SoundManager();
})();
