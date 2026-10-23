// 報告書の紙の書き手欄（2026-10-23・EX-162 の続き）。
// ★ 無記名（名前が無い／既定の「記録員」）のときは「記録員」だけ。「記録員 記録員」と重ねない。名前があれば「記録員 〇〇」。
// ★ 報告書の本文は変えない（紙の書き手欄だけ）。
const { test, expect } = require("@playwright/test");
const { freshPage, interview, seedClearedQuests } = require("../helpers/app");

async function writerOf(page) {
  const id = await page.evaluate(() => state.reports[0].id);
  await page.evaluate((x) => openReport(x), id);
  await page.waitForTimeout(400);
  return (await page.locator(".paper-sub").first().innerText()).trim();
}

test("無記名なら書き手欄は「記録員」だけ（「記録員 記録員」と重ならない）", async ({ page }) => {
  const errors = await freshPage(page);
  await interview(page, "");
  expect(await page.evaluate(() => state.player.name)).toBe("記録員");
  await seedClearedQuests(page, ["quest_tavern_errand"]);
  const writer = await writerOf(page);
  expect(writer).toBe("記録員");
  expect(writer).not.toContain("記録員 記録員");
  expect(errors).toEqual([]);
});

test("名前があれば書き手欄は「記録員 〇〇」", async ({ page }) => {
  const errors = await freshPage(page);
  await interview(page, "カズ");
  await seedClearedQuests(page, ["quest_tavern_errand"]);
  expect(await writerOf(page)).toBe("記録員 カズ");
  expect(errors).toEqual([]);
});
