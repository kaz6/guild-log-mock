#!/usr/bin/env node
// 正本（docs/backup/DECISION_LOG.notion.md）と写し（docs/DECISION_LOG.md）の節の数を照合する（2026-10-20・EX-158 の④）。
// 使い方：node scripts/check-decision-log-sections.js
// ★ 正本の「# か ## で日付を含む見出し」を節とみなし、写しに同じ節（日付＋題名の頭）があるかを見る。
//   写しは正本から切り出すので、1節が複数に割れる／畳まれることはある（2026-08-08 の裁定）。だから「数が違う」ことは報告するが、
//   ★ 本題は「正本にあって写しに無い節」の一覧。今回（2026-10-20）は約25節が欠けていて、予備にならなかった。
// ★ 写し側の「重複」も見る（2026-10-20・今回の二重取り込みを欠け検査が拾えなかったため）。見出し（日付・記号・リンク記法を外した形）と本文が同じ節が2つ以上あれば重複。
//   見出しだけ同じで本文が違う節は正当にある（正本にも2件ある）ので、数だけ知らせて落とさない。
// 終了コード：「どこにも無い」が0かつ重複が0なら0、どちらかあれば1（報告のためで、止めるためではない）。外部依存ゼロ。
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const NOTION = path.join(ROOT, "docs", "backup", "DECISION_LOG.notion.md");
const REPO = path.join(ROOT, "docs", "DECISION_LOG.md");

function sections(text) {
  const out = [];
  for (const line of text.split("\n")) {
    const m = line.match(/^#{1,2} (.*)$/);
    if (!m || !/\d{4}-\d{2}-\d{2}/.test(m[1])) continue;
    const date = (m[1].match(/(\d{4}-\d{2}-\d{2})/) || [])[1];
    const title = m[1].replace(/<\/?(code|b|s|i|u)>/g, "").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/\d{4}-\d{2}-\d{2}[:：｜]?/g, "").replace(/（[^）]*）/g, "").replace(/[★\s*`~\\{}:：｜「」『』（）()、。・=＝]/g, "");
    out.push({ raw: m[1], date, key: title.slice(0, 10) });
  }
  return out;
}

// 写しの重複：見出し＋本文が同じ節。見出しの形が違っても（日付が括弧の中・波括弧のエスケープ）同じ節とみなす
function duplicates(text) {
  const lines = text.split("\n");
  const hs = [];
  lines.forEach((l, i) => { const m = l.match(/^#{1,2} (.*)$/); if (m) hs.push({ i, h: m[1] }); });
  const flat = (t) => t.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/\d{4}-\d{2}-\d{2}/g, "").replace(/[★\s*`~\\{}:：｜「」『』（）()、。・=＝]/g, "");
  const seen = new Map();
  hs.forEach((s, j) => {
    if (!/\d{4}-\d{2}-\d{2}/.test(s.h)) return;
    const body = lines.slice(s.i + 1, j + 1 < hs.length ? hs[j + 1].i : lines.length).join("\n");
    const k = flat(s.h) + "|" + flat(body.replace(/^-{3,}\s*$/gm, "")); // 節の区切り線（---）の有無は本文の違いに数えない（今回の重複は区切り線だけが違った）
    if (!seen.has(k)) seen.set(k, []);
    seen.get(k).push({ line: s.i + 1, raw: s.h });
  });
  return [...seen.values()].filter((v) => v.length > 1);
}

if (!fs.existsSync(NOTION)) { console.error("docs/backup/DECISION_LOG.notion.md が無い。先に scripts/save-notion-backup.js で正本を書き出す"); process.exit(2); }
const n = sections(fs.readFileSync(NOTION, "utf8"));
const r = sections(fs.readFileSync(REPO, "utf8"));
// 写しの「見出し」に同じ題名の頭がある（日付は写しで付け替えることがあるので、題名の頭だけで見る）。★ 本文中の言及は数えない（言及で欠けが隠れる。pr-review の指摘・2026-10-20）
const norm = (t) => t.replace(/<\/?(code|b|s|i|u)>/g, "").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[★\s*`~\\{}:：｜「」『』（）()、。・=＝]/g, "");
const repoText = norm(fs.readFileSync(REPO, "utf8"));
// 写しの「見出し」に同じ題名の頭が無い節。うち、写しのどこにも題名の頭が出てこないものを「欠け」、本文では言及があるものを「見出しに無い（言及あり）」に分ける
// ★ 本文中の言及は欠けを隠す（pr-review の指摘・2026-10-20）。だから言及だけで「ある」とは言わず、別の欄に出す
const noHeading = n.filter((s) => !r.some((x) => x.key === s.key));
const missing = noHeading.filter((s) => !repoText.includes(s.key));
const mentioned = noHeading.filter((s) => repoText.includes(s.key));
console.log(`正本の節 ${n.length} ／ 写しの節 ${r.length}（写しは切り出し・分割があるので、数が違うこと自体は異常ではない）`);
console.log(`見出しに無い（本文では言及あり）: ${mentioned.length}件（要確認。言及だけでは写されたとは言えない）`);
if (process.argv.includes("--verbose")) mentioned.forEach((s) => console.log(`  ? ${s.raw}`));
const dups = duplicates(fs.readFileSync(REPO, "utf8"));
console.log(`写しの重複（見出しも本文も同じ節）: ${dups.length}件`);
dups.forEach((v) => console.log(`  ! ${v.map((x) => `L${x.line}`).join(" と ")}　${v[0].raw}`));
if (missing.length === 0) console.log("正本にあって写しのどこにも無い節: 0件");
else {
  console.log(`正本にあって写しのどこにも無い節: ${missing.length}件`);
  missing.forEach((s) => console.log(`  - ${s.raw}`));
}
process.exit(missing.length === 0 && dups.length === 0 ? 0 : 1);
