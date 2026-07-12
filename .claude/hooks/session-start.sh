#!/bin/bash
# SessionStart フック: ガード付き git 同期を実行する。
# scripts/git-sync.sh に処理を委譲（clean 時のみ fast-forward pull）。
# セッション開始を止めないよう、失敗しても常に成功終了する。
set -uo pipefail

sync="$CLAUDE_PROJECT_DIR/scripts/git-sync.sh"
if [ -f "$sync" ]; then
  bash "$sync" || true
fi
exit 0
