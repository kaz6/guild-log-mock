// 金（2026-09-23・EX-144）。★ 受け入れテスト（acceptance/money.spec.js）から、実装したものを1本ずつ移してきた。
//   ★ ここにあるものは**今通るべきもの**。赤は退行の合図。
//   ⚠️ **値そのものは判定しない**（すべて仮置き。制作の最後に作者が調整する）。
//     値は data-money.js／依頼データから読み、「その値どおりに動いているか」だけを見る。
const { test, expect } = require("@playwright/test");
const { freshPage, interview, seedClearedQuests, departQuest, waitForReturn } = require("../helpers/app");
const { settleExpedition } = require("../helpers/money");

test.describe("所持金", () => {
  test("金ははじめからある（初期所持金が正）", async ({ page }) => {
    const errors = await freshPage(page);
    await interview(page);
    const got = await page.evaluate(() => ({ money: state.money, initial: window.masterMoneyRules.initialMoney }));
    expect(got.money).toBeGreaterThan(0);
    expect(got.money).toBe(got.initial);
    // ホームに所持金が出ている
    expect(await page.locator(".wallet-card [data-money]").getAttribute("data-money")).toBe(String(got.initial));
    expect(errors, errors.join(" | ")).toEqual([]);
  });

  test("酒場の買い出し（就任祝い）で所持金が減る——最初に見る金の動きは支出", async ({ page }) => {
    const errors = await freshPage(page);
    await interview(page);
    const before = await page.evaluate(() => ({ money: state.money, fee: getQuest("quest_tavern_errand").money.fee, ledger: state.moneyLedger.length }));
    expect(before.ledger, "酒場の前に帳簿の行があってはいけない").toBe(0);
    const { reportsBefore } = await departQuest(page, "隣の酒場に買い出し", "60倍");
    await waitForReturn(page, reportsBefore, 20_000);
    const after = await page.evaluate(() => ({ money: state.money, ledger: state.moneyLedger.map((e) => ({ amount: e.amount, label: e.label })) }));
    expect(after.money).toBe(before.money - before.fee);
    // ★ 帳簿の最初の1行（＝最も古い行）が「酒樽の代金」の支出で、報酬の行は無い
    expect(after.ledger.at(-1)).toEqual({ amount: -before.fee, label: "酒樽の代金" });
    expect(after.ledger.some((e) => e.amount > 0), "酒場で報酬が入ってはいけない").toBe(false);
    expect(errors, errors.join(" | ")).toEqual([]);
  });
});

test.describe("遠征費", () => {
  test("出発時に距離で決まる固定額が引かれる（プレイヤーは選べない）", async ({ page }) => {
    const errors = await freshPage(page);
    await interview(page);
    // 例外（依頼データの money.fee）を持たない依頼は、すべて帯の表どおり
    const mismatch = await page.evaluate(() => window.masterQuests
      .filter((q) => typeof q.money?.fee !== "number")
      .map((q) => ({ id: q.id, fee: questFee(q), want: window.masterMoneyRules.feeByBandLabel[QUEST_DURATION_BANDS[q.durationBand].label] }))
      .filter((r) => r.fee !== r.want || !(r.fee > 0)));
    expect(mismatch).toEqual([]);

    // 実際に出発した瞬間に引かれる（帰還を待たない）
    await seedClearedQuests(page, ["quest_tavern_errand", "quest_guild_cleanup"]);
    const before = await page.evaluate(() => ({ money: state.money, fee: questFee(getQuest("quest_old_house_cleanup")) }));
    await departQuest(page, "廃屋の片付け", "等倍");
    const after = await page.evaluate(() => state.money);
    expect(after).toBe(before.money - before.fee);
    // ★ 選べない：出発の画面に金額を変える入力が無い
    await page.evaluate(() => setRoute("quests"));
    expect(await page.locator("input[name*='fee'], input[data-fee], select[data-fee]").count()).toBe(0);
    expect(errors, errors.join(" | ")).toEqual([]);
  });

  test("失敗したら遠征費だけが減った状態になる（報酬は入らない）", async ({ page }) => {
    const errors = await freshPage(page);
    await interview(page);
    // ★ 結末は乱数で決まるので、対比較の基準から「未達になる組」を引いて同じ遠征を作る
    const got = await settleExpedition(page, { questId: "quest_wedding_support", tier: "fail" });
    expect(got.tier).toBe("fail");
    expect(got.reward).toBe(0);
    expect(got.moneyAfter).toBe(got.moneyBefore - got.fee);
    expect(errors, errors.join(" | ")).toEqual([]);
  });

  test("報酬は遠征費 × 結末の段の倍率（完遂／部分）", async ({ page }) => {
    const errors = await freshPage(page);
    await interview(page);
    const rules = await page.evaluate(() => window.masterMoneyRules.rewardMultiplierByTier);
    for (const tier of ["full", "partial"]) {
      const got = await settleExpedition(page, { questId: "quest_old_house_cleanup", tier });
      expect(got.tier).toBe(tier);
      expect(got.reward).toBe(Math.round(got.fee * rules[tier]));
      expect(got.moneyAfter).toBe(got.moneyBefore - got.fee + got.reward);
    }
    expect(errors, errors.join(" | ")).toEqual([]);
  });
});
