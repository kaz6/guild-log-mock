// 金（2026-09-23・EX-144）。★ 受け入れテスト（acceptance/money.spec.js）から、実装したものを1本ずつ移してきた。
//   ★ ここにあるものは**今通るべきもの**。赤は退行の合図。
//   ⚠️ **値そのものは判定しない**（すべて仮置き。制作の最後に作者が調整する）。
//     値は data-money.js／依頼データから読み、「その値どおりに動いているか」だけを見る。
const { test, expect } = require("@playwright/test");
const { freshPage, interview, seedClearedQuests, departQuest, waitForReturn } = require("../helpers/app");
const { settleExpedition, setMoney, spend, runShopping, setStock } = require("../helpers/money");

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

test.describe("在庫", () => {
  test("出撃の画面に金額を出さない（節約は買い物の段階でする）", async ({ page }) => {
    // ★ 出撃ごとに支給品代を計上すると「削れば安く済む＝裸で送り出すのが最適解」になる（設計ページ）。
    //   ★ 買う時点と持たせる時点を分けるので、持たせる画面には値段も所持金も出さない。
    const errors = await freshPage(page);
    await interview(page);
    // ★ 棚に品を置いてから見る（空の棚だと支給品のボタンが1つも出ず、検査が素通りする）
    await setStock(page, { item_bandage: 2, item_map: 1 });
    await page.evaluate(() => setRoute("quests"));
    await page.locator(".quest-card").first().click();
    await page.locator(".adventurer-card").first().click();
    const got = await page.evaluate(() => {
      const nodes = [...document.querySelectorAll(".item-card, .item-assign-btn, .assign-row .slot-label")];
      return {
        count: nodes.length,
        buttons: document.querySelectorAll(".item-assign-btn").length,
        // ★ 出してよい数字は「スロットN」と棚の残り「×N」だけ（どちらも金額ではない）
        withPrice: nodes.map((n) => n.innerText.replace(/スロット\d/g, "").replace(/×\d+/g, "")).filter((t) => /\d/.test(t)),
        dataPrice: document.querySelectorAll("[data-price]").length,
        wallet: document.querySelectorAll("#app .wallet-card, #app [data-money]").length
      };
    });
    expect(got.count, "支給品の欄が見つからない（画面の形が変わったなら、ここを直す）").toBeGreaterThan(0);
    expect(got.buttons, "棚に置いた品が枠に並んでいない").toBeGreaterThan(0);
    expect(got.withPrice).toEqual([]);
    expect(got.dataPrice).toBe(0);
    expect(got.wallet, "出撃の画面に所持金を出さない").toBe(0);
    expect(errors, errors.join(" | ")).toEqual([]);
  });

  test("在庫の上限は5（6個目を買えない）", async ({ page }) => {
    // ★ 上限は「ギルドの持ち物の総数」（棚＋持ち出している分）。値は data-money.js（仮置き）
    const errors = await freshPage(page);
    await interview(page);
    const limit = await page.evaluate(() => ({ code: STOCK_LIMIT, data: window.masterMoneyRules.stockLimit }));
    expect(limit.code).toBe(limit.data);
    expect(limit.code).toBe(5); // 設計ページ「上限は一旦5」
    await setStock(page, { item_bandage: 2, item_smoke: 2 }); // 4個。あと1つだけ買える
    const got = await runShopping(page, {
      party: ["adv_mina", "adv_gadd"],
      wishes: { adv_mina: ["item_bandage", "item_smoke"], adv_gadd: ["item_bandage", null] }
    });
    expect(got.error).toBeUndefined();
    expect(got.shopping.bought.length).toBe(1);
    expect(got.shopping.skipped.length).toBe(2);
    expect(got.owned).toBe(limit.code);
    // ★ 買えなかった分は払わない
    expect(got.moneyBefore - got.moneyAfter).toBe(got.fee + got.shopping.unitPrice * 1);
    expect(errors, errors.join(" | ")).toEqual([]);
  });

  test("在庫ははじめ空で、出撃の枠には棚にある物だけが並ぶ（出発で減り、帰れば戻る）", async ({ page }) => {
    const errors = await freshPage(page);
    await interview(page);
    expect(await page.evaluate(() => stockOwnedTotal())).toBe(0);
    await page.evaluate(() => setRoute("quests"));
    await page.locator(".quest-card").first().click();
    await page.locator(".adventurer-card").first().click();
    expect(await page.locator(".item-assign-btn").count(), "空の棚から持たせられてはいけない").toBe(0);

    await setStock(page, { item_map: 1 });
    await page.evaluate(() => setRoute("quests"));
    const names = await page.evaluate(() => [...document.querySelectorAll(".assign-row")][0]
      ? [...[...document.querySelectorAll(".assign-row")][0].querySelectorAll(".assign-slot")][0].innerText : "");
    expect(names).toContain("古地図");
    expect(names).not.toContain("包帯");
    // 1つしか無い品は、1枠に入れたらもう並ばない
    await page.locator(".item-assign-btn").first().click();
    expect(await page.evaluate(() => stockCount("item_map") - selectedItemCount("item_map"))).toBe(0);
    // 出発で棚から減り、帰還で戻る（古地図は道具＝使っても戻る）
    await page.evaluate(() => startExpedition());
    expect(await page.evaluate(() => ({ shelf: stockCount("item_map"), owned: stockOwnedTotal() }))).toEqual({ shelf: 0, owned: 1 });
    await page.evaluate(() => { state.expeditions.forEach((e) => { e.startTime = Date.now() - e.durationMs - 1_000; }); checkExpeditionCompletion(); });
    expect(await page.evaluate(() => stockCount("item_map"))).toBe(1);
    expect(errors, errors.join(" | ")).toEqual([]);
  });

  test("消耗品は使ったら戻らない／使わずに帰れば戻る／道具は戻る", async ({ page }) => {
    // ★ 設計ページに記述が無い＝実装側の判断（仮）。「使った」は報告書に実際に出た支給品で見る
    const errors = await freshPage(page);
    await interview(page);
    const got = await page.evaluate(() => {
      const exp = { questId: "quest_herb", adventurerIds: ["adv_mina"], stockDrawn: true,
        adventurerItemIds: { adv_mina: ["item_bandage", "item_map"], adv_gadd: ["item_smoke", "item_bandage"] } };
      const report = { money: {}, usedItemIds: ["item_bandage", "item_map"] };
      state.stock = {};
      returnItemsToStock(exp, report);
      return { stock: { ...state.stock }, consumed: report.money.consumed };
    });
    // 包帯は2つ持って出て1回使った＝1つ戻る／煙幕は使っていない＝戻る／古地図は道具＝戻る
    expect(got.stock).toEqual({ item_bandage: 1, item_map: 1, item_smoke: 1 });
    expect(got.consumed).toEqual(["item_bandage"]);
    expect(errors, errors.join(" | ")).toEqual([]);
  });
});

test.describe("買い出しクエスト", () => {
  test("隊商護衛をクリアすると解禁される", async ({ page }) => {
    const errors = await freshPage(page);
    await interview(page);
    const q = await page.evaluate(() => window.masterQuests.filter((x) => x.shopping).map((x) => x.unlockedBy));
    expect(q).toEqual(["quest_caravan_escort"]);
    expect(await page.evaluate(() => isQuestUnlocked(getQuest("quest_shopping"), getClearedQuestIds()))).toBe(false);
    await seedClearedQuests(page, ["quest_caravan_escort"]);
    expect(await page.evaluate(() => isQuestUnlocked(getQuest("quest_shopping"), getClearedQuestIds()))).toBe(true);
    expect(errors, errors.join(" | ")).toEqual([]);
  });

  test("交渉の高い者を送ると安く買える（値引きは最大2割）", async ({ page }) => {
    // 交渉値だけを変えた2回で、単価が下がること（額そのものは判定しない）
    const errors = await freshPage(page);
    await interview(page);
    const wishes = { adv_mina: ["item_bandage", null] };
    const low = await runShopping(page, { party: ["adv_mina"], wishes, negotiation: 0 });
    await setStock(page, {});
    const high = await runShopping(page, { party: ["adv_mina"], wishes, negotiation: 255 });
    const rules = await page.evaluate(() => window.masterMoneyRules);
    expect(low.shopping.unitPrice).toBe(rules.itemPrice);
    expect(high.shopping.unitPrice).toBeLessThan(low.shopping.unitPrice);
    // ★ 極端にはならない：最大の値引きでも (1 - shoppingDiscountMax) 倍まで
    expect(high.shopping.unitPrice).toBe(Math.round(rules.itemPrice * (1 - rules.shoppingDiscountMax)));
    expect(errors, errors.join(" | ")).toEqual([]);
  });

  test("荷物持ちは人数で決まる（多く連れて行けば多く買える）", async ({ page }) => {
    // ★ ステータスではなく人数。1人2枠なので、1人と3人で書き付けに書ける量が変わる
    const errors = await freshPage(page);
    await interview(page);
    const one = await runShopping(page, { party: ["adv_mina"], wishes: { adv_mina: ["item_bandage", "item_smoke"] } });
    await setStock(page, {});
    const three = await runShopping(page, {
      party: ["adv_mina", "adv_gadd", "adv_elne"],
      wishes: { adv_mina: ["item_bandage", "item_smoke"], adv_gadd: ["item_bandage", "item_smoke"], adv_elne: ["item_bandage", null] }
    });
    expect(one.shopping.bought.length).toBe(2);
    expect(three.shopping.bought.length).toBeGreaterThan(one.shopping.bought.length);
    expect(errors, errors.join(" | ")).toEqual([]);
  });

  test("欲しい支給品を「置いておく」枠が使える（在庫に無い物も置ける・半透明）", async ({ page }) => {
    // ★ 新しい画面を作らない。支給品を持たせる枠に別の意味を持たせる
    const errors = await freshPage(page);
    await interview(page);
    await seedClearedQuests(page, ["quest_caravan_escort"]);
    await page.evaluate(() => { selectQuest("quest_shopping"); toggleAdventurer("adv_mina"); setRoute("quests"); });
    expect(await page.evaluate(() => stockOwnedTotal())).toBe(0);
    const ghosts = page.locator(".item-assign-btn.item-wish.is-ghost");
    expect(await ghosts.count(), "空の棚でも、買える品は書き付けに置ける").toBeGreaterThan(0);
    await ghosts.first().click();
    expect(await page.evaluate(() => getAllItemIds(selectedAdventurerItems).length)).toBe(1);
    expect(await page.locator(".item-assign-btn.item-wish.is-ghost.selected").count()).toBe(1);
    expect(errors, errors.join(" | ")).toEqual([]);
  });

  test("買える品は段階的に増える（最初から全部並べない）", async ({ page }) => {
    // ★ 段が開く条件は仮（買い出しを終えた回数）。ここでは「最初は一部だけ」「回を重ねると増える」だけを見る
    const errors = await freshPage(page);
    await interview(page);
    const first = await page.evaluate(() => shopItems().map((i) => i.id));
    expect(first.length).toBeGreaterThan(0);
    expect(first.length).toBeLessThan(await page.evaluate(() => state.items.length));
    await runShopping(page, { party: ["adv_mina"], wishes: { adv_mina: ["item_bandage", null] } });
    const later = await page.evaluate(() => shopItems().map((i) => i.id));
    expect(later.length).toBeGreaterThan(first.length);
    expect(errors, errors.join(" | ")).toEqual([]);
  });
});
