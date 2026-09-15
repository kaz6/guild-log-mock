// 観察記録の穴を検出する（2026-09-15・EX-105）。★ 外部依存ゼロ。`node scripts/check-observation-targets.js`
//
// ★ なぜ要るか
//   観察記録は**沈黙して落ちる**。どの穴も、画面にもログにも何も出ないまま
//   「観察記録が主眼の依頼なのに1行も出ない／対象に合わない記録が出る」という結果になる。
//   2026-09-15 の時点で、納屋が実際に2つ目の穴に落ちていた。
//
// 見るのは3つ：
//   1. `observationTarget` を持つのに、専用分岐も `observationKind` も無い依頼
//   2. `observationKind` が `OBSERVATION_KIND_NOTES` に無い語（打ち間違い・未追加の種別）
//   3. 理由を書かずに `observationNotes: null` を直書きしている箇所
//      ★ 意図して出さない箇所（定型報告書・夜道の昼ルート）は、直前3行に「意図」と書いて区別する。
//
// ⚠️ ★ **入力が欠けても出力は正常に見える**（2026-08-09 の教訓）ので、依頼データは正規表現ではなく
//   `require` で読み、件数が食い違ったら落とす。
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
global.window = global.window || {};
require(path.join(root, "data-time.js"));
require(path.join(root, "data-quests.js"));
const quests = global.window.masterQuests;
const appSrc = fs.readFileSync(path.join(root, "app.js"), "utf8");
const questSrc = fs.readFileSync(path.join(root, "data-quests.js"), "utf8");

if (!Array.isArray(quests) || quests.length === 0) {
  console.log("依頼データを読めませんでした。");
  process.exitCode = 1;
  return;
}

// 専用分岐が受け持つ対象（`generateAdventurerObservationNote` の中の target 比較）
const dispatcher = appSrc.slice(
  appSrc.indexOf("function generateAdventurerObservationNote"),
  appSrc.indexOf("function generateObservationNotes")
);
const handled = [...dispatcher.matchAll(/target === "([^"]+)"/g)].map((m) => m[1]);

// 既定の種別表にあるキー
const kindTable = appSrc.slice(
  appSrc.indexOf("const OBSERVATION_KIND_NOTES = {"),
  appSrc.indexOf("function generateKindObservationNote")
);
const kinds = [...kindTable.matchAll(/^  ([^\s:/]+): \{/gm)].map((m) => m[1]);

const problems = [];
const withTarget = quests.filter((q) => q.observationTarget && q.observationTarget !== "なし");
withTarget.forEach((q) => {
  if (handled.includes(q.observationTarget)) return;
  if (!q.observationKind) {
    problems.push(`【穴1】${q.id}：観察対象「${q.observationTarget}」に専用分岐も observationKind も無い（受け皿の文に落ちる）`);
  } else if (!kinds.includes(q.observationKind)) {
    problems.push(`【穴2】${q.id}：observationKind「${q.observationKind}」が OBSERVATION_KIND_NOTES に無い（受け皿の文に落ちる）`);
  }
});

const lines = appSrc.split("\n");
lines.forEach((line, i) => {
  // ★ コメント行は対象外（注記の中の「observationNotes: null」を拾ってしまうため）
  if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
  if (!/observationNotes:\s*null/.test(line)) return;
  const before = lines.slice(Math.max(0, i - 3), i).join("\n");
  if (before.includes("意図")) return;
  problems.push(`【穴3】app.js:${i + 1}：observationNotes に null を直書きしている（直前3行に「意図」と理由が無い）`);
});

// ★ 読み落としの検出：データ側の id の数と、読めた依頼の数を突き合わせる
const idCount = (questSrc.match(/^    id: "quest_/gm) || []).length;
if (idCount !== quests.length + (global.window.masterQuestsRetired ? 1 : 0)) {
  problems.push(`【解析】data-quests.js の id は ${idCount}件だが、読めた依頼は ${quests.length}件（退避分を除く）。読み落としの疑い`);
}

console.log(`観察対象を持つ依頼：${withTarget.length}件 ／ 専用分岐：${handled.length}件 ／ 既定の種別：${kinds.join("・")}`);
if (problems.length === 0) {
  console.log("問題は見つかりませんでした（0件）。");
} else {
  problems.forEach((p) => console.log(p));
  console.log(`\n${problems.length}件の穴が見つかりました。`);
  process.exitCode = 1;
}
