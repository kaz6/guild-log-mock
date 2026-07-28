#!/usr/bin/env node
// 依頼一覧の Markdown 表を data-quests.js から生成する。
//
// なぜこれがあるか：一覧は「事実」であってコードに実在する。文書に写すと複製になり、
// 依頼が増えるたびに手で追従が要り、忘れた瞬間に仕様書が旧値を配る（実際に13件のまま
// 4件分腐った）。だから CURRENT_SPEC からは一覧を落とし、必要なときにここから作り直す。
//
// 使い方: node scripts/gen-quest-table.js
//
// ※ 帯のラベルと実時間は data-time.js から読む。ここに書き写すと第2の複製になるため。
//   （2026-07-28 まではロジック側の app.js にあったので定義ブロックを抜き出していた。
//     帯を data 側へ移したので、素直に読み込むだけで済むようになった。）

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");

function readSource(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

// data-*.js は window へ代入するだけのファイルなので、window を用意して丸ごと評価する。
function loadDataFile(file) {
  const sandbox = { window: {} };
  vm.runInNewContext(readSource(file), sandbox, { filename: file });
  return sandbox.window;
}

function loadQuests() {
  const quests = loadDataFile("data-quests.js").masterQuests;
  if (!Array.isArray(quests)) throw new Error("data-quests.js から masterQuests を読めなかった");
  return quests;
}

function loadDurationBands() {
  const time = loadDataFile("data-time.js");
  if (!time.masterDurationBands) throw new Error("data-time.js から masterDurationBands を読めなかった");
  return {
    bands: time.masterDurationBands,
    minutesPerDay: time.REAL_MINUTES_PER_GAME_DAY,
    defaultBand: time.defaultDurationBand
  };
}

function formatRealMinutes(minutes) {
  if (minutes < 60) return `実${Math.round(minutes)}分`;
  const hours = minutes / 60;
  return `実${Math.round(hours * 10) / 10}時間`;
}

function formatDuration(quest, { bands, minutesPerDay, defaultBand }) {
  const key = quest.durationBand || defaultBand;
  const band = bands[key];
  if (!band) return `不明（${key}）`;
  return `${band.label}（\`${key}\`・${formatRealMinutes(band.days * minutesPerDay)}）`;
}

function formatUnlock(quest, titleById) {
  if (quest.hidden) return "**掲示板に出ない**（捜索チェーン専用）";
  if (!quest.unlockedBy) return "なし（初期公開）";
  return titleById.get(quest.unlockedBy) || `不明な依頼（\`${quest.unlockedBy}\`）`;
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function main() {
  const quests = loadQuests();
  const duration = loadDurationBands();
  const titleById = new Map(quests.map((quest) => [quest.id, quest.title]));

  const lines = [];
  // ★この2行は必ず先頭に出す。人が付け忘れる余地を残さないため、スクリプト側で吐く。
  //   生成物と明記されていれば、腐っていても誤読されない。
  lines.push(`> 生成日時: ${stamp()}`);
  lines.push("> **これは生成物であって正本ではない。正は `data-quests.js`。** 内容が古いと思ったら貼り直すのではなく生成し直すこと。");
  lines.push("");
  lines.push(`全 ${quests.length} 件`);
  lines.push("");
  lines.push("| 題名 | 分類 | 危険度 | 地域 | 所要時間帯 | 解放条件 |");
  lines.push("| --- | --- | --- | --- | --- | --- |");
  quests.forEach((quest) => {
    lines.push([
      "",
      quest.title,
      quest.category,
      quest.danger,
      quest.area,
      formatDuration(quest, duration),
      formatUnlock(quest, titleById),
      ""
    ].join(" | ").trim());
  });

  process.stdout.write(lines.join("\n") + "\n");
}

main();
