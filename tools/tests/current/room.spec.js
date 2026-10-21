// ホームの窓（EX-161 段階1）。縦長の3枚を▶◀で切り替え、触れる物から今ある画面を開く。
const { test, expect } = require("@playwright/test");
const { freshPage, interview } = require("../helpers/app");

const strip = (page) => page.locator(".room-strip");
const panelIndex = (page) => page.evaluate(() => roomPanel);

test.describe("ホームの窓（EX-161）", () => {
  test("起動時は真ん中。▶◀で3枚が切り替わり、端で止まる", async ({ page }) => {
    const errors = await freshPage(page);
    await interview(page);
    expect(await panelIndex(page)).toBe(1);
    await page.locator(".room-arrow.right").click();
    expect(await panelIndex(page)).toBe(2);
    await expect(page.locator(".room-arrow.right")).toBeDisabled();
    await page.locator(".room-arrow.left").click();
    await page.locator(".room-arrow.left").click();
    expect(await panelIndex(page)).toBe(0);
    await expect(page.locator(".room-arrow.left")).toBeDisabled();
    // 1秒ごとの再描画のあとも位置は戻らない
    await page.waitForTimeout(1300);
    expect(await panelIndex(page)).toBe(0);
    expect(await strip(page).evaluate((e) => e.style.transform)).toBe("translateX(0%)");
    expect(errors).toEqual([]);
  });

  test("掲示板・本・書類の山から今ある画面が開く。用途の無い物は枠も反応も無い", async ({ page }) => {
    const errors = await freshPage(page);
    await interview(page);
    await page.locator('[data-room-object="board"]').click({ force: true });
    expect(await page.evaluate(() => route)).toBe("quests");
    await page.evaluate(() => { setRoute("home"); roomPanel = 0; render(); });
    await page.locator('[data-room-object="book"]').click({ force: true });
    expect(await page.evaluate(() => route)).toBe("ecology");
    await page.evaluate(() => { setRoute("home"); roomPanel = 2; render(); });
    await page.locator('[data-room-object="pile"]').click({ force: true });
    expect(await page.evaluate(() => route)).toBe("home");
    // 押すと報告書棚が見える位置まで動く（画面は home のまま）
    await page.waitForTimeout(700);
    expect(await page.evaluate(() => { const r = document.getElementById("reportShelf").getBoundingClientRect(); return r.top >= 0 && r.top < window.innerHeight; })).toBe(true);
    for (const id of ["shelf", "badge", "counter", "backyard", "receptionist", "papers", "pen", "elsie"]) {
      await expect(page.locator(`button[data-room-object="${id}"]`)).toHaveCount(0);
    }
    expect(errors).toEqual([]);
  });

  test("墓標は死者がいないと出ない。いれば出て、押すと準備中", async ({ page }) => {
    const errors = await freshPage(page);
    await interview(page);
    await expect(page.locator('[data-room-object="grave"]')).toHaveCount(0);
    await page.evaluate(() => { state.adventurers[0].status = "死亡"; roomPanel = 2; render(); });
    await expect(page.locator('button[data-room-object="grave"]')).toHaveCount(1);
    await page.locator('button[data-room-object="grave"]').click({ force: true });
    await expect(page.locator(".room-notice")).toContainText("準備中");
    // 別の画面へ移って戻っても、一言は居残らない
    await page.evaluate(() => { setRoute("quests"); setRoute("home"); });
    await expect(page.locator(".room-notice")).toBeHidden();
    expect(errors).toEqual([]);
  });

  test("今のホームの文が窓の下に残っている", async ({ page }) => {
    await freshPage(page);
    await interview(page);
    await expect(page.locator(".reception .speech")).toBeVisible();
    const order = await page.evaluate(() => {
      const w = document.querySelector(".room-window").getBoundingClientRect().bottom;
      return document.querySelector(".reception .speech").getBoundingClientRect().top >= w;
    });
    expect(order).toBe(true);
  });
});
