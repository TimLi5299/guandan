# 阶段 3 · 任务 1 · 基础过渡动效 · 改造记录

> 完成时间：2026-05-02  
> 性质：把 Phase 1 v2 / Phase 2 中故意 kill 的 transition 用 DESIGN_TOKENS §6 时长 + 缓动曲线恢复回来。  
> 改动隔离：在 `style.css` 末尾追加 `Phase 3 Task 1 Override Block`。

---

## 一、改动清单（仅 1 个文件）

| 文件 | 改动 |
|------|------|
| `css/style.css` | 末尾追加 ~70 行的 `Phase 3 Task 1 Override Block` |

未改动：tokens.css、所有 JS、HTML、Phase 0/1/2 块、游戏逻辑。

---

## 二、Token × 应用场景映射

| Token | 时长 | 缓动曲线 | 用在哪 |
|-------|------|---------|--------|
| `--duration-fast` | 150ms | `--ease-out-enter` | 卡牌悬停上升、按钮颜色/阴影变化、汉堡按钮 hover |
| `--duration-normal` | 250ms | `--ease-in-out-state` | 玩家位卡 active-turn 切换、按钮组整体 opacity 渐变 |
| `--duration-normal` | 250ms | `--spring-feedback` | 卡牌选中（带 12% 超出回弹的"咔哒"感） |
| `--duration-fast` | 150ms | `--spring-feedback` | 按钮松开（scale 1 弹回） |
| `--duration-fast` | 150ms | `--ease-in-out-state` | 按钮按下（scale 0.96 进入） |

---

## 三、5 个改造点

### 1. 玩家位卡（覆盖 Phase 1 v2 的 `transition: none !important`）

回合切换时（active-turn 类的添加/移除）：边框宽度（2px↔3px）、边框色、底色、box-shadow 全部 250ms 平滑过渡，而非阶段 1/2 的瞬时切换。

```css
.player-info,
.player-info.active-turn {
  transition:
    border-color   var(--duration-normal) var(--ease-in-out-state),
    border-width   var(--duration-normal) var(--ease-in-out-state),
    background-color var(--duration-normal) var(--ease-in-out-state),
    box-shadow     var(--duration-normal) var(--ease-in-out-state)
    !important;
}
```

> 头像圈（`.player-avatar`）和计数徽章（`.card-count`）独立设 transition，让阵营色升级 muted → primary 时一同渐变。

### 2. 卡牌（覆盖 Phase 2 的 `transition: none`）

**两层 transition** 设计：
- **静止 → 悬停**：fast (150ms) + ease-out-enter — 自然抬起感
- **静止 → 选中**：normal (250ms) + spring-feedback — 带 12% 回弹的"咔哒"

```css
.hand-area .card {
  transition:
    transform  var(--duration-fast) var(--ease-out-enter),
    box-shadow var(--duration-fast) var(--ease-out-enter)
    !important;
}
.hand-area .card.selected {
  transition:
    transform  var(--duration-normal) var(--spring-feedback),
    box-shadow var(--duration-normal) var(--spring-feedback)
    !important;
}
```

**为什么悬停和选中分两档？** 悬停是"试探/预览"，应快速响应不阻碍；选中是"承诺/决定"，需要带"咔哒"的反馈感强化操作确认。两档 token 不同曲线天然区分。

### 3. 按钮（覆盖 Phase 2 的 `transition: none !important`）+ 加 spec 要求的 `:active scale(0.96)`

**精妙的 transition 二态切换**：

```css
/* 默认 transition（包括"松开"过渡）：transform 用 spring 弹回 */
.action-buttons .btn {
  transition:
    background-color var(--duration-fast) var(--ease-out-enter),
    box-shadow       var(--duration-fast) var(--ease-out-enter),
    transform        var(--duration-fast) var(--spring-feedback)
    !important;
}

/* :active 时 transition：transform 用 ease-in-out 收紧（按下） */
.action-buttons .btn:active {
  transition:
    background-color var(--duration-fast) var(--ease-out-enter),
    box-shadow       var(--duration-fast) var(--ease-out-enter),
    transform        var(--duration-fast) var(--ease-in-out-state)
    !important;
}

/* 按下视觉反馈（DESIGN_TOKENS §6.3E）*/
.action-buttons #play-btn:active,
.action-buttons #pass-btn:active,
.action-buttons #sort-btn:active,
.action-buttons #hint-btn:active {
  transform: scale(0.96) !important;
}
```

> **CSS 二态 transition 怎么生效？**  
> 进入 `:active` 状态（鼠标按下）使用 `:active` 上的 transition → 按下用 ease-in-out。  
> 离开 `:active` 状态（鼠标松开）使用 `.btn` 上的 transition → 松开用 spring（带回弹）。  
> 这正好对应 DESIGN_TOKENS §6.3E 的"按下收紧 / 松开弹回"。

### 4. 按钮组整体 opacity 渐变（非我回合 ↔ 我的回合）

JS（`gameUI.js:261`）通过 inline `actionBtns.style.opacity = '0.4' or '1'` 切换。给容器加 transition 后，这个数值变化会走 250ms 渐变而非瞬切。

```css
.action-buttons {
  transition: opacity var(--duration-normal) var(--ease-in-out-state);
}
```

### 5. 汉堡按钮 hover 反馈

Phase 1 v2 漏了 hover 反馈，本次补上：

```css
.back-to-products {
  transition: background-color var(--duration-fast) var(--ease-out-enter);
}
.back-to-products:hover {
  background: rgba(20, 56, 36, 0.92);
}
```

---

## 四、关于 `!important` 的使用

**为何任务 1 块多处使用 `!important`？**

Phase 1 v2 / Phase 2 当时为了强制 kill 旧 CSS 中已存在的 `transition: all 0.3s` 等遗留属性，使用了 `transition: none !important;`。CSS 规则：要覆盖一个 `!important`，必须同样用 `!important`。

**这是已知 anti-pattern 吗？** 是，但在分阶段改造的场景下可接受：
- 阶段化覆盖块的边界清晰，回滚直接删块即可
- `!important` 本身没有递进特性，到本块为止终点
- 避免触碰 Phase 1/2 历史块（保持回滚边界）

未来 Phase 3 任务 4 完成后做 final cleanup 时，可考虑把 Phase 1/2/3 块的 `!important` 一次性梳理掉，但**当前阶段不动**。

---

## 五、验收证据截图

> 路径：`/Users/linshi/Documents/Archive/warren-shrimp/games/guandan/design-audit/`

| 文件 | 看什么 |
|------|--------|
| `before-phase3-task1.png` | 任务 1 起点（= Phase 2 终态）|
| `after-phase3-task1.png` | 任务 1 静态终态全景，与 before 对比静态视觉**应一致**（这是任务 1 的特征：动效是"过程"，终态没差） |
| `after-phase3-task1-selected.png` | 静止终态：3 张卡牌选中（spring 收住后）|
| **`after-phase3-task1-selected-midflight.png`** ⭐ | **关键证据**：点击后 100ms 抓帧 — 卡牌已上升至接近终态、带金色 ring，spring 还在收紧。**证明 transition 真在跑** |
| `after-phase3-task1-btn-active.png` | 按钮 :active 半程帧（scale 0.96 已生效） |
| `after-phase3-task1-myturn.png` | 我的回合 baseline |
| `after-phase3-task1-turn-fadeout-mid.png` | 出牌后 150ms 抓帧（按钮组 opacity 渐变中） |
| `after-phase3-task1-not-myturn.png` | 出牌后 550ms 抓帧（opacity 完成 → 0.4） |

---

## 六、为什么静态截图无法完整展示动效

CSS transition 是"两个状态之间的中间帧"。任务 1 的产出物本质上是"时间维度上的视觉变化"，PNG 单帧只能展示终态。本文档已通过：
- **半程帧**（midflight 系列）证明动画轨迹
- **token 引用表**说明每一处用的时长 + 曲线
- **CSS diff** 让人直接看代码

补充验证方式（用户可手动）：
- 在浏览器打开 `localhost:3737?demo=1`，点选卡牌：能感到"咔哒"上升
- 鼠标按住"出牌"按钮：能感到 4% 缩小
- 出牌后等回合切：底部按钮组在 1/4 秒内淡到 0.4

---

## 七、回滚路径

如需回到任务 1 之前（Phase 2 状态）：删除 `style.css` 末尾的 `Phase 3 Task 1 Override Block`（从注释起到`阶段 3 任务 1 块结束`）。

不影响 tokens.css、Phase 0/1/2 块、其他文件。

---

## 八、任务 2 入口条件

任务 1 完成 ✅。下一步任务 2（回合脉冲光晕，解决初始 REPORT 的 P0），入口：

- `PROJECT_STATUS.md` 仍标 `Client / UX` 为 active
- 任务 2 在另一个 session 推进（保持每个 session 1 个任务的节奏）
- 任务 2 范围：infinite 脉冲 box-shadow 动画 + 切换时光晕涌现 + 按钮组 0.45 → 1.0 入场
