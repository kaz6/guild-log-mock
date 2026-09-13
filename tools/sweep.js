// 検証ハーネスの土台（読み取り専用。ゲーム側のコードもデータも変更しない）。
//
// ★ なぜ scripts/ ではなく tools/ にあるか（2026-09-12・EX-086 の裁定A）
//   **外部依存を持つから。** `scripts/` の11本は全部が外部依存ゼロで、
//   「クローンしただけで流せる」という性質がそろっている。ここは playwright と
//   実行環境固有のパスを持つので、混ぜるとその性質が崩れる。
//   → **外部依存の有無で置き場が分かれる**（詳細は CLAUDE.md）。
//
// ★ なぜあるか
//   2026-09-12 の棚卸し（session-end ⑦）で、1セッションの使い捨て検証スクリプトが
//   **43本**あり、うち generateReport を回すもの27本が**例外なく同じ骨格**を
//   書き直していると分かった——起動（34本中33本が同一文字列）／state のリセット
//   （25/27 が同一文字列）／expedition リテラルの組み立て／try-catch（23/27）／
//   軸の総当たり。**放置していたのではなく、毎回コストを払っていた。**
//   検証ごとに違うのは3つだけ：**軸**（何を総当たりするか）・**probe**（1回の遠征から
//   何を取るか）・**集計**（何と比べるか・どう数えるか）。ここは前者2つの器を出す。
//
// 使い方（Node から実行する。DevTools 貼り付けではない）
//   const { sweep, compare, tally, scan } = require("<repo>/tools/sweep");
//   const rows = await sweep({ axes: { seed: [1,2,3] }, probe: (r) => ({ res: r.result }) });
//
// ⚠ probe はブラウザの中で走る。**Node 側の変数を閉じ込められない**
//   （関数をソースにして送り、ページ内で組み直すため）。正規表現と関数は
//   引数でも渡せないので、probe が使う表は probe の中に書くこと。
//   JSON にできるデータなら axes 経由で渡る。

const fs = require("fs");
const path = require("path");

const REPO_DEFAULT = path.resolve(__dirname, "..");

// playwright と Chromium の場所は実行環境で変わる。環境変数を先に見て、
// なければ既知の場所を順に当たる（見つからなければ理由を言って止まる）。
function requirePlaywright() {
  const candidates = [
    process.env.PLAYWRIGHT_MODULE,
    "playwright",
    "/opt/node22/lib/node_modules/playwright",
  ].filter(Boolean);
  for (const c of candidates) {
    try { return require(c); } catch (e) { /* 次を試す */ }
  }
  throw new Error(
    "playwright が見つかりません。PLAYWRIGHT_MODULE に playwright のパスを入れてください。\n" +
    `試した場所: ${candidates.join(" / ")}`
  );
}

function findBrowser() {
  if (process.env.PLAYWRIGHT_CHROMIUM) return process.env.PLAYWRIGHT_CHROMIUM;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers";
  try {
    const dir = fs.readdirSync(root).find((d) => d.startsWith("chromium"));
    if (dir) {
      for (const rel of ["chrome-linux/chrome", "chrome-win/chrome.exe", "chrome-mac/Chromium.app/Contents/MacOS/Chromium"]) {
        const p = path.join(root, dir, rel);
        if (fs.existsSync(p)) return p;
      }
    }
  } catch (e) { /* 既定の解決に任せる */ }
  return undefined; // playwright 自身に解決させる
}

// ページの中で走る本体。ここが「同じ部分」のすべて。
// ★ 引数は JSON で渡るものだけ。probe と patch は文字列で渡して中で組み直す。
function pageRunner(cfg) {
  const build = (src) => (src ? new Function("return (" + src + ")")() : null);
  const probe = build(cfg.probeSrc);
  const patch = build(cfg.patchSrc);
  if (patch) patch();

  const names = Object.keys(cfg.axes);
  const combos = names.reduce(
    (acc, k) => acc.flatMap((row) => cfg.axes[k].map((v) => ({ ...row, [k]: v }))),
    [{}]
  );

  // 工程エンジンの戻り値を捕まえる（素通しのラッパ。rng ごと引数を渡すので
  // 乱数も判定も動かない）。opt-in なので、要らない検証では包まない。
  let caught = null;
  let origFieldwork = null;
  if (cfg.fieldwork && typeof simulateFieldwork === "function") {
    origFieldwork = simulateFieldwork;
    // eslint-disable-next-line no-global-assign
    simulateFieldwork = function (...a) { const r = origFieldwork.apply(this, a); caught = r; return r; };
  }

  const rows = [];
  combos.forEach((c) => {
    const party = c.party ?? cfg.party;
    const holder = cfg.holder ?? party[0];
    let itemIds = {};
    if (c.item != null) {
      if (typeof c.item === "string") itemIds = { [holder]: [c.item] };
      else if (Array.isArray(c.item)) itemIds = { [holder]: c.item };
      else itemIds = c.item;
    }
    // ★ 1回の遠征ごとに state を戻す。ここを書き忘れた使い捨てが実際にあった
    //   （fw-compare.js は reports と reportMemos を消していなかった）。
    state.worldState.totalExpeditions = 0;
    state.reports = [];
    state.reportMemos = [];
    caught = null;

    const row = {};
    // 編成そのものは行に入れず、軸の何番目かを入れる（行が編成の配列で膨らむのを避ける。
    // ★ ただし入れないと2つの編成が同じ鍵に潰れて比較できない）。
    names.forEach((k) => { if (k !== "party") row[k] = c[k]; });
    if (cfg.axes.party) row.partyIndex = cfg.axes.party.findIndex((p) => p === c.party);
    row.quest = c.quest;

    let r = null;
    try {
      r = generateReport({
        questId: c.quest,
        adventurerIds: party,
        adventurerItemIds: itemIds,
        seed: c.seed,
        departTimeOfDay: cfg.timeOfDay,
        departWeather: c.weather ?? cfg.weather,
        startTime: 0,
        durationMs: 1,
      });
    } catch (e) {
      rows.push({ ...row, error: String(e) });
      return;
    }

    const ctx = { ...row, party };
    // ★ 本文は既定で運ばない。本文つきの比較の出力は実測 17MB だった
    //   （2026-09-12・EX-082/084/085 の基準ファイル5本がいずれも 17MB）。
    //   要る検証だけ lines: true にすること。
    if (cfg.lines) ctx.lines = (r.logs ?? []).map((l) => l.text ?? "");

    const got = probe ? probe(r, ctx, caught) : {};
    if (got === null || got === undefined) return;
    if (cfg.lines && cfg.keepLines) row.lines = ctx.lines;
    rows.push({ ...row, ...got });
  });

  if (origFieldwork) {
    // eslint-disable-next-line no-global-assign
    simulateFieldwork = origFieldwork;
  }
  return rows;
}

/**
 * 遠征を総当たりして、1回ごとに probe が返したものを行として集める。
 *
 * axes   … 総当たりする軸。既定で quest（全依頼）と weather/seed/item/party を解釈する。
 *          quest を省くと masterQuests 全件。party を軸にしなければ opts.party を使う。
 * party  … 軸にしないときの固定編成（既定 基準4人）
 * holder … 支給品を持たせる冒険者（既定 編成の先頭）
 * probe  … (report, ctx, fieldwork) => object|null。★ ページ内で走るので閉包を持てない
 * lines  … ctx.lines（本文の配列）を作るか。★ 既定 OFF（上のコメントの17MBを参照）
 * fieldwork … simulateFieldwork の戻り値を probe の第3引数に渡すか。★ 既定 OFF
 * variants … { 名前: patch|null }。patch ごとにページを積み直して回し、行に variant を付ける。
 *            ★ 積み直すので、書き換えた値を戻し忘れる事故が構造的に起きない
 * out    … 指定すると行を JSON で書き出す
 */
async function sweep(opts = {}) {
  const dir = opts.dir ?? process.env.GUILD_LOG_DIR ?? REPO_DEFAULT;
  const { chromium } = requirePlaywright();
  const browser = await chromium.launch({ executablePath: findBrowser() });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  const axes = { ...(opts.axes ?? {}) };
  const variants = opts.variants ?? { "": null };
  const all = [];
  try {
    for (const [name, patch] of Object.entries(variants)) {
      await page.goto(`file://${dir}/index.html`);
      await page.waitForTimeout(opts.settleMs ?? 400);
      if (!axes.quest) {
        axes.quest = await page.evaluate(() => window.masterQuests.map((q) => q.id));
      }
      // ★ pageRunner は閉包を持たない（使うのはページ側のグローバルだけ）ので、
      //   playwright がソースにして送る形でそのまま動く。
      const rows = await page.evaluate(pageRunner, {
        axes,
        party: opts.party ?? ["adv_mina", "adv_gadd", "adv_elne", "adv_row"],
        holder: opts.holder ?? null,
        timeOfDay: opts.timeOfDay ?? "昼",
        weather: opts.weather ?? "晴れ",
        lines: opts.lines === true,
        keepLines: opts.keepLines === true,
        fieldwork: opts.fieldwork === true,
        probeSrc: opts.probe ? opts.probe.toString() : null,
        patchSrc: patch ? patch.toString() : null,
      });
      if (name) rows.forEach((r) => { r.variant = name; });
      all.push(...rows);
    }
  } finally {
    await browser.close();
  }

  if (opts.out) fs.writeFileSync(opts.out, JSON.stringify(all));
  if (!opts.quiet) {
    const bad = all.filter((r) => r.error).length;
    console.log(`件数 ${all.length} / 生成に失敗 ${bad} / pageerror ${errors.length}`, errors.slice(0, 2));
  }
  all.pageErrors = errors;
  return all;
}

/**
 * ★ 比較の既定の項目（2026-09-13・EX-093 で「成長段」を常設にした）。
 *   結末 / あらすじ / 行数 / 本文 / 観察記録 / **成長段**。
 *   ⚠️ 成長段を入れた理由：結末名は依頼をまたいで1つの表（`GROWTH_TIER_BY_RESULT`）に畳まれ、
 *     **同じ名前を別の段に置くと後勝ちで上書きされて、別の依頼の成長倍率が黙って変わる**。
 *     2026-09-13 に実際に起き（辺境教会の巡回が full → partial に落ちていた）、
 *     **旧来の5項目では1件も差が出なかった**。入口に項目を増やすことでしか拾えない。
 */
const COMPARE_FIELDS = ["res", "sum", "n", "lines", "obs", "tier"];

/**
 * 既定の probe。上の6項目をそのまま返す。★ ページの中で走るので閉包を持てない。
 * 使い方： sweep({ ..., probe: standardProbe, lines: true, keepLines: true })
 * ※ 本文（lines）と観察記録が要らない検証では、自前の probe を書いてよい。
 */
function standardProbe(r) {
  return {
    res: r.result ?? null,
    sum: r.summary ?? "",
    n: (r.logs ?? []).length,
    obs: r.observationNotes ? 1 : 0,
    tier: (typeof GROWTH_TIER_BY_RESULT !== "undefined"
      ? (GROWTH_TIER_BY_RESULT[r.result] ?? "full")
      : null)
  };
}

/**
 * 2つの sweep 結果を突き合わせて、フィールドごとの不一致件数を出す。
 * key    … 行を対応づける鍵（既定：比較項目を除いた列をすべて連結）
 * fields … 比較する項目（既定：COMPARE_FIELDS）
 * by     … 不一致の内訳を出す切り口（省略可）
 */
function compare(rowsA, rowsB, opts = {}) {
  const fields = opts.fields ?? COMPARE_FIELDS;
  const key = opts.key ?? ((r) => Object.keys(r).filter((k) => !fields.includes(k) && k !== "lines")
    .sort().map((k) => `${k}=${r[k]}`).join("/"));
  const mapB = new Map(rowsB.map((r) => [key(r), r]));
  const diff = {}; const by = {};
  fields.forEach((f) => { diff[f] = 0; by[f] = {}; });
  let missing = 0;
  rowsA.forEach((a) => {
    const b = mapB.get(key(a));
    if (!b) { missing++; return; }
    fields.forEach((f) => {
      if (!sameValue(a[f], b[f])) {
        diff[f]++;
        if (opts.by) { const k = opts.by(a); by[f][k] = (by[f][k] ?? 0) + 1; }
      }
    });
  });
  return { total: rowsA.length, missing, diff, by };
}

// ★ 配列（本文の `lines` など）は `!==` では必ず不一致になる（参照比較）。
//   既定の比較項目に本文が入っているので、ここを素通りさせると**全件不一致に見える**。
//   2026-09-13（EX-093）に既定へ入れたときに実際にそう出た。
function sameValue(x, y) {
  if (x === y) return true;
  if (Array.isArray(x) || Array.isArray(y) || (x && typeof x === "object") || (y && typeof y === "object")) {
    return JSON.stringify(x) === JSON.stringify(y);
  }
  return false;
}

/** 行を keyFn で束ね、binFn が返した名札で数える。{ 鍵: { 名札: 件数, n: 合計 } } */
function tally(rows, keyFn, binFn) {
  const out = {};
  rows.forEach((r) => {
    const bin = binFn(r);
    if (bin == null) return;
    const t = out[keyFn(r)] ??= { n: 0 };
    t[bin] = (t[bin] ?? 0) + 1;
    t.n++;
  });
  return out;
}

/**
 * 行の本文（lines）を正規表現で走査し、「使った／使わなかった」の同居を数える。
 * ★ lines: true, keepLines: true で集めた行に対して使う（Node 側で走るので正規表現が使える）。
 * spec.patterns … 行 => { used, unused, exclude? } または固定のその形
 * spec.key      … 束ねる鍵
 * spec.ignore   … 判定から外す行（ヘッダなど）
 */
function scan(rows, spec) {
  const out = {};
  rows.forEach((r) => {
    const p = typeof spec.patterns === "function" ? spec.patterns(r) : spec.patterns;
    if (!p || !p.used || !p.unused) return;
    const lines = (r.lines ?? []).filter((t) => !(spec.ignore && spec.ignore.test(t)));
    const used = lines.filter((t) => p.used.test(t) && !(p.exclude && p.exclude.test(t)));
    const unused = lines.filter((t) => p.unused.test(t));
    const b = out[spec.key(r)] ??= { tot: 0, used: 0, unused: 0, both: 0, samples: [] };
    b.tot++;
    if (used.length) b.used++;
    if (unused.length) b.unused++;
    if (used.length && unused.length) {
      b.both++;
      if (b.samples.length < (spec.samples ?? 1)) b.samples.push([used[0], unused[0]]);
    }
  });
  return out;
}

module.exports = { sweep, compare, tally, scan, standardProbe, COMPARE_FIELDS };
