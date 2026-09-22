// 対比較の基準スナップショットを作り直す（2026-09-22・EX-143）。
//
// ★★ **裁定（2026-09-22）で決めた規則**
//   1. **基準を更新するときは単独のコミットにする**（実装の差分に混ぜない）
//   2. **何が動いたかを報告に書く**（依頼 × 項目の件数）。このスクリプトが差分を出すので、
//      その出力をそのまま報告に貼ること
//   3. ★ **中身を見ずに更新しない。** 意図した変更と件数が合わないなら、それは事故
//
// 使い方： npm run test:update-baseline
const fs = require("fs");
const { sweep, compare } = require("../sweep");
const { sweepOptions, FIELDS, KEY_FIELDS, BASELINE_PATH } = require("./helpers/axes");

(async () => {
  const rows = await sweep(sweepOptions());
  const bad = rows.filter((r) => r.error);
  if (bad.length) {
    console.error(`★ 生成に失敗した組が ${bad.length} 件あります。基準は更新しません。`);
    console.error(bad.slice(0, 3));
    process.exit(1);
  }

  if (fs.existsSync(BASELINE_PATH)) {
    const old = JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"));
    const r = compare(old.rows, rows, { fields: FIELDS, keyFields: KEY_FIELDS, by: (row) => row.quest });
    console.log(`前の基準との差（${old.rows.length} 組 → ${rows.length} 組）`);
    console.log(`  対応が取れなかった行: ${r.missing}`);
    FIELDS.forEach((f) => {
      if (r.diff[f] > 0) {
        const inner = Object.entries(r.by[f]).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(" / ");
        console.log(`  ${f}: ${r.diff[f]} 件　(${inner})`);
      }
    });
    // ★ 差が0なら**書かない**。生成日時だけが変わったファイルをコミットすると、
    //   「基準を更新したコミット」が中身の無いものになり、**単独コミットの規則が形骸化する**。
    if (FIELDS.every((f) => r.diff[f] === 0) && r.missing === 0 && old.rows.length === rows.length) {
      console.log("  ★ 差は0件。基準は書き直しません（生成日時も据え置き）。");
      return;
    }
  } else {
    console.log("前の基準がありません（初回の生成）。");
  }

  fs.writeFileSync(BASELINE_PATH, JSON.stringify({
    生成日時: new Date().toISOString(),
    説明: "対比較の基準。★ 生成物。手で直さない。作り直しは npm run test:update-baseline（単独コミットにして、動いた件数を報告に書くこと）",
    件数: rows.length,
    項目: FIELDS,
    rows,
  }));
  console.log(`書き出しました: ${BASELINE_PATH}（${rows.length} 組 / ${(fs.statSync(BASELINE_PATH).size / 1024 / 1024).toFixed(1)} MB）`);
})().catch((e) => { console.error(e); process.exit(1); });
