// 序盤の受付嬢の会話（2026-10-24・EX-164。文面は作者の確定稿＝台本ページの「序盤の会話イベント：受付嬢」）。
// ★ ① 酒場と掃除が終わり6件が開いたとき ② 6件のどれかを初めて（未達でなく）終えたとき。それぞれ1度だけ、会話の窓で。
// ★ ②の「お金も入って…」は志望動機が「お金のため」の人にだけ。古いセーブ（志望動機が無い）は出さない。
// ★ 古いセーブ（鍵が無い）で条件がもう満たされている会話は出さない。
const { test, expect } = require("@playwright/test");
const { URL, freshPage, interview, seedClearedQuests } = require("../helpers/app");

const card = (page, id) => page.locator(`[data-reception-talk="${id}"]`);
const home = async (page) => { await page.evaluate(() => setRoute("home")); await page.waitForTimeout(200); };
// 窓をめくって全文を集め、「わかりました」で閉じる
async function readTalk(page, id) {
  const texts = [];
  for (let i = 0; i < 6; i++) {
    texts.push(await card(page, id).locator(".speech-window").innerText());
    const more = card(page, id).locator(".window-next");
    if (!(await more.isVisible())) break;
    await more.click();
  }
  await card(page, id).getByRole("button", { name: "わかりました" }).click();
  await page.waitForTimeout(200);
  return texts.join("\n");
}
// 6件のうち1件の報告書を、指定の段（full／fail）で積む
const addSixReport = (page, tier) => page.evaluate((tier) => {
  const result = Object.keys(GROWTH_TIER_BY_RESULT).find((k) => GROWTH_TIER_BY_RESULT[k] === tier);
  const r = generateReport({ questId: "quest_herb", adventurerIds: ["adv_mina"], adventurerItemIds: {}, seed: 5, departTimeOfDay: "昼", departWeather: "晴れ", startTime: 0, durationMs: 1 });
  r.id = `report_six_${tier}`; r.result = result; state.reports.unshift(r); saveState();
}, tier);

test("①6件が開いたとき・②6件を初めて終えたとき（お金のため）、それぞれ1度だけ。名前入り", async ({ page }) => {
  const errors = await freshPage(page);
  await interview(page, "カズ"); // 志望動機は「お金のため」
  await home(page);
  await expect(page.locator("[data-reception-talk]")).toHaveCount(0);
  await seedClearedQuests(page, ["quest_tavern_errand"]);
  await home(page);
  await expect(page.locator("[data-reception-talk]"), "酒場だけでは出ない").toHaveCount(0);
  await seedClearedQuests(page, ["quest_guild_cleanup"]);
  await home(page);
  const t1 = await readTalk(page, "sixOpen");
  expect(t1).toContain("改めて歓迎します！");
  expect(t1).toContain("カズさん！");
  expect(t1).toContain("まずは掲示板に貼られている依頼を選んで、冒険者さんを送り出しましょう！");
  await home(page);
  await expect(page.locator("[data-reception-talk]"), "①は1度だけ").toHaveCount(0);

  await addSixReport(page, "fail");
  await home(page);
  await expect(page.locator("[data-reception-talk]"), "未達では②を出さない").toHaveCount(0);
  await addSixReport(page, "full");
  await home(page);
  const t2 = await readTalk(page, "firstSix");
  expect(t2).toContain("初依頼の達成おめでとうございます！お金も入って、懐も温まりましたね！");
  expect(t2).toContain("どんどん解決していきましょう！");
  await page.reload(); await page.waitForTimeout(300); await home(page);
  await expect(page.locator("[data-reception-talk]"), "②も1度だけ").toHaveCount(0);
  expect(await page.evaluate(() => state.player.motive)).toBe("money");
  expect(errors).toEqual([]);
});

test("無記名は「記録員さん」。志望動機が「お金のため」でない人・古いセーブ（志望動機なし）には一言を足さない", async ({ page }) => {
  const errors = await freshPage(page);
  await interview(page, "");
  await page.evaluate(() => { delete state.player.motive; saveState(); }); // 古いセーブ相当
  await seedClearedQuests(page, ["quest_tavern_errand", "quest_guild_cleanup"]);
  await home(page);
  expect(await readTalk(page, "sixOpen")).toContain("記録員さん！");
  await addSixReport(page, "full");
  await home(page);
  const t2 = await readTalk(page, "firstSix");
  expect(t2).toContain("初依頼の達成おめでとうございます！");
  expect(t2).not.toContain("お金も入って");
  expect(errors).toEqual([]);
});

test("古いセーブ（鍵が無い）：条件がもう満たされている会話は出さず、まだのものは後で出る", async ({ page }) => {
  const errors = await freshPage(page);
  await interview(page);
  await seedClearedQuests(page, ["quest_tavern_errand", "quest_guild_cleanup"]);
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
    delete raw.receptionTalks;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(raw));
  });
  await page.goto(URL); await page.waitForTimeout(400); await home(page);
  await expect(page.locator("[data-reception-talk]"), "6件はもう開いている＝①は出さない").toHaveCount(0);
  await addSixReport(page, "full");
  await home(page);
  await expect(card(page, "firstSix"), "②はまだだったので出る").toHaveCount(1);
  expect(errors).toEqual([]);
});
