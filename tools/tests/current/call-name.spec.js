// 冒険者の呼び名は5文字以内（2026-10-24・EX-164【3】）。
// ★ 呼び名＝報告書・会話・名簿の表示で使う名前（getDisplayName：あだ名 → callName → 本名）。名簿の「本名」欄は長いままでよい。
// ★ 冒険者を増やす仕組み（名前の候補の表）は今は無い（2026-10-24 に app.js・data-*.js を検索して0件）。できたら、ここに足すこと。
const { test, expect } = require("@playwright/test");
const { freshPage } = require("../helpers/app");

test("全冒険者の呼び名が5文字以内（まっさらな状態）。エルネ・シェルカは「エルネ」、本名は長いまま", async ({ page }) => {
  const errors = await freshPage(page);
  const rows = await page.evaluate(() => state.adventurers.map((a) => ({ id: a.id, call: getDisplayName(a), name: a.name })));
  expect(rows.length).toBeGreaterThan(0);
  for (const r of rows) expect([...r.call].length, `${r.id} の呼び名「${r.call}」が5文字を超える`).toBeLessThanOrEqual(5);
  const elne = rows.find((r) => r.id === "adv_elne");
  expect(elne.call).toBe("エルネ");
  expect(elne.name).toBe("エルネ・シェルカ");
  // 報告書の本文に本名（長い名前）が出ない
  const body = await page.evaluate(() => {
    const r = generateReport({ questId: "quest_herb", adventurerIds: ["adv_elne", "adv_mina"], adventurerItemIds: {}, seed: 3, departTimeOfDay: "昼", departWeather: "晴れ", startTime: 0, durationMs: 1 });
    return r.logs.map((l) => l.text).join("\n");
  });
  expect(body).toContain("エルネ");
  expect(body).not.toContain("エルネ・シェルカ");
  expect(errors).toEqual([]);
});

// あだ名は5文字まで（2026-10-24・EX-165。EX164-Q2 の裁定）。入力欄で止め「あと〇字」を出す。古いセーブの長いあだ名は切らない。
test("あだ名は5文字で止まり「あと〇字」が出る。古い長いあだ名は読み込みでも保存し直しでも切らない", async ({ page }) => {
  const { interview } = require("../helpers/app");
  const errors = await freshPage(page);
  await interview(page);
  await page.evaluate(() => { setRoute("adventurers"); editingAdventurerId = "adv_mina"; render(); });
  const input = page.locator("#nicknameInput");
  await expect(page.locator("#nicknameHint")).toHaveText("あと3字"); // 既定の「ミナ」
  await input.fill("");
  await input.pressSequentially("あいうえおかき");
  await expect(input).toHaveValue("あいうえお");
  await expect(page.locator("#nicknameHint")).toHaveText("ここまでです");
  await page.evaluate(() => saveAdventurerMemo("adv_mina"));
  expect(await page.evaluate(() => getAdventurer("adv_mina").nickname)).toBe("あいうえお");
  // 古いセーブの長いあだ名
  await page.evaluate(() => { getAdventurer("adv_row").nickname = "ながいあだなです"; saveState(); });
  await page.reload(); await page.waitForTimeout(300);
  expect(await page.evaluate(() => getAdventurer("adv_row").nickname)).toBe("ながいあだなです");
  await page.evaluate(() => { setRoute("adventurers"); editingAdventurerId = "adv_row"; render(); saveAdventurerMemo("adv_row"); });
  expect(await page.evaluate(() => getAdventurer("adv_row").nickname), "打ち直さずに保存しても切らない").toBe("ながいあだなです");
  expect(errors).toEqual([]);
});
