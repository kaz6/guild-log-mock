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
    for (const id of ["shelf", "badge", "counter", "backyard"]) {
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

test.describe("吹き出しの目次と帳簿（EX-161 段階2）", () => {
  test("書類→帳簿／名簿、ペン→報告メモ。入口が違っても開く先は同じ画面", async ({ page }) => {
    const errors = await freshPage(page);
    await interview(page);
    await page.locator('[data-room-object="papers"]').click({ force: true });
    await expect(page.locator(".room-bubble-item")).toHaveText(["帳簿", "名簿"]);
    await page.locator(".room-bubble-item", { hasText: "帳簿" }).click();
    expect(await page.evaluate(() => route)).toBe("ledger");
    await expect(page.locator(".paper-meter")).toHaveCount(3);
    await page.evaluate(() => setRoute("home"));
    await page.locator('[data-room-object="papers"]').click({ force: true });
    await page.locator(".room-bubble-item", { hasText: "名簿" }).click();
    const viaPapers = await page.evaluate(() => ({ route, title: document.getElementById("viewTitle").textContent }));
    await page.evaluate(() => setRoute("home"));
    await page.locator('[data-route="adventurers"]').click();
    const viaNav = await page.evaluate(() => ({ route, title: document.getElementById("viewTitle").textContent }));
    expect(viaPapers).toEqual(viaNav);
    await page.evaluate(() => { setRoute("home"); roomPanel = 2; render(); });
    await page.locator('[data-room-object="pen"]').click({ force: true });
    // 綴じるカードは最初の報告書を開くまで出ない＝目次にも出さない
    await expect(page.locator(".room-bubble-item")).toHaveText(["報告メモ"]);
    await page.locator(".room-bubble-item", { hasText: "報告メモ" }).click();
    expect(await page.evaluate(() => route)).toBe("observations");
    expect(errors).toEqual([]);
  });

  test("ホームの計器は外れ、帳簿と出発の画面に出る。1秒の再描画でも吹き出しは残り、枠を移すと閉じる", async ({ page }) => {
    await freshPage(page);
    await interview(page);
    await expect(page.locator("#app > .paper-meters")).toHaveCount(0);
    await page.evaluate(() => setRoute("quests"));
    await expect(page.locator(".paper-meters")).toContainText("所持金");
    await expect(page.locator(".paper-meters")).toContainText("持ち物");
    await expect(page.locator(".paper-meters")).toContainText("在席");
    await page.evaluate(() => { setRoute("home"); });
    await page.locator('[data-room-object="papers"]').click({ force: true });
    await page.waitForTimeout(1300);
    await expect(page.locator(".room-bubble")).toHaveCount(1);
    await page.locator(".room-arrow.right").click();
    await expect(page.locator(".room-bubble")).toHaveCount(0);
  });

  test("ペン→記録を綴じる：報告書を開いたあとは目次に出て、綴じるカードまで動く", async ({ page }) => {
    const errors = await freshPage(page);
    await interview(page);
    await page.evaluate(() => {
      const r = generateReport({ questId: "quest_tavern_errand", adventurerIds: ["adv_mina"], adventurerItemIds: {}, seed: 1, departTimeOfDay: "昼", departWeather: "晴れ", startTime: 0, durationMs: 1 });
      r.id = "report_room_bind"; r.opened = true;
      state.reports.unshift(r); roomPanel = 2; render();
    });
    await page.locator('[data-room-object="pen"]').click({ force: true });
    await expect(page.locator(".room-bubble-item")).toHaveText(["記録を綴じる", "報告メモ"]);
    await page.locator(".room-bubble-item", { hasText: "記録を綴じる" }).click();
    await page.waitForTimeout(900);
    await expect(page.locator(".room-bubble")).toHaveCount(0);
    expect(await page.evaluate(() => { const r = document.getElementById("bindCard").getBoundingClientRect(); return r.top >= 0 && r.top < window.innerHeight; })).toBe(true);
    expect(errors).toEqual([]);
  });

  test("受付嬢とエルシーをタップすると一言（仮）が出て、押すたびに替わる", async ({ page }) => {
    const errors = await freshPage(page);
    await interview(page);
    const notice = page.locator(".room-notice");
    await page.evaluate(() => { roomPanel = 0; render(); });
    await page.locator('button[data-room-object="receptionist"]').click({ force: true });
    await expect(notice).toHaveText("はい、なんでしょう。");
    await page.locator('button[data-room-object="receptionist"]').click({ force: true });
    await expect(notice).toHaveText("記録係さん、今日もお疲れさまです。");
    await page.locator(".room-arrow.right").click();
    await page.locator(".room-arrow.right").click();
    await expect(notice).toBeHidden();
    await page.locator('button[data-room-object="elsie"]').click({ force: true });
    await expect(notice).toHaveText("エルシーは尻尾を振った。");
    await page.locator('button[data-room-object="elsie"]').click({ force: true });
    await expect(notice).toHaveText("撫でると、エルシーは目を細めた。");
    expect(errors).toEqual([]);
  });
});
