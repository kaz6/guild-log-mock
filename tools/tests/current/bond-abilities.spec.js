// 固有依頼の報酬のアビリティ：エルネ「覚え書き」・ロウ「帰り道」・エルシー「そばにいる」（2026-10-31・EX-171【3】。名前と値は仮）。
// ★ 持たない状態では既存の報告書は1文字も動かない（対比較 compare.spec.js が見る）。ここは「持つと、効く依頼でだけ効く」を見る。
// ★ 感謝を読んだときに開き、名簿のその人の頁にアビリティの名前が出る。
const { test, expect } = require("@playwright/test");
const { freshPage, interview } = require("../helpers/app");

// 全依頼 × 編成（持ち主を含む）× seed で、有／無の報告書を比べる。動いた依頼と、本文以外の欄が動いた数を返す
const diffAll = (page, ability, extra = {}) => page.evaluate(({ ability, extra }) => {
  const owner = window.masterAbilities[ability].adventurerId;
  const others = ["adv_gadd", "adv_mina", "adv_elne", "adv_row", "adv_elsie"].filter((x) => x !== owner);
  const parties = [[owner, others[0]], [owner, others[1], others[2]], [owner, ...others.slice(0, 3)]];
  if (owner !== "adv_elsie") parties.push([owner]);
  const moved = {};
  let other = 0;
  let prefixBroken = 0;
  for (const q of state.quests) for (const ids of parties) for (let seed = 1; seed <= 8; seed++) {
    const exp = { questId: q.id, adventurerIds: ids, adventurerItemIds: {}, seed: seed * 7919, departTimeOfDay: extra.time ?? "昼", departWeather: "晴れ", startTime: 0, durationMs: 1, firstRunOfQuest: false };
    const a = generateReport({ ...exp });
    const c = generateReport({ ...exp, abilities: [ability] });
    if (JSON.stringify({ ...a, id: 0, createdAt: 0, logs: 0 }) !== JSON.stringify({ ...c, id: 0, createdAt: 0, logs: 0 })) other++;
    const la = a.logs.map((l) => l.text), lc = c.logs.map((l) => l.text);
    if (JSON.stringify(la) === JSON.stringify(lc)) continue;
    moved[q.id] = (moved[q.id] ?? 0) + 1;
    if (lc.length !== la.length + 1) prefixBroken++;
  }
  return { moved: Object.keys(moved).sort(), other, prefixBroken };
}, { ability, extra });

test("覚え書き（エルネ）：観察対象に出会った回だけ、本文に観察の一行が1つ増える。ほかの欄・ほかの依頼は動かない", async ({ page }) => {
  const errors = await freshPage(page);
  const r = await diffAll(page, "field_notes");
  expect(r.moved).toEqual(["quest_barn_bite", "quest_field_mystery", "quest_herb", "quest_unknown_grass"]);
  expect(r.other, "本文以外の欄（結末・観察記録・成長など）が動いた").toBe(0);
  expect(r.prefixBroken, "増えるのは1行だけ").toBe(0);
  // 夜道の灯り（夜にだけ出会う）も、出会った回なら増える
  const night = await diffAll(page, "field_notes", { time: "夜" });
  expect(night.moved).toContain("quest_lingering_light");
  // 行の中身：植物は葉の縁、それ以外は受け皿。軸は埋めない（観察記録票の欄は増えない）
  const lines = await page.evaluate(() => {
    const gen = (questId, kind) => {
      for (let seed = 1; seed < 100; seed++) {
        const r = generateReport({ questId, adventurerIds: ["adv_elne", "adv_gadd"], adventurerItemIds: {}, seed, departTimeOfDay: "昼", departWeather: "晴れ", startTime: 0, durationMs: 1, abilities: ["field_notes"] });
        if (r.observationNotes) return r.logs[r.logs.length - 1].text;
      }
      return null;
    };
    return [gen("quest_unknown_grass"), gen("quest_herb")];
  });
  expect(lines).toEqual(["エルネは、葉の縁の形を帳面に写した。", "エルネは、見たものを帳面に書き留めた。"]);
  // エルネがいなければ効かない
  const absent = await page.evaluate(() => {
    const exp = { questId: "quest_herb", adventurerIds: ["adv_gadd", "adv_mina"], adventurerItemIds: {}, seed: 5, departTimeOfDay: "昼", departWeather: "晴れ", startTime: 0, durationMs: 1 };
    return generateReport(exp).logs.length === generateReport({ ...exp, abilities: ["field_notes"] }).logs.length;
  });
  expect(absent).toBe(true);
  expect(errors).toEqual([]);
});

test("感謝を読むとアビリティが開き、名簿のその人の頁に名前が出る（感謝の前は出ない）", async ({ page }) => {
  const errors = await freshPage(page);
  await interview(page, "カズ");
  const cases = [["bond_elne", "adv_elne", "field_notes"]];
  for (const [bond, adv, ability] of cases) {
    const shown = () => page.evaluate((adv) => { setRoute("adventurers"); editAdventurer(adv); return document.querySelector("[data-abilities]")?.innerText ?? ""; }, adv);
    expect(await shown()).toBe("");
    await page.evaluate((bond) => { state.bondChain = { ...(state.bondChain ?? {}), started: true, [bond]: { consultAt: 1, consultRead: true, thanksAt: 2 } }; saveState(); dismissBondTalk(bond, "thanks"); }, bond);
    const name = await page.evaluate((ability) => window.masterAbilities[ability].name, ability);
    expect(await shown()).toContain(name);
  }
  expect(errors).toEqual([]);
});
