// 願い（2026-10-30・EX-167）。設計：DECISION_LOG 2026-10-30「『未来』は『願い』に…」。文面は data-bonds.js の masterWishes。
// ★ 名簿の各冒険者の頁に「願い：＊＊＊」→ その人の固有依頼の感謝を読んだら本文。
// ★ 感謝を既に読んだ古いセーブでも、読み込んだ時点で開いている（state を増やさず連鎖から導く）。
const { test, expect } = require("@playwright/test");
const { freshPage, interview } = require("../helpers/app");

const ALL = ["adv_mina", "adv_gadd", "adv_elne", "adv_row", "adv_elsie"];
const wishOnRoster = (page, advId) => page.evaluate((id) => {
  setRoute("adventurers"); // ★ setRoute は選択を外すので、開いてから選ぶ
  editAdventurer(id);
  const sec = document.querySelector("[data-wish]");
  return sec ? { state: sec.dataset.wish, text: sec.innerText.trim() } : null;
}, advId);

test("感謝の前は全員「願い：＊＊＊」。鉄鍋の感謝を読むと鉄鍋だけ本文になる", async ({ page }) => {
  const errors = await freshPage(page);
  await interview(page);
  for (const id of ALL) {
    expect(await wishOnRoster(page, id), id).toEqual({ state: "closed", text: "願い：＊＊＊" });
  }
  // 封をしただけ（感謝は未読）ではまだ開かない
  await page.evaluate(() => { state.bondChain = { started: true, bond_gadd: { consultAt: 1, consultRead: true, thanksAt: 1 } }; saveState(); });
  expect((await wishOnRoster(page, "adv_gadd")).state).toBe("closed");
  await page.evaluate(() => dismissBondTalk("bond_gadd", "thanks"));
  const wish = await page.evaluate(() => window.masterWishes.adv_gadd);
  expect(await wishOnRoster(page, "adv_gadd")).toEqual({ state: "open", text: `願い：${wish}` });
  for (const id of ALL.filter((id) => id !== "adv_gadd")) {
    expect((await wishOnRoster(page, id)).text, id).toBe("願い：＊＊＊");
  }
  expect(errors).toEqual([]);
});

test("鉄鍋の感謝を既に読んだ古いセーブ（願いの欄が無い頃の保存）を読み込むと、鉄鍋の願いが開いている", async ({ page }) => {
  const errors = await freshPage(page);
  await interview(page);
  // 願いが入る前の保存の形：連鎖の進み具合だけがあり、願いに関わる欄は一つも無い
  await page.evaluate(() => {
    state.bondChain = { started: true, bond_gadd: { consultAt: 1, consultRead: true, thanksAt: 2, thanksRead: true } };
    saveState();
  });
  const raw = await page.evaluate(() => localStorage.getItem(STORAGE_KEY));
  expect(raw).not.toContain("wish");
  await page.reload();
  await page.waitForTimeout(400);
  const wish = await page.evaluate(() => window.masterWishes.adv_gadd);
  expect(await wishOnRoster(page, "adv_gadd")).toEqual({ state: "open", text: `願い：${wish}` });
  expect((await wishOnRoster(page, "adv_mina")).text).toBe("願い：＊＊＊");
  expect(errors).toEqual([]);
});

test("受付嬢の願いは伏せる（表に文を持たない）", async ({ page }) => {
  const errors = await freshPage(page);
  expect(await page.evaluate(() => window.masterWishes.reception)).toBeNull();
  expect(errors).toEqual([]);
});
