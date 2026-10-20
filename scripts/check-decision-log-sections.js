#!/usr/bin/env node
// 正本（docs/backup/DECISION_LOG.notion.md）と写し（docs/DECISION_LOG.md）の節の数を照合する（2026-10-20・EX-158 の④）。
// 使い方：node scripts/check-decision-log-sections.js
// ★ 正本の「# か ## で日付を含む見出し」を節とみなし、写しに同じ節（日付＋題名の頭）があるかを見る。
//   写しは正本から切り出すので、1節が複数に割れる／畳まれることはある（2026-08-08 の裁定）。だから「数が違う」ことは報告するが、
//   ★ 本題は「正本にあって写しに無い節」の一覧。今回（2026-10-20）は約25節が欠けていて、予備にならなかった。
// 終了コード：欠けが0なら0、あれば1（報告のためで、止めるためではない）。外部依存ゼロ。
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
    const title = m[1].replace(/\d{4}-\d{2}-\d{2}[:：｜]?/g, "").replace(/（[^）]*）/g, "").replace(/[★\s*`:：｜「」『』（）()、。・=＝]/g, "");
    out.push({ raw: m[1], date, key: title.slice(0, 10) });
  }
  return out;
}

if (!fs.existsSync(NOTION)) { console.error("docs/backup/DECISION_LOG.notion.md が無い。先に scripts/save-notion-backup.js で正本を書き出す"); process.exit(2); }
const n = sections(fs.readFileSync(NOTION, "utf8"));
const r = sections(fs.readFileSync(REPO, "utf8"));
const repoText = fs.readFileSync(REPO, "utf8").replace(/[★\s*`:：｜「」『』（）()、。・=＝]/g, "");
// 写しに「同じ題名の頭」を含む見出しがある（日付は写しで付け替えることがあるので、題名の頭だけで見る）
const missing = n.filter((s) => !r.some((x) => x.key === s.key) && !repoText.includes(s.key));
console.log(`正本の節 ${n.length} ／ 写しの節 ${r.length}（写しは切り出し・分割があるので、数が違うこと自体は異常ではない）`);
if (missing.length === 0) { console.log("正本にあって写しに無い節: 0件"); process.exit(0); }
console.log(`正本にあって写しに無い節: ${missing.length}件`);
missing.forEach((s) => console.log(`  - ${s.raw}`));
process.exit(1);
