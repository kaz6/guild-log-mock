// 序盤の掲示板（2026-10-23・作者が遊んで「買い出しと掃除は一緒にしたい」）。
// ★ 面接のあと、酒場と掃除が最初から2件並び、同時に出発させられる。6件は**両方を終えてから**開く（掃除だけでは開かない）。
const { test, expect } = require("@playwright/test");
const { freshPage, interview, boardTitles, seedClearedQuests } = require("../helpers/app");

const SIX = ["森の薬草採集", "結婚式の手伝い", "廃屋の片付け", "古い小橋の応急修理", "夕市帰りの親子の付き添い", "夜道に残る灯りの調査"];
const board = async (page) => { await page.evaluate(() => setRoute("quests")); await page.waitForTimeout(300); return boardTitles(page); };

test("最初は酒場と掃除の2件。掃除だけ終えても6件は開かない", async ({ page }) => {
  const errors = await freshPage(page);
  await interview(page);
  expect(await board(page)).toEqual(["隣の酒場に買い出し", "ギルドの掃除"]);
  await seedClearedQuests(page, ["quest_guild_cleanup"]);
  expect(await board(page)).toEqual(["隣の酒場に買い出し"]);
  expect(errors).toEqual([]);
});

test("酒場だけ終えても6件は開かず、両方を終えると6件が開く", async ({ page }) => {
  const errors = await freshPage(page);
  await interview(page);
  await seedClearedQuests(page, ["quest_tavern_errand"]);
  expect(await board(page)).toEqual(["ギルドの掃除"]);
  await seedClearedQuests(page, ["quest_guild_cleanup"]);
  expect((await board(page)).sort()).toEqual([...SIX].sort());
  expect(errors).toEqual([]);
});
