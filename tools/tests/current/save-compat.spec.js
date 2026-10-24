// 途中のセーブの互換（2026-10-23）。
//
// ★ テスターは配布中の /trial/（本体 166b95d の凍結コピー）で途中まで遊んでいる。セーブは端末の
//   `expeditionGuildLogMockV011_trial` に残る。trial/ を作り直すと、そのセーブを新しい版が読む。
// ★ ここでは「166b95d の /trial/ で作ったセーブ」3種（fixtures/saves/）を、いまの本体から作った /trial/ のコピーで開き、
//   エラーなく開く／面接をやり直させない／依頼が出せる／報告書が読める／生態目録を隠さない、を確かめる。
//   ⚠️ fixtures は作り直さない（配布中の版で作ったことに意味がある）。配布の版が変わったら、その版で3種を足す。
const { test, expect } = require("@playwright/test");
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { REPO } = require("../helpers/app");

const KEY = "expeditionGuildLogMockV011_trial";
const SAVES = ["after-interview", "after-six", "after-name-seal"];
let tmp, trialUrl;
test.beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "guild-compat-"));
  const dest = path.join(tmp, "trial");
  execFileSync("node", ["scripts/make-trial.js", "--out", dest], { cwd: REPO });
  trialUrl = `file://${dest}/index.html`;
});
test.afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

for (const name of SAVES) {
  test(`166b95d の /trial/ のセーブ（${name}）を、いまの版で開ける`, async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
    page.on("console", (m) => { if (m.type() === "error") errors.push("console.error: " + m.text()); });
    const save = fs.readFileSync(path.join(REPO, "tools/tests/fixtures/saves", `trial-166b95d-${name}.json`), "utf8");
    await page.goto(trialUrl);
    await page.evaluate(({ k, v }) => { localStorage.clear(); localStorage.setItem(k, JSON.stringify(JSON.parse(v))); }, { k: KEY, v: save });
    await page.reload();
    await page.waitForTimeout(500);

    // 面接をやり直させない
    const home = await page.evaluate(() => document.body.innerText);
    expect(home, "面接に戻された").not.toContain("ようこそ、西端ギルドへ！");
    expect(await page.evaluate(() => state.player.interviewDone)).toBe(true);

    // 序盤の受付嬢の会話（EX-164）：もう過ぎた会話を言い出さない
    if (name !== "after-interview") await expect(page.locator('[data-reception-talk="sixOpen"]'), "6件が開いたあとのセーブで①を言い出した").toHaveCount(0);
    if (name === "after-name-seal") await expect(page.locator("[data-reception-talk]"), "名前の封のあとのセーブで会話を言い出した").toHaveCount(0);

    // 報告書が読める（全部）
    const reportIds = await page.evaluate(() => state.reports.map((r) => r.id));
    if (name !== "after-interview") expect(reportIds.length, "報告書が無い（fixture が変わった？）").toBeGreaterThan(0);
    for (const id of reportIds) {
      await page.evaluate((x) => openReport(x), id);
      await page.waitForTimeout(300);
      await expect(page.locator(".paper-sub").first(), `報告書 ${id} が開けない`).toBeVisible();
    }

    // 生態目録を隠さない（ナビから開け、名前の封をした記録はそのまま）
    await page.evaluate(() => setRoute("home"));
    await expect(page.locator('[data-route="ecology"]').first()).toBeVisible();
    await page.evaluate(() => setRoute("ecology"));
    await page.waitForTimeout(200);
    const named = await page.evaluate(() => Object.values(state.ecologyRecord ?? {}).filter((e) => e.nameConfirmedAt).map((e) => e.name));
    if (name === "after-name-seal") expect(named, "名前の封をした記録が無い（fixture が変わった？）").toEqual(["ふくみみ"]);
    for (const n of named) expect(await page.evaluate(() => document.body.innerText)).toContain(n);

    // 依頼が出せる（掲示板の先頭の依頼に、待機中の人間を1人出す）
    await page.evaluate(() => setRoute("quests"));
    await page.waitForTimeout(300);
    const titles = await page.evaluate(() => [...document.querySelectorAll(".quest-card h3")].map((h) => h.innerText));
    expect(titles.length, "掲示板が空").toBeGreaterThan(0);
    await page.locator(".quest-card").first().click();
    await page.waitForTimeout(250);
    const picked = await page.evaluate(() => {
      const free = [...document.querySelectorAll(".adventurer-card")].filter((c) => /待機中/.test(c.innerText) && !/エルシー/.test(c.innerText));
      free[0]?.click();
      return free.length;
    });
    expect(picked, "待機中の冒険者が選べない").toBeGreaterThan(0);
    await page.waitForTimeout(250);
    const before = await page.evaluate(() => (state.expeditions ?? []).length);
    await page.getByRole("button", { name: "遠征開始" }).click();
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => (state.expeditions ?? []).length), "遠征が出せない").toBe(before + 1);

    // リロードしても残る
    await page.reload();
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => state.player.interviewDone)).toBe(true);
    expect(errors).toEqual([]);
  });
}
