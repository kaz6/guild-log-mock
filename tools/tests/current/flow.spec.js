// CLAUDE.md「4. 動作確認の手順」の8項目（2026-09-22・EX-143）。
//
// ★ ①〜⑧ は**一続きの通しプレイ**なので、1つの describe.serial で同じページを使う。
//   ⑦（リロードで状態が残る）は前の項目の結果に乗るので、独立させられない。
//   ⚠️ ただし**この describe に入る前に localStorage を消す**（EX-143 の裁定）。
//
// ★ ④ を2つに割ってある。CLAUDE.md は「遠征開始 →『Mock用』ボタン → リザルト」と1行で書くが、
//   最初の依頼（隣の酒場に買い出し）は**実10秒**なので、60倍だと約0.17秒で終わって
//   ボタンを目視できない（CLAUDE.md 3.6 が警告しているとおり）。等倍だとボタンが出ない。
//   → ④-a は酒場を**等倍**で通し、④-b は**廃屋（実1分＝60倍で約1秒）**で
//     ボタンそのものを見る。**どちらも落とさない。**
const { test, expect } = require("@playwright/test");
const { freshPage, interview, boardTitles, seedClearedQuests, departQuest, waitForReturn } = require("../helpers/app");

test.describe.serial("CLAUDE.md の動作確認8項目", () => {
  let page, errors, statsBefore;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    errors = await freshPage(page);
  });
  test.afterAll(async () => { await page.close(); });

  test("① 初回起動（localStorage が空）で面接画面が出る", async () => {
    await expect(page.getByText("面接を始める").first()).toBeVisible();
  });

  test("② 名前入力・気質選択を終えるとホーム画面（受付嬢）に移る", async () => {
    await interview(page, "カズ");
    const txt = await page.evaluate(() => document.body.innerText);
    expect(txt).toContain("依頼を選ぶ");
    expect(txt).toContain("報告書棚");
    statsBefore = await page.evaluate(() =>
      JSON.parse(JSON.stringify(state.adventurers.map((a) => ({ id: a.id, name: a.name, stats: a.stats })))));
  });

  test("③ 掲示板に依頼が並ぶ（初回は「隣の酒場に買い出し」1件）", async () => {
    await page.getByText("依頼を選ぶ").first().click();
    await page.waitForTimeout(600);
    const titles = await boardTitles(page);
    expect(titles, `並んでいるのは: ${titles.join(" / ")}`).toEqual(["隣の酒場に買い出し"]);
  });

  test("④-a 依頼＋冒険者＋支給品を選んで遠征開始 → リザルト画面が出る", async () => {
    // ★ 等倍。実10秒なので待てる。加速すると遠征中の画面をほぼ通らない
    const { reportsBefore } = await departQuest(page, "隣の酒場に買い出し", "等倍");
    await waitForReturn(page, reportsBefore, 40_000);
    const txt = await page.evaluate(() => document.body.innerText);
    expect(txt).toContain("報告書を読む");
  });

  test("⑤-a 「報告書を読む」で報告書が開く", async () => {
    await page.getByRole("button", { name: "報告書を読む" }).first().click();
    await page.waitForTimeout(800);
    expect(await page.evaluate(() => document.body.innerText)).toContain("開封済み");
  });

  test("⑥ 冒険者名簿の任務能力が遠征前より増えている", async () => {
    await page.evaluate(() => setRoute("adventurers"));
    await page.waitForTimeout(500);
    const after = await page.evaluate(() =>
      JSON.parse(JSON.stringify(state.adventurers.map((a) => ({ id: a.id, name: a.name, stats: a.stats })))));
    const grown = [];
    after.forEach((a) => {
      const b = statsBefore.find((x) => x.id === a.id);
      Object.keys(a.stats).forEach((k) => { if (a.stats[k] > b.stats[k]) grown.push(`${a.name} ${k} ${b.stats[k]}→${a.stats[k]}`); });
    });
    expect(grown.length, "遠征前より増えた任務能力が1つも無い").toBeGreaterThan(0);
    expect(await page.evaluate(() => document.body.innerText)).toMatch(/戦闘|探索|調査/);
  });

  test("⑦ リロードで面接に戻らず、報告書と名簿の状態が残る", async () => {
    const before = await page.evaluate(() => state.reports.length);
    expect(before).toBeGreaterThan(0);
    await page.reload();
    await page.waitForTimeout(1000);
    const after = await page.evaluate(() => ({
      txt: document.body.innerText, reports: state.reports.length, keeper: state.player ? state.player.name : null }));
    expect(after.txt).not.toContain("面接を始める");
    expect(after.reports).toBe(before);
    expect(after.keeper).toBe("カズ");
  });

  test("⑧ Console に赤エラーが出ていない", async () => {
    // ※ CLAUDE.md の例外（HTTPサーバ経由の favicon.ico 404）は file:// では出ない
    expect(errors, errors.join(" | ")).toEqual([]);
  });
});

test("④-b 「Mock用：扉の音を待たず報告書を届ける」で即帰還できる", async ({ page }) => {
  // ★ 加速中しか出ないボタンなので、**実時間の長い依頼**で見る（CLAUDE.md 3.6）。
  //   廃屋は実1分＝60倍で約1秒あり、酒場（0.17秒）と違って確実に通る。
  const errors = await freshPage(page);
  await interview(page, "カズ");
  await seedClearedQuests(page, ["quest_tavern_errand", "quest_guild_cleanup"]);
  const { reportsBefore } = await departQuest(page, "廃屋の片付け", "60倍");
  const mock = page.getByText("Mock用：扉の音を待たず報告書を届ける").first();
  await mock.waitFor({ timeout: 5_000 });
  await mock.click();
  await waitForReturn(page, reportsBefore, 20_000);
  expect(await page.evaluate(() => document.body.innerText)).toContain("報告書を読む");
  expect(errors, errors.join(" | ")).toEqual([]);
});

test("⑤-b 交戦した依頼の報告書に「Nダメージ」表記の交戦ログが出る", async ({ page }) => {
  // ★ 畑まで実際に5件こなすと、負傷と回復待ちで「遠征開始が押せない」に当たる
  //   （使い捨ての動線ハーネスが2回そこで中断した）。
  //   ここが見るのは**交戦ログの描画**なので、本物の報告書を積んで画面で開く形にする。
  const errors = await freshPage(page);
  await interview(page, "カズ");
  await seedClearedQuests(page, ["quest_tavern_errand", "quest_guild_cleanup",
    "quest_old_house_cleanup", "quest_signpost", "quest_field_mystery"]);
  const id = await page.evaluate(() => (state.reports.find((r) => r.questId === "quest_field_mystery") || {}).id);
  expect(id, "畑の報告書が積めていない").toBeTruthy();
  await page.evaluate((x) => openReport(x), id);
  await page.waitForTimeout(700);
  const txt = await page.evaluate(() => document.body.innerText);
  expect(txt, "交戦ログにダメージの表記が無い").toMatch(/\d+ダメージ/);
  expect(errors, errors.join(" | ")).toEqual([]);
});
