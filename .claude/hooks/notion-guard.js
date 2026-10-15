#!/usr/bin/env node
// Notion への書き込みまわりの規則をフックで縛る（2026-10-09・EX-150）。
// 文章の規則を重ねても再発してきた「確かめたつもりで黙って通る」形の事故を、ツール呼び出しの手前で止める。
// 規則の一覧と、発動条件・返す文は CLAUDE.md の「フックで縛っている規則」節に1行ずつ書いてある（★ 直すときは両方を直す）。
//
// 呼び方：node notion-guard.js <mode>
//   pre-search   … PreToolUse（notion-search）：規則1（書き込み直後の search）と規則3（DECISION_LOG を名前で検索）
//   pre-update   … PreToolUse（notion-update-page）：規則1（置換前後が同じ置換）
//   post-write   … PostToolUse（Notion への書き込み系）：規則2（全角数字の警告）＋「読み直し待ち」を記録
//   post-fetch   … PostToolUse（notion-fetch）：読み直したページの「読み直し待ち」を消す
//   stop         … Stop：「読み直し待ち」が残っていたら、ターンを終えるのを止めて残りのページを返す（2026-10-15）
// 入力は stdin の JSON（session_id / tool_name / tool_input）。
// 終了コード 2 は、PreToolUse なら呼び出しを止め、PostToolUse なら stderr をモデルに返す（＝警告）。0 は何もしない。
// ★ 外部依存ゼロ（Node の組み込みだけ）。フックの不具合でセッションを止めないよう、想定外の入力は 0 で抜ける。
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const DECISION_LOG_ID = "3a9a8a5dfd4581e3a8cfc3872a300766";
const FULLWIDTH_DIGIT = /[０-９]/g;

function readInput() {
  try {
    return JSON.parse(fs.readFileSync(0, "utf8") || "{}");
  } catch {
    return null;
  }
}

// 「書き込んだが、まだ notion-fetch で読み直していない」印。セッションごとに1ファイル。
function pendingPath(sessionId) {
  const dir = process.env.NOTION_GUARD_STATE_DIR || path.join(os.tmpdir(), "claude-notion-guard");
  const safe = String(sessionId || "no-session").replace(/[^A-Za-z0-9_-]/g, "_");
  return { dir, file: path.join(dir, `${safe}.pending`) };
}

// 印の中身は「読み直し待ちのページ ID」を1行1件で持つ（ID は 32桁の16進に正規化する。URL・ダッシュ付きも同じ扱い）
function normId(v) {
  const m = String(v || "").replace(/-/g, "").match(/[0-9a-f]{32}/i);
  return m ? m[0].toLowerCase() : "";
}

// ★ 30分たった印は無視する（書き込みとは無関係の、あとの検索まで止めないため）
const PENDING_TTL_MS = 30 * 60 * 1000;

// ID が取れない書き込み（create-pages など）は "?" で持つ。fetch では消せないが、30分で切れる
function readPendingList(sessionId) {
  const { file } = pendingPath(sessionId);
  try {
    if (Date.now() - fs.statSync(file).mtimeMs > PENDING_TTL_MS) return [];
    return fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

function writePendingList(sessionId, list) {
  const { dir, file } = pendingPath(sessionId);
  try {
    if (list.length === 0) { fs.unlinkSync(file); return; }
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, list.join("\n"));
  } catch { /* 記録できなくても止めない／無ければよい */ }
}

function markPending(sessionId, pageId) {
  const id = normId(pageId) || "?";
  const list = readPendingList(sessionId);
  if (!list.includes(id)) list.push(id);
  writePendingList(sessionId, list);
}

// 読み直したページの印だけを消す。ID が取れない fetch は何も消さない（どのページを読んだか分からない）
function clearPending(sessionId, pageId) {
  const id = normId(pageId);
  if (!id) return;
  writePendingList(sessionId, readPendingList(sessionId).filter((x) => x !== id));
}

function describePending(list) {
  return list.map((x) => (x === "?" ? "（ID 不明の書き込み）" : x)).join("、");
}

// 書き込む文だけを集める（★ old_str は置き換え前の文なので見ない。ID も見ない）
const SKIP_KEYS = new Set(["old_str", "page_id", "id", "data_source_id", "template_id"]);

function collectStrings(value, out = []) {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => collectStrings(v, out));
  else if (value && typeof value === "object") {
    Object.entries(value).forEach(([k, v]) => { if (!SKIP_KEYS.has(k)) collectStrings(v, out); });
  }
  return out;
}

function block(message) {
  process.stderr.write(message + "\n");
  process.exit(2);
}

function main() {
  const mode = process.argv[2];
  const input = readInput();
  if (!input) process.exit(0);
  const sid = input.session_id;
  const ti = input.tool_input || {};

  if (mode === "pre-search") {
    const query = String(ti.query || "");
    // 規則3：DECISION_LOG は遠征と別企画（天使様）に同名ページがある。名前で当てにいかない
    if (/decision[_\s-]*log|設計判断の記録/i.test(query)) {
      block(`[notion-guard] 「DECISION_LOG」をページ名で検索しないこと（別企画に同名ページがある）。遠征の DECISION_LOG は ID ${DECISION_LOG_ID} を notion-fetch で指定する（CLAUDE.md「Notion ページID」）。`);
    }
    // 規則1：書き込み直後の確かめに search を使わない（索引が古く、直前の値を返さないことがある）
    const pending = readPendingList(sid);
    if (pending.length > 0) {
      block(`[notion-guard] Notion に書き込んだあと、まだ notion-fetch で読み直していない（ページ ${describePending(pending)}）。書けたかの確かめに notion-search は使わない（書き込み直後は索引が古い）。notion-fetch でページを取り直して確かめること。`);
    }
    process.exit(0);
  }

  if (mode === "pre-update") {
    // 規則1：置換前後が同じ置換（単発 probe）は、存在しない文字列でも成功が返るので確かめにならない
    const updates = Array.isArray(ti.content_updates) ? ti.content_updates : [];
    const same = updates.filter((u) => u && typeof u.old_str === "string" && u.old_str === u.new_str);
    if (same.length > 0) {
      block(`[notion-guard] old_str と new_str が同じ置換が ${same.length} 件ある（単発 probe）。これは存在しない文字列でも成功を返すので、当たり確認にならない。確かめは notion-fetch の読み直しで行うこと。`);
    }
    process.exit(0);
  }

  if (mode === "post-write") {
    markPending(sid, ti.page_id || ti.parent?.page_id || "");
    // 規則2：全角数字は警告だけ（日本語の文には正当に入るので止めない）
    const hits = [];
    collectStrings(ti).forEach((s) => {
      let m;
      FULLWIDTH_DIGIT.lastIndex = 0;
      while ((m = FULLWIDTH_DIGIT.exec(s)) && hits.length < 5) {
        hits.push(s.slice(Math.max(0, m.index - 8), m.index + 9).replace(/\n/g, " "));
      }
    });
    if (hits.length > 0) {
      block(`[notion-guard] 警告（書き込みは済んでいる）：Notion に書いた文に全角数字がある（例：${hits.map((h) => `「${h}」`).join("、")}）。半角の打ち間違いなら直すこと。意図した全角ならそのままでよい。`);
    }
    process.exit(0);
  }

  if (mode === "post-fetch") {
    clearPending(sid, ti.id);
    process.exit(0);
  }

  if (mode === "stop") {
    // 読み直す前にターンを終えない。★ 契機は Stop（PR のマージではない。session-end は「マージ→Notion」の順なので、マージ時点では書き込み前）
    // stop_hook_active は「このフックで止められて続行中」。2回目以降は通す（読み直せない事情があっても無限に止めない）
    if (input.stop_hook_active) process.exit(0);
    const pending = readPendingList(sid);
    if (pending.length > 0) {
      block(`[notion-guard] Notion に書き込んだページを、まだ notion-fetch で読み直していない：${describePending(pending)}。読み直して書けたことを確かめてから終えること（完了報告の前に済ませる）。`);
    }
    process.exit(0);
  }

  process.exit(0);
}

main();
