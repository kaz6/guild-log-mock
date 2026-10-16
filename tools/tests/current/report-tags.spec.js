// 報告書の行の種類（tag）：戦闘（battle）／クリティカル（crit）／天候（weather）（EX-157【2】）。
// ★ tag を付け忘れた経路は黙って墨になり、対比較（本文の指紋・行数）には見えない。ここで捕まえる。
const { test, expect } = require("@playwright/test");
const { freshPage, interview } = require("../helpers/app");

const PARTY4 = ["adv_mina", "adv_gad", "adv_elne", "adv_rou"];

// 全シードを回して、種類ごとの行を数える（生成だけを呼ぶ。状態は変えない）。
function sweepTags(page, { questId, weathers, seeds, adventurerIds }) {
  return page.evaluate(({ questId, weathers, seeds, adventurerIds }) => {
    const out = { lines: 0, tags: { battle: 0, crit: 0, weather: 0 }, critUntagged: [], critTaggedNotCrit: [], setbackUntagged: [] };
    weathers.forEach((w) => {
      for (let s = 1; s <= seeds; s++) {
        const r = generateReport({ questId, adventurerIds, adventurerItemIds: {}, seed: s, departTimeOfDay: s % 2 ? "夜" : "昼", departWeather: w, startTime: 0, durationMs: 1 });
        r.logs.forEach((l) => {
          out.lines += 1;
          if (l.tag) out.tags[l.tag] = (out.tags[l.tag] ?? 0) + 1;
          // ★ 検査のための文面照合（本体は文面を探さない）。クリティカルの行は専用の言い回しで、取りこぼしを数える
          const isCritText = /渾身の一撃|致命の一撃/.test(l.text);
          if (isCritText && l.tag !== "crit") out.critUntagged.push(l.text.slice(0, 40));
          if (!isCritText && l.tag === "crit") out.critTaggedNotCrit.push(l.text.slice(0, 40));
          // 天候が原因の滞りの行（工程エンジン）の言い回し。取りこぼしを数える
          if (/^(霧|小雨|風が強い|曇り)(に足元と手元を取られ|が続き)/.test(l.text) && l.tag !== "weather") out.setbackUntagged.push(l.text.slice(0, 40));
        });
      }
    });
    return out;
  }, { questId, weathers, seeds, adventurerIds });
}

test.describe("報告書の行の種類（tag）", () => {
  test("戦闘のある依頼：battle の行が出る。クリティカルの文面の行は必ず crit が付く（取りこぼし0）", async ({ page }) => {
    await freshPage(page); await interview(page);
    for (const questId of ["quest_field_mystery", "quest_lingering_light", "quest_caravan_escort", "quest_barn_bite"]) {
      const r = await sweepTags(page, { questId, weathers: ["晴れ"], seeds: 60, adventurerIds: PARTY4 });
      expect(r.tags.battle + r.tags.crit, `${questId} に戦闘の行（battle／crit）が出る`).toBeGreaterThan(0);
      expect(r.critUntagged, `${questId}：クリティカルの文面なのに crit が付いていない行`).toEqual([]);
      expect(r.critTaggedNotCrit, `${questId}：crit が付いているがクリティカルの文面ではない行`).toEqual([]);
    }
    const f = await sweepTags(page, { questId: "quest_field_mystery", weathers: ["晴れ"], seeds: 120, adventurerIds: PARTY4 });
    expect(f.tags.crit, "クリティカルの行が実際に出る（検査が空振りでない）").toBeGreaterThan(0);
  });

  test("クリティカルの生成2か所（simple／caravan の critDealLine・critTakeLine）の両方を通る", async ({ page }) => {
    await freshPage(page); await interview(page);
    const res = await page.evaluate(() => {
      const party = ["adv_mina", "adv_gad"].map(getAdventurer).filter(Boolean);
      const mk = () => ({
        enemyId: "enemy_bandit", enemyName: "野盗", roundLog: [], members: [],
        events: [
          { type: "deal", crit: true, attackerName: "ミナ", attackerId: "adv_mina", damage: 31, round: 1 },
          { type: "take", crit: true, targetName: "ガッド", targetId: "adv_gad", damage: 22, round: 2, strong: true },
          { type: "deal", attackerName: "ミナ", attackerId: "adv_mina", damage: 8, round: 3 }
        ]
      });
      const rng = () => 0.3;
      const simple = generateSimpleBattleDramaLog(mk(), party, rng);
      const caravan = generateCaravanBattleDramaLog(mk(), party, rng);
      const summarize = (lines) => ({ n: lines.length, crit: lines.filter((l) => l.tag === "crit").length, other: lines.filter((l) => l.tag !== "crit").map((l) => l.tag ?? null) });
      return { simple: summarize(simple), caravan: summarize(caravan) };
    });
    expect(res.simple.crit, "simple：deal と take の2行").toBe(2);
    expect(res.caravan.crit, "caravan：critDealLine と critTakeLine の2行").toBe(2);
    expect(res.simple.other.every((t) => t === "battle")).toBe(true);
    expect(res.caravan.other.every((t) => t === "battle")).toBe(true);
  });

  test("天候：天候の日に weather の行が出る。戦闘のない依頼に battle／crit は付かない", async ({ page }) => {
    await freshPage(page); await interview(page);
    const rain = await sweepTags(page, { questId: "quest_herb_delivery", weathers: ["小雨", "霧"], seeds: 20, adventurerIds: ["adv_mina"] });
    expect(rain.tags.weather, "依頼ごとの生成関数が混ぜた天候の行も通る").toBeGreaterThan(20 * 2); // 天候の行1本＋雨・霧の行
    const fw = await sweepTags(page, { questId: "quest_tavern_errand", weathers: ["霧"], seeds: 60, adventurerIds: ["adv_mina"] });
    expect(fw.tags.weather, "工程エンジンの天候の行（天候が原因の滞り）も通る").toBeGreaterThan(0);
    expect(fw.setbackUntagged, "天候が原因の滞りの行なのに weather が付いていない行").toEqual([]);
    const calm = await sweepTags(page, { questId: "quest_tavern_errand", weathers: ["晴れ"], seeds: 30, adventurerIds: ["adv_mina"] });
    expect(calm.tags.battle + calm.tags.crit).toBe(0);
  });

  test("色と太字は tag から引く（墨・朱・藍の3色）。tag の無い行・旧セーブの行は墨のまま", async ({ page }) => {
    await freshPage(page); await interview(page);
    await page.evaluate(() => {
      const r = generateReport({ questId: "quest_tavern_errand", adventurerIds: ["adv_mina"], adventurerItemIds: {}, seed: 3, departTimeOfDay: "昼", departWeather: "晴れ", startTime: 0, durationMs: 1 });
      r.id = "rt_colors";
      r.readStampAt = Date.now(); // 押印済みは最初から全部出る
      r.logs = [
        { kind: "action", text: "墨の行" },
        { kind: "action", tag: "weather", text: "藍の行" },
        { kind: "action", tag: "battle", text: "朱の行" },
        { kind: "status-grave", tag: "crit", text: "朱で太字の行" },
        { kind: "battle-heal", tag: "battle", text: "戦闘中の回復の行" },
        { kind: "battle-heal", text: "戦闘のない回復の行" },
        { kind: "status-hurt", text: "負傷の行" },
        { kind: "action", tag: "うその値", text: "知らない tag の行" }
      ];
      state.reports.unshift(r); state.activeReportId = r.id; saveState(); setRoute("report");
    });
    await page.waitForTimeout(300);
    const styles = await page.evaluate(() => {
      const root = getComputedStyle(document.body);
      const ink = root.getPropertyValue("--paper-ink").trim(), shu = root.getPropertyValue("--paper-shu").trim(), ai = root.getPropertyValue("--paper-ai").trim();
      const toRgb = (hex) => { const n = parseInt(hex.slice(1), 16); return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`; };
      const rows = [...document.querySelectorAll(".paper-lines .log-line")].map((el) => ({ text: el.innerText, color: getComputedStyle(el).color, weight: getComputedStyle(el).fontWeight }));
      return { rows, ink: toRgb(ink), shu: toRgb(shu), ai: toRgb(ai) };
    });
    const by = Object.fromEntries(styles.rows.map((r) => [r.text, r]));
    expect(by["墨の行"].color).toBe(styles.ink);
    expect(by["藍の行"].color).toBe(styles.ai);
    expect(by["朱の行"].color).toBe(styles.shu);
    expect(by["朱で太字の行"].color).toBe(styles.shu);
    expect(Number(by["朱で太字の行"].weight), "クリティカルは太字").toBeGreaterThanOrEqual(700);
    expect(Number(by["朱の行"].weight), "戦闘の行は太字にしない").toBeLessThan(700);
    expect(by["戦闘中の回復の行"].color, "戦闘中の回復は戦闘の行なので朱").toBe(styles.shu);
    expect(by["戦闘のない回復の行"].color, "回復は墨").toBe(styles.ink);
    expect(by["負傷の行"].color, "傷つく側は朱").toBe(styles.shu);
    expect(by["知らない tag の行"].color, "知らない値は墨のまま").toBe(styles.ink);
  });

  test("振動：クリティカルの行が文字送りで出るときだけ。飛ばしたときは振動も間もない", async ({ page }) => {
    await page.addInitScript(() => { window.__vib = []; navigator.vibrate = (p) => { window.__vib.push(p); return true; }; });
    await freshPage(page); await interview(page);
    const seed = () => page.evaluate(() => {
      const r = generateReport({ questId: "quest_tavern_errand", adventurerIds: ["adv_mina"], adventurerItemIds: {}, seed: 5, departTimeOfDay: "昼", departWeather: "晴れ", startTime: 0, durationMs: 1 });
      r.id = "rt_vib_" + Math.random().toString(36).slice(2, 7);
      r.logs = [{ kind: "action", text: "はじまり。" }, { kind: "status-grave", tag: "crit", text: "渾身の一撃。" }, { kind: "action", text: "おわり。" }];
      state.reports.unshift(r); saveState();
      return r.id;
    });
    // 1) 文字送りで出る：クリティカルの行の前に間があり、行が出るとき1回だけ振動する
    const id1 = await seed();
    await page.evaluate((rid) => { window.__vib = []; state.activeReportId = rid; setRoute("report"); }, id1);
    await page.waitForFunction(() => { const b = document.getElementById("reportStampBtn"); return b && !b.disabled; }, null, { timeout: 15000 });
    expect(await page.evaluate(() => window.__vib)).toEqual([30]);
    // 2) 飛ばす：最初に全文を出すので、振動しない
    const id2 = await seed();
    await page.evaluate((rid) => { window.__vib = []; state.activeReportId = rid; setRoute("report"); }, id2);
    await page.locator(".paper-sheet").click({ position: { x: 20, y: 60 } });
    await page.waitForFunction(() => { const b = document.getElementById("reportStampBtn"); return b && !b.disabled; });
    expect(await page.evaluate(() => window.__vib)).toEqual([]);
  });
});
