// 観察記録の穴を検出する（2026-09-15・EX-106）。★ 外部依存ゼロ。`node scripts/check-observation-targets.js`
//
// ★ なぜ要るか
//   観察記録は**沈黙して落ちる**。どちらの穴も、画面にもログにも何も出ないまま
//   「観察記録が主眼の依頼なのに1行も出ない／観察が失敗した旨の文が出る」という結果になる。
//   2026-09-15 の時点で、納屋が実際に2つ目の穴に落ちていた。
//
// 見るのは2つ：
//   1. `observationTarget` を持つのに、専用分岐も `observationKind` も無い依頼
//      → 既定に落ちる。種別が無ければ受け皿の文になり、対象に合わない記録が出る。
//   2. `observationNotes: null` を直書きしている報告書の組み立て
//      → その分岐を使う依頼に観察対象を付けた瞬間、記録が1行も出ないまま通る。
//      ★ 意図して null にしている箇所（定型報告書・夜道の昼ルート）は、直前の行に
//        「意図」と書いてあることで区別する。**理由を書かずに null にしない。**
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const appSrc = fs.readFileSync(path.join(root, "app.js"), "utf8");
const questSrc = fs.readFileSync(path.join(root, "data-quests.js"), "utf8");

// 専用分岐が受け持つ対象（`generateAdventurerObservationNote` の中の target 比較）
const dispatcher = appSrc.slice(
  appSrc.indexOf("function generateAdventurerObservationNote"),
  appSrc.indexOf("function generateObservationNotes")
);
const handled = [...dispatcher.matchAll(/target === "([^"]+)"/g)].map((m) => m[1]);

// 依頼データから observationTarget / observationKind を拾う（id ごとのブロックで見る）
const blocks = questSrc.split(/\n  \{\n/).slice(1);
const quests = blocks.map((b) => ({
  id: (b.match(/id: "([^"]+)"/) || [])[1],
  target: (b.match(/observationTarget: "([^"]+)"/) || [])[1],
  kind: (b.match(/observationKind: "([^"]+)"/) || [])[1]
})).filter((q) => q.id);

const problems = [];
quests.forEach((q) => {
  if (!q.target || q.target === "なし") return;
  if (handled.includes(q.target)) return;
  if (q.kind) return;
  problems.push(`【穴1】${q.id}：観察対象「${q.target}」に専用分岐も observationKind も無い（既定の受け皿に落ちる）`);
});

const lines = appSrc.split("\n");
lines.forEach((line, i) => {
  if (!/observationNotes:\s*null/.test(line)) return;
  const before = lines.slice(Math.max(0, i - 3), i).join("\n");
  if (before.includes("意図")) return;
  problems.push(`【穴2】app.js:${i + 1}：observationNotes に null を直書きしている（理由が書かれていない）`);
});

console.log(`観察対象を持つ依頼：${quests.filter((q) => q.target && q.target !== "なし").length}件 ／ 専用分岐：${handled.length}件`);
if (problems.length === 0) {
  console.log("問題は見つかりませんでした（0件）。");
} else {
  problems.forEach((p) => console.log(p));
  console.log(`\n${problems.length}件の穴が見つかりました。`);
  process.exitCode = 1;
}
