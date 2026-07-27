#!/usr/bin/env node
// 依頼一覧の Markdown 表を data-quests.js から生成する。
//
// なぜこれがあるか：一覧は「事実」であってコードに実在する。文書に写すと複製になり、
// 依頼が増えるたびに手で追従が要り、忘れた瞬間に仕様書が旧値を配る（実際に13件のまま
// 4件分腐った）。だから CURRENT_SPEC からは一覧を落とし、必要なときにここから作り直す。
//
// 使い方: node scripts/gen-quest-table.js
//
// ※ 帯のラベルと実時間は app.js の QUEST_DURATION_BANDS から読む。
//   ここに書き写すと、それ自体が第2の複製になるため。

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");

function readSource(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

// data-quests.js は window へ代入するだけのファイルなので、window を用意して評価する。
function loadQuests() {
  const sandbox = { window: {} };
  vm.runInNewContext(readSource("data-quests.js"), sandbox, { filename: "data-quests.js" });
  const quests = sandbox.window.masterQuests;
  if (!Array.isArray(quests)) throw new Error("data-quests.js から masterQuests を読めなかった");
  return quests;
}

// app.js は本体全体がブラウザ依存なので評価できない。帯の定義ブロックだけを抜いて評価する。
function loadDurationBands() {
  const src = readSource("app.js");
  const pieces = [
    /const REAL_MINUTES_PER_GAME_DAY = [\s\S]*?;/,
    /function gameDaysFromRealMinutes\([\s\S]*?\n\}/,
    /const QUEST_DURATION_BANDS = \{[\s\S]*?\n\};/,
    /const DEFAULT_DURATION_BAND = [\s\S]*?;/
  ].map((re) => {
    const hit = src.match(re);
    if (!hit) throw new Error(`app.js から定義を抜き出せなかった: ${re}`);
    return hit[0];
  });
  const sandbox = {};
  // const 宣言はサンドボックスのプロパティにならないので、明示的に外へ出す。
  pieces.push("globalThis.__extracted = { QUEST_DURATION_BANDS, REAL_MINUTES_PER_GAME_DAY, DEFAULT_DURATION_BAND };");
  vm.runInNewContext(pieces.join("\n"), sandbox, { filename: "app.js(抜粋)" });
  const extracted = sandbox.__extracted;
  return {
    bands: extracted.QUEST_DURATION_BANDS,
    minutesPerDay: extracted.REAL_MINUTES_PER_GAME_DAY,
    defaultBand: extracted.DEFAULT_DURATION_BAND
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
