# 阶段 2 · 组件改造记录

> 完成时间：2026-05-02  
> 性质：组件层视觉重塑（手牌 + 按钮 + 中央舞台），不动游戏逻辑、不加 transition 时长。  
> 改动隔离：在 `style.css` 末尾追加独立的 `Phase 2 Override Block`，与阶段 1 块并列。

---

## 一、改动清单

| 文件 | 类型 | 改动 |
|------|------|------|
| `index.html` | 修改 1 处 | `.center-play-area` 内插入 `<div class="stage-anchor"><span class="stage-anchor-label">等待出牌</span></div>`（中央舞台视觉锚 DOM 节点） |
| `css/style.css` | 末尾追加 Phase 2 Override Block（约 165 行） | 手牌区 4 态 + 三级按钮权重 + 中央舞台样式 + 重写 zoomFade keyframes |

未改动：阶段 0/1 的所有产出（tokens.css、阶段 1 块）、JS 文件、游戏逻辑、左右家位置。

---

## 二、三个改造点

### 改造 1：手牌区（COMPONENT_SPECS §2）

| 维度 | 改造前 | 改造后 | Token |
|------|--------|--------|-------|
| 卡牌宽 × 高 | 70 × 100 | **48 × 72** | — |
| 重叠量（margin-left）| -40px | **-16px** | `var(--space-md)` 的负值 |
| 单卡露出宽度 | 30px | **32px** | — |
| 圆角 | 6px | **6px** | `var(--radius-card)` |
| 点数字号 | 24px / 900 | **18px / 700** | `var(--type-card-rank-*)` |
| 花色字号 | 20px / 默认 | **12px / 400** | `var(--type-card-suit-*)` |
| 静止阴影 | 旧 inline shadow | `var(--shadow-card-rest)` | DESIGN_TOKENS §5.2 |
| 手牌区底边距 | 10px | **`var(--space-xl)` (32px)** | 分离"我的牌"与"我的操作" |

**4 态视觉：**

| 状态 | 触发 | 视觉 | Token |
|------|------|------|-------|
| 静止 | 默认 | translateY(0)，shadow-card-rest | — |
| 悬停 | mouseover | **translateY(-10px) + scale(1.08) + shadow-card-hover** | DESIGN_TOKENS §5.2 |
| 选中 | click | **translateY(-20px) + shadow-card-selected**（含 2px 金色 ring + 12px 琥珀光晕）| DESIGN_TOKENS §5.2 |
| 不可出牌 | 加 `.unplayable` class（游戏逻辑接入）| **opacity 0.40 + saturate 0.3 + cursor not-allowed** | COMPONENT_SPECS §2.2 |

> **没有 transition 时长**：所有状态切换 0ms 即时生效（`transition: none`），动效统一留给阶段 3。

---

### 改造 2：底部操作按钮组（COMPONENT_SPECS §4）

#### 2a. 三级视觉权重落地

| 层级 | 按钮 | 尺寸 | 背景 | 字号 / 字重 | Token 来源 |
|------|------|------|------|------------|-----------|
| **主 CTA** | 出牌 (#play-btn) | **120 × 48** | `var(--semantic-primary)` 金色 | 15px / 700 / 0.5px ls | DESIGN_TOKENS §2.3, §4 |
| **次要操作** | 不出 (#pass-btn) | **96 × 40** | `var(--semantic-secondary)` 蓝灰 | 14px / 600 / 0.3px ls | DESIGN_TOKENS §2.3, §4 |
| **工具** | 理牌 (#sort-btn) / 提示 (#hint-btn) | **80 × 32** | `var(--semantic-tertiary)` 半透明 + 1px border | 13px / 400 | DESIGN_TOKENS §2.3, §4 |

**视觉结果：** 玩家扫视优先级：出牌 (金/最大) → 不出 (蓝/中等) → 工具 (透/最小)。原本 4 个等权按钮的视觉混乱已消除。

#### 2b. 左右分组重排

| 维度 | 改造前 | 改造后 |
|------|--------|--------|
| 顺序 | `[理牌][提示][不出][出牌]` 等距居中 | `[理牌][提示] ◀◀ ▶▶ [不出][出牌]` 左右分组 |
| CSS 实现 | `justify-content: center; gap: 16px` | `justify-content: flex-start` + `#pass-btn { margin-left: auto }` |
| 左右间距 | 16px 等距 | 工具组与操作组之间至少 `var(--space-xl)` (32px)，实际更大（margin:auto 接管） |

> 工具区在左、操作区在右——配合鼠标/手指的"右移决策"自然轨迹。

#### 2c. 三态反馈（颜色变化即时生效，无 transition）

| 按钮 | hover 背景 | active 背景 | 阴影变化 |
|------|-----------|-----------|----------|
| 出牌 | `var(--semantic-primary-hover)` `#F5C060` | `var(--semantic-primary-pressed)` `#C4891A` | shadow-btn-rest → shadow-btn-pressed |
| 不出 | `var(--semantic-secondary-hover)` `#4F87AA` | secondary 原色 | 同上 |
| 工具 | `rgba(255,255,255,0.14)` | `rgba(255,255,255,0.06)` | 无 |

#### 2d. 出牌按钮禁用态（COMPONENT_SPECS §4.2 关键设计）

```css
.action-buttons #play-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  /* 颜色保持金色不变 */
}
```

> **为什么不变色？** 让玩家在"未选牌"和"已选牌"之间看到同一个金色按钮，建立"金色 = 出牌"的色彩-功能映射；而不是禁用时变灰、激活时变金的二元跳变。

#### 2e. 整组按钮非我回合灰化

| 触发 | 实现 | 实测 |
|------|------|------|
| 服务器返回 `currentTurn !== mySeat` | JS 直接设 inline `actionBtns.style.opacity = '0.4'` 和 `pointerEvents = 'none'` | 探针验证：`opacity = "0.4", pointer-events = "none"` ✅ |

> 注：DESIGN_TOKENS 规范要求 0.45，JS 历史值是 0.4，差距不可感知，未改 JS（阶段 2 不动游戏逻辑）。

---

### 改造 3：中央舞台视觉锚（COMPONENT_SPECS §3.1）

| 维度 | 改造前 | 改造后 | Token |
|------|--------|--------|-------|
| 视觉存在 | 无（只有 .play-info 文字临时显示）| 480 × 220 矩形常驻 | — |
| 底色 | — | `var(--surface-felt-stage)` `#1E5435`（比主桌面亮 8%）| DESIGN_TOKENS §2.1 |
| 边框 | — | `1px dashed rgba(255,255,255,0.10)` | COMPONENT_SPECS §3.1 |
| 圆角 | — | `var(--radius-stage-hint)` `8px` | DESIGN_TOKENS §5.1 |
| 中央标签 | — | "等待出牌"，`var(--text-muted)`，type-system-msg (13px/400/1.5lh) | DESIGN_TOKENS §4 |
| DOM | 仅 `.play-info` | 新增 `.stage-anchor > .stage-anchor-label`，play-info 仍可在其上叠加显示瞬时消息 | — |
| zoomFade 动画 | 旧 keyframes 用 `transform: scale()` | 重写为含 `translate(-50%, -50%)` 锚定，让 .play-info 与 .stage-anchor 中心对齐 | — |

**视觉结果：** 桌面中央不再是空绿色——明确告诉玩家"这里是行动会发生的位置"，并为阶段 3 的"出牌飞行 + 停留"提供天然的视觉容器。

---

## 三、严格遵守的"不做"清单

| 应做的（阶段 3）| 阶段 2 是否触碰 |
|----------------|----------------|
| 任何 transition 时长 | ❌ 全部 0ms / `transition: none` |
| 出牌停留 2.5s 后淡出 | ❌ 未实现时序逻辑 |
| 卡牌从手牌飞向中央 | ❌ 未实现飞行动效 |
| 回合切换脉冲光晕 | ❌ 阶段 1 已 kill 动效，阶段 2 维持 |
| 旋转左右家位卡 90° | ❌ 位置布局保持 |
| 改 JS 游戏逻辑 | ❌ 仅探针读取，未修改 |

---

## 四、验收证据截图清单

> 路径：`/Users/linshi/Documents/Archive/warren-shrimp/games/guandan/design-audit/`  
> 查看方式：Finder + 空格 Quick Look

| 文件 | 看什么 |
|------|--------|
| `before-phase2.png` | 阶段 1 完成态全景（= 阶段 2 起点）|
| `after-phase2.png` | 阶段 2 全景，对比可见：舞台锚出现 + 按钮重排 + 卡牌缩小 |
| `after-phase2-detail-stage.png` | 中央舞台 480×220 虚线框 + "等待出牌"标签 |
| `after-phase2-detail-buttons.png` | 三级按钮权重对比：金色出牌 ≫ 蓝色不出 > 透明工具 |
| `after-phase2-detail-hand.png` | 手牌区静止态：48×72 卡牌 + -16px 重叠 |
| `after-phase2-selected-3cards.png` | **场景 2**：选中 3 张，金色 ring + 光晕，对比未选中卡 |
| `after-phase2-selected-3cards-detail.png` | 同场景按钮区裁剪 |
| `after-phase2-not-my-turn.png` | **场景 3**：非我回合，按钮组整体灰化（opacity 0.4） |
| `after-phase2-not-my-turn-detail.png` | 同场景按钮区裁剪 |

---

## 五、技术细节备忘

### 5a. `margin-left: auto` 实现按钮分组

CSS 中两组按钮在同一 flex 容器内，第三个按钮（#pass-btn）设置 `margin-left: auto` 即可让其和后续兄弟元素全部贴齐右边。这是 CSS 原生方案，比为两组分别套 `<div>` 容器更简洁、不破坏 DOM 结构。

### 5b. 卡牌选中态的 ring 来自 box-shadow 而非 border

`var(--shadow-card-selected)` 的值是 `0 12px 22px rgba(0,0,0,0.50), 0 0 0 2px #E8A230, 0 0 12px rgba(232,162,48,0.40)`——其中 `0 0 0 2px #E8A230` 模拟一个 2px 实心环。这避免了改变 border-width 引发的卡牌实际尺寸跳变（border 算入盒模型），保持选中前后宽高一致。

### 5c. zoomFade keyframes 必须重写

原 `.play-info` 用 `transform: scale()` 自身居中。我把它改为 `position: absolute + transform: translate(-50%, -50%) scale()` 后，必须同步更新 keyframes 的所有关键帧，否则动画会把 translate 重置导致 .play-info 偏移。这是阶段 2 唯一改动到的"现有 CSS 块"。

### 5d. JS 设的 `opacity: 0.4` 与 spec 的 `0.45` 差异

DESIGN_TOKENS / COMPONENT_SPECS 规范值是 0.45，JS（gameUI.js:261）历史硬编码 0.4。差距不可感知（0.05 ≈ 1.3% 透明度差），且修改 JS 属于"动游戏逻辑"，阶段 2 不动 JS。如有强一致需求，阶段 3 可以一行 JS 修复（gameUI.js:261 把 '0.4' 改为 '0.45'）。

---

## 六、阶段 3 入口条件

确认以下 6 项后即可进入阶段 3：

- [ ] 桌面中央可见 480×220 虚线舞台框 + "等待出牌"
- [ ] 出牌按钮明显大于其他三个按钮（金色填充，120×48）
- [ ] 不出按钮位置在出牌左侧，蓝色，96×40
- [ ] 理牌、提示在最左侧，半透明小按钮
- [ ] 选中 3 张牌时，被选中的牌升起 20px 并带金色 ring 光晕
- [ ] 非我回合时整组按钮灰化（探针确认 opacity=0.4）

---

## 七、回滚路径

如需回到阶段 1 v2 状态：

1. 删除 `style.css` 末尾的 `Phase 2 Override Block`（从 `阶段 2 组件改造` 注释起到 `阶段 2 块结束`）
2. 删除 `index.html` 中 `<div class="stage-anchor">...</div>` 节点（保留 `<div class="play-info">`）

不影响 tokens.css、不影响阶段 1 v2 块。
