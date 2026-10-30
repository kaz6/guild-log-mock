// マスターは kaz6/ops の tools/voice-check/voice-check.test.js。直すときはマスターを直してから配ること（このファイルが写しなら、ここを直接直さない）
// 配布状況：マスター 2026-10-30 版
// 口調の検査の試験。node --test tools/voice-check/voice-check.test.js で走る（Node の標準だけ）。表と文は試験用の作り物で、どの企画のものでもない。

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { check, validateLines, validateTable, sentences, formatText } = require("./voice-check.js");

const TABLE = {
  firstPersonWords: ["私", "僕", "俺", "わたし", "あたし"],
  silent: ["犬"],
  speakers: {
    "剣士": {
      firstPerson: ["俺"],
      avoidFirstPerson: ["拙者"],
      address: [{ to: "団長", use: ["団長"], avoid: ["あんた"] }],
      endings: { avoid: ["ですわ"] },
    },
    "猫": {
      firstPerson: ["あたし"],
      endings: { use: ["にゃ", "にゃん"], must: true },
    },
    "語り": {},
  },
};

const rules = (r) => r.violations.map((v) => v.rule);

test("表どおりの文は通る", () => {
  const r = check([
    { speaker: "剣士", text: "俺が先に行く。団長は後ろを。", source: "a:1" },
    { speaker: "猫", text: "あたしも行くにゃ！ 待つにゃん…", source: "a:2" },
    { speaker: "語り", text: "私はその夜を覚えている。", source: "a:3" },
  ], TABLE);
  assert.deepEqual(r.violations, []);
});

test("話さない者が話すと挙がる", () => {
  const r = check([{ speaker: "犬", text: "行こう。", source: "b:1" }], TABLE);
  assert.deepEqual(rules(r), ["silent"]);
});

test("表に無い話し手は挙がる", () => {
  const r = check([{ speaker: "魔女", text: "ふむ。" }], TABLE);
  assert.deepEqual(rules(r), ["unknown-speaker"]);
  assert.equal(r.violations[0].source, "");
});

test("使わない一人称と、表にない一人称", () => {
  const r = check([
    { speaker: "剣士", text: "拙者が参る。" },
    { speaker: "剣士", text: "僕が行くよ。" },
  ], TABLE);
  assert.deepEqual(rules(r), ["first-person", "first-person-other"]);
});

test("一人称を表に書いていない話し手には、表にない一人称の検査をしない", () => {
  const r = check([{ speaker: "語り", text: "僕も私も俺もいた。" }], TABLE);
  assert.deepEqual(r.violations, []);
});

test("使わない呼び方", () => {
  const r = check([{ speaker: "剣士", text: "あんたは下がってろ。" }], TABLE);
  assert.deepEqual(rules(r), ["address"]);
  assert.match(r.violations[0].detail, /団長を呼ぶときは「団長」/);
});

test("使わない語尾は文の終わりだけを見る", () => {
  const r = check([
    { speaker: "剣士", text: "これは俺のですわ。" },
    { speaker: "剣士", text: "ですわ、と彼女は言った。" },
  ], TABLE);
  assert.deepEqual(rules(r), ["ending-avoid"]);
});

test("語尾の癖が必須なら、文ごとに見る", () => {
  const r = check([{ speaker: "猫", text: "行くにゃ。でも眠い。「寝るにゃん」" }], TABLE);
  assert.deepEqual(rules(r), ["ending-must"]);
  assert.match(r.violations[0].detail, /「でも眠い」/);
});

test("作者が決めた例外は消え、使われなかった例外は注意に出る", () => {
  const table = {
    ...TABLE,
    exceptions: [
      { speaker: "猫", text: "でも眠い", rule: "ending-must", reason: "寝ぼけの場面" },
      { speaker: "剣士", text: "存在しない文", reason: "古い例外" },
    ],
  };
  const r = check([{ speaker: "猫", text: "行くにゃ。でも眠い。" }], table);
  assert.deepEqual(r.violations, []);
  assert.equal(r.unusedExceptions.length, 1);
  assert.equal(r.unusedExceptions[0].index, 1);
  assert.match(formatText(r), /例外 1 は一度も使われていない：古い例外/);
});

test("例外の rule が違えば消えない", () => {
  const table = { ...TABLE, exceptions: [{ speaker: "剣士", rule: "address", reason: "x" }] };
  const r = check([{ speaker: "剣士", text: "拙者だ。" }], table);
  assert.deepEqual(rules(r), ["first-person"]);
});

test("文の区切り", () => {
  assert.deepEqual(sentences("行くにゃ！ 待つにゃん…\n「寝る」"), ["行くにゃ", "待つにゃん", "「寝る"]);
});

test("入力の誤りを見つける", () => {
  assert.ok(validateLines({}).length);
  assert.ok(validateLines([{ speaker: "", text: "a" }]).length);
  assert.deepEqual(validateLines([{ speaker: "a", text: "b", source: "c" }]), []);
  assert.deepEqual(validateTable(TABLE), []);
  assert.ok(validateTable({ speakers: { a: { endings: { must: true } } } }).length);
  assert.ok(validateTable({ speakers: {}, exceptions: [{ reason: "全部消える" }] }).length);
  assert.ok(validateTable({ speakers: {}, exceptions: [{ speaker: "a" }] }).length);
  assert.ok(validateTable({ speakers: {}, exceptions: [{ speaker: "a", rule: "nope", reason: "x" }] }).length);
  assert.ok(validateTable({ speakers: { a: { firstPerson: [1] } } }).length);
});

test("コマンドとして走らせたときの終了コード", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "voice-check-"));
  const write = (name, v) => { const p = path.join(dir, name); fs.writeFileSync(p, JSON.stringify(v)); return p; };
  const script = path.join(__dirname, "voice-check.js");
  const run = (args) => {
    try { return { code: 0, out: execFileSync(process.execPath, [script, ...args], { encoding: "utf8", stdio: "pipe" }) }; }
    catch (e) { return { code: e.status, out: e.stdout, err: e.stderr }; }
  };
  const tablePath = write("table.json", TABLE);
  assert.equal(run([write("ok.json", [{ speaker: "剣士", text: "俺だ。" }]), tablePath]).code, 0);
  const ng = run([write("ng.json", [{ speaker: "犬", text: "わん", source: "c:9" }]), tablePath, "--json"]);
  assert.equal(ng.code, 1);
  assert.equal(JSON.parse(ng.out).violations[0].source, "c:9");
  assert.equal(run([write("bad.json", { speaker: "x" }), tablePath]).code, 2);
  assert.equal(run([tablePath]).code, 2);
  fs.rmSync(dir, { recursive: true, force: true });
});
