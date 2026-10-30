// 固有依頼の連鎖（相談 → 固有依頼 → 感謝。2026-10-24・EX-165）。文面は data-bonds.js（台本の確定稿・鉄鍋だけ）。
// ★ 始まる時機：受付嬢の②を読んだあと、6件の依頼で未達でない報告書が②の1通＋さらに2通（計3通）。1度だけ。
// ★ 頼まれごとは掲示板の6枠の外に1枠。鉄鍋がいないと出発できない。感謝は読了の封のあと1度だけ。ミナの続きは bond-mina.spec.js。
// ★ 【鉄鍋】はあだ名に追従（会話は描画のたび、報告書は作った時点で閉じる）。
const { test, expect } = require("@playwright/test");
const { freshPage, interview, seedClearedQuests } = require("../helpers/app");

const talk = (page) => page.locator("[data-bond-talk]");
const home = async (page) => { await page.evaluate(() => setRoute("home")); await page.waitForTimeout(150); };
// 6件のうち「未達でない」報告書を n 通積み、受付嬢の①②は読んだことにする
const addSix = (page, n) => page.evaluate((n) => {
  const full = Object.keys(GROWTH_TIER_BY_RESULT).find((k) => GROWTH_TIER_BY_RESULT[k] === "full");
  for (let i = 0; i < n; i++) {
    const r = generateReport({ questId: "quest_herb", adventurerIds: ["adv_mina"], adventurerItemIds: {}, seed: 10 + i, departTimeOfDay: "昼", departWeather: "晴れ", startTime: 0, durationMs: 1 });
    r.result = full; state.reports.unshift(r);
  }
  state.receptionTalks = { sixOpen: { at: 1, read: true }, firstSix: { at: 1, read: true } };
  saveState();
}, n);
async function readTalk(page) {
  const texts = [await talk(page).locator("h3").innerText()];
  for (let i = 0; i < 6; i++) {
    texts.push(await talk(page).locator(".speech-window").innerText());
    const more = talk(page).locator(".window-next");
    if (!(await more.isVisible())) break;
    await more.click();
  }
  await talk(page).getByRole("button", { name: "わかりました" }).click();
  await page.waitForTimeout(150);
  return texts.join("\n");
}
async function setup(page, name = "カズ") {
  const errors = await freshPage(page);
  await interview(page, name);
  await seedClearedQuests(page, ["quest_tavern_errand", "quest_guild_cleanup"]);
  return errors;
}
// 頼まれごとの報告書を作って棚に入れる（帰還の代わり）。封はまだ押さない
const returnBond = (page) => page.evaluate(() => {
  const r = generateReport({ questId: "quest_bond_gadd", adventurerIds: ["adv_gadd"], adventurerItemIds: {}, seed: 1, departTimeOfDay: "昼", departWeather: "晴れ", startTime: 0, durationMs: 1 });
  r.id = "report_bond"; r.opened = true; state.reports.unshift(r); saveState();
  return r.logs.map((l) => l.text).join("\n");
});

test("始まる時機：②のあと2通目までは始まらず、3通目で相談が出る。読んだら二度と出ない", async ({ page }) => {
  const errors = await setup(page);
  await addSix(page, 2);
  await home(page);
  await expect(talk(page), "②の1通＋1通では始まらない").toHaveCount(0);
  await addSix(page, 1);
  await home(page);
  await expect(talk(page)).toHaveCount(1);
  const text = await readTalk(page);
  expect(text).toContain("鉄鍋");
  expect(text).toContain("おう、カズ。ちょっといいか。");
  expect(text).toContain("ただ、あの味には沢の岩塩が要る。俺が行く。誰か一緒に来てくれりゃ助かる。");
  await page.reload(); await page.waitForTimeout(300); await home(page);
  await expect(talk(page), "相談は1度だけ").toHaveCount(0);
  expect(await page.evaluate(() => state.bondChain.started)).toBe(true);
  expect(errors).toEqual([]);
});

test("②を読んでいなければ、3通そろっても始まらない", async ({ page }) => {
  const errors = await setup(page);
  await addSix(page, 3);
  await page.evaluate(() => { state.receptionTalks.firstSix.read = false; saveState(); });
  await home(page);
  await expect(talk(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("頼まれごとは6枠の外に1枠。鉄鍋がいないと出発できず、出ている間は下ろし、鉄鍋が負傷中でも消えない", async ({ page }) => {
  const errors = await setup(page);
  await addSix(page, 3);
  await home(page);
  await page.evaluate(() => setRoute("quests"));
  await expect(page.locator("[data-bond-board]"), "相談を読むまでは出ない").toHaveCount(0);
  await home(page);
  await readTalk(page);
  await page.evaluate(() => setRoute("quests"));
  const bond = page.locator("[data-bond-board] .quest-card");
  await expect(bond).toHaveCount(1);
  await expect(bond).toContainText("宿場の粥の塩");
  // 6枠の中には入っていない
  const inGrid = await page.evaluate(() => [...document.querySelectorAll(".card:not([data-bond-board]) .quest-card h3")].map((h) => h.innerText));
  expect(inGrid).not.toContain("宿場の粥の塩");
  expect(inGrid.length).toBeLessThanOrEqual(6);
  // 鉄鍋なしでは出発できない
  await page.evaluate(() => { selectQuest("quest_bond_gadd"); selectedAdventurerIds = ["adv_mina"]; render(); });
  await expect(page.getByRole("button", { name: "遠征開始" })).toBeDisabled();
  await expect(page.locator("body")).toContainText("鉄鍋が必ず行く依頼です。");
  expect(await page.evaluate(() => { startExpedition(); return (state.expeditions ?? []).length; })).toBe(0);
  // 鉄鍋が負傷中（出られない）でも頼まれごとは消えない
  await page.evaluate(() => { getAdventurer("adv_gadd").status = "負傷"; selectedAdventurerIds = []; saveState(); render(); });
  await expect(bond).toHaveCount(1);
  await page.evaluate(() => { getAdventurer("adv_gadd").status = "待機中"; saveState(); render(); });
  // 鉄鍋を入れれば出発できる。出ている間は掲示板から下ろす
  await page.evaluate(() => { selectQuest("quest_bond_gadd"); selectedAdventurerIds = ["adv_gadd", "adv_mina"]; render(); });
  await expect(page.getByRole("button", { name: "遠征開始" })).toBeEnabled();
  await page.getByRole("button", { name: "遠征開始" }).click();
  expect(await page.evaluate(() => state.expeditions.map((e) => e.questId))).toEqual(["quest_bond_gadd"]);
  await page.evaluate(() => setRoute("quests"));
  await expect(page.locator("[data-bond-board]")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("感謝は読了の封のあとに1度だけ（報告書の画面とホーム）。感謝の直後にはミナの相談も頼まれごとも出ない", async ({ page }) => {
  const errors = await setup(page);
  await addSix(page, 3);
  await home(page);
  await readTalk(page);
  const body = await returnBond(page);
  expect(body).toContain("一行は、鉄鍋の案内で塩の沢へ向かった。");
  await home(page);
  await expect(talk(page), "封の前は感謝が出ない").toHaveCount(0);
  await page.evaluate(() => { state.activeReportId = "report_bond"; setRoute("report"); stampReport("report_bond"); });
  await expect(talk(page), "封をした報告書の画面に出る").toHaveCount(1);
  await home(page);
  const text = await readTalk(page);
  expect(text).toContain("よう、できたぜ。「宿場の冬の粥」だ。みんな、食ってくれ。");
  expect(text).toContain("カズ、あんたの分は大盛りだ。……付き合ってくれて、ありがとよ。");
  await page.reload(); await page.waitForTimeout(300); await home(page);
  await expect(talk(page), "感謝は1度だけ・ミナの相談は報告書がもう1通届くまで出ない").toHaveCount(0);
  await page.evaluate(() => setRoute("quests"));
  await expect(page.locator("[data-bond-board]"), "次の頼まれごとも出ない").toHaveCount(0);
  expect(await page.evaluate(() => state.bondChain.bond_gadd.thanksRead)).toBe(true);
  expect(errors).toEqual([]);
});

test("あだ名を付けると、相談・報告書・感謝の【鉄鍋】がすべてあだ名になる。報告書はあとから変えても動かない", async ({ page }) => {
  const errors = await setup(page);
  await page.evaluate(() => { getAdventurer("adv_gadd").nickname = "ナベさん"; saveState(); });
  await addSix(page, 3);
  await home(page);
  const consult = await readTalk(page);
  expect(consult.split("\n")[0], "話し手の表示").toBe("ナベさん");
  const body = await returnBond(page);
  expect(body).toContain("一行は、ナベさんの案内で塩の沢へ向かった。");
  expect(body).not.toContain("鉄鍋");
  await page.evaluate(() => { stampReport("report_bond"); getAdventurer("adv_gadd").nickname = "ガッちゃん"; saveState(); });
  await home(page);
  const thanks = await readTalk(page);
  expect(thanks.split("\n")[0], "感謝の話し手は今の呼び名").toBe("ガッちゃん");
  const after = await page.evaluate(() => state.reports.find((r) => r.id === "report_bond").logs.map((l) => l.text).join("\n"));
  expect(after, "報告書は作った時点の呼び名のまま").toContain("ナベさんの案内");
  expect(errors).toEqual([]);
});
