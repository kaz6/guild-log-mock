#!/usr/bin/env node
// テスター用の凍結コピー `trial/` を作る（2026-10-19・EX-158【2】）。
//   使い方: node scripts/make-trial.js            （リポジトリ直下の trial/ を作り直す）
//           node scripts/make-trial.js --out <dir>  （試験用。<dir> の名前は trial にすること）
// ★ 凍結＝このスクリプトを実行して `trial/` を作り直さない限り、テスターの版は変わらない。
//   配信（GitHub Pages）は main のルートを配るので、`trial/` も main に載れば
//   https://kaz6.github.io/guild-log-mock/trial/ で開ける。
// ★ 写しは本体とバイト単位で同じ（置き換えない）。テスターのセーブが作者の版と混ざらないのは、
//   app.js が**パスに `/trial/` を含むとき保存の鍵に `_trial` を足す**から（STORAGE_SUFFIX）。
// ⚠️ 更新するときは単独の PR にする（約1万行の差分が入るため、他の変更と混ぜない）。
//   更新の条件は「不具合の修正だけ入れる」。保存の形を変える変更は入れない（テスターのセーブが読めなくなる）。
// ★ 外部依存ゼロ（Node の組み込みだけ）。
"use strict";
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const outArg = process.argv.indexOf("--out");
if (outArg > 0 && !process.argv[outArg + 1]) { console.error("--out には作り先のディレクトリを渡すこと"); process.exit(1); }
const DEST = outArg > 0 ? path.resolve(process.argv[outArg + 1]) : path.join(ROOT, "trial");
// ⚠️ 作り先は消してから作る。名前が trial 以外のディレクトリは消さない（--out の指定ミスで作業ディレクトリを消さないため）
if (path.basename(DEST) !== "trial") { console.error(`作り先の名前は trial にすること: ${DEST}`); process.exit(1); }

// 配るもの。index.html の FILES と同じ並び（data-*.js は名前で拾う）＋ index.html・style.css・assets
const files = ["index.html", "style.css", "app.js", ...fs.readdirSync(ROOT).filter((f) => /^data-.*\.js$/.test(f)).sort()];

fs.rmSync(DEST, { recursive: true, force: true });
fs.mkdirSync(DEST, { recursive: true });
for (const f of files) fs.copyFileSync(path.join(ROOT, f), path.join(DEST, f));
fs.cpSync(path.join(ROOT, "assets"), path.join(DEST, "assets"), { recursive: true });

let commit = "unknown";
try { commit = execSync("git rev-parse --short HEAD", { cwd: ROOT }).toString().trim(); } catch (_) { /* git が無くても作れる */ }
fs.writeFileSync(
  path.join(DEST, "FROZEN.txt"),
  `テスター用の凍結コピー。本体の ${commit} から scripts/make-trial.js で作った。\n` +
  `手で編集しない。作り直すときは node scripts/make-trial.js を実行して単独の PR にする。\n`
);
console.log(`${DEST} を作りました（本体 ${commit}）: ${files.length} ファイル + assets/`);
