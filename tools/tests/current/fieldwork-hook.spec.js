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

test("フックを必ず引く設定にしても、動くのは本文の1行だけ（取引を切れば）／取引はミナ①・ロウ①が成立した組だけを一段動かす", async () => {
  const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"));
  const baseRows = baseline.rows.filter((r) => !r.supplies);
  const both = await sweep({
    axes: { party: allParties(), seed: SEEDS },
    // ★ probe はページの中で走る（閉包なし）。比較する項目は基準の probe と同じ書き方にしてある。
    probe: (r, ctx) => {
      const quest = getQuest(ctx.quest);
      const fwk = (r.hiddenTags && r.hiddenTags.fieldwork) || {};
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
        hook: fwk.hook ?? null,
        trade: fwk.hookTrade === true,
        ftier: fwk.tier ?? null,
        hr: JSON.stringify(r.hiddenTags && r.hiddenTags.battleHpRatios),
        // ★ 裏の値（報酬・配分・成長の材料）も動かない。フックの印・取引の印・行数に比例する recordDensityGain は除く
        ht: JSON.stringify(r.hiddenTags, (k, v) => (k === "hook" || k === "hookTrade" || k === "recordDensityGain" ? undefined : v))
      };
    },
    variants: {
      無し: () => { FIELDWORK_TUNING.hookChance = 0; },
      取引なし: () => { FIELDWORK_TUNING.hookChance = 1; FIELDWORK_TUNING.hookTradeEnabled = false; },
      取引あり: () => { FIELDWORK_TUNING.hookChance = 1; FIELDWORK_TUNING.hookTradeEnabled = true; }
    },
    quiet: true
  });
  const failed = both.filter((r) => r.error);
  expect(failed.map((r) => `${r.quest}/${r.seed}: ${r.error}`), "生成に失敗した組がある").toEqual([]);
  const off = both.filter((r) => r.variant === "無し");
  const stage2 = both.filter((r) => r.variant === "取引なし");
  const stage3 = both.filter((r) => r.variant === "取引あり");
  expect(stage2.length).toBe(baseRows.length);
  expect(off.filter((r) => r.hook), "確率0なのに引かれた").toEqual([]);
  expect(stage2.filter((r) => r.trade), "取引を切ったのに成立した").toEqual([]);

  // ── 段階2（取引なし）：基準と比べて、動くのは本文の1行だけ ──
  const key = (row) => `${row.quest}|${row.partyIndex}|${row.seed}`;
  const offHt = new Map(off.map((r) => [key(r), r.ht]));
  expect(stage2.filter((r) => offHt.get(key(r)) !== r.ht).map(key), "フックを引いただけで hiddenTags が動いた").toEqual([]);
  const fields = ["res", "sum", "obs", "tier", "hl", "grow", "days", "tens"];
  const r = compare(baseRows, stage2.map(({ hook, trade, ftier, hr, n, variant, ht, ...rest }) => rest), {
    fields, keyFields: ["quest", "partyIndex", "seed"], by: (row) => row.quest
  });
  const moved = fields.filter((f) => r.diff[f] > 0).map((f) => `${f}: ${r.diff[f]}件`);
  expect(moved, "フックを引いただけで動いてはいけない項目が動いた").toEqual([]);
  const baseN = new Map(baseRows.map((row) => [key(row), row.n]));
  const wrong = [];
  let drawn = 0;
  stage2.forEach((row) => {
    const delta = row.n - baseN.get(key(row));
    if (row.hook) drawn += 1;
    if (delta !== (row.hook ? 1 : 0)) wrong.push(`${key(row)} hook=${row.hook} 行数の差=${delta}`);
  });
  expect(wrong, "行数の差が「引かれた回だけ+1」になっていない").toEqual([]);
  expect(drawn, "必ず引く設定なのに1本も引かれない").toBeGreaterThan(0);

  // ── 段階3（取引あり）：成立した組だけが動き、それはミナ①・ロウ①に限る ──
  const s2 = new Map(stage2.map((x) => [key(x), x]));
  const tradedRows = stage3.filter((x) => x.trade);
  expect(tradedRows.length, "取引が1件も成立しない").toBeGreaterThan(0);
  expect(tradedRows.filter((x) => x.hook !== "mina_deliver" && x.hook !== "row_check").map(key), "ミナ①・ロウ①以外が成立した").toEqual([]);
  const untouched = stage3.filter((x) => !x.trade);
  expect(untouched.filter((x) => { const y = s2.get(key(x)); return y.res !== x.res || y.ht !== x.ht || y.n !== x.n || y.hr !== x.hr; }).map(key), "取引が成立していない組が動いた").toEqual([]);
  const order = { fail: 0, partial: 1, full: 2 };
  const badStep = [];
  const badInjury = [];
  tradedRows.forEach((x) => {
    const y = s2.get(key(x));
    const d = order[x.ftier] - order[y.ftier];
    if (x.hook === "mina_deliver" && d !== 1) badStep.push(`${key(x)} ミナ① ${y.ftier}→${x.ftier}`);
    if (x.hook === "row_check" && d !== -1) badStep.push(`${key(x)} ロウ① ${y.ftier}→${x.ftier}`);
    // 負傷は軽症まで：どの率も 0.5 未満（＝重症の側）にならない。ミナは取引前より重く、ロウは取引前より軽い
    const a = JSON.parse(x.hr); const b = JSON.parse(y.hr);
    Object.keys(a).forEach((id) => { if (a[id] < 0.5) badInjury.push(`${key(x)} ${id}=${a[id]}`); });
    const heavier = Object.keys(a).some((id) => a[id] < b[id]);
    const lighter = Object.keys(a).some((id) => a[id] > b[id]);
    if (x.hook === "mina_deliver" && !(heavier && !lighter)) badInjury.push(`${key(x)} ミナ①なのに負傷が重くなっていない`);
    if (x.hook === "row_check" && !(lighter && !heavier)) badInjury.push(`${key(x)} ロウ①なのに負傷が軽くなっていない`);
  });
  expect(badStep, "結末が一段ずつ動いていない").toEqual([]);
  expect(badInjury, "負傷の動きが取引の向きと違う／軽症を超えた").toEqual([]);
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

test("取引の成立条件：両側に意味があるときだけ（ミナ①・ロウ①）／負傷は軽症まで", async ({ page }) => {
  const errors = await freshPage(page);
  const r = await page.evaluate(() => {
    const mina = getAdventurer("adv_mina").obsession.triggerTags.find((h) => h.id === "mina_deliver");
    const row = getAdventurer("adv_row").obsession.triggerTags.find((h) => h.id === "row_check");
    const run = (h, owner, fw) => {
      const hook = { id: h.id, adv: getAdventurer(owner), trade: h.trade, tradeText: "取引の一行" };
      return { line: applyHookTrade(hook, fw), fw };
    };
    const out = {};
    out.minaUp = run(mina, "adv_mina", { tier: "fail", hpRatios: { adv_mina: 1, adv_row: 1 } });
    out.minaFull = run(mina, "adv_mina", { tier: "full", hpRatios: { adv_mina: 1 } }).line;          // 上げる余地なし
    out.minaHurt = run(mina, "adv_mina", { tier: "partial", hpRatios: { adv_mina: 0.6 } }).line;     // 負傷を重くできない（上限＝軽症）
    out.rowDown = run(row, "adv_row", { tier: "partial", hpRatios: { adv_row: 1, adv_mina: 0.6, adv_elne: 0.5 } });
    out.rowFail = run(row, "adv_row", { tier: "fail", hpRatios: { adv_row: 1, adv_mina: 0.6 } }).line; // 下げる余地なし
    out.rowNoInjury = run(row, "adv_row", { tier: "full", hpRatios: { adv_row: 1, adv_mina: 1 } }).line; // 誰も負傷していない
    out.rowOneStep = run(row, "adv_row", { tier: "full", hpRatios: { adv_row: 1, adv_mina: 0.6, adv_elne: 0 } }).fw.hpRatios; // 戦闘不能は一段だけ（軽症へ）
    FIELDWORK_TUNING.hookTradeEnabled = false;
    out.disabled = run(mina, "adv_mina", { tier: "fail", hpRatios: { adv_mina: 1 } }).line;
    FIELDWORK_TUNING.hookTradeEnabled = true;
    out.level = injuryLevelFromHpRatio(out.minaUp.fw.hpRatios.adv_mina, false);
    return JSON.parse(JSON.stringify(out));
  });
  expect(r.minaUp.line).toBe("取引の一行");
  expect(r.minaUp.fw.tier).toBe("partial");
  expect(r.level, "ミナ①の負傷は軽症まで").toBe("軽症");
  expect(r.minaUp.fw.hpRatios.adv_row, "他の人の負傷は動かない").toBe(1);
  expect(r.minaFull).toBeNull();
  expect(r.minaHurt).toBeNull();
  expect(r.rowDown.line).toBe("取引の一行");
  expect(r.rowDown.fw.tier).toBe("fail");
  expect(r.rowDown.fw.turnedBack).toBe(true);
  expect(Object.values(r.rowDown.fw.hpRatios).every((v) => v > 0.7), "全員の負傷が一段軽くなる").toBe(true);
  expect(r.rowOneStep.adv_elne, "一段だけ軽くなる（0→軽症）").toBeLessThanOrEqual(0.7);
  expect(r.rowOneStep.adv_mina).toBeGreaterThan(0.7);
  expect(r.rowFail).toBeNull();
  expect(r.rowNoInjury).toBeNull();
  expect(r.disabled).toBeNull();
  expect(errors).toEqual([]);
});
