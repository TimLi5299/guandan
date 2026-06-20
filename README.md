# 掼蛋学习引擎

浏览器掼蛋游戏与 NPC AI 学习系统，包含完整规则引擎、五档难度、
教程模式、自对弈胜率测试台和复盘能力。

## 在线体验

GitHub Pages 部署完成后可通过仓库主页访问。

## 主要目录

- `index.html`：游戏入口
- `js/`：浏览器客户端和界面逻辑
- `server-runtime/`：规则引擎、房间、NPC 与自对弈
- `design-audit/`：设计规范、验证记录和截图
- `HANDBOOK.md`：项目手册

## 本地运行

静态界面可以直接通过本地 HTTP 服务打开：

```bash
python3 -m http.server 8000
```

然后访问 `http://localhost:8000/`。
