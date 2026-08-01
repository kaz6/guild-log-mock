// docs/CURRENT_SPEC.md から、Notion の CURRENT_SPEC ページに貼る本文を生成する。
//
// ★ 2026-08-01 裁定：docs/CURRENT_SPEC.md が仕様の正本で、Notion 側は生成物。
//   session-end の 5-c がこのスクリプトの出力で Notion を全置換する。
//   先頭の宣言3行（生成日時／生成物であること／編集しても消えること）もここで自動的に付ける。
//   人が付け忘れる余地を残さないため、手で書かない。
//
// 使い方: node scripts/gen-notion-spec.js > /tmp/notion-spec.txt

const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "..", "docs", "CURRENT_SPEC.md");
const src = fs.readFileSync(SRC, "utf8");

// ── Notion 側で壊れるものを避けるための変換 ──────────────────────────
// 1. 見出しの階層を1つ上げる（Notion はページ名が最上位を占めるため）
// 2. Markdown の表を Notion のタグへ
// 3. コードブロックをやめる（日本語を入れると壊れる）
// 4. バッククォートの中に日本語があれば「」へ（太字にすると、周りの太字と入れ子になって壊れる）

function isAscii(text) {
  return !/[^\x00-\x7F]/.test(text);
}

// サロゲートペアの絵文字は Notion の本文に入れない（規約どおり。アイコンは icon で付ける）
function stripEmoji(text) {
  return text.replace(/[\u{1F000}-\u{1FAFF}\u{FE0F}]/gu, "").replace(/ {2,}/g, " ");
}

function convertInline(line) {
  return stripEmoji(line).replace(/`([^`]+)`/g, (m, inner) => (isAscii(inner) ? m : `「${inner}」`));
}

const lines = src.split("\n");
const out = [];
let i = 0;

// 先頭の宣言（ローカル側の写し宣言）は Notion には出さない。代わりに生成物の宣言を付ける。
const now = new Date();
const pad = (n) => String(n).padStart(2, "0");
const stamp = `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())} ${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())} UTC`;
out.push(`> 生成日時: ${stamp}`);
out.push("> **このページは生成物であって、仕様の正本ではありません。** 正は repo の docs 配下の CURRENT_SPEC です。");
out.push("> **ここを編集しても次の更新で消えます。** 直すときは repo 側を直してください。");

// ローカルの1行目の見出しと、その直後の引用ブロック（写し宣言）を飛ばす
while (i < lines.length && !lines[i].startsWith("## ")) i++;

while (i < lines.length) {
  const line = lines[i];

  // 表：ヘッダ行 → 区切り行 → 本体
  if (/^\|/.test(line) && i + 1 < lines.length && /^\|[\s:-]+\|/.test(lines[i + 1])) {
    const cells = (row) => row.replace(/^\||\|$/g, "").split("|").map((c) => convertInline(c.trim()));
    out.push('<table header-row="true">');
    out.push("<tr>");
    cells(line).forEach((c) => out.push(`<td>${c}</td>`));
    out.push("</tr>");
    i += 2;
    while (i < lines.length && /^\|/.test(lines[i])) {
      out.push("<tr>");
      cells(lines[i]).forEach((c) => out.push(`<td>${c}</td>`));
      out.push("</tr>");
      i++;
    }
    out.push("</table>");
    continue;
  }

  // コードブロック：中身を1行の説明として出す（Notion のコードブロックは使わない）
  if (/^```/.test(line)) {
    i++;
    const body = [];
    while (i < lines.length && !/^```/.test(lines[i])) { body.push(lines[i]); i++; }
    i++;
    body.filter((b) => b.trim()).forEach((b) => out.push(convertInline("`" + b.trim() + "`")));
    continue;
  }

  // 見出しの階層を1つ上げる
  if (/^#{2,6} /.test(line)) {
    out.push(convertInline(line.replace(/^#/, "")));
    i++;
    continue;
  }

  out.push(convertInline(line));
  i++;
}

// 空行が続くのを1つに畳む（Notion 側で空段落が増えるのを防ぐ）
const text = out.join("\n").replace(/\n{3,}/g, "\n\n");
process.stdout.write(text);
