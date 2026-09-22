// 対比較（同一シードで不一致0）— 2026-09-22・EX-143。
//
// ★★ **自走の安全網。** 自走で一番怖いのは「気づかずに既存の振る舞いを変えること」で、
//   それを拾うのはここだけ。CLAUDE.md の動作確認8項目は動線しか見ないので、
//   報告書の中身が変わっても素通りする。
//
// ★ 基準は**固定スナップショット**（EX-143 の裁定2＝A）。
//   直前の main と比べる案は却下——**1タスク目をマージした瞬間に2タスク目の基準が動き、
//   意図せず入った変化が基準に昇格して見えなくなる**。連続で自走させる形が、その弱点を正面から突く。
//
// ★ 振る舞いを**意図して**変えたときは `npm run test:update-baseline` で作り直す。
//   ⚠️ 規則：**単独のコミットにする／動いた件数（依頼 × 項目）を報告に書く／中身を見ずに更新しない。**
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const { sweep, compare } = require("../../sweep");
const { sweepOptions, FIELDS, KEY_FIELDS, BASELINE_PATH } = require("../helpers/axes");

test("報告書の生成が基準と一致する（全依頼 × 編成30 × seed4・10項目）", async () => {
  expect(fs.existsSync(BASELINE_PATH), "基準がありません。npm run test:update-baseline で作ってください").toBe(true);
  const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"));
  const rows = await sweep(sweepOptions());

  // ★ 生成に失敗した組があれば、比較の前に落とす（例外が「不一致0」に化けるのを防ぐ）
  const failed = rows.filter((r) => r.error);
  expect(failed.map((r) => `${r.quest}/${r.seed}: ${r.error}`), "生成に失敗した組がある").toEqual([]);
  expect(rows.length, "組の数が基準と違う（軸を変えたなら基準も作り直す）").toBe(baseline.rows.length);

  const r = compare(baseline.rows, rows, { fields: FIELDS, keyFields: KEY_FIELDS, by: (row) => row.quest });

  // ★ sweep が出す3つの警告を落とさずに見る。どれも「検査が黙って消える」形を指している。
  expect(r.absent, "両側 undefined の項目がある＝その項目は見ていない").toEqual([]);
  expect(r.unchecked, "probe が返しているのに比較していない項目がある").toEqual([]);
  expect(r.missing, "基準の行に対応する行が無い").toBe(0);

  const moved = FIELDS.filter((f) => r.diff[f] > 0)
    .map((f) => `${f}: ${r.diff[f]}件 (${Object.entries(r.by[f]).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(" / ")})`);
  expect(moved, "基準から動いた項目がある（意図した変更なら npm run test:update-baseline を単独コミットで）").toEqual([]);
});
