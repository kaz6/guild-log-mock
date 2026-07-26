# merge-remote.ps1: Merge the remote work branch (Claude Code on the web output) into main.
# PowerShell port of merge-remote.sh, usable directly from PowerShell (no Git Bash needed).
# Steps: fetch -> switch to main + pull -> merge work branch -> push main -> delete remote work branch
# Usage: powershell -ExecutionPolicy Bypass -File scripts\merge-remote.ps1 [work-branch-name]
#        (default: claude/remote-test-vjvdds)
# NOTE: ASCII-only on purpose. Windows PowerShell 5.1 reads BOM-less scripts in the ANSI
#       codepage (Shift-JIS on Japanese Windows), so non-ASCII text here can break parsing.

param(
    [string]$WorkBranch = "claude/remote-test-vjvdds"
)

$ErrorActionPreference = "Stop"

function Invoke-Git {
    param([Parameter(Mandatory, ValueFromRemainingArguments)][string[]]$GitArgs)
    & git @GitArgs
    if ($LASTEXITCODE -ne 0) {
        Write-Host "merge-remote: 'git $($GitArgs -join ' ')' failed (exit $LASTEXITCODE). Aborting." -ForegroundColor Red
        exit 1
    }
}

$root = git rev-parse --show-toplevel 2>$null
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($root)) {
    Write-Host "merge-remote: not inside a git repository. Aborting." -ForegroundColor Red
    exit 1
}
Set-Location $root

# Refresh the index first: after switching environments, stale stat cache (timestamps etc.)
# can make files look modified when their content is unchanged. This was the reason the
# Git Bash version kept stopping on a false "dirty working tree".
git update-index -q --refresh 2>$null | Out-Null

$dirty = git status --porcelain
if ($dirty) {
    Write-Host "merge-remote: uncommitted changes found. Commit or stash them, then run again." -ForegroundColor Yellow
    git status --short
    exit 1
}

Write-Host "merge-remote: fetching $WorkBranch ..."
Invoke-Git fetch origin $WorkBranch

Write-Host "merge-remote: switching to main and pulling ..."
Invoke-Git checkout main
Invoke-Git pull origin main

Write-Host "merge-remote: merging $WorkBranch ..."
Invoke-Git merge --no-edit "origin/$WorkBranch"

Write-Host "merge-remote: pushing main ..."
Invoke-Git push origin main

Write-Host "merge-remote: deleting the remote work branch ..."
Invoke-Git push origin --delete $WorkBranch

Write-Host ""
Write-Host "merge-remote: done. Merged into main and deleted origin/$WorkBranch." -ForegroundColor Green
Write-Host "             The next push from Claude Code will recreate the branch."
