// docs/DECISION_LOG.md から「却下した案」の索引を生成する（2026-08-09・EX-066）。
//
// ★ 2026-08-09 裁定：索引は手書きしない。DECISION_LOG から抽出する生成物とする。
//   repo の docs/REJECTED_INDEX.md が正本の生成物で、Notion 側はその写し
//   （CURRENT_SPEC と同じ扱い）。session-end で毎回作り直す。
//
// ★ 理由は要約せず、原文の先頭をそのまま切り出す。言い換えると索引が嘘をつくため。
//
// 使い方:
//   node scripts/gen-rejected-index.js            → docs/REJECTED_INDEX.md を書き出す
//   node scripts/gen-rejected-index.js --notion   → Notion へ貼る本文を stdout に出す
//
// ※ Notion 用の変換は gen-notion-spec.js と同じ規約（表はタグへ／日本語のバッククォートは
//   「」へ／見出しの階層を1つ上げる）。共通化はしていない（1本にまとめる指示が出ていないため）。

const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "..", "docs", "DECISION_LOG.md");
const DEST = path.join(__dirname, "..", "docs", "REJECTED_INDEX.md");

// 理由の切り出し幅。★ ここを変えると索引の全行が変わるので、変えたら再生成すること。
const REASON_MAX = 30;
const REASON_SENTENCE_MAX = 40; // この長さ以内に「。」があれば、そこで切る（原文の1文をそのまま出す）

const src = fs.readFileSync(SRC, "utf8");

// ── 抽出 ──────────────────────────────────────────────────────────────
// エントリ＝ `## YYYY-MM-DD: 見出し`。その中の `### 却下した案` の項だけを見る。

function splitEntries(text) {
  const entries = [];
  const lines = text.split("\n");
  let current = null;
  lines.forEach((line) => {
    const head = line.match(/^## (.+)$/);
    if (head) {
      // 見出しの形は2種類ある：`## 日付: 見出し` と `## 日付 裁定・日付 収載: 見出し`。
      // ★ 日付は最初に現れたものを採り、見出しは最初のコロンより後ろを丸ごと採る。
      const text = head[1].trim();
      const date = (text.match(/\d{4}-\d{2}-\d{2}/) ?? [""])[0];
      const sep = text.search(/[:：]/);
      current = { date, title: (sep >= 0 ? text.slice(sep + 1) : text).trim(), body: [] };
      entries.push(current);
      return;
    }
    if (current) current.body.push(line);
  });
  return entries;
}

function rejectedSection(bodyLines) {
  const start = bodyLines.findIndex((l) => /^### .*却下した案/.test(l));
  if (start < 0) return null;
  const rest = bodyLines.slice(start + 1);
  const end = rest.findIndex((l) => /^#{2,6} /.test(l));
  return (end < 0 ? rest : rest.slice(0, end)).join("\n");
}

// 箇条書き1個＝却下案1件。インデントされた行と、記号で始まらない行は直前の項目の続き。
function splitItems(section) {
  const items = [];
  let current = null;
  section.split("\n").forEach((line) => {
    if (!line.trim()) return;
    const bullet = line.match(/^(?:[-*]|\d+\.)\s+(.*)$/); // インデント無し＝新しい項目
    if (bullet) {
      current = [bullet[1]];
      items.push(current);
      return;
    }
    if (current) current.push(line.trim()); // 続き（サブ項目・丸数字の列挙など）
  });
  // ★ 日本語なので、続きの行は空白を挟まずに繋ぐ（挟むと文の途中に空白が入る）。
  //   ただし丸数字などの列挙で始まる行だけは、区切りが消えないように空白を入れる。
  const joinParts = (parts) => parts.reduce(
    (acc, part, idx) => {
      if (idx === 0) return part;
      const item = part.replace(/^[-*]\s+/, ""); // 下位の箇条書きは記号を落として繋ぐ
      const isList = item !== part || /^[①-⑳・]/.test(part);
      return acc + (isList ? " " : "") + item;
    },
    ""
  );
  return items.map((parts) => joinParts(parts).replace(/[ \t]+/g, " ").trim());
}

function stripEmphasis(text) {
  return text.replace(/\*\*/g, "").replace(/^[〜~]\s*/, "").trim();
}

// 「案：理由」を割る。区切りは DECISION_LOG に実在する2種類だけを見る。
// ★ 「却下理由＝」は 2026-07-31 前後のエントリが使っている書き方で、コロンより先に探す
//   （同じ行に両方あるとき、案の名前の中のコロンで割ってしまうため）。
const REASON_SEPARATORS = ["却下理由＝", "却下理由：", "："];

// ★ 括弧の中の区切りでは割らない（「（例：〜）」で案の名前が途中で切れるため）。
function findSeparator(text, sep) {
  const open = "（(「『［[【";
  const close = "）)」』］]】";
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    if (open.includes(text[i])) depth += 1;
    else if (close.includes(text[i])) depth = Math.max(0, depth - 1);
    else if (depth === 0 && text.startsWith(sep, i)) {
      // ★ 「A：」「C：」のような案の符丁は区切りではない（案の名前が1文字になってしまう）。
      const before = text.slice(0, i).replace(/\*\*/g, "").trim();
      if (/^[A-Za-z0-9０-９]{1,3}$/.test(before)) continue;
      return i;
    }
  }
  return -1;
}

function splitPlanAndReason(item) {
  for (const sep of REASON_SEPARATORS) {
    const idx = findSeparator(item, sep);
    if (idx < 0) continue;
    return {
      plan: stripEmphasis(item.slice(0, idx)).replace(/[。、]$/, ""),
      reason: stripEmphasis(item.slice(idx + sep.length)),
      malformed: false
    };
  }
  return { plan: stripEmphasis(item), reason: "", malformed: true };
}

// ★ 要約しない。原文の先頭をそのまま切り出すだけ。
function clipReason(reason) {
  if (!reason) return "";
  const period = reason.indexOf("。");
  if (period >= 0 && period + 1 <= REASON_SENTENCE_MAX) return reason.slice(0, period + 1);
  if (reason.length <= REASON_MAX) return reason;
  return `${reason.slice(0, REASON_MAX)}…`;
}

const entries = splitEntries(src);
const rows = [];
const missing = [];   // 「却下した案」の項が無いエントリ
const noneStated = []; // 項はあるが「なし」と書いてあるエントリ
const malformed = [];  // 項はあるが 案：理由 の形になっていない行

entries.forEach((entry) => {
  const section = rejectedSection(entry.body);
  if (section === null) {
    missing.push(entry);
    return;
  }
  const items = splitItems(section);
  // ★ 「なし（対立案が出なかった）」は却下案ではないので行にしない（一覧には別枠で出す）。
  if (items.length === 0 || (items.length === 1 && /^なし/.test(stripEmphasis(items[0])))) {
    noneStated.push(entry);
    return;
  }
  items.forEach((item) => {
    const { plan, reason, malformed: bad } = splitPlanAndReason(item);
    if (bad) malformed.push({ entry, item });
    rows.push({ date: entry.date, title: entry.title, plan, reason: clipReason(reason) });
  });
});

// ── 出力 ──────────────────────────────────────────────────────────────

const now = new Date();
const pad = (n) => String(n).padStart(2, "0");
const stamp = `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())} ${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())} UTC`;

const escapeCell = (text) => text.replace(/\|/g, "｜");

const doc = [];
doc.push("# 却下案索引");
doc.push("");
doc.push(`> 生成日時: ${stamp}`);
doc.push("> **この文書は生成物です。正本は `docs/DECISION_LOG.md` 本体。** ここを手で直しても次の再生成で消えます。");
doc.push("> 生成コマンド: `node scripts/gen-rejected-index.js`（session-end で毎回作り直す）");
doc.push("");
doc.push(`- 抽出できた却下案：**${rows.length}件** ／ 「却下した案」の項を持つエントリ：**${entries.length - missing.length}件** ／ 全エントリ：**${entries.length}件**`);
doc.push("- ★ **理由は要約していません。** 原文の先頭をそのまま切り出しています（続きがあるものは末尾が `…`）。全文は元エントリを読んでください。");
doc.push("- 「元エントリの見出し」は `docs/DECISION_LOG.md` 内をそのまま検索できる文字列です（`## 日付: 見出し` の形で載っています）。");
doc.push("");
doc.push("| 日付 | 却下した案 | 理由（原文の先頭） | 元エントリの見出し |");
doc.push("| --- | --- | --- | --- |");
rows.forEach((r) => {
  doc.push(`| ${r.date} | ${escapeCell(r.plan)} | ${escapeCell(r.reason)} | ${escapeCell(r.title)} |`);
});
doc.push("");
doc.push(`## 「却下した案」の項が無いエントリ（${missing.length}件）`);
doc.push("");
doc.push("★ **遡って書き足していません。** 無いものは無いままにしてあります（後から書くと、そのとき対立案があったことにされてしまうため）。");
doc.push("");
if (missing.length === 0) {
  doc.push("- なし");
} else {
  missing.forEach((e) => doc.push(`- ${e.date}: ${escapeCell(e.title)}`));
}
if (noneStated.length > 0) {
  doc.push("");
  doc.push(`## 「なし」と明記されているエントリ（${noneStated.length}件）`);
  doc.push("");
  noneStated.forEach((e) => doc.push(`- ${e.date}: ${escapeCell(e.title)}`));
}
if (malformed.length > 0) {
  doc.push("");
  doc.push(`## 「案：理由」の形になっていない行（${malformed.length}件）`);
  doc.push("");
  doc.push("全角コロンが無いため理由を切り出せていません。**案の欄に行全体が入っています。**");
  doc.push("");
  malformed.forEach((m) => doc.push(`- ${m.entry.date}: ${escapeCell(m.entry.title)} ／ ${escapeCell(m.item.slice(0, 60))}`));
}
doc.push("");

const markdown = doc.join("\n");

// ── Notion 用の変換（gen-notion-spec.js と同じ規約）────────────────────
// ★ 表は 50行ずつに割る。1つの表にすると1回の書き込みが 4万字を超え、
//   途中で失敗したときに当たり確認ができないため（割り方を変えたら Notion 側も貼り直す）。
const NOTION_ROWS_PER_TABLE = 50;
function isAscii(text) { return !/[^\x00-\x7F]/.test(text); }
function convertInline(line) {
  return line.replace(/`([^`]+)`/g, (m, inner) => (isAscii(inner) ? m : `「${inner}」`));
}

function toNotion(md) {
  const lines = md.split("\n");
  const out = [];
  let i = 0;
  out.push(`> 生成日時: ${stamp}`);
  out.push("> **このページは生成物であって、正本ではありません。** 正は repo の `docs/DECISION_LOG.md` 本体です。");
  out.push("> **ここを編集しても次の更新で消えます。** 直すときは元の決定エントリを直してください。");
  while (i < lines.length && !/^[->|]/.test(lines[i]) && !/^#{2,6} /.test(lines[i])) i++; // 1行目の見出しを飛ばす
  while (i < lines.length && /^> /.test(lines[i])) i++; // ローカル側の宣言も飛ばす
  while (i < lines.length) {
    const line = lines[i];
    if (/^\|/.test(line) && i + 1 < lines.length && /^\|[\s:-]+\|/.test(lines[i + 1])) {
      const cells = (row) => row.replace(/^\||\|$/g, "").split("|").map((c) => convertInline(c.trim()));
      const header = cells(line);
      i += 2;
      const body = [];
      while (i < lines.length && /^\|/.test(lines[i])) { body.push(cells(lines[i])); i++; }
      for (let from = 0; from < body.length; from += NOTION_ROWS_PER_TABLE) {
        const chunk = body.slice(from, from + NOTION_ROWS_PER_TABLE);
        if (body.length > NOTION_ROWS_PER_TABLE) {
          out.push(`### ${from + 1}〜${from + chunk.length}件目`);
        }
        out.push('<table header-row="true">');
        out.push("<tr>");
        header.forEach((c) => out.push(`<td>${c}</td>`));
        out.push("</tr>");
        chunk.forEach((row) => {
          out.push("<tr>");
          row.forEach((c) => out.push(`<td>${c}</td>`));
          out.push("</tr>");
        });
        out.push("</table>");
      }
      continue;
    }
    if (/^#{2,6} /.test(line)) { out.push(convertInline(line.replace(/^#/, ""))); i++; continue; }
    out.push(convertInline(line));
    i++;
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n");
}

if (process.argv.includes("--notion")) {
  process.stdout.write(toNotion(markdown));
} else {
  fs.writeFileSync(DEST, markdown, "utf8");
  process.stderr.write(`却下案 ${rows.length}件を ${path.relative(process.cwd(), DEST)} に書き出しました（項が無いエントリ ${missing.length}件）\n`);
}
