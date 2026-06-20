# Client / UX Stream · 当前状态总结

> 截至 2026-05-02。本文档是 Client stream 的 single source of truth。

---

## 设计宪法（Design Constitution）

任何视觉/CSS 改动前必须先读这两份：

1. `design-audit/DESIGN_TOKENS.md` — 73 项 CSS 变量定义（颜色、间距、字号、圆角、阴影、动效）
2. `design-audit/COMPONENT_SPECS.md` — 5 个核心组件的全状态规范

**铁律：规范没覆盖的细节，停下来讨论再改，不自行发明。**

---

## 已完成的阶段（按时间倒序）

### ✅ Phase 2: 组件改造
- 产出：`css/style.css` 末尾 `Phase 2 Override Block`（~165 行）+ `index.html` 中央舞台 DOM 节点
- 改造点：
  1. 手牌区 4 态（48×72 卡牌、-16px 重叠）
  2. 三级按钮权重（出牌 120×48 金 / 不出 96×40 蓝 / 工具 80×32 透）
  3. 中央舞台视觉锚（480×220 虚线 + "等待出牌"）
- 详细记录：`design-audit/PHASE2_DIFF.md`
- 验收截图：`design-audit/after-phase2*.png`

### ✅ Phase 1 v2: 视觉骨架重塑
- 产出：`css/style.css` 末尾 `Phase 1 Override Block v2`（~150 行）+ `index.html` 汉堡按钮
- 改造点：
  1. 桌面背景 → 深克制绿 + 织物纹理 + 边缘 vignette
  2. 玩家位卡阵营色 → 队友琥珀 / 对手钢蓝
  3. 卡牌底色 → 微暖白 + 调整后的红/黑花色
  4. 顶栏 → 全宽 HUD 条 + 汉堡菜单按钮
- 5 项验收意见全部修复（v1 → v2）
- 详细记录：`design-audit/PHASE1_DIFF_v2.md`

### ✅ Phase 0: Token 基础设施
- 产出：`css/tokens.css`（73 个 CSS 变量）
- 加载顺序：`tokens.css` 先于 `style.css`，让现有 :root 覆盖兼容层
- 验证：DevTools 探针 17 个抽样 token 全部正常
- 详细记录：`design-audit/PHASE0_SETUP.md`

---

## 🔜 Phase 3 进行中（next milestone）

### 任务进度（4 个子任务）
1. ✅ **基础过渡动效**（5/2 完成）：所有 hover/选中/状态切换的 transition 时长 + 缓动曲线落地。详见 `design-audit/PHASE3_TASK1_DIFF.md`
2. ✅ **回合脉冲光晕**（5/2 完成 · **P0 已解决**）：队友琥珀 / 对手钢蓝两套 @keyframes，1200ms 周期 infinite 脉冲；进入 active-turn 用 slow+spring 涌现。computed style 探针实测 alpha 0.384~0.545 与 spec 100% 吻合。详见 `design-audit/PHASE3_TASK2_DIFF.md`
3. ✅ **出牌飞行与停留**（任务 3 整体完成，4 个子任务全部 ✅）：
   - 3.1 ✅ 出牌按钮 scale(1.04→1.0) 一次性涌现（首次改 JS）
   - 3.2 ✅ 卡牌从屏幕外固定方向飞入中央舞台对应象限（4 个 fly-from-* keyframes，多张错开 40ms）
   - 3.3 ✅ 牌组 2500ms dwell + 250ms fade-out 时序状态机；下家出牌触发立即淡出
   - 3.4 ✅ 出牌方位置 4 象限分布（task 3.2 内顺手解决，stage-quadrant 容器架构）
4. ✅ **AI 思考省略号**（5/2 完成）：纯 CSS 零 JS 改动；3 个 dot 错开 250ms opacity 波浪；阵营色融合（队友琥珀 / 对手钢蓝）；CSS 父级选择器自动绑定到 active-turn。详见 `design-audit/PHASE3_TASK4_DIFF.md`

---

## 🎉 Phase 3 整体完成（2026-05-02）

**封箱报告：`design-audit/PHASE3_FINAL_REPORT.md`** —— 含 P0/P1/P2 解决对照、5 维度前后对比、Sprint 1 DoD 达成证据。

**Client stream 状态：paused**（at Phase 3 v1.0）。  
**下一步焦点：NPC stream M1**（见 `NPC_BACKLOG.md`）。

### 严格不做
- ❌ 不引入动效库（GSAP / Anime.js）
- ❌ 不为"炫酷"加额外动效
- ❌ 不改游戏逻辑
- ❌ 不改 token 数值

### 入口条件
- `PROJECT_STATUS.md` 中 Client stream 标为 active
- Sprint 1 启动（5/2 - 5/15）

### 完成后产出
- `design-audit/PHASE3_DIFF.md`
- `design-audit/FINAL_REPORT.md`（对比初始 REPORT.md 中 P0/P1/P2 的解决情况）

---

## 当前**不在 scope** 的事项（避免漂移）

以下是 Client stream 的"二期 backlog"，Phase 3 内一律不动：

- 教程系统（lessons）的 UI 改造
- 多人房间页（lobby/room）的视觉重塑
- 移动端 / iPad 适配
- 登录页 / 用户头像系统
- 结算页 / 升级动画
- 国际化（中英文切换）
- 暗色主题切换

完成 Phase 3 后再讨论这里哪些值得做、做的顺序。

---

## 回滚路径（方便随时退到稳定状态）

| 当前状态 | 退到 | 操作 |
|---------|------|------|
| Phase 2 | Phase 1 v2 | 删 style.css 的 Phase 2 块 + 复原 index.html stage-anchor 节点 |
| Phase 1 v2 | Phase 0 | 删 style.css 的 Phase 1 v2 块 + 复原 index.html 汉堡按钮 anchor |
| Phase 0 | 原始 | 删 css/tokens.css + 删 index.html 中 link tag |

---

## 当前文件指针（Phase 3 推进时直接打开这些）

- 设计规范：`design-audit/DESIGN_TOKENS.md`、`design-audit/COMPONENT_SPECS.md`
- CSS 入口：`css/tokens.css`（不动）、`css/style.css`（在末尾追加 Phase 3 块）
- HTML：`index.html`（小心新增节点）
- JS（仅读取，原则上不改）：`js/ui/gameUI.js`（updateTurnHighlight 在第 244 行）
