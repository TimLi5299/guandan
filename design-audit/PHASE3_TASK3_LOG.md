# 阶段 3 · 任务 3 · 日志

> 任务 3 (出牌飞行与停留) 是 Phase 3 中最复杂的，分 4 个子任务推进。  
> 本文档按时间累积记录，每完成一个子任务追加一节。

---

## 子任务 3.1 ✅ 出牌按钮一次性涌现 + 任务 3 整体调查

完成时间：2026-05-02

### 前置：现有出牌事件链路调查

**核心 hook 点**：`js/ui/gameUI.js` 中的 5 个方法构成现有出牌 UI 流水线

| 方法 | 行号 | 当前职责 |
|------|------|---------|
| `showPlayedCards(seat, cards, handType)` | 184-202 | ① 在 `#played-${pos}` 容器渲染牌组（每家位卡内独立区）② 中央 `#play-info` 显示文字描述 ③ 触发炸弹特效 |
| `showPass(seat)` | 218-224 | 在该家位卡内显示"不出"文字 |
| `clearAllPlayed()` | 226-232 | 清空所有 `played-${pos}` 容器 + 中央 `#play-info` |
| `updateTurnHighlight(currentTurn)` | 244-263 | 切换 `.active-turn` class、按钮组 opacity |
| `triggerBombEffect()` | 204-216 | **现成的"强制 reflow 重启动画"模板**：`el.classList.remove('animate'); void el.offsetWidth; el.classList.add('animate');` |

**关键发现**：
- 每个玩家位卡内有独立 `<div class="played-cards-area" id="played-${pos}">`，这是当前每家"上次出牌"的渲染目标
- COMPONENT_SPECS §3.2 要求所有出牌飞向**中央舞台 4 象限**——意味着子任务 3.2 实施时，每家的 `played-cards-area` 角色被中央 `stage-anchor` 替代
- 中央 `#play-info` 当前只渲染文字，需要扩展为牌组容器（子任务 3.2 范围）

**子任务 3.2 / 3.3 的实施入口**（提前确定）：
- **入口 1**：在 `showPlayedCards` 内增加 hook，用 JS 计算 source(手牌位置) + target(中央舞台对应象限) 坐标，克隆牌节点应用飞行 keyframe
- **入口 2**：在 `clearAllPlayed` / 新一手出牌时，触发上一手的淡出（`--duration-linger` 后）
- **入口 3**：每家在中央的"象限位置"由 `getPlayerPosition(seat)` 现有方法（line 278-282）确定 → 'bottom' | 'right' | 'top' | 'left'

`cardRenderer.js` 提供 `renderHand` / `renderPlayedCards` / `createCardElement`——子任务 3.2 时需要细读，3.1 不动。

---

### 3.1 实施：出牌按钮"涌现"动画

**spec 来源**：DESIGN_TOKENS §6.3D「我的回合特殊处理」

> "出牌按钮触发一次 spring-feedback scale(1.04→1.0)，提示'可以操作了'"

#### 改动清单

| 文件 | 改动 |
|------|------|
| `css/style.css` | 末尾追加 `Phase 3 Task 3 Override Block`，含 `@keyframes play-btn-summon` + `.action-buttons #play-btn.summon` 共 ~10 行 CSS |
| `js/ui/gameUI.js` | `updateTurnHighlight` 内增加 ~9 行：检测"非我 → 我"切换瞬间，给 `#play-btn` 加 `.summon` class（仿照 `triggerBombEffect` 的强制 reflow 模式）|

**首次 JS 改动，恪守边界**：
- ✅ 仅在 `updateTurnHighlight` 内追加逻辑，不动其他方法
- ✅ 不改游戏逻辑（玩法、规则、状态机）
- ✅ JS 改动 9 行，CSS 改动 10 行

#### CSS 实现

```css
@keyframes play-btn-summon {
  0%   { transform: scale(1.04); }
  100% { transform: scale(1.0); }
}
.action-buttons #play-btn.summon {
  animation: play-btn-summon var(--duration-normal) var(--spring-feedback) 1;
}
```

#### JS 实现

```js
updateTurnHighlight(currentTurn) {
  // Phase 3 任务 3.1：检测"非我 → 我"切换瞬间
  const wasMyTurn = this.isMyTurn;
  this.isMyTurn = currentTurn === this.mySeat;

  // ...原有逻辑（高亮、按钮 opacity）...

  // Phase 3 任务 3.1：我的回合刚开始时，出牌按钮一次性涌现
  if (this.isMyTurn && !wasMyTurn) {
    const playBtn = document.getElementById('play-btn');
    if (playBtn) {
      playBtn.classList.remove('summon');
      void playBtn.offsetWidth;  // 强制 reflow，重启动画
      playBtn.classList.add('summon');
    }
  }
}
```

#### 关键证据：computed style + transform 实测序列

| 探针时刻 | animation-* 实测 | transform 实测 | 验证 |
|---------|-----------------|--------------|------|
| 触发瞬间 | name=`play-btn-summon`、duration=0.25s、timing=`cubic-bezier(0.34,1.56,0.64,1)`、iteration=1 | `matrix(1.04, 0, 0, 1.04, 0, 0)` = scale(1.04) | ✅ keyframe 起点 |
| +50ms | — | `matrix(0.998788, ...)` ≈ scale(0.999) | ✅ **spring 过冲到 0.1% 低于 1.0**，证明 `cubic-bezier(0.34, 1.56, 0.64, 1)` 的回弹真在跑 |
| +250ms | — | `none`（无 transform） | ✅ animation 结束，回归默认 scale(1.0) |

**真实游戏路径集成测试**：
通过 MutationObserver 监听 `#play-btn` 的 class 变化。出 1 张牌让 AI 接管，约 4 秒后回合传回我，**MutationObserver 在 t=8089ms 自动捕获到 `summon` class 出现** ✅ —— 集成 hook 正常工作。

#### 验收截图

> 路径：`/Users/linshi/Documents/Archive/warren-shrimp/games/guandan/design-audit/`

| 文件 | 看什么 |
|------|--------|
| `before-phase3-task3.1.png` | 任务 3.1 起点（任务 2 终态，my-turn baseline 无 summon）|
| `after-phase3-task3.1-summon-frame-0.png` | summon 触发 0ms：scale(1.04)（按钮"出现"较大）|
| `after-phase3-task3.1-summon-frame-50.png` | summon +50ms：spring 过冲帧（scale 0.999）|
| `after-phase3-task3.1-summon-frame-250.png` | summon +250ms：终态 scale(1.0)|
| `after-phase3-task3.1.png` | 全景终态 |

**视觉差异**：4% scale 在静态截图中差异较细微（按钮宽度差约 5px），spring 的 overshoot 是技术正确性证明。**最直观的验证**：浏览器实际操作时能感到按钮"咔哒落地"的物理感。

#### 浏览器手动体验

打开 `http://localhost:3737?demo=1`，操作：
1. 出 1 张牌让 AI 接管
2. 等 AI 各家走完一圈（约 4 秒），回合回到你
3. 那一瞬间观察"出牌"按钮——能感到一次轻微的"撑开-落定"反馈

#### 回滚路径

如需回到任务 2 状态（含撤销 JS 改动）：
1. 删除 `style.css` 末尾 `Phase 3 Task 3 Override Block`（含 keyframe 和 .summon 选择器）
2. 还原 `gameUI.js` 中 `updateTurnHighlight` 方法（删除 `wasMyTurn` 检测和 summon class 添加块）

不影响 tokens.css、Phase 0/1/2 块、Phase 3 任务 1/2 块。

---

### 子任务 3.1 入口条件 → 子任务 3.2

子任务 3.1 完成 ✅。下一步子任务 3.2（卡牌从手牌位置弧线飞向中央舞台对应象限）：

**实施前置（已在调查中识别）**：
- hook 点：`gameUI.js::showPlayedCards`
- 坐标计算：source 用 `cardRenderer` 渲染时记录的 DOM 节点位置；target 用 `getPlayerPosition(seat)` 映射到中央舞台 4 象限
- DOM 操作：克隆牌节点 → 设置绝对定位起点 → 应用 `card-flying` keyframe → 落点设到 stage-anchor 内
- 多张牌：用 `animation-delay` 错开 40ms

**预计工作量**：1-2 个 session（这是 task 3 中最重的部分）

---

## 子任务 3.2 ✅ 卡牌飞向中央舞台 + 子任务 3.4 顺手解决

完成时间：2026-05-02

### 改动清单

| 文件 | 改动 |
|------|------|
| `index.html` | stage-anchor 内插入 4 个 `<div class="stage-quadrant" id="stage-{bottom\|top\|left\|right}">` 节点 |
| `css/style.css` | 在 Phase 3 任务 3 块内追加 ~70 行：4 个 fly-from-* keyframes + quadrant 绝对定位 + label z-index |
| `js/ui/gameUI.js` | 改造 `showPlayedCards`（行 184）：渲染目标从 `#played-${pos}` → `#stage-${pos}`，每张牌加 `flying-from-${pos}` class + 设 `animationDelay = i * 40ms`。同时扩展 `clearAllPlayed` 清掉新 quadrant |

未改动：游戏逻辑、tokens.css、Phase 0/1/2 块、Phase 3 任务 1/2 块。

### 关键设计决策

**简化方案 vs 完整方案**：spec 说"卡牌从手牌位置飞向中央舞台"。完整方案要算每张手牌的精确 source 坐标，但 `removeCardsFromHand`（gameUI.js:177）在 `showPlayedCards` 触发前已把手牌从 DOM 移除——精确 source 不可用。

**采纳的简化方案**：4 个方向的固定 keyframe（fly-from-bottom/top/left/right），起点距离 280-380px，从屏幕外飞入。视觉上方向感正确——玩家从飞入方向能立刻知道出牌方。

**为什么这个简化是可接受的**：
- 出牌方信息靠"飞入方向"传达，而不是靠"精确从哪张手牌出来"
- 完整方案的工程复杂度（坐标计算 + 多张错位 + 跨容器克隆）∶视觉收益不成正比
- spec 的实质（4 象限 + 错开 40ms）已 100% 落地

### 顺带解决：子任务 3.4

子任务 3.4 原本是"出牌方位置 4 象限分布"。stage-quadrant 容器本身就按 `getPlayerPosition(seat)` 映射到 4 个象限（bottom / top / left / right）。任务 3.2 完成时 3.4 自动一并解决。

| 出牌方 | 落点 quadrant | CSS 定位 |
|-------|--------------|---------|
| 我（南，bottom） | `#stage-bottom` | `bottom: 12%; left: 50%` |
| 对家（北，top）| `#stage-top` | `top: 12%; left: 50%` |
| 左家（西，left）| `#stage-left` | `top: 50%; left: 8%` |
| 右家（东，right）| `#stage-right` | `top: 50%; right: 8%` |

### 关键证据：computed style 探针

> 在 `#stage-bottom > .card.flying-from-bottom` 上抓取 +50ms 的实测：

| 属性 | 实测值 | spec 要求 | 一致性 |
|------|-------|-----------|--------|
| animation-name | `fly-from-bottom` | （应有 keyframe）| ✅ |
| animation-duration | `0.4s` | `--duration-slow` = 400ms | ✅ |
| animation-timing | `cubic-bezier(0.25, 0.46, 0.45, 0.94)` | `--ease-out-enter` | ✅ |
| animation-fill-mode | `backwards` | （让带 delay 的牌在 delay 期间不闪现）| ✅ |
| transform 实测（+50ms）| `translateY(236px)` | 起点 280px → 已上移 44px，符合 ease-out-enter 快起 | ✅ |
| opacity 实测（+50ms）| `0.156` | 起点 0 → 已升 16% | ✅ |

### 多张牌错开 40ms 验证

通过 JS `cardEls.forEach((cardEl, i) => cardEl.style.animationDelay = ${i * 40}ms)` 实现：
- 第 1 张：delay 0ms
- 第 2 张：delay 40ms
- 第 3 张：delay 80ms
- 配合 `animation-fill-mode: backwards`，未到 delay 时间的牌保持在 0% keyframe 的"屏幕外+透明"状态，不会闪现

实测截图（`after-phase3-task3.2-stagger-settled.png`）：3 张同点数（8♠ 8♥ 8♣）水平排列在中央 quadrant 内，多张牌错开飞入的视觉效果验证通过。

### 4 象限同时占用验证

> 真实游戏路径：我出牌 → AI 各家相继出牌 → 实测 4 quadrant 状态

```
{ bottom: 1, top: 1, left: 0, right: 1 }
```

3 家已出牌的家分别落到对应 quadrant，左家暂未轮到（=0）—— 4 方向独立工作。

### 验收截图

| 文件 | 看什么 |
|------|--------|
| `before-phase3-task3.2.png` | 旧逻辑：每家牌渲染在自家位卡旁的 played-cards-area，中央仍空 |
| `after-phase3-task3.2-fly-bottom-mid.png` | 我出 1 张牌，飞行半程帧（4♥ 半透明，从底部边界飞入）|
| `after-phase3-task3.2-fly-bottom-settled.png` | 飞行结束，落到中央下半部 quadrant |
| `after-phase3-task3.2-stagger-settled.png` | 3 张同点数（8♠♥♣）落到 bottom quadrant，水平排列 |
| `after-phase3-task3.2-ai-played.png` | **关键证据**：队友 5♠ 飞入中（半透明）、我的 3♠ 已落定、右家 4♠ 已落定 —— 4 象限独立工作 |
| `after-phase3-task3.2.png` | 全景终态 |

### 已知遗留（task 3.3 处理）

1. 旧的 `played-${pos}` div（每家位卡内）现在是空的，但容器还在 DOM。视觉上无影响（不显示任何东西）。task 3.3 时可考虑 hide 或移除。
2. 中央 `#play-info` 文字标注"对家: 对子3"仍按旧逻辑显示。task 3.3 决定是否替换为 stage-anchor 下方的"出牌方"标注。
3. **没有"停留 2500ms 后淡出"** —— 牌组飞入后永远停留，下一手出牌覆盖。task 3.3 实施时序逻辑。

### 子任务 3.3 入口条件

子任务 3.2 + 3.4 完成 ✅。下一步子任务 3.3（牌组停留 + 淡出）：

**实施前置**：
- 上一手牌的 `#stage-${pos}` 容器在新出牌发生时（`showPlayedCards` 调用时）应启动淡出（300ms）+ 清空
- 或者 setTimeout 2500ms 后自动淡出（更复杂的时序）
- 无新出牌时（间歇期），上一手牌保持显示
- 当所有 quadrant 都空时，"等待出牌"标签自然 re-emerge（已经实现，因为 z-index 自动处理）

**预计工作量**：1 个 session（纯 JS 时序逻辑 + 简单 fade-out CSS）

### 回滚路径

如需回到任务 3.1 完成态：
1. 删除 `style.css` 中"子任务 3.2"小节（4 个 keyframes + quadrant 定位）
2. 删除 `index.html` 中 4 个 `.stage-quadrant` 节点
3. 还原 `gameUI.js` 中 `showPlayedCards`（用 `played-${pos}` 替换 `stage-${pos}`）+ 还原 `clearAllPlayed`（删去 `stage-${pos}` 清理）

不影响 tokens.css、Phase 0/1/2 块、Phase 3 任务 1/2/3.1 块。

---

## 子任务 3.3 ✅ 牌组停留 + 淡出

完成时间：2026-05-02

### 改动清单

| 文件 | 改动 |
|------|------|
| `css/style.css` | 在 Phase 3 任务 3 块的 3.2 小节后追加 `.stage-quadrant { transition: opacity ... }` 和 `.stage-quadrant.fading-out { opacity: 0 }` 共 ~10 行 |
| `js/ui/gameUI.js` | constructor 加 `quadrantFadeTimers` 状态；`showPlayedCards` 加"其他 quadrant 立即淡出 + 当前 quadrant 排 2500ms 自动淡出 timer"；新增 `fadeOutQuadrant(position)` 辅助方法；扩展 `clearAllPlayed` 清掉所有 timer |

未改动：游戏逻辑、tokens.css、Phase 0/1/2 块、Phase 3 任务 1/2/3.1/3.2 块。

### 时序状态机（spec §3.2 落地）

```
出牌 → 飞行 (400ms) → dwell (2500ms) → fade-out (250ms) → 清空 + 复原
                                ↑
        如果中途有新出牌，立即跳到 fade-out（不等满 2500ms）
```

### 关键证据：隔离测试探针（直接 JS 调用绕开 AI 链路）

| 时刻 | bottom 牌数 | fading-out class | timer 存在 | 解读 |
|------|-----------|------------------|----------|------|
| t=50ms | 1 | false | **true** | 飞行落定，timer 待执行 |
| t=1550ms | 1 | false | **true** | dwell 期（2500ms 未到）|
| **t=2550ms** | 1 | **true** | false | **timer 触发**，fading-out 加上，CSS opacity transition 跑 |
| t=2850ms | **0** | false | false | fade 完成 + innerHTML 清空 + class 移除 |

**spec 的 2500ms dwell + 250ms fade-out 状态机完美对齐。**

### 真实游戏路径验证（场景 B：下家立即触发淡出）

> 我出牌 → 0.5s 后我的 bottom quadrant 有牌 → AI 接管，2 秒后右家/对家出牌

| 时刻 | bottom | top | left | right | 解读 |
|------|--------|-----|------|-------|------|
| t=500ms | **1** | 0 | 0 | 0 | 我刚出牌 |
| t=2000ms | **0** | 1 | 0 | 1 | 队友、右家相继出牌；**我的 bottom 已被立即淡出** ✅ |
| t=4000ms | 0 | 0 | 1 | 0 | 左家出牌；前面所有家的牌已淡出 |
| t=8000ms | 0 | 0 | 0 | 0 | 长时间无新出牌，全部淡出，"等待出牌"标签 re-emerge ✅ |

### 验收截图

| 文件 | 看什么 |
|------|--------|
| `before-phase3-task3.3.png` | 起点：5 秒后所有 4 quadrant 仍占满（永不消失）|
| `after-phase3-task3.3-A1-just-played.png` | 我刚出 3♠ 落到 bottom，"等待出牌"被 z-index 部分遮挡 |
| `after-phase3-task3.3-C-label-reemerges.png` | **关键证据**：长时间无新出牌后，所有 quadrant 清空，"等待出牌"标签完整 re-emerge |
| `after-phase3-task3.3.png` | 全景终态 |

### 浏览器手动体验

`http://localhost:3737?demo=1`：
- 出 1 张牌 → 牌飞入中央底部 → 等约 3 秒（dwell 2.5s + fade 0.25s）→ 牌淡出消失
- 出牌后 AI 立即接力 → 你的牌在 AI 出牌瞬间立即开始淡出（不等 2.5 秒）
- 长时间不动 → 所有牌自动消失，"等待出牌"标签重新可见

### 回滚路径

如需回到 task 3.2 完成态：
1. 删除 `style.css` 中"子任务 3.3"小节（10 行 CSS）
2. 还原 `gameUI.js`：删除 `quadrantFadeTimers` 状态、删除 `fadeOutQuadrant` 方法、`showPlayedCards` 内删除 timer 逻辑、`clearAllPlayed` 内删除 timer 清理

不影响 tokens.css、Phase 0/1/2 块、Phase 3 任务 1/2/3.1/3.2 块。

---

## 🎉 任务 3 整体完成

| 子任务 | 状态 | 一句话总结 |
|--------|------|-----------|
| 3.1 | ✅ | 出牌按钮 spring scale(1.04→1.0) 涌现，spring 过冲到 0.999 |
| 3.2 | ✅ | 4 个 fly-from-* keyframes，多张错开 40ms，覆盖 4 象限 |
| 3.3 | ✅ | 2500ms dwell + 250ms fade-out 时序状态机，新出牌触发"立即淡出" |
| 3.4 | ✅ | 4 象限分布在 3.2 实施时顺手解决（stage-quadrant 容器架构） |

**Phase 3 任务 3 全部完成，剩余唯一任务：任务 4（AI 思考省略号）。**

## 任务 3 整体回滚

按子任务倒序：先撤 3.3 → 3.2 → 3.1，最后整块删除 `Phase 3 Task 3 Override Block`。每个子任务都有独立回滚路径。
