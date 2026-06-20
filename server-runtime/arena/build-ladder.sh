#!/bin/bash
# build-ladder.sh — 重建"冻结版本梯队"
# 把历史已发布版本的 server-runtime 各存一份快照到 .ladder/<version>/，
# 供 arena.mjs 让新版对全梯队跑自对弈。可随时一键重建（内容不进 git，靠 commit 复现）。
set -e
REPO=$(cd "$(dirname "$0")/../../../.." && pwd)   # 仓库根
LADDER="$REPO/games/guandan/server-runtime/arena/.ladder"   # 绝对路径（cd 后仍有效）
cd "$REPO"

build() {
  local ver="$1" commit="$2"
  echo "  $ver  <-  $commit"
  rm -rf "$LADDER/$ver"
  mkdir -p "$LADDER/$ver"
  git archive "$commit" games/guandan/server-runtime \
    | tar -x -C "$LADDER/$ver" --strip-components=3
}

echo "重建冻结梯队 → $LADDER"
build v2.1 e0dd8b0   # 大牌纪律+万能枚举+S2 残局精算
build v2.2 5339fe5   # R16 最少手数 DP + S2 扩域
build v2.3 8e6a32b   # S3 中盘多世界模拟
build v2.5 612277f   # 病例驱动 8 类蠢行为修复（当前基线）
echo "完成。版本目录："
ls -1 "$LADDER"
