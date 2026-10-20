// `scripts/` の検査と構文チェックを、テストから**子プロセスで**呼ぶ（2026-09-22・EX-143）。
//
// ★ なぜ子プロセスか：`scripts/` は**外部依存ゼロ**という性質を持つ（EX-086 の裁定A）。
//   require で取り込むとテスト側の都合が混ざるので、`node scripts/…` をそのまま起動して
//   終了コードと出力だけを見る。**こうすればテストから使っても scripts/ の性質は崩れない。**
const { test, expect } = require("@playwright/test");
const { execFileSync } = require("child_process");
const fs = require("fs");
const { REPO } = require("../helpers/app");

function run(args) {
  return execFileSync("node", args, { cwd: REPO, encoding: "utf8", timeout: 60_000 });
}

// ★ データは手で並べず、リポジトリ直下の data-*.js を全部拾う（2026-10-11）。
//   手書きの7本のときは data-outcomes.js／data-vocab.js が漏れていた。ファイルが増えても漏れない。
//   ⚠ node --check は1回に1ファイルしか見ない（2つ目以降は引数扱い）ので、1本ずつ起動する。
const DATA_FILES = fs.readdirSync(REPO).filter((f) => /^data-.*\.js$/.test(f)).sort();

test("構文チェックが通る（app.js と data-*.js 全部）", () => {
  expect(DATA_FILES.length, "data-*.js が1本も見つからない").toBeGreaterThan(0);
  expect(() => run(["--check", "app.js"])).not.toThrow();
  DATA_FILES.forEach((f) => expect(() => run(["--check", f]), f).not.toThrow());
});

test("観察記録の穴が0件（scripts/check-observation-targets.js）", () => {
  // ★ この検査は沈黙して落ちる2つの穴（専用分岐も種別も無い／理由なしの null 直書き）を見る。
  //   依頼を足したときの書き忘れは、ここでしか気づけない。
  const out = run(["scripts/check-observation-targets.js"]);
  expect(out, out).toContain("問題は見つかりませんでした（0件）");
});

test("正本の写し・照合の2本（scripts/save-notion-backup.js, check-decision-log-sections.js）が動く", () => {
  // ★ 正本が壊れた事故（2026-10-20・EX-158）の対策③④。外部依存ゼロ。照合は「欠けがあれば終了コード1」なので、出力だけを見る
  ["scripts/save-notion-backup.js", "scripts/check-decision-log-sections.js"].forEach((f) => expect(() => run(["--check", f]), f).not.toThrow());
  let out;
  try { out = run(["scripts/check-decision-log-sections.js"]); } catch (e) { out = e.stdout; }
  expect(out, out).toContain("正本の節");
  expect(out, out).toContain("写しの重複（見出しも本文も同じ節）: 0件"); // 二重取り込み（2026-10-20）を拾う検査。今の写しに重複は無い
  expect(() => run(["scripts/save-notion-backup.js"])).toThrow(); // 引数なしは使い方を出して止まる
});
