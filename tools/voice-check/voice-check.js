#!/usr/bin/env node
// マスターは kaz6/ops の tools/voice-check/voice-check.js。直すときはマスターを直してから配ること（このファイルが写しなら、ここを直接直さない）
// 配布状況：マスター 2026-10-30 版
// 写す手順：このファイルを企画のリポジトリの tools/voice-check/voice-check.js に丸ごと写し、上の「配布状況」の行だけ写した日の版に書き換える。
//   話し手つきの文の一覧（lines.json）を書き出す処理と、口調の表（voice-table.json）は、その企画が自分で持つ（マスターには入れない）。
//   試験（voice-check.test.js）も一緒に写してよい。形の説明は ops の tools/voice-check/README.md。
//
// 口調の検査：話し手つきの文の一覧を、口調の表と突き合わせ、表に合わない文を一覧にする。
// Node の標準だけで動く（依存なし）。表には文字列だけを書く（正規表現・条件式は持ち込まない）。
//
//   node voice-check.js <lines.json> <voice-table.json> [--json]
//   終了コード：0＝合わない文なし／1＝合わない文あり／2＝入力の誤り

"use strict";

const fs = require("fs");

// 文の終わりとみなす記号。ここで文を区切り、語尾を見るときは後ろの閉じ記号を落とす
const SENTENCE_END = /[。！？!?\n]+/;
const TRAILING = /[\s。、！？!?…‥」』）)\]】〉》]+$/;

const RULES = {
  "silent": "話さない者が話している",
  "unknown-speaker": "表に無い話し手",
  "first-person": "使わない一人称",
  "first-person-other": "表にない一人称（この話し手の一人称は別）",
  "address": "使わない呼び方",
  "ending-avoid": "使わない語尾",
  "ending-must": "語尾の癖に合わない",
};

function asList(v) {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

// ---------------------------------------------------------------- 入力の検査

function validateLines(lines) {
  const errors = [];
  if (!Array.isArray(lines)) return ["文の一覧は配列にする"];
  lines.forEach((l, i) => {
    if (!l || typeof l !== "object") { errors.push(`文の一覧の ${i} 番目がオブジェクトでない`); return; }
    for (const k of ["speaker", "text"]) {
      if (typeof l[k] !== "string" || l[k] === "") errors.push(`文の一覧の ${i} 番目：${k} が空か文字列でない`);
    }
    if (l.source !== undefined && typeof l.source !== "string") errors.push(`文の一覧の ${i} 番目：source が文字列でない`);
  });
  return errors;
}

function validateTable(table) {
  const errors = [];
  if (!table || typeof table !== "object" || Array.isArray(table)) return ["口調の表はオブジェクトにする"];
  const strList = (v, where) => {
    if (v === undefined) return;
    if (!asList(v).every((s) => typeof s === "string" && s !== "")) errors.push(`${where} は空でない文字列か、その配列にする`);
  };
  strList(table.silent, "silent");
  strList(table.firstPersonWords, "firstPersonWords");
  const speakers = table.speakers;
  if (speakers === undefined || typeof speakers !== "object" || Array.isArray(speakers)) {
    errors.push("speakers（話し手ごとの表）はオブジェクトにする");
  } else {
    for (const [name, s] of Object.entries(speakers)) {
      if (!s || typeof s !== "object" || Array.isArray(s)) { errors.push(`speakers.${name} はオブジェクトにする`); continue; }
      strList(s.firstPerson, `speakers.${name}.firstPerson`);
      strList(s.avoidFirstPerson, `speakers.${name}.avoidFirstPerson`);
      for (const [j, a] of asList(s.address).entries()) {
        if (!a || typeof a !== "object") { errors.push(`speakers.${name}.address[${j}] はオブジェクトにする`); continue; }
        strList(a.use, `speakers.${name}.address[${j}].use`);
        strList(a.avoid, `speakers.${name}.address[${j}].avoid`);
      }
      if (s.endings !== undefined) {
        if (!s.endings || typeof s.endings !== "object") errors.push(`speakers.${name}.endings はオブジェクトにする`);
        else {
          strList(s.endings.use, `speakers.${name}.endings.use`);
          strList(s.endings.avoid, `speakers.${name}.endings.avoid`);
          if (s.endings.must !== undefined && typeof s.endings.must !== "boolean") errors.push(`speakers.${name}.endings.must は true か false にする`);
          if (s.endings.must && asList(s.endings.use).length === 0) errors.push(`speakers.${name}.endings.must を true にするなら use を書く`);
        }
      }
    }
  }
  for (const [j, e] of asList(table.exceptions).entries()) {
    if (!e || typeof e !== "object") { errors.push(`exceptions[${j}] はオブジェクトにする`); continue; }
    if (typeof e.reason !== "string" || e.reason === "") errors.push(`exceptions[${j}]：reason（作者が決めた理由）を書く`);
    if (!["speaker", "text", "source", "rule"].some((k) => typeof e[k] === "string" && e[k] !== "")) {
      errors.push(`exceptions[${j}]：speaker・text・source・rule のどれかを書く（何も書かないと全部を消してしまう）`);
    }
    if (e.rule !== undefined && !(e.rule in RULES)) errors.push(`exceptions[${j}]：rule「${e.rule}」は無い（${Object.keys(RULES).join("・")}）`);
  }
  return errors;
}

// ---------------------------------------------------------------- 検査

function sentences(text) {
  return text.split(SENTENCE_END).map((s) => s.trim().replace(TRAILING, "")).filter((s) => s !== "");
}

// 1つの文を表と突き合わせ、合わない所を { rule, detail } の配列で返す
function checkLine(line, table) {
  const found = [];
  const silent = asList(table.silent);
  const speakers = table.speakers || {};
  const text = line.text;

  if (silent.includes(line.speaker)) {
    found.push({ rule: "silent", detail: `${line.speaker} は話さない者` });
    return found;
  }
  const s = speakers[line.speaker];
  if (!s) {
    found.push({ rule: "unknown-speaker", detail: `${line.speaker} は口調の表に無い` });
    return found;
  }

  const own = asList(s.firstPerson);
  for (const w of asList(s.avoidFirstPerson)) {
    if (text.includes(w)) found.push({ rule: "first-person", detail: `「${w}」（この話し手の一人称は${own.length ? own.map((x) => `「${x}」`).join("") : "表に無し"}）` });
  }
  const avoided = new Set(asList(s.avoidFirstPerson));
  if (own.length) {
    for (const w of asList(table.firstPersonWords)) {
      if (avoided.has(w) || own.some((o) => o.includes(w))) continue;
      if (text.includes(w)) found.push({ rule: "first-person-other", detail: `「${w}」（この話し手の一人称は${own.map((x) => `「${x}」`).join("")}）` });
    }
  }

  for (const a of asList(s.address)) {
    for (const w of asList(a.avoid)) {
      if (text.includes(w)) {
        const to = a.to ? `${a.to}を` : "";
        const use = asList(a.use);
        found.push({ rule: "address", detail: `「${w}」（${to}呼ぶときは${use.length ? use.map((x) => `「${x}」`).join("") : "表に無し"}）` });
      }
    }
  }

  const e = s.endings || {};
  const use = asList(e.use);
  for (const sent of sentences(text)) {
    for (const w of asList(e.avoid)) {
      if (sent.endsWith(w)) found.push({ rule: "ending-avoid", detail: `「…${w}」で終わる文：「${sent}」` });
    }
    if (e.must && !use.some((w) => sent.endsWith(w))) {
      found.push({ rule: "ending-must", detail: `${use.map((x) => `「…${x}」`).join("")}で終わらない文：「${sent}」` });
    }
  }
  return found;
}

function matchesException(ex, line, rule) {
  if (ex.speaker !== undefined && ex.speaker !== line.speaker) return false;
  if (ex.source !== undefined && ex.source !== (line.source || "")) return false;
  if (ex.text !== undefined && !line.text.includes(ex.text)) return false;
  if (ex.rule !== undefined && ex.rule !== rule) return false;
  return true;
}

// 文の一覧と表を受け取り、{ violations, unusedExceptions } を返す（入力は検査済みとする）
function check(lines, table) {
  const exceptions = asList(table.exceptions);
  const used = new Set();
  const violations = [];
  for (const line of lines) {
    for (const f of checkLine(line, table)) {
      const hit = exceptions.findIndex((ex) => matchesException(ex, line, f.rule));
      if (hit >= 0) { used.add(hit); continue; }
      violations.push({
        speaker: line.speaker,
        text: line.text,
        source: line.source || "",
        rule: f.rule,
        ruleName: RULES[f.rule],
        detail: f.detail,
      });
    }
  }
  const unusedExceptions = exceptions.map((ex, i) => ({ index: i, ...ex })).filter((ex) => !used.has(ex.index));
  return { violations, unusedExceptions };
}

function formatText(result) {
  const out = [];
  for (const v of result.violations) {
    out.push(`- ${v.source || "（出どころなし）"}｜${v.speaker}｜${v.ruleName}：${v.detail}\n    「${v.text}」`);
  }
  if (result.violations.length === 0) out.push("表に合わない文なし");
  for (const ex of result.unusedExceptions) {
    out.push(`（注意）例外 ${ex.index} は一度も使われていない：${ex.reason}`);
  }
  return out.join("\n");
}

// ---------------------------------------------------------------- CLI

function readJson(path, what) {
  let raw;
  try { raw = fs.readFileSync(path, "utf8"); } catch (e) { throw new Error(`${what}（${path}）を読めない：${e.message}`); }
  try { return JSON.parse(raw.replace(/^﻿/, "")); } catch (e) { throw new Error(`${what}（${path}）が JSON でない：${e.message}`); }
}

function main(argv) {
  const args = argv.filter((a) => a !== "--json");
  const asJson = argv.includes("--json");
  if (args.length !== 2) {
    process.stderr.write("使い方：node voice-check.js <lines.json> <voice-table.json> [--json]\n");
    return 2;
  }
  let lines, table;
  try {
    lines = readJson(args[0], "文の一覧");
    table = readJson(args[1], "口調の表");
  } catch (e) {
    process.stderr.write(e.message + "\n");
    return 2;
  }
  const errors = [...validateLines(lines), ...validateTable(table)];
  if (errors.length) {
    process.stderr.write(errors.map((e) => `入力の誤り：${e}`).join("\n") + "\n");
    return 2;
  }
  const result = check(lines, table);
  process.stdout.write((asJson ? JSON.stringify(result, null, 2) : formatText(result)) + "\n");
  return result.violations.length ? 1 : 0;
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));

module.exports = { check, checkLine, validateLines, validateTable, formatText, sentences, main, RULES };
