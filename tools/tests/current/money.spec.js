// 金（2026-09-23・EX-144）。★ 受け入れテスト（acceptance/money.spec.js）から、実装したものを1本ずつ移してきた。
//   ★ ここにあるものは**今通るべきもの**。赤は退行の合図。
//   ⚠️ **値そのものは判定しない**（すべて仮置き。制作の最後に作者が調整する）。
//     値は data-money.js／依頼データから読み、「その値どおりに動いているか」だけを見る。
const { test, expect } = require("@playwright/test");
const { freshPage, interview, seedClearedQuests, departQuest, waitForReturn } = require("../helpers/app");
const { settleExpedition, setMoney, spend } = require("../helpers/money");

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

test.describe("借金", () => {
  test("所持金がマイナスになったら借りられる（そのとき借入イベントが出る）", async ({ page }) => {
    const errors = await freshPage(page);
    await interview(page);
    await seedClearedQuests(page, ["quest_tavern_errand", "quest_guild_cleanup"]);
    const fee = await page.evaluate(() => questFee(getQuest("quest_old_house_cleanup")));
    await setMoney(page, fee - 5); // 出発すると 5 だけ足りない
    await departQuest(page, "廃屋の片付け", "等倍");
    const got = await page.evaluate(() => ({ debt: JSON.parse(JSON.stringify(state.debt)), events: state.moneyEvents }));
    expect(got.debt.timesBorrowed).toBe(1);
    expect(got.events[0].kind).toBe("borrow");
    // ホームで受付嬢が言う
    await expect(page.locator(".money-event-card")).toBeVisible();
    await page.getByRole("button", { name: "わかりました" }).click();
    await expect(page.locator(".money-event-card")).toHaveCount(0);
    expect(errors, errors.join(" | ")).toEqual([]);
  });

  test("借りた直後の所持金が正である（細則1：赤字額＋余裕を借りる）", async ({ page }) => {
    await freshPage(page);
    await interview(page);
    // 赤字の深さを変えても、借りた直後は必ず正
    for (const deficit of [1, 37, 500]) {
      await page.evaluate(() => { state.debt = { active: null, timesBorrowed: 0 }; state.gameOver = null; state.moneyEvents = []; });
      await setMoney(page, 0);
      const got = await spend(page, deficit);
      expect(got.gameOver).toBe(null);
      expect(got.money).toBeGreaterThan(0);
      expect(got.debt.active.remaining).toBe(deficit + (await page.evaluate(() => window.masterMoneyRules.borrowMargin)));
    }
  });

  test("返済は自動（報酬から天引きされる）", async ({ page }) => {
    await freshPage(page);
    await interview(page);
    await setMoney(page, 0);
    const borrowed = (await spend(page, 1)).debt.active.remaining;
    const got = await settleExpedition(page, { questId: "quest_old_house_cleanup", tier: "full" });
    const after = await page.evaluate(() => ({ debt: JSON.parse(JSON.stringify(state.debt)), ledger: state.moneyLedger.map((e) => e.label) }));
    const repaid = Math.min(got.reward, borrowed);
    expect(after.debt.active ? after.debt.active.remaining : 0).toBe(borrowed - repaid);
    // ★ 帳簿で天引きが見える：報酬の行のすぐ後に返済の行
    expect(after.ledger.slice(0, 2)).toEqual(["返済", "報酬"]);
    expect(got.moneyAfter).toBe(got.moneyBefore - got.fee + got.reward - repaid);
  });

  test("返済するまで次を借りられない（同時に抱えられる借金は1つ）", async ({ page }) => {
    await freshPage(page);
    await interview(page);
    await setMoney(page, 0);
    await spend(page, 1);                         // 1回目を借りる
    const money = await page.evaluate(() => state.money);
    const got = await spend(page, money + 1);     // 返す前に、また赤字
    expect(got.debt.timesBorrowed, "2回目を借りてはいけない").toBe(1);
    expect(got.gameOver).not.toBe(null);          // ＝運営不能の条件①
  });

  test("借金はゲーム全体で2回まで（3回目は借りられない）", async ({ page }) => {
    await freshPage(page);
    await interview(page);
    for (let i = 1; i <= 2; i++) {
      await setMoney(page, 0);
      await spend(page, 1);
      // 完済させる
      await page.evaluate(() => { const a = state.debt.active; receiveReward(a.remaining, "テスト"); });
      expect(await page.evaluate(() => state.debt.active)).toBe(null);
    }
    await setMoney(page, 0);
    const got = await spend(page, 1);
    expect(got.debt.timesBorrowed).toBe(2);
    expect(got.gameOver).not.toBe(null);
  });

  test("2回目の借金をした時点で受付嬢との会話イベントが出る", async ({ page }) => {
    await freshPage(page);
    await interview(page);
    await setMoney(page, 0);
    await spend(page, 1);
    await page.evaluate(() => { receiveReward(state.debt.active.remaining, "テスト"); state.moneyEvents = []; });
    await setMoney(page, 0);
    await spend(page, 1);
    const got = await page.evaluate(() => ({ ev: state.moneyEvents[0], want: window.masterMoneyRules.texts.borrowSecond, first: window.masterMoneyRules.texts.borrowFirst }));
    expect(got.ev.count).toBe(2);
    expect(got.ev.text).toBe(got.want);
    expect(got.ev.text).not.toBe(got.first);
    await page.evaluate(() => setRoute("home"));
    await expect(page.locator(".money-event-card .speech")).toHaveText(got.want);
  });
});

test.describe("運営不能", () => {
  test("条件①：借金中にさらにマイナスになったら運営不能", async ({ page }) => {
    await freshPage(page);
    await interview(page);
    await setMoney(page, 0);
    await spend(page, 1);
    const got = await spend(page, (await page.evaluate(() => state.money)) + 1);
    expect(got.gameOver).not.toBe(null);
    // ★ 運営不能になったら、もう誰も送り出せない
    await page.evaluate(() => setRoute("home"));
    await expect(page.locator(".game-over-card")).toBeVisible();
  });

  test("条件②：1回借りて返済し、2回目を借りたあと再びマイナスで運営不能", async ({ page }) => {
    await freshPage(page);
    await interview(page);
    // 1回目を借りて返す
    await setMoney(page, 0);
    await spend(page, 1);
    await page.evaluate(() => receiveReward(state.debt.active.remaining, "テスト"));
    // 2回目を借りる——★ ここまでは許す（運営不能にならない）
    await setMoney(page, 0);
    const second = await spend(page, 1);
    expect(second.gameOver).toBe(null);
    expect(second.debt.timesBorrowed).toBe(2);
    // 2回目も返しきってから、再びマイナス
    await page.evaluate(() => receiveReward(state.debt.active.remaining, "テスト"));
    await setMoney(page, 0);
    const got = await spend(page, 1);
    expect(got.gameOver).not.toBe(null);
  });

  test("運営不能になったら直前（最後に綴じた記録）からやり直せる", async ({ page }) => {
    const errors = await freshPage(page);
    await interview(page);
    const moneyAtBind = await page.evaluate(() => { bindRecord(); return state.money; });
    await setMoney(page, 0);
    await spend(page, 1);
    await spend(page, 10_000);
    expect(await page.evaluate(() => state.gameOver)).not.toBe(null);
    await page.evaluate(() => setRoute("home"));
    // ★ 本番の入口（加速していなくても出る）。確認を挟む
    await page.locator(".game-over-card").getByRole("button", { name: "最後に綴じた記録まで戻る" }).click();
    await page.locator(".game-over-card").getByRole("button", { name: "戻る" }).click();
    const got = await page.evaluate(() => ({ gameOver: state.gameOver, money: state.money, debt: state.debt }));
    expect(got.gameOver).toBe(null);
    expect(got.money).toBe(moneyAtBind);
    expect(got.debt.timesBorrowed).toBe(0);
    await expect(page.locator(".game-over-card")).toHaveCount(0);
    expect(errors, errors.join(" | ")).toEqual([]);
  });
});

test.describe("遠征費で割り込む", () => {
  test("遠征費で所持金を割り込む出発ができる（出発した瞬間に借金イベント）", async ({ page }) => {
    const errors = await freshPage(page);
    await interview(page);
    await seedClearedQuests(page, ["quest_tavern_errand", "quest_guild_cleanup"]);
    await setMoney(page, 0);
    await departQuest(page, "廃屋の片付け", "等倍");
    const got = await page.evaluate(() => ({ exp: getExpeditions().length, borrowed: state.debt.timesBorrowed, money: state.money, reports: state.reports.length }));
    // ★ 止めない：出発できている／帰還を待たずに借りている
    expect(got.exp).toBe(1);
    expect(got.borrowed).toBe(1);
    expect(got.money).toBeGreaterThan(0);
    await expect(page.locator(".money-event-card")).toBeVisible();
    expect(errors, errors.join(" | ")).toEqual([]);
  });

  test("同時遠征の遠征費は1本ずつ引いて判定し、落ちた1本で止まる", async ({ page }) => {
    const errors = await freshPage(page);
    await interview(page);
    await seedClearedQuests(page, ["quest_tavern_errand", "quest_guild_cleanup"]);
    const fees = await page.evaluate(() => ({ a: questFee(getQuest("quest_old_house_cleanup")), b: questFee(getQuest("quest_wedding_support")) }));
    await setMoney(page, fees.a + 3); // 1本目は払える／2本目で割り込む
    await departQuest(page, "廃屋の片付け", "等倍");
    const afterA = await page.evaluate(() => ({ money: state.money, borrowed: state.debt.timesBorrowed }));
    expect(afterA).toEqual({ money: 3, borrowed: 0 });
    await departQuest(page, "結婚式の手伝い", "等倍");
    const afterB = await page.evaluate(() => ({ exp: getExpeditions().length, borrowed: state.debt.timesBorrowed, ledger: state.moneyLedger.slice(0, 2).map((e) => e.label) }));
    expect(afterB.exp).toBe(2);
    expect(afterB.borrowed).toBe(1);
    // ★ 借りたのは2本目の遠征費を払った直後
    expect(afterB.ledger).toEqual(["借入", "遠征費"]);
    expect(errors, errors.join(" | ")).toEqual([]);
  });
});
