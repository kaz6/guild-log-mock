// 受け入れテスト：金と在庫と買い出しクエスト（2026-09-22・EX-143）。
//
// ★★ **未実装のものは `test.fixme` で持つ。実装が無いので走らせない。**
//   ★ 2026-09-26・EX-147 時点で fixme／skip は0本。2026-11-12・EX-173 で救済の判定を確定の定義に書き直した（走って緑になる）。
//   ⚠️ 赤のまま `current` に置くと `npm test` が常に赤になり、
//     **退行なのか未着手なのか区別できなくなる**（＝自走の判定が死ぬ）。
//   確認するときは `npm run test:acceptance`。「どれがまだ無いか」の一覧として読む。
//
// ★ 出典：Notion「設計：金と在庫と買い出しクエスト」`3b8a8a5dfd4581399f64e70122bb5360`
//   の 2026-09-21 確定事項。**正本は Notion 側**なので、食い違ったら Notion を優先する。
//
// ★ 実装するときの順：この節の fixme を1つずつ `test` に変えて緑にする。
//   ⚠️ **fixme を外すのは実装したときだけ。** 通らないから外す、をやらない。
//
// ⚠️ 値（遠征費・報酬との比・支給品の価格）は**未確定**（「後でシミュレーションして決める。
//   最初は固定でよい」）。だからここでは**額そのものを判定しない**——
//   「減る」「正である」「1本ずつ引く」のように、**値が決まっても壊れない形**だけを書く。
const { test, expect } = require("@playwright/test");
const { freshPage, interview, boardTitles } = require("../helpers/app");

// ★ 救済クエスト（2026-11-12・EX-173 で作者が確定。正本は DECISION_LOG の 2026-11-12 の3節）。
//   ① **直前にしか出さない（N＝∞）を確定**。2026-09-21 の「たまに出る」は取り下げ（2026-09-26・EX-147 の「暫定確定」がこれで確定になった）。
//   ② 「直前」＝**借金中、または「借入を2回使い切り、かつ所持金が掲示板の一番安い依頼の遠征費にも届かない」とき**。
//      固定の金額は置かない。「一番安い依頼」に救済そのもの・固有依頼（費用0）は数えない。
//   ③ **金策ループは回数で閉じる**：借入1回につき決まった回数まで（値は仮＝`reliefPerBorrow`）。使い切ったら直前でも出ない。
//   ★ 値（回数・遠征費・報酬）は判定しない。data-money.js から読み、「その値どおりか」だけを見る。
//   ※ 旧版（EX-147）の注記「金策ループはここに入れない（決まっていないものを試験にしない）」は、防ぎ方が決まったので当たらなくなった。

// ページの中で使う道具（掲示板の候補・一番安い依頼の遠征費・救済が出ているか）
async function reliefProbe(page, setup) {
  return page.evaluate((setup) => {
    const normal = window.masterQuests.filter((q) => !q.hidden && !q.relief).map((q) => q.id);
    const cleared = new Set(normal.slice(0, setup.cleared ?? normal.length));
    state.debt = { ...setup.debt };
    const regular = buildBoardQuests(cleared, state.reports, { withRelief: false });
    const cheapest = Math.min(...regular.filter((q) => !q.relief && !q.bond).map(questFee).filter((f) => f > 0));
    if (setup.money === "cheapest") state.money = cheapest;
    else if (setup.money === "belowCheapest") state.money = cheapest - 1;
    else state.money = setup.money;
    const shown = buildBoardQuests(cleared, state.reports).some((q) => q.relief);
    return { cheapest, shown, brink: isOnBrinkOfClosing(regular), money: state.money };
  }, setup);
}

test.describe("救済クエスト", () => {
  test("運営不能の直前以外には、掲示板に救済が出ない（N＝∞・確定）", async ({ page }) => {
    const errors = await freshPage(page);
    await interview(page);
    // ★ 進み具合（解放の段）× 直前でない借金の状態の全組で、掲示板の候補を引く。
    //   救済を一度こなした後（報告書がある）も含める＝クールタイム明けで出てくる形を塞ぐ。
    const got = await page.evaluate(() => {
      const normal = window.masterQuests.filter((q) => !q.hidden && !q.relief).map((q) => q.id);
      const relief = window.masterQuests.filter((q) => q.relief).map((q) => q.id);
      const per = window.masterMoneyRules.reliefPerBorrow;
      const max = window.masterMoneyRules.maxBorrowCount;
      const notBrink = [
        { active: null, timesBorrowed: 0, reliefLeft: 0 },   // 借りたことがない
        { active: null, timesBorrowed: 1, reliefLeft: per }, // 1回借りて返し終えた
        { active: null, timesBorrowed: max, reliefLeft: per, rich: true } // ★ 2回使い切ったが、金に余裕がある
      ];
      const seen = [];
      let checked = 0;
      for (let k = 0; k <= normal.length; k += 1) {
        for (const withRelief of [false, true]) {
          for (const { rich, ...debt } of notBrink) {
            state.debt = { ...debt };
            state.money = rich ? 100000 : 0;
            const cleared = new Set([...normal.slice(0, k), ...(withRelief ? relief : [])]);
            const regular = buildBoardQuests(cleared, state.reports, { withRelief: false });
            if (isOnBrinkOfClosing(regular)) return { error: "直前でない状態のはずが直前と判定された", k, debt };
            const board = buildBoardQuests(cleared, state.reports);
            // 枠で切る前の候補も見る（枠の数を一時的に外す。★ 直後に戻す）
            const slots = window.masterBoardRules.slots;
            window.masterBoardRules.slots = null;
            const all = buildBoardQuests(cleared, state.reports);
            window.masterBoardRules.slots = slots;
            checked += 1;
            if ([...board, ...all].some((q) => q.relief)) seen.push({ k, withRelief, debt });
          }
        }
      }
      // 対照：直前にすると出る（判定が死んでいないことの確認）
      state.debt = { active: { borrowed: 200, remaining: 120 }, timesBorrowed: 1, reliefLeft: per };
      const brinkShows = buildBoardQuests(new Set(normal), state.reports).some((q) => q.relief);
      state.debt = { active: null, timesBorrowed: 0, reliefLeft: 0 };
      state.money = window.masterMoneyRules.initialMoney;
      return { checked, seen, brinkShows };
    });
    expect(got.error).toBeUndefined();
    expect(got.checked).toBeGreaterThan(0);
    expect(got.seen, "直前でないのに救済が候補に出た組").toEqual([]);
    expect(got.brinkShows, "対照：直前なのに出ていない（判定が働いていない）").toBe(true);
    // ★ 画面の掲示板にも出ていない（関数の外で足す経路が無いことを見る）
    const reliefTitles = await page.evaluate(() => window.masterQuests.filter((q) => q.relief).map((q) => q.title));
    await page.evaluate(() => setRoute("quests"));
    const titles = await boardTitles(page);
    reliefTitles.forEach((t) => expect(titles, "画面の掲示板に救済が出ている").not.toContain(t));
    expect(errors, errors.join(" | ")).toEqual([]);
  });

  test("2回使い切りでも、一番安い依頼の遠征費に届くなら出ない／届かず回数が残っていれば出る", async ({ page }) => {
    const errors = await freshPage(page);
    await interview(page);
    const max = await page.evaluate(() => window.masterMoneyRules.maxBorrowCount);
    for (const cleared of [2, 8, undefined]) {
      const debt = { active: null, timesBorrowed: max, reliefLeft: 1 };
      const at = await reliefProbe(page, { cleared, debt, money: "cheapest" });
      expect(at.cheapest, "費用のかかる依頼が掲示板にある").toBeGreaterThan(0);
      expect(at.shown, `ちょうど届く（${at.money}）のに出た（進み ${cleared}）`).toBe(false);
      const below = await reliefProbe(page, { cleared, debt, money: "belowCheapest" });
      expect(below.shown, `届かないのに出ていない（${below.money} < ${below.cheapest}、進み ${cleared}）`).toBe(true);
      // ★ 固定の金額ではない：0 でも出る
      expect((await reliefProbe(page, { cleared, debt, money: 0 })).shown).toBe(true);
    }
    // ★ 「一番安い依頼」に費用0の依頼を数えない：はじめの掲示板（酒場＝費用あり／掃除＝費用0）で、所持金0なら出る
    const early = await reliefProbe(page, { cleared: 0, debt: { active: null, timesBorrowed: max, reliefLeft: 1 }, money: 0 });
    const freeVisible = await page.evaluate(() => buildBoardQuests(new Set(), state.reports, { withRelief: false }).some((q) => questFee(q) === 0));
    expect(freeVisible, "前提：費用0の依頼が掲示板に見えている").toBe(true);
    expect(early.shown, "費用0の依頼を一番安い依頼に数えている").toBe(true);
    // 借金中は今までどおり、金があっても出る
    expect((await reliefProbe(page, { debt: { active: { borrowed: 200, remaining: 50 }, timesBorrowed: 1, reliefLeft: 1 }, money: 100000 })).shown).toBe(true);
    expect(errors, errors.join(" | ")).toEqual([]);
  });

  test("回数を使い切ると、直前でも出ない", async ({ page }) => {
    const errors = await freshPage(page);
    await interview(page);
    const max = await page.evaluate(() => window.masterMoneyRules.maxBorrowCount);
    const inDebt = await reliefProbe(page, { debt: { active: { borrowed: 200, remaining: 120 }, timesBorrowed: 1, reliefLeft: 0 }, money: 0 });
    expect(inDebt.brink, "借金中は直前").toBe(true);
    expect(inDebt.shown, "借金中でも、回数を使い切ったら出ない").toBe(false);
    const spent = await reliefProbe(page, { debt: { active: null, timesBorrowed: max, reliefLeft: 0 }, money: 0 });
    expect(spent.brink, "2回使い切り・所持金0は直前").toBe(true);
    expect(spent.shown, "回数を使い切ったら出ない").toBe(false);
    // 画面の掲示板にも出ない
    await page.evaluate(() => setRoute("quests"));
    const reliefTitles = await page.evaluate(() => window.masterQuests.filter((q) => q.relief).map((q) => q.title));
    const titles = await boardTitles(page);
    reliefTitles.forEach((t) => expect(titles).not.toContain(t));
    expect(errors, errors.join(" | ")).toEqual([]);
  });

  test("★ ループ：救済だけを繰り返しても、回数で止まる", async ({ page }) => {
    const errors = await freshPage(page);
    await interview(page);
    // ★ 2回使い切り・所持金0。毎回、謝礼をほかで使い切った（＝直前のまま）ことにして、救済だけを出し続ける
    const got = await page.evaluate(() => {
      const per = window.masterMoneyRules.reliefPerBorrow;
      state.debt = { active: null, timesBorrowed: window.masterMoneyRules.maxBorrowCount, reliefLeft: per };
      const relief = window.masterQuests.find((q) => q.relief);
      let taken = 0;
      let brinkAtEnd = false;
      for (let i = 0; i < per * 10; i += 1) {
        state.money = 0;
        const board = buildBoardQuests(getClearedQuestIds(), state.reports);
        if (!board.some((q) => q.id === relief.id)) {
          brinkAtEnd = isOnBrinkOfClosing();
          break;
        }
        selectedQuestId = relief.id;
        selectedAdventurerIds = ["adv_mina"];
        selectedSharedItems = [];
        selectedObsHolders = [];
        startExpedition();
        const exp = state.expeditions.find((e) => e.questId === relief.id);
        if (!exp) return { error: "出発できなかった" };
        exp.startTime = Date.now() - exp.durationMs - 1_000;
        checkExpeditionCompletion();
        getAdventurer("adv_mina").status = "待機中";
        taken += 1;
      }
      return { per, taken, brinkAtEnd, left: state.debt.reliefLeft, gameOver: state.gameOver };
    });
    expect(got.error).toBeUndefined();
    expect(got.taken, "救済を受けられた回数＝借入1回あたりの回数").toBe(got.per);
    expect(got.left).toBe(0);
    expect(got.brinkAtEnd, "直前のままなのに出ない＝回数で止まった").toBe(true);
    // ★ 謝礼を貯めた場合も、回数を越えては受けられない（状態で抜けるか回数で止まるか、どちらでも per 回まで）
    const hoard = await page.evaluate(() => {
      const per = window.masterMoneyRules.reliefPerBorrow;
      state.debt = { active: null, timesBorrowed: window.masterMoneyRules.maxBorrowCount, reliefLeft: per };
      state.money = 0;
      const relief = window.masterQuests.find((q) => q.relief);
      let taken = 0;
      for (let i = 0; i < per * 10; i += 1) {
        if (!buildBoardQuests(getClearedQuestIds(), state.reports).some((q) => q.id === relief.id)) break;
        selectedQuestId = relief.id; selectedAdventurerIds = ["adv_mina"]; selectedSharedItems = []; selectedObsHolders = [];
        startExpedition();
        const exp = state.expeditions.find((e) => e.questId === relief.id);
        exp.startTime = Date.now() - exp.durationMs - 1_000;
        checkExpeditionCompletion();
        getAdventurer("adv_mina").status = "待機中";
        taken += 1;
      }
      return { per, taken };
    });
    expect(hoard.taken).toBeGreaterThan(0);
    expect(hoard.taken).toBeLessThanOrEqual(hoard.per);
    expect(errors, errors.join(" | ")).toEqual([]);
  });

  test("古いセーブ（残りの回数の鍵が無い）で壊れない：今の借入の回数がまるごと残っている扱い", async ({ page }) => {
    const errors = await freshPage(page);
    await interview(page);
    const key = await page.evaluate(() => {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      saved.debt = { active: null, timesBorrowed: window.masterMoneyRules.maxBorrowCount }; // ★ reliefLeft が無い（EX-173 より前の形）
      saved.money = 0;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
      return STORAGE_KEY;
    });
    expect(key).toBeTruthy();
    await page.reload();
    await page.waitForTimeout(400);
    const got = await page.evaluate(() => ({
      left: state.debt.reliefLeft, per: window.masterMoneyRules.reliefPerBorrow,
      shown: buildBoardQuests(getClearedQuestIds(), state.reports).some((q) => q.relief)
    }));
    expect(got.left).toBe(got.per);
    expect(got.shown, "古いセーブの直前で救済が出ていない").toBe(true);
    // 借りたことの無い古いセーブは0（直前が来ないので出番が無い）
    await page.evaluate(() => {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      saved.debt = { active: null, timesBorrowed: 0 };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    });
    await page.reload();
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => state.debt.reliefLeft)).toBe(0);
    await page.evaluate(() => setRoute("quests"));
    expect(errors, errors.join(" | ")).toEqual([]);
  });
});
