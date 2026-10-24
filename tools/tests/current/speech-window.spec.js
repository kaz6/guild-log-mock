// 会話の窓に台本の文が収まるか（2026-10-23・EX-162 の続き）。
//
// ★ 台本（Notion「オープニング面接の台本（確定稿・2026-10-23）」）の文を、390px 幅の実際の描画で1ページずつ確かめる。
//   窓は4行ぶん（約60字）。段落で改ページし、入らない段落は行で、入らない行は「。！？」で割る（app.js の speechWindowPages）。
// ★ 見るのは「ページの中身が窓からはみ出していないか」（scrollHeight ≤ clientHeight）。文字数ではなく描画で見る
//   ——禁則で行頭に来られない字（「っ」など）が1行を押し出すことがあるため。
// ★ 通る道：無記名／記名（12字）・志望動機3通り・名簿の記録を保存／あとで（目的の一言を含む）・命名の直後の一言（名前20字）・白紙の本の一言・終わりの合図（/trial/）。
const { test, expect } = require("@playwright/test");
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { REPO, freshPage } = require("../helpers/app");

test.use({ viewport: { width: 390, height: 844 } });

// 見えている窓をすべて調べ、はみ出していれば記録する
const seenTexts = [];
async function checkWindows(page, overflow, seen) {
  const rows = await page.evaluate(() => [...document.querySelectorAll(".speech-window")]
    .filter((el) => el.offsetParent !== null)
    .map((el) => ({ id: el.dataset.window, page: el.dataset.page, text: el.innerText, over: el.scrollHeight - el.clientHeight })));
  rows.forEach((r) => {
    seen.add(`${r.id} ${r.page}`);
    seenTexts.push(r.text);
    if (r.over > 1) overflow.push(`${r.id}（${r.page}）はみ出し ${r.over}px：${r.text.replace(/\n/g, "／")}`);
  });
}

async function walkInterview(page, { name, motive, saveMemo }, overflow, seen) {
  const turnUntil = async (locator) => {
    for (let i = 0; i < 12; i++) {
      await checkWindows(page, overflow, seen);
      if (await locator.isVisible()) return;
      await page.locator(".window-next").first().click();
    }
    throw new Error("続きをめくっても目当てが出ない");
  };
  const click = async (text) => {
    const target = page.getByRole("button", { name: text, exact: true }).first();
    await turnUntil(target);
    await target.click();
  };
  await click("面接を始める");
  await turnUntil(page.locator("#interviewNameInput"));
  await page.locator("#interviewNameInput").fill(name);
  await click("次へ");
  await click(name ? "次へ" : "このまま進む");
  await click(["お金のため", "家が近いから", "この地域に興味あって"][motive]);
  for (let i = 0; i < 7; i++) await click("次へ");
  await click(saveMemo ? "記録を保存" : "あとで");
  await click("次へ");
  await click("はい");
}

test("台本の文が、どのページも会話の窓（390px・4行）からはみ出さない", async ({ page }) => {
  const overflow = [];
  const seen = new Set();
  const paths = [
    { name: "", motive: 0, saveMemo: false },
    { name: "あいうえおかきくけこさし", motive: 1, saveMemo: true },  // 名前12字（上限）
    { name: "カズ", motive: 2, saveMemo: false }
  ];
  for (const p of paths) {
    const errors = await freshPage(page);
    const from = seenTexts.length;
    await walkInterview(page, p, overflow, seen);
    expect(errors).toEqual([]);
    // ★ 目的の一言（EX-163・仮）は、名簿を保存した道にも「あとで」の道にも出る
    expect(seenTexts.slice(from).some((t) => t.includes("いつか西の未踏地域の生態目録になるんです")),
      `目的の一言を見ていない（saveMemo=${p.saveMemo}）`).toBe(true);
  }

  // 命名の直後の一言（名前20字＝上限）
  await page.evaluate(() => {
    state.ecologyRecord = { er_t: { id: "er_t", target: "森喰い兎", name: "", nameDraft: "", nameConfirmedAt: null, confirmed: [] } };
    state.firstNameSeal = { name: "あいうえおかきくけこさしすせそたちつてと", at: Date.now(), read: false };
    saveState(); openEcologyRecordEditor("er_t");
  });
  for (let i = 0; i < 5; i++) {
    await checkWindows(page, overflow, seen);
    const more = page.locator("[data-first-name-seal] .window-next");
    if (!(await more.isVisible())) break;
    await more.click();
  }
  expect(seenTexts.some((t) => t.includes("「あいうえおかきくけこさしすせそたちつてと」の名付け親")), "名前20字の一言を見ていない").toBe(true);

  // 白紙の本を渡す一言（EX-163 段階3・仮）
  await page.evaluate(() => {
    document.getElementById("ecologyRecordOverlay")?.remove();
    state.ecologyBook = { at: Date.now(), read: false };
    saveState(); setRoute("home");
  });
  for (let i = 0; i < 5; i++) {
    await checkWindows(page, overflow, seen);
    const more = page.locator("[data-ecology-book] .window-next");
    if (!(await more.isVisible())) break;
    await more.click();
  }
  expect(seenTexts.some((t) => t.includes("あなたが埋めていくんです")), "白紙の本の一言を見ていない").toBe(true);

  // 終わりの合図（/trial/ のコピーでだけ出る）
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "guild-window-"));
  const dest = path.join(tmp, "trial");
  execFileSync("node", ["scripts/make-trial.js", "--out", dest], { cwd: REPO });
  await page.goto(`file://${dest}/index.html`);
  await page.evaluate(() => {
    localStorage.clear();
  });
  await page.reload();
  await page.evaluate(() => {
    state.player = { name: "カズ", personality: null, personalityLabel: null, personalityTags: [], interviewDone: true, appointedAt: Date.now() };
    const r = generateReport({ questId: "quest_caravan_escort", adventurerIds: ["adv_mina"], adventurerItemIds: {}, seed: 11, departTimeOfDay: "昼", departWeather: "晴れ", startTime: 0, durationMs: 1 });
    r.id = "report_escort_w"; r.opened = true; state.reports.unshift(r);
    state.ecologyRecord = { er_t: { id: "er_t", target: "森喰い兎", name: "ふくみみ", nameConfirmedAt: Date.now(), confirmed: [] } };
    saveState(); setRoute("home");
  });
  for (let i = 0; i < 5; i++) {
    await checkWindows(page, overflow, seen);
    const more = page.locator("[data-trial-end] .window-next");
    if (!(await more.isVisible())) break;
    await more.click();
  }
  fs.rmSync(tmp, { recursive: true, force: true });

  console.log(`窓のページ ${seen.size}枚を確かめた`);
  if (process.env.SHOW_WINDOW_PAGES) console.log([...new Set(seenTexts)].join("\n---\n"));
  expect(overflow, `窓に収まらないページ:\n${overflow.join("\n")}`).toEqual([]);
  // 窓を通っていないものが無いこと（面接14段・命名の直後・終わりの合図）
  expect([...seen].some((k) => k.startsWith("firstNameSeal")), "命名の直後の一言を見ていない").toBe(true);
  expect([...seen].some((k) => k.startsWith("trialEnd")), "終わりの合図を見ていない").toBe(true);
  expect([...seen].some((k) => k.startsWith("ecologyBook")), "白紙の本の一言を見ていない").toBe(true);
});
