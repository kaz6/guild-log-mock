// 冒険者の過去（2026-09-24・EX-146）。設計：DECISION_LOG 2026-09-24「冒険者に『過去』を持たせる」。
//   ★ 文面と閾値は data-past.js（どちらも仮）。ここでは**値そのものは判定しない**——閾値はデータから読み、
//     「その数で開く／手前では開かない」だけを見る。
const { test, expect } = require("@playwright/test");
const { freshPage, interview } = require("../helpers/app");
const { runDispatch } = require("../helpers/money");

// 本物の報告書を n 通積む（その冒険者が参加した遠征として）。★ 偽の形の行は入れない
async function seedPartyReports(page, party, n) {
  await page.evaluate(({ party, n }) => {
    for (let i = 0; i < n; i += 1) {
      const r = generateReport({ questId: "quest_herb", adventurerIds: party, adventurerItemIds: {}, seed: 500 + i,
        departTimeOfDay: "昼", departWeather: "晴れ", startTime: 0, durationMs: 1 });
      state.reports.unshift(r);
    }
    saveState();
  }, { party, n });
}

async function pastOnRoster(page, advId) {
  return page.evaluate((id) => {
    setRoute("adventurers"); // ★ setRoute は選択を外すので、開いてから選ぶ（画面の操作と同じ順）
    editAdventurer(id);
    const sec = document.querySelector(".adventurer-past");
    if (!sec) return null;
    return [...sec.querySelectorAll(".past-stage")].map((el) => ({
      heading: el.querySelector(".past-heading").innerText,
      text: el.querySelector(".past-text").innerText
    }));
  }, advId);
}

test.describe("冒険者の過去", () => {
  test("閾値で段が開く（手前では開かない）", async ({ page }) => {
    const errors = await freshPage(page);
    await interview(page);
    const rules = await page.evaluate(() => ({ t: window.masterPastRules.thresholds, texts: window.masterAdventurerPasts.adv_mina }));
    let done = 0;
    for (let stage = 0; stage < rules.t.length; stage += 1) {
      const need = rules.t[stage];
      await seedPartyReports(page, ["adv_mina"], need - 1 - done);
      done = need - 1;
      expect((await pastOnRoster(page, "adv_mina"))?.length ?? 0, `${need - 1}回では${stage + 1}段目は開かない`).toBe(stage);
      await seedPartyReports(page, ["adv_mina"], 1);
      done = need;
      const shown = await pastOnRoster(page, "adv_mina");
      expect(shown.length, `${need}回で${stage + 1}段目が開く`).toBe(stage + 1);
      expect(shown[stage].text).toBe(rules.texts[stage]);
    }
    expect(errors, errors.join(" | ")).toEqual([]);
  });

  test("未解放の段は出さない（「まだある」ことも見せない）", async ({ page }) => {
    const errors = await freshPage(page);
    await interview(page);
    expect(await pastOnRoster(page, "adv_gadd"), "1段も開いていなければ欄ごと出さない").toBeNull();
    const t = await page.evaluate(() => window.masterPastRules.thresholds);
    await seedPartyReports(page, ["adv_gadd"], t[0]);
    const shown = await pastOnRoster(page, "adv_gadd");
    expect(shown.length).toBe(1);
    const bodyText = await page.evaluate(() => document.querySelector(".adventurer-past").innerText);
    const later = await page.evaluate(() => [...window.masterPastRules.headings.human.slice(1), ...window.masterAdventurerPasts.adv_gadd.slice(1)]);
    later.forEach((s) => expect(bodyText, "未解放の見出し・本文が漏れている").not.toContain(s));
    // 一緒に行っていない人は開かない
    expect(await pastOnRoster(page, "adv_row")).toBeNull();
    expect(errors, errors.join(" | ")).toEqual([]);
  });

  test("段が開いた遠征の報告書の末尾に合図の1行（開かない回には出ない）", async ({ page }) => {
    const errors = await freshPage(page);
    await interview(page);
    const t = await page.evaluate(() => window.masterPastRules.thresholds);
    await seedPartyReports(page, ["adv_row"], t[0] - 2);
    const signal = await page.evaluate(() => window.masterPastRules.signal.human.replaceAll("{名前}", getDisplayName(getAdventurer("adv_row"))));
    const lastLine = () => page.evaluate(() => state.reports[0].logs.at(-1).text);
    // 閾値の1つ手前の回：出ない
    let got = await runDispatch(page, { questId: "quest_herb", party: ["adv_row"] });
    expect(got.error).toBeUndefined();
    expect(await lastLine()).not.toBe(signal);
    // 閾値に届いた回：末尾に1行
    got = await runDispatch(page, { questId: "quest_letter", party: ["adv_row"] });
    expect(got.error).toBeUndefined();
    expect(await lastLine()).toBe(signal);
    expect(await page.evaluate((s) => state.reports[0].logs.filter((l) => l.text === s).length, signal)).toBe(1);
    // 次の回：出ない
    await runDispatch(page, { questId: "quest_herb", party: ["adv_row"] });
    expect(await lastLine()).not.toBe(signal);
    // ★ 通知・バッジは出さない（ホームにも名簿にも「過去」を知らせる印が無い）
    const badge = await page.evaluate(() => { setRoute("home"); return document.body.innerText.includes("昔の話"); });
    expect(badge).toBe(false);
    expect(errors, errors.join(" | ")).toEqual([]);
  });

  test("エルシーだけ段の見出しが違い、合図の1行も違う", async ({ page }) => {
    const errors = await freshPage(page);
    await interview(page);
    const rules = await page.evaluate(() => window.masterPastRules);
    await seedPartyReports(page, ["adv_mina", "adv_elsie"], rules.thresholds[1] - 1);
    await runDispatch(page, { questId: "quest_herb", party: ["adv_mina", "adv_elsie"] });
    const logs = await page.evaluate(() => state.reports[0].logs.map((l) => l.text));
    expect(logs).toContain(rules.signal.dog);
    expect(logs).toContain(rules.signal.human.replaceAll("{名前}", await page.evaluate(() => getDisplayName(getAdventurer("adv_mina")))));
    const shown = await pastOnRoster(page, "adv_elsie");
    expect(shown.map((s) => s.heading)).toEqual(rules.headings.dog.slice(0, 2));
    const human = await pastOnRoster(page, "adv_mina");
    expect(human.map((s) => s.heading)).toEqual(rules.headings.human.slice(0, 2));
    expect(errors, errors.join(" | ")).toEqual([]);
  });

  test("ギルドの掃除（定型報告書）は数えず、1行も足さない", async ({ page }) => {
    const errors = await freshPage(page);
    await interview(page);
    const n = await page.evaluate(() => {
      const r = generateReport({ questId: "quest_guild_cleanup", adventurerIds: ["adv_mina"], adventurerItemIds: {}, seed: 1,
        departTimeOfDay: "昼", departWeather: "晴れ", startTime: 0, durationMs: 1 });
      state.reports.unshift(r);
      return pastExpeditionCount("adv_mina");
    });
    expect(n).toBe(0);
    expect(errors, errors.join(" | ")).toEqual([]);
  });
});
