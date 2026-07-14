#!/bin/bash
# merge-remote: リモート作業ブランチ（Claude Code on the web の成果）を main に取り込む。
# git-sync.sh（現在ブランチの安全な pull 専用）とは役割が別：こちらは main へのマージ＋後片付け。
# やること: fetch → main に切替+pull → 作業ブランチをマージ → main を push → リモート作業ブランチを削除
# 使い方: bash scripts/merge-remote.sh [作業ブランチ名]（省略時: claude/remote-test-vjvdds）
set -euo pipefail

WORK_BRANCH="${1:-claude/remote-test-vjvdds}"

root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [ -z "$root" ]; then
  echo "merge-remote: git リポジトリ外です。中止します。"
  exit 1
fi
cd "$root"

# 未コミットの変更があると切替・マージが事故るので先に止める
if [ -n "$(git status --porcelain)" ]; then
  echo "merge-remote: 未コミットの変更があります。commit か stash してから再実行してください。"
  git status --short
  exit 1
fi

echo "merge-remote: ${WORK_BRANCH} を取得中..."
git fetch origin "$WORK_BRANCH"

echo "merge-remote: main へ切り替えて最新化..."
git checkout main
git pull origin main

echo "merge-remote: ${WORK_BRANCH} をマージ..."
git merge --no-edit "origin/${WORK_BRANCH}"

echo "merge-remote: main を push..."
git push origin main

echo "merge-remote: リモートの作業ブランチを削除..."
git push origin --delete "$WORK_BRANCH"

echo ""
echo "merge-remote: 完了 ✅ main に取り込み、origin/${WORK_BRANCH} を削除しました。"
echo "             次に Claude Code 側が push すると同名ブランチが再作成されます。"
