#!/usr/bin/env node
// Notion の DECISION_LOG（正本）の全文を docs/backup/DECISION_LOG.notion.md に上書き保存する（2026-10-20・EX-158 の③）。
// 使い方：node scripts/save-notion-backup.js <notion-fetch の結果が落ちたファイル> [--force]
//   ★ 正本を notion-fetch すると、大きいので結果がファイルに落ちる（そのパスがエラー文に出る）。そのファイルを渡す。文脈に本文を読み込まずに済む。
//   版は git が持つ。Notion のページ履歴は手作業で、残る期間に限りがあるため、リポジトリにも全文を置く。
// ★ 壊れた正本で、良い写しを上書きしない：見出し・表が減る、または文字数が2%以上減るときは書かずに止まる（--force で書く）。
// 外部依存ゼロ。
"use strict";
const fs = require("fs");
const path = require("path");

const OUT = path.join(__dirname, "..", "docs", "backup", "DECISION_LOG.notion.md");

function extractContent(raw) {
  const texts = [];
  const walk = (v) => {
    if (typeof v === "string") {
      try { const j = JSON.parse(v); if (j && typeof j === "object") return walk(j); } catch { /* 文字列のまま */ }
      texts.push(v);
    } else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") { if (typeof v.text === "string") walk(v.text); else if (v.content !== undefined) walk(v.content); }
  };
  walk(raw);
  const all = texts.join("\n");
  const i = all.indexOf("<content>");
  const j = all.lastIndexOf("</content>");
  return i >= 0 && j > i ? all.slice(i + 9, j) : all;
}

function measure(body) {
  const lines = String(body).split("\n");
  return {
    headings: lines.filter((l) => /^#{1,2} /.test(l) && /\d{4}-\d{2}-\d{2}/.test(l)).length,
    tables: lines.filter((l) => l.startsWith("<table")).length,
    chars: String(body).length
  };
}

function main() {
  const src = process.argv[2];
  const force = process.argv.includes("--force");
  if (!src) { console.error("使い方: node scripts/save-notion-backup.js <notion-fetch の結果のファイル> [--force]"); process.exit(2); }
  let raw = fs.readFileSync(src, "utf8");
  try { raw = JSON.parse(raw); } catch { /* 生の文字列 */ }
  const body = extractContent(raw).replace(/^\n+|\n+$/g, "") + "\n";
  const now = measure(body);
  if (now.headings === 0) { console.error("見出しが1つも取れない。fetch の結果ではない可能性がある。書かない"); process.exit(1); }
  if (fs.existsSync(OUT) && !force) {
    const base = measure(fs.readFileSync(OUT, "utf8"));
    const lost = [];
    if (now.headings < base.headings) lost.push(`見出し ${base.headings}→${now.headings}`);
    if (now.tables < base.tables) lost.push(`表 ${base.tables}→${now.tables}`);
    if (now.chars < base.chars * 0.98) lost.push(`文字数 ${base.chars}→${now.chars}`);
    if (lost.length) { console.error(`前回の写しより減っている：${lost.join("／")}。正本が壊れている可能性がある。書かずに止まる（意図した減少なら --force）`); process.exit(1); }
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, body);
  console.log(`保存: ${path.relative(process.cwd(), OUT)}  見出し ${now.headings} ／ 表 ${now.tables} ／ ${now.chars} 字`);
}
main();
