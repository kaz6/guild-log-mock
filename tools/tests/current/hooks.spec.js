// Notion の規則を縛るフック（.claude/hooks/notion-guard.js）の試験（2026-10-09・EX-150）。
// ★ わざと違反して、止まる（終了コード 2）か・止まらないか（0）を見る。フックは子プロセスで起動する。
//   規則と発動条件の一覧は CLAUDE.md の「フックで縛っている規則」節。
const { test, expect } = require("@playwright/test");
const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { REPO } = require("../helpers/app");

const PAGE_A = "3a9a8a5dfd4581e3a8cfc3872a300766";
const PAGE_B = "3b8a8a5dfd4581fbabb3ebcf6676c0aa";
const HOOK = path.join(REPO, ".claude/hooks/notion-guard.js");
const SETTINGS = JSON.parse(fs.readFileSync(path.join(REPO, ".claude/settings.json"), "utf8"));

function runHook(mode, input, stateDir) {
  const r = spawnSync("node", [HOOK, mode], {
    input: JSON.stringify(input),
    encoding: "utf8",
    env: { ...process.env, NOTION_GUARD_STATE_DIR: stateDir, NOTION_GUARD_BACKUP_FILE: path.join(stateDir, "no-backup.md") },
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
    runHook("post-write", { session_id: sid, tool_input: { page_id: PAGE_A, command: "update_content" } }, dir);
    const blocked = runHook("pre-search", { session_id: sid, tool_input: { query: "掲示板" } }, dir);
    expect(blocked.code).toBe(2);
    expect(blocked.err).toContain("notion-fetch");
    runHook("post-fetch", { session_id: sid, tool_input: { id: PAGE_A } }, dir);
    expect(runHook("pre-search", { session_id: sid, tool_input: { query: "掲示板" } }, dir).code, "読み直したあとは通る").toBe(0);
  });

  test("別のセッションの書き込みでは止まらない", () => {
    const dir = freshState();
    runHook("post-write", { session_id: "other", tool_input: { page_id: PAGE_A } }, dir);
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

  test("規則5：DECISION_LOG の正本への replace_all_matches は止まる。他のページ・単発の置換は通る", () => {
    const dir = freshState();
    const ops = (all) => [{ old_str: "古い", new_str: "新しい", ...(all ? { replace_all_matches: true } : {}) }];
    const bad = runHook("pre-update", { session_id: "s", tool_input: { page_id: PAGE_A, command: "update_content", content_updates: ops(true) } }, dir);
    expect(bad.code).toBe(2);
    expect(bad.err).toContain("replace_all_matches");
    const dashed = runHook("pre-update", { session_id: "s", tool_input: { page_id: "3a9a8a5d-fd45-81e3-a8cf-c3872a300766", command: "update_content", content_updates: ops(true) } }, dir);
    expect(dashed.code).toBe(2);
    expect(runHook("pre-update", { session_id: "s", tool_input: { page_id: PAGE_A, command: "update_content", content_updates: ops(false) } }, dir).code).toBe(0);
    expect(runHook("pre-update", { session_id: "s", tool_input: { page_id: PAGE_B, command: "update_content", content_updates: ops(true) } }, dir).code).toBe(0);
  });

  test("規則5：DECISION_LOG の正本は追記専用。replace_content は止まり、末尾への追記（insert_content）は通る", () => {
    const dir = freshState();
    const full = runHook("pre-update", { session_id: "s", tool_input: { page_id: PAGE_A, command: "replace_content", new_str: "x" } }, dir);
    expect(full.code).toBe(2);
    expect(full.err).toContain("追記専用");
    expect(full.err).toContain("1か所ずつ");
    expect(runHook("pre-update", { session_id: "s", tool_input: { page_id: PAGE_A, command: "insert_content", content: "x" } }, dir).code).toBe(0);
    expect(runHook("pre-update", { session_id: "s", tool_input: { page_id: PAGE_B, command: "replace_content", new_str: "x" } }, dir).code).toBe(0);
  });
});

// 規則6：正本の量が減っていないか。fetch の結果（本文）か、大きくてファイルに落ちたときの「saved to <パス>」から数える
function logBody(headings, tables, extra = 0) {
  const parts = ["> 正本\n"];
  for (let i = 0; i < headings; i++) parts.push(`## 2026-07-${String(i % 28 + 1).padStart(2, "0")}: 節${i}\n本文${"あ".repeat(100)}\n`);
  for (let i = 0; i < tables; i++) parts.push("<table>\n<tr><td>x</td></tr>\n</table>\n");
  parts.push("あ".repeat(extra));
  return parts.join("");
}
const fetchResp = (body) => [{ type: "text", text: JSON.stringify({ title: "DECISION_LOG", text: `<page>\n<content>\n${body}\n</content>\n</page>` }) }];

test.describe("規則6：正本の量が減っていないか（post-fetch）", () => {
  const input = (resp, id = PAGE_A) => ({ session_id: "s", tool_input: { id }, tool_response: resp });

  test("見出し・表・2%以上の文字数が減ると止まる。同じか増えたら通り、基準が更新される", () => {
    const dir = freshState();
    expect(runHook("post-fetch", input(fetchResp(logBody(20, 3))), dir).code).toBe(0); // 基準を作る
    expect(runHook("post-fetch", input(fetchResp(logBody(21, 3))), dir).code).toBe(0); // 増えた
    const lessHeading = runHook("post-fetch", input(fetchResp(logBody(20, 3))), dir);
    expect(lessHeading.code).toBe(2);
    expect(lessHeading.err).toContain("見出し 21→20");
    const lessTable = runHook("post-fetch", input(fetchResp(logBody(21, 2))), dir);
    expect(lessTable.code).toBe(2);
    expect(lessTable.err).toContain("表 3→2");
    // 減っているあいだは基準を動かさない（同じ減りを次の fetch でも知らせる）
    expect(runHook("post-fetch", input(fetchResp(logBody(21, 2))), dir).code).toBe(2);
    expect(runHook("post-fetch", input(fetchResp(logBody(21, 3))), dir).code).toBe(0);
  });

  test("見出しと表が同じでも、文字数が2%以上減れば止まる。1%の減少は通る", () => {
    const dir = freshState();
    runHook("post-fetch", input(fetchResp(logBody(10, 2, 10000))), dir);
    expect(runHook("post-fetch", input(fetchResp(logBody(10, 2, 9900))), dir).code).toBe(0);
    const big = runHook("post-fetch", input(fetchResp(logBody(10, 2, 9000))), dir);
    expect(big.code).toBe(2);
    expect(big.err).toContain("文字数");
  });

  test("accept-shrink で意図した減少を受け入れ、次の fetch が新しい基準になる", () => {
    const dir = freshState();
    runHook("post-fetch", input(fetchResp(logBody(20, 3))), dir);
    expect(runHook("post-fetch", input(fetchResp(logBody(19, 3))), dir).code).toBe(2);
    const acc = spawnSync("node", [HOOK, "accept-shrink"], { encoding: "utf8", env: { ...process.env, NOTION_GUARD_STATE_DIR: dir } });
    expect(acc.status).toBe(0);
    expect(runHook("post-fetch", input(fetchResp(logBody(19, 3))), dir).code).toBe(0);
    expect(runHook("post-fetch", input(fetchResp(logBody(18, 3))), dir).code).toBe(2);
  });

  test("大きくてファイルに落ちたときは、エラー文の saved to のパスから本文を読んで数える", () => {
    const dir = freshState();
    const file = path.join(dir, "big-fetch.txt");
    const write = (h) => fs.writeFileSync(file, JSON.stringify({ text: `<content>\n${logBody(h, 3)}\n</content>` }));
    const msg = `Error: result (274,517 characters) exceeds maximum allowed tokens. Output has been saved to ${file}\nFormat: Plain text`;
    write(20);
    expect(runHook("post-fetch", input(msg), dir).code).toBe(0);
    write(18);
    const r = runHook("post-fetch", input(msg), dir);
    expect(r.code).toBe(2);
    expect(r.err).toContain("見出し 20→18");
  });

  test("基準が無いときは docs/backup の写しが基準になる（写しより少ない正本は止まる）", () => {
    const dir = freshState();
    const backup = path.join(dir, "backup.md");
    fs.writeFileSync(backup, logBody(20, 3));
    const run = (body) => spawnSync("node", [HOOK, "post-fetch"], { input: JSON.stringify(input(fetchResp(body))), encoding: "utf8", env: { ...process.env, NOTION_GUARD_STATE_DIR: dir, NOTION_GUARD_BACKUP_FILE: backup } });
    expect(run(logBody(15, 3)).status).toBe(2);
    expect(run(logBody(20, 3)).status).toBe(0);
  });

  test("別のページの fetch や、本文が取れない形では止めない", () => {
    const dir = freshState();
    runHook("post-fetch", input(fetchResp(logBody(20, 3))), dir);
    expect(runHook("post-fetch", input(fetchResp(logBody(1, 0)), PAGE_B), dir).code).toBe(0);
    expect(runHook("post-fetch", input("なにか短い文"), dir).code).toBe(0);
  });
});

test.describe("規則4：読み直していないままターンを終えない（Stop）", () => {
  test("登録されている（Stop に stop モード）", () => {
    expect((SETTINGS.hooks.Stop || []).flatMap((h) => h.hooks.map((x) => x.command.split(" ").pop()))).toEqual(["stop"]);
  });

  test("書き込んだあと読み直していなければ止まり、残りのページを返す。読み直せば通る", () => {
    const dir = freshState();
    const sid = "st1";
    expect(runHook("stop", { session_id: sid }, dir).code, "書き込み前は通る").toBe(0);
    runHook("post-write", { session_id: sid, tool_input: { page_id: PAGE_A } }, dir);
    runHook("post-write", { session_id: sid, tool_input: { page_id: PAGE_B } }, dir);
    const blocked = runHook("stop", { session_id: sid }, dir);
    expect(blocked.code).toBe(2);
    expect(blocked.err).toContain(PAGE_A);
    expect(blocked.err).toContain(PAGE_B);
    // 片方だけ読み直すと、もう片方だけが残る（★ 別のページを読んでも消えない）
    runHook("post-fetch", { session_id: sid, tool_input: { id: `https://www.notion.so/${PAGE_A}` } }, dir);
    const rest = runHook("stop", { session_id: sid }, dir);
    expect(rest.code).toBe(2);
    expect(rest.err).not.toContain(PAGE_A);
    expect(rest.err).toContain(PAGE_B);
    runHook("post-fetch", { session_id: sid, tool_input: { id: PAGE_B } }, dir);
    expect(runHook("stop", { session_id: sid }, dir).code, "全部読み直したあとは通る").toBe(0);
  });

  test("ID が取れない書き込み（create-pages など）は、どの fetch でも消える", () => {
    const dir = freshState();
    runHook("post-write", { session_id: "n", tool_input: { parent: {} } }, dir);
    expect(runHook("stop", { session_id: "n" }, dir).code).toBe(2);
    runHook("post-fetch", { session_id: "n", tool_input: { id: PAGE_A } }, dir);
    expect(runHook("stop", { session_id: "n" }, dir).code).toBe(0);
  });

  test("止められて続行中（stop_hook_active）なら通す。別のセッションの書き込みでは止まらない", () => {
    const dir = freshState();
    runHook("post-write", { session_id: "a", tool_input: { page_id: PAGE_A } }, dir);
    expect(runHook("stop", { session_id: "a", stop_hook_active: true }, dir).code).toBe(0);
    expect(runHook("stop", { session_id: "b" }, dir).code).toBe(0);
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
