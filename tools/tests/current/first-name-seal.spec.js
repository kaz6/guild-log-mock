// 命名の直後の一言と、名前の長さの上限（2026-10-23・EX-162 の続き）。
//
// ★ 命名の直後の一言：**最初に名前の封をした瞬間に1度だけ**、命名の画面（生態目録の編集）の上に受付嬢のカードで出る。
//   本体でも出る。`state.firstNameSeal` に残し、リロードしても戻らない。2つ目の封では出ない。
//   古いセーブ（封は済んでいるが firstNameSeal が無い）では出ない——立てるのは封の操作の中だけ。
// ★ 名前の上限：プレイヤー名12字・命名20字（仮）。数えるのは文字数。入力欄で止め、「あと〇字」を出す。
const { test, expect } = require("@playwright/test");
const { freshPage, interview } = require("../helpers/app");

const AXES7 = ["形", "色", "大きさ", "数", "動き", "痕跡", "匂い"];
const putEntry = (page, id, extra = {}) => page.evaluate(({ id, axes, extra }) => {
  state.ecologyRecord = state.ecologyRecord ?? {};
  state.ecologyRecord[id] = { id, target: `対象${id}`, name: "", nameDraft: "", nameConfirmedAt: null,
    confirmed: axes.map((axis) => ({ axis, text: "見た" })), ...extra };
  saveState(); setRoute("ecology");
}, { id, axes: AXES7, extra });
const seal = async (page, id, name) => {
  await page.evaluate((id) => openEcologyRecordEditor(id), id);
  await page.locator("#er_name_draft").fill(name);
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "名前に封をする" }).click();
  await page.waitForTimeout(200);
};
const card = (page) => page.locator("[data-first-name-seal]");

test("最初の封の直後に1度だけ出る（名前入り）。読んだら消え、リロードしても、2つ目の封でも出ない", async ({ page }) => {
  const errors = await freshPage(page);
  await interview(page);
  await putEntry(page, "er_a");
  await putEntry(page, "er_b");
  await seal(page, "er_a", "ふくみみ");
  await expect(card(page)).toHaveCount(1);
  expect(await card(page).innerText()).toContain("あなたがこの子の、「ふくみみ」の名付け親になったんですよ！");
  await page.reload(); await page.waitForTimeout(300);          // 読む前のリロードでは残る
  await page.evaluate(() => openEcologyRecordEditor("er_a"));
  await expect(card(page)).toHaveCount(1);
  await card(page).locator(".window-next").click();
  expect(await card(page).innerText()).toContain("新しい発見に少し興奮してしまいましたね。");
  await card(page).getByRole("button", { name: "わかりました" }).click();
  await expect(card(page)).toHaveCount(0);
  await page.reload(); await page.waitForTimeout(300);
  await page.evaluate(() => openEcologyRecordEditor("er_a"));
  await expect(card(page)).toHaveCount(0);
  await seal(page, "er_b", "よるのめ");                          // 2つ目の封
  await expect(card(page)).toHaveCount(0);
  expect(await page.evaluate(() => state.firstNameSeal.name)).toBe("ふくみみ");
  expect(errors).toEqual([]);
});

test("古いセーブ（封は済み・firstNameSeal なし）では出ない", async ({ page }) => {
  const errors = await freshPage(page);
  await interview(page);
  await putEntry(page, "er_old", { name: "むかしのな", nameConfirmedAt: Date.now() - 1000 });
  await page.evaluate(() => { delete state.firstNameSeal; saveState(); });
  await page.reload(); await page.waitForTimeout(300);
  await page.evaluate(() => openEcologyRecordEditor("er_old"));
  await expect(card(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("名前の上限：プレイヤー名12字・命名20字で止まり、「あと〇字」が出る。古い長い名前は壊れない", async ({ page }) => {
  const errors = await freshPage(page);
  // プレイヤー名
  await page.getByRole("button", { name: "続き ▼" }).click();
  await page.getByRole("button", { name: "面接を始める" }).click();
  const nameInput = page.locator("#interviewNameInput");
  for (let i = 0; i < 5 && !(await nameInput.isVisible()); i++) await page.locator(".window-next").click();
  await expect(page.locator("#interviewNameHint")).toHaveText("あと12字");
  await nameInput.pressSequentially("あいうえおかきくけこさしすせそ");     // 15字
  await expect(nameInput).toHaveValue("あいうえおかきくけこさし");         // 12字で止まる
  await expect(page.locator("#interviewNameHint")).toHaveText("ここまでです");
  await nameInput.fill("カズ");
  await nameInput.dispatchEvent("input");
  await expect(page.locator("#interviewNameHint")).toHaveText("あと10字");
  // 命名（古いセーブの長い下書きも開ける）
  await page.evaluate(() => {
    state.player = { name: "とてもながいなまえのきろくいんさんです", personality: null, personalityLabel: null, personalityTags: [], interviewDone: true, appointedAt: Date.now() };
    saveState(); setRoute("home");
  });
  await putEntry(page, "er_c", { nameDraft: "あ".repeat(25) });
  await page.evaluate(() => openEcologyRecordEditor("er_c"));
  await expect(page.locator("#er_name_draft")).toHaveValue("あ".repeat(25)); // 読み込みでは切らない
  await page.locator("#er_name_draft").fill("");
  await page.locator("#er_name_draft").pressSequentially("い".repeat(23));
  await expect(page.locator("#er_name_draft")).toHaveValue("い".repeat(20));
  await expect(page.locator("#er_name_hint")).toHaveText("ここまでです");
  await page.evaluate(() => { closeEcologyRecordEditor(); setRoute("home"); });
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => document.body.innerText)).toContain("とてもながいなまえのきろくいんさんです"); // 長い記録員名でも描ける
  expect(errors).toEqual([]);
});
