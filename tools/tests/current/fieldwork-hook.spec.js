// 特殊裁定のフック（段階2）の試験（2026-10-14・EX-148）。
//
// ★ なぜ要るか：対比較の固定シード（1〜4）では、**フックは4,224組のうち1本も引かれない**（引くかどうかが
//   出発時のシードだけで決まるため。2026-10-14 に実測）。つまり基準は「フックが無いとき動かない」ことしか見ていない。
//   ここでは確率を 1 に上げて**必ず引く**回を作り、**文面の1行を足す以外は何も動かない**ことを基準と突き合わせる。
// ★ 1遠征1本までは、引かれた回の行数の差が +1 ちょうどであることで見ている。
// ★ 見張るもの：結末・あらすじ・観察記録・成長段・成長 stat・暦・緊張度・ハイライトは基準と完全に同じ。
//   行数は「引かれた回だけ＋1」。引かれた回は 1遠征1本まで。
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const { sweep, compare } = require("../../sweep");
const { allParties, SEEDS, BASELINE_PATH } = require("../helpers/axes");
const { freshPage } = require("../helpers/app");

test("フックを必ず引く設定にしても、動くのは本文の1行だけ（結末・報酬・配分は基準と同じ）", async () => {
  const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"));
  const baseRows = baseline.rows.filter((r) => !r.supplies);
  const both = await sweep({
    axes: { party: allParties(), seed: SEEDS },
    // ★ probe はページの中で走る（閉包なし）。比較する項目は基準の probe と同じ書き方にしてある。
    probe: (r, ctx) => {
      const quest = getQuest(ctx.quest);
      return {
        res: r.result ?? null,
        sum: r.summary ?? "",
        n: (r.logs ?? []).length,
        obs: r.observationNotes ?? null,
        tier: GROWTH_TIER_BY_RESULT[r.result] ?? "full",
        hl: r.highlight ?? null,
        grow: (r.hiddenTags && r.hiddenTags.growthStats) ?? null,
        days: getQuestDurationDays(quest),
        tens: r.tensionLevel ?? null,
        hook: (r.hiddenTags && r.hiddenTags.fieldwork && r.hiddenTags.fieldwork.hook) ?? null,
        // ★ 裏の値（報酬・配分・成長の材料）も動かない。フックの印と、行数に比例する recordDensityGain だけは除く
        ht: JSON.stringify(r.hiddenTags, (k, v) => (k === "hook" || k === "recordDensityGain" ? undefined : v))
      };
    },
    variants: { 無し: () => { FIELDWORK_TUNING.hookChance = 0; }, 必ず引く: () => { FIELDWORK_TUNING.hookChance = 1; } },
    quiet: true
  });
  const off = both.filter((r) => r.variant === "無し");
  const rows = both.filter((r) => r.variant === "必ず引く");
  const failed = both.filter((r) => r.error);
  expect(failed.map((r) => `${r.quest}/${r.seed}: ${r.error}`), "生成に失敗した組がある").toEqual([]);
  expect(rows.length).toBe(baseRows.length);
  expect(off.filter((r) => r.hook), "確率0なのに引かれた").toEqual([]);
  // 裏の値（hiddenTags）は、引いた回も引かない回も同じ
  const offHt = new Map(off.map((r) => [`${r.quest}|${r.partyIndex}|${r.seed}`, r.ht]));
  const htMoved = rows.filter((r) => offHt.get(`${r.quest}|${r.partyIndex}|${r.seed}`) !== r.ht).map((r) => `${r.quest}/${r.partyIndex}/${r.seed}`);
  expect(htMoved, "フックを引いただけで hiddenTags が動いた").toEqual([]);

  const fields = ["res", "sum", "obs", "tier", "hl", "grow", "days", "tens"];
  const r = compare(baseRows, rows.map(({ hook, n, variant, ht, ...rest }) => rest), {
    fields, keyFields: ["quest", "partyIndex", "seed"], by: (row) => row.quest
  });
  const moved = fields.filter((f) => r.diff[f] > 0).map((f) => `${f}: ${r.diff[f]}件`);
  expect(moved, "フックを引いただけで動いてはいけない項目が動いた").toEqual([]);

  // 行数：引かれた回だけ +1。引かれなかった回は同じ
  const key = (row) => `${row.quest}|${row.partyIndex}|${row.seed}`;
  const baseN = new Map(baseRows.map((row) => [key(row), row.n]));
  let drawn = 0;
  const wrong = [];
  rows.forEach((row) => {
    const delta = row.n - baseN.get(key(row));
    if (row.hook) drawn += 1;
    if (delta !== (row.hook ? 1 : 0)) wrong.push(`${key(row)} hook=${row.hook} 行数の差=${delta}`);
  });
  expect(wrong, "行数の差が「引かれた回だけ+1」になっていない").toEqual([]);
  expect(drawn, "必ず引く設定なのに1本も引かれない（候補が一つも成り立たない）").toBeGreaterThan(0);
});

test("引けるのは担い手だけ（エルシーは編成にいれば引ける）／履歴を読まない／同じ種なら同じ行", async ({ page }) => {
  const errors = await freshPage(page);
  const r = await page.evaluate(() => {
    FIELDWORK_TUNING.hookChance = 1;
    const out = { drawn: 0, notCarrier: [], historyDependent: 0, elsie: 0, lines: {} };
    const sets = [
      { q: "quest_missing_herbalist", ids: ["adv_mina", "adv_elne", "adv_row"] },
      { q: "quest_missing_herbalist", ids: ["adv_mina", "adv_elsie"] },
      { q: "quest_wedding_support", ids: ["adv_gadd", "adv_elsie"] }
    ];
    for (const set of sets) {
      const quest = getQuest(set.q);
      const party = set.ids.map(getAdventurer);
      for (let seed = 1; seed <= 300; seed++) {
        const exp = { seed };
        const fw = simulateFieldwork(quest, party, [], makeRng(seed), { weather: "晴れ" });
        if (!fw) continue;
        state.reports = [];
        const a = drawFieldworkHook(quest, party, fw, exp);
        if (!a) continue;
        out.drawn += 1;
        const owner = party.find((adv) => (adv.obsession.triggerTags ?? []).some((h) => h.id === a.id));
        const hook = owner.obsession.triggerTags.find((h) => h.id === a.id);
        if (owner.id === "adv_elsie") out.elsie += 1;
        else if (!hook.inParty && !fw.stepLeads.some((l) => l.id === owner.id)) out.notCarrier.push(a.id);
        // 履歴を入れても同じ行
        state.reports = [{ logs: [{ kind: "action", text: a.text }] }];
        const b = drawFieldworkHook(quest, party, fw, exp);
        if (!b || b.text !== a.text) out.historyDependent += 1;
        out.lines[a.text] = 1;
      }
    }
    state.reports = [];
    out.lineKinds = Object.keys(out.lines).length;
    return out;
  });
  expect(r.drawn, "必ず引く設定で1本も引かれない").toBeGreaterThan(0);
  expect(r.notCarrier, "担い手でない者のフックが引かれた").toEqual([]);
  expect(r.elsie, "エルシーのフックが編成にいても引かれない").toBeGreaterThan(0);
  expect(r.historyDependent, "報告書の履歴で行が変わった（EX-138 の例外）").toBe(0);
  expect(r.lineKinds, "2通りの文面が両方出ない").toBeGreaterThan(1);
  expect(errors).toEqual([]);
});
