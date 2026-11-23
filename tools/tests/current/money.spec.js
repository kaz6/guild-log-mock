// 金（2026-09-23・EX-144）。★ 受け入れテスト（acceptance/money.spec.js）から、実装したものを1本ずつ移してきた。
//   ★ ここにあるものは**今通るべきもの**。赤は退行の合図。
//   ⚠️ **値そのものは判定しない**（すべて仮置き。制作の最後に作者が調整する）。
//     値は data-money.js／依頼データから読み、「その値どおりに動いているか」だけを見る。
const { test, expect } = require("@playwright/test");
const { freshPage, interview, seedClearedQuests, departQuest, waitForReturn } = require("../helpers/app");
const { settleExpedition, setMoney, spend, runShopping, runDispatch, setStock } = require("../helpers/money");

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
      const nodes = [...document.querySelectorAll(".item-card, .item-assign-btn, .shared-chip")];
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
      wishes: ["item_bandage", "item_smoke", "item_bandage"]
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
    const names = await page.evaluate(() => [...document.querySelectorAll(".item-assign-btn")].map((b) => b.innerText).join(" "));
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
    const wishes = ["item_bandage"];
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
    // ★ 書き付けを5つ渡しても、1人なら2枠ぶんしか持っていかない
    const five = ["item_bandage", "item_smoke", "item_bandage", "item_smoke", "item_bandage"];
    const one = await runShopping(page, { party: ["adv_mina"], wishes: five });
    await setStock(page, {});
    const three = await runShopping(page, {
      party: ["adv_mina", "adv_gadd", "adv_elne"],
      wishes: five
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
    expect(await page.evaluate(() => selectedSharedItems.length)).toBe(1);
    expect(await page.locator(".shared-chip.item-wish.is-ghost").count(), "置いた物も半透明のまま").toBe(1);
    expect(errors, errors.join(" | ")).toEqual([]);
  });

  test("買える品は段階的に増える（最初から全部並べない）", async ({ page }) => {
    // ★ 段が開く条件は仮（買い出しを終えた回数）。ここでは「最初は一部だけ」「回を重ねると増える」だけを見る
    const errors = await freshPage(page);
    await interview(page);
    const first = await page.evaluate(() => shopItems().map((i) => i.id));
    expect(first.length).toBeGreaterThan(0);
    expect(first.length).toBeLessThan(await page.evaluate(() => state.items.length));
    await runShopping(page, { party: ["adv_mina"], wishes: ["item_bandage"] })
    const later = await page.evaluate(() => shopItems().map((i) => i.id));
    expect(later.length).toBeGreaterThan(first.length);
    expect(errors, errors.join(" | ")).toEqual([]);
  });
});

test.describe("救済クエスト", () => {
  test("費用0で報酬が出る（報酬は近の遠征費に届かない額）", async ({ page }) => {
    const errors = await freshPage(page);
    await interview(page);
    const got = await page.evaluate(() => {
      const quests = window.masterQuests.filter((q) => q.relief);
      const q = quests[0];
      const moneyBefore = state.money;
      state.expeditions = [...getExpeditions(), {
        id: "exp_relief_test", questId: q.id, adventurerIds: ["adv_mina"], adventurerItemIds: {}, itemIds: [],
        startTime: Date.now() - 60_000, durationMs: 1, seed: 7, departTimeOfDay: "昼", departWeather: "晴れ",
        firstRunOfQuest: false, elsieAtGuild: true, fee: questFee(q)
      }];
      getAdventurer("adv_mina").status = "遠征中";
      checkExpeditionCompletion();
      return { count: quests.length, fee: questFee(q), reward: state.reports[0].money.reward,
        gained: state.money - moneyBefore, nearFee: window.masterMoneyRules.feeByBandLabel["近"] };
    });
    expect(got.count).toBeGreaterThan(0);
    expect(got.fee).toBe(0);
    expect(got.reward).toBeGreaterThan(0);
    expect(got.gained).toBe(got.reward);
    // ★ 金策にならない額（設計ページ「近の遠征費10に届かない」）
    expect(got.reward).toBeLessThan(got.nearFee);
    expect(errors, errors.join(" | ")).toEqual([]);
  });

  test("借金中または2回使い切りで、一番安い依頼の遠征費に届かないとき、必ず枠に入る（それ以外では出ない。2026-11-23 作者の裁定1（A）で借金中も届けば出ない）", async ({ page }) => {
    // ★ 「運営不能の直前」の定義（2026-11-12・EX-173 で作者が確定）。旧定義（2026-09-22 の書き直し）は「借金中、または2回使い切り」。
    // ★ 「たまに出る」は 2026-11-12・EX-173 で取り下げ（直前にしか出さない＝確定）。全組の判定は受け入れテストの側にある。
    const errors = await freshPage(page);
    await interview(page);
    // 枠が埋まっていても入ることを見るため、進行を先に積んでおく
    const all = await page.evaluate(() => window.masterQuests.filter((q) => !q.hidden && !q.relief).map((q) => q.id));
    await seedClearedQuests(page, all.slice(0, 8));
    const onBoard = () => page.evaluate(() => buildBoardQuests(getClearedQuestIds(), state.reports).some((q) => q.relief));
    // ★ 一番安い遠征費の数え方は本体の関数（報酬の出ない依頼・救済・固有依頼・費用0は数えない）。試験で数え直さない（2026-11-23・P-005）
    const cheapest = await page.evaluate(() => cheapestBoardFee());
    const per = await page.evaluate(() => window.masterMoneyRules.reliefPerBorrow);
    expect(await onBoard(), "直前でないのに出ている（直前にしか出さない）").toBe(false);
    // ★ 2026-11-23・P-008（作者の裁定1・A）：借金中でも、所持金が一番安い依頼の遠征費に届くなら出ない。届かなければ出る（旧：借金中は金があっても出た）
    await page.evaluate(({ per, cheapest }) => { state.debt = { active: { borrowed: 200, remaining: 120 }, timesBorrowed: 1, reliefLeft: per }; state.money = cheapest; }, { per, cheapest });
    expect(await onBoard(), "借金中でも一番安い依頼に届くなら出ない").toBe(false);
    await page.evaluate((cheapest) => { state.money = cheapest - 1; }, cheapest);
    expect(await onBoard(), "借金中・一番安い依頼に届かないのに出ていない").toBe(true);
    // ★ 2回使い切っても、金に余裕があれば出ない（旧定義ではここで出続けた）
    await page.evaluate(({ per, cheapest }) => { state.debt = { active: null, timesBorrowed: 2, reliefLeft: per }; state.money = cheapest; }, { per, cheapest });
    expect(await onBoard(), "2回使い切りでも一番安い依頼に届くなら出ない").toBe(false);
    await page.evaluate((cheapest) => { state.money = cheapest - 1; }, cheapest);
    expect(await onBoard(), "2回使い切り・一番安い依頼に届かないのに出ていない").toBe(true);
    // ★ 枠の数は越えない
    expect(await page.evaluate(() => buildBoardQuests(getClearedQuestIds(), state.reports).length))
      .toBeLessThanOrEqual(await page.evaluate(() => window.masterBoardRules.slots));
    // ★ 回数を使い切ると、直前でも出ない
    await page.evaluate(() => { state.debt.reliefLeft = 0; });
    expect(await onBoard(), "回数を使い切ったのに出ている").toBe(false);
    expect(errors, errors.join(" | ")).toEqual([]);
  });

  test("救済の回数は借入のたびに元に戻り、前の残りは持ち越さない／出発で1回減る", async ({ page }) => {
    const errors = await freshPage(page);
    await interview(page);
    const got = await page.evaluate(() => {
      const per = window.masterMoneyRules.reliefPerBorrow;
      const relief = window.masterQuests.find((q) => q.relief);
      const steps = { initial: state.debt.reliefLeft };
      state.money = -5;
      settleNegativeMoney(); // 1回目の借入
      steps.afterFirst = state.debt.reliefLeft;
      selectedQuestId = relief.id; selectedAdventurerIds = ["adv_mina"]; selectedSharedItems = []; selectedObsHolders = [];
      startExpedition();
      steps.afterDepart = state.debt.reliefLeft;
      const exp = state.expeditions.find((e) => e.questId === relief.id);
      exp.startTime = Date.now() - exp.durationMs - 1_000;
      checkExpeditionCompletion();
      steps.afterReturn = state.debt.reliefLeft; // 帰りでは減らない
      state.debt.active = null; // 完済したことにする
      state.money = -5;
      settleNegativeMoney(); // 2回目の借入
      steps.afterSecond = state.debt.reliefLeft;
      return { per, ...steps, times: state.debt.timesBorrowed };
    });
    expect(got.initial).toBe(0);
    expect(got.afterFirst).toBe(got.per);
    expect(got.afterDepart).toBe(got.per - 1);
    expect(got.afterReturn).toBe(got.per - 1);
    expect(got.times).toBe(2);
    expect(got.afterSecond, "前の残りを持ち越していない（足し算ではなく元に戻る）").toBe(got.per);
    expect(errors, errors.join(" | ")).toEqual([]);
  });

  test("最後の1回が掲示板に出たときだけ、受付嬢が一言添える（数字は出さない。★ 見せ方は仮・作者の裁定待ち）", async ({ page }) => {
    const errors = await freshPage(page);
    await interview(page);
    const line = await page.evaluate(() => window.masterMoneyRules.texts.reliefLast);
    // ⚠️ 2026-11-23・P-008：借金中でも、掲示板に報酬の出る依頼があり所持金が届けば救済は出ない。直前になる状態（報酬の出る依頼が並ぶ掲示板＋所持金0）から始める
    await seedClearedQuests(page, ["quest_tavern_errand", "quest_guild_cleanup"]);
    const show = async (left) => {
      await page.evaluate((left) => { state.debt = { active: { borrowed: 200, remaining: 120 }, timesBorrowed: 1, reliefLeft: left }; state.money = 0; setRoute("quests"); }, left);
      return page.locator("[data-relief-last]").count();
    };
    expect(await show(3)).toBe(0);
    expect(await show(2)).toBe(0);
    expect(await show(1)).toBe(1);
    expect(await page.locator("[data-relief-last]").innerText()).toContain(line);
    expect(await page.locator("[data-relief-last]").innerText()).not.toMatch(/[0-9０-９]/);
    expect(await show(0), "使い切ったら救済も一言も出ない").toBe(0);
    expect(errors, errors.join(" | ")).toEqual([]);
  });
});

// ── 支給品はパーティ共有（2026-09-23・EX-144 裁定A）。受け入れテストから移した3件 ──
const CARAVAN_CHAIN = ["quest_tavern_errand", "quest_guild_cleanup", "quest_old_house_cleanup", "quest_signpost", "quest_field_mystery", "quest_barn_bite", "quest_caravan_escort"];

test.describe("支給品はパーティ共有", () => {
  test("遠征ごとにパーティへ渡す（誰に持たせるかを選ばない）", async ({ page }) => {
    const errors = await freshPage(page);
    await interview(page);
    await setStock(page, { item_bandage: 1, item_map: 1 });
    await page.evaluate(() => { setRoute("quests"); selectQuest(getQuest("quest_tavern_errand") ? "quest_tavern_errand" : null); toggleAdventurer("adv_mina"); toggleAdventurer("adv_gadd"); });
    // ★ 1人ずつの枠（スロット）が画面に無い。荷はパーティに1つ
    expect(await page.locator(".assign-slot, .assign-row").count()).toBe(0);
    await page.locator(".item-assign-btn").first().click();
    expect(await page.locator(".shared-chip").count()).toBe(1);
    // 出発すると、使い手は規則で決まる（プレイヤーは選んでいない）
    const got = await runDispatch(page, { questId: "quest_tavern_errand", party: ["adv_mina", "adv_gadd"], shared: ["item_bandage", "item_map"] });
    expect(got.error).toBeUndefined();
    expect(got.shared).toEqual(["item_bandage", "item_map"]);
    expect(Object.values(got.itemMap).flat().sort()).toEqual(["item_bandage", "item_map"]);
    expect(errors, errors.join(" | ")).toEqual([]);
  });

  test("持てる量はメンバーのスロットの合計", async ({ page }) => {
    const errors = await freshPage(page);
    await interview(page);
    const got = await page.evaluate(() => ({
      two: partyItemCapacity(["adv_mina", "adv_gadd"]),
      withDog: partyItemCapacity(["adv_mina", "adv_gadd", "adv_elsie"]),
      per: ITEM_SLOTS_PER_MEMBER,
      harness: getAdventurer("adv_elsie").accessory.capacity
    }));
    expect(got.two).toBe(2 * got.per);
    // ★ エルシーは2枠＋ハーネスのぶん（2026-09-23・EX-145。値はデータの `accessory.capacity`）
    expect(got.withDog, "エルシーを連れるとハーネスのぶん荷が増える").toBe(3 * got.per + got.harness);
    expect(got.harness, "ハーネスが荷を増やしていない").toBeGreaterThan(0);
    // 容量を越えて積めない
    await setStock(page, { item_bandage: 3, item_smoke: 2 });
    const n = await page.evaluate(() => {
      selectQuest("quest_tavern_errand"); toggleAdventurer("adv_mina");
      ["item_bandage", "item_bandage", "item_smoke"].forEach(addSharedItem);
      return selectedSharedItems.length;
    });
    expect(n).toBe(got.per);
    expect(errors, errors.join(" | ")).toEqual([]);
  });

  test("使うのは語彙で選ばれた担い手（語で絞る→場面の育成値→編成順）", async ({ page }) => {
    const errors = await freshPage(page);
    await interview(page);
    const got = await page.evaluate(() => {
      const herb = getQuest("quest_herb");
      const party = (ids) => ids.map(getAdventurer);
      const user = (item, ids, q = herb) => sharedItemUser(item, party(ids), q)?.id ?? null;
      return {
        // 料理人がいれば鍋は料理人が使う（〈火と食〉はガッドだけ）
        pot: user("item_pot", ["adv_mina", "adv_gadd", "adv_elne"]),
        // 包帯の語（手当て・留める）を持たないガッドは使わない
        bandage: user("item_bandage", ["adv_gadd", "adv_elne"]),
        // 煙幕は人間に語の持ち主がいない → 人間全員から、場面の育成値（採集＝探索）が最大の者
        smoke: user("item_smoke", ["adv_gadd", "adv_mina"]),
        // 犬は使わない（エルシーだけが〈離れる〉を持っていても）
        smokeNoDog: user("item_smoke", ["adv_elsie", "adv_row"]),
        // 同じ値なら編成順（先に選んだ者）
        tieFirst: user("item_whistle", ["adv_row", "adv_mina"], { category: "生活" }),
        tieFlip: user("item_whistle", ["adv_mina", "adv_row"], { category: "生活" }),
        stats: { mina: getAdventurer("adv_mina").stats.negotiation, row: getAdventurer("adv_row").stats.negotiation },
        // 報告書は「持っている人＝使う人」として読む（道具の行に出る名前が使い手になる）
        holder: (() => {
          const map = buildExpeditionItemMap(party(["adv_mina", "adv_gadd"]), herb, ["item_pot"], []);
          return supplyItemHolderName(party(["adv_mina", "adv_gadd"]), map, "item_pot");
        })(),
        gaddName: getDisplayName(getAdventurer("adv_gadd"))
      };
    });
    expect(got.pot).toBe("adv_gadd");
    expect(got.bandage).toBe("adv_elne");
    expect(got.smoke).toBe("adv_mina");
    expect(got.smokeNoDog).toBe("adv_row");
    if (got.stats.mina === got.stats.row) {
      expect(got.tieFirst).toBe("adv_row");
      expect(got.tieFlip).toBe("adv_mina");
    }
    expect(got.holder).toBe(got.gaddName);
    expect(errors, errors.join(" | ")).toEqual([]);
  });

  test("戦闘の手当ても同じ規則（包帯の語を持つ者に絞り、支援が最大の者が巻く）", async ({ page }) => {
    const errors = await freshPage(page);
    await interview(page);
    // エルネ（手当て）がいない編成：旧規則なら支援が最大のロウが巻いていた。語で絞るとミナ（留める）が巻く
    const healers = await page.evaluate(() => {
      const quest = getQuest("quest_caravan_escort");
      const party = ["adv_mina", "adv_gadd", "adv_row"].map(getAdventurer);
      const ids = new Set();
      for (let seed = 1; seed <= 200; seed += 1) {
        const b = simulateBattle(quest, party, ["item_bandage", "item_bandage"], makeRng(seed));
        (b?.events ?? []).filter((e) => e.type === "heal").forEach((e) => ids.add(e.healerId));
      }
      return [...ids];
    });
    expect(healers.length, "200回で一度も手当てが起きない（検証になっていない）").toBeGreaterThan(0);
    expect(healers).toEqual(["adv_mina"]);
    expect(errors, errors.join(" | ")).toEqual([]);
  });
});

// ── 観察記録票だけは個人に持たせる（例外・2026-09-23・EX-144 裁定）──
test.describe("観察記録票は個人（例外）", () => {
  test("誰に持たせるかを選べる。持っている人が一目で分かる（隊商護衛のあとに解禁）", async ({ page }) => {
    const errors = await freshPage(page);
    await interview(page);
    await page.evaluate(() => { setRoute("quests"); selectQuest("quest_tavern_errand"); toggleAdventurer("adv_mina"); });
    expect(await page.locator(".obs-sheet-btn").count(), "解禁前（隊商護衛の前）は出さない").toBe(0);
    await seedClearedQuests(page, CARAVAN_CHAIN);
    await page.evaluate(() => { clearSelections(); setRoute("quests"); selectQuest("quest_herb"); toggleAdventurer("adv_mina"); toggleAdventurer("adv_elne"); toggleAdventurer("adv_elsie"); });
    expect(await page.locator(".obs-sheet-btn").count(), "人間2人ぶん（犬は書かない）").toBe(2);
    await page.locator('.obs-sheet-btn[data-adv="adv_elne"]').click();
    expect(await page.evaluate(() => selectedObsHolders)).toEqual(["adv_elne"]);
    expect(await page.locator(".obs-sheet-row.holding").innerText()).toContain("エルネ");
    // 編成カードにも札が出る
    const cardBadges = await page.evaluate(() => [...document.querySelectorAll(".adventurer-card")]
      .filter((c) => c.querySelector(".obs-holder-pill")).map((c) => c.querySelector("h3").innerText));
    expect(cardBadges.length).toBe(1);
    expect(cardBadges[0]).toContain("エルネ");
    expect(errors, errors.join(" | ")).toEqual([]);
  });

  test("持った人が書き手になる", async ({ page }) => {
    const errors = await freshPage(page);
    await interview(page);
    await seedClearedQuests(page, CARAVAN_CHAIN);
    const got = await runDispatch(page, { questId: "quest_herb", party: ["adv_mina", "adv_elne"], obsHolders: ["adv_elne"] });
    expect(got.error).toBeUndefined();
    expect(got.itemMap.adv_elne).toEqual(["item_obs_sheet"]);
    const writers = (got.report.observationNotes?.notes ?? []).map((n) => n.adventurerId);
    expect(writers).toEqual(["adv_elne"]);
    expect(errors, errors.join(" | ")).toEqual([]);
  });

  test("消耗しない（書いても戻る。毎回持たせられる）／在庫に数えない・買わない", async ({ page }) => {
    const errors = await freshPage(page);
    await interview(page);
    await seedClearedQuests(page, CARAVAN_CHAIN);
    const first = await runDispatch(page, { questId: "quest_herb", party: ["adv_mina"], obsHolders: ["adv_mina"] });
    expect(first.ownedAtDepart, "棚から出していない＝持ち物の数に入らない").toBe(0);
    expect(first.stockAfter).toEqual({});
    // もう一度持たせられる（棚が空でも）
    const second = await runDispatch(page, { questId: "quest_herb", party: ["adv_mina"], obsHolders: ["adv_mina"] });
    expect(second.itemMap.adv_mina).toEqual(["item_obs_sheet"]);
    const shop = await page.evaluate(() => ({
      inShop: shopItems().some((i) => i.id === "item_obs_sheet"),
      inAddable: assignableItems(false).some((i) => i.id === "item_obs_sheet"),
      normalized: normalizeStock({ item_obs_sheet: 3, item_bandage: 1 })
    }));
    expect(shop.inShop, "買い出しの品目から外す").toBe(false);
    expect(shop.inAddable, "共有の荷には並ばない").toBe(false);
    expect(shop.normalized).toEqual({ item_bandage: 1 });
    expect(errors, errors.join(" | ")).toEqual([]);
  });

  test("持たせた人のスロットを1つ埋める（記録票を持たせるほど共有の荷が減る）", async ({ page }) => {
    const errors = await freshPage(page);
    await interview(page);
    await seedClearedQuests(page, CARAVAN_CHAIN);
    await setStock(page, { item_bandage: 3, item_smoke: 2 });
    const got = await page.evaluate(() => {
      selectQuest("quest_herb"); toggleAdventurer("adv_mina"); toggleAdventurer("adv_elne");
      const before = suppliesCapacity(false);
      toggleObsSheet("adv_mina"); toggleObsSheet("adv_elne");
      const after = suppliesCapacity(false);
      ["item_bandage", "item_bandage", "item_bandage", "item_smoke"].forEach(addSharedItem);
      const loaded = selectedSharedItems.length;
      toggleObsSheet("adv_elne"); // 外すと1つ空く
      const reopened = suppliesCapacity(false);
      addSharedItem("item_smoke");
      // 荷がいっぱいのときは、記録票を持たせられない（黙って荷を落とさない）
      toggleObsSheet("adv_elne");
      return { before, after, loaded, reopened, finalShared: selectedSharedItems.length, holders: [...selectedObsHolders] };
    });
    expect(got.after).toBe(got.before - 2);
    expect(got.loaded).toBe(got.after);
    expect(got.reopened).toBe(got.after + 1);
    expect(got.finalShared).toBe(got.reopened);
    expect(got.holders).toEqual(["adv_mina"]);
    expect(errors, errors.join(" | ")).toEqual([]);
  });
});

// 行き止まりで畳む（2026-11-23・P-003。作者が「畳ませます」と決めた）。
//   行き止まり＝借入を2回使い切った／借金中ではない／救済の残りが0／所持金が掲示板の一番安い遠征費に届かない。
//   ★ 遠征に出ている者が1人でもいる間は畳まない。判定する時点は、遠征から帰って金の出入りが済んだあと／セーブを読み込んだとき。
//   ⚠️ 値は判定しない（掲示板の一番安い遠征費は `cheapestBoardFee()` から読む）。
test.describe("行き止まりで畳む", () => {
  // 進行を積み、借入を2回使い切った状態（救済の残り0・所持金0）にする。★ 進行を積むのは、掲示板に費用のかかる依頼を並べるため
  async function deadEndSetup(page, { reliefLeft = 0, active = null, money = 0 } = {}) {
    const errors = await freshPage(page);
    await interview(page);
    const all = await page.evaluate(() => window.masterQuests.filter((q) => !q.hidden && !q.relief).map((q) => q.id));
    await seedClearedQuests(page, all.slice(0, 8));
    await page.evaluate(({ reliefLeft, active, money }) => {
      state.debt = { active, timesBorrowed: window.masterMoneyRules.maxBorrowCount, reliefLeft };
      state.money = money;
      state.gameOver = null;
      saveState();
    }, { reliefLeft, active, money });
    return errors;
  }

  // 遠征を1本、出して（遠征費は引かない）帰す。★ 帰還は本物の経路（checkExpeditionCompletion）。
  //   `stay` を渡すと、その遠征はまだ帰らない（長い所要時間）まま残す。
  async function sendAndReturn(page, { questId = "quest_guild_cleanup", partyIds = ["adv_mina"], stay = null } = {}) {
    return page.evaluate(({ questId, partyIds, stay }) => {
      const make = (qid, party, seed, late) => ({
        id: `exp_deadend_${seed}`, questId: qid, adventurerIds: party, adventurerItemIds: {}, itemIds: [],
        startTime: late ? Date.now() : Date.now() - 60_000, durationMs: late ? 3_600_000 : 1, seed,
        departTimeOfDay: questTimeOfDay(getQuest(qid), seed), departWeather: "晴れ", firstRunOfQuest: false, elsieAtGuild: true, fee: 0
      });
      const list = [make(questId, partyIds, 1, false)];
      if (stay) list.push(make(stay.questId, stay.partyIds, 2, true));
      state.expeditions = list;
      list.forEach((e) => e.adventurerIds.forEach((id) => { const a = getAdventurer(id); if (a) a.status = "遠征中"; }));
      checkExpeditionCompletion();
      return {
        gameOver: JSON.parse(JSON.stringify(state.gameOver)), money: state.money, left: getExpeditions().length,
        cheapest: cheapestBoardFee(), reward: state.reports[0]?.money?.reward ?? null
      };
    }, { questId, partyIds, stay });
  }

  test("行き止まりで帰ったら、ギルドは畳まれる（理由と画面の地の文つき）", async ({ page }) => {
    const errors = await deadEndSetup(page);
    const got = await sendAndReturn(page);
    // 前提：帰ったあとも所持金は一番安い遠征費に届かない
    expect(got.cheapest, "掲示板に費用のかかる依頼が無い").not.toBe(null);
    expect(got.money).toBeLessThan(got.cheapest);
    expect(got.left).toBe(0);
    expect(got.gameOver).not.toBe(null);
    expect(got.gameOver.reason).toBe("もう借りられず、どの依頼にも出せなくなった");
    // ★ 地の文は行き止まり用（赤字ではないので「赤字のまま」を言わない）
    await page.evaluate(() => setRoute("home"));
    const texts = await page.evaluate(() => ({ dead: window.masterMoneyRules.texts.gameOverBodyDeadEnd, red: window.masterMoneyRules.texts.gameOverBody }));
    await expect(page.locator(".game-over-card p").nth(1)).toHaveText(texts.dead);
    expect(texts.dead).not.toContain("赤字");
    // 赤字で畳んだ（印の無い）運営不能は、いままでの地の文のまま
    await page.evaluate(() => { state.gameOver = { at: Date.now(), reason: "もう借りられないところで、また赤字になった" }; render(); });
    await expect(page.locator(".game-over-card p").nth(1)).toHaveText(texts.red);
    expect(errors, errors.join(" | ")).toEqual([]);
  });

  test("救済が残っていれば、畳まれない", async ({ page }) => {
    const errors = await deadEndSetup(page, { reliefLeft: 1 });
    const got = await sendAndReturn(page);
    expect(got.money).toBeLessThan(got.cheapest); // 前提：金は届かない
    expect(got.gameOver).toBe(null);
    expect(errors, errors.join(" | ")).toEqual([]);
  });

  test("借金中は、畳まれない", async ({ page }) => {
    const errors = await deadEndSetup(page, { active: { borrowed: 200, remaining: 120 } });
    const got = await sendAndReturn(page);
    expect(got.gameOver).toBe(null);
    expect(errors, errors.join(" | ")).toEqual([]);
  });

  test("借入を使い切っていなければ、畳まれない", async ({ page }) => {
    const errors = await deadEndSetup(page);
    await page.evaluate(() => { state.debt.timesBorrowed = window.masterMoneyRules.maxBorrowCount - 1; });
    const got = await sendAndReturn(page);
    expect(got.money).toBeLessThan(got.cheapest);
    expect(got.gameOver).toBe(null);
    expect(errors, errors.join(" | ")).toEqual([]);
  });

  test("遠征に出ている者がいる間は畳まれず、最後の1本が帰ったら畳まれる", async ({ page }) => {
    const errors = await deadEndSetup(page);
    const first = await sendAndReturn(page, { stay: { questId: "quest_tavern_errand", partyIds: ["adv_gadd"] } });
    expect(first.left).toBe(1); // 1本は帰り、1本は出たまま
    expect(first.gameOver).toBe(null);
    // もう1本を帰す
    const second = await page.evaluate(() => {
      const exp = getExpeditions()[0];
      exp.startTime = Date.now() - exp.durationMs - 1_000;
      checkExpeditionCompletion();
      return { gameOver: JSON.parse(JSON.stringify(state.gameOver)), left: getExpeditions().length, money: state.money, cheapest: cheapestBoardFee() };
    });
    expect(second.left).toBe(0);
    expect(second.money).toBeLessThan(second.cheapest);
    expect(second.gameOver).not.toBe(null);
    expect(errors, errors.join(" | ")).toEqual([]);
  });

  test("所持金がちょうど一番安い遠征費なら畳まれない（1円足りなければ畳まれる）", async ({ page }) => {
    const errors = await deadEndSetup(page);
    const got = await page.evaluate(() => {
      const cheapest = cheapestBoardFee();
      state.money = cheapest;
      const exact = { dead: isDeadEnd(), settled: settleDeadEnd(), gameOver: state.gameOver };
      state.money = cheapest - 1;
      const short = { dead: isDeadEnd(), settled: settleDeadEnd(), gameOver: state.gameOver && { deadEnd: state.gameOver.deadEnd } };
      return { exact, short };
    });
    expect(got.exact).toEqual({ dead: false, settled: false, gameOver: null });
    expect(got.short).toEqual({ dead: true, settled: true, gameOver: { deadEnd: true } });
    expect(errors, errors.join(" | ")).toEqual([]);
  });

  test("行き止まりのセーブを読み込むと畳まれる（遠征が残っていれば畳まれない）", async ({ page }) => {
    const errors = await deadEndSetup(page);
    // ★ 行き止まりのまま保存（畳むのは読み込みの側）。gameOver はまだ立っていない
    expect(await page.evaluate(() => { saveState(); return state.gameOver; })).toBe(null);
    await page.reload();
    await page.waitForTimeout(400);
    const got = await page.evaluate(() => ({ gameOver: state.gameOver && { deadEnd: state.gameOver.deadEnd, reason: state.gameOver.reason } }));
    expect(got.gameOver).toEqual({ deadEnd: true, reason: "もう借りられず、どの依頼にも出せなくなった" });
    await expect(page.locator(".game-over-card")).toBeVisible();
    // 畳んだ状態は保存され、読み込み直しても変わらない
    await page.reload();
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => state.gameOver.deadEnd)).toBe(true);
    // 遠征が残っているセーブは、読み込みでは畳まない
    await page.evaluate(() => {
      state.gameOver = null;
      state.expeditions = [{
        id: "exp_deadend_stay", questId: "quest_guild_cleanup", adventurerIds: ["adv_mina"], adventurerItemIds: {}, itemIds: [],
        startTime: Date.now(), durationMs: 3_600_000, seed: 3, departTimeOfDay: questTimeOfDay(getQuest("quest_guild_cleanup"), 3),
        departWeather: "晴れ", firstRunOfQuest: false, elsieAtGuild: true, fee: 0
      }];
      saveState();
    });
    await page.reload();
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => ({ gameOver: state.gameOver, left: getExpeditions().length }))).toEqual({ gameOver: null, left: 1 });
    expect(errors, errors.join(" | ")).toEqual([]);
  });
});

// 「一番安い依頼」に、報酬の出ない依頼を数えない（2026-11-23・P-004。作者が「数えません」と決めた）。
//   報酬の出ない依頼＝依頼データの `money.reward` が固定で 0（買い出し・酒場の酒樽・掃除・固有依頼）。
//   ★ 数え方は `cheapestBoardFee` の1か所。「運営不能の直前」と「行き止まり」の両方がそれを通る。
//   ⚠️ 値は判定しない（遠征費は questFee から読む）。見るのは「どれが数えられるか」と、その結果の直前・行き止まり。
test.describe("一番安い依頼に、報酬の出ない依頼を数えない", () => {
  test("遠征費がかかる報酬の出ない依頼（買い出し・酒樽）は数えず、報酬の出る依頼だけで決まる", async ({ page }) => {
    const errors = await freshPage(page);
    await interview(page);
    const got = await page.evaluate(() => {
      const q = (id) => window.masterQuests.find((x) => x.id === id);
      const tavern = q("quest_tavern_errand"), shopping = q("quest_shopping"), church = q("quest_church_patrol");
      // 除く対象：遠征費がかかるのに報酬の出ない依頼（費用0のものは、これまでも数えていない）
      const rewardlessWithFee = window.masterQuests.filter((x) => !x.relief && !x.bond && isRewardlessQuest(x) && questFee(x) > 0).map((x) => x.id).sort();
      return {
        rewardlessWithFee,
        fees: { tavern: questFee(tavern), shopping: questFee(shopping), church: questFee(church) },
        all: cheapestBoardFee([tavern, shopping, church]),
        paidOnly: cheapestBoardFee([church]),
        rewardlessOnly: cheapestBoardFee([tavern, shopping]),
        // 報酬の出る依頼（reward を持たず、遠征費 × 段の倍率で払う側）は、除かない
        payingKept: window.masterQuests.filter((x) => !x.relief && !x.bond && typeof x.money?.reward !== "number").every((x) => !isRewardlessQuest(x))
      };
    });
    expect(got.rewardlessWithFee).toEqual(["quest_shopping", "quest_tavern_errand"]);
    // 前提：報酬の出ない2件のほうが、報酬の出る依頼より安い（数えれば一番安い依頼が変わる）
    expect(Math.min(got.fees.tavern, got.fees.shopping)).toBeLessThan(got.fees.church);
    expect(got.all).toBe(got.fees.church);
    expect(got.paidOnly).toBe(got.fees.church);
    expect(got.rewardlessOnly, "報酬の出ない依頼だけなら、数える依頼が無い").toBe(null);
    expect(got.payingKept).toBe(true);
    expect(errors, errors.join(" | ")).toEqual([]);
  });

  test("払えるのが報酬の出ない依頼だけのとき、直前になる（救済が出る）", async ({ page }) => {
    const errors = await freshPage(page);
    await interview(page);
    const per = await page.evaluate(() => window.masterMoneyRules.reliefPerBorrow);
    // 酒樽（報酬なし）には払えるが、報酬の出る依頼には1円届かない
    const got = await page.evaluate(({ per }) => {
      const pick = (id) => window.masterQuests.find((x) => x.id === id);
      const paying = { ...pick("quest_church_patrol"), unlockedBy: undefined, unlockedAfterCount: undefined };
      const rewardless = pick("quest_tavern_errand");
      state.quests = [rewardless, paying, ...window.masterQuests.filter((x) => x.relief)];
      state.debt = { active: null, timesBorrowed: window.masterMoneyRules.maxBorrowCount, reliefLeft: per };
      state.gameOver = null; state.expeditions = [];
      state.money = questFee(paying) - 1;
      return {
        rewardlessFee: questFee(rewardless), payingFee: questFee(paying), money: state.money,
        brink: isOnBrinkOfClosing(),
        reliefOnBoard: buildBoardQuests(getClearedQuestIds(), state.reports).some((x) => x.relief),
        boardHasRewardless: buildBoardQuests(getClearedQuestIds(), state.reports, { withRelief: false }).some((x) => x.id === "quest_tavern_errand")
      };
    }, { per });
    expect(got.money, "前提：報酬の出ない依頼には払える").toBeGreaterThanOrEqual(got.rewardlessFee);
    expect(got.money, "前提：報酬の出る依頼には届かない").toBeLessThan(got.payingFee);
    expect(got.boardHasRewardless, "前提：報酬の出ない依頼も掲示板に並んでいる").toBe(true);
    expect(got.brink).toBe(true);
    expect(got.reliefOnBoard).toBe(true);
    expect(errors, errors.join(" | ")).toEqual([]);
  });

  test("払えるのが報酬の出ない依頼だけで、救済も使い切っていれば、畳まれる", async ({ page }) => {
    const errors = await freshPage(page);
    await interview(page);
    const got = await page.evaluate(() => {
      const pick = (id) => window.masterQuests.find((x) => x.id === id);
      const paying = { ...pick("quest_church_patrol"), unlockedBy: undefined, unlockedAfterCount: undefined };
      const rewardless = pick("quest_tavern_errand");
      state.quests = [rewardless, paying, ...window.masterQuests.filter((x) => x.relief)];
      state.debt = { active: null, timesBorrowed: window.masterMoneyRules.maxBorrowCount, reliefLeft: 0 };
      state.gameOver = null; state.expeditions = [];
      state.money = questFee(paying) - 1;
      const before = { rewardlessFee: questFee(rewardless), money: state.money, dead: isDeadEnd() };
      const settled = settleDeadEnd();
      return { ...before, settled, gameOver: state.gameOver && { deadEnd: state.gameOver.deadEnd } };
    });
    expect(got.money).toBeGreaterThanOrEqual(got.rewardlessFee);
    expect(got.dead).toBe(true);
    expect(got.settled).toBe(true);
    expect(got.gameOver).toEqual({ deadEnd: true });
    expect(errors, errors.join(" | ")).toEqual([]);
  });

  test("報酬の出る依頼に届くなら、直前にも行き止まりにもならない", async ({ page }) => {
    const errors = await freshPage(page);
    await interview(page);
    const got = await page.evaluate(() => {
      const pick = (id) => window.masterQuests.find((x) => x.id === id);
      const paying = { ...pick("quest_church_patrol"), unlockedBy: undefined, unlockedAfterCount: undefined };
      const rewardless = pick("quest_tavern_errand");
      state.quests = [rewardless, paying, ...window.masterQuests.filter((x) => x.relief)];
      state.gameOver = null; state.expeditions = [];
      const out = {};
      for (const reliefLeft of [0, window.masterMoneyRules.reliefPerBorrow]) {
        state.debt = { active: null, timesBorrowed: window.masterMoneyRules.maxBorrowCount, reliefLeft };
        state.money = questFee(paying); // ちょうど届く
        out[`exact_${reliefLeft}`] = { brink: isOnBrinkOfClosing(), dead: isDeadEnd() };
      }
      return out;
    });
    Object.values(got).forEach((v) => expect(v).toEqual({ brink: false, dead: false }));
    expect(errors, errors.join(" | ")).toEqual([]);
  });
});

// ★ 掲示板には稼げる依頼を必ず1つは並べる（2026-11-23・P-009。作者の裁定「ひとつはだす」）。
//   稼げる依頼＝救済でも固有依頼でもなく、報酬が出て、遠征費がかかる依頼（`isBoardEarner`。「一番安い依頼」の数え方と同じ）。
//   ⚠️ 試験は依頼を自前の小さな表（state.quests）に置き換えて組む。値は questFee から読み、固定の金額は置かない。
test.describe("掲示板に稼げる依頼を必ず1つは並べる", () => {
  // ページの中で使う共通の準備（page.evaluate は閉包を持てないので、文字列で渡して new Function で組む）
  const setup = `
    const pick = (id) => window.masterQuests.find((x) => x.id === id);
    const base = pick("quest_church_patrol");
    const earner = (id, fee) => ({ ...base, id, title: id, unlockedBy: undefined, unlockedAfterCount: undefined, money: { fee } });
    const filler = (id) => ({ ...pick("quest_tavern_errand"), id, title: id, oneTime: false }); // 報酬の出ない依頼
    const relief = window.masterQuests.filter((x) => x.relief);
    state.gameOver = null; state.expeditions = [];
    return { earner, filler, relief };
  `;

  test("枠があふれて稼げる依頼が落ちるとき、1つ入る（枠は6を超えない）", async ({ page }) => {
    const errors = await freshPage(page);
    await interview(page);
    const got = await page.evaluate((setup) => {
      const { earner, filler, relief } = new Function(setup)();
      const slots = window.masterBoardRules.slots;
      // 報酬の出ない依頼で枠をちょうど埋め、稼げる依頼は7番目（そのままなら枠から落ちる）
      const fillers = Array.from({ length: slots }, (_, i) => filler(`t_filler_${i}`));
      const paying = earner("t_paying", 60);
      state.quests = [...fillers, paying, ...relief];
      const board = buildBoardQuests(getClearedQuestIds(), state.reports, { withRelief: false });
      return { slots, ids: board.map((q) => q.id), fillerIds: fillers.map((q) => q.id) };
    }, setup);
    expect(got.ids).toHaveLength(got.slots);
    expect(got.ids).toContain("t_paying");
    expect(got.ids.slice(0, got.slots - 1), "外すのは枠の最後だけ（残りの並びは変わらない）").toEqual(got.fillerIds.slice(0, got.slots - 1));
    expect(errors, errors.join(" | ")).toEqual([]);
  });

  test("クールタイムの小休止で稼げる依頼が引っ込んでいても、遠征費の一番安い1つが入る", async ({ page }) => {
    const errors = await freshPage(page);
    await interview(page);
    const got = await page.evaluate((setup) => {
      const { earner, filler, relief } = new Function(setup)();
      const dear = earner("t_dear", 60), cheap = earner("t_cheap", 30);
      state.quests = [filler("t_filler_a"), dear, cheap, ...relief];
      // どちらも小休止にする。★ reports は新しいものが先頭。安いほうは1回目（必要数1）の直後、
      //   高いほうは2回目（必要数2）で1本前＝どちらも「行ってからの本数」が必要数に届かない
      const reports = [{ questId: "t_cheap" }, { questId: "t_dear" }, { questId: "t_dear" }];
      const rested = [dear, cheap].every((q) => !questCooldownState(q, reports).ready);
      const board = buildBoardQuests(getClearedQuestIds(), reports, { withRelief: false });
      return { rested, ids: board.map((q) => q.id) };
    }, setup);
    expect(got.rested, "前提：どちらも小休止").toBe(true);
    expect(got.ids).toEqual(["t_filler_a", "t_cheap"]);
    expect(errors, errors.join(" | ")).toEqual([]);
  });

  test("もともと稼げる依頼が並んでいれば、何も変わらない", async ({ page }) => {
    const errors = await freshPage(page);
    await interview(page);
    const got = await page.evaluate((setup) => {
      const { earner, filler, relief } = new Function(setup)();
      const cooling = earner("t_cooling", 10), paying = earner("t_paying", 60);
      state.quests = [filler("t_filler_a"), paying, cooling, ...relief];
      const reports = [{ questId: "t_cooling" }]; // 安いほうは小休止。高いほうが並んでいる
      const board = buildBoardQuests(getClearedQuestIds(), reports, { withRelief: false });
      return board.map((q) => q.id);
    }, setup);
    expect(got, "並んでいる稼げる依頼があれば、小休止の安い依頼を足さない").toEqual(["t_filler_a", "t_paying"]);
    expect(errors, errors.join(" | ")).toEqual([]);
  });

  test("出せない依頼は入れない（解放前・いま遠征に出ている）。解放済みの稼げる依頼が無ければ何もしない", async ({ page }) => {
    const errors = await freshPage(page);
    await interview(page);
    const got = await page.evaluate((setup) => {
      const { earner, filler, relief } = new Function(setup)();
      const locked = { ...earner("t_locked", 30), unlockedBy: "t_never" };
      const out = earner("t_out", 30);
      state.quests = [filler("t_filler_a"), locked, out, ...relief];
      const ids = () => buildBoardQuests(getClearedQuestIds(), state.reports, { withRelief: false }).map((q) => q.id);
      const lockedOnly = (() => { state.quests = [filler("t_filler_a"), locked, ...relief]; return ids(); })();
      // 稼げる依頼が遠征に出ている間は、同じ依頼を二重に出せないので入れない
      state.quests = [filler("t_filler_a"), out, ...relief];
      state.expeditions = [{ id: "exp_t_out", questId: "t_out", adventurerIds: [], itemIds: [], startTime: Date.now(), durationMs: 1_000_000, seed: 1 }];
      const onExpedition = ids();
      return { lockedOnly, onExpedition };
    }, setup);
    expect(got.lockedOnly).toEqual(["t_filler_a"]);
    expect(got.onExpedition).toEqual(["t_filler_a"]);
    expect(errors, errors.join(" | ")).toEqual([]);
  });

  test("はじめの掲示板（酒場と掃除だけ）には何も足さない。そこでは借金も起きない", async ({ page }) => {
    const errors = await freshPage(page);
    await interview(page);
    const got = await page.evaluate(() => {
      const ids = buildBoardQuests(getClearedQuestIds(), state.reports, { withRelief: false }).map((q) => q.id);
      const tavern = window.masterQuests.find((x) => x.id === "quest_tavern_errand");
      return { ids, cheapest: cheapestBoardFee(), afterTavern: state.money - questFee(tavern), brink: isOnBrinkOfClosing(), dead: isDeadEnd() };
    });
    expect(got.ids.sort()).toEqual(["quest_guild_cleanup", "quest_tavern_errand"]);
    expect(got.cheapest).toBe(null);
    expect(got.afterTavern, "前提：はじめの所持金なら、酒樽の代金を払っても赤字にならない（＝借入に入れない）").toBeGreaterThanOrEqual(0);
    expect(got.brink).toBe(false);
    expect(got.dead).toBe(false);
    expect(errors, errors.join(" | ")).toEqual([]);
  });

  test("入れた稼げる依頼が「一番安い依頼」になる。届かなければ直前（救済が稼げる依頼と並ぶ・6枠のまま）、救済も尽きれば行き止まり", async ({ page }) => {
    const errors = await freshPage(page);
    await interview(page);
    const got = await page.evaluate((setup) => {
      const { earner, filler, relief } = new Function(setup)();
      const slots = window.masterBoardRules.slots;
      const fillers = Array.from({ length: slots }, (_, i) => filler(`t_filler_${i}`));
      const paying = earner("t_paying", 60);
      state.quests = [...fillers, paying, ...relief];
      const max = window.masterMoneyRules.maxBorrowCount;
      state.debt = { active: null, timesBorrowed: max, reliefLeft: window.masterMoneyRules.reliefPerBorrow };
      state.money = questFee(paying) - 1;
      const withRelief = buildBoardQuests(getClearedQuestIds(), state.reports).map((q) => q.id);
      const brink = isOnBrinkOfClosing();
      // 届くなら直前にならない
      state.money = questFee(paying);
      const reaches = { brink: isOnBrinkOfClosing(), relief: buildBoardQuests(getClearedQuestIds(), state.reports).some((q) => q.relief) };
      // 救済も尽きていれば、行き止まり
      state.money = questFee(paying) - 1;
      state.debt = { active: null, timesBorrowed: max, reliefLeft: 0 };
      return { slots, withRelief, brink, cheapest: cheapestBoardFee(), fee: questFee(paying), reaches, dead: isDeadEnd() };
    }, setup);
    expect(got.cheapest, "入れた依頼が一番安い依頼として数えられる").toBe(got.fee);
    expect(got.brink).toBe(true);
    expect(got.withRelief).toHaveLength(got.slots);
    expect(got.withRelief[0]).toBe("quest_relief_odd_jobs");
    expect(got.withRelief, "救済が枠を取っても、稼げる依頼は押し出されない").toContain("t_paying");
    expect(got.reaches).toEqual({ brink: false, relief: false });
    expect(got.dead).toBe(true);
    expect(errors, errors.join(" | ")).toEqual([]);
  });
});
