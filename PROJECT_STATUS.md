# 掼蛋项目 · 驾驶舱

> **使用规则：**  
> ✅ 任何 session 开始前的第一件事：读这份文件  
> ✅ 任何 session 结束前的最后一件事：更新"当前焦点"和"阻塞项"  
> ❌ 不在驾驶舱里"想到哪做哪"——决策只在 sprint 切换时做，不在 session 内做

---

## 当前焦点（current_focus）

| 项 | 值 |
|---|---|
| 项目战略定位 | 🏆 **媲美商用优秀产品（如腾讯掼蛋）的单机掼蛋**（2026-05-03 升级，详见 HANDBOOK 第一章）|
| 推进的 stream | 🛑 无 active（v2.5 病例驱动蠢行为修复已封箱）|
| 当前 milestone | — |
| Sprint | v2.5：玩家复盘标记病例 + 自动审计 → 8 类蠢行为修复，master 对 v2.4 +10.5%（2000 局双向）|
| 下次 session 入口 | "继续病例驱动（玩家标记→复现→修）或策略深度升级（名次智慧/缺门推断/配合意识）；先读 PROJECT_STATUS.md" |

> **Sprint 2 封箱回顾**：  
> - Sprint 1（Client Phase 3）✅ + Sprint 2（NPC M1 v1.0）✅ + Sprint 2.5（Engine E1）✅  
> - 1 天完成，远超原计划进度  
> - 详见 `design-audit/PHASE3_FINAL_REPORT.md`、`NPC_M1_REPORT.md`、`ENGINE_E1_REPORT.md`

---

## 三条 stream 的健康度

### 🟢 Engine 引擎
- 状态：**维护态（paused at v1.0）** ← 由 active 切回 paused
- 核心文件：`server-runtime/game/rules.js` / `decomp.js` / `classifier.js` / `engine.js`
- 已完成：E1（selfplay 12.7% 错误根因诊断 + 修复，错误率 0/1000）
- 报告：`ENGINE_E1_REPORT.md`
- 副产物：selfplay.mjs 增加错误分类 instrumentation，未来诊断同类问题更快
- 后续 backlog（不立即做）：P1 测试套件 / P2 性能基准 / P3 代码现代化

### 🔵 NPC AI 智能对手
- 状态：**active**（Sprint 3 焦点，由 paused 切回 active）
- 核心文件：`server-runtime/npc/PracticeNPC.js` / `SkillProfiles.js`、`server-runtime/selfplay.mjs`
- 状态：**paused（at P1 v1.0 完成，Sprint 3 封箱）**
- 已完成：R1-R15 落地 / M1 v1.0 / M2（R5 已删，14 项 expert）/ **P1 全部完成（trace + UI bubble + 3 demo 场景）**
- 报告：`NPC_M1_REPORT.md`、`NPC_M2_REPORT.md`、`NPC_P1_LOG.md`（v1.0 完整）
- 新 expert 性能：手数 39.01、让路率 99.09%、拦截 55.30%
- 可演示性已就绪：`?debug=1` 下信息泡显示 trace（含 R 技能 chip + 中文说明）
- 已识别 follow-up（M3+ 候选）：① R2 production bug 诊断 ② 精简 expert 实验 ③ NPC P2 Search 路线
- 副产物可复用：selfplay.mjs `--repeat M` + 三维度 t-test 矩阵 + NPC trace 框架 + UI 信息泡

### 🟠 Client / UX 客户端
- 状态：**paused（at Phase 3 v1.0 完成）** ← 由 active 切换为 paused
- 已完成：Phase 0 / Phase 1 v2 / Phase 2 / **Phase 3 全部 4 任务 ✅**（含 P0/P1/P2 全部解决）
- 封箱报告：`design-audit/PHASE3_FINAL_REPORT.md`
- 详细进度：见 `CLIENT_SUMMARY.md`
- 二期 backlog 已识别但不立即做（详见 FINAL_REPORT 第八节）

---

## 接下来 sprint 计划（含紧急插入）

| Sprint | 时间 | 主推 stream | 目标 milestone | 状态 |
|--------|------|-----------|--------------|------|
| 1 | 5/2 | 🟠 Client | Phase 3 动效完成 | ✅ 封箱 |
| 2（中断） | 5/2 | 🔵 NPC | M1 自战 + 消融 | 🛑 paused at v0.1（结果污染）|
| 2.5（紧急插入）| 5/2 | 🟢 Engine | E1 修复 12.7% 错误率 | ✅ 完成（错误率 0/1000）|
| 2-续 | 5/2 | 🔵 NPC | M1 v1.0（t-test + 报告升级）| ✅ 完成（DoD 4/4） |
| 3 | 5/3 | 🔵 NPC | M2（R5 + 三维度 t-test）+ P1（可解释性）| ✅ **当天封箱**（原计划 2 周）|
| 4 | 5/3 - 6/10 | 🟢 Engine | v1.1 规则可信（审计 + 抗贡/过A + 断局恢复 + 跨局 review）| ✅ **封箱**（DoD 5/5）|
| 5 | 6/12 | 🟠 Client | v1.2 玩起来爽（音效/语音/动画）| ✅ 封箱 |
| 6 | 6/12 | 🟠 Client | v1.3 商用感（托管/记牌器/读秒/战绩段位）| ✅ 封箱 |
| 7 | 6/12 | 🔵 NPC | v1.4 对手梯度（R2 修复 + lean 实验 + S1 大师档）| ✅ 封箱 |
| 8 | 6/12 | 🟠 Client | v1.5 移动端 + PWA | ✅ **封箱 → v2.0 对标达成 🏆** |

> **规则：每个 sprint 只动一条 stream。其它 stream 严格保持当前状态。**

---

## 阻塞 / 等待项

无（2026-05-02）

---

## 历史决策日志

| 日期 | 决策 |
|------|------|
| 2026-06-12 | **🚨 v2.0.1 热修复（用户实测反馈两项）**：① **NPC 派生字段缺失重大 bug**——浏览器路径直接透传 engine state，缺 isTeammateWinning/playersHandCounts → R1 让路、R2 拦截、R10 形势、S1 残局探测在真实对局全瘫（selfplay 自构字段所以实验室指标正常 = 实验室与产线不一致的教训）。修复：NPCEngine 加 buildDecisionView 适配层。验证：R1 实测触发 6 次（修复前 0）② **托管 = hint[0] 最小单张**——改走真 NPC 引擎（expert 代打），实测牌型 50% 非单张含三带二 ③ 多人在线 + 新手教学 UI 入口下线（5/3 拍板冻结但 UI 未拆的执行遗漏）|
| 2026-06-12 | **🏆🏆🏆 v1.2-v1.5 单日四连封箱 · v2.0 商用对标达成**：v1.2（Web Audio 合成音效+语音播报+发牌/结算/炸弹动画）→ v1.3（托管+记牌器+读秒+本地战绩五段位）→ v1.4（R2 修复后拦截维度 Δ-35.5% p<.001 极显著；lean 6 项 vs expert 51.1% 证实"叠床架屋"；S1 制胜探测版 master 档 vs expert 51.5%，12.7k 局显著；顺手修 3 个前端档位 bug）→ v1.5（移动端 iPhone 13 无横向滚动+触摸达标；sw.js 重写为 network-first 真 PWA）。详见 `V1.2-1.5_REPORT.md` |
| 2026-06-10 | **🎉 v1.1 规则可信 · 封箱（DoD 5/5）**：v1.1 收尾 session 完成 ① E3 修复（天王炸跟牌候选 bug + 同花顺互压漏选项，3000 局零错误）② E2 漏网之鱼（浏览器 NPC 进贡路径 selectTributeCard 三重错误）③ 断局恢复全链路（LoopbackServer onStateChange → localStorage → 大厅"继续上一局"，端到端 4 步验证）④ 完整一场 review 发现并修复 3 个真 bug（进贡 UI 白板渲染 / TRIBUTING GAME_START 缺级牌 / room.id undefined）⑤ 跨局链路截图验证（升级 2→4 正确、级牌切换正确）。封箱回归 1000 局零错误。Engine 回维护态，Sprint 5 = v1.2 |
| 2026-06-10 | **🟢 Engine E2 引擎侧完成（v1.1 主体）**：Web 核实协会版规则（国家竞赛规则第二/十/十四条）→ 逐条审计发现 5 处偏离（进贡牌定义三重错误 / 抗贡缺失 / 还贡限制错位 / 双贡配对+首出权错误 / 过A缺失）→ 全部修复。1000 局 A/B：进贡类错误 0、round/场 9.5→12.8（A 必须打的预期效应）、单局指标全部不变。300 场探针：抗贡实测 12.15% 局数（高频规则！）、A级局占比 0%→17%。发现 E7 潜伏 bug（同花顺跟牌，0.2%）记为 E3。剩余：断局恢复 + 完整一场 review。详见 `ENGINE_E2_REPORT.md` |
| 2026-05-03 | **🏆 定位升级 + 三决策拍板 + Sprint 4 启动**：定位从 🅱️"可演示作品"升级为"媲美商用优秀产品（腾讯掼蛋）的单机掼蛋"。三个产品决策：① 审美保持克制精致（不模仿腾讯）② 桌面优先、v1.5 收口移动端 ③ 规则蓝本采用竞技掼蛋（协会版）。取消教程系统、冻结多人联机。路线图重排 v1.1-v1.5（HANDBOOK 第七章）。Sprint 4 = v1.1 规则可信，Engine stream 转 active。同日：本地工作区意外清空事故，从 GitHub v1.0 完整恢复（零丢失），HANDBOOK.md 唯一幸存未提交文件——本次起每 sprint 收尾必须 push |
| 2026-05-03 | **🎉🎉🎉 Sprint 3 整体封箱（M2 + P1 全部完成 · 当天交付，原计划 2 周）**：①  P1.2 完成——server 端移除 teaching 限制 + 加 activatedSkills/skillNotes payload；客户端加 `?debug=1` 模式 + 3 个对手位卡的 trace bubble + 阵营色融合左边框 + duration-linger (2500ms) 自动隐藏 ② P1.3 完成——10 回合实测 26 个 NPC_EXPLAIN 事件，3 种独立场景（R3 拆牌优化 PLAY、R8 残局解算 PLAY、R12 忍牌保型 PASS）全部在 demo 模式下可见。P1 DoD 3/3 ✅。3 stream 全部 paused，Sprint 4 待选焦点。详见 `NPC_P1_LOG.md` v1.0 |
| 2026-05-03 | **NPC P1.1 完成（trace 框架 + 9 处核心 R instrumentation）**：发现项目已有 NPCDecisionLog.js 含 PrimaryReason 枚举和 8 种中文解释模板——P1 是把"事后推断"升级为"实时追踪"，不是从零搭。改动：① NPCDecisionLog.js 加 logSkill helper + activatedSkills/skillNotes 字段 ② PracticeNPC.js 用 _trace 字段携带，在 R1/R3/R4/R6/R7/R8/R9/R12/R2 等 9 处核心触发点加 logSkill。1 局测试输出"R9 + R7 联合决策"等可读 trace |
| 2026-05-03 | **🎉 NPC M2 完成（1 个 session，原计划半 sprint）**：① R5 删除决策——三维度 t-test 全部显示负贡献（手数 -0.64、让路 +0.2%、拦截 +2.0%），无对冲；② 修改 SkillProfiles.js，新 expert = 14 项（去 R5）；③ A/B 验证：1000 场 baseline 手数 39.0、让路 99.2%、拦截 55.1%，与 t-test 预测全部吻合；④ 新 expert 三维度 ablation 完成（28k 局），发现 R1 是配合 vs 速度 trade-off、R11 emergent 拦截率贡献、**R2 三维度都不显著（production bug 嫌疑）**；⑤ NPC_M2_REPORT.md v1.0 完成。selfplay.mjs M2 阶段扩展为三维度 t-test 矩阵。M2 DoD 5/5 ✅ |
| 2026-05-03 | **Sprint 3 启动 · 项目战略定位锁定为 🅱️"可演示的作品"**：在 4 个候选（P2 Search/P1 可解释性/Client v2 polish/M2 R5 修复）中选定"先 M2 后 P1"的两段式串行计划。Sprint 3 时间盒：5/3-5/16（2 周） |
| 2026-05-02 | **🎉🎉🎉 NPC M1 v1.0 终版完成 · Sprint 2 整体封箱**：selfplay.mjs 加 `--repeat M` + Welch's t-test 工具函数；跑 200×10=2000 局/技能 × 16 条件 = 32k 局（用时 32s）→ **15 项全部 t-test**（远超 DoD "≥3 项"）→ 关键发现：R9 支柱（Δ+37.74, p<.001）、4 项小正贡献（R3/R10/R11/R12）、**R5 反向效应实锤（Δ-0.63, p<.001，是 production bug）**、9 项手数维度不显著但部分在让路率维度仍可能有效（如 R1）。M1 DoD 4/4 ✅。NPC stream 切回 paused（at M1 v1.0）。3 stream 全部 paused，Sprint 3 待选焦点 |
| 2026-05-02 | **🟢 Engine E1 完成（耗时半个 session）**：selfplay.mjs 错误分类 instrumentation + 跑 100 局收样本 → 100% 错误集中在进贡阶段（E2/E9）→ 定位根因为 selfplay::pickTributeCard 多了一个级牌过滤条件，与 engine 的 line 525 不一致 → 1 行修复（删过滤条件）→ 1000 局 A/B 验证错误率 127→0，所有其他指标完全一致 → ablation 重跑确认 R 技能 ranking 稳定（R9 +37.8 vs +38.0）。**Engine 本身完全没问题，只是测试工具 bug**。详见 `ENGINE_E1_REPORT.md`。Engine stream 切回维护态，NPC stream 切回 active 继续 t-test 收尾 M1 |
| 2026-05-02 | **🛑 紧急 Pivot：NPC stream 暂停，Engine stream 启动**。理由：M1 baseline 跑出 127/1000 = 12.7% 引擎错误，可能让 ablation 数据失真——某些 R 技能"微弱"可能是"被错误吃掉"。在确认 Engine 稳定前继续 NPC 是浪费 effort。Sprint 2.5（紧急插入）目标：E1 把错误率压到 <0.5%，然后 NPC 重跑 baseline + ablation。WIP=1 守住，本质是按发现做出的优先级调整 |
| 2026-05-02 | **NPC M1 v0.1 初版完成（结果待 Engine 修复后验证）**：baseline 1000 局（10s）+ ablation 200×16 组（36s）跑完。R9 领牌评分是支柱（去掉手数翻倍 39.7 → 77.6）；R1 是让路率支柱（去掉 99% → 84.8%）；13 项技能单独消融均 <1.0 手数差，待 t-test 区分"冗余/小效应"vs"真没用"。报告 `NPC_M1_REPORT.md` v0.1，DoD 3/4 ✅，但暴露 12.7% 引擎错误率 |
| 2026-05-02 | **🎉🎉 Sprint 1 封箱 · Phase 3 100% 完成**：Task 4（AI 思考省略号）落地，零 JS 改动纯 CSS 实现。波浪动画 3 个 dot opacity 实测 0.685/0.949/0.2 处于不同相位。**Client stream 进入 paused 状态。Sprint 2 启动，焦点切换到 NPC stream M1**。封箱报告 `design-audit/PHASE3_FINAL_REPORT.md` 含 P0/P1/P2 解决对照、5 维度对比、技术质量分析 |
| 2026-05-02 | **🎉 Phase 3 任务 3 整体完成**：3.3（牌组 2500ms dwell + 250ms fade-out）落地。隔离测试探针实测状态机精确：t=2550ms 时 fading-out class 加上 + timer 已清；t=2850ms 时 innerHTML 清空。新出牌触发"立即淡出"也验证通过。任务 3 4 个子任务全部 ✅，仅剩任务 4（AI 思考省略号） |
| 2026-05-02 | **Phase 3 任务 3.2 + 3.4 完成（顺手解决 4 象限分布）**：index.html 加 4 个 stage-quadrant 容器；style.css 加 4 个 fly-from-* keyframes；gameUI.js::showPlayedCards 改造为飞向中央 + animation-delay 错开 40ms；探针实测 +50ms 卡牌 transform=translateY(236px) opacity=0.156，证明动画在跑；4 quadrant 实测 {bottom:1, top:1, right:1} 同时占用。详见 `design-audit/PHASE3_TASK3_LOG.md` |
| 2026-05-02 | **Phase 3 任务 3.1 完成 + 任务 3 调查完成**：style.css 追加 `Phase 3 Task 3 Override Block`（含 `play-btn-summon` keyframe）；gameUI.js::updateTurnHighlight 加 9 行 hook（首次改 JS）；computed style 探针实测 spring 过冲到 0.999；MutationObserver 在 t=8089ms 捕获到真实游戏路径中 summon class 自动触发。任务 3 整体调查报告同时完成（出牌事件链 5 个 hook、3.2 实施入口已识别）。详见 `design-audit/PHASE3_TASK3_LOG.md` |
| 2026-05-02 | **Phase 3 任务 2（回合脉冲光晕）完成 · P0 已解决**：style.css 追加 `Phase 3 Task 2 Override Block`，2 个 @keyframes（队友琥珀 / 对手钢蓝）+ 涌现 transition；computed style 探针验证 alpha 实测 0.384~0.545 与 spec 100% 吻合。详见 `design-audit/PHASE3_TASK2_DIFF.md` |
| 2026-05-02 | **Phase 3 任务 1（基础过渡动效）完成**：style.css 末尾追加 `Phase 3 Task 1 Override Block`，5 处 transition 落地，详见 `design-audit/PHASE3_TASK1_DIFF.md` |
| 2026-05-02 | 项目升级为 3-stream 模式，WIP=1，建立驾驶舱 |
| 2026-05-02 | Client Phase 0/1/2 完成，进入 Phase 3 |
| 2026-04-30 | NPC R1-R15 落地，进入 paused（待稳定性测试达 DoD） |
| 2026-04-15 | Engine 进入维护态 |


---

## v2.0.2 · 全面 review 修复（2026-06-12）

用户实测反馈"打牌的过程中还是有很多不顺的地方"→ 52-agent 多维 Workflow review（事件/流程/NPC/交互/视觉/状态 6 维度），41 项确认发现（含 2 个 P0 死锁），7 文件 31 处修复。

### P0（必现死锁，全修）
1. **第 2 局开局死锁**：NEXT_ROUND 先 startRound（清 finishOrder）再 startTribute → currentTurn=undefined 全桌冻结。修复：有贡局跳过 startRound，engine 改读 toSeats。
2. **还贡弹窗死锁**：点牌即关弹窗，被 engine 拒绝（同队还贡 >10）后无法重选。修复：弹窗等 TRIBUTE_DONE/RETURN_DONE 确认才关 + 同队非法牌预过滤置灰 + engine 无合法牌时放宽。

### P1/P2 主要修复
- 进贡局 GAME_START 双发 → 局数 +2 跳号、发牌动画播两遍（按 phase 区分）
- 托管跨场残留；抗贡事件零反馈；NPC 决策被拒静默卡死（加兜底重打）
- 牌型大字 zoomFade forwards 钉死 opacity:0 → 整局只显示一次（class 重启机制）
- 桌面手牌按 70px 计算 vs CSS 实际 48px → 800-1100px 窗口牌面只露 6-15px（修为 48/22）
- 免出牌候选缺连对/钢板；级牌炸弹比较用原始 rank；同花顺 wild 判定死代码
- 提示循环切换（1/5→2/5）；自己 pass 清选牌；切后台暂停读秒/语音；弃局记负防刷
- 断局恢复：lastPlay 重放 + 记牌器 COUNTER_SYNC + round_end 快照可恢复
- game-message 移出屏幕正中；废弃 played-cards-area 隐藏；pass-chip 即时反馈

### 验证
- selfplay 1000 场 / 12,767 局：零崩溃，胜率 49.7/50.3，让路率 99.4%
- 浏览器端到端（setTimeout 钳速）：**完整一场 14 局连打**，13 次局间流转（含进贡/还贡/抗贡），蓝队过 A 正常 GAME_OVER，托管按钮自动复位，全程 0 JS 异常
- 1000px 窗宽 27 张手牌每张露 35px；提示循环/牌型大字/按钮禁用态逐项实测 ✅

### 遗留 P2 backlog（未做）
- 提示出法服务端按质量排序（当前枚举序）
- 战绩防刷深度处理（当前仅弃局记负）
- roundCount 断局恢复后从快照精确还原
- 移动端横屏布局

### 测试基建沉淀
- preview 服务器读不了 ~/Documents（TCC）→ rsync 到 /tmp/guandan-serve 再服务（同红警项目的坑）
- 浏览器加速浸泡测试法：`window.setTimeout` 钳制 ≤150ms + pilot interval 自动点结算/进贡 → 14 局/约 8 分钟


---

## v2.1 · NPC 进化第一档 + 第四档（2026-06-12）

用户实测反馈两问题（NPC 乱出大王 / 万能牌只配对子）→ 16-agent 诊断（12 根因全部对抗验证坐实 + 500 场实证统计 + 业界调研 DanZero/DouZero/PerfectDou/ISMCTS）→ 按四档进化路线拍板执行第一、四档。

### 第一档：根因修复（PracticeNPC/rules/handClassifier/memory/decomposeHand）
- **推断层重写**：isMyPlayUnbeatable / isEffectivelyMax 统一 normalized 域比较（原 raw/normalized 混用，级牌反压全漏判）+ 王总张数 4→2（原 bug 使 +55 无敌奖励被大王独占）+ 扣除自持牌精度升级
- **大牌纪律**：R9 +55 无敌奖励时机化（残局全奖/中盘组合 25/控制单张 0）；opponentNearWin 两处"取最贵"→ cheapestDominant（最小压得死，留王断后）；R1 护送 tie-break；R8 无敌单张需清手在望；R3 跳级禁王；控制牌保留成本（手牌>8 时 -30/张）
- **万能牌枚举补全**（rules.js 两路径）：自然 rank 炸（free play 原来连这个都没有）+ wild 补炸 3+1/2+2 + wild 三带二/连对/钢板（识别层一直支持、生成层零枚举）；decomposeHand 拆牌规划 wild 默认进炸弹
- **引擎 bug 顺手修**：classifyHand 三带二 wild 分配择优（原取最小解释 → 玩家手动出 [AAw99] 也被误拒）
- **实验室盲区修复**：selfplay/统计脚本补 roomId+记牌喂入（与产线 index.js 同口径）——记牌驱动行为第一次进实验室覆盖

### 第一档验收
| 指标 | 修复前（有记牌真基线）| 修复后 |
|---|---|---|
| 手牌>15 单出大王 | 8.43/百局 | **5.03（-40%）** |
| 万能牌配炸弹/三带二/连对/钢板 | **全部 0 次** | 27.3%/4.3%/9.4%/1.9%（炸弹成第一用法）|
| 万能牌单出浪费 | 36/百局（mean 手牌 8.9 时烧掉）| 11/百局（mean 3.2，只在收尾）|
| 跨版本对抗（vs v2.0.2，换边 5000 局）| — | 50.15%±0.7%（不回退）|
| 平均炸弹/局 | 0.95 | 1.46；拦截率 60.7→68.2% |

### 第四档：S2 残局精确求解（npc/EndgameSolver.js，master 档新技能 s2_endgame_exact）
确定化采样（对手剩牌 ≤16 时按记牌约束生成 K 世界）+ 2v2 完美信息 α-β 记忆化搜索（目标=头游归属，头游前无人出完 → 状态机免接风模拟）+ 多世界投票 + 预算兜底（爆算/必输交回启发式）。
- **对抗增益：S2 队 vs 无 S2 队头游率 65.9%（双向 3000 局，SE 1.2%）——项目史上最大单技能增益**（S1 仅 +1.5%）
- 浏览器实测：大师档 5 局触发 31 次，trace 显示"残局精算：100% 世界必胜"，零异常；产线预算 8 世界/80k 节点（单决策 <1s）

### 教训（第 3 次 + 新增）
1. **前端技能数组与引擎 preset 漂移**（第 3 次）：app.js PROFILE_SKILLS.master 没加 s2 → 浏览器大师档实际无 S2。已在两处加同步注释；根治需单一来源（前端 import SkillProfiles.js）
2. **浏览器 HTTP 启发式缓存**：python http.server 无 Cache-Control 头 → SW network-first 的 fetch(req) 吃启发式缓存 → 代码更新后页面长期跑旧 JS。已修 sw.js（fetch no-cache + cache bump v2.1.0）；**验证前端改动必须确认页面加载的是新代码**（查运行时特征，别信 rsync）
3. 多世界投票的票数必须世界级原子提交（爆预算世界的半截票污染 winRate>1）

### 遗留（第二/三档候选 + 小项）
- 第二档：最少手数（left-hands）拆牌 DP 评估框架统摄 R 技能（PerfectDou 思想，~1 周）
- 第三档：确定化 + ISMCTS 全局模拟（Web Worker，1-3 周，商用 Spades 同款）
- S2 性能优化（findPlayableHands 每节点重枚举是大头）；S1 炸弹风险建模；isMyPlayUnbeatable 对手 wild 反压建模
- 万能牌进贡情报注入采样


---

## v2.2 · NPC 进化第二档（2026-06-12）

用户实测"大师档打牌思路也有问题"→ 推进既定路线第二档：把 R 技能的零散口诀统一到"全局算账"。

### R16 最少手数精确评估（npc/HandEvaluator.js，新技能 r16_min_tricks，挂 master）
- **minTricks DP**：锚定最小 rank 的记忆化搜索，枚举 单/对/三/三带二/炸弹/顺子(5)/连对(3×2)/钢板(2×3) 全组合取最少手数；王单独折算；万能牌贪心赋值集（补炸/补顺/还原级牌）取最优
- **性能远超预期**：27 张手牌 0.4ms/副（全局 memo 命中率高——同一决策 30 个候选共享子状态）
- **接入面**：decomp.tricksNeeded（炸弹时机/出口规划/残局判断）、scoreLeadPlay 拆牌损失、R3/R12/R14/R15 跟牌保护、S1 两步锁胜判定——贪心拆牌"以为还要 5 手其实 3 手"的系统性误判被精确账本取代

### S2 扩域 + 性能保护
- 触发域 16→18 张（unseen）/ 12→13 张（手牌）；预算 80k→110k
- fail-fast：首世界爆预算即放弃整个决策（边界局面从白烧 1.6s 降到 ~250ms）
- 票数世界级原子提交（v2.1 已修）保持
- 浏览器实测：S2 触发 6.2→9.7 次/局（+57% 覆盖），最坏主线程卡顿 ≤1.5s（110k 校准后）

### 验收
| 口径 | 结果 |
|---|---|
| master(v2.2) vs master(v2.1@e0dd8b0) 双向 2400 局 | **55.3%/55.2%（+5.25%，SE 1.0%，零错误）** |
| selfplay 200 场回归 | 4.7s、让路率 99.6%、胜率平衡 |
| 浏览器大师档 7 局 | R16 挂载 ✓、S2 68 次、零异常 |
| minTricks 对拍 | 11 组手工用例全对（含 wild 补炸/补顺）|

### 教训（第 4 次！已根治）
**排除式 filter 对新增枚举值不设防**：expert preset 的 `filter(≠R5,≠S1)` 让新加的 S2/R16 自动漏入 expert → selfplay 200 场跑了 1809s（S2 全员全开）。已改为显式白名单——新技能默认不进任何档位，必须显式挂载。前端 ALL_SKILL_IDS 不含新 id 所以未漏（但 master 数组三处同步仍是手工的）。

### 遗留（第三档候选）
- 确定化 + ISMCTS 中盘模拟（Web Worker，1-3 周）——调研已备（AI Factory Spades 商用方案）
- minTricks 的中盘"压制价值"维度（当前只算手数，不算牌力交换）
- S2 solve() 候选 top-N 截断换更深触发域（正确性 tradeoff 需实验）


---

## v2.3 · NPC 进化第三档（2026-06-12）

### S3 中盘多世界模拟（npc/MidgameSimulator.js，新技能 s3_midgame_sim，挂 master）
- **设计**：候选 top-8（轻量启发排序）× 28 世界采样（复用 S2 采样件）× 轻量策略 rollout 到头游归属；**显著性接管**——最优候选胜率领先次优 ≥0.15 才改判，信号不清晰交回启发式（S1 第一版"替代式增强"翻车教训的制度化）
- **rollout 策略**：领牌"长度优先成本次之"、跟牌"最小代价能压"+35% 保守忍牌噪声、炸弹时机简化；双方同策略 → 偏差对称抵消
- **性能**：2ms/决策（平均）、触发域全场剩牌 ≤56；浏览器最坏卡顿 1.4s（S2+S3 叠加）

### 验收
| 口径 | 结果 |
|---|---|
| master(+S3) vs master(无S3) 双向 2400 局 | **57.3%/52.3%（平均 +4.8%，零错误）** |
| S3 接管率 | ~0.9 次/局（selfplay）/ 1.6 次/局（浏览器全功率）|
| selfplay 200 场回归 | 4.69s、胜率平衡（expert 白名单不受影响）|
| 浏览器大师档 7 局 | S3 挂载 ✓、11 次接管、trace 可解释、零异常 |

### 四档进化路线终局（2026-06-12 单日完成）
| 档 | 内容 | 增益 |
|---|---|---|
| 一 | 12 根因修复（大牌纪律+万能牌枚举）| 行为质变（胜率持平）|
| 四 | S2 残局精确求解 | +15.9%（vs 无 S2）|
| 二 | R16 最少手数 DP + S2 扩域 | +5.25%（vs v2.1）|
| 三 | S3 中盘多世界模拟 | +4.8%（vs 无 S3）|
| 档位序 | master vs expert | 51.5%（v1.4）→ **71.6%** |

### 遗留备案（均为可选小项）
- rollout 配合意识（让队友/护送）；头游口径 → 双上细分
- S3/S2 统一为 ISMCTS 树（信息集共享统计）——学术正统版，工程量大收益未知
- RL 终极难度（DanZero 路线）：不建议，性价比极低


---

## v2.5 · 病例驱动蠢行为修复（2026-06-13）

玩家复盘标记"NPC 还是很蠢"→ 复现病例 + 16-agent 自动审计（5 维度自对弈检测+读码+对抗复核）。
**核心洞察：体感"蠢"主因是启发式确定性 bug，不是 AI 上限——这些 bug 短路了 S2/S3 搜索，再强的大脑也救不了。**

### 修复 8 类（病例 + 审计确诊 7/11）
| # | 蠢行为 | 频率 | 修复 |
|---|---|---|---|
| 病例 | 领牌时对手快赢→强出无敌单张/级牌对（甩大王/小王/22）| 玩家标记 | chooseLeading opponentNearWin 只在 clearAll/无敌多张时接管，否则交回 R9 |
| 1 | 领牌出"不减手数"的长牌型（拆炸/割裂手型白费一手）| 2.9/局 | scoreLeadPlay：breakLoss≥1 硬罚 -50（长度奖励不得抵消结构损失）|
| 2 | 对手快赢跟牌用大王压人家小单 | 2.4%/跟牌 | opponentNearWin 跟牌取 normalPlays[0]（最便宜能压），dom 仅在不更贵时用 |
| 4 | 手少时无脑压稳赢的队友抢墩（91.7%烧控制牌）| 0.52/局 | shouldYieldToTeammate：≤5张仅"能一手清完"才不让；readTeammateSignal 排除级牌/王 |
| 3+5+7 | S2/S3 同胜率不挑省牌/清手多 → 甩大王、挤牙膏 | ~1.4/局 | 两求解器投票加 tie-break：(清手张数降序, 成本升序) |
| 6 | 万能牌塞三带二当垫牌而非升格炸弹 | 2.6/局 | scoreLeadPlay：万能折扣(35)仅在真填序列缺口时给，否则严格保护(90) |
| 文案 | 领牌却标"管上阻截"（误导复盘）| — | inferPrimaryReason：阻截只在跟牌成立 |

### 验收
| 口径 | 结果 |
|---|---|
| 领牌甩大牌单项修复 vs v2.4 双向 2000 局 | +7.6%（61.0/54.2）|
| **综合 8 类修复 vs v2.4 双向 2000 局** | **+10.5%（63.4/57.6，零错误）— 项目史上单次最大增益** |
| selfplay 300 场回归 | 让路 99.4%、拦截 70%、零错误、胜率平衡 |
| 病例复现 + 单元测试 | 领牌甩大牌/跟牌烧大王/抢队友墩 全部归零；边界(只剩大王能走人仍抢)正确 |
| 浏览器大师档 6 局 | 零异常、最坏卡顿 302ms |

### 方法论沉淀（重要）
1. **病例驱动 > 堆框架**：一个领牌 bug 修复 +7.6%，超过 R16(+5.25%)/S3(+4.8%) 任何单个大框架。玩家标记的"蠢"几乎都是真实失分点。
2. **启发式短路是搜索的盲区**：opponentNearWin 等"紧急捷径"直接 return，绕过 S2/S3。修捷径比加搜索更治本。
3. **统一病根**：8 类 bug 本质都是"该出最省/最优结构却出最贵/破坏结构"——评分权重失衡 + 求解器无成本 tie-break。
4. 复盘功能(v2.4)是这套闭环的基础设施：玩家标记→上帝视角导出→复现→修→对抗固化。

### 遗留（策略深度，非 bug）
- 名次智慧（双上/二游，S2/S3 目标从"头游"升级"名次期望分"）
- 缺门推断（对手 pass 过的牌型 → 采样约束，让推演更准）
- rollout/求解器的配合意识（当前队友也"自私"抢头游）
- 大师技能集重测（R6/R13/R14/R15 在 R16 加持下可能转正）
