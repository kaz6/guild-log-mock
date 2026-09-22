// テストの設定（2026-09-22・EX-143）。
//
// ★ なぜ tools/ の下か：EX-086 の裁定A の線引きどおり。`scripts/` は外部依存ゼロで
//   「クローンしただけで流せる」性質を持つので、playwright を要るものは混ぜない。
//   ⚠️ `scripts/` の検査は**子プロセスで呼ぶ**（`current/scripts.spec.js`）ので、
//     テストから使っても `scripts/` 側は外部依存ゼロのまま。
//
// ★ 2つのプロジェクトに分ける（EX-143 の裁定）
//   current    … **今通るべきテスト。全部緑が前提。赤＝退行。** `npm test` はここだけ走る
//   acceptance … **まだ実装していない受け入れテスト。全部 fixme で持つ。**
//                `npm run test:acceptance` で「どれが未実装か」を見るためのもの
//   ⚠️ 未実装を current に混ぜないこと。混ぜると npm test が常に赤になり、
//     **退行と未着手を区別できなくなる**＝自走の判定が死ぬ。
//
// ★ 遠征は時計で進むので並列にしない（workers: 1）。同じ localStorage を共有する
//   オリジン（file://）なので、並列にすると別のテストの保存を踏む。
const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tools/tests",
  fullyParallel: false,
  workers: 1,
  // ★ 既定では再試行しない。不安定なテストを再試行で隠すと、赤が合図でなくなる。
  retries: 0,
  timeout: 120_000,
  reporter: [["list"]],
  projects: [
    { name: "current", testDir: "./tools/tests/current" },
    { name: "acceptance", testDir: "./tools/tests/acceptance" },
  ],
});
