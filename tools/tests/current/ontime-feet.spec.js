// ミナのアビリティ「間に合う足」（仮の名前。2026-10-30・EX-167【3】）。中身は data-bonds.js の masterAbilities.ontime_feet。
// ★ 開く：急ぎの印の一通の感謝を読んだとき。名簿のミナの頁に名前が出る。
// ★ 効く：特殊裁定のミナ①「届け切る」の取引で、「本人の負傷が増える」側だけが抽選で外れる（仮の割合）。
//   結末が上がる側・取引が成立する条件は変えない。外れた回は取引の結果の一行を出さない。
// ★ 持たない状態では、報告書は1文字も動かない。
const { test, expect } = require("@playwright/test");
const { freshPage, interview } = require("../helpers/app");

// 届け切るが引ける依頼（配達）を、フックを必ず引く旗つきで回す。ability の有無だけを変える
const run = (page, withAbility) => page.evaluate((withAbility) => {
  const rows = [];
  for (const questId of ["quest_letter", "quest_herb_delivery"]) for (let seed = 1; seed <= 80; seed++) {
    state.reports = []; state.reportMemos = []; state.worldState.totalExpeditions = 0;
    const r = generateReport({ questId, adventurerIds: ["adv_mina", "adv_elne"], adventurerItemIds: {}, seed: seed * 7919, departTimeOfDay: "昼", departWeather: "小雨",
      startTime: 0, durationMs: 1, mockForceHooks: true, ...(withAbility ? { abilities: ["ontime_feet"] } : {}) });
    const fw = r.hiddenTags.fieldwork ?? {};
    rows.push({ result: r.result, body: r.logs.map((l) => l.text), hook: fw.hook ?? null, trade: fw.hookTrade ?? null, eased: fw.hookEased === true,
      injured: injuryLevelFromHpRatio((r.hiddenTags.battleHpRatios ?? {}).adv_mina ?? 1, false) != null });
  }
  return rows;
}, withAbility);
const TRADE_LINE = /帰り道になってようやく自分の足の傷に気づいた|帰り道はほかの者に肩を借りた/;

test("感謝を読むと開き、名簿のミナの頁に「間に合う足」が出る", async ({ page }) => {
  const errors = await freshPage(page);
  await interview(page, "カズ");
  await page.evaluate(() => { state.bondChain = { started: true, bond_mina: { consultRead: true, thanksAt: 1 } }; saveState(); });
  expect(await page.evaluate(() => ownedAbilityIds("adv_mina"))).toEqual([]);
  await page.evaluate(() => dismissBondTalk("bond_mina", "thanks"));
  await page.reload(); await page.waitForTimeout(300);
  await page.evaluate(() => { setRoute("adventurers"); editAdventurer("adv_mina"); });
  await expect(page.locator("[data-abilities]")).toContainText("間に合う足");
  expect(errors).toEqual([]);
});

test("持つと、取引の成立と結末は同じまま、本人の負傷が増えない回が出る（その回は結果の一行を出さない）", async ({ page }) => {
  const errors = await freshPage(page);
  const without = await run(page, false);
  const withA = await run(page, true);
  const traded = without.filter((r) => r.hook === "mina_deliver" && r.trade);
  expect(traded.length, "取引が成立する回がある").toBeGreaterThan(10);
  let eased = 0;
  without.forEach((a, i) => {
    const b = withA[i];
    expect(b.result, "結末は変わらない").toBe(a.result);
    expect(b.trade, "取引の成立は変わらない").toBe(a.trade);
    if (!(a.hook === "mina_deliver" && a.trade)) { expect(b).toEqual(a); return; }
    expect(a.injured, "持たないときは成立すれば必ず負傷").toBe(true);
    if (b.eased) {
      eased += 1;
      expect(b.injured).toBe(false);
      expect(b.body.some((t) => TRADE_LINE.test(t)), "負傷しなかった回に傷の一行を出さない").toBe(false);
      expect(b.body).toEqual(a.body.filter((t) => !TRADE_LINE.test(t)));
    } else {
      expect(b).toEqual(a);
    }
  });
  expect(eased, "外れる回がある").toBeGreaterThan(0);
  expect(eased, "全部は外れない").toBeLessThan(traded.length);
  expect(errors).toEqual([]);
});
