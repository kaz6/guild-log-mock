// docs/CURRENT_SPEC.md から、Notion の CURRENT_SPEC ページに貼る本文を生成する。
//
// ★ 2026-08-01 裁定：docs/CURRENT_SPEC.md が仕様の正本で、Notion 側は生成物。
//   session-end の 5-c がこのスクリプトの出力で Notion を全置換する。
//   先頭の宣言3行（生成日時／生成物であること／編集しても消えること）もここで自動的に付ける。
//   人が付け忘れる余地を残さないため、手で書かない。
//
// ★ 2026-09-16・EX-110：変換を `convert()` として切り出し、SESSION_STATE の写しの生成
//   （`scripts/gen-notion-session-state.js`）からも呼べるようにした。
//   **このファイルを直接実行したときの出力は従来どおり**（生成日時以外は1バイトも変えていない）。
//
// 使い方: node scripts/gen-notion-spec.js > /tmp/notion-spec.txt

const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "..", "docs", "CURRENT_SPEC.md");

// ── Notion 側で壊れるものを避けるための変換 ──────────────────────────
// 1. 見出しの階層を1つ上げる（Notion はページ名が最上位を占めるため）
// 2. Markdown の表を Notion のタグへ
// 3. コードブロックをやめる（日本語を入れると壊れる）
// 4. バッククォートの中に日本語があれば「」へ（太字にすると、周りの太字と入れ子になって壊れる）
// 5. ★ 記号だけ・1文字だけのコードスパンも「」へ（2026-09-14・EX-098）。
//    **Notion 側でスパンごと消える**——実例：向きの説明の `+` と `-` が本文から落ちて
//    「向き：得意 ／ 苦手」になっていた（2026-09-14 に写しとの全文照合で発見）。
//    ★ 文字そのものは変えない（全角に置き換えない）。囲みだけを「」に替える。

function isAscii(text) {
  return !/[^\x00-\x7F]/.test(text);
}

// Notion がスパンごと落とす形かどうか。英数字を1つも含まない、または1文字だけのもの。
// ★ 原因が「1文字だから」か「記号だけだから」かは切り分けていないので、両方を拾う広い条件にしてある。
function dropsInNotion(text) {
  return text.length <= 1 || !/[A-Za-z0-9]/.test(text);
}

// サロゲートペアの絵文字は Notion の本文に入れない（規約どおり。アイコンは icon で付ける）
function stripEmoji(text) {
  return text.replace(/[\u{1F000}-\u{1FAFF}\u{FE0F}]/gu, "").replace(/ {2,}/g, " ");
}

function convertInline(line) {
  return stripEmoji(line).replace(/`([^`]+)`/g, (m, inner) =>
    (isAscii(inner) && !dropsInNotion(inner) ? m : `「${inner}」`));
}

// 生成日時（UTC）。宣言の1行目に入れる。
function utcStamp(now = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())} ` +
    `${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())} UTC`;
}

// ★ `declaration` は先頭に置く宣言の行（生成日時を含む）。`start` は本文の開始位置の決め方。
//   - "h2"：最初の `## ` まで読み飛ばす（CURRENT_SPEC。冒頭の見出しと写し宣言を落とす）
//   - "afterQuote"：1行目の見出しと、その直後の引用ブロックだけを落とす（SESSION_STATE の写し。
//     ★ 最終更新の行や ※ の注記は本文なので残す）
function convert(src, { declaration, start = "h2" } = {}) {
  const lines = src.split("\n");
  const out = [];
  let i = 0;

  declaration.forEach((line) => out.push(line));

  // ローカル側の宣言（1行目の見出しと、その直後の引用ブロック）は Notion には出さない。
  if (start === "afterQuote") {
    while (i < lines.length && !lines[i].startsWith("> ")) i++;
    while (i < lines.length && /^>/.test(lines[i])) i++;
  } else {
    while (i < lines.length && !lines[i].startsWith("## ")) i++;
  }

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
  return out.join("\n").replace(/\n{3,}/g, "\n\n");
}

module.exports = { convert, convertInline, utcStamp };

if (require.main === module) {
  const declaration = [
    `> 生成日時: ${utcStamp()}`,
    "> **このページは生成物であって、仕様の正本ではありません。** 正は repo の docs 配下の CURRENT_SPEC です。",
    "> **ここを編集しても次の更新で消えます。** 直すときは repo 側を直してください。"
  ];
  process.stdout.write(convert(fs.readFileSync(SRC, "utf8"), { declaration, start: "h2" }));
}
