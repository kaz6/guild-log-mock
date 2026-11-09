// 時間帯は依頼ごとに持つ（2026-11-09・EX-172 の続き。DECISION_LOG「時間帯は依頼ごとに持つ（現実の時刻と切り離す）」）。
// ★ 出発を押した端末の時刻は使わない。依頼の timesOfDay（候補）から、依頼の id と遠征の回数で1つ決める（乱数は引かない）。
const { test, expect } = require("@playwright/test");
const { freshPage, interview } = require("../helpers/app");

test("全依頼（固有依頼を除く）に時間帯の候補があり、決まり方は id と回数だけで決まる（乱数も端末の時刻も読まない）", async ({ page }) => {
  const errors = await freshPage(page);
  const r = await page.evaluate(() => {
    const ALL = ["朝", "昼", "夕方", "夜"];
    const missing = window.masterQuests.filter((q) => !q.bond && !(Array.isArray(q.timesOfDay) && q.timesOfDay.length > 0)).map((q) => q.id);
    const bad = window.masterQuests.filter((q) => (q.timesOfDay ?? []).some((t) => !ALL.includes(t))).map((q) => q.id);
    const origRandom = Math.random;
    const origHours = Date.prototype.getHours;
    Math.random = () => { throw new Error("Math.random を読んだ"); };
    Date.prototype.getHours = () => { throw new Error("端末の時刻を読んだ"); };
    let stable = true;
    const seen = {};
    try {
      for (const q of window.masterQuests) {
        seen[q.id] = new Set();
        for (let n = 0; n < 12; n++) {
          const a = questTimeOfDay(q, n);
          if (a !== questTimeOfDay(q, n)) stable = false;
          seen[q.id].add(a);
          if (q.timesOfDay && !q.timesOfDay.includes(a)) stable = false;
        }
      }
    } finally { Math.random = origRandom; Date.prototype.getHours = origHours; }
    const fixed = Object.fromEntries(["quest_evening_market_escort", "quest_lingering_light", "quest_missing_herbalist", "quest_wedding_support"].map((id) => [id, [...seen[id]]]));
    const varied = window.masterQuests.filter((q) => (q.timesOfDay ?? []).length > 1).every((q) => seen[q.id].size === q.timesOfDay.length);
    return { missing, bad, stable, fixed, varied };
  });
  expect(r.missing, "時間帯の候補が無い依頼").toEqual([]);
  expect(r.bad).toEqual([]);
  expect(r.stable).toBe(true);
  expect(r.varied, "候補が2つ以上の依頼は、回数が進むと全部の候補が出る").toBe(true);
  expect(r.fixed).toEqual({
    quest_evening_market_escort: ["夕方"],
    quest_lingering_light: ["夜"],
    quest_missing_herbalist: ["夕方"],
    quest_wedding_support: ["昼"]
  });
  expect(errors).toEqual([]);
});

test("出発すると、依頼の時間帯（出発前の遠征の回数で決まる）が遠征に書かれる。掲示板の帯にも同じ時間帯が出る", async ({ page }) => {
  const errors = await freshPage(page);
  await interview(page, "カズ");
  const r = await page.evaluate(() => {
    const origHours = Date.prototype.getHours;
    Date.prototype.getHours = () => { throw new Error("端末の時刻を読んだ"); };
    try {
      state.money = 9999;
      state.worldState.totalExpeditions = 5;
      // 最初から掲示板にある「隣の酒場に買い出し」（時間帯は4つの候補から回数で決まる）
      const q = getQuest("quest_tavern_errand");
      const expected = questTimeOfDay(q, 5);
      setRoute("quests");
      selectQuest("quest_tavern_errand");
      selectedAdventurerIds = ["adv_mina", "adv_gadd"]; selectedSharedItems = []; selectedObsHolders = [];
      render();
      const bar = [...document.querySelectorAll(".weather-bar-text")].map((e) => e.textContent).join("|");
      const before = state.expeditions.length;
      startExpedition();
      const e = state.expeditions.length > before ? state.expeditions[state.expeditions.length - 1] : null;
      return { expected, got: e?.departTimeOfDay, bar };
    } finally { Date.prototype.getHours = origHours; }
  });
  expect(r.got).toBe(r.expected);
  expect(r.bar).toContain(`時間帯：${r.expected}`);
  expect(errors).toEqual([]);
});
