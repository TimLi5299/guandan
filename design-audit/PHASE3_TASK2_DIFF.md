# 阶段 3 · 任务 2 · 回合脉冲光晕 · 改造记录

> 完成时间：2026-05-02  
> 性质：解决初始 REPORT.md 的 P0「回合状态不可感知」。给当前出牌方加 infinite 脉冲光晕，让外周视觉也能自然捕捉。  
> 改动隔离：在 `style.css` 末尾追加 `Phase 3 Task 2 Override Block`。

---

## 一、改动清单（仅 1 个文件）

| 文件 | 改动 |
|------|------|
| `css/style.css` | 末尾追加 ~70 行的 `Phase 3 Task 2 Override Block`，含 2 个 @keyframes 和 4 条选择器 |

未改动：tokens.css、所有 JS、HTML、Phase 0/1/2 块、Phase 3 任务 1 块、游戏逻辑。

---

## 二、关键证据：computed style 探针

> 探针方式：用 Playwright 强制给 `#player-top .player-info` 加 `.active-turn` 类，然后读 `getComputedStyle()` 的 animation 和 box-shadow 实测值。

### 队友脉冲（player-top）

| 属性 | 实测值 | spec 要求 | 一致性 |
|------|-------|-----------|--------|
| animation-name | `pulse-glow-ally` | （应有 keyframe）| ✅ |
| animation-duration | `1.2s` | `--duration-pulse-period` = 1200ms | ✅ |
| animation-iteration-count | `infinite` | infinite | ✅ |
| animation-timing-function | `cubic-bezier(0.45, 0.05, 0.55, 0.95)` | `--ease-in-out-state` | ✅ |

### 4 帧 box-shadow 实测（1200ms 周期内每 300ms 抓一帧）

| 时刻 | rgba alpha | 归属相位 |
|------|-----------|---------|
| +0 ms | 0.424 | 上升中 |
| +300 ms | 0.545 | **接近峰值** (spec 0.55) |
| +600 ms | 0.467 | 下降中 |
| +900 ms | 0.384 | **接近谷值** (spec 0.385) |

**alpha 实测跨度 0.384 ~ 0.545，与 DESIGN_TOKENS §6.3D 的"100% ↔ 70%"映射的 0.385 ~ 0.55 完全吻合。**

### 对手脉冲（player-left）

| 属性 | 实测值 |
|------|-------|
| animation-name | `pulse-glow-opp` |
| box-shadow 颜色族 | `rgb(75, 143, 196)` ← 钢蓝（`--faction-opp-primary`） |

确认两条 stream 用了独立的 keyframe，阵营色严格分离。

---

## 三、3 个改造点（按 DESIGN_TOKENS §6.3D 顺序）

### 1. 进入 active-turn 用 `slow + spring`（涌现感）

任务 1 给 `.player-info` 加的是统一 `normal + ease-in-out-state` transition，这次任务 2 把 active-turn 状态的 transition 改用 `slow (400ms) + spring-feedback`，让光晕"涌入"时带回弹。  
**离开 active-turn** 仍走任务 1 的 `normal + ease-in-out`（淡出收紧）。

```css
.player-info.active-turn {
  transition:
    border-color   var(--duration-slow) var(--spring-feedback),
    border-width   var(--duration-slow) var(--spring-feedback),
    background-color var(--duration-slow) var(--spring-feedback),
    box-shadow     var(--duration-slow) var(--spring-feedback)
    !important;
}
```

> CSS 二态 transition 技巧：默认 transition 在 `.player-info` 上（任务 1，离开时用），active 态 transition 在 `.player-info.active-turn` 上（任务 2，进入时用）。

### 2. 队友脉冲（琥珀光晕 alpha 0.55 ↔ 0.385）

```css
@keyframes pulse-glow-ally {
  0%, 100% { box-shadow: 0 0 0 3px var(--faction-ally-primary), 0 0 16px rgba(232,162,48,0.55); }
  50%      { box-shadow: 0 0 0 3px var(--faction-ally-primary), 0 0 16px rgba(232,162,48,0.385); }
}
#player-top .player-info.active-turn {
  animation: pulse-glow-ally var(--duration-pulse-period) var(--ease-in-out-state) infinite !important;
}
```

### 3. 对手脉冲（钢蓝光晕 alpha 0.50 ↔ 0.35）

```css
@keyframes pulse-glow-opp {
  0%, 100% { box-shadow: 0 0 0 3px var(--faction-opp-primary), 0 0 16px rgba(75,143,196,0.50); }
  50%      { box-shadow: 0 0 0 3px var(--faction-opp-primary), 0 0 16px rgba(75,143,196,0.35); }
}
#player-left .player-info.active-turn,
#player-right .player-info.active-turn {
  animation: pulse-glow-opp var(--duration-pulse-period) var(--ease-in-out-state) infinite !important;
}
```

---

## 四、CSS 行为细节（动画与 transition 的协作）

| 时刻 | 元素状态 | 谁在控制 box-shadow |
|------|---------|------------------|
| 之前 | 无 .active-turn | task 1 的 transition + Phase 1 v2 的 idle 阴影 |
| 加上 .active-turn | 进入态 | task 2 transition（slow + spring）从 idle → active 阴影涌入（约 400ms）|
| 涌入完成后 | active 稳态 | task 2 animation `pulse-glow-ally` 接管，infinite 脉冲 |
| 移除 .active-turn | 离开态 | animation 立即停止 → task 1 transition（normal + ease-in-out）从 animation 最后帧值 → idle 阴影 |

**关键：CSS animation 优先级 > transition**。脉冲跑起来后，`box-shadow` 由 keyframe 接管；移除 active-turn 时 animation 停，自动回落到 transition 走完最后过渡。

---

## 五、为什么用 alpha 0.55 ↔ 0.385 而不是改 blur 半径？

DESIGN_TOKENS §6.3D 的原文是「opacity 在 0.7 和 1.0 之间交替」——指**光晕强度**的相对变化。落地到 box-shadow 上有两种实现：

| 方案 | 优点 | 缺点 |
|------|------|------|
| 改 blur 半径 (16px ↔ 8px) | 视觉变化大，更显眼 | 与"不喧宾夺主"违背 |
| **改 rgba alpha (0.55 ↔ 0.385)** ✅ | 强度变化精准、扩散范围稳定，符合"外周视觉"的语义 | 单帧视觉差异较细微 |

选 alpha 方案，因为脉冲的**目的是"持续可感知但不打断"**，alpha 变化天然满足这个要求——主视线在牌面，外周视觉感知到光晕在"呼吸"即可。

---

## 六、不在 task 2 范围内的事

DESIGN_TOKENS §6.3D 「我的回合特殊处理」的两条：

| 子项 | 状态 | 归属 |
|------|------|------|
| 按钮组 opacity 0.45 → 1.0 入场 | ✅ 已实现 | 任务 1 |
| **出牌按钮 spring-feedback scale(1.04→1.0) 一次性涌现** | ⏸️ 留给任务 3 | 需 JS hook 在 my-turn 切换瞬间加 class，逻辑改动归任务 3 一并做 |

---

## 七、验收证据截图

> 路径：`/Users/linshi/Documents/Archive/warren-shrimp/games/guandan/design-audit/`

| 文件 | 看什么 |
|------|--------|
| `before-phase3-task2.png` | 任务 2 起点（任务 1 完成态，静态琥珀光晕，无脉冲）|
| `after-phase3-task2-pulse-frame-1.png` | 脉冲峰值（alpha 0.545）|
| `after-phase3-task2-pulse-frame-3.png` | 脉冲谷值（alpha 0.384）|
| **峰值 vs 谷值对比** ⭐ | 光晕强度可见差异，证明动画在跑 |
| `after-phase3-task2-opp-active.png` | 对手激活态：钢蓝光晕（与队友琥珀形成阵营色对峙）|
| `after-phase3-task2-emergence.png` | 涌入帧（spring 涌入半程，光晕从 idle 长出）|
| `after-phase3-task2.png` | 全景终态 |

---

## 八、浏览器手动体验（最直观）

打开 `http://localhost:3737?demo=1`，操作：

- 出 1 张牌让 AI 接管 → **顶部对家位卡周围出现持续的金色"呼吸"光晕**（每 1.2 秒一周期）
- 等 AI 把回合传给左/右家 → **侧面对手位卡的钢蓝光晕开始呼吸**
- 回合传给我 → 顶部光晕熄灭、按钮组从 0.4 渐变到 1.0

最直接的感受：用余光（不直视位卡）也能感知到"现在轮到谁"——P0 解决。

---

## 九、回滚路径

如需回到任务 1 状态：删除 `style.css` 末尾的 `Phase 3 Task 2 Override Block`（含 2 个 @keyframes 和 4 条选择器）。

不影响 tokens.css、Phase 0/1/2 块、Phase 3 任务 1 块。

---

## 十、任务 3 入口条件

任务 2 完成 ✅，初始 REPORT.md 的 **P0 已解决**。下一步任务 3（出牌飞行与停留），入口：

- 这是 Phase 3 中最复杂的一步，需改 JS（监听出牌事件、加 class 控制飞行轨迹）
- 范围：卡牌从手牌位置弧线飞向中央舞台对应象限、多张牌错开 40ms、停留 2500ms 后淡出
- 也包含任务 2 推迟的"出牌按钮 scale(1.04→1.0) 一次性涌现"
- 预计需 2-3 个 session
