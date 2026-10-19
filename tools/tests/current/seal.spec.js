// 判子を封蝋にする（EX-159）。見た目だけ：画面の呼び名が「封」で揃い、封蝋の見た目（朱・丸く垂れた蝋・亀甲の押し跡）になっている。
const { test, expect } = require("@playwright/test");
const { freshPage, interview } = require("../helpers/app");

const OLD_WORDS = /判子|ハンコ|確定印/;

test.describe("封蝋（EX-159）", () => {
  test("読了：ボタンは「読了の封をする」。押すと封蝋（SVG）が出て、画面に旧い呼び名が残らない", async ({ page }) => {
    const errors = await freshPage(page);
    await interview(page);
    await page.evaluate(() => {
      const r = generateReport({ questId: "quest_tavern_errand", adventurerIds: ["adv_mina"], adventurerItemIds: {}, seed: 3, departTimeOfDay: "昼", departWeather: "晴れ", startTime: 0, durationMs: 1 });
      r.id = "rs_wax"; state.reports.unshift(r); state.activeReportId = r.id; saveState(); setRoute("report");
    });
    await page.waitForFunction(() => { const b = document.getElementById("reportStampBtn"); return b && !b.disabled; });
    await expect(page.locator("#reportStampBtn")).toHaveText("読了の封をする");
    expect(await page.evaluate(() => document.body.innerText)).not.toMatch(OLD_WORDS);
    await page.locator("#reportStampBtn").click();
    await page.waitForTimeout(300);
    const seal = page.locator(".paper-hanko");
    await expect(seal).toHaveCount(1);
    await expect(seal.locator("svg radialGradient")).toHaveCount(1); // 丸く垂れた蝋の陰影
    await expect(seal.locator("svg polygon")).toHaveCount(2);        // 亀甲の押し跡（仮）
    expect(await page.evaluate(() => document.body.innerText)).not.toMatch(OLD_WORDS);
    expect(errors).toEqual([]);
  });

  test("命名：「名前に封をする」。確定した名前の印は封蝋（朱の丸い蝋・枠線なし）", async ({ page }) => {
    await freshPage(page);
    await interview(page);
    await page.evaluate(() => {
      const r = generateReport({ questId: "quest_herb", adventurerIds: ["adv_mina"], adventurerItemIds: {}, seed: 4, departTimeOfDay: "昼", departWeather: "晴れ", startTime: 0, durationMs: 1 });
      r.id = "rs_wax2"; r.readStampAt = Date.now(); state.reports.unshift(r); ensureEcologyRecordFrame(r); saveState(); setRoute("ecology");
    });
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => document.body.innerText), "枠が出ている生態目録の画面").not.toMatch(OLD_WORDS);
    await page.evaluate(() => { const e = Object.values(state.ecologyRecord)[0]; e.name = "試しの名"; e.nameConfirmedAt = Date.now(); saveState(); setRoute("ecology"); });
    await page.waitForTimeout(300);
    const css = await page.evaluate(() => { const el = document.querySelector(".er-name-stamp"); const s = getComputedStyle(el); return { bg: s.backgroundImage, border: s.borderTopWidth, radius: s.borderTopLeftRadius }; });
    expect(css.bg).toContain("radial-gradient");
    expect(css.border).toBe("0px");
    expect(css.radius).not.toBe("0px");
  });

  test("未封の生態目録の説明も「読了の封」。名前を付ける欄（7軸そろった編集画面）の呼び名は「封をする」", async ({ page }) => {
    await freshPage(page);
    await interview(page);
    await page.evaluate(() => setRoute("ecology"));
    await page.waitForTimeout(200);
    const text = await page.evaluate(() => document.body.innerText);
    expect(text).toContain("読了の封をすると");
    expect(text).not.toMatch(OLD_WORDS);
    await page.evaluate(() => {
      const r = generateReport({ questId: "quest_herb", adventurerIds: ["adv_mina"], adventurerItemIds: {}, seed: 4, departTimeOfDay: "昼", departWeather: "晴れ", startTime: 0, durationMs: 1 });
      r.id = "rs_wax3"; r.readStampAt = Date.now(); state.reports.unshift(r); ensureEcologyRecordFrame(r);
      const e = Object.values(state.ecologyRecord)[0];
      e.confirmed = ECOLOGY_RECORD_AXES.slice(0, 7).map((axis, i) => ({ id: `o${i}`, axis, text: "書いた" }));
      saveState(); setRoute("ecology"); openEcologyRecordByTarget(e.target);
    });
    await page.waitForTimeout(300);
    const modal = await page.evaluate(() => document.querySelector(".ecology-record-overlay")?.innerText ?? "");
    expect(modal).toContain("名前に封をする");
    expect(modal).toContain("封をすると名前が確定し");
    expect(modal).not.toMatch(OLD_WORDS);
  });
});
