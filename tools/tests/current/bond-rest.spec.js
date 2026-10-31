// 固有依頼の連鎖の残り3人：エルネ・ロウ・エルシー（2026-10-31・EX-171）。文面は data-bonds.js（台本「3. エルネ」「4. ロウ」「5. エルシー」の確定稿）。
// ★ 順番：鉄鍋 → ミナ → エルネ → ロウ → エルシー。エルシーの感謝で連鎖は終わる（受付嬢は固有依頼なし）。
// ★ 次の人の相談：前の人の感謝のあと、未達でない報告書がもう1通届いたとき1度だけ。
// ★ 固有依頼：6枠の外に1枠・定型の報告書・費用0・報酬0・観察対象なし。本人と人間もう1人以上（エルシーは「エルシーと人間1人以上」）。
// ★ エルシーの相談と感謝は行ごとに話し手（受付嬢／地の文）。エルシーは話さない。【名前】の札はすべてあだ名に追従。
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
const CHAIN = ["bond_gadd", "bond_mina", "bond_elne", "bond_row", "bond_elsie"];
// done より前の人の3拍を済ませた状態（最後の人の感謝は今読んだ）
async function setup(page, done, name = "カズ") {
  const errors = await freshPage(page);
  await interview(page, name);
  await seedClearedQuests(page, ["quest_tavern_errand", "quest_guild_cleanup"]);
  await page.evaluate((done) => {
    state.receptionTalks = { sixOpen: { at: 1, read: true }, firstSix: { at: 1, read: true } };
    state.bondChain = { started: true };
    done.forEach((id, i) => {
      state.bondChain[id] = { consultAt: 1, consultRead: true, thanksAt: 2 };
      if (i < done.length - 1) Object.assign(state.bondChain[id], { thanksRead: true, thanksReadAt: 3 });
    });
    saveState();
    if (done.length > 0) dismissBondTalk(done[done.length - 1], "thanks");
  }, done);
  await page.waitForTimeout(20);
  return errors;
}
const arrive = (page, tier = "full") => page.evaluate((tier) => {
  const r = generateReport({ questId: "quest_herb", adventurerIds: ["adv_gadd"], adventurerItemIds: {}, seed: 77, departTimeOfDay: "昼", departWeather: "晴れ", startTime: 0, durationMs: 1 });
  r.result = Object.keys(GROWTH_TIER_BY_RESULT).find((k) => GROWTH_TIER_BY_RESULT[k] === tier);
  state.reports.unshift(r); saveState();
}, tier);
const returnBond = (page, questId, ids) => page.evaluate(({ questId, ids }) => {
  const r = generateReport({ questId, adventurerIds: ids, adventurerItemIds: {}, seed: 1, departTimeOfDay: "昼", departWeather: "晴れ", startTime: 0, durationMs: 1 });
  r.id = `report_${questId}`; r.opened = true; state.reports.unshift(r); saveState();
  return { body: r.logs.map((l) => l.text).join("\n"), history: r.historyLine, title: r.title ?? null };
}, { questId, ids });
const stamp = async (page, questId) => {
  await page.evaluate((id) => { state.activeReportId = id; setRoute("report"); stampReport(id); }, `report_${questId}`);
  await page.waitForTimeout(100);
};

const PEOPLE = [
  {
    bond: "bond_elne", quest: "quest_bond_elne", adv: "adv_elne", name: "エルネ", title: "日陰の草の言い伝え", reach: "遠出", place: "森",
    party: ["adv_elne", "adv_gadd"],
    consult: ["カズさん、少しお時間をいただけますか。", "この先の森なら、あるかもしれません。確かめに行きたいんです。手順は、全部書いてきました。"],
    body: ["一行は、エルネの書いた手順どおりに森へ入った。", "帰り道、エルネは帳面を胸に抱えたまま、一度も開かなかった。"],
    thanks: ["付き合ってくださって、ありがとうございました。", "いつか誰かが続きを書けますから。"]
  },
  {
    bond: "bond_row", quest: "quest_bond_row", adv: "adv_row", name: "ロウ", title: "閉じた門", reach: "遠出", place: "生活圏の外縁",
    party: ["adv_row", "adv_mina"],
    consult: ["あ、あの、カズさん……少し、いいですか。", "……一度だけ、見に行きたいんです。ひとりだと、帰り道が、怖くて。"],
    body: ["一行は、ロウの案内で南東の外れの町へ向かった。", "それから、鍵を開け、かんぬきを外し、門を開けた。", "帰り道、ロウは一度だけ振り返り、それきり前を向いて歩いた。"],
    thanks: ["あ、ありがとうございました。……門、開けてきました。", "……ここに、帰ってきても、いいですよね？"]
  },
  {
    bond: "bond_elsie", quest: "quest_bond_elsie", adv: "adv_elsie", name: "エルシー", title: "エルシーと過ごす一日", reach: "近場", place: "村",
    party: ["adv_elsie", "adv_row"],
    consult: ["受付嬢：エルシー、おいで。", "呼ばれたエルシーは、大きい耳をピン！と立てた。", "受付嬢：カズさん、今日は一日、この子と過ごしてあげてくれませんか？"],
    body: ["町を出る間、エルシーは一軒一軒を見て回っていた。", "ギルドの扉の前で、エルシーは全員が中に入るまで動かなかった。"],
    thanks: ["エルシーはカズの足元で丸くなり、満足そうに、ひとつ大きく息をついた。", "受付嬢：ありがとうって言ってますよ。"]
  }
];

for (const p of PEOPLE) {
  const before = CHAIN.slice(0, CHAIN.indexOf(p.bond));
  test(`${p.name}：前の人の感謝のあと1通待って相談が1度だけ出る→頼まれごと→封で感謝が1度だけ`, async ({ page }) => {
    const errors = await setup(page, before);
    await home(page);
    await expect(talk(page), "感謝の直後には出ない").toHaveCount(0);
    await arrive(page, "fail");
    await home(page);
    await expect(talk(page), "未達は数えない").toHaveCount(0);
    await arrive(page, "full");
    await home(page);
    await expect(talk(page)).toHaveCount(1);
    const consult = await readTalk(page);
    expect(consult.split("\n")[0], "見出し（エルシーは受付嬢）").toBe(p.adv === "adv_elsie" ? "受付嬢" : p.name);
    p.consult.forEach((line) => expect(consult).toContain(line));
    expect(consult).not.toContain("【");
    expect(consult).not.toContain("地の文");
    // 頼まれごと（6枠の外に1枠）
    await page.evaluate(() => setRoute("quests"));
    const card = page.locator("[data-bond-board] .quest-card");
    await expect(card).toHaveCount(1);
    await expect(card).toContainText(p.title);
    const q = await page.evaluate((id) => { const q = getQuest(id); return { reach: questReach(q), place: q.place, money: q.money, obs: q.observationTarget, req: q.requiresAdventurer }; }, p.quest);
    expect(q).toEqual({ reach: p.reach, place: p.place, money: { fee: 0, reward: 0 }, obs: "なし", req: p.adv });
    const r = await returnBond(page, p.quest, p.party);
    p.body.forEach((line) => expect(r.body).toContain(line));
    expect(r.body).not.toContain("【");
    await home(page);
    await expect(talk(page), "封の前は感謝が出ない").toHaveCount(0);
    await stamp(page, p.quest);
    await expect(talk(page), "封をした報告書の画面に出る").toHaveCount(1);
    await home(page);
    const thanks = await readTalk(page);
    p.thanks.forEach((line) => expect(thanks).toContain(line));
    await page.reload(); await page.waitForTimeout(300); await home(page);
    await expect(talk(page), "感謝は1度だけ").toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

test("連鎖は5人で終わる：エルシーの感謝のあと報告書が何通届いても、相談も頼まれごとも出ない", async ({ page }) => {
  const errors = await setup(page, CHAIN);
  for (let i = 0; i < 3; i++) await arrive(page, "full");
  await page.reload(); await page.waitForTimeout(300); await home(page);
  await expect(talk(page)).toHaveCount(0);
  await page.evaluate(() => setRoute("quests"));
  await expect(page.locator("[data-bond-board]")).toHaveCount(0);
  expect(await page.evaluate(() => bondChainEntries().map((e) => e.id))).toEqual(CHAIN);
  expect(await page.evaluate(() => bondChainEntries().every((e) => e.consult && e.thanks && e.questId))).toBe(true);
  expect(await page.evaluate(() => bondChainEntries().some((e) => e.adventurerId === "reception"))).toBe(false);
  expect(errors).toEqual([]);
});

test("編成：エルネ・ロウは本人と人間もう1人以上、エルシーはエルシーと人間1人以上", async ({ page }) => {
  const errors = await setup(page, []);
  const can = (questId, ids) => page.evaluate(({ questId, ids }) => { selectQuest(questId); selectedAdventurerIds = ids; render(); return expeditionBlockedMessage(ids); }, { questId, ids });
  expect(await can("quest_bond_elne", ["adv_elne"])).toContain("エルネのほかに、人がもう1人要る依頼です");
  expect(await can("quest_bond_elne", ["adv_elne", "adv_elsie"])).toContain("エルネのほかに、人がもう1人要る依頼です");
  expect(await can("quest_bond_elne", ["adv_elne", "adv_mina"])).toBeNull();
  expect(await can("quest_bond_row", ["adv_mina", "adv_gadd"])).toContain("ロウが必ず行く依頼です。");
  expect(await can("quest_bond_row", ["adv_row", "adv_gadd"])).toBeNull();
  expect(await can("quest_bond_elsie", ["adv_elsie"])).toContain("エルシーと一緒に行く人が1人要る依頼です。");
  expect(await can("quest_bond_elsie", ["adv_gadd"])).toContain("エルシーが必ず行く依頼です。");
  expect(await can("quest_bond_elsie", ["adv_elsie", "adv_gadd"])).toBeNull();
  await page.evaluate(() => { selectedAdventurerIds = []; render(); });
  expect(errors).toEqual([]);
});

test("【名前】はあだ名に追従：相談・頼まれごとの題名・報告書・感謝。報告書は作った時点で閉じる", async ({ page }) => {
  const errors = await setup(page, CHAIN.slice(0, 4));
  await page.evaluate(() => { getAdventurer("adv_elsie").nickname = "シロ"; saveState(); });
  await arrive(page, "full");
  await home(page);
  const consult = await readTalk(page);
  expect(consult).toContain("受付嬢：シロ、おいで。");
  expect(consult).toContain("呼ばれたシロは、大きい耳をピン！と立てた。");
  expect(consult).not.toContain("エルシー");
  await page.evaluate(() => setRoute("quests"));
  await expect(page.locator("[data-bond-board] .quest-card")).toContainText("シロと過ごす一日");
  const r = await returnBond(page, "quest_bond_elsie", ["adv_elsie", "adv_mina"]);
  expect(r.body).toContain("町を出る間、シロは一軒一軒を見て回っていた。");
  expect(r.body).not.toContain("エルシー");
  expect(r.title).toBe("シロと過ごす一日");
  expect(r.history).toBe("シロと過ごす一日：済ませた。");
  await page.evaluate(() => { getAdventurer("adv_elsie").nickname = "ポチ"; saveState(); });
  await stamp(page, "quest_bond_elsie");
  await expect(page.locator(".paper-title")).toHaveText("シロと過ごす一日");
  await home(page);
  const thanks = await readTalk(page);
  expect(thanks).toContain("ポチはカズの足元で丸くなり");
  const after = await page.evaluate(() => state.reports.find((x) => x.id === "report_quest_bond_elsie").logs.map((l) => l.text).join("\n"));
  expect(after, "報告書は作った時点の呼び名のまま").toContain("シロは一軒一軒");
  expect(errors).toEqual([]);
});

test("会話の文が窓に収まる（3人の相談と感謝・390px）", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const p of PEOPLE) {
    const before = CHAIN.slice(0, CHAIN.indexOf(p.bond));
    await setup(page, before);
    await arrive(page, "full");
    await home(page);
    for (const kind of ["consult", "thanks"]) {
      if (kind === "thanks") {
        await readTalk(page);
        await returnBond(page, p.quest, p.party);
        await stamp(page, p.quest);
        await home(page);
      }
      for (let i = 0; i < 6; i++) {
        const fits = await talk(page).locator(".speech-window").evaluate((el) => el.scrollHeight <= el.clientHeight + 1);
        expect(fits, `${p.name} ${kind} ${i + 1}ページ目`).toBe(true);
        const more = talk(page).locator(".window-next");
        if (!(await more.isVisible())) break;
        await more.click();
      }
    }
  }
});
