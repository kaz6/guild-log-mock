// 読了の判子のとき、その遠征で上がった能力を出す（EX-157【3】）。
// ★ 表示だけ。成長そのものは今までどおり帰還時に起きる（ここでは「控え」が名簿の整数の差と一致することを見る）。
const { test, expect } = require("@playwright/test");
const { freshPage, interview, departQuest, waitForReturn } = require("../helpers/app");

async function openReportAndStamp(page, id) {
  await page.evaluate((rid) => { state.activeReportId = rid; setRoute("report"); }, id);
  await page.waitForTimeout(300);
  await page.locator("#app, .paper-sheet").first().click({ position: { x: 5, y: 5 } }).catch(() => {}); // 文字送りを飛ばす
  await page.waitForFunction(() => { const b = document.getElementById("reportStampBtn"); return b && !b.disabled; });
  await page.locator("#reportStampBtn").click();
  await page.waitForTimeout(300);
}

test.describe("読了の判子と上がった能力（EX-157【3】）", () => {
  test("実際の遠征：控えは名簿の整数の差と一致し、判子のあとにだけ出る。リロードで消える", async ({ page }) => {
    const errors = await freshPage(page);
    await interview(page);
    const before = await page.evaluate(() => Object.fromEntries(state.adventurers.map((a) =>
      [a.id, Object.fromEntries(GROWTH_ELIGIBLE_STAT_KEYS.map((k) => [k, Math.floor(a.stats?.[k] ?? 10)]))])));
    const { reportsBefore } = await departQuest(page, "隣の酒場に買い出し");
    await waitForReturn(page, reportsBefore);
    const got = await page.evaluate((b) => {
      const r = state.reports[0];
      const expected = [];
      state.adventurers.forEach((a) => GROWTH_ELIGIBLE_STAT_KEYS.forEach((k) => {
        const d = Math.floor(a.stats?.[k] ?? 10) - (b[a.id]?.[k] ?? 10);
        if (d > 0) expected.push(`${a.id}:${k}:${d}`);
      }));
      return { id: r.id, shown: (r.growthShown ?? []).map((g) => `${g.advId}:${g.statKey}:${g.delta}`).sort(), expected: expected.sort() };
    }, before);
    expect(got.shown).toEqual(got.expected);

    await openReportAndStamp(page, got.id);
    if (got.expected.length > 0) {
      const rows = await page.locator(".paper-growth li").allInnerTexts();
      expect(rows.length).toBe(got.expected.length);
      expect(rows.join("")).toMatch(/＋\d/);
    } else {
      await expect(page.locator(".paper-growth")).toHaveCount(0);
    }
    await page.reload();
    await page.waitForTimeout(400);
    await page.evaluate((rid) => { state.activeReportId = rid; setRoute("report"); }, got.id);
    await page.waitForTimeout(300);
    await expect(page.locator(".paper-growth"), "リロードしたら出さない（保存しない）").toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("上がらなかった回は何も出さない／振動は判子の1回だけ／振動できない端末でも落ちない", async ({ page }) => {
    await page.addInitScript(() => { window.__vib = []; navigator.vibrate = (p) => { window.__vib.push(p); return true; }; });
    const errors = await freshPage(page);
    await interview(page);
    await page.evaluate(() => {
      const r = generateReport({ questId: "quest_tavern_errand", adventurerIds: ["adv_mina"], adventurerItemIds: {}, seed: 7, departTimeOfDay: "昼", departWeather: "晴れ", startTime: 0, durationMs: 1 });
      r.id = "rg_none"; state.reports.unshift(r); saveState();
    });
    await openReportAndStamp(page, "rg_none");
    await expect(page.locator(".paper-growth")).toHaveCount(0);
    expect(await page.evaluate(() => window.__vib)).toEqual([40]);

    // 上がった回：出る（ミナ 探索 ＋1 の形）
    await page.evaluate(() => {
      const r = generateReport({ questId: "quest_herb", adventurerIds: ["adv_mina"], adventurerItemIds: {}, seed: 8, departTimeOfDay: "昼", departWeather: "晴れ", startTime: 0, durationMs: 1 });
      r.id = "rg_some"; r.growthShown = [{ advId: "adv_mina", statKey: "exploration", delta: 1 }]; state.reports.unshift(r); saveState();
    });
    await openReportAndStamp(page, "rg_some");
    await expect(page.locator(".paper-growth li")).toHaveText(["ミナ　探索 ＋1"]);

    // 振動できない端末（navigator.vibrate が無い）
    await page.evaluate(() => {
      delete navigator.vibrate; Object.defineProperty(Navigator.prototype, "vibrate", { value: undefined, configurable: true });
      const r = generateReport({ questId: "quest_herb", adventurerIds: ["adv_mina"], adventurerItemIds: {}, seed: 9, departTimeOfDay: "昼", departWeather: "晴れ", startTime: 0, durationMs: 1 });
      r.id = "rg_novib"; state.reports.unshift(r); saveState();
    });
    await openReportAndStamp(page, "rg_novib");
    await expect(page.locator(".paper-hanko")).toHaveCount(1);
    expect(errors).toEqual([]);
  });
});
