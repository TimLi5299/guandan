# 阶段 0 · Token 基础设施落地记录

> 完成时间：2026-05-02  
> 性质：地基阶段，"把工具放进工具箱"，不动任何组件视觉。

---

## 改动清单

| 文件 | 类型 | 说明 |
|------|------|------|
| `css/tokens.css` | 新建 | 73 个 CSS 自定义属性，覆盖 DESIGN_TOKENS.md 全部 10 个章节 |
| `index.html` | 修改 1 行 | 在 `style.css` 引入前增加 `<link rel="stylesheet" href="css/tokens.css">` |

**未改动：** style.css、所有 JS 文件、所有组件 DOM 结构。

---

## 文件加载顺序（关键）

```html
<link rel="stylesheet" href="css/tokens.css">   ← 先：声明全部新 token
<link rel="stylesheet" href="css/style.css">    ← 后：现有 :root 覆盖同名 token，保护现状
```

**为什么不让 tokens.css 后加载？**  
若 tokens.css 后加载，`--text-primary`（值 `#EEF2EE`）会覆盖 style.css 中的 `--text-primary`（值 `#ffffff`），所有现有文字会从纯白变成米灰白，违反"视觉不变"约束。把 tokens.css 放前面，让 style.css 的现有 :root 块充当"兼容层"，保护现状。

后续阶段在重写组件 CSS 时，会逐步从 style.css 中移除这些被覆盖的旧值，让 tokens.css 中的新值真正生效。

---

## Token 注入验证（DevTools API 探针）

通过 `getComputedStyle(document.documentElement).getPropertyValue('--xxx')` 在浏览器中读取 Token 值：

| Token | 期望值 | 实测值 | 状态 |
|-------|--------|--------|------|
| `--surface-felt-main` | `#1A4A2E` | `#1A4A2E` | ✅ |
| `--surface-felt-stage` | `#1E5435` | `#1E5435` | ✅ |
| `--surface-card` | `#F8F6F0` | `#F8F6F0` | ✅ |
| `--faction-ally-primary` | `#E8A230` | `#E8A230` | ✅ |
| `--faction-opp-primary` | `#4B8FC4` | `#4B8FC4` | ✅ |
| `--semantic-primary` | `#E8A230` | `#E8A230` | ✅ |
| `--semantic-secondary` | `#3D6B8A` | `#3D6B8A` | ✅ |
| `--suit-red-on-card` | `#CC2222` | `#CC2222` | ✅ |
| `--space-md` | `16px` | `16px` | ✅ |
| `--radius-card` | `6px` | `6px` | ✅ |
| `--shadow-card-rest` | (双层投影) | (一致) | ✅ |
| `--shadow-avatar-ally-active` | (3px 边框 + 16px 光晕) | (一致) | ✅ |
| `--ease-out-enter` | `cubic-bezier(0.25, 0.46, 0.45, 0.94)` | (一致) | ✅ |
| `--duration-normal` | `250ms` | `250ms` | ✅ |
| `--duration-pulse-period` | `1200ms` | `1200ms` | ✅ |
| `--type-card-rank-size` | `18px` | `18px` | ✅ |
| `--text-primary`（兼容性测试） | 应被 style.css 覆盖为 `#ffffff` | `#ffffff` | ✅ 兼容层正常工作 |

---

## 视觉回归对比

| 项 | phase0-before.png | phase0-after.png |
|----|------------------|------------------|
| 桌面绿色饱和度 | 原色 | 完全一致 |
| 卡牌底色 | 原色 | 完全一致 |
| 按钮颜色（4 个） | 原色 | 完全一致 |
| 玩家头像 | 原色 | 完全一致 |
| 顶部信息栏 | 原 | 完全一致 |
| **唯一差异** | 手牌点数（每次发牌随机，与 Token 无关） |

文件级字节差异来源于随机发牌，与 CSS Token 无关。视觉零回归。

---

## Token 命名约定（供后续阶段引用）

所有 Token 严格按以下前缀分类，组件 CSS 中**禁止使用未列入此清单的 Token**：

| 前缀 | 范围 |
|------|------|
| `--surface-*` | 表面/背景色（6 个） |
| `--faction-ally-*` / `--faction-opp-*` / `--faction-neutral-*` | 阵营色（10 个） |
| `--semantic-*` | 语义色（11 个） |
| `--suit-*` | 花色色（4 个） |
| `--text-*` | 文字色（7 个，其中 3 个在阶段 0 由 style.css 覆盖） |
| `--space-*` | 间距系统（6 档） |
| `--type-*-{size,weight,lh,ls}` | 字号系统（13 套，每套 4 个属性） |
| `--radius-*` | 圆角（8 个） |
| `--shadow-*` | 阴影（9 个） |
| `--ease-*` / `--spring-*` | 缓动曲线（3 条） |
| `--duration-*` | 动效时长（5 档） |

---

## 进入下一阶段的前置条件

✅ tokens.css 文件存在并通过 HTTP 200 加载  
✅ DevTools 中 `:root` 可见全部 73 个 CSS 自定义属性  
✅ 现有界面视觉零回归（仅手牌随机不同）  
✅ tokens.css 文件本身不引用 style.css 任何变量，独立可移除（可回滚）

满足以上 4 项即可进入阶段 1。
