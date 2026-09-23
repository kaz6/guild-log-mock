// 受け入れテスト：金と在庫と買い出しクエスト（2026-09-22・EX-143）。
//
// ★★ **ここは全部 `test.fixme` で持つ。実装が無いので走らせない。**
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
const { freshPage, interview } = require("../helpers/app");

// ★ 未確定：救済クエストが出る間隔。裁定で「N は未確定のまま／受け入れテストは N を引数にして書く」。
//   決まったらここに入れる。null のままなら、その1件だけ判定を保留する。
const RELIEF_INTERVAL_N = null;

test.describe("借金", () => {
  test.fixme("所持金がマイナスになったら借りられる（そのとき借入イベントが出る）", async ({ page }) => {
    expect(await page.evaluate(() => canBorrow())).toBe(true);
  });

  test.fixme("借りた直後の所持金が正である", async ({ page }) => {
    // ★ 細則1の書き直し（裁定 2026-09-22）。原文は「赤字を埋めて少し余る額」で判定できない。
    //   借りた直後もマイナスのまま即運営不能、を起こさないことが狙い。
    expect(await page.evaluate(() => state.money)).toBeGreaterThan(0);
  });

  test.fixme("借金はゲーム全体で2回まで（3回目は借りられない）", async ({ page }) => {
    expect(await page.evaluate(() => state.debt.timesBorrowed)).toBe(2);
    expect(await page.evaluate(() => canBorrow())).toBe(false);
  });

  test.fixme("返済するまで次を借りられない（同時に抱えられる借金は1つ）", async ({ page }) => {
    expect(await page.evaluate(() => canBorrow())).toBe(false);
  });

  test.fixme("返済は自動（報酬から天引きされる）", async ({ page }) => {
    // ★ 手動だと、返済を忘れたまま次のマイナスで運営不能＝知らなかったで終わる理不尽になる
    expect(await page.evaluate(() => state.debt.remaining)).toBeLessThan(0);
  });

  test.fixme("2回目の借金をした時点で受付嬢との会話イベントが出る", async ({ page }) => {
    expect(await page.evaluate(() => document.body.innerText)).toContain("赤字");
  });
});

test.describe("運営不能", () => {
  test.fixme("条件①：借金中にさらにマイナスになったら運営不能", async ({ page }) => {
    expect(await page.evaluate(() => state.gameOver)).toBe(true);
  });

  test.fixme("条件②：1回借りて返済し、2回目を借りたあと再びマイナスで運営不能", async ({ page }) => {
    // ★ ここまでは許す、という裁定。2回目を借りた時点では運営不能にならない
    expect(await page.evaluate(() => state.gameOver)).toBe(true);
  });

  test.fixme("運営不能になったら直前（最後に綴じた記録）からやり直せる", async ({ page }) => {
    // ★ EX-141 で実装した「記録を綴じる／戻す」がそのまま使える（新しい仕組みは要らない）
    expect(await page.evaluate(() => latestBoundBook() !== null)).toBe(true);
  });
});

test.describe("遠征費", () => {
  test.fixme("遠征費で所持金を割り込む出発ができる（出発した瞬間に借金イベント）", async ({ page }) => {
    // ★「可能だが推奨しない行動は縛らない」。止めると、金が尽きたとき何もできなくなる
    expect(await page.evaluate(() => canStartExpedition())).toBe(true);
  });

  test.fixme("同時遠征の遠征費は1本ずつ引いて判定し、落ちた1本で止まる", async ({ page }) => {
    expect(await page.evaluate(() => (state.expeditions ?? []).length)).toBeGreaterThan(0);
  });
});

test.describe("在庫", () => {
  test.fixme("在庫の上限は5（6個目を買えない）", async ({ page }) => {
    expect(await page.evaluate(() => STOCK_LIMIT)).toBe(5);
  });

  test.fixme("出撃の画面に金額を出さない（節約は買い物の段階でする）", async ({ page }) => {
    // ★ 出撃ごとに支給品代を計上すると「削れば安く済む＝裸で送り出すのが最適解」になる
    expect(await page.evaluate(() => document.body.innerText)).not.toMatch(/支給品.*\d+\s*(G|金)/);
  });
});

test.describe("支給品はパーティ共有", () => {
  test.fixme("遠征ごとにパーティへ渡す（誰に持たせるかを選ばない）", async ({ page }) => {
    expect(await page.evaluate(() => document.querySelectorAll(".item-assign-btn").length)).toBe(0);
  });

  test.fixme("持てる量はメンバーのスロットの合計", async ({ page }) => {
    expect(await page.evaluate(() => partyItemCapacity(["adv_mina", "adv_gadd"]))).toBeGreaterThan(0);
  });

  test.fixme("使うのは語彙で選ばれた担い手（道具の行に名前が出る）", async ({ page }) => {
    // ★ 所持者と担い手の食い違いが消えるので、無人称にしていた道具の行に名前を出せる
    expect(await page.evaluate(() => document.body.innerText)).toMatch(/[ガミエロ][ッナルウ]/);
  });
});

test.describe("買い出しクエスト", () => {
  test.fixme("隊商護衛をクリアすると解禁される", async ({ page }) => {
    expect(await page.evaluate(() =>
      window.masterQuests.some((q) => q.unlockedBy === "quest_caravan_escort" && q.shopping))).toBe(true);
  });

  test.fixme("交渉の高い者を送ると安く買える", async ({ page }) => {
    // 交渉値だけを変えた2回で、支払額が下がること（額そのものは判定しない）
    expect(1).toBe(0);
  });

  test.fixme("荷物持ちは人数で決まる（多く連れて行けば多く買える）", async ({ page }) => {
    // ★ ステータスではなく人数。1人と3人で買える量が変わること
    expect(1).toBe(0);
  });

  test.fixme("欲しい支給品を「置いておく」枠が使える（在庫に無い物も置ける）", async ({ page }) => {
    // ★ 新しい画面を作らない。支給品を持たせる枠に別の意味を持たせる
    expect(await page.evaluate(() => document.querySelectorAll(".item-wish.is-ghost").length)).toBeGreaterThan(0);
  });
});

test.describe("救済クエスト", () => {
  test.fixme("費用0で報酬が出る", async ({ page }) => {
    expect(await page.evaluate(() => window.masterQuests.some((q) => q.relief && q.fee === 0))).toBe(true);
  });

  test.fixme("借金中、または借金2回を使い切った状態のとき、必ず枠に入る", async ({ page }) => {
    // ★ 「運営不能の直前」の書き直し（裁定 2026-09-22）。
    //   ⚠️ **作者の定義として確定ではない。違えばここを直す。**
    expect(await page.evaluate(() =>
      questBoardList().some((q) => q.relief))).toBe(true);
  });

  test.fixme("解禁後、掲示板の候補に N件に1回以上出る", async ({ page }) => {
    // ★ N は未確定（裁定 2026-09-22：「N は未確定のまま。受け入れテストは N を引数にして書く」）。
    test.skip(RELIEF_INTERVAL_N === null, "N が未確定なので判定できない");
    expect(RELIEF_INTERVAL_N).toBeGreaterThan(0);
  });
});

// ⚠️ ★ **金策ループ（費用0・報酬ありの救済クエストを繰り返す穴）はここに入れない**
//   （裁定 2026-09-22：未確定のまま）。設計ページが自分で未確定と挙げている論点で、
//   防ぎ方が決まっていないものをテストにすると、**決まっていないことが決まったように見える。**
