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

// ── 支給品の軸（2026-09-23・EX-145）────────────────────────────────────────────
// ★ 旧来の軸は**支給品を持たせずに**報告書を作っていたので、支給品まわりの変化（使い手の規則・容量・記録票）が
//   基準で検出できなかった（EX-144 で手当ての担い手がロウ→ミナに変わっても不一致0だった）。
// ★ 全組み合わせは要らない。**共有の荷の代表的な形 × 記録票あり／なし**を、代表的な編成で回す。
//   荷の形は3つ：
//   - 応急 … 消耗品だけ（包帯2・煙幕1）。戦闘の手当て・撤退に効く
//   - 道具 … 道具5種（古地図・ランタン・笛・油紙・携帯鍋）。語で使い手が分かれる
//   - 満載 … 容量を越える量。★ **容量の変化（人数・記録票・ハーネス）が、持っていける品の数に出る**。
//            末尾ほど切られるので、容量が1増えると最後に載る品が変わる
//   編成は6つ（人数・エルシーの有無・エルネ（手当て）の有無が分かれるように選んだ）。
const SUPPLY_VARIANTS = [
  { name: "応急", shared: ["item_bandage", "item_bandage", "item_smoke"] },
  { name: "道具", shared: ["item_map", "item_lantern", "item_whistle", "item_oilcase", "item_pot"] },
  { name: "満載", shared: ["item_bandage", "item_map", "item_lantern", "item_smoke", "item_whistle", "item_pot", "item_oilcase", "item_bandage", "item_lantern", "item_map"] },
];
const SUPPLY_AXIS = SUPPLY_VARIANTS.flatMap((v) => [
  { ...v, name: `${v.name}／記録票なし`, obs: false },
  { ...v, name: `${v.name}／記録票あり`, obs: true },
]);
const SUPPLY_PARTIES = [
  ["adv_mina", "adv_gadd", "adv_elne", "adv_row"], // 人間4人
  ["adv_mina", "adv_gadd", "adv_row"],             // エルネ（手当て）がいない
  ["adv_mina", "adv_elne", "adv_elsie"],           // エルシー入り
  ["adv_gadd", "adv_row", "adv_elsie"],            // エルシー入り・語の持ち主が偏る
  ["adv_elne"],                                    // ひとり
  ["adv_gadd", "adv_elsie"],                       // 人間1人＋エルシー
];
const SUPPLY_SEEDS = [1, 2];

// 比較する10項目。★ 返した項目は全部見張る（sweep の `unchecked` 警告を空に保つ）。
const FIELDS = ["res", "sum", "n", "body", "obs", "tier", "hl", "grow", "days", "tens"];
// 行を対応づける鍵になる列。比較しないが「見ていない」わけではない。
const KEY_FIELDS = ["quest", "partyIndex", "seed", "supplies"];

const BASELINE_PATH = require("path").join(__dirname, "..", "fixtures", "report-baseline.json");

function sweepOptions() {
  return {
    axes: { party: allParties(), seed: SEEDS },
    probe: probe10,
    quiet: true,
  };
}

// 支給品の軸の sweep。★ `partyIndex` は **SUPPLY_PARTIES の添字**（allParties とは別の表）。
//   行には `supplies` の列が付くので、旧来の行と鍵が衝突しない。
function supplySweepOptions() {
  return {
    axes: { party: SUPPLY_PARTIES, seed: SUPPLY_SEEDS, supplies: SUPPLY_AXIS },
    probe: probe10,
    quiet: true,
  };
}

// 基準を作る／比べるときは**この2本を順に回して繋げる**（compare.spec と update-baseline の両方がここを読む）
async function sweepAll(sweep) {
  const base = await sweep(sweepOptions());
  const supply = await sweep(supplySweepOptions());
  const rows = [...base, ...supply];
  rows.pageErrors = [...(base.pageErrors ?? []), ...(supply.pageErrors ?? [])];
  return rows;
}

module.exports = { ADVENTURERS, allParties, SEEDS, SUPPLY_AXIS, SUPPLY_PARTIES, probe10, FIELDS, KEY_FIELDS, BASELINE_PATH, sweepOptions, supplySweepOptions, sweepAll };
