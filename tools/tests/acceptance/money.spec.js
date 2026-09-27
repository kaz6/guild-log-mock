// 受け入れテスト：金と在庫と買い出しクエスト（2026-09-22・EX-143）。
//
// ★★ **未実装のものは `test.fixme` で持つ。実装が無いので走らせない。**
//   ★ 2026-09-26・EX-147 時点で fixme／skip は0本（残る1本は暫定確定の判定で、走って緑になる）。
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

// ★ 救済クエストの間隔（2026-09-26・EX-147 で**暫定確定**）：**金策ループの設計が決まるまで、運営不能の直前にしか出さない（N＝∞）**。
//   ★ 作者の確定事項「たまに出る」を**いったん止める判断**（黙って消えたのではない）。理由：費用0・報酬ありなので、頻繁に出ると繰り返すほど金が増える。
//   ★ 着手条件：金策ループの防ぎ方を設計するとき、「たまに出る」を戻すかを判断する。戻すならこのテストを N の判定へ書き直す。
//   ※ 旧版は N を引数に持って skip していた（裁定 2026-09-22「N は未確定のまま」）。暫定確定で判定できる形になったので skip を外した。
//   「直前」の定義＝借金中、または借金2回を使い切った状態（裁定 2026-09-22 の書き直し。作者の定義として確定ではない）。
test.describe("救済クエスト", () => {
  test("運営不能の直前以外には、掲示板に救済が出ない（N＝∞・暫定確定）", async ({ page }) => {
    const errors = await freshPage(page);
    await interview(page);
    // ★ 進み具合（解放の段）× 直前でない借金の状態の全組で、掲示板の候補を引く。
    //   救済を一度こなした後（報告書がある）も含める＝クールタイム明けで出てくる形を塞ぐ。
    const got = await page.evaluate(() => {
      const normal = window.masterQuests.filter((q) => !q.hidden && !q.relief).map((q) => q.id);
      const relief = window.masterQuests.filter((q) => q.relief).map((q) => q.id);
      const notBrink = [
        { active: null, timesBorrowed: 0 }, // 借りたことがない
        { active: null, timesBorrowed: 1 }  // 1回借りて返し終えた
      ];
      const seen = [];
      let checked = 0;
      for (let k = 0; k <= normal.length; k += 1) {
        for (const withRelief of [false, true]) {
          for (const debt of notBrink) {
            state.debt = { ...debt };
            const cleared = new Set([...normal.slice(0, k), ...(withRelief ? relief : [])]);
            if (isOnBrinkOfClosing()) return { error: "直前でない状態のはずが直前と判定された" };
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
      state.debt = { active: { borrowed: 200, remaining: 120 }, timesBorrowed: 1 };
      const brinkShows = buildBoardQuests(new Set(normal), state.reports).some((q) => q.relief);
      state.debt = { active: null, timesBorrowed: 0 };
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
});

// ⚠️ ★ **金策ループ（費用0・報酬ありの救済クエストを繰り返す穴）はここに入れない**
//   （裁定 2026-09-22：未確定のまま）。設計ページが自分で未確定と挙げている論点で、
//   防ぎ方が決まっていないものをテストにすると、**決まっていないことが決まったように見える。**
