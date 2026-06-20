# 阶段 1 v2 · 验收回流改造记录

> 完成时间：2026-05-02  
> 性质：针对 v1 验收意见（5 项）的修复迭代，无新增功能。  
> 实施方式：原地替换 `style.css` 末尾的 Phase 1 Override Block（v1 → v2），未新增追加块。

---

## 一、5 项验收意见 × 修复对照

| # | 验收意见 | v1 现状（问题根源）| v2 修复 |
|---|---------|------------------|--------|
| 1 | 阵营色必须「一眼可分」 | v1 用 `border-color` 覆盖（仅改色），原 gray 边的 `2px solid` 部分仍生效，但若原值有变化时不可控 | v2 改用 `border: 2px solid` 完整简写，明确接管 width + style + color |
| 2 | 卡牌底色 / 花色色 | `.card` 仍带 `inset 0 0 10px rgba(255,255,255,1)` 内发光，把 `#F8F6F0` 中央染纯白，看起来像没改 | 重写 `.card` 的 box-shadow，**移除 inset 白色内发光**，仅保留外侧投影 |
| 3 | 织物纹理看不见 | SVG 仅有 `viewBox` 没显式 `width/height`，部分浏览器以默认 300×150 渲染，平铺尺寸异常 | SVG 加 `width='220' height='220'`，改用 `<rect opacity='0.04'/>` 替代 feColorMatrix 法（更跨浏览器） |
| 4 | 撤销偷跑的金色弧形动效 | 原 `.player-info` 带 `transition: all 0.3s`，`.active-turn` 带 `transform: scale(1.05)`，回合切换时产生可见动画 | 全局 `transition: none !important; transform: none !important; animation: none !important;` |
| 5 | 顶栏金色污染 | `.current-level-badge` 是金色渐变；`.vs-text` 用 `--accent-gold`；金色被三处共用，污染阵营色语义 | 级牌标签改透明面板 + 浅文字；VS 改 `var(--text-secondary)`；金色仅留给队友阵营 + 出牌按钮 |

---

## 二、实际改动 CSS 对照

### 改动 1：阵营色完整 border 简写（解决意见 #1）

```diff
- #player-top .player-info {
-   border-color: var(--faction-ally-muted);
- }
+ #player-top .player-info {
+   border: 2px solid var(--faction-ally-muted);
+ }

- #player-top .player-info.active-turn {
-   border-color: var(--faction-ally-primary);
- }
+ #player-top .player-info.active-turn {
+   border: 3px solid var(--faction-ally-primary);
+ }
```

队友/对手两套 muted/active 共 4 个选择器同步替换。

### 改动 2：移除卡牌 inset 白色内发光（解决意见 #2）

```diff
  .card {
    background: var(--surface-card);
+   box-shadow: -2px 0 8px rgba(0,0,0,0.30);
+   /* 原本还带 inset 0 0 10px rgba(255,255,255,1)，那就是把卡牌中央染纯白的元凶，移除 */
  }
+ .card:first-child {
+   box-shadow: 0 2px 8px rgba(0,0,0,0.30);
+ }
```

### 改动 3：织物纹理可靠化（解决意见 #3）

```diff
- url("data:image/svg+xml;utf8,...viewBox='0 0 200 200'...feColorMatrix values='0 0 0 0 1 ... 0.05 0'..."),
+ url("data:image/svg+xml;utf8,...width='220' height='220'...rect ... opacity='0.04'..."),
```

关键改动：
- 从 `viewBox` 改为显式 `width='220' height='220'`，确保 SVG 有内在尺寸
- 删除 `feColorMatrix`，改用 `<rect opacity='0.04'/>` 直接设不透明度——更简洁、跨浏览器一致

### 改动 4：全局 kill 动效（解决意见 #4）

```diff
+ /* 2.0 全局 kill：所有玩家位卡的 transition、transform、animation */
+ .player-info,
+ .player-info.active-turn {
+   transition: none !important;
+   transform: none !important;
+   animation: none !important;
+ }
```

`!important` 在此场景的合理性：原 `.player-info` 的 `transition: all 0.3s` 和 `.active-turn` 的 `transform: scale(1.05)` 都在更高源序之前定义，且没有更高 specificity 的覆盖路径，必须强制覆盖。

### 改动 5：顶栏金色清理（解决意见 #5）

```diff
+ .current-level-badge {
+   background: transparent;
+   border: 1px solid var(--surface-panel-border);
+   color: var(--text-primary);
+   box-shadow: none;
+ }
+ .vs-text {
+   color: var(--text-secondary);
+   font-style: normal;
+ }
```

---

## 三、验收证据截图清单

> 路径：`/Users/linshi/Documents/Archive/warren-shrimp/games/guandan/design-audit/`  
> 查看方式：Finder + 空格 Quick Look，方向键左右切换前后图

| 文件 | 看什么 |
|------|--------|
| `after-phase1-v2.png` | v2 全景终图，对比 `before-phase1.png` 总体改观 |
| `after-phase1-v2-detail-top.png` | 顶栏：汉堡按钮、HUD 条、**VS 不再金色**、**级牌标签不再金色**、**队友 amber muted 边框** |
| `after-phase1-v2-detail-sides.png` | 侧面：左右对手 **2px 钢蓝 muted 边框** |
| `after-phase1-v2-active-turn.png` | 关键证据：**队友 active 状态（3px amber + 静态光晕）+ 对手非 active（2px 蓝 muted）三方一眼可分** |
| `after-phase1-v2-detail-cards.png` | 卡牌：**真实暖白底**（不再被白色内发光污染）+ **#CC2222 红 / #1C1C2E 黑** |
| `after-phase1-v2-texture.png` | 200×200 桌面中央放大：织物噪点细微可见 |

---

## 四、阶段 1 验收清单（v2 复核）

- [x] **阵营色一眼可分**：active-turn 截图证据，队友 amber × 对手 blue 双色对峙
- [x] **静态 box-shadow，无 animation**：CSS 中 `transition/transform/animation: none !important`
- [x] **卡牌真实暖白底**：移除 inset 白光，`#F8F6F0` 在视觉上明显不同于纯白
- [x] **红/黑花色已用 token**：`var(--suit-red-on-card)` / `var(--suit-black-on-card)`
- [x] **织物纹理 0.03-0.05 范围**：实际 0.04，texture 截图可见细微噪点
- [x] **金色仅留给两个语义槽**：队友阵营徽章 + 出牌按钮（出牌按钮未改动，保持 v1 现状）

---

## 五、阶段 1 v2 完成确认

文件改动只有：
- `index.html`（v1 已改，v2 不再动）
- `css/style.css` 末尾的 Phase 1 Override Block（v1 → v2 原地替换）
- `css/tokens.css`（阶段 0 文件，未改动）

回滚方式不变：删除 `Phase 1 Override Block v2` 整块即可。
