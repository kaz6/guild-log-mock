// 表記の決まり（2026-10-31・EX-171【4】）。表は tools/notation-table.json。
// ★ 「いつでも」はいつもひらがな（「何時でも」と書かない）。画面や報告書に出る文の出どころ（app.js・data-*.js・index.html）を洗う。
//   ★ 注記（// のコメント）も含めて洗う。決まりを説明する注記は表の側に書き、ソースには避ける語を書かない。
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const REPO = path.resolve(__dirname, "..", "..", "..");
const table = JSON.parse(fs.readFileSync(path.join(REPO, "tools", "notation-table.json"), "utf8"));
const files = ["app.js", "index.html", ...fs.readdirSync(REPO).filter((f) => /^data-.*\.js$/.test(f))];

test("表記の表の避ける語が、画面や報告書に出る文の出どころに無い", () => {
  const hits = [];
  for (const f of files) {
    const lines = fs.readFileSync(path.join(REPO, f), "utf8").split("\n");
    lines.forEach((line, i) => table.rules.forEach((r) => { if (line.includes(r.avoid)) hits.push(`${f}:${i + 1} 「${r.avoid}」→「${r.use}」`); }));
  }
  expect(hits).toEqual([]);
  expect(table.rules.map((r) => r.use)).toContain("いつでも");
});
