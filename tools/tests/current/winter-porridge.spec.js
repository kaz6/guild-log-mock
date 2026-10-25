// 鉄鍋のアビリティ「冬越えの粥」（EX-165 の追加）。中身は data-bonds.js の masterAbilities。
// ★ 開く：宿場の粥の塩の感謝を読んだとき。state.abilities に立てる（リロードで残る）。名簿の鉄鍋の頁に名前が出る。
// ★ 効く：場所のタグが「遠出」（data-quests.js の masterPlaces）で疲労の仕組みがある依頼、かつ出発のときに遠征へ写した回だけ。
//   疲労が少し軽くなり、報告書に1行。
// ★ 近場の用事と戦闘の依頼には効かない（行も出ない・報告書は1字も変わらない）。【鉄鍋】はあだ名に追従。
const { test, expect } = require("@playwright/test");
const { freshPage, interview } = require("../helpers/app");

const LINE = /冬越えの粥を配った|鍋の粥をかき混ぜていた/;
// 遠征を直に作って報告書を生成する（出発の写しの有無だけを変える）
const gen = (page, questId, ids, withAbility, seed = 1) => page.evaluate(({ questId, ids, withAbility, seed }) => {
  const r = generateReport({ questId, adventurerIds: ids, adventurerItemIds: {}, seed, departTimeOfDay: "昼", departWeather: "晴れ", startTime: 0, durationMs: 1, ...(withAbility ? { abilities: ["winter_porridge"] } : {}) });
  return r.logs.map((l) => l.text);
}, { questId, ids, withAbility, seed });

test("感謝を読むと開き、リロードで残り、名簿の鉄鍋の頁にだけ名前が出る。固有依頼の金は0のまま", async ({ page }) => {
  const errors = await freshPage(page);
  await interview(page, "カズ");
  expect(await page.evaluate(() => ({ ...getQuest("quest_bond_gadd").money }))).toEqual({ fee: 0, reward: 0 });
  await page.evaluate(() => { state.bondChain = { started: true, bond_gadd: { consultRead: true, thanksAt: 1 } }; saveState(); });
  expect(await page.evaluate(() => ownedAbilityIds("adv_gadd"))).toEqual([]);
  await page.evaluate(() => dismissBondTalk("bond_gadd", "thanks"));
  await page.reload(); await page.waitForTimeout(300);
  expect(await page.evaluate(() => state.abilities.winter_porridge.adventurerId)).toBe("adv_gadd");
  const detail = async (id) => {
    await page.evaluate((id) => { setRoute("adventurers"); editingAdventurerId = id; render(); }, id);
    await page.waitForTimeout(100);
    return page.locator("[data-abilities]");
  };
  await expect(await detail("adv_gadd")).toContainText("冬越えの粥");
  await expect(await detail("adv_mina")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("出発のときに写す：持ち主が編成にいる回だけ abilities が付く。持っていなければ鍵ごと無い", async ({ page }) => {
  const errors = await freshPage(page);
  await interview(page, "カズ");
  const depart = (ids) => page.evaluate((ids) => {
    state.expeditions = []; state.adventurers.forEach((a) => { a.status = "待機中"; }); state.money = 100000;
    selectQuest("quest_herb"); selectedAdventurerIds = ids; startExpedition();
    return state.expeditions[0] ?? null;
  }, ids);
  expect((await depart(["adv_gadd", "adv_mina"])).abilities, "持っていない").toBeUndefined();
  await page.evaluate(() => { state.abilities = { winter_porridge: { adventurerId: "adv_gadd", at: 1 } }; saveState(); });
  expect((await depart(["adv_gadd", "adv_mina"])).abilities).toEqual(["winter_porridge"]);
  expect((await depart(["adv_mina", "adv_row"])).abilities, "鉄鍋がいない").toBeUndefined();
  expect(errors).toEqual([]);
});

test("全依頼に場所のタグ（place）があり、タグはどれも近場か遠出に割り当てられている（書き忘れたら落ちる）", async ({ page }) => {
  const errors = await freshPage(page);
  const bad = await page.evaluate(() => masterQuests.filter((q) => !["近場", "遠出"].includes(questReach(q))).map((q) => `${q.id}:${q.place}`));
  expect(bad).toEqual([]);
  const tags = await page.evaluate(() => Object.entries(window.masterPlaces));
  expect(tags.every(([, v]) => v === "近場" || v === "遠出")).toBe(true);
  expect(errors).toEqual([]);
});

test("効く依頼の一覧＝遠出 ∧ 疲労の仕組みがある（工程エンジンを通る）依頼。手紙が入り、小橋は外れる", async ({ page }) => {
  const errors = await freshPage(page);
  const got = await page.evaluate(() => masterQuests.filter((q) => {
    const on = generateReport({ questId: q.id, adventurerIds: ["adv_gadd", "adv_mina"], adventurerItemIds: {}, seed: 1, departTimeOfDay: "昼", departWeather: "晴れ", startTime: 0, durationMs: 1, abilities: ["winter_porridge"] });
    return on.logs.some((l) => /冬越えの粥を配った|鍋の粥をかき混ぜていた/.test(l.text));
  }).map((q) => q.id).sort());
  expect(got).toEqual([
    "quest_caravan_lastchance", "quest_caravan_search", "quest_church_patrol", "quest_herb", "quest_herb_delivery",
    "quest_letter", "quest_missing_herbalist", "quest_old_stele_rubbing", "quest_signpost", "quest_unknown_grass"
  ]);
  expect(errors).toEqual([]);
});

test("粥を配った回は「温かいものはない」の類を書かない（薬草採集・道標・手紙）", async ({ page }) => {
  const errors = await freshPage(page);
  for (const q of ["quest_herb", "quest_signpost", "quest_letter"]) for (let seed = 0; seed < 40; seed++) {
    const on = await gen(page, q, ["adv_gadd", "adv_mina", "adv_row"], true, seed);
    expect(on.some((t) => LINE.test(t)), `${q} seed${seed}：効く`).toBe(true);
    expect(on.some((t) => /温かいものはない|温かいものもない|火も焚けない|冷えた食事/.test(t)), `${q} seed${seed}`).toBe(false);
  }
  expect(errors).toEqual([]);
});

test("効く依頼では行が出て疲労が軽くなる。町なかの用事では行も効果も無く、報告書が1字も変わらない", async ({ page }) => {
  const errors = await freshPage(page);
  for (const q of ["quest_herb", "quest_church_patrol", "quest_caravan_search", "quest_letter"]) {
    const on = await gen(page, q, ["adv_gadd", "adv_mina"], true);
    expect(on.filter((t) => LINE.test(t)), `${q}：1行だけ`).toHaveLength(1);
    expect((await gen(page, q, ["adv_gadd", "adv_mina"], false)).some((t) => LINE.test(t)), `${q}：持っていなければ出ない`).toBe(false);
    expect((await gen(page, q, ["adv_mina", "adv_row"], true)).some((t) => LINE.test(t)), `${q}：鉄鍋がいなければ出ない`).toBe(false);
  }
  // 疲労：同じ種で、効いた回は工程の疲労が小さい
  const fatigue = await page.evaluate(() => {
    const party = ["adv_gadd", "adv_mina"].map(getAdventurer);
    const q = getQuest("quest_herb");
    const run = (scale) => simulateFieldwork(q, party, [], makeRng(7), scale ? { fatigueScale: scale } : {}).fatigue;
    return { off: run(null), on: run(window.masterAbilities.winter_porridge.fatigueStepScale) };
  });
  expect(fatigue.on).toBeLessThan(fatigue.off);
  for (const q of ["quest_tavern_errand", "quest_wedding_support", "quest_evening_market_escort", "quest_old_house_cleanup", "quest_old_bridge_repair", "quest_caravan_escort", "quest_lingering_light"]) {
    for (const seed of [1, 2, 3]) {
      const on = await gen(page, q, ["adv_gadd", "adv_mina"], true, seed);
      const off = await gen(page, q, ["adv_gadd", "adv_mina"], false, seed);
      expect(on, `${q} seed${seed}：効かない依頼は報告書が同じ`).toEqual(off);
      expect(on.some((t) => LINE.test(t))).toBe(false);
    }
  }
  expect(errors).toEqual([]);
});

test("行の【鉄鍋】はあだ名に追従する", async ({ page }) => {
  const errors = await freshPage(page);
  await page.evaluate(() => { getAdventurer("adv_gadd").nickname = "ナベさん"; saveState(); });
  for (const seed of [1, 2]) {
    const line = (await gen(page, "quest_herb", ["adv_gadd", "adv_mina"], true, seed)).find((t) => LINE.test(t));
    expect(line).toContain("ナベさん");
    expect(line).not.toContain("鉄鍋");
  }
  expect(errors).toEqual([]);
});
