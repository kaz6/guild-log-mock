// docs/SESSION_STATE.md から、Notion の「SESSION_STATE（写し・閲覧用）」ページに貼る本文を生成する。
//
// ★ 2026-09-16・EX-110 の裁定1：**写しは生成物にする。**
//   それまでは差分更新で当てていたため、**手で言い換えた文が写しに溜まっていた**（53箇所）。
//   生成して全置換すれば一度に消える。⑤-b は「生成して反映」に改めた。
//
// ★ 向きは変わっていない：**repo の docs/SESSION_STATE.md が正本**で、Notion 側は閲覧用。
//   ここを編集しても repo には戻らない（宣言3行はこのスクリプトが自動で付ける）。
//
// ★ 変換は CURRENT_SPEC と同じもの（`scripts/gen-notion-spec.js` の convert を呼ぶ）。
//   違うのは2つだけ：宣言の文面と、本文の開始位置（写しは**最終更新の行と ※ の注記も本文**なので、
//   1行目の見出しと直後の引用ブロックだけを落とす）。
//
// 使い方: node scripts/gen-notion-session-state.js > /tmp/notion-session-state.txt
//   分割して貼るとき: node scripts/gen-notion-session-state.js --split 4 --out /tmp/ss
//   （/tmp/ss-1.txt … /tmp/ss-4.txt に、見出しの切れ目で割って書き出す）

const fs = require("fs");
const path = require("path");
const { convert, utcStamp } = require("./gen-notion-spec.js");

const SRC = path.join(__dirname, "..", "docs", "SESSION_STATE.md");

// JST の日時（写しの先頭に出す更新日時）。★ 推測せず、実行時の時刻から出す。
function jstStamp(now = new Date()) {
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const pad = (n) => String(n).padStart(2, "0");
  return `${jst.getUTCFullYear()}-${pad(jst.getUTCMonth() + 1)}-${pad(jst.getUTCDate())} ` +
    `${pad(jst.getUTCHours())}:${pad(jst.getUTCMinutes())} JST`;
}

function declaration(now = new Date()) {
  return [
    `> 更新日時: ${jstStamp(now)}（生成: ${utcStamp(now)}）`,
    "> **このページは写しであって、正本ではありません。** 正は repo の docs 配下の SESSION_STATE です。",
    "> **ここを手で編集しても repo には戻りません。** 直すときは repo 側を直してください" +
      "（このページは session-end の ⑤-b が「node scripts/gen-notion-session-state.js」の出力で毎回まるごと置き換えます）。"
  ];
}

// 見出しの切れ目で n 個に割る。★ 表の途中で切らない（Notion の表ブロックが壊れるため）。
// ★ 割る基準は行数ではなく**バイト数**。1行の長さが極端に違うので、行数で割ると偏る
//   （実測：行数で5分割すると先頭だけ 83KB、残りが 11〜28KB になった）。
function split(text, n) {
  const lines = text.split("\n");
  const target = Math.ceil(Buffer.byteLength(text) / n);
  const parts = [];
  let cur = [];
  let size = 0;
  let inTable = false;
  lines.forEach((line) => {
    if (/^<table/.test(line)) inTable = true;
    if (/^<\/table>/.test(line)) inTable = false;
    const canCut = !inTable && /^#{1,5} /.test(line) && size >= target && parts.length < n - 1;
    if (canCut) {
      parts.push(cur.join("\n"));
      cur = [];
      size = 0;
    }
    cur.push(line);
    size += Buffer.byteLength(line) + 1;
  });
  parts.push(cur.join("\n"));
  return parts;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const text = convert(fs.readFileSync(SRC, "utf8"), { declaration: declaration(), start: "afterQuote" });
  const splitAt = args.indexOf("--split");
  if (splitAt === -1) {
    process.stdout.write(text);
  } else {
    const n = Number(args[splitAt + 1]);
    const outAt = args.indexOf("--out");
    const base = outAt === -1 ? "/tmp/notion-session-state" : args[outAt + 1];
    split(text, n).forEach((part, idx) => {
      const file = `${base}-${idx + 1}.txt`;
      fs.writeFileSync(file, part);
      process.stderr.write(`${file}: ${part.split("\n").length} 行 / ${Buffer.byteLength(part)} バイト\n`);
    });
  }
}

module.exports = { declaration, split };
