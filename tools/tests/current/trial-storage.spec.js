// テスター用の凍結コピー（`/trial/`）の保存が、作者の版と混ざらないこと（2026-10-19・EX-158【2】）。
//
// ★ 確かめること：同じ端末（同じオリジン）で本体とコピーを両方開いても、
//   ① コピーは `_trial` 付きの鍵に保存する　② 本体の保存は1文字も変わらない（コピーを遊んでも壊れない）
// ★ コピーは `scripts/make-trial.js --out` で試験のたびに作る（リポジトリの trial/ があるかに依らない）。
//   file:// は全ページで同じオリジンなので、ここで混ざらなければ https のページ間でも混ざらない。
const { test, expect } = require("@playwright/test");
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { REPO, PLAIN_URL, freshPage, interview } = require("../helpers/app");

const ROOT_KEY = "expeditionGuildLogMockV011";

test("trial/ の保存は本体と別の鍵で、本体の保存を壊さない", async ({ page }) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "guild-trial-"));
  const dest = path.join(tmp, "trial");
  execFileSync("node", ["scripts/make-trial.js", "--out", dest], { cwd: REPO });
  const trialUrl = `file://${dest}/index.html`;

  const errors = await freshPage(page); // 本体で localStorage を空にして開く
  await interview(page, "カズ");
  const rootBefore = await page.evaluate((k) => localStorage.getItem(k), ROOT_KEY);
  expect(rootBefore, "本体の保存ができていない").toBeTruthy();

  // 同じ端末でコピーを開く：本体の保存を見ない＝面接から始まる
  await page.goto(trialUrl);
  await page.waitForTimeout(400);
  expect(await page.evaluate((k) => localStorage.getItem(k + "_trial"), ROOT_KEY)).toBeNull();
  await interview(page, "テスター");
  const keys = await page.evaluate(() => Object.keys(localStorage).sort());
  expect(keys).toContain(ROOT_KEY + "_trial");
  expect(await page.evaluate((k) => localStorage.getItem(k), ROOT_KEY), "コピーを遊んだら本体の保存が変わった").toBe(rootBefore);
  const trialRaw = await page.evaluate((k) => localStorage.getItem(k + "_trial"), ROOT_KEY);
  expect(trialRaw).toContain("テスター");
  expect(trialRaw).not.toContain("カズ");

  // 本体へ戻っても、本体の保存は作者のまま
  await page.goto(PLAIN_URL);
  await page.waitForTimeout(400);
  expect(await page.evaluate((k) => localStorage.getItem(k), ROOT_KEY)).toContain("カズ");
  expect(errors, errors.join("\n")).toEqual([]);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("trial/ の綴じた記録の鍵も別（_trial_bound）", () => {
  const src = fs.readFileSync(path.join(REPO, "app.js"), "utf8");
  expect(src).toContain('"expeditionGuildLogMockV011" + STORAGE_SUFFIX + "_bound"');
});
