// 生態目録は最初の生き物に出会うまで無い（2026-10-23・EX-163 段階3）。
// ★ 「出会った」＝生態目録の最初の枠が立ったとき（読了の封で、observationNotes が null でない報告書）。
//   そのとき受付嬢が白紙の本を渡す一言を出し、ナビの「生態目録」とホームの本が現れる。
// ★ 古いセーブ（ecologyBook の鍵が無く、面接を終えている）では隠さない。
const { test, expect } = require("@playwright/test");
const { URL, freshPage, interview } = require("../helpers/app");

const navShown = (page) => page.evaluate(() => {
  const b = document.querySelector('.nav-button[data-route="ecology"]');
  return Boolean(b && b.offsetParent !== null);
});
const bookTouchable = async (page) => {
  await page.evaluate(() => { if (route === "home") { roomPanel = 0; render(); } });
  return (await page.locator('button[data-room-object="book"]').count()) > 0;
};

test("出会う前は出ない／最初の枠が立った封で一言が出て、目録が現れる", async ({ page }) => {
  const errors = await freshPage(page);
  await interview(page);
  expect(await navShown(page), "出会う前のナビ").toBe(false);
  expect(await bookTouchable(page), "出会う前の本").toBe(false);
  expect(await page.locator("[data-ecology-book]").count()).toBe(0);

  // 観察対象のいる依頼（森の薬草採集＝森喰い兎）で、出会った回の報告書を作る
  const id = await page.evaluate(() => {
    for (let seed = 1; seed < 200; seed++) {
      const r = generateReport({ questId: "quest_herb", adventurerIds: ["adv_mina"], adventurerItemIds: {}, seed, departTimeOfDay: "昼", departWeather: "晴れ", startTime: 0, durationMs: 1 });
      if (r.observationNotes) { r.id = "report_herb_u"; r.opened = true; state.reports.unshift(r); saveState(); return r.id; }
    }
    return null;
  });
  expect(id, "出会った回の報告書が作れない").not.toBeNull();
  // 帰ってきて開いただけでは、まだ出ない（枠は封のあと）
  await page.evaluate(() => setRoute("home"));
  expect(await navShown(page), "封の前").toBe(false);

  await page.evaluate((rid) => { state.activeReportId = rid; setRoute("report"); stampReport(rid); }, id);
  await page.waitForTimeout(200);
  expect(await page.locator("[data-ecology-book]").count(), "封をした報告書の画面に一言").toBe(1);
  expect(await navShown(page), "封のあとのナビ").toBe(true);

  // 読むまではホームにも残る。読んだら消え、目録は出たまま
  await page.evaluate(() => setRoute("home"));
  expect(await page.locator("[data-ecology-book]").count(), "ホームにも残る").toBe(1);
  expect(await bookTouchable(page), "封のあとの本").toBe(true);
  for (let i = 0; i < 5 && await page.locator("[data-ecology-book] .window-next").isVisible(); i++) {
    await page.locator("[data-ecology-book] .window-next").click();
  }
  await page.locator("[data-ecology-book]").getByRole("button", { name: "わかりました" }).click();
  await page.waitForTimeout(200);
  expect(await page.locator("[data-ecology-book]").count()).toBe(0);
  await page.reload(); await page.waitForTimeout(400);
  expect(await navShown(page), "リロードのあとも出たまま").toBe(true);
  expect(await page.locator("[data-ecology-book]").count(), "一言は二度と出ない").toBe(0);
  expect(errors).toEqual([]);
});

test("古いセーブ（鍵が無く、面接済み・枠0）では目録を隠さず、一言も出さない", async ({ page }) => {
  const errors = await freshPage(page);
  await interview(page);
  // いまの保存から ecologyBook の鍵を抜き、枠も0にした「EX-163 より前の形」を作る
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
    delete raw.ecologyBook;
    raw.ecologyRecord = {};
    localStorage.setItem(STORAGE_KEY, JSON.stringify(raw));
  });
  await page.goto(URL); await page.waitForTimeout(400);
  expect(await navShown(page), "古いセーブのナビ").toBe(true);
  expect(await bookTouchable(page), "古いセーブの本").toBe(true);
  expect(await page.locator("[data-ecology-book]").count(), "古いセーブで一言を言い出さない").toBe(0);
  expect(errors).toEqual([]);
});

test("新しいセーブ（鍵あり・面接済み・枠0）はリロードしても隠れたまま", async ({ page }) => {
  const errors = await freshPage(page);
  await interview(page);
  await page.reload(); await page.waitForTimeout(400);
  expect(await navShown(page)).toBe(false);
  expect(errors).toEqual([]);
});
