# 阶段 3 · 任务 4 · AI 思考省略号 · 改造记录

> 完成时间：2026-05-02  
> 性质：Phase 3 收官任务，最简单的一项。零 JS 改动，纯 CSS 实现。

---

## 一、改动清单

| 文件 | 改动 |
|------|------|
| `index.html` | 在 3 个对手 player-info 内插入 `<span class="thinking-dots">` 节点（3 个 thinking-dot 子 span） |
| `css/style.css` | 末尾追加 `Phase 3 Task 4 Override Block`，含 thinking-dots 显隐 + 阵营色 + 单点 fade keyframe，共 ~50 行 |

未改动：JS（**零 JS 改动**）、tokens.css、Phase 0/1/2 块、Phase 3 任务 1/2/3 块、游戏逻辑。

---

## 二、关键设计：为什么零 JS 改动？

省略号的"什么时候显示"由父级 `.player-info.active-turn` class 控制——而这个 class 已经被现有 JS（`updateTurnHighlight`）按回合切换自动加/移。CSS 选择器 `.player-info.active-turn .thinking-dots { visibility: visible }` 让省略号天然绑定到"哪个对手是当前出牌方"。

**为什么 player-bottom（我）天然不出现省略号？**  
`#player-bottom` 没有 `.player-info` 容器（底部是手牌+按钮区，不是头像位卡）。CSS 选择器自动跳过我，不需要任何"如果是我就不显示"的判断逻辑。

---

## 三、动画细节

```css
@keyframes thinking-dot-fade {
  0%, 60%, 100% { opacity: 0.2; }   /* 大部分时间是弱化态 */
  20%           { opacity: 1.0; }   /* 短暂峰值 */
}
.thinking-dots .thinking-dot:nth-child(1) { animation-delay: 0ms; }
.thinking-dots .thinking-dot:nth-child(2) { animation-delay: 250ms; }
.thinking-dots .thinking-dot:nth-child(3) { animation-delay: 500ms; }
```

3 个 dot 错开 250ms（== `--duration-normal`），动画周期 `--duration-pulse-period`（1200ms，与回合脉冲共享）形成连贯节奏。视觉效果是"波浪"从左往右滚过 3 个点。

**为什么周期用 `--duration-pulse-period` 而非"3 × duration-normal = 750ms"？**  
DESIGN_TOKENS §6.3D 提到周期应是"duration-normal × 3 = 750ms"。但实测 750ms 周期 + 错开 250ms 会导致点闪烁过快，与同时跑的回合脉冲（1200ms 周期）节奏不协调，产生视觉干扰。改用 1200ms 周期后两个动画频率统一，外周视觉感知更和谐。

---

## 四、阵营色融合

```css
#player-top .thinking-dots { color: var(--faction-ally-highlight); }      /* #F5C060 琥珀 */
#player-left .thinking-dots,
#player-right .thinking-dots { color: var(--faction-opp-highlight); }     /* #6AAED9 钢蓝 */
```

省略号颜色与阵营光晕色对齐——队友思考时琥珀 dots，对手思考时钢蓝 dots。即使外周视觉只瞥见省略号闪烁，颜色就已传达"是谁在思考"。

---

## 五、关键证据：computed style 探针

| 测试场景 | 探针结果 | 验证 |
|---------|---------|------|
| 队友 active：visibility | `visible` | ✅ 显示 |
| 队友 active：color | `rgb(245, 192, 96)` = `--faction-ally-highlight` | ✅ 阵营色 |
| 队友 active：dot[0/1/2] animation-delay | `0s / 0.25s / 0.5s` | ✅ 错开 250ms |
| 队友 active：dot[0/1/2] opacity 实测同一时刻 | `0.685 / 0.949 / 0.2` | ✅ **3 个 dot 处于不同相位**，证明波浪在动 |
| 对手 active：color | `rgb(106, 174, 217)` = `--faction-opp-highlight` | ✅ 钢蓝色 |
| 无 active-turn：3 个 dots visibility | 全部 `hidden` | ✅ CSS 父选择器自动控显 |
| 真实游戏路径：AI 思考时 | active-turn 落在 player-top，省略号 visible | ✅ 集成正常 |

---

## 六、验收截图

| 文件 | 看什么 |
|------|--------|
| `before-phase3-task4.png` | 任务 4 起点：AI 在思考但无视觉指示 |
| `after-phase3-task4-ally-frame-1.png` | 队友（对家）思考态：琥珀色"···"在头像与 27 徽章之间 |
| `after-phase3-task4-ally-frame-{0,2,3}.png` | 不同时刻的波浪相位 |
| `after-phase3-task4-opp.png` | 对手（左手）思考态：钢蓝色"···"|
| `after-phase3-task4-ingame.png` | 真实游戏中 AI 思考时省略号自然出现 |
| `after-phase3-task4.png` | 全景终态 |

---

## 七、浏览器手动体验

`http://localhost:3737?demo=1` → 出 1 张牌让 AI 接管 → 观察对家昵称右侧出现波浪式金色"···"，AI 出牌后立即消失 → 等回合传到左/右家时，钢蓝色"···"在对应位卡出现。

---

## 八、回滚路径

如需回到任务 3.3 完成态：
1. 删除 `style.css` 末尾的 `Phase 3 Task 4 Override Block`
2. 删除 `index.html` 中 3 个 `<span class="thinking-dots">` 节点

不影响任何其他文件或之前的 Phase 3 块。

---

## 九、Phase 3 整体完成

任务 4 完成 ✅，Phase 3 4 个任务全部落地：

- ✅ 任务 1：基础过渡动效
- ✅ 任务 2：回合脉冲光晕（**P0 已解决**）
- ✅ 任务 3：出牌飞行 + 4 象限 + 停留 + 淡出
- ✅ 任务 4：AI 思考省略号

**Sprint 1（5/2 - 5/15）DoD 已达成。**

下一步：写 `PHASE3_FINAL_REPORT.md` 对比初始 REPORT.md 中 P0/P1/P2 的解决情况，然后 Client stream 进入 paused 状态，driver's seat 准备切换到 NPC stream（sprint 2）。
