// 画面を触るための共通処理（2026-09-22・EX-143）。
const path = require("path");

const REPO = path.resolve(__dirname, "..", "..", "..");
const URL = `file://${REPO}/index.html`;

// ★ **どのテストも必ずここから始める**（EX-143 の裁定）。
//   file:// は全テストで同じオリジンなので、消さないと前のテストの保存を踏む。
//   ⚠️ 使い捨ての動線ハーネスは、1つのブラウザで依頼を連続で回して
//     「遠征開始が押せない」で2回中断した（負傷と回復待ちが溜まったため）。
//     **1テスト＝1つまっさらな状態**にして、その形を構造的に避ける。
async function freshPage(page) {
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push("console.error: " + m.text()); });
  await page.goto(URL);
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) { /* 私用モード等 */ } });
  await page.reload();
  await page.waitForTimeout(400);
  return errors;
}

// 面接（名前 → 気質 → 記録）を通す。
async function interview(page, name = "カズ") {
  await page.getByText("面接を始める").first().click();
  await page.waitForTimeout(250);
  await page.locator("#interviewNameInput").fill(name);
  await page.getByText("次へ").first().click();
  await page.waitForTimeout(250);
  await page.getByText("記録好き").first().click();
  await page.waitForTimeout(400);
  await page.getByText("名簿に記録する").first().click();
  await page.waitForTimeout(600);
}

// 掲示板に並んでいる依頼の題名。
function boardTitles(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll(".quest-card")].map((c) => c.querySelector("h3").innerText.replace("🚨 ", "")));
}

// ★ 解放状態だけを先に作る（本物の報告書を積む）。
//   ⚠️ 偽の形の行を入れない——報告書棚も掲示板も同じ配列を読むので、
//     形が足りないと描画側が落ちて「実装の不具合」に見える。
async function seedClearedQuests(page, questIds) {
  await page.evaluate((ids) => {
    ids.forEach((id, i) => {
      const r = generateReport({
        questId: id,
        adventurerIds: ["adv_mina"],
        adventurerItemIds: {},
        seed: 100 + i,
        departTimeOfDay: "昼",
        departWeather: "晴れ",
        startTime: 0,
        durationMs: 1,
      });
      r.id = `report_seed_${i}`;
      r.questId = id;
      state.reports.unshift(r);
    });
    saveState();
  }, questIds);
  await page.reload();
  await page.waitForTimeout(400);
}

// 掲示板から題名で1件選び、冒険者1人と支給品（あれば）を付けて出発する。
// speed … "等倍" / "60倍" / "3600倍"
async function departQuest(page, title, speed = "60倍") {
  await page.evaluate(() => setRoute("quests"));
  await page.waitForTimeout(400);
  const picked = await page.evaluate((t) => {
    const cards = [...document.querySelectorAll(".quest-card")];
    const i = cards.findIndex((c) => c.querySelector("h3").innerText.includes(t));
    if (i < 0) return null;
    cards[i].click();
    return cards[i].querySelector("h3").innerText;
  }, title);
  if (!picked) throw new Error(`掲示板に「${title}」がありません。並んでいるのは: ${(await boardTitles(page)).join(" / ")}`);
  await page.waitForTimeout(250);

  const chosen = await page.evaluate(() => {
    const free = [...document.querySelectorAll(".adventurer-card")]
      .filter((c) => /待機中/.test(c.innerText) && !/エルシー/.test(c.innerText));
    if (!free.length) return null;
    free[0].click();
    return (free[0].innerText.split("\n").find((l) => l.trim()) || "").trim();
  });
  if (!chosen) throw new Error("待機中の冒険者がいません（まっさらな状態から始めていない可能性）");
  await page.waitForTimeout(250);

  const item = page.locator(".item-assign-btn").first();
  if (await item.count()) { await item.click(); await page.waitForTimeout(250); }

  await page.getByText(speed, { exact: true }).first().click();
  await page.waitForTimeout(150);
  const reportsBefore = await page.evaluate(() => state.reports.length);
  const start = page.getByRole("button", { name: "遠征開始" });
  await start.click();
  return { picked, chosen, reportsBefore };
}

// 帰還を待ち、報告書が読める画面まで進める。
// ★ 「帰還を確認する」の**有無で判定しない**。あのボタンはホームの帰還カードにしか出ないので、
//   どの画面で完了したかで出たり出なかったりする（④-b で実際に出なかった）。
//   ★ 判定は**状態**で行う——遠征が1本も残っておらず、報告書が1通増えていること。
async function waitForReturn(page, reportsBefore, timeoutMs = 30_000) {
  await page.waitForFunction(
    (before) => (state.expeditions ?? []).length === 0 && state.reports.length > before,
    reportsBefore,
    { timeout: timeoutMs, polling: 200 }
  );
  const back = page.getByRole("button", { name: "帰還を確認する" }).first();
  if (await back.count()) {
    await back.click();
  } else {
    await page.evaluate(() => setRoute("result"));
  }
  await page.waitForTimeout(600);
}

module.exports = { REPO, URL, freshPage, interview, boardTitles, seedClearedQuests, departQuest, waitForReturn };
