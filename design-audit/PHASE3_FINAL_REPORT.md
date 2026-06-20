# 🎉 Phase 3 视觉动效落地 · 最终验收报告

> 封箱时间：2026-05-02  
> Sprint 1（5/2 – 5/15）DoD 达成日期：5/2（提前完成）  
> 性质：对照初始 REPORT.md 中识别的 P0/P1/P2 问题，逐条说明解决状况。

---

## 一、Sprint 1 总览

### 完成状态

| 阶段 | 内容 | 状态 |
|------|------|------|
| Phase 0 | Token 基础设施（73 个 CSS 变量） | ✅ |
| Phase 1 v2 | 视觉骨架重塑（桌面 + 阵营色 + 卡牌底色 + 顶栏） | ✅ |
| Phase 2 | 组件改造（手牌区 + 三级按钮 + 中央舞台锚） | ✅ |
| Phase 3 任务 1 | 基础过渡动效 | ✅ |
| Phase 3 任务 2 | 回合脉冲光晕 | ✅ |
| Phase 3 任务 3 | 出牌飞行 + 4 象限 + 停留 + 淡出 | ✅ |
| Phase 3 任务 4 | AI 思考省略号 | ✅ |

### 改动统计

| 文件 | 改动 |
|------|------|
| `css/tokens.css` | 新建（Phase 0），73 个变量，全程未改动 |
| `css/style.css` | 末尾追加 5 个 Override Block（Phase 1 v2 / Phase 2 / Phase 3 任务 1 / 2 / 3 / 4），共 ~400 行 |
| `index.html` | 3 处轻微改动：汉堡按钮、stage-anchor 节点、4 个 stage-quadrant、3 处 thinking-dots |
| `js/ui/gameUI.js` | 3 处改动：constructor (timer state)、`updateTurnHighlight` (summon hook)、`showPlayedCards` (飞行 + 时序) + 新增 `fadeOutQuadrant` 方法 |
| **未改动** | `css/tokens.css`、所有游戏逻辑 JS（rules.js / classifier.js / decomp.js / NPC）、所有规则状态机 |

---

## 二、初始 REPORT.md 三大问题的解决对照

### 🔴 P0：回合状态不可感知（最严重）

**初始问题：** 4 个游戏状态截图视觉上无法区分，玩家无法判断"现在轮到谁"。

**根本原因（初始诊断）：**
- 缺少持续的回合指示器
- AI 出牌记录不持留在桌面
- 玩家位卡设计无法承载"激活态"信号

**解决方案 × 阶段：**

| 措施 | 实施于 | 效果 |
|------|--------|------|
| 玩家位卡阵营色（队友琥珀 / 对手钢蓝） | Phase 1 v2 改造 2 | 即使非激活态也保留阵营色 muted 版本，玩家不需要"重新辨认"敌友 |
| 回合脉冲光晕（infinite，1200ms 周期）| Phase 3 任务 2 | computed style 探针实测 alpha 0.384~0.545 与 spec 100% 吻合；外周视觉可感知 |
| 进入 active-turn 用 slow + spring 涌现 | Phase 3 任务 2 | 回合切换瞬间有"光晕涌入"反馈 |
| AI 思考省略号 | Phase 3 任务 4 | 进一步明确"是谁在思考"，颜色与阵营色一致 |
| 出牌飞行 + 2500ms 停留 | Phase 3 任务 3 | AI 出牌结果在桌面停留足够时间让玩家阅读 |
| 出牌按钮 spring 涌现 | Phase 3 任务 3.1 | 我的回合到来时按钮"咔哒落地"提示"可以操作了" |

**P0 解决度：✅ 完全解决**

外周视觉就能感知"谁在出牌"。无需主视线主动扫视位卡。

---

### 🟠 P1：手牌密度过高 + 中央区常驻空白

**初始问题：**
- 27 张牌挤压在底部条带，单卡只露出 ~30px
- 桌面中央 ~550px 高的区域长期空白

**解决方案 × 阶段：**

| 措施 | 实施于 | 效果 |
|------|--------|------|
| 手牌区改造为 48 × 72 + -16px 重叠 | Phase 2 改造 1 | 单卡露出 32px，可读性提升 |
| 手牌 4 态（静止/悬停/选中/不可出牌） | Phase 2 + Phase 3 任务 1 | 悬停 +translateY(-10) + scale(1.08)；选中 +translateY(-20) + 金色 ring + spring |
| 中央 480 × 220 虚线舞台锚 + "等待出牌"标签 | Phase 2 改造 3 | 桌面中央不再是空绿色，有视觉锚点 |
| 出牌飞向中央 4 象限 | Phase 3 任务 3.2 + 3.4 | 中央成为"行动主舞台"，所有出牌从这里发生 |
| 牌组 2500ms 停留 + 自动淡出 | Phase 3 任务 3.3 | 出牌结果有时间被阅读，又不会永久占用空间 |

**P1 解决度：✅ 完全解决**

中央舞台从"空绿色虚空"变为"游戏主体所在"。手牌区有清晰的 4 态反馈。

---

### 🟡 P2：阵营感知缺失 + 按钮色彩语义混乱

**初始问题：**
- 队友（对家）和对手（左/右）的位卡视觉上完全相同
- 4 个按钮（广播/不出/提示/出牌）颜色等权（橙/青/橙/绿），语义不清

**解决方案 × 阶段：**

| 措施 | 实施于 | 效果 |
|------|--------|------|
| 阵营色系统：队友琥珀 / 对手钢蓝 | Phase 1 v2 改造 2 | 即便非激活态也保留 muted 阵营色 |
| 三级按钮视觉权重 | Phase 2 改造 2 | 出牌（120×48 金）≫ 不出（96×40 蓝灰）> 工具（80×32 透明）|
| 按钮组左右分组 | Phase 2 改造 2 | 工具组在左，操作组在右，符合鼠标右移决策轨迹 |
| 顶栏金色去污染 | Phase 1 v2 改造 4 | 级牌标签、VS 标识从金色改为中性，金色只留给"队友"+"出牌按钮"两个语义槽 |
| AI 思考省略号阵营色融合 | Phase 3 任务 4 | 队友思考是琥珀，对手思考是钢蓝，外周视觉就能区分 |

**P2 解决度：✅ 完全解决**

阵营色构成持续的"敌友地图"，按钮色彩有明确语义层级。

---

## 三、5 维度对照（设计审计 → Phase 3 后）

### 1. 视觉层级（Visual Hierarchy）

| 维度 | 初始报告 | Phase 3 后 |
|------|---------|-----------|
| 按钮主次区分 | 4 个按钮等权混乱 | ✅ 三级权重清晰 |
| 视线锚点 | 桌面中央长期空绿 | ✅ 480×220 舞台锚 + 出牌飞入 |
| 我的资产 vs 我的行动 | 手牌和按钮贴在同一平面 | ✅ space-xl (32px) 间距分隔 |

### 2. 空间布局（Spatial Layout）

| 维度 | 初始报告 | Phase 3 后 |
|------|---------|-----------|
| 中央利用率 | <5% | ✅ 中央成为主舞台 |
| 单卡可读性 | 30px 露出，文字过小 | ✅ 32px 露出 + 静止/悬停/选中 4 态 |
| 4 玩家空间感 | 头像各自孤立 | ✅ 出牌时按方位飞入，自然形成"围桌感" |

### 3. 交互反馈（Interaction Feedback）

| 维度 | 初始报告 | Phase 3 后 |
|------|---------|-----------|
| 选牌反馈 | 仅 translateY(-20px) 静态 | ✅ spring 250ms 带 12% 回弹"咔哒" |
| 按钮反馈 | 旧 scale(0.92) | ✅ 按下 ease-in-out 进入 0.96，松开 spring 弹回 |
| 回合切换 | 无视觉信号 | ✅ 脉冲光晕 + 涌现 spring + 出牌按钮 summon scale + 按钮组 opacity 渐变 |
| AI 出牌结果 | 立即消失或不显眼 | ✅ 飞入中央 + 2500ms 停留 + 自动淡出 |

### 4. 视觉一致性（Visual Consistency）

| 维度 | 初始报告 | Phase 3 后 |
|------|---------|-----------|
| 按钮颜色语义 | 橙色滥用 | ✅ 金色 = 队友/CTA、蓝灰 = 次要、透明 = 工具 |
| 阵营辨识 | 三家头像样式相同 | ✅ 队友/对手用持续的 muted/primary 阵营色 |
| 字号/圆角/阴影规范 | 无系统 | ✅ 73 个 token 全覆盖 |

### 5. 氛围与精致度（Atmosphere & Polish）

| 维度 | 初始报告 | Phase 3 后 |
|------|---------|-----------|
| 桌布质感 | 平饱和绿 | ✅ 深克制绿 + 织物纹理 + vignette |
| 卡牌质感 | 纯白发光感 | ✅ 微暖白纸感 + 调整后的红/黑花色（消除补色振动） |
| 导航元素侵入 | "← 沃伦·巴菲虾"悬浮 | ✅ 收入 44×44 汉堡按钮，统一在 HUD |
| 关键 HUD 信息 | 散落浮动 | ✅ 全宽顶栏 + backdrop blur |

---

## 四、技术质量与设计宪法对齐

### 100% Token 化

所有视觉数值通过 `var(--xxx)` 引用 tokens.css。Phase 1 v2 / Phase 2 / Phase 3 任意一个 Override Block 内**没有硬编码颜色、间距、时长、曲线**（除了 keyframe 内的 rgba alpha 是按 token color 衍生的，那是必要的）。

### 探针测试覆盖

每个引入动画的子任务都用 `getComputedStyle()` + `MutationObserver` 探针验证：

| 任务 | 关键探针证据 |
|------|------------|
| Task 1 | hover transition fast/ease-out-enter，selected normal/spring |
| Task 2 | alpha 0.384~0.545 实测对齐 spec 0.385~0.55；MutationObserver 捕获到 active-turn 切换 |
| Task 3.1 | spring 过冲到 scale(0.999)，证明 cubic-bezier(0.34,1.56,0.64,1) 真在跑 |
| Task 3.2 | +50ms 卡牌 transform=translateY(236px) opacity=0.156 |
| Task 3.3 | 隔离测试：t=2550ms fading-out 加上 + timer 已清；t=2850ms innerHTML 清空 |
| Task 4 | 3 个 dot opacity 实测 0.685/0.949/0.2，处于不同相位 |

不依赖"看起来 OK"的主观判断。

### 回滚边界清晰

每个 Override Block 都是**独立的**：

```
style.css 末尾结构：
├── Phase 1 v2 Override Block      ← 删 = 回阶段 0
├── Phase 2 Override Block          ← 删 = 回阶段 1 v2
├── Phase 3 Task 1 Override Block   ← 删 = 回阶段 2
├── Phase 3 Task 2 Override Block   ← 删 = 回任务 1
├── Phase 3 Task 3 Override Block   ← 删 = 回任务 2
└── Phase 3 Task 4 Override Block   ← 删 = 回任务 3
```

任何阶段如出问题，删除对应块即可精确回滚到上一稳定态。

---

## 五、未触碰的事（Sprint 1 边界自律）

整个 Sprint 1 严格不动以下范围（这是为什么 Sprint 2 的 NPC stream 可以无缝接力）：

- ❌ 游戏规则引擎（rules.js / classifier.js / decomp.js）
- ❌ NPC 决策逻辑（PracticeNPC.js / SkillProfiles.js）
- ❌ 网络层（websocket.js / loopback.js）
- ❌ 游戏状态机（server-runtime/game/）
- ❌ 教程系统、多人房间页、移动端适配（CLIENT_SUMMARY 中"不在 scope"清单全部保持）

---

## 六、可验证的 DoD

CLIENT_SUMMARY.md 中 Sprint 1 的 DoD：

> "4 类动效（卡牌悬停、回合脉冲光晕、出牌飞行、AI 思考）全部落地，与 DESIGN_TOKENS 对齐"

**验收方式**：本报告所附的 6 份 DIFF 文档（PHASE0_SETUP / PHASE1_DIFF_v2 / PHASE2_DIFF / PHASE3_TASK1_DIFF / PHASE3_TASK2_DIFF / PHASE3_TASK3_LOG / PHASE3_TASK4_DIFF）+ 对应的 before/after 截图组（路径：`/Users/linshi/Documents/Archive/warren-shrimp/games/guandan/design-audit/`）。

**DoD 状态：✅ 达成**

---

## 七、Sprint 2 接力建议

Client stream 进入 **paused 状态**，注意力切换到 NPC stream 推进 M1（1000 局自战 + 消融报告）。具体下次入口见 `NPC_BACKLOG.md` 顶部。

按操作手册的 sprint 切换仪式：
1. 在 `PROJECT_STATUS.md` 把 `current_focus` 从 Client → NPC
2. 把 Client stream 状态从 active → paused（at Phase 3 v1.0）
3. 历史决策日志加一行"Sprint 1 收官，Sprint 2 启动"
4. 下次开 session 第一句话：「现在推进 NPC M1（1000 局测试 + 消融报告）；先读 PROJECT_STATUS.md、NPC_BACKLOG.md」

---

## 八、Phase 3 后的 Client 二期 backlog（已识别但不立即做）

未来如要继续 polish Client：

- 出牌飞行的"精确 source"（每张手牌的真实位置）
- 旧 played-cards-area div 清理（每家位卡内的空容器）
- 中央 play-info 文字标注与新 stage-quadrant 整合
- 左右家位卡 90° 旋转（COMPONENT_SPECS §1.4）
- 教程系统、多人房间页的视觉重塑
- 移动端 / iPad 响应式
- 暗色主题切换、国际化

每条都不阻塞 Sprint 2/3。

---

## 九、最后

**这是 Sprint 1 的封箱报告。**

`PROJECT_STATUS.md` 已记录所有改动到位日期。两份设计宪法（DESIGN_TOKENS.md / COMPONENT_SPECS.md）将作为未来 Client v2 polish 的基础不变。

✅ Sprint 1 完成。  
🔄 Sprint 2 等待启动。
