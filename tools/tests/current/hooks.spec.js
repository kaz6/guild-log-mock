// Notion の規則を縛るフック（.claude/hooks/notion-guard.js）の試験（2026-10-09・EX-150）。
// ★ わざと違反して、止まる（終了コード 2）か・止まらないか（0）を見る。フックは子プロセスで起動する。
//   規則と発動条件の一覧は CLAUDE.md の「フックで縛っている規則」節。
const { test, expect } = require("@playwright/test");
const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { REPO } = require("../helpers/app");

const HOOK = path.join(REPO, ".claude/hooks/notion-guard.js");
const SETTINGS = JSON.parse(fs.readFileSync(path.join(REPO, ".claude/settings.json"), "utf8"));

function runHook(mode, input, stateDir) {
  const r = spawnSync("node", [HOOK, mode], {
    input: JSON.stringify(input),
    encoding: "utf8",
    env: { ...process.env, NOTION_GUARD_STATE_DIR: stateDir },
    timeout: 10_000
  });
  return { code: r.status, err: r.stderr };
}

function freshState() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "notion-guard-test-"));
}

// settings.json で、そのツール名に当たるフックのモードを集める（★ 登録が漏れていたら試験が拾う）
function modesFor(event, toolName) {
  return (SETTINGS.hooks[event] || [])
    .filter((h) => new RegExp(h.matcher).test(toolName))
    .flatMap((h) => h.hooks.map((x) => x.command.split(" ").pop()));
}

test.describe("フックの登録", () => {
  test("対象のツールにだけ当たる（似た名前のツールには当たらない）", () => {
    expect(modesFor("PreToolUse", "mcp__Notion__notion-search")).toEqual(["pre-search"]);
    expect(modesFor("PreToolUse", "mcp__claude_ai_Notion__notion-search")).toEqual(["pre-search"]);
    expect(modesFor("PreToolUse", "mcp__Notion__notion-search-skills")).toEqual([]);
    expect(modesFor("PreToolUse", "mcp__Notion__notion-update-page")).toEqual(["pre-update"]);
    expect(modesFor("PostToolUse", "mcp__Notion__notion-update-page")).toEqual(["post-write"]);
    expect(modesFor("PostToolUse", "mcp__Notion__notion-create-pages")).toEqual(["post-write"]);
    expect(modesFor("PostToolUse", "mcp__Notion__notion-fetch")).toEqual(["post-fetch"]);
    expect(modesFor("PreToolUse", "Bash")).toEqual([]);
  });
});

test.describe("規則1：書き込み直後の確かめに search や単発 probe を使わない", () => {
  test("書き込んだあと、fetch で読み直す前の search は止まる。fetch のあとは通る", () => {
    const dir = freshState();
    const sid = "s1";
    expect(runHook("pre-search", { session_id: sid, tool_input: { query: "掲示板" } }, dir).code, "書き込み前は通る").toBe(0);
    runHook("post-write", { session_id: sid, tool_input: { page_id: "abc", command: "update_content" } }, dir);
    const blocked = runHook("pre-search", { session_id: sid, tool_input: { query: "掲示板" } }, dir);
    expect(blocked.code).toBe(2);
    expect(blocked.err).toContain("notion-fetch");
    runHook("post-fetch", { session_id: sid, tool_input: { id: "abc" } }, dir);
    expect(runHook("pre-search", { session_id: sid, tool_input: { query: "掲示板" } }, dir).code, "読み直したあとは通る").toBe(0);
  });

  test("別のセッションの書き込みでは止まらない", () => {
    const dir = freshState();
    runHook("post-write", { session_id: "other", tool_input: { page_id: "abc" } }, dir);
    expect(runHook("pre-search", { session_id: "mine", tool_input: { query: "x" } }, dir).code).toBe(0);
  });

  test("置換前後が同じ置換（単発 probe）は止まる。違う置換は通る", () => {
    const dir = freshState();
    const probe = runHook("pre-update", { session_id: "s", tool_input: { command: "update_content",
      content_updates: [{ old_str: "存在しないかもしれない文字列", new_str: "存在しないかもしれない文字列" }] } }, dir);
    expect(probe.code).toBe(2);
    expect(probe.err).toContain("probe");
    const real = runHook("pre-update", { session_id: "s", tool_input: { command: "update_content",
      content_updates: [{ old_str: "古い", new_str: "新しい" }] } }, dir);
    expect(real.code).toBe(0);
  });
});

test.describe("規則2：Notion に書く文の全角数字は警告する（止めない）", () => {
  test("全角数字があれば警告を返す。無ければ何も言わない", () => {
    const dir = freshState();
    const warn = runHook("post-write", { session_id: "s", tool_input: { content_updates: [{ old_str: "敵5体", new_str: "敵５体" }] } }, dir);
    expect(warn.code, "PostToolUse の 2 は、書き込み後にモデルへ返す警告").toBe(2);
    expect(warn.err).toContain("警告");
    expect(warn.err).toContain("５");
    const clean = runHook("post-write", { session_id: "s2", tool_input: { content_updates: [{ old_str: "敵５体", new_str: "敵5体" }] } }, dir);
    expect(clean.err).not.toContain("警告");
  });

  test("★ 止めるのは PreToolUse だけ。全角数字の検査は PostToolUse にしか登録していない", () => {
    expect(modesFor("PreToolUse", "mcp__Notion__notion-update-page")).not.toContain("post-write");
  });
});

test.describe("規則3：DECISION_LOG をページ名で検索しない", () => {
  test("DECISION_LOG／設計判断の記録 で検索すると止まり、ID を返す", () => {
    const dir = freshState();
    ["DECISION_LOG", "decision log 遠征", "設計判断の記録"].forEach((q) => {
      const r = runHook("pre-search", { session_id: "s", tool_input: { query: q } }, dir);
      expect(r.code, q).toBe(2);
      expect(r.err).toContain("3a9a8a5dfd4581e3a8cfc3872a300766");
    });
    expect(runHook("pre-search", { session_id: "s", tool_input: { query: "生態目録" } }, dir).code).toBe(0);
  });
});

test("想定外の入力ではセッションを止めない（0 で抜ける）", () => {
  const r = spawnSync("node", [HOOK, "pre-search"], { input: "not json", encoding: "utf8" });
  expect(r.status).toBe(0);
});
