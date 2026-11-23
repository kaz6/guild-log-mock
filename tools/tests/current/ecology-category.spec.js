// 生態目録の分類欄の選択肢（2026-11-23・P-007。作者の裁定）。
//
// ★ 選択肢は11語：獣・鳥・虫・植物・水棲・家畜・人・魔物・怪異・石・人工物（空欄＝未分類）。「菌類」「その他」は外した。
// ★ 古いセーブで「菌類」「その他」を選んでいた頁は、読み込み時に未分類へ戻す。ほかの分類の頁は変えない。セーブの形は変えない。
const { test, expect } = require("@playwright/test");
const { freshPage, interview } = require("../helpers/app");

const WORDS = ["獣", "鳥", "虫", "植物", "水棲", "家畜", "人", "魔物", "怪異", "石", "人工物"];

test("分類欄の選択肢は、未分類＋11語（菌類・その他は無い）", async ({ page }) => {
  const errors = await freshPage(page);
  await interview(page);
  await page.evaluate(() => {
    state.ecologyRecord = { er_x: { id: "er_x", target: "対象x", name: null, nameDraft: "", nameConfirmedAt: null, area: "", category: "", confirmed: [], guess: "", nextCheck: "", legacy: "" } };
    saveState(); setRoute("ecology"); openEcologyRecordEditor("er_x");
  });
  const options = await page.locator("#er_category option").allInnerTexts();
  expect(options).toEqual(["未分類", ...WORDS]);
  expect(await page.evaluate(() => ECOLOGY_RECORD_CATEGORIES)).toEqual(WORDS);
  expect(options).not.toContain("菌類");
  expect(options).not.toContain("その他");
  expect(errors).toEqual([]);
});

test("古いセーブ：菌類・その他の頁は未分類へ戻り、ほかの分類は残る（移行前の形・移行済みの形の両方）", async ({ page }) => {
  const errors = await freshPage(page);
  await interview(page);
  await page.evaluate(() => {
    const base = { name: null, nameDraft: "", nameConfirmedAt: null, area: "", confirmed: [], guess: "", nextCheck: "", legacy: "" };
    state.ecologyRecord = {
      er_1: { ...base, id: "er_1", target: "茸の対象", category: "菌類" },
      er_2: { ...base, id: "er_2", target: "その他の対象", category: "その他" },
      er_3: { ...base, id: "er_3", target: "獣の対象", category: "獣" },
      er_4: { ...base, id: "er_4", target: "未分類の対象", category: "" },
      er_5: { ...base, id: "er_5", target: "人工物の対象", category: "人工物" }
    };
    // 移行前の形（名前がキー・id なし）
    state.ecologyRecord["旧・茸"] = { target: "旧・茸", category: "菌類" };
    state.ecologyRecord["旧・植物"] = { target: "旧・植物", category: "植物" };
    saveState();
  });
  await page.reload(); await page.waitForTimeout(400);
  const cats = await page.evaluate(() => Object.fromEntries(Object.values(state.ecologyRecord).map((e) => [e.target, e.category])));
  expect(cats).toEqual({
    "茸の対象": "", "その他の対象": "", "獣の対象": "獣", "未分類の対象": "", "人工物の対象": "人工物", "旧・茸": "", "旧・植物": "植物"
  });
  // 戻した頁は、分類欄が「未分類」で開く
  await page.evaluate(() => { setRoute("ecology"); openEcologyRecordEditor("er_1"); });
  expect(await page.locator("#er_category").inputValue()).toBe("");
  expect(errors).toEqual([]);
});
