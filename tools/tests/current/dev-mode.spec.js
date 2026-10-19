// Mock の道具は既定では出さない。?dev=1 のときだけ出す（EX-158：外部のテスターに渡す版）。
const { test, expect } = require("@playwright/test");
const { PLAIN_URL, URL: DEV_URL, interview } = require("../helpers/app");

async function open(page, url) {
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push("console.error: " + m.text()); });
  await page.goto(url);
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) { /* 私用モード等 */ } });
  await page.goto(url);
  await page.waitForTimeout(400);
  return errors;
}

const ROUTES = ["home", "quests", "adventurers", "observations", "ecology"];
// 画面に出ている「Mock」の語と、検証用の道具の文言
const DEV_WORDS = /Mock|🔧|時間加速|特殊裁定|3600倍|60倍|検証/;

test.describe("Mock の道具を隠す（EX-158）", () => {
  test("既定（?dev なし）：どの画面にも Mock の道具が出ない。タイトルも素のまま", async ({ page }) => {
    const errors = await open(page, PLAIN_URL);
    expect(await page.evaluate(() => document.body.innerText), "面接の画面").not.toMatch(DEV_WORDS);
    await interview(page);
    for (const r of ROUTES) {
      await page.evaluate((route) => setRoute(route), r);
      await page.waitForTimeout(250);
      const text = await page.evaluate(() => document.body.innerText);
      expect(text, `${r}：検証用の語が画面に出ている`).not.toMatch(DEV_WORDS);
      expect(await page.locator(".mock-time-bar").count(), `${r}：切り替えの帯`).toBe(0);
    }
    expect(await page.title()).toBe("遠征ギルドログ");
    await expect(page.locator("#resetButton")).toBeHidden();
    await expect(page.locator("[data-dev-only]:visible")).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("保存に加速が残っていても、?dev なしでは等倍で動く（隠すだけでなく効かせない）", async ({ page }) => {
    await open(page, DEV_URL);
    await interview(page);
    await page.evaluate(() => { setDemoSpeed(3600); });
    expect(await page.evaluate(() => getDemoSpeed())).toBe(3600);
    await page.goto(PLAIN_URL);
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => state.demoSpeed), "保存には残っている").toBe(3600);
    expect(await page.evaluate(() => getDemoSpeed()), "?dev なしでは等倍").toBe(1);
    await page.evaluate(() => setRoute("quests"));
    await page.waitForTimeout(250);
    expect(await page.locator(".mock-time-bar").count()).toBe(0);
  });

  test("?dev=1：今までどおり道具が出る（時間加速・時間帯・天候・特殊裁定・Mock初期化・版）", async ({ page }) => {
    const errors = await open(page, DEV_URL);
    await interview(page);
    await page.evaluate(() => setRoute("quests"));
    await page.waitForTimeout(250);
    const text = await page.evaluate(() => document.body.innerText);
    for (const w of ["時間加速", "特殊裁定", "時間帯", "天候", "3600倍"]) expect(text, w).toContain(w);
    expect(await page.locator(".mock-time-bar").count()).toBe(4);
    await expect(page.locator("#resetButton")).toBeVisible();
    expect(await page.title()).toContain("Mock");
    expect(errors).toEqual([]);
  });
});
