// 固有依頼の連鎖の2人目：ミナの3拍（2026-10-30・EX-167）。文面は data-bonds.js（台本「2. ミナ」の確定稿）。
// ★ 相談：鉄鍋の感謝を読んだあと、未達でない報告書がもう1通届いたときに1度だけ（感謝の直後に続けて出さない）。
// ★ 頼まれごと「急ぎの印の一通」：6枠の外に1枠。ミナが必ず入る。定型の報告書。費用0・報酬0。
// ★ 感謝：報告書に読了の封をしたとき1度だけ。そのあと願いが開く。次の人（エルネ）は文面が無いのでそこで止まる。
// ★ 【ミナ】はあだ名に追従（会話は描画のたび、報告書は作った時点で閉じる）。
const { test, expect } = require("@playwright/test");
const { freshPage, interview, seedClearedQuests } = require("../helpers/app");

const talk = (page) => page.locator("[data-bond-talk]");
const home = async (page) => { await page.evaluate(() => setRoute("home")); await page.waitForTimeout(150); };
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
// 鉄鍋の3拍を済ませた状態（感謝は今読んだ）
async function setup(page, name = "カズ") {
  const errors = await freshPage(page);
  await interview(page, name);
  await seedClearedQuests(page, ["quest_tavern_errand", "quest_guild_cleanup"]);
  await page.evaluate(() => {
    state.receptionTalks = { sixOpen: { at: 1, read: true }, firstSix: { at: 1, read: true } };
    state.bondChain = { started: true, bond_gadd: { consultAt: 1, consultRead: true, thanksAt: 2 } };
    saveState();
    dismissBondTalk("bond_gadd", "thanks");
  });
  await page.waitForTimeout(20); // 感謝を読んだ時刻より後に報告書が届くように
  return errors;
}
// 報告書が1通届く（帰還の代わり）。result を指定する
const arrive = (page, tier) => page.evaluate((tier) => {
  const r = generateReport({ questId: "quest_herb", adventurerIds: ["adv_gadd"], adventurerItemIds: {}, seed: 77, departTimeOfDay: "昼", departWeather: "晴れ", startTime: 0, durationMs: 1 });
  r.result = Object.keys(GROWTH_TIER_BY_RESULT).find((k) => GROWTH_TIER_BY_RESULT[k] === tier);
  state.reports.unshift(r); saveState();
}, tier);
const returnBond = (page) => page.evaluate(() => {
  const r = generateReport({ questId: "quest_bond_mina", adventurerIds: ["adv_mina"], adventurerItemIds: {}, seed: 1, departTimeOfDay: "昼", departWeather: "晴れ", startTime: 0, durationMs: 1 });
  r.id = "report_bond_mina"; r.opened = true; state.reports.unshift(r); saveState();
  return r.logs.map((l) => l.text).join("\n");
});

test("相談は鉄鍋の感謝の直後には出ず、未達でない報告書がもう1通届いてから1度だけ出る（未達は数えない）", async ({ page }) => {
  const errors = await setup(page);
  await home(page);
  await expect(talk(page), "感謝の直後には出ない").toHaveCount(0);
  await arrive(page, "fail");
  await home(page);
  await expect(talk(page), "未達の報告書では出ない").toHaveCount(0);
  await arrive(page, "full");
  await home(page);
  await expect(talk(page)).toHaveCount(1);
  const text = await readTalk(page);
  expect(text.split("\n")[0], "話し手").toBe("ミナ");
  expect(text).toContain("ちょっと、カズ。……これ、見て。");
  expect(text).toContain("私が行く。ついてきたいなら、勝手にすれば。");
  await arrive(page, "full");
  await page.reload(); await page.waitForTimeout(300); await home(page);
  await expect(talk(page), "相談は1度だけ").toHaveCount(0);
  expect(errors).toEqual([]);
});

test("頼まれごと「急ぎの印の一通」は6枠の外に1枠。ミナがいないと出発できない。村・近場・費用0・報酬0", async ({ page }) => {
  const errors = await setup(page);
  await arrive(page, "full");
  await home(page);
  await readTalk(page);
  await page.evaluate(() => setRoute("quests"));
  const bond = page.locator("[data-bond-board] .quest-card");
  await expect(bond).toHaveCount(1);
  await expect(bond).toContainText("急ぎの印の一通");
  const q = await page.evaluate(() => { const q = getQuest("quest_bond_mina"); return { reach: questReach(q), money: q.money, obs: q.observationTarget, req: q.requiresAdventurer }; });
  expect(q).toEqual({ reach: "近場", money: { fee: 0, reward: 0 }, obs: "なし", req: "adv_mina" });
  await page.evaluate(() => { selectQuest("quest_bond_mina"); selectedAdventurerIds = ["adv_gadd"]; render(); });
  await expect(page.getByRole("button", { name: "遠征開始" })).toBeDisabled();
  await expect(page.locator("body")).toContainText("ミナが必ず行く依頼です。");
  // ミナが負傷中（出られない）でも頼まれごとは消えない
  await page.evaluate(() => { getAdventurer("adv_mina").status = "負傷"; selectedAdventurerIds = []; saveState(); render(); });
  await expect(bond).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("感謝は封のあと1度だけ。読むとミナの願いが開き、次の人（エルネ）は文面が無いのでそこで止まる", async ({ page }) => {
  const errors = await setup(page);
  await arrive(page, "full");
  await home(page);
  await readTalk(page);
  const body = await returnBond(page);
  expect(body).toContain("一行は、ミナを先頭に村へ向かった。");
  expect(body).toContain("帰り道、ミナは珍しくゆっくり歩いた。「……間に合った」と、誰に言うでもなく呟いた。");
  await home(page);
  await expect(talk(page), "封の前は感謝が出ない").toHaveCount(0);
  await page.evaluate(() => { state.activeReportId = "report_bond_mina"; setRoute("report"); stampReport("report_bond_mina"); });
  await expect(talk(page), "封をした報告書の画面に出る").toHaveCount(1);
  await home(page);
  const text = await readTalk(page);
  expect(text).toContain("……別に、礼を言うほどのことじゃないけど。");
  expect(text).toContain("……間に合ってよかった。付き合ってくれて、ありがと。");
  const wish = await page.evaluate(() => { setRoute("adventurers"); editAdventurer("adv_mina"); return document.querySelector("[data-wish]").innerText.trim(); });
  expect(wish).toBe(`願い：${await page.evaluate(() => window.masterWishes.adv_mina)}`);
  // さらに報告書が届いても、エルネには文面が無いので何も出ない
  await arrive(page, "full");
  await page.reload(); await page.waitForTimeout(300); await home(page);
  await expect(talk(page)).toHaveCount(0);
  await page.evaluate(() => setRoute("quests"));
  await expect(page.locator("[data-bond-board]")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("あだ名を付けると、相談・報告書・感謝の【ミナ】がすべてあだ名になる。報告書はあとから変えても動かない", async ({ page }) => {
  const errors = await setup(page);
  await page.evaluate(() => { getAdventurer("adv_mina").nickname = "ミーナ"; saveState(); });
  await arrive(page, "full");
  await home(page);
  const consult = await readTalk(page);
  expect(consult.split("\n")[0], "話し手の表示").toBe("ミーナ");
  const body = await returnBond(page);
  expect(body).toContain("一行は、ミーナを先頭に村へ向かった。");
  expect(body).not.toMatch(/ミナ[^ー]|【/);
  await page.evaluate(() => { stampReport("report_bond_mina"); getAdventurer("adv_mina").nickname = "ミナっち"; saveState(); });
  await home(page);
  const thanks = await readTalk(page);
  expect(thanks.split("\n")[0], "感謝の話し手は今の呼び名").toBe("ミナっち");
  const after = await page.evaluate(() => state.reports.find((r) => r.id === "report_bond_mina").logs.map((l) => l.text).join("\n"));
  expect(after, "報告書は作った時点の呼び名のまま").toContain("ミーナを先頭に");
  expect(errors).toEqual([]);
});

test("感謝を読んだ時刻を持たない古いセーブでは、封の時刻から数える", async ({ page }) => {
  const errors = await freshPage(page);
  await interview(page);
  await page.evaluate(() => {
    state.receptionTalks = { sixOpen: { at: 1, read: true }, firstSix: { at: 1, read: true } };
    state.bondChain = { started: true, bond_gadd: { consultAt: 1, consultRead: true, thanksAt: Date.now(), thanksRead: true } };
    saveState();
  });
  await page.waitForTimeout(20);
  await home(page);
  await expect(talk(page)).toHaveCount(0);
  await arrive(page, "full");
  await home(page);
  await expect(talk(page)).toHaveCount(1);
  expect(errors).toEqual([]);
});
