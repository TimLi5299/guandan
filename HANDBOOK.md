# 掼蛋项目 · 开发说明书

> 版本：v1.1 · 2026-05-03（定位升级版）
> Repo：https://github.com/TimLi5299/warren-shrimp
> 项目战略定位：🏆 **媲美商用优秀产品（如腾讯掼蛋）的单机掼蛋游戏**
> 项目由人类开发者与 AI 协作开发

---

## 序 · 这是什么项目

掼蛋的浏览器原生**单机游戏**：1 个真人玩家 + 3 个强 AI NPC。目标是在**规则完整性、游戏体验、AI 强度、系统完成度**四个维度上经得起与商用优秀产品（腾讯掼蛋等）的直接对比，同时保持自己的差异化（克制精致的审美 + AI 决策可解释）。

当前状态（v1.0 基线）：

- ✅ **完整可玩**：单人 vs 3 AI（多人联机代码保留在仓库中，已冻结，不是产品方向）
- ✅ **AI 难度可选**：不同难度档位由不同技术路线支撑（详见"路线 × 档位"体系），每档技能可配置
- ✅ **AI 可解释**：`?debug=1` 模式下，NPC 出牌时显示决策路径（哪些 R 技能触发、为什么）——商用产品没有的差异化亮点
- ✅ **视觉精致**：基于设计宪法（73 个 CSS token + 5 个组件规范）的全 token 化 UI
- ⏳ **商用对标缺口**：音效/语音、托管、记牌器、本地存档/段位、抗贡规则、移动端——见第七章路线图（v1.1-v1.5）

**Demo 一键启动**：

```bash
npx serve -l 3737 games/guandan
# 浏览器打开
http://localhost:3737/?demo=1          # 普通模式
http://localhost:3737/?demo=1&debug=1  # 含 NPC 决策信息泡
```

---

## 一、项目愿景与定位

### 战略定位（2026-05-03 升级）

> 🏆 **做一款能够媲美市场上商用优秀产品（如腾讯掼蛋）的单机掼蛋游戏。**

定位演进史：Sprint 3 启动时锁定为 🅱️"可演示的作品"（能给非技术听众看的成品）；v1.0 发布后升级为商用对标——标准从"不尴尬"提升到"经得起与腾讯掼蛋直接对比"。

**"媲美"的定义**：在规则完整性、游戏体验、AI 强度、系统完成度四个维度达到商用水准；**不等于模仿**——审美与 AI 可解释性是我们的差异化。

### 三个已拍板的产品决策（2026-05-03）

| # | 决策 | 选择 | 理由 |
|---|------|------|------|
| 1 | 审美路线 | **保持克制精致质感**（不跟腾讯的热闹喜庆风）| 媲美 = 完成度对标，不是风格模仿；风格差异化是卖点。音效同样走"克制但高级"路线 |
| 2 | 平台优先级 | **桌面先打磨完成度，v1.5 再做移动端** | 现有布局与演示场景都在桌面；完成度优先 |
| 3 | 规则蓝本 | **竞技掼蛋规则（扑克协会版，= 腾讯同款蓝本）** | 规则可信是"媲美商用"的地基；v1.1 逐条审计 Engine |

### 产品形态

**单机游戏**：1 个真人玩家 + 3 个 NPC。多人联机代码保留在仓库中但已冻结，不投入任何新开发。

### NPC 能力体系：路线 × 档位

NPC 的不同难度档位由不同技术路线支撑——**路线即档位**：

| 产品档位 | 技术路线 | 状态 |
|---------|---------|------|
| 入门（noob）| 随机/贪心（无技能）| ✅ v1.0 |
| 进阶（normal）| R 路线子集（R1-R4 基础配合）| ✅ v1.0 |
| 高手（expert）| R 路线全集（14 项，已剔除 R5）| ✅ v1.0 |
| 大师（master）| R + B 混合（残局 Search/MCTS 接管）| ⏳ v1.4 规划 |
| 宗师（grandmaster）| D 路线（监督学习/RL policy）| ⏳ 远期探索 |

### 长期愿景（v2.0 = 商用对标达成）

1. **四层能力补齐**：规则完整性（v1.1）→ 感官体验（v1.2）→ 单机系统（v1.3）→ AI 档位（v1.4）→ 移动端（v1.5）
2. **真人玩家测试与难度调优**：基于真实用户反馈校准各档位的"有挑战不绝望"区间
3. **AI 可解释性产品化**：把 `?debug=1` 的 trace 信息泡打磨成正式功能（"看 AI 怎么想"），成为对商用产品的独有卖点

### 明确不做的事

- ❌ **不做教程系统**（2026-05-03 取消：teaching NPC 与教程局不再开发，现有 tutorial 代码冻结）
- ❌ **不做多人联机产品化**（联机代码保留但零投入，产品形态为单机）
- ❌ **不模仿腾讯审美**（保持克制精致路线，决策 1 已拍板）
- ❌ **不重写引擎架构**（v1.1 的规则补全按蓝本审计进行，是补齐不是重写）
- ❌ **不引入外部动效库**（GSAP / Anime.js 等）—— 全用 CSS / 原生 JS / Web Audio
- ❌ **不为了"炫酷"加额外动效**—— 每个动效必须解决具体 UX 问题
- ❌ **不在 sprint 中途切换焦点**（除非紧急 pivot，且必须实证驱动）

---

## 二、项目架构（3 Stream 模型）

整个项目按"产品线"思维拆成 **3 条独立 stream + 4 类基础设施**。每条 stream 有自己的节奏、DoD（Definition of Done）、回滚路径。任何时刻只有 1 条 stream 处于 active 状态（WIP=1）。

```
                ┌─────────────────────────────────────┐
                │  📋 文档体系 + 项目驾驶舱（治理层）  │
                └─────────────────────────────────────┘
                                  ▲
                                  │
        ┌─────────────────────────┼─────────────────────────┐
        ▼                         ▼                         ▼
  ┌──────────┐            ┌──────────┐            ┌──────────┐
  │ 🟢 Engine │  ───依赖──▶│ 🔵 NPC AI │            │ 🟠 Client │
  │  引擎    │            │ 智能对手  │            │  UI/UX   │
  └──────────┘            └──────────┘            └──────────┘
        │                         │                         │
        └─────────────────────────┼─────────────────────────┘
                                  ▼
                ┌─────────────────────────────────────┐
                │  🔬 测试基础设施（selfplay + tokens） │
                └─────────────────────────────────────┘
```

### 🟢 Engine 引擎 — 基础设施层

**职责**：游戏规则引擎（牌型分类、可出牌枚举、手牌分解、状态机）。Engine 是规则真理来源，所有上层 stream（NPC + Client）适应 Engine，反之不行。

**核心文件**：
- `server-runtime/game/rules.js` — 可出牌枚举（findPlayableHands）
- `server-runtime/game/decomp.js` — 手牌分解（decomposeHand / decomposeHandWildAware）
- `server-runtime/game/classifier.js` — 牌型识别（单/对/三带二/顺子/炸弹）
- `server-runtime/game/engine.js` — 游戏状态机（playCards / pass / tribute）

**当前状态**：维护态（paused at v1.0）

**节奏**：季度迭代 / 仅修 bug。任何 Engine 改动必须跑 baseline 1000 局 A/B 对比，且所有上层 stream 必须 pause。

---

### 🔵 NPC AI — 智能对手

**职责**：NPC 决策逻辑。当前是规则路线（R 路线），含 R1-R15 共 15 个技能（已删 R5 = 14 项 expert）。每个技能可独立开关，便于 ablation 测试。

**核心文件**：
- `server-runtime/npc/PracticeNPC.js` — 主决策入口（getAIDecision + decideStrategic + chooseLeading）
- `server-runtime/npc/SkillProfiles.js` — 技能定义（SKILLS）+ 预设（NPC_PRESETS）
- `server-runtime/npc/NPCDecisionLog.js` — 决策日志（PrimaryReason 枚举 + logSkill trace）
- `server-runtime/npc/NPCEngine.js` — NPC 类型路由（practice / teaching / competitive）

**当前状态**：paused at P1 v1.0

**节奏**：双周一个 milestone（M1/M2/...）。每个新技能必须经过 ablation 测试 + Welch's t-test 显著性检验，不靠"看起来更好"的判断。

---

### 🟠 Client / UX — 客户端

**职责**：游戏界面（牌桌、卡牌、按钮、HUD、动效）。基于"设计宪法"（73 个 CSS token + 5 个组件规范）的全 token 化 UI。

**核心文件**：
- `index.html` — 单文件 SPA（大厅 + 房间 + 游戏 + 教程 + 进贡 + 结算）
- `css/tokens.css` — 设计宪法（73 个 CSS 变量）
- `css/style.css` — 主样式 + 5 个 Phase Override Block
- `js/app.js` — 主流程（socket 事件绑定、UI 事件绑定）
- `js/ui/gameUI.js` — 游戏画面控制器（牌桌、玩家位卡、出牌动画）
- `js/ui/cardRenderer.js` — 卡牌渲染（手牌、出牌、牌背）
- `js/network/loopback.js` — 静态托管的"假服务器"（单机演示用）
- `js/network/websocket.js` — 真 WebSocket（多人联网用）

**当前状态**：paused at Phase 3 v1.0

**节奏**：阶段化路线（Phase 0/1/2/3）。每个阶段有独立 Override Block，回滚边界清晰。

---

### 4 类基础设施

#### ① 设计宪法（Design Constitution）

任何视觉改动前必须读这两份：
- `design-audit/DESIGN_TOKENS.md` — 73 个 CSS 变量定义（颜色、间距、字号、圆角、阴影、动效）
- `design-audit/COMPONENT_SPECS.md` — 5 个核心组件的全状态规范

**铁律**：规范没覆盖的细节，停下来讨论再改，不自行发明。

#### ② 测试基础设施

`server-runtime/selfplay.mjs` 是 NPC stream 的核心质量保障工具：

```bash
node server-runtime/selfplay.mjs 1000 expert           # 1000 局自战
node server-runtime/selfplay.mjs --ablation 200        # 单次消融
node server-runtime/selfplay.mjs --ablation 200 --repeat 10  # 三维度 t-test（M2 后）
```

**输出**：
- 胜率（队伍 0/2 vs 1/3）
- 平均手数 / 平均炸弹 / PASS 率
- **三维度指标**：手数 + 让路率 + 拦截率
- 异常行为列表
- 错误分类汇总（E1-E9，按 instrumentation 自动分类）
- Welch's t-test 矩阵（M=10 重复时）

#### ③ 文档体系

| 类型 | 文件 | 用途 |
|------|------|------|
| 驾驶舱 | `PROJECT_STATUS.md` | 当前焦点 + 3 stream 状态 + sprint 计划 + 历史日志 |
| Stream Backlog | `CLIENT_SUMMARY.md` / `NPC_BACKLOG.md` / `ENGINE_BACKLOG.md` | 各 stream 的待办池 + 后续 milestone |
| Sprint 报告 | `NPC_M1_REPORT.md` / `NPC_M2_REPORT.md` / `NPC_P1_LOG.md` / `ENGINE_E1_REPORT.md` / `design-audit/PHASE3_FINAL_REPORT.md` | 每个 milestone 的封箱报告（含数据 + 决策 + 回滚） |
| 设计宪法 | `design-audit/DESIGN_TOKENS.md` / `COMPONENT_SPECS.md` | 视觉设计的唯一数值来源 |
| 项目手册 | `HANDBOOK.md`（本文档） | 项目总览 + 历史 + 方向 |

#### ④ 驾驶舱机制（治理层）

`PROJECT_STATUS.md` 是项目的"驾驶舱"——任何 session 开始前先读，任何 session 结束前更新。详见第六章"项目治理原则"。

---

## 三、技术架构

### 目录结构

```
games/guandan/
├── HANDBOOK.md                    ← 本文档
├── PROJECT_STATUS.md              ← 驾驶舱
├── CLIENT_SUMMARY.md              ← Client stream backlog
├── NPC_BACKLOG.md                 ← NPC stream backlog
├── ENGINE_BACKLOG.md              ← Engine stream backlog
├── NPC_M1_REPORT.md / M2 / P1     ← NPC sprint 报告
├── ENGINE_E1_REPORT.md            ← Engine sprint 报告
│
├── index.html                     ← 单文件 SPA 入口
├── manifest.json / sw.js          ← PWA 配置
│
├── css/
│   ├── tokens.css                 ← 73 个设计 token
│   └── style.css                  ← 主样式 + 5 个 Phase Override Block
│
├── js/
│   ├── app.js                     ← 主流程
│   ├── ui/
│   │   ├── gameUI.js              ← 游戏画面控制器
│   │   └── cardRenderer.js        ← 卡牌渲染
│   └── network/
│       ├── loopback.js            ← 静态托管假服务器（单机）
│       └── websocket.js           ← 真 WebSocket（联网）
│
├── server-runtime/
│   ├── index.js                   ← LoopbackServer + WebSocket 入口
│   ├── selfplay.mjs               ← 自战测试工具
│   ├── game/                      ← 引擎层
│   │   ├── rules.js
│   │   ├── decomp.js
│   │   ├── classifier.js
│   │   └── engine.js
│   ├── npc/                       ← NPC 层
│   │   ├── PracticeNPC.js
│   │   ├── SkillProfiles.js
│   │   ├── NPCDecisionLog.js
│   │   ├── NPCEngine.js
│   │   └── ...
│   ├── tutorial/                  ← 教程系统
│   └── m1-data/                   ← Sprint 2/3 的原始日志
│
└── design-audit/                  ← 设计宪法 + Phase 0-3 截图与 DIFF 报告
    ├── DESIGN_TOKENS.md
    ├── COMPONENT_SPECS.md
    ├── PHASE3_FINAL_REPORT.md
    └── ...（含 90+ 张前后对比截图）
```

### 数据流（单机演示模式）

```
浏览器 ?demo=1
  ↓
loopback.js（假 socket）
  ↓
server-runtime/index.js LoopbackServer
  ↓
server-runtime/game/engine.js（状态机）
  ↓
server-runtime/npc/NPCEngine.js → PracticeNPC.js（NPC 决策）
  ↓
游戏事件 broadcast 回客户端（含 NPC_EXPLAIN trace）
  ↓
js/ui/gameUI.js 更新画面 + js/app.js 显示信息泡
```

### 数据流（联网模式）

```
浏览器
  ↓ WebSocket
server-runtime/index.js（真 ws server，独立 Node 进程）
  ↓
同上
```

### 测试工具（selfplay.mjs）能力

- **单 preset 模式**：`node selfplay.mjs N expert` —— N 局自战，输出胜率/手数/让路率/拦截率
- **消融模式**：`--ablation N` —— 遍历所有 R 技能（去掉 1 个 vs 全部），输出贡献量化
- **统计模式**：`--ablation N --repeat M` —— M 次独立重跑，含 Welch's t-test 三维度矩阵

性能：每局 ~11ms（含 9-10 个 round + NPC 各家决策）。1000 局 ~11s，32k 局 ~30s。

---

## 四、开发历程（时间线）

### 2026-03-15 · PracticeNPC v3 落地
- rule-based 完整版 NPC（含基础让路、炸弹、记牌）
- 进入消融测试阶段，验证每个技能贡献

### 2026-04-01 · R1-R9 + SkillProfile 系统
- 9 项核心技能（让路 / 炸弹时机 / 拆牌 / 记牌 / 级牌保护 / 对手推断 / 信号 / 残局 / 领牌评分）
- 消融测试基础设施完工

### 2026-04-15 · R10-R12 落地（第 2 期强化）
- R10 形势感知领牌
- R11 万能牌感知拆牌
- R12 忍牌保型

### 2026-04-30 · R13-R15 落地（第 3 期强化）
- R13 出口规划
- R14 顺子保护
- R15 三张保护
- 至此 R 路线 15 项技能全部完成

### 2026-05-01 · 初始设计审计（REPORT.md）
- 以 10 年棋牌 UI/UX 设计师视角，对游戏画面做 5 维度审计
- 识别 P0/P1/P2 三大问题：
  - **P0 回合状态不可感知**（最严重）
  - **P1 中央空白 + 手牌密度过高**
  - **P2 阵营感知缺失 + 按钮色彩混乱**
- 产出 `design-audit/REPORT.md` 诊断报告

### 2026-05-01 · 设计宪法建立
- 写 `DESIGN_TOKENS.md`（73 个 CSS 变量）
- 写 `COMPONENT_SPECS.md`（5 组件全状态规范）

### 2026-05-02 · Sprint 1 + Sprint 2 + Sprint 2.5 一天完成
- **Sprint 1（Client Phase 0/1/2/3）**：73 个 token 落地 + 视觉骨架重塑 + 组件改造 + 4 类动效
  - 关键产出：脉冲光晕（解决 P0）+ 4 象限出牌飞行（解决 P1）+ 三级按钮权重（解决 P2）+ AI 思考省略号
- **Sprint 2（NPC M1 v1.0）**：1000 局 baseline + 200×10 ablation = 32k 局 + Welch's t-test
  - 关键发现：R9 是支柱（Δ+37.74），**R5 反向效应实锤**（Δ-0.63, p<.001）
- **Sprint 2.5（Engine E1 紧急插入）**：修复 selfplay 12.7% 错误率 → 0/1000
  - 根因是 `pickTributeCard` 多了一个级牌过滤条件，与 engine line 525 不一致
  - 单点 1 行 fix + 9 处 instrumentation

### 2026-05-03 · Sprint 3 当天完成
- **NPC M2**：从 expert 删除 R5（新 14 项），三维度 t-test 矩阵（手数 + 让路率 + 拦截率）
  - 新 expert 性能：39.01 手数 / 99.09% 让路率 / 55.30% 拦截率
  - 顺手发现 **R2 production bug 嫌疑**（三维度都不显著）
- **NPC P1**：可解释性
  - PracticeNPC 9 处核心 R 触发点加 logSkill trace
  - server 广播 NPC_EXPLAIN（含 activatedSkills + skillNotes）
  - `?debug=1` 模式下信息泡显示 trace（阵营色融合）
  - 3 种独立场景验证（R3 / R8 / R12）

### 2026-05-03 · v1.0 发布
- Git tag `v1.0` 推送到 GitHub
- Release notes 含完整 demo 入口 + 文档导航
- 3 stream 全部进入 paused 状态

**项目总用时（Sprint 1-3）：2 天**（原计划 4-6 周）。

### 2026-05-03 · 定位升级 + 三决策拍板
- 定位从 🅱️"可演示的作品"升级为 🏆 **媲美商用优秀产品（如腾讯掼蛋）的单机掼蛋**
- 三个产品决策拍板：审美保持克制精致（B）/ 桌面优先 v1.5 移动（B）/ 竞技掼蛋规则蓝本（A）
- 取消教程系统、冻结多人联机
- 路线图重排为 v1.1-v1.5（体验闭环优先），详见第七章
- 同日发生本地工作区意外清空事故，从 GitHub v1.0 完整恢复（零数据丢失）——验证了"GitHub 为真理源"的系统设计

---

## 五、目前进展（v1.0 终态）

### 🟠 Client / UX · v1.0

| 维度 | 状态 |
|------|------|
| 设计宪法 | ✅ 73 个 token + 5 组件规范 |
| Phase 0 Token 基础设施 | ✅ `css/tokens.css` |
| Phase 1 v2 视觉骨架 | ✅ 深克制绿 + 阵营色 + 卡牌纸感 + 顶栏 HUD |
| Phase 2 组件改造 | ✅ 手牌 4 态 + 三级按钮权重 + 480×220 stage-anchor |
| Phase 3 动效 | ✅ 基础过渡 + 脉冲光晕 + 出牌飞行 + AI 思考省略号 |
| 初始 REPORT 三大问题 | P0 ✅ / P1 ✅ / P2 ✅ |
| 二期 backlog | ⏳ 移动端 / 暗色 / 教程 UI / 国际化（不在 v1.0 scope） |

**封箱报告**：`design-audit/PHASE3_FINAL_REPORT.md`

---

### 🔵 NPC AI · v1.0

| 维度 | 状态 |
|------|------|
| R 路线技能 | ✅ R1-R15 全部落地，R5 已从 expert 删除（14 项有效）|
| Expert 性能 | 39.01 手数 / 99.09% 让路率 / 55.30% 拦截率 |
| 消融测试 | ✅ M=10 N=200 三维度 Welch's t-test 矩阵 |
| 可解释性 | ✅ logSkill trace + `?debug=1` UI 信息泡 |
| 可演示场景 | ✅ R3 / R8 / R12 实测验证 |
| 已识别 follow-up | ⏳ R2 production bug 嫌疑（三维度都不显著）|
| 已识别 follow-up | ⏳ 精简 expert 实验（hypothesis: 6 项核心维持 90% 强度）|

**关键洞察**（来自 M1 v1.0 三维度 t-test）：

| 类别 | 数量 | 技能 |
|------|------|------|
| ⬆ 大效应支柱 | 1 | **R9 领牌评分**（Δ+37.74, p<.001）|
| ✓ 多维度正贡献 | 4 | R3 / R10 / R11 / R12 |
| 🟡 配合-速度 trade-off | 1 | R1（让路率 -13.9% 但手数 +0.17）|
| 🔁 已删除（反向效应）| 1 | ~~R5~~ |
| ⚠ production bug 嫌疑 | 1 | R2（spec 说影响炸弹拦截，实测 p=0.141 不显著）|
| ✗ 不显著 | 7 | R4 / R6 / R7 / R8 / R13 / R14 / R15 |

**封箱报告**：`NPC_M1_REPORT.md` + `NPC_M2_REPORT.md` + `NPC_P1_LOG.md`

---

### 🟢 Engine · v1.0

| 维度 | 状态 |
|------|------|
| 规则正确性 | ✅ 1000 局自战 0 错误（E1 修复后）|
| 性能 | ✅ ~11ms/局，1000 局 11s |
| 测试覆盖 | ⚠ 无单元测试套件（P1 backlog）|
| Code Style | ⚠ ESM 但缺 `package.json "type": "module"`（P3 backlog）|

**封箱报告**：`ENGINE_E1_REPORT.md`

---

## 六、项目治理原则

### 1. WIP=1：任何时刻只动一条 stream

WIP（Work-In-Progress）限制为 1，意味着：
- 同一 sprint 内只动一条 stream，其它 stream 严格保持当前状态
- 切换 stream 必须显式（先在 `PROJECT_STATUS.md` 改 `current_focus`，再开 session）
- 切换需要"仪式感"：sprint 切换 = session 切换，不在 session 中途切

**为什么**：solo 项目最大的风险不是技能不够，是"无限的可选项"。WIP=1 强制聚焦，避免"想到哪做哪"的复发。

### 2. 实证驱动 pivot（不是情绪驱动）

Sprint 2 中途暂停 NPC、紧急启动 Sprint 2.5（Engine E1）就是个范例：
- **触发**：NPC M1 baseline 跑出 127/1000 = 12.7% 错误率
- **判断**：错误可能让消融数据失真 → 在错误数据上做 t-test 是浪费
- **行动**：暂停 NPC，切到 Engine 修错误
- **结果**：Engine E1 半个 session 修完，回到 NPC 重跑数据可信

**规则**：pivot 必须有可量化的触发数据（不是"我觉得"），且要在驾驶舱里留决策日志。

### 3. 数据驱动 vs 主观判断

- 每个新技能必须经过 ablation 测试 + Welch's t-test 才能合并
- 单次 Δ 数字无法区分"小真实效应"和"噪声"——必须 M=10+ 重复
- 多维度评估不是奢侈品（M1 v0.1 在手数维度判 R1 为"不显著"，三维度评估后 R1 是配合维度核心）

### 4. "错误吞掉 = 错误"

`try { ... } catch (e) {}` 本身就是 bug。任何错误统计点必须输出栈+上下文。selfplay E1 任务的核心就是把 9 处 `S.errors++` 升级为带分类的 `logError(type, ctx)`。

### 5. 回滚路径必须清晰

每个 Override Block / sprint 改动都有独立回滚路径：
- 删除对应 CSS Override Block 即回滚到上一 Phase
- 删除 trace 框架即回滚到无可解释性版本
- 任何 stream 都能在不影响其他 stream 的情况下回退

### 6. Session 流程（4 个动作）

#### 🔁 动作 A：每次开 session 的 3 分钟开场仪式

固定 3 步：
1. 自己看一眼 `PROJECT_STATUS.md` 的 `current_focus`
2. 告诉 Claude：「现在推进 [X]；先读 [STATUS / 对应 BACKLOG / 上次报告]，然后我们继续」
3. Claude 读完后告诉你：上次进度卡在哪、下一步该做什么

#### 🔁 动作 B：每次 session 结束的 1 分钟收尾

固定最后一句：「把今天的进展更新到 `PROJECT_STATUS.md`，然后告诉我下次开 session 时第一件事该做什么。」

#### 🔁 动作 C：sprint 切换的"仪式感"决定

3 个切换信号：
| 信号 | 含义 | 下一步 |
|------|------|--------|
| ✅ 当前 milestone 达 DoD | 这条 stream 可归 paused | 选下一个 sprint 的 stream |
| 🛑 当前 milestone 卡住 ≥2 session | 卡了，需换脑子 | 暂停这条，去推另一条 |
| 📅 sprint 时长到了（2 周） | 计划性切换 | 按 STATUS 里的下一 sprint 计划走 |

#### 🔁 动作 D：每周日 10 分钟"项目周会"

固定问 Claude：「现在做项目周会。读 PROJECT_STATUS 和三条 stream 当前文档。回答：① 这周推进到哪？② 下周 sprint 目标合理吗？③ 阻塞或新发现的 backlog 项？」

---

## 七、后续迭代方向（v1.1 → v2.0 商用对标路线图）

> 2026-05-03 定位升级后全面重排。排序原则：**玩家体验闭环优先**——先让规则可信，再让玩起来爽，再补商用感，再做 AI 梯度，最后扩平台。

### v1.1 · 规则可信（✅ 已封箱 2026-06-10）

**主战场**：Engine stream

**DoD（5/5 完成）**：
- [x] 规则审计：协会版蓝本逐条对照，发现并修复 **5 处偏离**（进贡牌定义三重错误 / 抗贡缺失 / 还贡限制 / 双贡配对+首出权 / 过A必须打）
- [x] 抗贡（实测 12.15% 局数触发）+ 过 A 规则（A级局占比 0%→17%）
- [x] 断局恢复：localStorage + 大厅"继续上一局"（端到端验证）
- [x] 完整一场 review：发现并修复 3 个真 bug（进贡 UI 白板 / GAME_START 缺级牌 / room.id undefined）
- [x] 1000 局 A/B + 3000 局回归全部零错误

详见 `ENGINE_E2_REPORT.md`。

### v1.2 · 玩起来爽（✅ 已封箱 2026-06-12）

**主战场**：Client stream

**DoD**：
- [ ] 音效系统：出牌 / 炸弹 / 胜利 / 升级（Web Audio 合成或免费素材库，走"克制但高级"路线，决策 1）
- [ ] 语音播报：牌型播报（"三带二""炸弹"等）
- [ ] 发牌动画 + 结算页升级动画（升级仪式感）
- [ ] 炸弹特效升级（现有 bomb-effect 太简陋）

### v1.3 · 商用感（✅ 已封箱 2026-06-12）

**主战场**：Client stream（单机系统层子模块）

**DoD**：
- [ ] 托管功能（挂机时 AI 代打，复用 normal preset）
- [ ] 玩家侧记牌器面板（NPC 内部已有记牌数据，开放给玩家）
- [ ] 出牌读秒
- [ ] 本地战绩统计 + 轻量段位体系（localStorage）

---

### v1.4 · 对手梯度（✅ 已封箱 2026-06-12）

**主战场**：NPC stream

**DoD**：
- [ ] R2 production bug 诊断（三维度都不显著的根因：dead code 还是实现错）+ 修复
- [ ] 精简 expert 实验（hypothesis：R1+R3+R9+R10+R11+R12 六项维持 90%+ 强度）
- [ ] **B 路线 → 大师档**：残局阶段（≤16 张/家）Search/MCTS 接管，DoD = 残局胜率比纯 R 路线高 ≥10%
- [ ] 路线 × 档位体系在 UI 落地（难度选择界面用产品档位命名：入门/进阶/高手/大师）

**远期延伸（v2.0 后）**：D 路线（监督学习）做宗师档——用 expert 自战产生 100k+ trajectory 训练 policy network。前置依赖 B 路线结果。

---

### v1.5 · 随时能玩（✅ 已封箱 2026-06-12）→ v2.0 对标达成 🏆

**主战场**：Client stream

**DoD**：
- [ ] 移动端 / iPad 响应式适配（商用掼蛋主战场是手机，决策 2 排在最后收口）
- [ ] PWA 安装流程打磨（manifest + sw.js 已有骨架）
- [ ] 全平台回归测试

**v2.0 验收标准**：四层能力（规则完整性 / 游戏体验 / AI / 单机系统）逐项对照腾讯掼蛋，每项达到"无明显短板"；同时保有两项差异化（克制精致审美 + AI 可解释）。

---

### v2.0 之后（暂不排期）

- **真人玩家测试**：N 个真实玩家分别和各档位对战 5 局，收集"无聊临界点"和"绝望临界点"，校准难度梯度
- **D 路线宗师档**：见 v1.4 远期延伸
- **可选 polish**：暗色/浅色主题切换、国际化（中英文）

已取消（2026-05-03 拍板）：
- ~~教程系统~~（teaching NPC 与教程局冻结）
- ~~多人房间页视觉重塑~~（多人联机零投入）

---

## 八、文档体系与协作

### 文档分层

```
┌──────────────────────────────────────────────────────┐
│ 项目级（季度更新）                                    │
│   • HANDBOOK.md（本文档，开发说明书）                  │
│   • DESIGN_TOKENS.md / COMPONENT_SPECS.md（设计宪法）  │
└──────────────────────────────────────────────────────┘
                          ▲
                          │
┌──────────────────────────────────────────────────────┐
│ Sprint 级（每周更新）                                 │
│   • PROJECT_STATUS.md（驾驶舱，单 session 必读）      │
│   • CLIENT_SUMMARY.md / NPC_BACKLOG / ENGINE_BACKLOG │
└──────────────────────────────────────────────────────┘
                          ▲
                          │
┌──────────────────────────────────────────────────────┐
│ Milestone 级（完成一次写一份）                         │
│   • NPC_M1_REPORT / M2 / P1_LOG                       │
│   • ENGINE_E1_REPORT                                  │
│   • design-audit/PHASE3_FINAL_REPORT                  │
└──────────────────────────────────────────────────────┘
```

### Session 入口的标准句式

按操作手册的"动作 A"，下次 session 第一句话应该是：

```
"现在推进 [stream] [milestone]；先读 PROJECT_STATUS.md、[对应 BACKLOG]、[相关报告]，然后我们继续"
```

例子：
- "现在推进 NPC M3（R2 bug 诊断）；先读 PROJECT_STATUS.md、NPC_BACKLOG.md、NPC_M2_REPORT.md，然后我们继续"
- "现在选 Sprint 4 焦点；先读 PROJECT_STATUS.md，然后我们讨论候选"
- "现在做项目周会；先读 PROJECT_STATUS.md、HANDBOOK.md，然后回答 3 个问题"

### 回滚路径速查

| 当前状态 | 退到 | 操作 |
|---------|------|------|
| Phase 3 任务 4 | Phase 3 任务 3 | 删 `style.css` Phase 3 Task 4 块 + 删 index.html thinking-dots 节点 |
| Phase 3 任务 3 | Phase 3 任务 2 | 删 `style.css` Phase 3 Task 3 块 + 还原 gameUI.js |
| ... | ... | ... |
| Phase 0 | 原始 | 删 css/tokens.css + 删 index.html 中 link tag |
| NPC P1 | NPC M2 | 删 PracticeNPC.js 中 logSkill 调用 + 还原 server-runtime/index.js NPC_EXPLAIN |
| NPC M2 | NPC M1 | 把 SkillProfiles.js 的 expert filter 改回 `Object.values(SKILLS)` |
| Engine E1 | 原始 | 还原 selfplay.mjs pickTributeCard 函数 |

---

## 九、附录

### A. 关键命令

```bash
# 启动游戏（单机演示模式）
npx serve -l 3737 games/guandan
# 浏览器：http://localhost:3737/?demo=1
# 加 &debug=1 看 NPC 决策信息泡

# NPC 测试
cd games/guandan
node server-runtime/selfplay.mjs 1000 expert                    # 1000 局自战
node server-runtime/selfplay.mjs --ablation 200                 # 单次消融
node server-runtime/selfplay.mjs --ablation 200 --repeat 10     # 三维度 t-test

# Git 操作
git status -s                       # 检查改动
git push origin main                # 推送
gh release create vX.Y --notes ...  # 创建 release
```

### B. 术语表

| 术语 | 含义 |
|------|------|
| R 路线 | Rule-based NPC，本项目当前唯一路线（v1.0）|
| B 路线 | Search-based NPC（MCTS / alpha-beta），未启动 |
| D 路线 | Deep learning NPC（policy network），未启动 |
| Stream | 项目"产品线"，本项目分 3 条（Engine / NPC / Client）|
| Sprint | 一个推进周期（通常 2 周）|
| Milestone | Sprint 内的具体目标（如 M1 / M2 / E1 / P1）|
| DoD | Definition of Done，milestone 的"做完标准" |
| WIP=1 | Work-In-Progress 限制 1，任何时刻只动一条 stream |
| Ablation | 消融测试（去掉某项技能看效果差异） |
| Welch's t-test | 不假设方差相等的双样本 t-test，本项目用来判断技能贡献是否显著 |
| Trace | NPC 决策路径日志（哪些 R 技能在本次决策中触发）|
| Token（设计）| CSS 变量，本项目 73 个，覆盖颜色/间距/字号/动效 |
| Override Block | style.css 末尾的 Phase 隔离 CSS 块，每个 Phase 独立，可逐块回滚 |

### C. 关键文件指针

```
驾驶舱：              games/guandan/PROJECT_STATUS.md
设计宪法：            games/guandan/design-audit/DESIGN_TOKENS.md
                     games/guandan/design-audit/COMPONENT_SPECS.md
NPC 入口：            games/guandan/server-runtime/npc/PracticeNPC.js
NPC 技能定义：        games/guandan/server-runtime/npc/SkillProfiles.js
NPC 决策日志：        games/guandan/server-runtime/npc/NPCDecisionLog.js
游戏引擎：            games/guandan/server-runtime/game/{rules,decomp,classifier,engine}.js
自战测试工具：        games/guandan/server-runtime/selfplay.mjs
游戏画面控制器：      games/guandan/js/ui/gameUI.js
主样式：              games/guandan/css/style.css
设计 token：          games/guandan/css/tokens.css
```

---

## 十、变更记录（本说明书）

| 日期 | 版本 | 变更 |
|------|------|------|
| 2026-05-03 | v1.1 | **定位升级**：媲美商用优秀产品（腾讯掼蛋）的单机掼蛋。三决策拍板（审美 B/平台 B/规则蓝本 A）；第七章路线图重排为 v1.1-v1.5；取消教程系统；冻结多人联机 |
| 2026-05-03 | v1.0 | 初稿。Sprint 1-3 整体封箱后写出。覆盖架构 + 历程 + 现状 + 方向 |

---

*本文档是项目的"开发说明书"，比 README 更详细、比 PROJECT_STATUS 更高层。建议每完成一个大 milestone（如 Sprint 4 / B 路线启动）回来更新一次。*
