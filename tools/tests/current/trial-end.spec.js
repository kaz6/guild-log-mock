// 体験版の終わりの合図（2026-10-19・EX-158【3】の裁定＝1A・2a・3trial）。
//
// ★ 条件：「隊商護衛の報告書を開いた（結末は問わない）」∧「名前の封が1つ以上」（後に来たほうで1度だけ）。
// ★ 出し方：ホームの受付嬢のカード1枚。読んだら消える。
// ★ 有効範囲：`/trial/` のコピーだけ。本体では条件がそろっても出ない（外し忘れが構造上起きない）。
// コピーは `scripts/make-trial.js --out` で試験のたびに作る（trial-storage.spec.js と同じ）。
const { test, expect } = require("@playwright/test");
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { REPO, PLAIN_URL, freshPage, interview } = require("../helpers/app");

let tmp, trialUrl;
test.beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "guild-trialend-"));
  const dest = path.join(tmp, "trial");
  execFileSync("node", ["scripts/make-trial.js", "--out", dest], { cwd: REPO });
  trialUrl = `file://${dest}/index.html`;
});
test.afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

// 隊商護衛の報告書を積む（opened / result を指定）。名前の封は ecologyRecord に直に置く。
const addEscort = (page, { opened, result = "護衛成功" }) => page.evaluate(({ opened, result }) => {
  const r = generateReport({ questId: "quest_caravan_escort", adventurerIds: ["adv_mina"], adventurerItemIds: {}, seed: 11, departTimeOfDay: "昼", departWeather: "晴れ", startTime: 0, durationMs: 1 });
  r.id = "report_escort_t"; r.opened = opened; r.result = result;
  state.reports.unshift(r); saveState(); setRoute("home");
}, { opened, result });
const addName = (page) => page.evaluate(() => {
  state.ecologyRecord = { er_t: { id: "er_t", target: "森喰い兎", name: "ふくみみ", nameConfirmedAt: Date.now(), confirmed: [] } };
  saveState(); setRoute("home");
});
const card = (page) => page.locator("[data-trial-end]");
const goHome = async (page) => { await page.evaluate(() => setRoute("home")); await page.waitForTimeout(200); };

test.describe("体験版の終わりの合図（EX-158【3】）", () => {
  test("コピー：護衛を開いてから名前の封→出る。3行・読んだら消え、リロードしても戻らない", async ({ page }) => {
    const errors = await freshPage(page);
    await page.goto(trialUrl); await page.evaluate(() => localStorage.clear()); await page.reload(); await page.waitForTimeout(300);
    await interview(page);
    await addEscort(page, { opened: true });
    await expect(card(page)).toHaveCount(0);              // 護衛だけでは出ない
    await addName(page);
    await expect(card(page)).toHaveCount(1);
    const text = await card(page).innerText();
    expect(text).toContain("最初の名前に、封をなさったんですね。");
    expect(text).toContain("いまお見せできる記録は、ここまでです。");
    expect(text).toContain("続きの頁は、まだ白紙のままです。");
    await page.reload(); await page.waitForTimeout(300);   // 読む前にリロードしても残る
    await expect(card(page)).toHaveCount(1);
    await card(page).getByRole("button", { name: "わかりました" }).click();
    await expect(card(page)).toHaveCount(0);
    await page.reload(); await page.waitForTimeout(300);
    await expect(card(page)).toHaveCount(0);               // 1度だけ
    await goHome(page);
    await expect(card(page)).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("コピー：逆の順（名前の封→護衛を開く）でも、後に来たほうで出る。未開封の護衛・失敗の結末の扱い", async ({ page }) => {
    await freshPage(page);
    await page.goto(trialUrl); await page.evaluate(() => localStorage.clear()); await page.reload(); await page.waitForTimeout(300);
    await interview(page);
    await addName(page);
    await expect(card(page)).toHaveCount(0);               // 名前だけでは出ない
    await addEscort(page, { opened: false });
    await expect(card(page)).toHaveCount(0);               // 護衛が未開封（帰還しただけ）では出ない
    await page.evaluate(() => { state.reports.find((r) => r.id === "report_escort_t").opened = true; state.reports[0].result = "護衛失敗"; saveState(); setRoute("home"); });
    await expect(card(page)).toHaveCount(1);               // 開いた時点で出る。結末（失敗）は問わない
  });

  test("本体：条件がそろっても出ない（state も立てない）", async ({ page }) => {
    await freshPage(page);
    await interview(page);
    await addEscort(page, { opened: true });
    await addName(page);
    await page.waitForTimeout(200);
    await expect(card(page)).toHaveCount(0);
    expect(await page.evaluate(() => state.trialEnd)).toBeNull();
    expect(PLAIN_URL).toContain("index.html");
  });
});
