// ホームの付箋（2026-10-23・EX-163 段階2）。
// ★ 「次にすること」を1枚だけ貼る。やり終えたら消え、次の区切りで次の1枚だけ。タップで剝がせる。最初の封のあとは出ない。
// ★ 区切りは今ある記録から読む（面接済み／遠征・報告書の有無／開封／生態目録の枠・軸・封）。
const { test, expect } = require("@playwright/test");
const { freshPage, interview, seedClearedQuests, departQuest } = require("../helpers/app");

const AXES7 = ["形", "色", "大きさ", "数", "動き", "痕跡", "匂い"];

async function notes(page) {
  await page.evaluate(() => setRoute("home"));
  await page.waitForTimeout(200);
  return page.evaluate(() => [...document.querySelectorAll(".sticky-note")].map((el) => el.dataset.sticky));
}

test("面接のあと→出発→帰還→開封：いつも1枚だけで、やり終えたら消える", async ({ page }) => {
  const errors = await freshPage(page);
  expect(await page.locator(".sticky-note").count(), "面接の前は出ない").toBe(0);
  await interview(page);
  expect(await notes(page)).toEqual(["afterInterview"]);

  await departQuest(page, "隣の酒場に買い出し", "等倍");
  expect(await notes(page), "1本だけ出したときは「2つの依頼を」が残る").toEqual(["afterInterview"]);
  await departQuest(page, "ギルドの掃除", "等倍");
  expect(await notes(page), "出発しているあいだ").toEqual(["departed"]);

  // 帰還（報告書が1通届いた）。遠征は畳んでおく
  await page.evaluate(() => { state.expeditions = []; saveState(); });
  await seedClearedQuests(page, ["quest_tavern_errand"]);
  expect(await notes(page), "帰ってきたとき").toEqual(["returned"]);

  await page.evaluate(() => { state.reports[0].opened = true; saveState(); });
  expect(await notes(page), "読んだら消え、次の区切りまで何も貼らない").toEqual([]);
  // ★ 前の区切りに戻らない（掃除を出していなくても「2つの依頼を」は戻ってこない）
  await page.reload(); await page.waitForTimeout(300);
  expect(await notes(page)).toEqual([]);
  expect(errors).toEqual([]);
});

test("最初の生き物→観察を書く→名前を付けられる→最初の封のあとは出ない", async ({ page }) => {
  const errors = await freshPage(page);
  await interview(page);
  await seedClearedQuests(page, ["quest_tavern_errand"]);
  const setEntry = (confirmed, sealed = false) => page.evaluate(([c, s]) => {
    state.reports.forEach((r) => { r.opened = true; });
    state.ecologyRecord = { er_t: { id: "er_t", target: "森喰い兎", name: s ? "ふくみみ" : null, nameDraft: "", nameConfirmedAt: s ? Date.now() : null,
      area: "", category: "", confirmed: c.map((axis) => ({ axis, text: "見た" })), guess: "", nextCheck: "", legacy: "" } };
    saveState();
  }, [confirmed, sealed]);

  await setEntry([]);
  expect(await notes(page), "最初の生き物に出会ったとき").toEqual(["firstCreature"]);
  await setEntry(["形"]);
  expect(await notes(page), "観察を1つ書いたら消える").toEqual([]);
  await setEntry(AXES7);
  expect(await notes(page), "名前を付けられるようになったとき").toEqual(["canName"]);
  await setEntry(AXES7, true);
  expect(await notes(page), "最初の封のあとは出ない").toEqual([]);
  // 剝がした印を消しても、封のあとは出ない
  await page.evaluate(() => { state.stickyDismissed = {}; saveState(); });
  expect(await notes(page)).toEqual([]);
  expect(errors).toEqual([]);
});

test("タップで剝がせて、リロードしても戻らない", async ({ page }) => {
  const errors = await freshPage(page);
  await interview(page);
  expect(await notes(page)).toEqual(["afterInterview"]);
  await page.locator(".sticky-note").click();
  await page.waitForTimeout(200);
  expect(await notes(page)).toEqual([]);
  await page.reload(); await page.waitForTimeout(300);
  expect(await notes(page)).toEqual([]);
  // 次の区切りでは次の1枚が貼られる
  await departQuest(page, "隣の酒場に買い出し", "等倍");
  await departQuest(page, "ギルドの掃除", "等倍");
  expect(await notes(page)).toEqual(["departed"]);
  expect(errors).toEqual([]);
});
