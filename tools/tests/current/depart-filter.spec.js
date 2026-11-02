// 出発時の条件で文を絞る仕組み（2026-11-02・EX-172【1】）。
// ★ 文の候補に times・weathers・reach を書くと、合わない回は候補から外れる。どの文も合わない回は fallback の文を使う。
//   fallback も無いときは、食い違う文をそのまま出して警告を残す（pickFittingCandidate）。
//   ★ その警告が、全依頼 × 時刻4 × 天気5 で1件も出ないこと＝条件を書いた候補の表に、どの回でも合う文があることを確かめる。
const { test, expect } = require("@playwright/test");
const { freshPage } = require("../helpers/app");

test("全依頼 × 時刻4 × 天気5 で、出発時の条件に合う文が無い回が0件", async ({ page }) => {
  const errors = await freshPage(page);
  const warnings = [];
  page.on("console", (m) => { if (m.type() === "warning" && m.text().includes("出発時の条件に合う文")) warnings.push(m.text()); });
  const count = await page.evaluate(() => {
    const parties = [["adv_mina", "adv_gadd", "adv_elne", "adv_row"], ["adv_gadd", "adv_elsie"], ["adv_mina"], ["adv_elne", "adv_row", "adv_elsie"]];
    let n = 0;
    window.masterQuests.forEach((quest) => ["朝", "昼", "夕方", "夜"].forEach((t) => ["晴れ", "曇り", "小雨", "風が強い", "霧"].forEach((w) => {
      parties.forEach((ids, i) => {
        state.reports = [];
        generateReport({ questId: quest.id, adventurerIds: ids, adventurerItemIds: {}, seed: 101 + i * 37, departTimeOfDay: t, departWeather: w, startTime: 0, durationMs: 1 });
        n++;
      });
    })));
    return n;
  });
  expect(count).toBeGreaterThan(1000);
  expect(warnings, "条件に合う文が無い回がある（候補の表に、その回でも合う文か fallback を足す）").toEqual([]);
  expect(errors).toEqual([]);
});
