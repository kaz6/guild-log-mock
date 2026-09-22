// 対比較の軸と probe（2026-09-22・EX-143）。
//
// ★ ここが基準スナップショットと current のテストの**両方**から読まれる。
//   片方だけ書き換えると軸がずれて、比較が `missing` に落ちるだけで通ってしまうので、
//   **軸を変えるときは必ずこのファイルを直す**（2か所に書かない）。

// 5人。★ 犬だけの編成は出せない（EX-139）ので 31-1＝30通り。
const ADVENTURERS = ["adv_mina", "adv_gadd", "adv_elne", "adv_row", "adv_elsie"];

function allParties() {
  const out = [];
  for (let mask = 1; mask < 1 << ADVENTURERS.length; mask++) {
    const p = ADVENTURERS.filter((_, i) => mask & (1 << i));
    if (p.length === 1 && p[0] === "adv_elsie") continue;
    out.push(p);
  }
  return out;
}

const SEEDS = [1, 2, 3, 4];

// ★ probe はブラウザの中で走るので**閉包を持てない**（tools/sweep.js の注意書き）。
//   使ってよいのはページ側のグローバルと引数だけ。ここに正規表現や外の表を書かないこと。
//
// 10項目：結末／あらすじ／行数／本文（指紋）／観察記録／成長段／ハイライト／
//         成長 stat／暦（所要日数）／緊張度
// ★ 本文は指紋（長さ＋FNV-1a）で持つ。全文を持つと実測 17MB になる（2026-09-14 に却下済み）。
function probe10(r, ctx) {
  const text = (r.logs ?? []).map((l) => l.text ?? "").join("\n");
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  const quest = typeof getQuest === "function" ? getQuest(ctx.quest) : null;
  return {
    res: r.result ?? null,
    sum: r.summary ?? "",
    n: (r.logs ?? []).length,
    body: `${text.length}:${(h >>> 0).toString(36)}`,
    obs: r.observationNotes ?? null,
    // ★ 表が引けないときに null を返さない。null は両側一致して**検査が黙って消える**。
    tier: (typeof GROWTH_TIER_BY_RESULT !== "undefined"
      ? (GROWTH_TIER_BY_RESULT[r.result] ?? "full")
      : "__成長段の表が引けない__"),
    hl: r.highlight ?? null,
    grow: (r.hiddenTags && r.hiddenTags.growthStats) ?? null,
    days: quest && typeof getQuestDurationDays === "function"
      ? getQuestDurationDays(quest)
      : "__帯の表が引けない__",
    tens: r.tensionLevel ?? null,
  };
}

// 比較する10項目。★ 返した項目は全部見張る（sweep の `unchecked` 警告を空に保つ）。
const FIELDS = ["res", "sum", "n", "body", "obs", "tier", "hl", "grow", "days", "tens"];
// 行を対応づける鍵になる列。比較しないが「見ていない」わけではない。
const KEY_FIELDS = ["quest", "partyIndex", "seed"];

const BASELINE_PATH = require("path").join(__dirname, "..", "fixtures", "report-baseline.json");

function sweepOptions() {
  return {
    axes: { party: allParties(), seed: SEEDS },
    probe: probe10,
    quiet: true,
  };
}

module.exports = { ADVENTURERS, allParties, SEEDS, probe10, FIELDS, KEY_FIELDS, BASELINE_PATH, sweepOptions };
