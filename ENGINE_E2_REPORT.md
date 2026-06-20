# Engine E2 · 规则审计与补全（v1.1 主任务）

> 完成时间：2026-06-10 · Sprint 4（v1.1 规则可信）
> 规则蓝本：掼蛋国家竞赛规则（扑克协会版，= 腾讯同款蓝本，决策 3）
> 蓝本来源：Web 核实（小米游戏中心《掼蛋（国家）竞赛规则》第二/十/十四条 + 多源交叉验证）
> 状态：**引擎侧 5 项修复全部完成并验证**；断局恢复（Client 侧）另行推进

---

## 一、TL;DR

以协会版规则逐条审计 Engine，发现 **5 处偏离蓝本**（含 2 处重大缺失），全部修复并通过 1000 局 A/B + 300 场路径探针验证：

- 抗贡规则从无到有（实测 12.15% 局数触发——不是边缘 case，是高频规则！）
- "过 A 必须打"从无到有（A 级局占比 0% → 17%，一场局数 9.5 → 12.8）
- 进贡牌定义三重错误修正（王可贡、红心级牌除外、按牌力比较）
- 双贡配对 + 首出权修正
- 队内还贡 ≤10 限制补齐

---

## 二、审计清单（协会版 vs Engine 修复前）

| # | 协会规则条文 | Engine 修复前 | 判定 | 修复 |
|---|------------|--------------|------|------|
| 1 | 进贡手中最大的牌，**红心级牌除外**（大小王、级牌在范围内，按牌力比较：大王>小王>级牌>A）| `rank <= 14 && rank !== 2`：王被错误排除、红心级牌未排除、级牌按面值比较 | ❌ 三重错误 | `tributeValue()` 牌力函数 + `isWildCard` 过滤 |
| 2 | 抗贡：单贡持 2 大王免贡；双贡二人各 1 张或一人 2 张免贡；抗贡后**上游先出** | 完全没有 | ❌ 缺失 | `startTribute` 发牌后判定合计大王数 ≥2 → 跳过进贡直接 PLAYING，发 `TRIBUTE_RESISTED` 事件 |
| 3 | 还贡：还**己方搭档**必须 ≤10（含10）；还对方任意牌 | 只验证非级牌，无队内限制 | ⚠ 错位 | pairMap 同队判定 → rank ≤10 且非级牌；对外按协会版放开 |
| 4 | 双贡：上游拿**大贡牌**并还给贡大牌者，二游拿小贡牌；**贡大牌者先出**（单贡进贡者先出）| 按座位序硬配对；固定末游先出 | ❌ 错误 | `pairMap`（贡牌按牌力排序配对）+ 首出 = `pairMap[头游]` |
| 5 | **A 必须打**：头游 + 搭档非末游才算过 A 取胜；否则继续打 A | 升到 A 即直接 GAME_OVER | ❌ 重大缺失 | `wonAtA = currentLevel===14 && firstTeamLevel>=14 && !partnerIsLast` |
| 6 | 升级：双上+3 / 1+3 +2 / 1+4 +1，仅头游方升级 | `evaluateRound` 正确 | ✅ | 无需改 |
| 7 | 首局免贡 | `isFirstRound` 跳过 | ✅ | 无需改 |

## 三、改动清单

| 文件 | 改动 |
|------|------|
| `server-runtime/game/engine.js` | ① import `isWildCard` + 新增 `tributeValue()` ② `handleTribute` 进贡牌验证重写（含等值牌兼容：两副牌可能有两张同力牌）③ `startTribute` 抗贡判定块 ④ `handleTribute` 完成时建 `pairMap` ⑤ `handleReturnTribute` 队内 ≤10 限制 + 按 pairMap 配对交换 + 首出权修正 ⑥ `handleRoundEnd` 过 A 判定重写 |
| `server-runtime/selfplay.mjs` | `pickTributeCard` / `pickReturnCard` 同步协会版逻辑（E1 教训：测试工具与 engine 规则定义必须一致）|

未动：rules.js / classifier.js / decomp.js、NPC 全部文件、Client 全部文件。

## 四、验证

### 1000 局 A/B（修复前 = M2 基线）

| 指标 | 修复前 | 修复后 | 解读 |
|------|-------|-------|------|
| 进贡类错误（E1-E4）| 0 | **0** | ✅ 新规则路径无错误 |
| round 数/场 | 9.5 | **12.8（+34%）** | ✅ "A 必须打"的预期效应 |
| 平均手数/局 | 39.0 | 39.0 | ✅ 单局行为不变 |
| 让路率 | 99.2% | 99.1% | ✅ |
| 胜率对称 | 49.5/50.5 | 50.5/49.5 | ✅ |
| 总错误 | 0/1000 | 2/1000 = 0.2% | ✅ < 0.5% DoD；根因见下 |

### 300 场路径探针（证明新路径非 dead code）

| 新路径 | 实测 |
|--------|------|
| 抗贡触发 | 472 次 = **12.15% 局数**（高频规则，此前完全缺失）|
| 队内还贡判定（1+4）| 1485 次 |
| A 级局占比 | **17.0%**（修复前 0%）|
| 完赛率 | 300/300（平均 12.9 round/场）|

### 已知遗留（新发现，不在 E2 范围）

**E7 出牌路径潜伏 bug（0.2%）**：`lastPlay` 为同花顺时，NPC 的 `findPlayableHands` 把普通顺子当作合法候选，engine 拒绝（"炸弹不够大"），fallback 单张再被拒（"牌型不匹配"）。两次样本模式完全一致。与 E2 改动无关（E2 未动出牌路径），是 round 数 +34% 后被踩出来的旧 bug。**已记入 ENGINE_BACKLOG 作为 E3**。

## 五、v1.1 DoD 进度 → 全部完成 ✅

- [x] 规则审计清单（本报告第二章）
- [x] 抗贡 + 过 A 按蓝本实现
- [x] 断局恢复（v1.1 收尾 session 完成，见第七章）
- [x] 完整一场体验 review（同上，发现并修复 3 个真 bug）
- [x] 1000 局 A/B 验证（封箱回归再次零错误）

---

## 七、v1.1 收尾 session（断局恢复 + 完整一场 review + E3）

### E3：同花顺/天王炸跟牌 bug 修复

E2 发现的 0.2% E7 错误根因确认：`lastPlay` 为**天王炸**（ROCKET=200，非同花顺）时，`findPlayableHands` 仍把同花顺列为候选（威力不足必拒）。顺手修复第二个对偶 bug：上一手是同花顺时，**更大的同花顺反而不被列为候选**（AI 漏选项）。修复后按炸弹威力统一比较。**3000 局回归零错误**。

### E2 漏网之鱼：浏览器 NPC 进贡路径

`rules.js::selectTributeCard`（server 端 NPC 自动进贡用）是 E2 同款三重错误（排王、不排红心级牌、面值比较）——E2 当天只同步了 selfplay 路径。已修复并在 `index.js` 调用处传入 `currentLevel`。NPC 自动还贡同步加 ≤10 优先。

### 断局恢复（localStorage）

| 层 | 实现 |
|----|------|
| engine 接口 | `LoopbackServer` 构造选项 `onStateChange` + `_snapshot`（room→JSON）+ `_persist`（GAME_OVER 清档）|
| 恢复路径 | dispatch `RESTORE_GAME` case + `RoomManager.restoreRoom`（真人 id 换新、NPC 配置还原）+ 按 phase 续接事件（PLAYING→YOUR_TURN / TRIBUTING→重发请求）|
| 客户端 | `loopback.js` 写/清 localStorage（key `guandan_save_v1`）+ `hasSave/restoreGame/clearSave`；大厅"继续上一局"按钮 |
| 端到端验证 | 开局出牌→存档写入✅ → 刷新→按钮出现✅ → 恢复→手牌 26 张正确✅ → 继续推进+存档更新✅ |

已知妥协：恢复后 NPC 记牌器清零（记忆不在 gameState 内）；桌面中央不重放 lastPlay 展示。均不影响合法性。

### 完整一场 review：发现并修复 3 个真 bug

| # | Bug | 修复 |
|---|-----|------|
| 1 | **进贡 UI 白板**：`showTributeUI` 用裸 `textContent` 渲染（无花色无样式）| 改用 `CardRenderer.createCardElement` + 按协会牌力高亮合法进贡牌（非法牌降透明不可点）|
| 2 | **TRIBUTING 的 GAME_START 缺 currentLevel** → 还贡 UI 级牌过滤用旧级牌 | `startTribute` 事件补 currentLevel/team levels |
| 3 | **`room.id` 一直是 undefined**（Room 类只定义 roomId）→ NPC 记牌器 key 失效 | Room constructor 加 `this.id` 别名 |

跨局链路验证（事件流 + 截图）：结算弹窗 → 继续下一局 → NPC 自动进贡 → 真人还贡 UI → 第二局发牌 → **升级正确（1+3: 2→4）、级牌切换正确（级牌:4）、回合正常推进** ✅

小优化点（记录不修）：`room.nextRound()` 在需要进贡时仍先 `startRound` 发一次牌（被 `startTribute` 覆盖，浪费一次洗牌，功能正确）。

### 封箱回归

1000 局：零错误、手数 39.0、让路率 99.1%、胜率对称 ✅

**v1.1 规则可信 · 封箱 🎉**

## 六、教训

1. **"简化实现"会复合发酵**：进贡牌定义的三重简化（排王、不排红心级牌、面值比较）+ 无抗贡 + 无配对，五个问题纠缠在同一段代码里。按蓝本逐条审计是唯一能把它们全部翻出来的方法。
2. **高频规则被当成边缘 case**：抗贡实测 12% 局数触发——缺了它等于 1/8 的局开局方式是错的。
3. **规则修复会暴露邻近 bug**：round 数 +34% 直接把 E7（同花顺跟牌）踩了出来。**回归量变大本身就是一种测试**。
