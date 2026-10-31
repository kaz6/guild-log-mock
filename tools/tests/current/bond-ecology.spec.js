// エルネの感謝のあと、生態目録に「名前の無い草」の頁が1つ増える（2026-10-31・EX-171【2】）。
// ★ 頁は出会って立つ枠と同じ形（分類も軸も空）。エルネの写しは「冒険者の証言」に1件。名前は観察を重ねれば付けられる。
// ★ 目録が開くのは、最初の生き物に出会ったときか、エルネの感謝のときの、早いほう。
//   エルネの感謝で開いたときは、白紙の本を渡す一言を出さない（頁がもう1つある＝白紙ではない）。
const { test, expect } = require("@playwright/test");
const { freshPage, interview } = require("../helpers/app");

const navShown = (page) => page.evaluate(() => {
  const b = document.querySelector('.nav-button[data-route="ecology"]');
  return Boolean(b && b.offsetParent !== null);
});
const grassPages = (page) => page.evaluate(() => Object.values(state.ecologyRecord).filter((e) => e.target === "名前の無い草"));
// エルネの感謝を封のあとに読む（固有依頼の報告書は作ってある体で、連鎖の記録だけ立てる）
const readElneThanks = (page) => page.evaluate(() => {
  state.bondChain = { started: true,
    bond_gadd: { consultAt: 1, consultRead: true, thanksAt: 2, thanksRead: true, thanksReadAt: 3 },
    bond_mina: { consultAt: 1, consultRead: true, thanksAt: 2, thanksRead: true, thanksReadAt: 3 },
    bond_elne: { consultAt: 1, consultRead: true, thanksAt: 2 } };
  saveState();
  dismissBondTalk("bond_elne", "thanks");
});
// 最初の生き物に出会う（森の薬草採集＝森喰い兎の報告書に封をする）
const meetCreature = (page) => page.evaluate(() => {
  for (let seed = 1; seed < 200; seed++) {
    const r = generateReport({ questId: "quest_herb", adventurerIds: ["adv_mina"], adventurerItemIds: {}, seed, departTimeOfDay: "昼", departWeather: "晴れ", startTime: 0, durationMs: 1 });
    if (r.observationNotes) { r.id = "report_herb_m"; r.opened = true; state.reports.unshift(r); saveState(); break; }
  }
  state.activeReportId = "report_herb_m"; setRoute("report"); stampReport("report_herb_m");
});

test("エルネの感謝が先：目録がそのとき開き、名前の無い草の頁が1つ（分類・軸は空、証言はエルネの写し1件）。白紙の本の一言は出ない", async ({ page }) => {
  const errors = await freshPage(page);
  await interview(page, "カズ");
  expect(await navShown(page), "感謝の前").toBe(false);
  await readElneThanks(page);
  await page.waitForTimeout(150);
  expect(await navShown(page), "感謝のあと目録が開く").toBe(true);
  await expect(page.locator("[data-ecology-book]")).toHaveCount(0);
  const pages = await grassPages(page);
  expect(pages).toHaveLength(1);
  expect(pages[0]).toMatchObject({ name: null, category: "", confirmed: [], area: "森の日陰の斜面" });
  const s = await page.evaluate((id) => ecologyRecordTestimonies(getEcologyRecordEntry(id)).map((m) => ({ who: m.adventurerName, text: m.text })), pages[0].id);
  expect(s).toEqual([{ who: "エルネ", text: await page.evaluate(() => window.masterBondEcologyPages.unnamed_grass.testimony) }]);
  expect(await page.evaluate((id) => canNameEcologyRecordEntry(getEcologyRecordEntry(id)), pages[0].id), "最初は名前を付けられない").toBe(false);
  // あとで最初の生き物に出会っても、白紙の本の一言は出ない（もう頁がある）。頁は2つになる
  await meetCreature(page);
  await page.waitForTimeout(150);
  await expect(page.locator("[data-ecology-book]")).toHaveCount(0);
  expect(await page.evaluate(() => ecologyRecordEntries().length)).toBe(2);
  // 目録の画面に頁が出る
  await page.evaluate(() => setRoute("ecology"));
  await expect(page.locator(".ecology-record-card", { hasText: "名前の無い草" })).toHaveCount(1);
  // 再読み込みで増えない
  await page.reload(); await page.waitForTimeout(300);
  expect(await grassPages(page)).toHaveLength(1);
  expect(errors).toEqual([]);
});

test("生き物が先：出会ったときに目録が開き（一言あり）、エルネの感謝で頁が1つ増える", async ({ page }) => {
  const errors = await freshPage(page);
  await interview(page, "カズ");
  await meetCreature(page);
  await page.waitForTimeout(150);
  expect(await navShown(page)).toBe(true);
  await expect(page.locator("[data-ecology-book]")).toHaveCount(1);
  await page.evaluate(() => dismissEcologyBook());
  const before = await page.evaluate(() => ecologyRecordEntries().length);
  await readElneThanks(page);
  expect(await page.evaluate(() => ecologyRecordEntries().length)).toBe(before + 1);
  expect(await grassPages(page)).toHaveLength(1);
  // 感謝をもう一度読んだことにしても増えない
  await page.evaluate(() => { dismissBondTalk("bond_elne", "thanks"); });
  expect(await grassPages(page)).toHaveLength(1);
  expect(errors).toEqual([]);
});

test("観察を重ねて軸が7つ埋まれば、ふつうの頁と同じく名前を付けられる", async ({ page }) => {
  const errors = await freshPage(page);
  await interview(page, "カズ");
  await readElneThanks(page);
  const ok = await page.evaluate(() => {
    const e = Object.values(state.ecologyRecord).find((x) => x.target === "名前の無い草");
    e.confirmed = ECOLOGY_RECORD_AXES.slice(0, 7).map((axis) => ({ axis, text: "書いた" }));
    return canNameEcologyRecordEntry(e);
  });
  expect(ok).toBe(true);
  expect(errors).toEqual([]);
});

test("感謝を先に読んでいた古いセーブ（頁が無い）は、読み込みで1度だけ足す", async ({ page }) => {
  const errors = await freshPage(page);
  await interview(page, "カズ");
  await page.evaluate(() => {
    state.bondChain = { started: true, bond_elne: { consultAt: 1, consultRead: true, thanksAt: 2, thanksRead: true, thanksReadAt: 3 } };
    saveState();
  });
  await page.reload(); await page.waitForTimeout(300);
  expect(await grassPages(page)).toHaveLength(1);
  await page.evaluate(() => saveState());
  await page.reload(); await page.waitForTimeout(300);
  expect(await grassPages(page)).toHaveLength(1);
  expect(errors).toEqual([]);
});
