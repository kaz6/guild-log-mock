// 表示の位置（2026-10-23・作者の指摘「表示が毎度下になって、上に戻さないと読めない」）。
// ★ 画面を移ったら一番上から見せる。面接の段・ページが進んだら会話の窓が見える位置まで動かす。
const { test, expect } = require("@playwright/test");
const { freshPage, interview } = require("../helpers/app");

test.use({ viewport: { width: 390, height: 844 } });

const windowInView = (page) => page.evaluate(() => {
  const el = document.querySelector(".speech-window");
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.top >= 0 && r.bottom <= window.innerHeight;
});

test("画面を移ると一番上から見える", async ({ page }) => {
  const errors = await freshPage(page);
  await interview(page);
  await page.evaluate(() => setRoute("adventurers"));
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await page.locator('[data-route="quests"]').first().click();
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  expect(errors).toEqual([]);
});

test("面接：段・ページが進むと会話の窓が画面に入る（窓が画面の外にあっても）", async ({ page }) => {
  const errors = await freshPage(page);
  await page.setViewportSize({ width: 390, height: 520 }); // 低い画面（窓が画面の外に出うる高さ）で確かめる
  // 続き（段0の1→2ページ）→ 面接を始める（段0→1）→ 続き（段1の1→2ページ）の3つの送りで確かめる
  // ★ 押すのはページ側の click()（Playwright の click は押す前にボタンまで自分でスクロールしてしまい、確かめにならない）
  const press = (sel) => page.evaluate((s) => document.querySelector(s).click(), sel);
  const steps = [
    () => press(".window-next"),
    () => page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "面接を始める").click()),
    () => press(".window-next")
  ];
  for (const [i, act] of steps.entries()) {
    await page.evaluate(() => window.scrollTo(0, 0)); // 上に残ったまま（窓が画面の下の外）から送る
    await act();
    await page.waitForTimeout(700); // なめらかなスクロールを待つ
    expect(await windowInView(page), `${i + 1}回目の送り`).toBe(true);
  }
  expect(errors).toEqual([]);
});
