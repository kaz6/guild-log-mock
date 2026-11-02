// 報告書の見出しの「出発時」（2026-11-02・EX-172【3】）。
// ★ 固有依頼（5人の連鎖）の報告書には出さない（2026-11-01 の作者の決定）。固有依頼は1日の話として書いた確定稿で、
//   出発の時刻と天気に縛らない。ふつうの依頼の報告書には、これまでどおり出す。
const { test, expect } = require("@playwright/test");
const { freshPage, interview } = require("../helpers/app");

// 報告書を1通作って棚に載せ、報告書の画面を開いて、見出しの欄の文字を返す
const openReportOf = (page, questId) => page.evaluate((questId) => {
  const r = generateReport({ questId, adventurerIds: ["adv_gadd", "adv_mina"], adventurerItemIds: {}, seed: 7, departTimeOfDay: "夜", departWeather: "霧", startTime: 0, durationMs: 1 });
  state.reports.unshift(r);
  state.activeReportId = r.id;
  setRoute("report");
  return document.querySelector(".paper-sheet")?.innerText ?? "";
}, questId);

test("固有依頼の報告書には「出発時」を出さない。ふつうの依頼には出す。固有依頼の報告書も開ける", async ({ page }) => {
  const errors = await freshPage(page);
  await interview(page);
  const bond = await openReportOf(page, "quest_bond_gadd");
  expect(bond, "固有依頼の見出しに出発時が出ている").not.toContain("出発時");
  expect(bond, "固有依頼の報告書の画面が開いていない（地域の欄）").toContain("塩の沢");
  const usual = await openReportOf(page, "quest_herb");
  expect(usual, "ふつうの依頼の見出しから出発時が消えた").toContain("夜 / 霧");
  expect(errors).toEqual([]);
});
