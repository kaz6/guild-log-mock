#!/bin/bash
# git-sync: ローカルとorigin(GitHub)を安全に同期する。
# - 未コミットの変更がある時は pull しない（clean 時のみ）
# - fast-forward できる時だけ pull（マージコミットを作らない）
# - 分岐している時は自動同期せず、手動対応を促す
# エディタ非依存: Cursor でも手動実行できる。Claude Code の SessionStart フックからも呼ばれる。
# 使い方（ローカルで見る前に）: bash scripts/git-sync.sh
set -uo pipefail

root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [ -z "$root" ]; then
  echo "git-sync: git リポジトリ外です。中止します。"
  exit 0
fi
cd "$root"

upstream="$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null || true)"
if [ -z "$upstream" ]; then
  echo "git-sync: 追跡ブランチがありません。pull をスキップします。"
  exit 0
fi

if ! git fetch --quiet; then
  echo "git-sync: fetch に失敗しました（ネットワーク？）。pull をスキップします。"
  exit 0
fi

# 未コミットの変更（ステージ / 未ステージ / 未追跡）があれば pull しない
if [ -n "$(git status --porcelain)" ]; then
  echo "git-sync: 未コミットの変更があるため pull をスキップしました（安全のため）。"
  echo "         先に commit または stash してから再実行してください。"
  git status --short
  exit 0
fi

local_rev="$(git rev-parse '@')"
remote_rev="$(git rev-parse '@{u}')"
base_rev="$(git merge-base '@' '@{u}')"

if [ "$local_rev" = "$remote_rev" ]; then
  echo "git-sync: 既に最新です（$upstream と同期済み）。"
elif [ "$local_rev" = "$base_rev" ]; then
  echo "git-sync: origin が進んでいます → fast-forward で pull します。"
  git pull --ff-only || echo "git-sync: pull に失敗しました。手動で確認してください。"
elif [ "$remote_rev" = "$base_rev" ]; then
  echo "git-sync: ローカルに未 push のコミットがあります → push してください（pull は不要）。"
else
  echo "git-sync: ローカルと origin が分岐しています → 自動同期しません。手動で対応してください。"
fi
exit 0
