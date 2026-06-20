# 阶段 1 · 视觉骨架重塑 · 改造记录

> 完成时间：2026-05-02  
> 性质：只改最外层视觉（颜色、阵营色、底色、顶栏外观），不动组件结构、不加动效。  
> 改动隔离策略：在 `css/style.css` 末尾**追加** "Phase 1 Override Block"，不修改任何现有规则。回滚时删除该块即可。

---

## 一、改动清单（仅 2 个文件）

| 文件 | 类型 | 改动 |
|------|------|------|
| `index.html` | 修改 1 处（第 16-20 行 → 第 16-17 行） | 把"← 沃伦·巴菲虾"内联样式 `<a>` 替换为 `<a class="back-to-products" aria-label="返回主站">≡</a>`，href 不变 |
| `css/style.css` | 在末尾追加 Phase 1 Override Block（约 110 行 CSS） | 覆盖 4 个视觉层面的样式，全部通过 `var(--token)` 引用，零硬编码数值 |

未改动：所有 JS 文件、所有组件 DOM 结构（除 1 处 anchor 标签内容）、style.css 原有规则。

---

## 二、四个改造点 × Token 映射

### 改造 1：桌面背景

| 维度 | 改造前 | 改造后 | 来源 Token |
|------|--------|--------|-----------|
| 主色 | `#1a7144`（亮饱和绿） | `#1A4A2E`（深克制绿） | `--surface-felt-main` |
| 边缘色 | `#093f23` → `#042513` | 单一 `#143822` 终点 | `--surface-felt-edge` |
| 渐变形态 | 三色 circular radial | 二色 ellipse radial（中心保持主色到 45%，边缘平滑过渡） | — |
| 织物纹理 | 无 | 220×220px 重复的 SVG fractalNoise，5% alpha | DESIGN_TOKENS §1.1 提到的「沉浸/有质感」要求 |
| 实现方式 | `background: radial-gradient(...)` | `background-color` + `background-image` 双层（noise 在上，渐变在下） | — |

**视觉变化：** 原本平铺、过亮的绿色变为有视觉深度的桌布——中心微亮（玩家注意力锚点），边缘自然压暗（vignette 收束视线），表面细微噪点提供"质感"而不张扬。

---

### 改造 2：玩家位卡阵营色 ⭐

| 玩家 | 静止态 | 激活态 |
|------|--------|--------|
| **对家**（队友，#player-top）| 边框/头像环/徽章用 `var(--faction-ally-muted)` `#9A6820` | 升级到 `var(--faction-ally-primary)` `#E8A230` + `var(--shadow-avatar-ally-active)` 静态光晕 |
| **左家**（对手，#player-left）| `var(--faction-opp-muted)` `#2D5980` | `var(--faction-opp-primary)` `#4B8FC4` + `var(--shadow-avatar-opp-active)` |
| **右家**（对手，#player-right）| 同左家 | 同左家 |

**激活态特殊处理：** 原 `.active-turn` 的橙红渐变背景会污染阵营色信号，已用 `var(--surface-panel)` 中性深色面板替代——让边框 + 光晕成为唯一的阵营信号。**无脉冲动画**（留给阶段 3）。

**视觉变化：**
- 顶部对家位卡：原红色计数徽章 → 琥珀金徽章；头像周围多一圈琥珀色 ring
- 左右对手位卡：原红色徽章 → 钢蓝徽章；头像有钢蓝 ring
- 即使在非激活态，阵营色也以 muted 形式持续可见——玩家不再需要每次都重新辨认敌友

---

### 改造 3：卡牌底色与花色

| 元素 | 改造前 | 改造后 | 来源 Token |
|------|--------|--------|-----------|
| 普通卡牌 `.card` 底色 | `var(--card-white)` `#fdfbf7`（近纯白） | `var(--surface-card)` `#F8F6F0`（微暖纸感白） | DESIGN_TOKENS §2.1 |
| 红花色 `.card.red` | `#d63031`（纯红） | `var(--suit-red-on-card)` `#CC2222` | DESIGN_TOKENS §2.4 |
| 黑花色 `.card.black` | `#2d3436` | `var(--suit-black-on-card)` `#1C1C2E` | DESIGN_TOKENS §2.4 |
| 大王红色 `.card.joker-red` | `linear-gradient(135deg, #fff0f0, #fff)` | `linear-gradient(135deg, #fff0f0, var(--surface-card))` | — |
| 小王黑色 `.card.joker-black` | `linear-gradient(135deg, #f0f0ff, #fff)` | `linear-gradient(135deg, #f0f0ff, var(--surface-card))` | — |

**视觉变化：** 卡牌不再是发光屏幕般的纯白，而是温润纸质感；红色花色不再和绿桌形成刺眼的互补振动，黑色花色更厚重立体。这是阅读体验提升中"看不见但能感到"的一类改动。

---

### 改造 4：顶部信息栏 + 汉堡菜单

#### 4a. 游戏内顶栏（`.game-info-bar`）

| 维度 | 改造前 | 改造后 |
|------|--------|--------|
| 形态 | 浮动在 top:16px，三个独立元素中央对齐 | 全宽 HUD 条贴顶（top:0），含 8px 内边距 |
| 背景 | 无（透明） | `var(--surface-panel)` `rgba(10,28,18,0.88)` |
| 模糊 | 无 | `backdrop-filter: blur(8px)` |
| 底边 | 无 | `1px solid var(--surface-panel-border)` |

子元素 `.level-display` 的旧深底层透明化（`background: transparent`），融入新 HUD 条避免暗叠暗。

#### 4b. 返回主站 → 汉堡菜单按钮（`.back-to-products`）

| 维度 | 改造前 | 改造后 |
|------|--------|--------|
| 内容 | "← 沃伦·巴菲虾" 文字 | "≡" 汉堡图标 |
| 尺寸 | 自适应文字宽度，padding:6px 14px | 固定 44 × 44 px（HIG 标准触摸目标） |
| 位置 | top:14px / left:14px（脱离顶栏） | top:0 / left:0（与顶栏齐平左对齐） |
| 样式来源 | 内联 style 写死的颜色和模糊 | `var(--surface-panel)` 背景 + `var(--surface-panel-border)` 边 + token 文字色 |
| href | `../../products.html` | `../../products.html`（**未变**）|

**视觉变化：** 从"产品层链接侵入游戏画面"转变为"游戏 HUD 的左侧入口"——侵入感消失，统一在顶栏视觉系统内。

---

## 三、严格遵守的"不做"清单

| 应做的（阶段 2/3） | 阶段 1 是否触碰 |
|------------------|----------------|
| 改按钮（出牌、不出、提示、理牌） | ❌ 未触碰，与阶段 0 完全相同 |
| 改手牌区交互（重叠量、悬停、选中态） | ❌ 未触碰 |
| 加动画 / transition | ❌ 未新增任何 transition |
| 旋转左右家位卡 90° | ❌ 未旋转，位置布局保持 |
| 中央舞台视觉锚（虚线框） | ❌ 留给阶段 2 |
| 回合脉冲光晕 | ❌ 仅静态 box-shadow，留给阶段 3 |
| 级牌/积分 HUD 重设计 | ❌ 现有元素保留，仅外层加面板背景 |

---

## 四、视觉对比文件清单

| 文件 | 用途 | 路径 |
|------|------|------|
| `before-phase1.png` | 阶段 0 完成态全景（与 `phase0-after.png` 等价） | `Archive/warren-shrimp/games/guandan/design-audit/before-phase1.png` |
| `after-phase1.png` | 阶段 1 完成态全景 | `Archive/warren-shrimp/games/guandan/design-audit/after-phase1.png` |
| `after-phase1-detail-top.png` | 顶部 HUD + 队友位卡近景，看汉堡按钮、HUD 条、琥珀色阵营徽章 | `Archive/warren-shrimp/games/guandan/design-audit/after-phase1-detail-top.png` |
| `after-phase1-detail-sides.png` | 左/右对手位卡近景，看钢蓝阵营徽章 | `Archive/warren-shrimp/games/guandan/design-audit/after-phase1-detail-sides.png` |
| `after-phase1-detail-cards.png` | 手牌近景，看卡牌底色和花色变化 | `Archive/warren-shrimp/games/guandan/design-audit/after-phase1-detail-cards.png` |

> **如何在 macOS 上看截图：** Finder + `Cmd+Shift+G` → 粘贴 `/Users/linshi/Documents/Archive/warren-shrimp/games/guandan/design-audit/` → 选中 png 按 **空格** Quick Look，方向键左右切换。

---

## 五、回滚路径

如果阶段 1 出问题需要立即回到阶段 0：

1. 打开 `css/style.css`，找到注释 `/* ============ 阶段 1 视觉骨架重塑（Phase 1 Override Block）============ */`，**删除从该注释到文件末尾的所有内容**。
2. 打开 `index.html`，把第 15-17 行的汉堡按钮还原为原内联样式 `<a>` 链接（git diff 可见原始内容）。

不会影响 tokens.css，也不会影响其它阶段。

---

## 六、阶段 2 入口条件

确认以下 4 项后即可进入阶段 2：

- [ ] `after-phase1.png` 与 `before-phase1.png` 的视觉差异符合上述清单（4 处改动可见）
- [ ] 左上角 "≡" 汉堡按钮点击后仍能跳转到 `../../products.html`（功能不丢）
- [ ] 队友（顶部对家）的徽章是琥珀金，不是红色
- [ ] 左/右对手徽章是钢蓝色，不是红色
