// 報告書の全文を書き出す（文章の通読係 .claude/agents/text-reader.md に渡すため。2026-10-30・EX-168【2】）。
//
// ★ 依頼 × 編成 × 天候 × seed から報告書を作り、1通ずつ「見出し＋行番号つきの本文」で書き出す。
//   状態を変えた組（アビリティを持つ・特殊裁定のフックを必ず引く）も混ぜる——持たない組だけでは、
//   アビリティの一行やフックの一行が文書の中で前後と食い違っても読めない。
// ★ 生成は報告書の生成の関数（generateReport）を直に呼ぶ。帰還の処理（在席・掛け合い・成長・過去の合図）は通らない
//   （対比較と同じ範囲）。乱数は出発の種だけで決まるので、同じ引数なら同じ文が出る。
// ★ file:// は localStorage を全部で共有するので、使い捨ての HTTP で開く（走っているテストの保存を踏まない）。
//
// 使い方：node tools/report-texts.js <出力先.md> [--quests id,id] [--seeds N] [--per-quest N]
//   既定は全依頼 × 代表の編成4 × 天候2 × seed2 × 状態3（なし／アビリティ全部／フックを必ず引く）から、
//   （観察対象のある依頼は先頭の人に観察記録票を持たせる）
//   依頼ごとに --per-quest 通（既定6。状態ごとに同じ数ずつ）を順に取る。通読係に渡す量はこれで決める。
const fs = require("fs");
const path = require("path");
const http = require("http");

const REPO = path.resolve(__dirname, "..");

function requirePlaywright() {
  for (const c of [process.env.PLAYWRIGHT_MODULE, "playwright", "@playwright/test", "/opt/node22/lib/node_modules/playwright"].filter(Boolean)) {
    try { return require(c); } catch (e) { /* 次を試す */ }
  }
  throw new Error("playwright が見つかりません。PLAYWRIGHT_MODULE に playwright のパスを入れてください。");
}

function parseArgs(argv) {
  const opts = { out: null, quests: null, seeds: 2, perQuest: 6 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--quests") opts.quests = argv[++i].split(",");
    else if (a === "--seeds") opts.seeds = Number(argv[++i]);
    else if (a === "--per-quest") opts.perQuest = Number(argv[++i]);
    else opts.out = a;
  }
  return opts;
}

async function collect(opts) {
  const { chromium } = requirePlaywright();
  const server = http.createServer((req, res) => {
    fs.readFile(path.join(REPO, decodeURIComponent(req.url.split("?")[0])), (e, b) => {
      if (e) { res.writeHead(404); res.end(); return; }
      res.writeHead(200); res.end(b);
    });
  });
  await new Promise((ok) => server.listen(0, ok));
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
    await page.waitForTimeout(800);
    return await page.evaluate((opts) => {
      const parties = [
        ["adv_mina", "adv_gadd", "adv_elne", "adv_row"],
        ["adv_gadd", "adv_elsie"],
        ["adv_mina"],
        ["adv_elne", "adv_row", "adv_elsie"]
      ];
      // 状態：なし／アビリティ（持ち主が編成にいれば効く）／特殊裁定のフックを必ず引く
      const states = [
        { name: "なし", extra: {} },
        // ★ アビリティは全部（持ち主が編成にいるものだけ残す）。EX-171 で3つ増えた
        { name: "アビリティ（全部）", extra: { abilities: Object.keys(window.masterAbilities) } },
        { name: "フックを必ず引く", extra: { mockForceHooks: true } }
      ];
      const quests = opts.quests ?? window.masterQuests.map((q) => q.id);
      // ★ 組（編成×天候×seed）は編成と天候が先に回る順に並べ、通し番号で取る
      //   （seed を内側に回していた版は、少ない通数では1つの編成・天候しか出なかった。2026-10-30 に72通すべて同じ組だった）
      const combos = [];
      for (let s = 1; s <= opts.seeds; s++) for (const weather of ["晴れ", "小雨"]) for (const party of parties) combos.push({ party, weather, s });
      const docs = [];
      quests.forEach((questId, qi) => {
        const quest = getQuest(questId);
        // ★ 状態ごとに同じ数ずつ取る（先頭の状態だけで埋まらないように）。依頼ごとに取り始めをずらす
        const perState = Math.ceil(opts.perQuest / states.length);
        states.forEach((st, si) => {
        for (let j = 0; j < perState; j++) {
          const { party, weather, s } = combos[(qi * opts.perQuest + si * perState + j) % combos.length];
          const ids = quest.requiresAdventurer && !party.includes(quest.requiresAdventurer) ? [quest.requiresAdventurer, ...party] : party;
          const extra = { ...st.extra };
          if (extra.abilities) extra.abilities = extra.abilities.filter((id) => ids.includes(window.masterAbilities[id]?.adventurerId));
          // 観察対象のある依頼は、先頭の人に観察記録票を持たせる（観察記録も読めるように）
          const firstHuman = ids.map(getAdventurer).find((a) => isHumanAdventurer(a));
          const items = quest.observationTarget && quest.observationTarget !== "なし" && firstHuman ? { [firstHuman.id]: ["item_obs_sheet"] } : {};
          state.reports = []; state.reportMemos = []; state.worldState.totalExpeditions = 0;
          let r;
          try {
            r = generateReport({ questId, adventurerIds: ids, adventurerItemIds: items, seed: s * 7919, departTimeOfDay: "昼", departWeather: weather, startTime: 0, durationMs: 1, ...extra });
          } catch (e) { docs.push({ title: `${quest.title}｜生成に失敗`, meta: String(e), lines: [] }); continue; }
          const names = ids.map((id) => getDisplayName(getAdventurer(id))).join("・");
          docs.push({
            title: `${quest.title}（${questId}）`,
            meta: `編成：${names}｜天候：${weather}｜seed：${s * 7919}｜状態：${st.name}｜結末：${r.result}`,
            summary: r.summary,
            highlight: r.highlight ?? null,
            lines: r.logs.map((l) => l.text),
            observation: (r.observationNotes?.notes ?? []).map((o) => `${o.name}：${o.text}`)
          });
        }
        });
      });
      return docs;
    }, opts);
  } finally {
    await browser.close();
    server.close();
  }
}

function toMarkdown(docs) {
  const out = ["# 報告書の全文（通読係に渡す）", "", "> 生成：node tools/report-texts.js。報告書ごとに「## R番号」で区切る。行は報告書の中の何行目か。", ""];
  docs.forEach((d, i) => {
    out.push(`## R${i + 1} ${d.title}`, "", d.meta, "");
    if (d.summary) out.push(`あらすじ：${d.summary}`, "");
    d.lines.forEach((t, j) => out.push(`${j + 1}. ${t}`));
    if (d.highlight) out.push("", `ハイライト：${d.highlight}`);
    if (d.observation && d.observation.length) out.push("", ...d.observation.map((t) => `観察記録：${t}`));
    out.push("");
  });
  return out.join("\n");
}

if (require.main === module) {
  const opts = parseArgs(process.argv.slice(2));
  collect(opts).then((docs) => {
    const md = toMarkdown(docs);
    if (opts.out) { fs.writeFileSync(opts.out, md); console.log(`${docs.length}通を ${opts.out} に書き出した`); }
    else process.stdout.write(md);
  }).catch((e) => { console.error(e); process.exit(1); });
}
module.exports = { collect, toMarkdown };
