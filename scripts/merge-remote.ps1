# merge-remote.ps1: リモート作業ブランチ（Claude Code on the web の成果）を main に取り込む。
# merge-remote.sh の PowerShell 版。Git Bash を経由せず PowerShell から直接使う。
# やること: fetch → main に切替+pull → 作業ブランチをマージ → main を push → リモート作業ブランチを削除
# 使い方: powershell -ExecutionPolicy Bypass -File scripts\merge-remote.ps1 [作業ブランチ名]（省略時: claude/remote-test-vjvdds）

param(
    [string]$WorkBranch = "claude/remote-test-vjvdds"
)

$ErrorActionPreference = "Stop"

function Invoke-Git {
    param([Parameter(Mandatory, ValueFromRemainingArguments)][string[]]$GitArgs)
    & git @GitArgs
    if ($LASTEXITCODE -ne 0) {
        Write-Host "merge-remote: 'git $($GitArgs -join ' ')' が失敗しました（exit $LASTEXITCODE）。中止します。" -ForegroundColor Red
        exit 1
    }
}

$root = git rev-parse --show-toplevel 2>$null
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($root)) {
    Write-Host "merge-remote: git リポジトリ外です。中止します。" -ForegroundColor Red
    exit 1
}
Set-Location $root

# 環境をまたぐと stat キャッシュ（タイムスタンプ等）だけで「変更あり」に見えることがあるため、
# 先に index を実ファイル内容で更新してから判定する（Git Bash 版で毎回止まった問題への対策）。
git update-index -q --refresh 2>$null | Out-Null

$dirty = git status --porcelain
if ($dirty) {
    Write-Host "merge-remote: 未コミットの変更があります。commit か stash してから再実行してください。" -ForegroundColor Yellow
    git status --short
    exit 1
}

Write-Host "merge-remote: $WorkBranch を取得中..."
Invoke-Git fetch origin $WorkBranch

Write-Host "merge-remote: main へ切り替えて最新化..."
Invoke-Git checkout main
Invoke-Git pull origin main

Write-Host "merge-remote: $WorkBranch をマージ..."
Invoke-Git merge --no-edit "origin/$WorkBranch"

Write-Host "merge-remote: main を push..."
Invoke-Git push origin main

Write-Host "merge-remote: リモートの作業ブランチを削除..."
Invoke-Git push origin --delete $WorkBranch

Write-Host ""
Write-Host "merge-remote: 完了 ✅ main に取り込み、origin/$WorkBranch を削除しました。" -ForegroundColor Green
Write-Host "             次に Claude Code 側が push すると同名ブランチが再作成されます。"
