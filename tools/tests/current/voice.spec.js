// 口調の検査（2026-10-30・EX-168）。会話の文が口調の表（tools/voice-check/voice-table.json）に合っているか。
// ★ 書き出し（tools/voice-lines.js）と検査（tools/voice-check/voice-check.js・ops の写し）は子プロセスで呼ぶ
//   （scripts.spec.js と同じ形。終了コードと出力だけ見る）。
// ★ 表は作者が確かめたもの（EX168-Q1：受付嬢だけ一人称「わたし」、ミナ・エルネは「私」）。例外はエルシーの「♪」だけ。
const { test, expect } = require("@playwright/test");
const { execFileSync, spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { REPO } = require("../helpers/app");

test("会話の文がすべて口調の表に合っている（受付嬢＝わたし／ミナ・エルネ＝私／鉄鍋＝俺／ロウ＝ぼく／エルシーは話さない）", async () => {
  test.setTimeout(120_000);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "guild-voice-"));
  const lines = path.join(tmp, "lines.json");
  execFileSync("node", ["tools/voice-lines.js", lines], { cwd: REPO });
  const rows = JSON.parse(fs.readFileSync(lines, "utf8"));
  // 書き出しが空や一部だけで「合っている」にならないように、道が通っていることを見る
  const speakers = new Set(rows.map((r) => r.speaker));
  for (const s of ["受付嬢", "鉄鍋", "ミナ", "エルネ", "ロウ", "エルシー"]) expect(speakers.has(s), `${s} の文が書き出されていない`).toBe(true);
  expect(rows.some((r) => r.speaker === "受付嬢" && r.text.includes("わたし"))).toBe(true);
  const r = spawnSync("node", ["tools/voice-check/voice-check.js", lines, "tools/voice-check/voice-table.json"], { cwd: REPO, encoding: "utf8" });
  expect(r.status, r.stdout + r.stderr).toBe(0);
});
