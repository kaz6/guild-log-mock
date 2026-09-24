// `scripts/` の検査と構文チェックを、テストから**子プロセスで**呼ぶ（2026-09-22・EX-143）。
//
// ★ なぜ子プロセスか：`scripts/` は**外部依存ゼロ**という性質を持つ（EX-086 の裁定A）。
//   require で取り込むとテスト側の都合が混ざるので、`node scripts/…` をそのまま起動して
//   終了コードと出力だけを見る。**こうすればテストから使っても scripts/ の性質は崩れない。**
const { test, expect } = require("@playwright/test");
const { execFileSync } = require("child_process");
const { REPO } = require("../helpers/app");

function run(args) {
  return execFileSync("node", args, { cwd: REPO, encoding: "utf8", timeout: 60_000 });
}

test("構文チェックが通る（app.js とデータ7本）", () => {
  expect(() => run(["--check", "app.js"])).not.toThrow();
  ["data-adventurers.js", "data-enemies.js", "data-items.js", "data-quests.js", "data-time.js", "data-money.js", "data-past.js"]
    .forEach((f) => expect(() => run(["--check", f]), f).not.toThrow());
});

test("観察記録の穴が0件（scripts/check-observation-targets.js）", () => {
  // ★ この検査は沈黙して落ちる2つの穴（専用分岐も種別も無い／理由なしの null 直書き）を見る。
  //   依頼を足したときの書き忘れは、ここでしか気づけない。
  const out = run(["scripts/check-observation-targets.js"]);
  expect(out, out).toContain("問題は見つかりませんでした（0件）");
});
