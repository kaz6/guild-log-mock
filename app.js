const STORAGE_KEY = "expeditionGuildLogMockV011";
const MOCK_VERSION = "v0.1.2"; // 表示専用（セーブ互換の判定には使わない）
// セーブデータの世代番号（体験版①・2026-07-26導入）。stateの破壊的変更時に+1する。
// モック段階の方針：不一致なら初期化（旧セーブは捨てる割り切り）。体験版を配布した後は
// 「捨てる」が使えなくなるので、その段階で個別の移行関数方式に見直すこと（DECISION_LOG参照）。
// 3: 負傷の持続と回復クールダウン（第3段階・2026-07-29）で adventurer.injury を追加。
// ★ 個別移行関数はまだ書かない（2026-07-29裁定）。ARCHITECTURE_PRINCIPLES が求めているのは
//   「バージョンフィールドを持つこと」で、それは既に満たしている。移行関数を書くのは可逆なので後でよい。
//   **発動条件：配布ビルドを作る前に必ず個別移行関数方式へ切り替える。** ここを飛ばさない。
const STATE_SCHEMA_VERSION = 3;
const MAX_PARTY_SIZE = 4;

// === 時間スケール（体験版②・2026-07-26／2026-07-28 に定義を data 側へ移設） ===
// 帯の定義はデータなので `data-time.js` が持つ。ここは参照するだけ（値は向こうが正）。
const REAL_MINUTES_PER_GAME_DAY = window.REAL_MINUTES_PER_GAME_DAY;
const MS_PER_REAL_MINUTE = window.MS_PER_REAL_MINUTE;
const QUEST_DURATION_BANDS = window.masterDurationBands;
const DEFAULT_DURATION_BAND = window.defaultDurationBand;

// 体験版モード（時間加速）。等倍＝本番の見え方、60倍＝人に見せる用、3600倍＝検証用。
// 加速中だけ「Mock用：即帰還」ボタンを出す（素の状態＝人に見せる状態にするため）。
const DEMO_SPEED_OPTIONS = [
  { value: 1, label: "等倍" },
  { value: 60, label: "60倍" },
  { value: 3600, label: "3600倍" }
];

// 依頼の所要時間（ゲーム内日数）。帯が未設定・未知なら短の最小へ落とす。
function getQuestDurationDays(quest) {
  const band = QUEST_DURATION_BANDS[quest?.durationBand] ?? QUEST_DURATION_BANDS[DEFAULT_DURATION_BAND];
  return band.days;
}

// 実時間（ms）は日数から導出する。ここに固定値を書かないこと。
function getQuestDurationMs(quest) {
  return getQuestDurationDays(quest) * REAL_MINUTES_PER_GAME_DAY * MS_PER_REAL_MINUTE;
}

function getDemoSpeed() {
  const saved = state?.demoSpeed;
  return DEMO_SPEED_OPTIONS.some((option) => option.value === saved) ? saved : 1;
}

function setDemoSpeed(value) {
  state.demoSpeed = value;
  saveState();
  render();
}

function formatRealDuration(ms) {
  if (ms < 60000) return `${Math.max(1, Math.round(ms / 1000))}秒`;
  const minutes = Math.round(ms / 60000);
  return minutes < 60 ? `${minutes}分` : `${Math.round((minutes / 60) * 10) / 10}時間`;
}

// 「1日（実1時間）」の形。ゲーム内の長さと実時間の対応をそのまま見せる。
function formatQuestDuration(quest) {
  const days = getQuestDurationDays(quest);
  const gameHours = days * 24;
  const gameText = days >= 1
    ? `${Math.round(days * 10) / 10}日`
    : days >= 0.5
      ? "半日"
      : gameHours >= 1
        ? `${Math.round(gameHours * 10) / 10}時間`
        : `${Math.max(1, Math.round(gameHours * 60))}分`;
  // ★ 実時間だけで出す依頼（2026-09-18・EX-133）。依頼データの `realDurationOnly` が立っている回だけ。
  //   ⚠️ **プレイヤーが体感するのは実時間だけ**で、そこにゲーム内時間を並べても判断の役に立たない。
  //   ⚠️ **全依頼に及ぼすかは未裁定。** いまは最初のクエスト1件だけの例外。
  const realText = formatRealDuration(getQuestDurationMs(quest));
  const base = quest?.realDurationOnly === true ? realText : `${gameText}（実${realText}）`;
  const speed = getDemoSpeed();
  if (speed === 1) return base;
  return `${base} ／ 加速中：約${formatRealDuration(getQuestDurationMs(quest) / speed)}`;
}

const app = document.getElementById("app");
const viewTitle = document.getElementById("viewTitle");
const navButtons = [...document.querySelectorAll(".nav-button")];
const resetButton = document.getElementById("resetButton");
// 記録員バッジ（2026-08-09・EX-065）。画面の隅に常時出る世界観内UI。
const recorderBadgeRoot = document.getElementById("recorderBadgeRoot");
const recorderBadge = document.getElementById("recorderBadge");
const recorderBadgeCard = document.getElementById("recorderBadgeCard");

// 成長するのは育成stats（6種）のみ。性格値（memory/caution/courage/kindness/curiosity）は
// 能力ではなく性格なので成長させない（2026-07-23決定。全員が同じ性格へ収束するのを防ぐ）。
// ★ ここに置く理由（2026-08-01）：loadState() が pickGrowthStats 経由でこの定数を読む。
//   下（成長の節）に置くと、セーブがあるときだけ必ず例外になり、保存データが毎回捨てられた。
//   const は宣言より前に読めないので、state の初期化より前に置くこと。
const GROWTH_ELIGIBLE_STAT_KEYS = ["combat", "exploration", "investigation", "negotiation", "support", "survival"];

let state = loadState();
// 既存セーブの手当て（2026-09-17・EX-117）：**すでに読了ハンコを押してある報告書**の分の枠を、
// 読み込み時に立てる。★ 枠が立つ規則を後から入れたので、これが無いと**古いセーブだけ
// 「読んだのにページが無い」**まま残る。何度走らせても増えない（仮称で引いて既存を返す）。
backfillEcologyRecordFrames();
let route = "home";
let selectedQuestId = state.selectedQuestId ?? null;
let selectedAdventurerIds = state.selectedAdventurerIds ?? [];
let selectedAdventurerItems = state.selectedAdventurerItems ?? {};
let editingAdventurerId = null;
// 重症の冒険者に断られたときの一言。保存しない（画面だけの一時状態）。
let departRefusal = null;
let mockTimeOfDay = null; // Mock検証用: null の場合はシステム時刻を使用

// オープニング面接: プレイヤー（記録係）の気質選択肢。tags は将来の受付嬢・冒険者の会話反映用。
const PLAYER_PERSONALITIES = [
  { key: "careful", label: "慎重", blurb: "石橋を叩いてから渡る方だ。", tags: ["慎重", "確認", "安全"] },
  { key: "bold", label: "大胆", blurb: "考えるより先に、まず動く。", tags: ["大胆", "即断", "前進"] },
  { key: "caring", label: "世話好き", blurb: "人を放っておけない。", tags: ["世話焼き", "気配り", "仲間"] },
  { key: "recorder", label: "記録好き", blurb: "細かいことも書き留めたくなる。", tags: ["記録", "観察", "細部"] }
];
let interviewStep = 0;
let interviewDraft = { name: "", personality: null };
// バッジを開いているか／光らせるか。どちらも画面だけの一時状態で保存しない。
// ★ 光る状態はオープニング再演出のために形だけ用意したもので、今はどこからも on にしていない。
let recorderBadgeOpen = false;
let recorderBadgeGlow = false;
let mockWeather = null;  // Mock検証用: null の場合は totalExpeditions ベースで自動生成

function createInitialState() {
  return {
    schemaVersion: STATE_SCHEMA_VERSION,
    adventurers: structuredClone(masterAdventurers),
    quests: structuredClone(masterQuests),
    items: structuredClone(masterItems),
    reports: [],
    expedition: null,
    worldState: {
      daysPassed: 0,
      totalReportsOpened: 0,
      totalExpeditions: 0,
      attachmentScore: 0,
      recordDensity: 0,
      anomalyPressure: 0,
      archiveSeed: Math.floor(Math.random() * 1000000)
    },
    selectedQuestId: null,
    selectedAdventurerIds: [],
    selectedAdventurerItems: {},
    ecologyRecord: {},
    reportMemos: [],
    searchChain: null,
    demoSpeed: 1, // 体験版モードの時間加速倍率（1=等倍＝本番の見え方）
    player: { name: null, personality: null, personalityLabel: null, personalityTags: [], interviewDone: false }
  };
}

// ── アイテムスロットヘルパー ──────────────────────────────────────────────────
// adventurerItemIds の値は新形式 [id1, id2] または旧形式 "id" の両方に対応する

function getAdvItemIds(adventurerItemIds, advId) {
  const val = adventurerItemIds[advId];
  if (!val) return [];
  if (Array.isArray(val)) return val.filter(Boolean);
  return [val];
}

function getAllItemIds(adventurerItemIds) {
  return Object.values(adventurerItemIds).flatMap((v) => Array.isArray(v) ? v : (v ? [v] : [])).filter(Boolean);
}

function normalizeItemMap(raw) {
  if (!raw || typeof raw !== "object") return {};
  return Object.fromEntries(
    Object.entries(raw).map(([advId, val]) => [
      advId,
      Array.isArray(val) ? val : (val ? [val, null] : [null, null])
    ])
  );
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createInitialState();
    const base = createInitialState();
    const parsed = JSON.parse(raw);
    // schemaVersion 不在＝v2導入前の旧世代（既存の内容推定マイグレーションで受け入れる）。
    // 番号が合わない＝未知の世代なので初期化（モック段階の割り切り）。
    if (parsed.schemaVersion !== undefined && parsed.schemaVersion !== STATE_SCHEMA_VERSION) {
      console.warn(`保存データの世代が異なるため初期化します（saved=${parsed.schemaVersion} / current=${STATE_SCHEMA_VERSION}）`);
      return createInitialState();
    }
    const merged = { ...base, ...parsed, worldState: { ...base.worldState, ...(parsed.worldState ?? {}) } };
    merged.schemaVersion = STATE_SCHEMA_VERSION;
    merged.quests = mergeMasterList(masterQuests);
    merged.items = mergeMasterList(masterItems);
    merged.adventurers = mergeAdventurerList(masterAdventurers, parsed.adventurers);
    // 旧形式 { advId: "itemId" } を新形式 { advId: ["itemId", null] } に正規化
    merged.selectedAdventurerItems = normalizeItemMap(parsed.selectedAdventurerItems);
    // 生態目録：名前キー → id キーへ移し替える（2026-09-17・EX-117。`schemaVersion` は上げない）
    // ★ 旧キー `beastLog` からも拾う（2026-09-17・EX-125 で内部名を改めたため）。
    //   ⚠️ **新旧のどちらか一方しか無い**のが普通なので、新を優先して片方だけ読む。
    merged.ecologyRecord = migrateEcologyRecord(parsed.ecologyRecord ?? parsed.beastLog);
    delete merged.beastLog; // 旧キーは残さない（残すと次の保存で二重に書かれる）
    // 削除済みの observations 系統（体験版①）の残骸キーを落とす
    delete merged.observations;
    delete merged.lastObservationUpdate;
    return merged;
  } catch (error) {
    console.warn("保存データの読み込みに失敗したため初期化します", error);
    return createInitialState();
  }
}

function mergeMasterList(masterList) {
  return masterList.map((masterItem) => ({ ...masterItem }));
}

function mergeAdventurerList(masterList, savedList = []) {
  const savedById = new Map((Array.isArray(savedList) ? savedList : []).map((item) => [item.id, item]));
  const savedKeys = ["favorite", "memo", "history", "status", "nickname", "injury", "missing"]; // injury: 負傷の持続（第3段階）／missing: 行方不明（EX-070）
  return masterList.map((masterItem) => {
    const saved = savedById.get(masterItem.id) ?? {};
    const savedFields = {};
    savedKeys.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(saved, key)) savedFields[key] = saved[key];
    });
    return {
      ...masterItem,
      ...savedFields,
      // 255スケール移行（2026-07-23）：旧スケール（全stat1〜5）のセーブはマスター初期値へ置換。
      // 旧値が新しい戦闘式に流入すると戦闘が成立しないため（成長分の破棄はモック段階の割り切り）。
      // ★ 性格値の分離（2026-07-31）：`stats` に取り込むのは**育つ6種だけ**にする。
      //   旧セーブの `stats` には性格値5種が混ざっているが、いま性格値は `tendencies`（1〜5・マスター側）
      //   なので、混ざったまま取り込むと使われない旧値が復活する。`schemaVersion` は上げない
      //   （内容で吸収できるため。上げると報告書も名前も全部消えるので、モックの記録を守る方を採った）。
      stats: isOldScaleStats(saved.stats) ? { ...masterItem.stats } : { ...masterItem.stats, ...pickGrowthStats(saved.stats) }
    };
  });
}

// セーブから取り込むのは育成6種だけ（性格値は tendencies へ移したので、旧セーブの残骸を入れない）
function pickGrowthStats(saved) {
  if (!saved || typeof saved !== "object") return {};
  const out = {};
  GROWTH_ELIGIBLE_STAT_KEYS.forEach((key) => {
    if (typeof saved[key] === "number") out[key] = saved[key];
  });
  return out;
}

function isOldScaleStats(stats) {
  if (!stats || typeof stats !== "object") return false;
  const values = Object.values(stats).filter((v) => typeof v === "number");
  return values.length > 0 && values.every((v) => v <= 5);
}

// 依頼種別→主成長stat（スライス10で配列化・捜索を追加）。戦闘は固定ログ依頼（畑・納屋）用＝行動ベース不可のため種別で2種。
const GROWTH_STAT_BY_CATEGORY = {
  戦闘: ["combat", "survival"],
  探索: ["exploration"],
  調査: ["investigation"],
  輸送: ["exploration"],
  保全: ["support"],
  生活: ["negotiation"],
  護衛: ["survival"],
  // ★ 2026-09-15（EX-104）に「救助」を「捜索」へ統合した。**この世界に「急を要する救出」は成立しない**
  //   （知られる前に死ぬ）ので、救助は常に捜索の結果にしかならない。別ジャンルにすると
  //   「探さずに助ける依頼」が要り、世界則と矛盾する。
  //   ⚠️ 統合で消したのは 救助＝["exploration","support"] の行。**support は引き継いでいない**
  //     （値を動かすかは別の裁定。統合の時点では振る舞いを変えない）。
  捜索: ["exploration", "investigation"],
  記録: ["investigation"]
};

// 成否補正（スライス10）：result文字列→3段階。
// ★ 2026-08-01（段階①）：この表は依頼データ（data-quests.js の outcomes）から作る。
//   結末の候補と段階の対応を2か所で持たないので、新しい依頼を足しても登録漏れが起きない。
const GROWTH_OUTCOME_TIER = { full: 1.0, partial: 0.85, fail: 0.7 };
// どの依頼にも属さない共通の結末だけをここに置く（工程エンジンの未達＝引き返し）。
const GROWTH_TIER_COMMON = { 引き返し: "fail" };
const GROWTH_TIER_BY_RESULT = buildGrowthTierByResult();

function buildGrowthTierByResult() {
  const table = { ...GROWTH_TIER_COMMON };
  // ★ この表は依頼をまたいで結末名を畳む。**同じ名前を別の段に置くと後勝ちで上書きされ、
  //   別の依頼の成長倍率が黙って変わる**（2026-09-13・EX-092 で実際に起こしかけた——
  //   夜道 v2 の昼を「異常なし」で partial に置き、辺境教会の巡回の full を潰していた）。
  //   ★ 沈黙させないために警告を出す。表の形は変えない。
  (window.masterQuests ?? []).forEach((quest) => {
    ["full", "partial", "fail"].forEach((tier) => {
      (quest.outcomes?.[tier] ?? []).forEach((name) => {
        if (table[name] && table[name] !== tier) {
          console.warn(`[結末名の衝突] 「${name}」が ${table[name]} と ${tier} の両方にあります（${quest.id}）。成長倍率が後勝ちで決まります。`);
        }
        table[name] = tier;
      });
    });
  });
  return table;
}

// 結末の候補。依頼データに無ければ空（＝呼び出し側で引き返しに落ちる）。
function questOutcomes(quest) {
  return quest?.outcomes ?? { full: [], partial: [], fail: [] };
}

// 生還補正（スライス10）：遠征単位でパーティ全員に適用。深手までは×1.0（被弾はsurvivalの学びそのもの。
// ここで減衰させると成長テンポの主変数が運になり「依頼選択で間接操作」の設計が壊れる）。
// missing は現状発火経路なし＝将来のロスト実装用の受け皿。
const GROWTH_SURVIVAL_MULT = { safe: 1.0, downed: 0.8, missing: 0.2 };
const GROWTH_MAIN_GAIN = 2.5;
const GROWTH_MICRO_GAIN = 0.3;

const GROWTH_STAT_LABELS = {
  combat: "戦い方",
  exploration: "探索",
  investigation: "調査",
  negotiation: "住民対応",
  support: "仲間を支えること",
  survival: "帰り道を確かめること"
};

const GROWTH_STAT_MAX = 255;

function growthStatsForCategory(category) {
  return GROWTH_STAT_BY_CATEGORY[category] ?? ["exploration"];
}

function humanGrowthLogText(name, statKey, rng) {
  if (statKey === "investigation") {
    return pickOne([
      `${name}は今回の依頼で、調査の勘を少しつかんだ。`,
      `${name}は、違和感を見落とさない目を少し養った。`
    ], rng);
  }
  const templates = {
    combat: `${name}は今回の遠征で、戦い方の勘を少しつかんだ。`,
    exploration: `${name}は今回の遠征で、探索の経験を少し積んだ。`,
    investigation: `${name}は今回の依頼で、調査の勘を少しつかんだ。`,
    negotiation: `${name}は今回の依頼で、住民対応の勘を少しつかんだ。`,
    support: `${name}は今回の依頼で、仲間を支える経験を少し積んだ。`,
    survival: `${name}は帰り道を確かめる経験を重ねた。`
  };
  return templates[statKey] ?? `${name}は今回の遠征で、${GROWTH_STAT_LABELS[statKey] ?? "遠征"}の経験を少し積んだ。`;
}

// 成長量の適用（スライス10・18章の式）：base×(1−現在値/255)×補正。性格値5種はここを通っても変化しない。
function applyGrowthGain(adv, statKey, base, mult) {
  if (!GROWTH_ELIGIBLE_STAT_KEYS.includes(statKey)) return 0;
  if (!adv.stats) adv.stats = {};
  const current = adv.stats[statKey] ?? 10;
  if (current >= GROWTH_STAT_MAX) return 0;
  const gain = base * (1 - current / GROWTH_STAT_MAX) * mult;
  if (gain <= 0) return 0;
  adv.stats[statKey] = Math.min(GROWTH_STAT_MAX, current + gain); // 内部は小数のまま持つ（表示はMath.floor）
  return adv.stats[statKey] - current;
}

// スライス10：2段成長式（主2.5＋微0.3重複／微0.3）×生還補正×成否補正をパーティ全員に適用する。
// 主成長セット＝依頼種別のstat ∪ 戦闘での行動stat（hiddenTags.battleGrowth）。エルシーは種別＋微成長のみ。
function appendGrowthLogToReport(report, expedition) {
  if (report?.hiddenTags?.fixedReport) return; // ★ 定型報告書（EX-064）には何も足さない（文は定型・可変は名前だけ）
  const quest = getQuest(expedition.questId);
  if (!quest || !report?.logs) return;
  const party = expedition.adventurerIds.map(getAdventurer).filter(Boolean);
  const humans = humanMembers(party);
  if (humans.length === 0) return;

  // ★ 成長は「その回で実際に使った育成値」に従う（2026-08-06・EX-054）。
  //   工程が使った育成値は hiddenTags.fieldwork.stats に入っている（宣言がなければ
  //   ジャンル表由来の値がそのまま入る）。**ここを経由することで対応表が1つのままになる。**
  //   工程を通らない依頼（戦闘・夜道）は従来どおりジャンル表へフォールバックする。
  //   ★ 2026-09-13（EX-093）に、**工程エンジンを通らない依頼も同じ形で宣言できる**ようにした
  //     （`hiddenTags.growthStats`）。仕組みは EX-054 のまま——「その回で実際に使った育成値に従う」。
  //     鍵を1つ足しただけで、対応表は増えていない。
  //     ⚠️ `hiddenTags.fieldwork` を流用しない：あれは「工程エンジンを通った」ことの記録なので、
  //       通っていない依頼に書くと別の意味になる。
  //   ⚠️ `??` で繋がない：`growthStats: []`（空配列）を書くと `fieldwork.stats` が黙って捨てられる。
  const growthStats = report.hiddenTags?.growthStats;
  const declaredStats = Array.isArray(growthStats) && growthStats.length > 0
    ? growthStats
    : report.hiddenTags?.fieldwork?.stats;
  const categoryStats = Array.isArray(declaredStats) && declaredStats.length > 0
    ? declaredStats
    : growthStatsForCategory(quest.category);
  const battleGrowth = report.hiddenTags?.battleGrowth ?? null;
  const survivalMult = battleGrowth?.downed ? GROWTH_SURVIVAL_MULT.downed : GROWTH_SURVIVAL_MULT.safe;
  const outcomeMult = GROWTH_OUTCOME_TIER[GROWTH_TIER_BY_RESULT[report.result] ?? "full"];
  const mult = survivalMult * outcomeMult;

  let best = null; // 表示用：最も伸びた「人間」×stat（エルシーも成長するが、成長ログの主語は人間に限る）
  party.forEach((adv) => {
    const isDog = adv.species === "dog";
    const actionStats = (!isDog && battleGrowth?.actorStats?.[adv.id]) || [];
    const mainSet = new Set([...categoryStats, ...actionStats]);
    GROWTH_ELIGIBLE_STAT_KEYS.forEach((statKey) => {
      const base = mainSet.has(statKey) ? GROWTH_MAIN_GAIN + GROWTH_MICRO_GAIN : GROWTH_MICRO_GAIN;
      const gained = applyGrowthGain(adv, statKey, base, mult);
      if (!isDog && gained > 0 && (!best || gained > best.gained)) {
        best = { advId: adv.id, statKey, gained };
      }
    });
  });
  if (!best) return;

  const rng = makeRng((expedition.seed ?? 1) + 991);
  const chosen = getAdventurer(best.advId);
  const statKey = best.statKey;
  const line = humanGrowthLogText(getDisplayName(chosen), statKey, rng);
  report.growth = { advId: chosen.id, statKey };

  const logs = [...report.logs];
  const insertAt = logs.length > 0 && logs[logs.length - 1].kind === "afterglow" ? logs.length - 1 : logs.length;
  logs.splice(insertAt, 0, { kind: "drama", text: line });
  report.logs = logs;
}

function pickTwoHumans(party, rng) {
  const humans = humanMembers(party);
  if (humans.length < 2) return null;
  const pool = [...humans];
  const first = pool.splice(Math.floor(rng() * pool.length), 1)[0];
  const second = pickOne(pool, rng);
  return [first, second];
}

function banterCategoryKey(quest) {
  const category = quest.category;
  if (category === "輸送") return "探索";
  if (category === "記録") return "調査";
  return category;
}

function generatePartyBanterLog(party, quest, tensionValue, rng) {
  const pair = pickTwoHumans(party, rng);
  if (!pair || rng() > 0.65) return null;

  const [a, b] = pair;
  const na = getDisplayName(a);
  const nb = getDisplayName(b);
  const key = banterCategoryKey(quest);

  const pools = {
    探索: [
      `${na}が足跡を指すと、${nb}は少し先の草の倒れ方を見てうなずいた。`,
      `${na}が道の分岐で立ち止まると、${nb}は無言で先を見た。`,
      `${na}が目印を確かめると、${nb}は少し遅れて同じ方向へ足をそろえた。`
    ],
    保全: [
      `${na}が荷の位置を直すと、${nb}は「そっちの方が運びやすいな」と笑った。`,
      `${na}が作業の順番を口にすると、${nb}は頷いてから手を動かした。`,
      `${na}が足場を確かめると、${nb}はその間だけ周囲を見回した。`
    ],
    生活: [
      `${na}が荷の持ち方を変えると、${nb}は「そっちの方が楽だ」と短く言った。`,
      `${na}が段取りを確認すると、${nb}は黙って頷いた。`,
      `${na}が置き場所を指すと、${nb}は荷物をそちらへ寄せた。`
    ],
    調査: [
      `${na}が手元を確かめると、${nb}はその間だけ周囲の音を聞いていた。`,
      `${na}が立ち位置を変えると、${nb}は背後の物音に耳を澄ました。`,
      `${na}が少し先を見て足を止めると、${nb}は同じ方角を確かめた。`
    ],
    戦闘: [
      `${na}が前に出ようとすると、${nb}は短く「距離を残せ」と声をかけた。`,
      `${na}が間合いを詰めようとしたとき、${nb}は手のひらで制止した。`,
      `${na}が先へ踏み出すと、${nb}は横から足元だけを確かめた。`
    ],
    捜索: [
      `${na}が足跡を指すと、${nb}はその先の草むらを見た。`,
      `${na}が立ち止まって耳を澄ますと、${nb}は周囲の動きを確かめた。`,
      `${na}がゆっくり進むと、${nb}は後方から同じ間隔を保った。`
    ],
    護衛: [
      `${na}が歩幅を合わせると、${nb}は少し外側の道を選んだ。`,
      `${na}が立ち止まって後方を見ると、${nb}はそのまま前を見続けた。`,
      `${na}が道の曲がり角で足を止めると、${nb}は先を短く確かめた。`
    ]
  };

  const lines = pools[key] ?? pools["探索"];
  return quest.tensionBase != null && tensionValue != null
    ? pickTensionOne(lines, tensionValue, rng)
    : pickOne(lines, rng);
}

function insertDramaBeforeOutcome(logs, line) {
  let insertAt = logs.length;
  for (let i = logs.length - 1; i >= 0; i--) {
    if (logs[i].kind === "afterglow") insertAt = i;
  }
  if (insertAt > 0) insertAt -= 1;
  logs.splice(insertAt, 0, { kind: "drama", text: line });
}

function appendPartyBanterToReport(report, expedition) {
  if (report?.hiddenTags?.fixedReport) return; // ★ 定型報告書（EX-064）には何も足さない（文は定型・可変は名前だけ）
  const quest = getQuest(expedition.questId);
  if (!quest || !report?.logs) return;
  const party = expedition.adventurerIds.map(getAdventurer).filter(Boolean);
  const rng = makeRng((expedition.seed ?? 1) + 553);
  const line = generatePartyBanterLog(party, quest, report.tensionValue ?? null, rng);
  if (!line) return;
  const logs = [...report.logs];
  insertDramaBeforeOutcome(logs, line);
  report.logs = logs;
}

function memberMentionCounts(party, logs) {
  return party.map((adv) => {
    const names = [getDisplayName(adv), adv.name].filter((n) => n && n.length > 0);
    let count = 0;
    for (const entry of logs) {
      const text = entry.text ?? "";
      if (names.some((n) => text.includes(n))) count += 1;
    }
    return { adv, count };
  });
}

function pickUnderrepresentedMember(party, logs, rng) {
  if (party.length < 2) return null;
  const tallies = memberMentionCounts(party, logs);
  const minCount = Math.min(...tallies.map((t) => t.count));
  const maxCount = Math.max(...tallies.map((t) => t.count));
  if (minCount === maxCount && minCount > 0) return null;
  const pool = tallies.filter((t) => t.count === minCount).map((t) => t.adv);
  return pickOne(pool, rng);
}

function generatePresenceLog(adv, quest, rng) {
  const name = getDisplayName(adv);
  if (adv.species === "dog") {
    return pickOne([
      `${name}は足元で鼻を鳴らし、帰り道の方を何度も振り返った。`,
      `${name}は同行者の足音に合わせ、少し後方を歩いていた。`,
      `${name}は立ち止まって風の匂いを確かめ、また足元に鼻先を寄せた。`,
      `${name}は門の方角を見て、しっぽを小さく振った。`
    ], rng);
  }

  const pools = {
    探索: [
      `${name}は一行の最後尾で、帰り道の足場を見ていた。`,
      `${name}は少し離れた場所で、足元の目印を確かめていた。`
    ],
    輸送: [
      `${name}は荷の振れ方を確かめ、紐の緩みがないか見ていた。`,
      `${name}は少し離れた場所で、足元の段差を確かめていた。`
    ],
    保全: [
      `${name}は荷の紐を結び直し、崩れないように肩へかけ直した。`,
      `${name}は作業の合間、周囲の音だけを静かに聞いていた。`
    ],
    生活: [
      `${name}は荷物の位置を直し、通り道を少し空けた。`,
      `${name}は少し離れた場所で、荷の持ち方を確かめていた。`
    ],
    調査: [
      `${name}は少し離れた場所で、手元の確認を続けていた。`,
      `${name}は一行の端で、周囲の静けさだけを確かめていた。`
    ],
    記録: [
      `${name}は少し離れた場所で、紙の乾き具合を確かめていた。`,
      `${name}は作業の合間、手元を一度だけ確かめていた。`
    ],
    戦闘: [
      `${name}は一行の後方で、退路の方を短く確かめていた。`,
      `${name}は武器の位置を直し、無言で間合いを保っていた。`
    ],
    捜索: [
      `${name}は少し離れた場所で、足跡の向きだけを見ていた。`,
      `${name}は一行の端で、周囲の物音に耳を澄ました。`
    ],
    護衛: [
      `${name}は一行の外側を歩き、帰り道の曲がり角を確かめていた。`,
      `${name}は声を出さず、後方の足音だけを聞いていた。`
    ]
  };

  const lines = pools[quest.category] ?? pools["探索"];
  return pickOne(lines, rng);
}

function appendPresenceLogToReport(report, expedition) {
  if (report?.hiddenTags?.fixedReport) return; // ★ 定型報告書（EX-064）には何も足さない（文は定型・可変は名前だけ）
  const quest = getQuest(expedition.questId);
  if (!quest || !report?.logs) return;
  const party = expedition.adventurerIds.map(getAdventurer).filter(Boolean);
  const rng = makeRng((expedition.seed ?? 1) + 317);
  const adv = pickUnderrepresentedMember(party, report.logs, rng);
  if (!adv) return;
  const line = generatePresenceLog(adv, quest, rng);
  if (!line) return;
  const logs = [...report.logs];
  insertDramaBeforeOutcome(logs, line);
  report.logs = logs;
}

function saveState() {
  state.selectedQuestId = selectedQuestId;
  state.selectedAdventurerIds = selectedAdventurerIds;
  state.selectedAdventurerItems = selectedAdventurerItems;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function setRoute(nextRoute) {
  route = nextRoute;
  editingAdventurerId = null;
  recorderBadgeOpen = false; // 画面を移ったらバッジの紙片は閉じる（開いたまま居座らせない）
  render();
}

function getDisplayName(adventurer) {
  return adventurer.nickname?.trim() || adventurer.name;
}

function isSoloParty(party) {
  return party.length === 1;
}

function partySubject(party) {
  const humans = humanMembers(party);
  if (humans.length >= 2) return "一行";
  if (humans.length === 1 && partyHasElsie(party)) {
    return `${getDisplayName(humans[0])}とエルシー`;
  }
  if (humans.length === 1) return getDisplayName(humans[0]);
  return isSoloParty(party) ? getDisplayName(party[0]) : "一行";
}

function isCompanionParty(party) {
  return humanMembers(party).length === 1 && partyHasElsie(party);
}

function isMultiHumanParty(party) {
  return humanMembers(party).length >= 2;
}

function isSoloHumanParty(party) {
  return humanMembers(party).length === 1 && !partyHasElsie(party);
}

function partyGroupLabel(party) {
  return isMultiHumanParty(party) ? "一行" : partySubject(party);
}

function usesSoloHumanStyle(party) {
  return isSoloHumanParty(party) || isCompanionParty(party);
}

function isHumanAdventurer(adv) {
  return adv != null && adv.species !== "dog";
}

function humanMembers(party) {
  return party.filter(isHumanAdventurer);
}

function supplyItemHolderAdv(party, adventurerItemIds, itemId) {
  for (const advId of Object.keys(adventurerItemIds)) {
    if (!getAdvItemIds(adventurerItemIds, advId).includes(itemId)) continue;
    const adv = getAdventurer(advId);
    if (adv && isHumanAdventurer(adv)) return adv;
  }
  return humanMembers(party)[0] ?? null;
}

function supplyItemHolderName(party, adventurerItemIds, itemId) {
  const adv = supplyItemHolderAdv(party, adventurerItemIds, itemId);
  return adv ? getDisplayName(adv) : getDisplayName(humanMembers(party)[0] ?? party[0]);
}

function partyHasElsie(party) {
  return party.some((a) => a.id === "adv_elsie");
}

// === 負傷の持続と回復（第3段階・2026-07-29） ==================================
// ★ 負傷の重さは「結末（stage）」ではなく「帰還時の個人HP率」で決める。
//   stage は物語の重さであって負傷の深さではない（実測：3つの stage で帰還時HP率がほぼ同じ。
//   特に stage重＝撤退は HP が高い）。閾値は既存の状態語（battleStatusWord）をそのまま流用する。
// ★ 負傷は戦闘の開始HPには影響させない。効くのは「出撃可否」と「回復待ち」だけ
//   （2026-07-29裁定Aで戦闘の数値は不変と確定しているため）。
// ★ 2026-07-29：状態語の深手がクリティカル基準になったので、重症もそれに従う。
//   閾値を流用する関係はそのまま＝深手なら重症、手負いなら軽症。
//   手当てで深手から持ち直していれば重症にはならない（包帯が効く）。
function injuryLevelFromHpRatio(hpRatio, gotCrit = false) {
  const word = battleStatusWord(hpRatio, 1, gotCrit);
  if (word === "健在") return null;
  return word === "手負い" ? "軽症" : "重症";
}

// 回復の残り。依頼と同じく素の値を保存し、比較時に倍率を掛ける（出発済みでも加速できる方式に合わせる）。
function getInjuryRemainingMs(adventurer, now = Date.now()) {
  const injury = adventurer?.injury;
  if (!injury || !injury.level) return 0;
  const total = injury.recoverMs ?? 0;
  const elapsed = (now - (injury.injuredAt ?? 0)) * getDemoSpeed();
  return Math.max(0, total - elapsed);
}

function getActiveInjury(adventurer, now = Date.now()) {
  return getInjuryRemainingMs(adventurer, now) > 0 ? adventurer.injury : null;
}

function isRefusingExpedition(adventurer, now = Date.now()) {
  return getActiveInjury(adventurer, now)?.level === "重症";
}

// 回復済みの負傷を落とす。時間が進むのは依頼中と回復中だけなので、描画のたびに現在時刻で判定する。
function clearRecoveredInjuries() {
  const now = Date.now();
  let changed = false;
  state.adventurers.forEach((adv) => {
    if (adv.injury && getInjuryRemainingMs(adv, now) <= 0) {
      adv.injury = null;
      changed = true;
    }
  });
  if (changed) saveState();
}

// 帰還時の個人HP率から負傷を確定する。HP率を持たない依頼（戦闘がない依頼）では何も起きない。
function applyInjuriesFromReport(report) {
  const ratios = report?.hiddenTags?.battleHpRatios;
  if (!ratios) return;
  const critIds = new Set(report?.hiddenTags?.battleCritIds ?? []);
  const now = Date.now();
  Object.entries(ratios).forEach(([advId, ratio]) => {
    const level = injuryLevelFromHpRatio(ratio, critIds.has(advId));
    if (!level) return;
    const adv = getAdventurer(advId);
    if (!adv) return;
    adv.injury = { level, injuredAt: now, recoverMs: window.masterRecoveryTimes[level] };
  });
}

// ★ 負傷の判定に渡すのは injuryHpRatio（2026-07-31）。
//   **合計被ダメが maxHp の 5% 未満なら無傷**、それ以上なら従来どおり帰還時のHP率。
//   「何も起きない日」がないと、起きた日が際立たないため。
// ★ 1発ごとに5%未満を捨てる作りにしていた時期がある（同日中に修正）。それだと
//   4%の被弾を8回受けた者＝32%を失った者まで無傷になり、報告書が「手負い」と書くのに
//   名簿が「無傷」と言う食い違いが出た。**取るに足らないかどうかは結果に対して判定する。**
function battleHpRatiosOf(battle) {
  if (!battle || !Array.isArray(battle.members)) return null;
  return Object.fromEntries(battle.members.map((m) => [
    m.id,
    m.injuryHpRatio ?? (m.maxHp > 0 ? Math.max(0, m.hp) / m.maxHp : 1)
  ]));
}

// 帰還時にクリティカル（＝深手）を抱えたままだった者。重症の判定に使う。
function battleCritIdsOf(battle) {
  if (!battle || !Array.isArray(battle.members)) return null;
  return battle.members.filter((m) => m.gotCrit).map((m) => m.id);
}

// ── 行方不明（2026-08-18・EX-070）─────────────────────────────────────────────
// 発生：戦闘が敗北（defeat／stalemate）で終わったとき、戦闘不能（downed）のままの者だけ（個人単位）。
// ★ エルシー同行時は発生しない（全員連れ帰る。撤退保証と同じ層＝「深い失敗を浅くする犬」の延長）。
// ★ 致命（人間全員 downed）は当面対象外＝現行の重症帰還のまま（報告者不在の文面設計が要るため、
//   対象に含めるかは実例が出てから再裁定）。
function battleMissingIds(battle, party) {
  if (!battle) return [];
  if (battle.outcome !== "defeat" && battle.outcome !== "stalemate") return [];
  if (partyHasElsie(party)) return [];
  const downed = battle.members.filter((m) => m.downed);
  if (downed.length === 0 || downed.length === battle.members.length) return [];
  return downed.map((m) => m.id);
}

// 行方不明の行。★ 文面は仮置きの1文・抽選なし（乱数を消費しないので、出ない報告書に影響しない）。
function missingLineText(missingIds, party) {
  const names = missingIds
    .map((id) => { const adv = party.find((a) => a.id === id); return adv ? getDisplayName(adv) : null; })
    .filter(Boolean).join("と");
  return `退く途中で${names}の姿を見失った。立っている者だけでは戻って捜せず、${names}を連れ帰れなかった。`;
}

function applyMissingFromReport(report) {
  const ids = report?.hiddenTags?.missingIds;
  if (!Array.isArray(ids) || ids.length === 0) return;
  const now = Date.now();
  ids.forEach((advId) => {
    const adv = getAdventurer(advId);
    if (!adv || adv.missing) return;
    // ★ 発生時点では時計を動かさない。起点はプレイヤーが判明した時（revealMissing）。
    adv.missing = { reportId: report.id, occurredAt: now, revealedAt: null, baseMs: 0, anchorStart: null };
    adv.status = "行方不明";
    delete adv.injury; // 手当てを受ける本人がいないので、負傷は持たない
  });
}

// 時計：★ 進むのは「進行中の遠征が存在する間」だけ。遠征がなければ止まる。
// baseMs＝確定済みの行動時間、anchorStart＝いま進行中の区間の開始（絶対時刻）。
// ★ demo 倍率は掛けない。遠征の完了そのものは加速で早まるので、進む量は自然に短くなる。
function expeditionRealEndMs(expedition) {
  return expedition.startTime + expedition.durationMs / getDemoSpeed();
}

function missingElapsedMs(adv, now = Date.now()) {
  const m = adv?.missing;
  if (!m) return 0;
  let ms = m.baseMs ?? 0;
  if (m.anchorStart != null && state.expedition) {
    ms += Math.max(0, Math.min(now, expeditionRealEndMs(state.expedition)) - m.anchorStart);
  }
  return ms;
}

function missingStage(adv, now = Date.now()) {
  if (!adv?.missing) return null;
  const ratio = Math.min(1, missingElapsedMs(adv, now) / window.masterMissingClock.limitMs);
  const stages = window.masterMissingClock.stages;
  return stages.find((s) => ratio < s.upTo) ?? stages[stages.length - 1];
}

// 判明＝プレイヤーが報告書か名簿で見た時（2026-08-18 裁定）。★ 保存は呼び出し側が行う。
function revealMissing(adv, now = Date.now()) {
  const m = adv?.missing;
  if (!m || m.revealedAt != null || m.deadAt != null) return false;
  m.revealedAt = now;
  // 判明時に別の遠征が進行中ならそこから数え始める。無ければ次の遠征の開始時から（startExpedition）。
  if (state.expedition && now < expeditionRealEndMs(state.expedition)) m.anchorStart = now;
  return true;
}

// 期限が尽きたら死亡へ遷移する（★ 今回は遷移まで。追悼画面は作らない）。
function settleMissingDeaths(now = Date.now()) {
  let changed = false;
  state.adventurers.forEach((adv) => {
    const m = adv.missing;
    if (!m || m.deadAt != null) return;
    if (missingElapsedMs(adv, now) >= window.masterMissingClock.limitMs) {
      m.deadAt = now;
      m.anchorStart = null;
      adv.status = "死亡";
      changed = true;
    }
  });
  if (changed) saveState();
}

// 段階2・3の「{名前}」＝その者と最後に同じ遠征へ出ていた者（2026-09-11・EX-072）。
// ★ 新しい値は持たない。行方不明になった当の報告書の参加者データ（report.adventurerIds）から導く。
// ★ 自分自身と、自分も行方不明・死亡の者は候補から外す（「全員行方不明」で該当者が消えるのはこのため）。
// ★ 複数いるときは参加者順＝編成順の先頭を採る（固定順。関係値ができたらそこで選び直す）。
// 該当者がいなければ受付嬢の名前を入れる（仮置き）。
function missingCompanionName(adventurer) {
  const reportId = adventurer?.missing?.reportId;
  const report = reportId != null ? state.reports.find((r) => r.id === reportId) : null;
  const companion = (report?.adventurerIds ?? [])
    .filter((id) => id !== adventurer.id)
    .map(getAdventurer)
    .filter(Boolean)
    .find((a) => !a.missing);
  return companion ? getDisplayName(companion) : (window.masterReceptionist?.name ?? "受付嬢");
}

// ★ 数字の残り時間は出さない。段階（3つ）だけ出す。死亡後は状態ピルが「死亡」を出すので段階は消す。
// ★ 2026-09-11（EX-072）にピルからカード内の行へ移した。文言が語（バッジ）から文になったので、
//   右肩のピル列に押し込むと名前の欄を潰す（実測：名簿カードで「エルネ・シェルカ」が3行に折れた）。
//   状態そのものは既存の状態ピル「行方不明」が出しているので、ここで重ねる必要はない。
function missingStageHtml(adventurer) {
  const m = adventurer.missing;
  if (!m || m.deadAt != null) return "";
  const stage = missingStage(adventurer);
  if (!stage) return "";
  let html = `<p class="missing-stage-line">${escapeHtml(stage.label)}</p>`;
  if (stage.companionLine) {
    const line = stage.companionLine.replaceAll("{名前}", missingCompanionName(adventurer));
    html += `<p class="missing-companion-line">${escapeHtml(line)}</p>`;
  }
  return html;
}

function injuryBadgeHtml(adventurer) {
  const injury = getActiveInjury(adventurer);
  if (!injury) return "";
  const remain = formatRealDuration(getInjuryRemainingMs(adventurer) / getDemoSpeed());
  const cls = injury.level === "重症" ? "injury-severe" : "injury-light";
  return `<span class="status-pill ${cls}">${escapeHtml(injury.level)}／あと${escapeHtml(remain)}</span>`;
}

// 重症は本人が断る（ボタンは塞がない＝「命じれば行く。ただし重症なら断る」）。
function departRefusalMessage(adventurerIds) {
  const now = Date.now();
  const refusing = adventurerIds.map(getAdventurer).filter(Boolean).filter((a) => isRefusingExpedition(a, now));
  if (refusing.length === 0) return null;
  const names = refusing.map(getDisplayName).map(escapeHtml).join("、");
  return `${names}は深手が癒えていません。「……この身体では、足を引っ張ります」と断られました。`;
}

function expeditionBlockedMessage(adventurerIds) {
  if (adventurerIds.length === 0) return null;
  const party = adventurerIds.map(getAdventurer).filter(Boolean);
  const needsCompanion = party.filter((a) => a.canSolo === false);
  if (needsCompanion.length > 0 && party.length === needsCompanion.length) {
    if (party.length === 1 && party[0].id === "adv_elsie") {
      return "エルシーはひとりでの遠征には出せません。誰かと一緒に編成してください。";
    }
    return `${needsCompanion.map(getDisplayName).join("、")}はひとりでの遠征には出せません。誰かと一緒に編成してください。`;
  }
  return null;
}

function elsiePartyLogText(quest, party, rng, reportResult = null) {
  if (!partyHasElsie(party) || rng() > 0.70) return null;

  const pool = [
    "エルシーは誰かの足元を小走りに駆け、先を睨みながら進んだ。",
    "エルシーは風の匂いを拾うと耳を立て、しばらくその方角を見ていた。",
    "帰り道、エルシーは何度も振り返りながら、最後は先頭で門をくぐった。",
    "エルシーの白い毛には草の種がいくつもついていたが、本人はどこか満足そうだった。"
  ];

  // ★ 2026-09-15（EX-104）に `category === "救助"` の条件を外した。救助というジャンルが無くなったため。
  //   残したのは**結末＝事実の側**（保護・発見）だけ。捜索3件のうち隊商チェーン2件は人を保護しないので、
  //   ジャンルで足すと合わない行が入る。
  if (reportResult === "保護" || reportResult === "発見") {
    pool.push("エルシーは負傷者のそばを離れず、袖口をくわえて引いた。");
  }

  if (isCompanionParty(party)) {
    const hname = getDisplayName(humanMembers(party)[0]);
    pool.push(
      `${hname}のそばをエルシーが歩いた。`,
      `${hname}とエルシーは一度立ち止まり、匂いを確かめてから歩き出した。`,
      `帰り道、エルシーは何度も振り返りながら、${hname}のそばを歩いた。`
    );
  }

  // ★ 夜道 v2（2026-09-13・EX-092）。結末で昼夜を見分ける（この関数は時間帯を受け取らないため）。
  if (quest.id === "quest_lingering_light") {
    if (reportResult === "昼に灯りは出ず") {
      pool.push(
        "エルシーは道端の匂いを一通り確かめ、何も見つけないまま戻ってきた。",
        "エルシーは昼の道を一度だけ往復し、あとは荷物のそばで伏せていた。"
      );
    } else {
      pool.push(
        "エルシーは灯りの方へ耳を向けたまま、一歩も近づこうとしなかった。",
        "エルシーは低く唸り、灯りと冒険者のあいだで足を止めた。",
        "エルシーは暗がりで列の最後尾を保ち、離れた者の匂いを追い続けた。"
      );
    }
  }

  if (quest.id === "quest_wedding_support") {
    pool.push(
      "エルシーは会場の端で伏せ、子どもたちに撫でられても静かにしていた。",
      "エルシーは年配の客の歩みに合わせて、廊下の先で立ち止まって待っていた。",
      "エルシーはおなかを撫でてほしそうに横になり、慎ましく前足を上げた。",
      "エルシーは宴会場の角で伏せ、出入りする足音を一つずつ確かめていた。"
    );
  }

  if (quest.id === "quest_letter") {
    pool.push(
      "エルシーは古い家の前で鼻を鳴らし、扉の隙間をしばらく嗅いでいた。",
      "エルシーは封筒を持つ手元を見上げ、歩き出すまで静かに待っていた。",
      "宛先の家が空き家だと分かると、エルシーは玄関先で一度だけ耳を立てた。"
    );
  }

  if (quest.id === "quest_old_bridge_repair") {
    pool.push(
      "エルシーは橋のたもとで耳を立て、水音と足音のする方を交互に見ていた。",
      "エルシーは岸の草むらで鼻を鳴らし、小川の匂いをしばらく追っていた。",
      "エルシーは橋のたもとで伏せ、作業の合図があるまで動かなかった。"
    );
  }

  if (quest.id === "quest_church_patrol") {
    pool.push(
      "エルシーは花壇の前で鼻を低くし、礼拝堂の方角だけを見ていた。",
      "エルシーは鐘楼の下で足を止め、風に揺れる鐘の音だけを耳にしていた。",
      "エルシーは礼拝堂の扉の方を一度見て、すぐに同行者のそばへ戻った。",
      "エルシーは境界の外側で立ち止まり、足跡の匂いを短く確かめた。",
      "エルシーは小さな灯りの方を見上げたが、吠えずに振り返った。"
    );
  }

  if (quest.id === "quest_herb_delivery") {
    pool.push(
      "エルシーは薬草の匂いが気になるのか、包みの近くで一度だけ鼻を鳴らした。",
      "エルシーは荷物のそばで伏せ、出発の合図まで待っていた。",
      "エルシーは道中、何度も振り返りながら歩いた。"
    );
  }

  if (quest.id === "quest_missing_herbalist") {
    pool.push(
      "エルシーは草むらの前で鼻を低くし、同じ場所を何度も嗅いでいた。",
      "エルシーは森の入口で耳を立て、浅い草の揺れだけを追っていた。",
      "エルシーは捜索のあいだ、保護対象のそばから離れなかった。"
    );
  }

  if (quest.id === "quest_evening_market_escort") {
    pool.push(
      "エルシーは親子の少し後ろを歩き、子どもが立ち止まるたびに振り返った。",
      "エルシーは夕暮れの街道で耳を立て、近づく足音だけを確かめていた。",
      "エルシーは子どもの歩幅に合わせ、門の前までそばを離れなかった。"
    );
  }

  if (quest.id === "quest_old_stele_rubbing") {
    pool.push(
      "エルシーは石碑の足元を嗅いでから、道の方を見て耳を立てた。",
      "エルシーは拓本作業のあいだ、石碑から離れず伏せていた。",
      "エルシーは旧街道の分岐を見て、一度だけ低く唸った。"
    );
  }

  // ★ 条件から `category === "戦闘"` を外した（2026-09-13・EX-092）。ここの文は『なにか』＝
  //   畑・納屋の固有名を含むので、同じ category の依頼が増えると語彙が流れ込む
  //   （夜道 v2 の相手は「灯り」で、昼は交戦すらしない）。**依頼IDで名指しする。**
  if (quest.id === "quest_field_mystery" || quest.id === "quest_barn_bite") {
    pool.push(
      "エルシーは『なにか』が跳ねるたびに耳を立て、足元を小さく回って距離を取った。",
      "エルシーは低く唸りながら、『なにか』と冒険者の間に立とうとした。",
      "エルシーは吠えて相手の気を引いたが、決して前には出すぎなかった。",
      "エルシーは戦闘の間、短く吠えて相手の注意を引いていた。",
      "エルシーは前に出る者の陰に回り込み、吠えながら足元を走った。"
    );
  }

  if (quest.id === "quest_field_mystery") {
    pool.push(
      "エルシーは畝の間を駆け抜け、逃げる影の方角だけを追った。",
      "エルシーは畑の端で吠え、畝から離れようとする動きを後押しした。"
    );
  }

  if (quest.id === "quest_barn_bite") {
    pool.push(
      "エルシーは納屋の入口で鼻を鳴らし、床板の隙間をしばらく嗅いでいた。",
      "エルシーは納屋の角で低く唸り、藁の匂いを追っていた。"
    );
  }

  if (quest.category === "探索" || quest.category === "調査") {
    pool.push(
      "エルシーは草むらの前で立ち止まり、鼻先を低くして匂いを確かめた。",
      "エルシーは何もない場所で一度だけ低く唸った。",
      "エルシーは足跡を追うように数歩進み、すぐに振り返って冒険者を待った。"
    );
  }

  return pickOne(pool, rng);
}

function withElsieLog(report, quest, party, rng) {
  if (!report || !partyHasElsie(party)) return report;
  const line = elsiePartyLogText(quest, party, rng, report.result);
  if (!line) return report;
  const logs = [...report.logs];
  const insertAt = logs.length > 0 && logs[logs.length - 1].kind === "afterglow" ? logs.length - 1 : logs.length;
  logs.splice(insertAt, 0, { kind: "drama", text: line });
  return { ...report, logs };
}

function getQuest(id) {
  return state.quests.find((quest) => quest.id === id);
}

function getItem(id) {
  return state.items.find((item) => item.id === id);
}

function getAdventurer(id) {
  return state.adventurers.find((adv) => adv.id === id);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// onclick の中の文字列リテラルに値を埋めるときに使う（2026-09-17・EX-116）。
// ⚠️ `escapeHtml` だけでは足りない。属性の中身はブラウザが先に実体参照を戻すので、
//    `&#039;` は `'` に戻り、**JS の文字列がそこで閉じてしまう**（実例：名前に `'` を入れると
//    生態目録のカードの「編集」が `missing ) after argument list` で死に、その記録は二度と開けなくなった）。
// ★ 順序が肝心：**先に JS のエスケープ、そのあと HTML のエスケープ**。
//    ⚠️ 逆にすると、HTML のエスケープで `'` が `&#039;` に化けたあとなので、
//    **JS のエスケープが `'` を見つけられない**（実測：`O'B & C` は
//    JS→HTML で `O\&#039;B &amp; C`、HTML→JS では `O&#039;B &amp; C` にしかならず、
//    後者はブラウザが復号した時点で裸の `'` に戻って文字列が閉じる）。
//    ※ `&` が二重に変換されるわけではない（2026-09-17 のセルフレビューで訂正）。
// ★ **シングルクォートの文字列リテラル専用**（`'...'`）。`"` とバックティックは
//    JS の側ではエスケープしていないので、`"..."` やテンプレートリテラルには使わない。
function escapeJsArg(value) {
  return escapeHtml(
    String(value ?? "")
      .replaceAll("\\", "\\\\")
      .replaceAll("'", "\\'")
      .replaceAll("\r", "\\r")
      .replaceAll("\n", "\\n")
  );
}

// 依頼が見つからない遠征を畳む（2026-09-14・EX-097）。**中断であって失敗ではない。**
// ★ 起きるのは**依頼を入れ替えたとき**——v2 へ作り直す／実験的な依頼を足して消す。
//   2026-09-14 の夜道 v1 の退避（EX-096）で実際に踏める形が残った。
// ★ 冒険者は失わせない（「プレイヤーを責めない」）。暦も進めない。報告書も作らない——
//   死んだ `questId` の報告書を残すと、解放条件（`getClearedQuestIds`）と報告メモに
//   その id が混ざり、**画面が落ちなくなる代わりに記録が汚れる**。
function abortExpeditionWithoutQuest() {
  const lost = state.expedition;
  console.warn(`依頼 "${lost.questId}" が見つかりません。進行中の遠征を中断し、冒険者を待機中に戻しました。`);
  // ★ 行方不明の時計は、この遠征ぶんを積んでから止める（EX-070 の完了時と同じ扱い）。
  const realEnd = Math.min(Date.now(), expeditionRealEndMs(lost));
  state.adventurers.forEach((adv) => {
    const m = adv.missing;
    if (!m || m.anchorStart == null) return;
    m.baseMs = (m.baseMs ?? 0) + Math.max(0, realEnd - m.anchorStart);
    m.anchorStart = null;
  });
  lost.adventurerIds.forEach((id) => {
    const adv = getAdventurer(id);
    if (adv && !adv.missing) adv.status = "待機中"; // ★ 行方不明者は「待機中」に戻さない
  });
  state.expedition = null;
  saveState();
}

function checkExpeditionCompletion() {
  if (!state.expedition) return;
  // ★ 依頼が引けない遠征は、所要時間を待たずにここで畳む（2026-09-14・EX-097）。
  //   放置すると `generateReport` が落ち、`render()` が毎秒失敗して**画面ごと出なくなる**。
  if (!getQuest(state.expedition.questId)) {
    abortExpeditionWithoutQuest();
    return;
  }
  // durationMs は素の値を保存し、比較時に倍率を掛ける（出発済みの遠征も加速できる）。
  const elapsed = (Date.now() - state.expedition.startTime) * getDemoSpeed();
  if (elapsed < state.expedition.durationMs) return;

  // 依頼の所要日数だけ暦を進める（体験版②）。表示は②-2。
  state.worldState.daysPassed += getQuestDurationDays(getQuest(state.expedition.questId));

  const report = generateReport(state.expedition);
  appendPresenceLogToReport(report, state.expedition);
  appendPartyBanterToReport(report, state.expedition);
  appendGrowthLogToReport(report, state.expedition);
  // ★ 名前の参照化 第二段（2026-09-17・EX-121）。**全部の行が揃ってから**通す。
  //   在席ログ・掛け合い・成長ログも報告書の本文なので、足し終わったあとに置き換える。
  applyNamedTargetToReport(report);
  state.reports.unshift(report);

  // 隊商護衛失敗 → 捜索チェーン起動（state変異はここに集約する）
  if (report.hiddenTags?.caravan && (report.hiddenTags?.branch === "fail" || report.hiddenTags?.branch === "bail") && !state.searchChain) {
    state.searchChain = { stage: 1, sourceReportId: report.id };
  }

  // 捜索依頼の報告 → チェーンの進行・解決
  if (report.hiddenTags?.searchChain) {
    const { searchStage, searchSuccess } = report.hiddenTags;
    if (searchSuccess === true) {
      state.searchChain = null;
    } else if (searchStage === 1) {
      if (state.searchChain) state.searchChain.stage = 2;
    } else if (searchStage === 2) {
      state.searchChain = null;
      state.worldState.attachmentScore -= 2; // 隊商ロストの恒久ペナルティ
    }
  }

  state.activeResultReportId = report.id;
  applyInjuriesFromReport(report); // 負傷は依頼をまたいで残る（第3段階）
  // ★ 行方不明の時計は遠征がある間だけ進む。この遠征の完了時点までの分をここで確定する
  //   （2026-08-18・EX-070。実際の完了時刻＝realEnd を使う。閉じている間に完了していても正しく積む）。
  const missingRealEnd = expeditionRealEndMs(state.expedition);
  state.adventurers.forEach((adv) => {
    const m = adv.missing;
    if (!m || m.anchorStart == null) return;
    m.baseMs = (m.baseMs ?? 0) + Math.max(0, missingRealEnd - m.anchorStart);
    m.anchorStart = null;
  });
  applyMissingFromReport(report); // 行方不明は依頼をまたいで残る（EX-070）
  state.expedition.adventurerIds.forEach((id) => {
    const adv = getAdventurer(id);
    if (adv && !adv.missing) adv.status = "待機中"; // ★ 行方不明者は「待機中」に戻さない
  });
  state.expedition = null;
  settleMissingDeaths();
  saveState();
}

// ── 記録員バッジ（2026-08-09・EX-065）──────────────────────────────────────
// ★ 常に画面の隅にあること自体が意味を持つ（裏設定側の終了条件）。数字も未読件数も付けない。
// ★ 出すのは「記録係の名前」と「就任の日付」だけ。気質など他の情報は出さない。

function getAppointedAt() {
  const value = state.player?.appointedAt;
  return typeof value === "number" ? value : null;
}

// 就任日は日付だけ出す（時刻は出さない）。読了ハンコと同じく Asia/Tokyo で固定する。
function appointedDateText() {
  const at = getAppointedAt();
  if (!at) return "";
  try {
    return new Date(at).toLocaleDateString("ja-JP", {
      timeZone: "Asia/Tokyo",
      year: "numeric", month: "long", day: "numeric"
    });
  } catch (_) { return ""; }
}

function renderRecorderBadge() {
  if (!recorderBadgeRoot || !recorderBadge || !recorderBadgeCard) return;
  // 就任前（面接がまだ）はバッジそのものが存在しない。就任と同時に現れる。
  const appointed = state.player?.interviewDone === true;
  recorderBadgeRoot.hidden = !appointed;
  if (!appointed) {
    recorderBadgeOpen = false;
    recorderBadgeCard.hidden = true;
    return;
  }
  recorderBadge.classList.toggle("glowing", recorderBadgeGlow);
  recorderBadge.setAttribute("aria-expanded", recorderBadgeOpen ? "true" : "false");
  recorderBadgeCard.hidden = !recorderBadgeOpen;
  if (!recorderBadgeOpen) return;
  const dateText = appointedDateText();
  recorderBadgeCard.innerHTML = `
    <p class="recorder-badge-role">記録員</p>
    <p class="recorder-badge-name">${escapeHtml(state.player?.name ?? "記録係")}</p>
    <p class="recorder-badge-date">${dateText ? `就任　${escapeHtml(dateText)}` : ""}</p>
  `;
}

function toggleRecorderBadge() {
  recorderBadgeOpen = !recorderBadgeOpen;
  renderRecorderBadge();
}

// オープニング再演出用。★ 今は使わない（形だけ持たせておく）。
window.setRecorderBadgeGlow = function (on = true) {
  recorderBadgeGlow = on === true;
  renderRecorderBadge();
};

function render() {
  checkExpeditionCompletion();
  clearRecoveredInjuries(); // 回復はオフライン中も進む（絶対時刻で判定するため）
  settleMissingDeaths(); // 行方不明の期限切れ→死亡（EX-070。時計は遠征がある間だけ進んでいる）
  renderRecorderBadge(); // ★ 面接のゲートより前に置く（就任前は非表示、就任と同時に出現）

  // オープニング面接が未完なら、他の画面より先に面接シーンを出す（ゲート）。
  if (!state.player || !state.player.interviewDone) {
    renderInterview();
    return;
  }

  navButtons.forEach((button) => button.classList.toggle("active", button.dataset.route === route));

  const titles = {
    home: "ギルド",
    quests: "依頼掲示板",
    adventurers: "冒険者名簿",
    observations: "報告メモ",
    ecology: "生態目録",
    report: "報告書",
    result: "帰還報告"
  };
  viewTitle.textContent = titles[route] ?? "ギルド";

  if (route === "home") renderHome();
  if (route === "quests") renderQuests();
  if (route === "adventurers") renderAdventurers();
  if (route === "observations") renderObservations();
  if (route === "ecology") renderEcologyRecord();
  if (route === "report") renderReportDetail(state.activeReportId);
  if (route === "result") renderResult(state.activeResultReportId);
}

function renderInterview() {
  viewTitle.textContent = "ギルド受付・面接";
  navButtons.forEach((button) => button.classList.remove("active"));

  const receptionCard = (body) => `
    <section class="card">
      <div class="card-body reception">
        <div class="reception-portrait" aria-hidden="true"></div>
        <div style="flex: 1;">
          <p class="eyebrow">Guild Reception</p>
          <h3>受付嬢</h3>
          ${body}
        </div>
      </div>
    </section>
  `;

  if (interviewStep === 0) {
    app.innerHTML = receptionCard(`
      <div class="speech">ようこそ、遠征ギルドへ。本日はギルドの<strong>記録係</strong>の面接にお越しいただきました。わたしはこのギルドの受付を務めています。……といっても、堅い面接ではありません。少しだけ、お話を伺わせてください。</div>
      <div class="button-row" style="margin-top: 16px;">
        <button class="primary-button" onclick="interviewBegin()">面接を始める</button>
      </div>
    `);
    return;
  }

  if (interviewStep === 1) {
    app.innerHTML = receptionCard(`
      <div class="speech">まず、お名前を伺ってもよろしいですか。この名簿に、記録係として書き留めておきます。</div>
      <div class="form-row" style="margin-top: 14px;">
        <label for="interviewNameInput">お名前</label>
        <input id="interviewNameInput" type="text" maxlength="24" placeholder="記録係の名前" value="${escapeHtml(interviewDraft.name)}" />
      </div>
      <div class="button-row" style="margin-top: 14px;">
        <button class="primary-button" onclick="interviewSubmitName()">次へ</button>
      </div>
    `);
    const el = document.getElementById("interviewNameInput");
    if (el) {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
      el.addEventListener("keydown", (e) => { if (e.key === "Enter") interviewSubmitName(); });
    }
    return;
  }

  if (interviewStep === 2) {
    app.innerHTML = receptionCard(`
      <div class="speech">${escapeHtml(interviewDraft.name)}さん、ですね。差し支えなければ、ご自身の気質を一つだけ選んでいただけますか。……ええ、面接の形として伺うだけですので、正解はありません。</div>
      <div class="button-row" style="margin-top: 16px; flex-wrap: wrap; gap: 10px;">
        ${PLAYER_PERSONALITIES.map((p) => `<button class="secondary-button" onclick="interviewPickPersonality('${p.key}')" title="${escapeHtml(p.blurb)}">${escapeHtml(p.label)}</button>`).join("")}
      </div>
    `);
    return;
  }

  const chosen = PLAYER_PERSONALITIES.find((p) => p.key === interviewDraft.personality);
  app.innerHTML = receptionCard(`
    <div class="speech">ありがとうございます。……形ばかりの面接ですが、問題ありません。ようこそ、記録係の${escapeHtml(interviewDraft.name)}さん。</div>
    <div class="speech" style="margin-top: 12px;">では、記録係としての最初のお仕事です。この名簿に、あなた自身を書き留めてください。これが、ギルドに残る最初の記録になります。</div>
    <div class="kv" style="margin-top: 14px;">
      <span>記録係</span><strong>${escapeHtml(interviewDraft.name)}</strong>
      <span>気質</span><strong>${escapeHtml(chosen?.label ?? "—")}</strong>
    </div>
    <div class="button-row" style="margin-top: 16px;">
      <button class="primary-button" onclick="interviewComplete()">名簿に記録する</button>
    </div>
  `);
}

function interviewBegin() {
  interviewStep = 1;
  render();
}

function interviewSubmitName() {
  const el = document.getElementById("interviewNameInput");
  const value = (el?.value ?? "").trim();
  interviewDraft.name = value || "記録係";
  interviewStep = 2;
  render();
}

function interviewPickPersonality(key) {
  interviewDraft.personality = key;
  interviewStep = 3;
  render();
}

function interviewComplete() {
  const chosen = PLAYER_PERSONALITIES.find((p) => p.key === interviewDraft.personality);
  state.player = {
    name: interviewDraft.name || "記録係",
    personality: interviewDraft.personality,
    personalityLabel: chosen?.label ?? null,
    personalityTags: chosen?.tags ?? [], // ★死蔵（保存されるだけで一度も読まれていない。2026-07-31 の棚卸し）
    interviewDone: true,
    // 就任日（2026-08-09・EX-065）。バッジの表示にしか使わない。
    // ★ 名簿に書き留めた瞬間＝就任なので、ここ以外では発行しない。
    appointedAt: Date.now()
  };
  saveState();
  interviewStep = 0;
  interviewDraft = { name: "", personality: null };
  route = "home";
  render();
}

function renderHome() {
  const unopened = state.reports.filter((report) => !report.opened);
  const latestReports = state.reports.slice(0, 3);
  const expedition = state.expedition;
  // 案B（体験版①）：閉じている間に帰還が確定していた場合、全画面リザルトへ飛ばさず
  // ホーム最上部に「今回の帰還」カードを差し込む（開封の主導権をプレイヤーに残す）。
  const returnedReport = state.activeResultReportId
    ? state.reports.find((r) => r.id === state.activeResultReportId)
    : null;
  const returnedQuest = returnedReport ? getQuest(returnedReport.questId) : null;

  app.innerHTML = `
    ${returnedReport ? `
    <section class="card">
      <div class="card-body">
        <div class="card-title">
          <div>
            <p class="eyebrow">Homecoming</p>
            <h3>一行が戻っています</h3>
          </div>
          <span class="status-pill good">帰還</span>
        </div>
        <p class="muted">「${escapeHtml(returnedQuest?.title ?? "遠征")}」の報告が届いています。</p>
        <div class="button-row" style="margin-top: 12px;">
          <button class="primary-button" onclick="setRoute('result')">帰還を確認する</button>
        </div>
      </div>
    </section>` : ""}
    <div class="grid-2">
      <section class="card">
        <div class="card-body reception">
          <div class="reception-portrait" aria-hidden="true"></div>
          <div>
            <p class="eyebrow">Guild Reception</p>
            <h3>受付嬢</h3>
            <div class="speech">
              ${state.player?.name ? `${escapeHtml(state.player.name)}さん、` : ""}${unopened.length > 0
                ? `おかえりなさい。未開封の報告書が ${unopened.length} 通、届いています。落ち着いて、一通ずつ確認しましょう。`
                : expedition
                  ? "遠征中の一行があります。扉の音がしたら、私が報告書をお持ちしますね。"
                  : "本日の依頼掲示板を確認できます。出発前の支給品も、忘れずに選んでくださいね。"}
            </div>
            <div class="button-row" style="margin-top: 16px;">
              <button class="primary-button" onclick="setRoute('quests')">依頼を選ぶ</button>
              <button class="secondary-button" onclick="setRoute('adventurers')">名簿を見る</button>
            </div>
          </div>
        </div>
      </section>

      <section class="card">
        <div class="card-body">
          <div class="card-title">
            <div>
              <p class="eyebrow">Reports</p>
              <h3>報告書棚</h3>
            </div>
            <span class="status-pill">未開封 ${unopened.length}</span>
          </div>
          <div class="content">
            ${latestReports.length === 0 ? `<div class="empty">まだ報告書は届いていません。</div>` : latestReports.map(reportCardHtml).join("")}
          </div>
        </div>
      </section>
    </div>

    ${expedition ? expeditionProgressHtml(expedition) : ""}
  `;
}

// 読了ハンコ（2026-08-06）。★ プレイヤーが手で押すもので、開封（`opened`）とは別。
//   `readStampAt` に押した時刻を持つだけ（`schemaVersion` 据え置き）。
//   ★ 未読件数のバッジは出さない。急かす表示にしないため、押した側だけが見える形にする。
function readStampDateText(report) {
  return stampDateText(report.readStampAt);
}

// 判子を押した日時の表示（読了ハンコと命名の確定印で同じ形にする）
function stampDateText(timestamp) {
  if (!timestamp) return "";
  try {
    return new Date(timestamp).toLocaleString("ja-JP", {
      timeZone: "Asia/Tokyo",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit"
    });
  } catch (_) { return ""; }
}

function stampReport(id) {
  const report = state.reports.find((item) => item.id === id);
  if (!report || report.readStampAt) return; // 一度押したら押し直さない（消す操作は用意しない）
  report.readStampAt = Date.now();
  ensureEcologyRecordFrame(report); // ★ 初遭遇＝読んだ時点。生態目録の枠はここで現れる（2026-09-17 の裁定3）
  saveState();
  render();
}

function reportCardHtml(report) {
  const quest = getQuest(report.questId);
  return `
    <article class="report-card ${report.opened ? "" : "unopened"} ${report.readStampAt ? "stamped" : ""}">
      <h3>${escapeHtml(quest?.title ?? "報告書")}</h3>
      <p>${escapeHtml(report.summary)}</p>
      <div class="button-row" style="margin-top: 14px;">
        <button class="small-button" onclick="openReport('${escapeJsArg(report.id)}')">${report.opened ? "読み返す" : "開封する"}</button>
      </div>
    </article>
  `;
}

function expeditionProgressHtml(expedition) {
  const quest = getQuest(expedition.questId);
  const elapsed = Math.max(0, Date.now() - expedition.startTime) * getDemoSpeed();
  const pct = Math.min(100, Math.floor((elapsed / expedition.durationMs) * 100));
  const party = expedition.adventurerIds.map(getAdventurer).filter(Boolean).map(getDisplayName).join(" / ");

  return `
    <section class="card">
      <div class="card-body">
        <div class="card-title">
          <div>
            <p class="eyebrow">Expedition in Progress</p>
            <h3>遠征中：${escapeHtml(questDisplayTitle(quest))}</h3>
          </div>
          <span class="status-pill away">遠征中</span>
        </div>
        <p class="muted">編成：${escapeHtml(party)}</p>
        <div class="progress-shell" style="margin: 14px 0;">
          <div class="progress-bar" style="width: ${pct}%"></div>
        </div>
        ${getDemoSpeed() > 1 ? `
        <div class="button-row">
          <button class="secondary-button" onclick="advanceTimeForMock()">Mock用：扉の音を待たず報告書を届ける</button>
        </div>` : ""}
      </div>
    </section>
  `;
}

function getCurrentConditions() {
  const timeIcons = { 朝: "🌅", 昼: "☀", 夕方: "🌇", 夜: "🌙" };
  let timeOfDay;
  if (mockTimeOfDay) {
    timeOfDay = mockTimeOfDay;
  } else {
    const hour = new Date().getHours();
    timeOfDay = hour < 6 ? "夜" : hour < 11 ? "朝" : hour < 16 ? "昼" : hour < 19 ? "夕方" : "夜";
  }
  const timeIcon = timeIcons[timeOfDay] ?? "☀";
  const weathers = ["晴れ", "曇り", "小雨", "風が強い", "霧"];
  const weatherIdx = (state.worldState.totalExpeditions * 3 + state.worldState.archiveSeed) % weathers.length;
  const weather = mockWeather ?? weathers[weatherIdx];
  return { timeOfDay, timeIcon, weather };
}

function setMockTimeOfDay(t) {
  mockTimeOfDay = t;
  render();
}

function setMockWeather(w) {
  mockWeather = w;
  render();
}

// 依頼の解放判定（体験版②-3）。`unlockedBy` が指す依頼へ一度でも遠征していれば解放。
// 成否は問わない（失敗で行き止まりにすると「失敗も物語として進む」設計と矛盾するため）。
// ★ 解放状態は state.reports から都度導出している。将来「報告書を削除できる」ようにすると
//   解放が巻き戻るので、そのときはここを見直すこと（DECISION_LOG 参照）。
// ※ `hidden`（捜索チェーン専用＝掲示板には永久に並ばない）とは別概念。両方を並存させる。
// ★ `unlockedAfterCount`（2026-08-06）：達成した依頼の件数で開く。どの依頼かは問わない。
//   `unlockedBy` と別の条件として持ち、**両方あるときは両方満たしたときだけ開く**。
//   数えるのは `clearedQuestIds`＝**行った依頼の種類数**（同じ依頼を2回行っても1件）。
function isQuestUnlocked(quest, clearedQuestIds) {
  if (typeof quest.unlockedAfterCount === "number" && clearedQuestIds.size < quest.unlockedAfterCount) return false;
  if (!quest.unlockedBy) return true;
  return clearedQuestIds.has(quest.unlockedBy);
}

function getClearedQuestIds() {
  return new Set(state.reports.map((report) => report.questId));
}

// ★ 再出現（2026-09-13・EX-093）。**倒していない間だけ掲示板に戻る**依頼のための判定。
//   依頼データの宣言 `reappearAfterCount: { min, max }` を持つ依頼にだけ効く（持たない依頼は素通り）。
//   ★ 間隔は**依頼の消化数**（`state.reports.length`）で測る。EX-049 で確定している
//     「クールタイムは消化数1〜3」の規格に合わせた（設計時の「雑に50」は 2026-09-13 に撤回済み）。
//   ★ 倒したかどうかは結末ラベルではなく `hiddenTags.battleOutcome === "victory"` で見る。
//     この依頼の `outcomes.full` には昼の空振りが入らないよう名前を分けてあるが、
//     **「倒した」は戦闘の事実であって結末の段ではない**ので、事実の側を見る。
//   ⚠️ 掲示板は1秒ごとに描き直されるので、**判定は乱数を使わない**（毎秒ちらつくため）。
//     必要な間隔は最後に行った回の位置から決めるので、同じ状態なら必ず同じ答えになる。
function questBoardVisibility(quest, reports) {
  const rule = quest.reappearAfterCount;
  if (!rule) return { visible: true };
  // ★ `state.reports` は **unshift**（新しいものが先頭・`app.js` の遠征完了処理）。
  //   ここを取り違えると「挑戦直後にすぐ戻り、以後は消化数と無関係に点滅する」という**逆の挙動**になる。
  //   2026-09-13（EX-093）の初版が実際にそうなっていた。
  // ★ 旧セーブ対策：v1 の報告書は同じ `questId` を持つが `battleOutcome` も `daylightMiss` も無い。
  //   v2 の挑戦だけを数える（v1 の記録を「挑戦」に数えると、旧セーブで待機に入ってしまう）。
  const fromV2 = (report) =>
    report.hiddenTags?.battleOutcome !== undefined || report.hiddenTags?.daylightMiss === true;
  const mine = [];
  reports.forEach((report, index) => { if (report.questId === quest.id && fromV2(report)) mine.push({ report, index }); });
  if (mine.length === 0) return { visible: true, reason: "未着手" };
  if (mine.some((m) => m.report.hiddenTags?.battleOutcome === "victory")) return { visible: false, reason: "解決済み" };
  const min = rule.min ?? 1;
  const max = rule.max ?? min;
  const span = Math.max(1, max - min + 1);
  const last = mine[0];                       // 先頭が最新の挑戦
  // ★ 必要数は「何回目の挑戦か」から決める。**添字は報告書が増えるたびに動く**ので使えない。
  const need = min + ((mine.length - 1) % span);
  const since = last.index;                   // その挑戦より新しい報告書の数＝挑戦後の消化数
  return { visible: since >= need, reason: since >= need ? "再出現" : "待機中", need, since };
}

// ── 掲示板の枠（2026-09-15・EX-102）─────────────────────────────────────────
// ★ 解放の深さ。`unlockedBy` を辿った段数で、初期公開と `unlockedAfterCount` だけの依頼は 0。
//   ★ 枠があふれたときは**浅い順**に出す（進行に要るものが先に出る）。
//   ⚠️ 環（循環参照）があっても止まらないよう、辿った id を覚えながら進む。
function questUnlockDepth(quest) {
  const seen = new Set();
  let cur = quest;
  let depth = 0;
  while (cur && cur.unlockedBy && !seen.has(cur.id)) {
    seen.add(cur.id);
    cur = getQuest(cur.unlockedBy);
    depth += 1;
  }
  return depth;
}

// ★ クールタイム。**一度行った依頼は引っ込み、消化数1〜3で戻る**（EX-049 の確定事項）。
//   ⚠️ 判定に乱数を使わない。掲示板は操作のたびに描き直され、遠征中は毎秒走るので、
//     乱数を引くと毎秒ちらつく（2026-09-13・EX-093 と同じ理由）。
//   ★ `state` を増やさない。必要数も経過数も `state.reports` から導く。
//   ★ 必要数は「何回目の実施か」で 1→2→3→1… と巡回する（再出現の規格に合わせた）。
function questCooldownState(quest, reports) {
  const rule = window.masterBoardRules?.cooldown;
  const mine = [];
  // ★ `reports` は unshift（新しいものが先頭）。添字がそのまま「その回より新しい報告書の数」になる。
  reports.forEach((report, index) => { if (report.questId === quest.id) mine.push(index); });
  if (mine.length === 0) return { ready: true, reason: "未着手", fresh: true, since: Infinity };
  if (!rule) return { ready: true, reason: "再掲", fresh: false, since: mine[0] };
  const min = rule.min ?? 1;
  const max = rule.max ?? min;
  const span = Math.max(1, max - min + 1);
  const need = min + ((mine.length - 1) % span);
  const since = mine[0];
  return { ready: since >= need, reason: since >= need ? "再掲" : "小休止", fresh: false, need, since };
}

// 掲示板に並べる依頼を決める。★ 並び順は「未消化 → 既消化」で、どちらも決定的。
//   - 未消化：**解放の浅い順**（同じ深さなら定義順）。進行に要るものが先に出る。
//   - 既消化：クールタイムが明けたものだけを、**久しく行っていない順**（同点は定義順）。
//   ★ 枠は `masterBoardRules.slots`。緊急依頼（捜索チェーン）は枠の外なので、ここには入れない。
function buildBoardQuests(clearedQuestIds, reports) {
  const slots = window.masterBoardRules?.slots;
  const candidates = state.quests
    .filter((quest) => !quest.hidden && isQuestUnlocked(quest, clearedQuestIds)
      && questBoardVisibility(quest, reports).visible)
    .map((quest, order) => ({ quest, order, cool: questCooldownState(quest, reports) }));
  const byOrder = (a, b) => a.order - b.order;
  const fresh = candidates.filter((c) => c.cool.fresh)
    .sort((a, b) => (questUnlockDepth(a.quest) - questUnlockDepth(b.quest)) || byOrder(a, b));
  const rested = candidates.filter((c) => !c.cool.fresh && c.cool.ready)
    .sort((a, b) => (b.cool.since - a.cool.since) || byOrder(a, b));
  const ordered = [...fresh, ...rested].map((c) => c.quest);
  return typeof slots === "number" ? ordered.slice(0, slots) : ordered;
}

function renderQuests() {
  // ★ 掲示板から消えた依頼を選んだままにしない（2026-09-13・EX-093／2026-09-15・EX-102 で枠あふれへ拡張）。
  //   ※ 通常の操作では `startExpedition` が選択を解除するのでここには来ない。
  //     効くのは**掲示板から消えた依頼が選択されたまま状態が復元されたとき**の掃除
  //     （消える理由は3つ：再出現の待機中／クールタイムの小休止／枠あふれ）。
  const clearedQuestIds = getClearedQuestIds();
  const boardQuests = buildBoardQuests(clearedQuestIds, state.reports);
  if (selectedQuestId) {
    const selected = getQuest(selectedQuestId);
    // ★ 枠あふれで落ちたものも掃除の対象（2026-09-15・EX-102）。表示判定だけを見ていると、
    //   枠から押し出された依頼が選ばれたまま残る。
    if (selected && !boardQuests.some((quest) => quest.id === selected.id)) selectedQuestId = null;
  }
  const selectedQuest = getQuest(selectedQuestId);
  const expeditionBlock = expeditionBlockedMessage(selectedAdventurerIds);
  const canStart = selectedQuestId && selectedAdventurerIds.length > 0 && !state.expedition && !expeditionBlock;

  const cond = getCurrentConditions();
  const timeOptions = ["朝", "昼", "夕方", "夜"];
  const weatherOptions = ["晴れ", "曇り", "小雨", "霧", "風が強い"];

  const searchChain = state.searchChain;
  const urgentQuestId = searchChain ? (searchChain.stage === 2 ? "quest_caravan_lastchance" : "quest_caravan_search") : null;
  const urgentQuest = urgentQuestId ? getQuest(urgentQuestId) : null;
  // ★ 掲示板から消えている理由のうち、**待機中だけ**を1行で出す（2026-09-14・EX-095）。
  //   「解決済み」は出さない——勝った回の結末文が既に言っているので、二度書かない。
  //   「戻ってきた」も出さない——**忘れた頃に掲示板にある**のが設計7の質感で、告知すると「イベント発生」になる。
  //   ★ `state` は1つも増やさない（毎回 `state.reports` から導く）。数字は出さない。
  //   ★ **クールタイムの小休止と枠あふれはここに出さない**（2026-09-15・EX-102 の裁定）。
  //     出すと毎回ずらずら並ぶうえ、「忘れた頃に掲示板にある」という質感が消える。
  //     この行が受け持つのは**再出現つきの依頼の待機中だけ**。
  const waitingQuests = state.quests.filter((quest) =>
    !quest.hidden && isQuestUnlocked(quest, clearedQuestIds)
    && questBoardVisibility(quest, state.reports).reason === "待機中");
  if (urgentQuest) boardQuests.unshift(urgentQuest);

  app.innerHTML = `
    <div class="weather-bar">
      <span class="weather-bar-icon">${cond.timeIcon}</span>
      <span class="weather-bar-text">現在：${cond.timeOfDay} / ${cond.weather}</span>
    </div>
    ${searchChain ? `
    <div class="weather-bar">
      <span class="weather-bar-icon">🚨</span>
      <span class="weather-bar-text">隊商を護り切れなかった。捜索に向かえる者を編成せよ。</span>
    </div>` : ""}
    ${waitingQuests.map((quest) => `
    <div class="weather-bar">
      <span class="weather-bar-icon">🕗</span>
      <span class="weather-bar-text">${escapeHtml(questDisplayTitle(quest))}の件は、まだ次の話が来ていない。</span>
    </div>`).join("")}
    <div class="mock-time-bar">
      <span class="mock-time-label">🔧 時間帯：</span>
      ${timeOptions.map((t) => `<button class="mock-time-btn${mockTimeOfDay === t ? " active" : ""}" onclick="setMockTimeOfDay('${t}')">${t}</button>`).join("")}
      ${mockTimeOfDay ? `<button class="mock-time-btn" onclick="setMockTimeOfDay(null)">自動</button>` : `<button class="mock-time-btn active" onclick="setMockTimeOfDay(null)">自動</button>`}
    </div>
    <div class="mock-time-bar">
      <span class="mock-time-label">🔧 天候：</span>
      ${weatherOptions.map((w) => `<button class="mock-time-btn${mockWeather === w ? " active" : ""}" onclick="setMockWeather('${w}')">${w}</button>`).join("")}
      ${mockWeather ? `<button class="mock-time-btn" onclick="setMockWeather(null)">自動</button>` : `<button class="mock-time-btn active" onclick="setMockWeather(null)">自動</button>`}
    </div>
    <div class="mock-time-bar">
      <span class="mock-time-label">🔧 時間加速：</span>
      ${DEMO_SPEED_OPTIONS.map((option) => `<button class="mock-time-btn${getDemoSpeed() === option.value ? " active" : ""}" onclick="setDemoSpeed(${option.value})">${option.label}</button>`).join("")}
    </div>
    <section class="card">
      <div class="card-body">
        <div class="card-title">
          <div>
            <p class="eyebrow">Quest Board</p>
            <h3>依頼選択</h3>
          </div>
          ${state.expedition ? `<span class="status-pill away">遠征中のため新規出発不可</span>` : `<span class="status-pill good">出発可能</span>`}
        </div>
        <div class="grid-3">
          ${boardQuests.map((quest) => questCardHtml(quest, quest.id === urgentQuestId)).join("")}
        </div>
      </div>
    </section>

    <div class="grid-2">
      <section class="card">
        <div class="card-body">
          <div class="card-title">
            <div>
              <p class="eyebrow">Party</p>
              <h3>冒険者選択</h3>
            </div>
            <span class="status-pill">${selectedAdventurerIds.length}/${MAX_PARTY_SIZE}人</span>
          </div>
          <div class="content">
            ${state.adventurers.map(selectableAdventurerHtml).join("")}
          </div>
        </div>
      </section>

      <section class="card">
        <div class="card-body">
          <div class="card-title">
            <div>
              <p class="eyebrow">Supplies</p>
              <h3>支給品割り当て</h3>
            </div>
            <span class="status-pill">${getAllItemIds(selectedAdventurerItems).length}個</span>
          </div>
          ${selectedAdventurerIds.length === 0
            ? `<div class="empty">冒険者を選択してください。</div>`
            : `<div class="assign-list">${selectedAdventurerIds.map(adventurerItemAssignHtml).join("")}</div>`}
        </div>
      </section>
    </div>

    <section class="card">
      <div class="card-body">
        <div class="card-title">
          <div>
            <p class="eyebrow">Dispatch</p>
            <h3>出発確認</h3>
          </div>
        </div>
        ${selectedQuest ? dispatchSummaryHtml(selectedQuest, expeditionBlock) : `<div class="empty">まず依頼を選んでください。</div>`}
        <div class="button-row" style="margin-top: 16px;">
          <button class="primary-button" ${canStart ? "" : "disabled"} onclick="startExpedition()">遠征開始</button>
          <button class="ghost-button" onclick="clearSelections()">選択解除</button>
        </div>
      </div>
    </section>
  `;
}

function questCardHtml(quest, isUrgent = false) {
  const selected = selectedQuestId === quest.id;
  const tags = quest.tags ?? quest.recommended ?? [];
  const isLifeQuest = quest.category === "生活";
  return `
    <article class="quest-card ${selected ? "selected" : ""}" onclick="selectQuest('${escapeJsArg(quest.id)}')">
      <div class="card-title">
        <h3>${isUrgent ? "🚨 " : ""}${escapeHtml(questDisplayTitle(quest))}</h3>
        ${isUrgent ? `<span class="status-pill away">緊急</span>` : ""}
      </div>
      <p class="muted">${escapeHtml(quest.summary)}</p>
      <div class="kv">
        <span>分類</span><strong>${escapeHtml(quest.category ?? "遠征")}</strong>
        <span>${isLifeQuest ? "作業負荷" : "危険度"}</span><strong class="${isLifeQuest ? "subtle-danger" : ""}">${escapeHtml(quest.danger)}</strong>
        <span>地域</span><strong>${escapeHtml(quest.area)}</strong>
        <span>所要時間</span><strong>${escapeHtml(formatQuestDuration(quest))}</strong>
        <span>観察対象</span><strong>${escapeHtml(questDisplayTarget(quest))}</strong>
      </div>
      <div class="tags">${tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>
    </article>
  `;
}

function selectableAdventurerHtml(adventurer) {
  const selected = selectedAdventurerIds.includes(adventurer.id);
  const disabled = adventurer.status !== "待機中";
  const subtitle = adventurer.special
    ? `${escapeHtml(adventurer.job)} / ${escapeHtml(traitsDisplayText(adventurer))}${adventurer.species === "dog" ? " / 犬" : ""}`
    : `${escapeHtml(adventurer.job)} / ${escapeHtml(adventurer.personality)} / 前職：${escapeHtml(adventurer.background)}`;
  return `
    <article class="adventurer-card ${selected ? "selected" : ""}" onclick="toggleAdventurer('${escapeJsArg(adventurer.id)}')">
      <div class="card-title">
        <div>
          <h3>${adventurer.favorite ? "★ " : ""}${escapeHtml(getDisplayName(adventurer))}</h3>
          <p class="muted">${subtitle}</p>
        </div>
        <div class="status-pills">
          <span class="status-pill ${disabled ? "away" : ""}">${escapeHtml(adventurer.status)}</span>
          ${injuryBadgeHtml(adventurer)}
        </div>
      </div>
      ${missingStageHtml(adventurer)}
      <p class="muted">${escapeHtml(adventurer.memo)}</p>
    </article>
  `;
}

function selectableItemHtml(item) {
  return `
    <article class="item-card">
      <h3>${escapeHtml(item.name)}</h3>
      <p class="muted">${escapeHtml(item.note)}</p>
      <div class="tags">${item.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>
    </article>
  `;
}

function adventurerItemAssignHtml(advId) {
  const adv = getAdventurer(advId);
  if (!adv) return "";
  const slots = selectedAdventurerItems[advId] ?? [null, null];
  const slotLabels = ["スロット1", "スロット2"];
  return `
    <div class="assign-row">
      <span class="assign-name">${escapeHtml(getDisplayName(adv))}</span>
      <div class="assign-slots">
        ${[0, 1].map((slot) => {
          const currentItem = slots[slot];
          const otherSlotItem = slots[slot === 0 ? 1 : 0];
          return `
            <div class="assign-slot">
              <span class="slot-label">${slotLabels[slot]}${currentItem ? `：${escapeHtml(getItem(currentItem)?.name ?? "")}` : "（空）"}</span>
              <div class="assign-items">
                ${state.items.map((item) => {
                  const isAssigned = currentItem === item.id;
                  const sameAdvOtherSlot = otherSlotItem === item.id;
                  return `<button class="item-assign-btn${isAssigned ? " selected" : ""}${sameAdvOtherSlot ? " taken" : ""}"
                    onclick="${sameAdvOtherSlot ? "" : `assignItem('${escapeJsArg(advId)}', ${slot}, '${escapeJsArg(item.id)}')`}"
                    ${sameAdvOtherSlot ? "disabled" : ""}
                    title="${escapeHtml(item.note)}">${escapeHtml(item.name)}</button>`;
                }).join("")}
              </div>
            </div>`;
        }).join("")}
      </div>
    </div>
  `;
}

function dispatchSummaryHtml(quest, expeditionBlock = null) {
  const party = selectedAdventurerIds.map(getAdventurer).filter(Boolean);
  const itemsText = party.map((adv) => {
    const names = getAdvItemIds(selectedAdventurerItems, adv.id).map((iId) => getItem(iId)?.name).filter(Boolean);
    return names.length > 0 ? `${escapeHtml(getDisplayName(adv))}：${names.map(escapeHtml).join("・")}` : null;
  }).filter(Boolean).join(" / ") || "なし";
  return `
    <div class="kv">
      <span>依頼</span><strong>${escapeHtml(questDisplayTitle(quest))}</strong>
      <span>分類</span><strong>${escapeHtml(quest.category ?? "遠征")}</strong>
      <span>編成</span><strong>${party.length ? party.map(getDisplayName).map(escapeHtml).join(" / ") : "未選択"}</strong>
      <span>支給品</span><strong>${itemsText}</strong>
      <span>所要時間</span><strong>${escapeHtml(formatQuestDuration(quest))}</strong>
    </div>
    ${expeditionBlock ? `<p class="muted" style="margin-top: 12px;">${escapeHtml(expeditionBlock)}</p>` : ""}
    ${departRefusal ? `<p class="depart-refusal">${escapeHtml(departRefusal)}</p>` : ""}
  `;
}

function renderAdventurers() {
  // ★ 名簿を見た＝行方不明が判明した（2026-08-18・EX-070。バッジが見えるのがこの画面のため）。
  if (state.adventurers.some((adv) => revealMissing(adv))) saveState();
  const selected = editingAdventurerId ? getAdventurer(editingAdventurerId) : state.adventurers[0];
  if (!editingAdventurerId) editingAdventurerId = selected?.id;

  app.innerHTML = `
    <div class="grid-2">
      <section class="card">
        <div class="card-body">
          <div class="card-title">
            <div>
              <p class="eyebrow">Roster</p>
              <h3>冒険者一覧</h3>
            </div>
          </div>
          <div class="content">
            ${state.adventurers.map((adv) => adventurerListCardHtml(adv)).join("")}
          </div>
        </div>
      </section>
      <section class="card">
        <div class="card-body" id="adventurerEditor">
          ${selected ? adventurerEditorHtml(selected) : `<div class="empty">冒険者がいません。</div>`}
        </div>
      </section>
    </div>
  `;
}

function adventurerListCardHtml(adventurer) {
  const selected = editingAdventurerId === adventurer.id;
  return `
    <article class="adventurer-card ${selected ? "selected" : ""}" onclick="editAdventurer('${escapeJsArg(adventurer.id)}')">
      <div class="card-title">
        <div>
          <h3>${adventurer.favorite ? "★ " : "☆ "}${escapeHtml(getDisplayName(adventurer))}</h3>
          <p class="muted">本名：${escapeHtml(adventurer.name)}</p>
        </div>
        <div class="status-pills">
          <span class="status-pill ${adventurer.status !== "待機中" ? "away" : ""}">${escapeHtml(adventurer.status)}</span>
          ${injuryBadgeHtml(adventurer)}
        </div>
      </div>
      ${missingStageHtml(adventurer)}
      <div class="tags">
        <span class="tag">${escapeHtml(adventurer.job)}</span>
        <span class="tag">${escapeHtml(adventurer.species === "dog" ? "犬" : adventurer.personality)}</span>
        <span class="tag">${escapeHtml(adventurer.background)}</span>
      </div>
      <p class="muted">${escapeHtml(adventurerRosterStatsLine(adventurer))}</p>
    </article>
  `;
}

function traitsDisplayText(adventurer) {
  const traits = adventurer.traits ?? [];
  if (traits.length === 0) return adventurer.personality ?? "なし";
  return traits.map((trait) => trait.name).join(" / ");
}

const ROSTER_STAT_KEYS = ["combat", "exploration", "investigation", "negotiation", "support", "survival"];
const ROSTER_STAT_LABELS = {
  combat: "戦闘",
  exploration: "探索",
  investigation: "調査",
  negotiation: "交渉",
  support: "支援",
  survival: "生存"
};

function adventurerRosterStatsLine(adventurer) {
  const stats = adventurer.stats ?? {};
  const parts = ROSTER_STAT_KEYS.map((key) => `${ROSTER_STAT_LABELS[key]}${Math.floor(stats[key] ?? 10)}`); // 内部小数・表示整数
  return `任務能力：${parts.join(" / ")}`;
}

// ★ 性格値（tendencies）の一覧はここには置かない（2026-07-31）。
//   ログ生成側の4箇所が**それぞれ違う順序**で5つを並べており、その順序が pickOne の抽選と
//   同率時の選出結果を決めている。共通の配列にまとめると振る舞いが変わるので、まとめない。
//   値の定義は `data-adventurers.js` の `tendencies`（1〜5）が正本。

function adventurerRoleIntro(adventurer) {
  if (adventurer.memo?.trim()) return adventurer.memo.trim();
  if (adventurer.species === "dog") return "ギルド所属の犬。嗅覚と警戒で一行を支える。";
  const job = adventurer.job ?? "冒険者";
  const bg = adventurer.background ?? "";
  return bg ? `${job}。元は${bg}。` : job;
}

function adventurerTraitsDetailHtml(adventurer) {
  const traits = adventurer.traits ?? [];
  if (traits.length === 0) {
    return `<p class="muted">${escapeHtml(adventurer.personality ?? "なし")}</p>`;
  }
  return `
    <div class="tags adventurer-detail-traits">
      ${traits.map((trait) => `
        <span class="tag trait-${escapeHtml(trait.type ?? "neutral")}">${escapeHtml(trait.name)}</span>
      `).join("")}
    </div>
  `;
}

// ★ 性格値（tendencies）は数値をUIに出さない（2026-07-31）。育つ数値ではなく人柄なので、
//   名簿では特性ラベル（traits）と気質（personality）が担当する。数値は内部だけで使う。
function adventurerStatsDetailHtml(adventurer) {
  const stats = adventurer.stats ?? {};
  const mission = ROSTER_STAT_KEYS.map((key) => `${ROSTER_STAT_LABELS[key]}${Math.floor(stats[key] ?? 10)}`).join(" / ");
  return `
    <div class="kv adventurer-detail-stats">
      <span>任務能力</span><strong>${escapeHtml(mission)}</strong>
    </div>
  `;
}

function adventurerWeaponDetailHtml(adventurer) {
  if (adventurer.species === "dog") {
    return `<p class="muted">なし（ギルド犬。同行・警戒・嗅覚が主な役割）</p>`;
  }
  const weapon = adventurer.weapon;
  if (!weapon) return `<p class="muted">なし</p>`;
  const tags = (weapon.tags ?? []).join(" / ");
  return `
    <div class="kv adventurer-detail-gear">
      <span>名称</span><strong>${escapeHtml(weapon.name ?? "なし")}</strong>
      <span>種別</span><strong>${escapeHtml(weapon.type ?? "—")}</strong>
      <span>距離</span><strong>${escapeHtml(weapon.range ?? "—")}</strong>
      ${tags ? `<span>特徴</span><strong>${escapeHtml(tags)}</strong>` : ""}
    </div>
  `;
}

function adventurerAccessoryDetailHtml(adventurer) {
  const accessory = adventurer.accessory;
  if (!accessory) return `<p class="muted">なし</p>`;
  const tags = (accessory.tags ?? []).join(" / ");
  return `
    <div class="kv adventurer-detail-gear">
      <span>名称</span><strong>${escapeHtml(accessory.name ?? "なし")}</strong>
      <span>効果</span><strong>${escapeHtml(accessory.effect ?? "—")}</strong>
      ${tags ? `<span>特徴</span><strong>${escapeHtml(tags)}</strong>` : ""}
    </div>
  `;
}

function adventurerObsessionDetailHtml(adventurer) {
  const obsession = adventurer.obsession;
  if (!obsession) return `<p class="muted">なし</p>`;
  return `
    <div class="kv adventurer-detail-obsession">
      <span>執着</span><strong>${escapeHtml(obsession.label ?? "なし")}</strong>
      <span>根底</span><strong>${escapeHtml(obsession.core ?? "—")}</strong>
    </div>
  `;
}

function adventurerTaleHtml(adventurer) {
  if (adventurer.species === "dog") {
    const line = adventurer.obsession?.idleLine;
    return line
      ? `<p class="adventurer-tale-line">${escapeHtml(line)}</p>`
      : `<p class="muted">いまは誰かの足元で、出発を待っている。</p>`;
  }
  const line = adventurer.obsession?.positiveLine;
  return line ? `<p class="adventurer-tale-line">${escapeHtml(line)}</p>` : "";
}

function adventurerHistoryDetailHtml(adventurer) {
  const history = adventurer.history ?? [];
  if (history.length === 0) {
    return `<div class="empty">まだ遠征記録はありません。</div>`;
  }
  return `
    <div class="log-list adventurer-detail-history">
      ${history.slice(0, 8).map((line) => `<div class="log-line afterglow">${escapeHtml(line)}</div>`).join("")}
    </div>
  `;
}

function adventurerEditorHtml(adventurer) {
  const roleLabel = adventurer.species === "dog" ? "紹介" : "役割・紹介";
  const roleText = adventurer.species === "dog"
    ? adventurerRoleIntro(adventurer)
    : `${adventurer.job ?? "冒険者"} / ${adventurer.background ?? "—"} — ${adventurer.memo?.trim() || "記録係メモはまだありません。"}`;

  return `
    <div class="card-title">
      <div>
        <p class="eyebrow">Adventurer Detail v0.1</p>
        <h3>${escapeHtml(getDisplayName(adventurer))}</h3>
        <p class="muted">本名：${escapeHtml(adventurer.name)}</p>
      </div>
      <button class="small-button" onclick="toggleFavorite('${escapeJsArg(adventurer.id)}')">${adventurer.favorite ? "★ お気に入り" : "☆ お気に入り"}</button>
    </div>

    <section class="adventurer-detail-section">
      <p class="meta-label">${roleLabel}</p>
      <p class="adventurer-detail-intro">${escapeHtml(roleText)}</p>
    </section>

    <section class="adventurer-detail-section">
      <p class="meta-label">traits</p>
      ${adventurerTraitsDetailHtml(adventurer)}
    </section>

    <section class="adventurer-detail-section">
      <p class="meta-label">obsession</p>
      ${adventurerObsessionDetailHtml(adventurer)}
    </section>

    <section class="adventurer-detail-section">
      <p class="meta-label">stats</p>
      ${adventurerStatsDetailHtml(adventurer)}
    </section>

    <section class="adventurer-detail-section">
      <p class="meta-label">武器</p>
      ${adventurerWeaponDetailHtml(adventurer)}
    </section>

    <section class="adventurer-detail-section">
      <p class="meta-label">アクセサリー</p>
      ${adventurerAccessoryDetailHtml(adventurer)}
    </section>

    <section class="adventurer-detail-section">
      <p class="meta-label">${adventurer.species === "dog" ? "いまの様子" : "冒険譚"}</p>
      ${adventurerTaleHtml(adventurer)}
    </section>

    <section class="adventurer-detail-section">
      <p class="meta-label">履歴</p>
      ${adventurerHistoryDetailHtml(adventurer)}
    </section>

    <hr class="soft" />

    <p class="meta-label">記録係メモ</p>
    <div class="form-row">
      <label for="nicknameInput">あだ名</label>
      <input id="nicknameInput" value="${escapeHtml(adventurer.nickname ?? "")}" placeholder="例：ミナ、鉄鍋" />
    </div>
    <div class="form-row">
      <label for="memoInput">メモ</label>
      <textarea id="memoInput" placeholder="この冒険者について覚えておきたいこと">${escapeHtml(adventurer.memo ?? "")}</textarea>
    </div>
    <div class="button-row">
      <button class="primary-button" onclick="saveAdventurerMemo('${escapeJsArg(adventurer.id)}')">記録を保存</button>
    </div>
  `;
}

function renderObservations() {
  const memos = state.reportMemos ?? [];
  app.innerHTML = `
    <section class="card">
      <div class="card-body">
        <div class="card-title">
          <div>
            <p class="eyebrow">Field Notes Archive</p>
            <h3>報告メモ</h3>
          </div>
          <span class="status-pill">${memos.length}件</span>
        </div>
        <p class="muted" style="margin-bottom: 16px;">観察記録票を持った冒険者が依頼から持ち帰った一次記録です。生態目録を書くための素材置き場として使ってください。</p>
        ${memos.length === 0
          ? `<div class="empty">観察対象のある依頼に観察記録票を持たせて完了すると、冒険者ごとの記録がここに蓄積されます。</div>`
          : `<div class="memo-list">${memos.map(reportMemoCardHtml).join("")}</div>`}
      </div>
    </section>
  `;
}

function reportMemoCardHtml(memo) {
  let dateStr = "---";
  if (memo.createdAt) {
    try {
      dateStr = new Date(memo.createdAt).toLocaleString("ja-JP", {
        timeZone: "Asia/Tokyo",
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit"
      });
    } catch (_) { dateStr = memo.createdAt.slice(0, 16).replace("T", " "); }
  }
  return `
    <article class="memo-card">
      <div class="memo-card-header">
        <div class="memo-card-meta">
          <span class="memo-target-badge">${escapeHtml(memo.targetName ?? "")}</span>
          <span class="memo-quest muted">${escapeHtml(memo.questTitle ?? "")}</span>
        </div>
        <div class="memo-card-actions">
          ${findEcologyRecordByTarget(memo.targetName) ? `<button class="small-button" onclick="openEcologyRecordByTarget('${escapeJsArg(memo.targetName ?? "")}')">生態目録を編集</button>` : ""}
        </div>
      </div>
      <p class="memo-author muted">${escapeHtml(memo.adventurerName ?? "")} ／ ${dateStr}</p>
      <p class="memo-text">「${escapeHtml(memo.text ?? "")}」</p>
    </article>
  `;
}

function observationNotesHtml(obsNotes) {
  return `
    <hr class="soft" />
    <p class="meta-label">観察記録票：${escapeHtml(obsNotes.target)}</p>
    <div class="obs-notes-grid">
      ${obsNotes.notes.map((n) => `
        <div class="obs-note-card">
          <p class="obs-note-author">${escapeHtml(n.name)}の記録</p>
          <p class="obs-note-text muted">「${escapeHtml(n.text)}」</p>
        </div>
      `).join("")}
    </div>
  `;
}

// ── 生態目録（旧「いきもの図鑑」）────────────────────────────────────────────
//
// ★ 2026-09-17・EX-123：**画面と文面の呼び名を「生態目録」に改めた。**
//   理由：**図がほとんど無い**のに図鑑と名のるのは、「報告書に嘘を書かない」という主題に反する。
//   「生態目録」は**作中に既にある言葉**（魔導図書館が求めてくる呼び名／タイトル案にも入っている）。
//
// ★ 2026-09-17・EX-125：**内部名も揃えた**（`beastLog` → `ecologyRecord` ／ `bl_*` → `er_*` ／
//   `BEAST_LOG_*` → `ECOLOGY_RECORD_*` ／ ルート名 `beastlog` → `ecology` ／ eyebrow も `Ecology Record`）。
//   ⚠️ **`beastLog` は「獣の記録」の意味で、植物も怪異も入る実態と合っていなかった。**
//   ★ **セーブのキーも移した**（`state.beastLog` → `state.ecologyRecord`。`schemaVersion` は上げない。
//   エントリの id 接頭辞 `bl_` も `er_` へ振り替える。`migrateEcologyRecord` が両方を吸収する）。
//   ※ EX-123 時点では据え置きにしていた。**作者1人でやり直しが効くうちが一番安い**という判断で改めた。
//
// ★ 2026-09-17・EX-117：**キーを id にし、SOAP 構造に作り直した。**
//   - 旧：`state.ecologyRecord[名前]`。**名前がキーだったので、改名すると別ページが生えた**。
//     ※ EX-116 で塞いだのは**属性への埋め込みのエスケープ**で、別の穴。こちらは
//       **名前を識別子に使っていたこと**そのものを直している。
//   - 新：`state.ecologyRecord[id]`。名前は**表示用の値**として持つ（冒険者のあだ名と同じ形）。
//     `target` は仮称で、依頼データの `observationTarget` と対応する**不変の値**。
//     命名で入るのは `name` の側（★命名そのものは次段。ここではまだ入口を作らない）。
//   - `schemaVersion` は上げない（内容で吸収できる。上げると報告書も名前も全部消える）。
//     前例3つ：`normalizeItemMap` ／ 生態目録の旧フィールド統合 ／ `readStampAt`。
//   - ★ 削除UIは作らない。改名で別ページが生えなくなったので、消す操作が要らなくなった。
//
// SOAP（2026-09-17 の裁定2）：
//   S 冒険者の証言       ＝**自動**（観察記録票で溜まった文。`state.reportMemos` から引く）
//   O 確かめられたこと   ＝**軸を選んで自由記述**（12軸。★同じ軸に複数件を許す）
//   A 推測               ＝自由記述
//   P 次に確かめたいこと ＝自由記述
//   ★ 備考は廃止し、外見・特徴は O に吸収した。

// O の軸（2026-09-17 の裁定2）。★ 12個。増減させるときは docs/CURRENT_SPEC.md も直すこと。
const ECOLOGY_RECORD_AXES = ["形", "色", "大きさ", "数", "動き", "痕跡", "匂い", "音", "環境", "時間", "食べるもの", "人への影響"];

// 分類の選択肢。★ `observationKind` からは自動で入れない——**分類はプレイヤーの仕事**
//   （2026-09-17 の裁定2）。空＝未分類で始まる。
const ECOLOGY_RECORD_CATEGORIES = ["獣", "鳥", "虫", "植物", "菌類", "水棲", "魔物", "怪異", "人工物", "その他"];

// ── 命名（2026-09-17・EX-118） ────────────────────────────────────────────
// ★ 解禁条件＝O が **12軸中7軸以上**埋まっていること（2026-09-17 の裁定1）。
//   ⚠️ **7は暫定。** 反ミームに必要な項目数が確定したら見直すこと。
//   ★ 数えるのは**軸の種類**であって件数ではない（同じ軸に3件書いても1軸）。
//   ★ 「移行前の記述」（`legacy`）は数えない——**旧セーブの逃がし先**で、軸に振っていないため。
// ★ 命名は**確定印**を押して確定し、以後は編集できない（裁定2）。読了ハンコとは**別の判子**。
//   確定前は何度でも書き直せる（下書きは `nameDraft` に残る）。確定で `name` に移る。
// ★ 答え合わせ（隠した語との照合）は**実装しない**（裁定3）。命名は自由入力のまま通す。
const ECOLOGY_RECORD_NAMING_AXES_REQUIRED = 7;

// 本文の入っている軸の**種類**を数える（同じ軸の複数件は1つに畳まれる）
function ecologyRecordFilledAxes(entry) {
  return new Set((entry.confirmed ?? []).filter((obs) => obs.text).map((obs) => obs.axis));
}

function canNameEcologyRecordEntry(entry) {
  return ecologyRecordFilledAxes(entry).size >= ECOLOGY_RECORD_NAMING_AXES_REQUIRED;
}

function isEcologyRecordNameConfirmed(entry) {
  return Boolean(entry.nameConfirmedAt);
}

function ecologyRecordEntries() {
  return Object.values(state.ecologyRecord ?? {});
}

function getEcologyRecordEntry(id) {
  return (state.ecologyRecord ?? {})[id] ?? null;
}

// ★ 引くのは**仮称**（`target`）が基本。改名しても同じページを指すため。
// ⚠️ **確定名でも引けるようにしてある**（2026-09-17・EX-121）。第二段で、命名後に生成された
//   報告書の観察記録票は**確定名**で書かれるので、そこから来る報告メモも確定名を持つ。
//   ここを仮称だけにすると、**命名後の証言が生態目録に載らなくなる**。
function findEcologyRecordByTarget(target) {
  if (!target) return null;
  return ecologyRecordEntries().find((entry) => entry.target === target || (entry.name && entry.name === target)) ?? null;
}

// 表示名＝命名済みならその名前、まだなら仮称（冒険者の `nickname` と同じ形）
function ecologyRecordDisplayName(entry) {
  return entry.name || entry.target;
}

function nextEcologyRecordId() {
  const used = state.ecologyRecord ?? {};
  let n = Object.keys(used).length + 1;
  while (used[`er_${n}`]) n++;
  return `er_${n}`;
}

// 旧セーブ（名前がキー）を id キーへ移し替える。★ `schemaVersion` は上げない。
// ⚠️ 旧5欄・備考・外見は**軸へ自動で振らない**。「移行前の記述」に丸ごと置いて、
//   どの軸のことかはプレイヤーが決める（分類を自動で入れないのと同じ理由）。
// ※ 仮称がどの依頼の `observationTarget` にも一致しないエントリ（旧実装で名前を書き換えて
//   できた残骸）も**落とさずに移す**。独立したページとして残り、S（証言）が空になるだけ。
function migrateEcologyRecord(raw) {
  if (!raw || typeof raw !== "object") return {};
  const out = {};
  let seq = 0;
  // ★ 旧 id 接頭辞 `bl_` を `er_` へ振り替える（2026-09-17・EX-125）。番号は変えない。
  //   ⚠️ id は**このオブジェクトの中でしか使われない**（報告書は仮称で引く）ので、振り替えても
  //   他とのつながりは切れない。
  const renameId = (id) => (typeof id === "string" && id.startsWith("bl_") ? `er_${id.slice(3)}` : id);
  Object.entries(raw).forEach(([key, val]) => {
    if (!val || typeof val !== "object") return;
    if (val.id && Array.isArray(val.confirmed)) {      // 移行済み（EX-117 の形）
      const moved = renameId(val.id);
      out[moved] = moved === val.id ? val : { ...val, id: moved };
      return;
    }
    seq += 1;
    let id = renameId(val.id) || `er_${seq}`;
    while (out[id]) { seq += 1; id = `er_${seq}`; }
    const legacy = [
      val.appearance          ? `【外見・特徴】${val.appearance}` : "",
      val.notes               ? `【備考】${val.notes}` : "",
      val.behavior            ? `【行動】${val.behavior}` : "",
      val.danger              ? `【危険性】${val.danger}` : "",
      val.effectiveMeasures   ? `【有効な対処】${val.effectiveMeasures}` : "",
      val.ineffectiveMeasures ? `【効かなかった対処】${val.ineffectiveMeasures}` : ""
    ].filter(Boolean).join("\n");
    out[id] = {
      id,
      target: val.target || key,
      name: null,           // 命名で入る表示名（確定印を押すまで null）
      nameDraft: "",        // 確定前の下書き（何度でも書き直せる）
      nameConfirmedAt: null,
      area: val.area || "",
      category: val.category === "未分類" ? "" : (val.category || ""),
      confirmed: [],                  // O
      guess: "",                      // A
      nextCheck: val.nextCheck || "", // P（旧5欄の「次に確認したいこと」は意味が同じなので移す）
      legacy
    };
  });
  return out;
}

// ★ 生態目録の枠は**初遭遇で現れる**（2026-09-17 の裁定3）。初遭遇＝**読了ハンコを押した時点**。
//   帰還と同時にすると、読む前に見知らぬページが増える。
//   枠に入っているのは**仮称と遭遇地域だけ**——分類も観察も空で始まる（埋めるのはプレイヤー）。
function ensureEcologyRecordFrame(report) {
  const quest = getQuest(report.questId);
  if (!quest || !quest.observationTarget || quest.observationTarget === "なし") return null;
  // ⚠️ `observationNotes` が **null** なのは「**対象がいなかった**」回（定型報告書・昼の灯り・
  //    挑まずに引き返した回）。**記録票を持たせなかっただけの回は `notes` が空の配列**で、
  //    そちらは出会っている＝枠を立てる（2026-09-17・EX-117 で2つの null を分けた）。
  if (!report.observationNotes) return null;
  const existing = findEcologyRecordByTarget(quest.observationTarget);
  if (existing) return existing;
  const id = nextEcologyRecordId();
  state.ecologyRecord[id] = {
    id,
    target: quest.observationTarget,
    name: null,
    nameDraft: "",
    nameConfirmedAt: null,
    area: quest.area || "",
    category: "",
    confirmed: [],
    guess: "",
    nextCheck: "",
    legacy: ""
  };
  return state.ecologyRecord[id];
}

function backfillEcologyRecordFrames() {
  (state.reports ?? []).forEach((report) => { if (report.readStampAt) ensureEcologyRecordFrame(report); });
}

// S（冒険者の証言）＝自動。観察記録票で溜まった文をそのまま並べる。★ ここは書き換えられない。
// ⚠️ **仮称と確定名の両方で拾う**（2026-09-17・EX-121）。命名前の証言は仮称で、
//   命名後に届いた証言は確定名で保存されているため。
function ecologyRecordTestimonies(entry) {
  return (state.reportMemos ?? []).filter((memo) =>
    memo.targetName === entry.target || (entry.name && memo.targetName === entry.name));
}

function renderEcologyRecord() {
  const entries = ecologyRecordEntries();
  app.innerHTML = `
    <section class="card">
      <div class="card-body">
        <div class="card-title">
          <div>
            <p class="eyebrow">Ecology Record</p>
            <h3>生態目録</h3>
          </div>
          <span class="status-pill">${entries.length}件</span>
        </div>
        <p class="muted" style="margin-bottom: 12px;">報告書を読むと、出会ったものの枠が仮称のまま現れます。分類と観察はあなたが書きます。</p>
        ${entries.length === 0
          ? `<div class="empty">まだ記録はありません。<br>観察対象のいる依頼の報告書に読了のハンコを押すと、枠が現れます。</div>`
          : `<div class="grid-2" style="margin-top: 4px;">${entries.map(ecologyRecordCardHtml).join("")}</div>`}
      </div>
    </section>
  `;
}

function ecologyRecordCardHtml(entry) {
  const confirmed = (entry.confirmed ?? []).filter((obs) => obs.text);
  const testimonies = ecologyRecordTestimonies(entry);
  return `
    <article class="ecology-record-card">
      <div class="card-title">
        <div>
          <h3>${escapeHtml(ecologyRecordDisplayName(entry))}${isEcologyRecordNameConfirmed(entry)
            ? `<span class="er-name-stamp small" aria-label="確定" title="${escapeHtml(stampDateText(entry.nameConfirmedAt))} に確定">確<br />定</span>`
            : `<span class="er-tag">仮称</span>`}</h3>
          <p class="muted">${escapeHtml(entry.category || "分類未記入")} &middot; ${escapeHtml(entry.area || "地域未記入")}</p>
        </div>
        <button class="small-button" onclick="openEcologyRecordEditor('${escapeJsArg(entry.id)}')">編集</button>
      </div>
      <p class="muted er-card-counts">証言 ${testimonies.length}件 ／ 確かめられたこと ${confirmed.length}件</p>
      ${confirmed.length > 0 ? `
      <p class="meta-label">確かめられたこと</p>
      <ul class="er-axis-list">
        ${confirmed.map((obs) => `<li><span class="er-axis-tag">${escapeHtml(obs.axis)}</span>${escapeHtml(obs.text)}</li>`).join("")}
      </ul>` : ""}
      ${entry.guess     ? `<p class="meta-label">推測</p><p class="muted" style="white-space:pre-wrap">${escapeHtml(entry.guess)}</p>` : ""}
      ${entry.nextCheck ? `<p class="meta-label">次に確かめたいこと</p><p class="muted" style="white-space:pre-wrap">${escapeHtml(entry.nextCheck)}</p>` : ""}
      ${entry.legacy    ? `<p class="meta-label">移行前の記述</p><p class="muted" style="white-space:pre-wrap">${escapeHtml(entry.legacy)}</p>` : ""}
    </article>
  `;
}

// 仮称から開く（報告書・報告メモの「生態目録を編集」用）。★ 枠が無ければ何もしない——
//   枠を作るのは読了ハンコだけ（ここで作ると「初遭遇＝読了」が崩れる）。
function openEcologyRecordByTarget(targetName) {
  const entry = findEcologyRecordByTarget(targetName);
  if (entry) openEcologyRecordEditor(entry.id);
}

function openEcologyRecordEditor(id) {
  const entry = getEcologyRecordEntry(id);
  if (!entry) return;
  let overlay = document.getElementById("ecologyRecordOverlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "ecologyRecordOverlay";
    overlay.className = "ecology-record-overlay";
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = ecologyRecordEditorHtml(entry);
  overlay.classList.add("open");
}

function closeEcologyRecordEditor() {
  const overlay = document.getElementById("ecologyRecordOverlay");
  if (overlay) overlay.classList.remove("open");
}

// ★ 画面の入力をエントリへ写す。書けるのはプレイヤーの欄だけ（分類・O・A・P・移行前の記述・
//   名前の下書き）。遭遇地域と確定済みの名前は自動欄なので、ここでは触らない。
function applyEcologyRecordForm(entry) {
  const val = (elId) => document.getElementById(elId)?.value ?? "";
  entry.category = val("er_category");
  entry.confirmed = Array.from(document.querySelectorAll("#er_obs_list .er-obs-row"))
    .map((row) => ({
      axis: row.querySelector("select").value,
      text: row.querySelector("textarea").value.trim()
    }))
    .filter((obs) => obs.text); // 空行は保存しない
  entry.guess = val("er_guess").trim();
  entry.nextCheck = val("er_next").trim();
  if (document.getElementById("er_legacy")) entry.legacy = val("er_legacy").trim();
  // 下書きの名前は確定前だけ拾う（確定後は入力そのものを出さない）
  if (!isEcologyRecordNameConfirmed(entry) && document.getElementById("er_name_draft")) {
    entry.nameDraft = val("er_name_draft").trim();
  }
}

function saveEcologyRecordEntry(id) {
  const entry = getEcologyRecordEntry(id);
  if (!entry) return;
  applyEcologyRecordForm(entry);
  saveState();
  closeEcologyRecordEditor();
  render();
}

// 確定印。★ 押すと名前が確定し、**二度と変えられない**（2026-09-17 の裁定2）。
// ★ 取り返しがつかないので、押す前に一度だけ確認を出す（実装側の判断。EX-118）。
//   ⚠️ 画面側の守り（解禁前はボタンを出さない）だけにしない——**ここでも条件を見る**。
function confirmEcologyRecordName(id) {
  const entry = getEcologyRecordEntry(id);
  if (!entry || isEcologyRecordNameConfirmed(entry)) return;
  if (!canNameEcologyRecordEntry(entry)) return;
  const draft = (document.getElementById("er_name_draft")?.value ?? "").trim();
  if (!draft) return;
  if (!confirm(`「${draft}」で確定します。\n確定した名前は二度と変えられません。よろしいですか？`)) return;
  // ★ 先に書きかけの欄も保存する（確定だけ通って観察が消えるのを防ぐ）
  applyEcologyRecordForm(entry);
  entry.name = draft;
  entry.nameDraft = "";
  entry.nameConfirmedAt = Date.now();
  saveState();
  render();
  openEcologyRecordEditor(entry.id); // 確定した姿をそのまま見せる
}

// O の1行（軸＋自由記述）。★ 行を足せば**同じ軸を何度でも選べる**——
//   観察は回を重ねるもので、別の遠征で見た「動き」を前の記述に上書きさせないため。
function ecologyRecordObservationRowHtml(obs) {
  const axis = obs?.axis || ECOLOGY_RECORD_AXES[0];
  return `
    <div class="er-obs-row">
      <select aria-label="軸">
        ${ECOLOGY_RECORD_AXES.map((a) => `<option value="${a}"${a === axis ? " selected" : ""}>${a}</option>`).join("")}
      </select>
      <textarea placeholder="確かめられたことを書く">${escapeHtml(obs?.text || "")}</textarea>
      <button class="ghost-button er-obs-remove" onclick="removeEcologyRecordObservationRow(this)">削除</button>
    </div>
  `;
}

function addEcologyRecordObservationRow() {
  const list = document.getElementById("er_obs_list");
  if (list) list.insertAdjacentHTML("beforeend", ecologyRecordObservationRowHtml(null));
}

function removeEcologyRecordObservationRow(button) {
  const row = button.closest(".er-obs-row");
  if (row) row.remove();
}

// ── 名前の参照化（第一段：題名・掲示板・生態目録。2026-09-17・EX-119／EX-120） ──
// ★ 確定した名前が及ぶのは**「今の状態」を出す画面だけ**——掲示板（カードの題名・観察対象欄・
//   待機中の帯）・遠征中・編成画面、そして生態目録。
// ⚠️ ★ **報告書には及ばせない**（2026-09-17・EX-120 の裁定。見出しも本文も当時の呼び方で閉じる）。
//   理由：命名より前の報告書で**見出しだけ確定名**にすると、**同じ紙の上で呼び名が割れる**。
//   ★ **第二段（本文・観察文・交戦ログ・敵の短縮名）でも揃わない**——第二段が及ぶのは
//   **これから生成される報告書**で、**過去の報告書は当時のまま**という裁定だから。
//   割れたままにするくらいなら、**報告書は一枚の記録として当時の呼び方で閉じる**。
// ⚠️ 生成済みの文字列（報告書の本文・報告メモ・冒険者の履歴）は元から書き換えていない。
//   ここは**描画のたびに引く**形なので、保存済みの文字列に触れない。
//
// ⚠️ 納屋だけ、題名の「噛」と観察対象の「嚙」で**字が違う**（U+565B ／ U+5699。EX-113 で判明した表記ゆれ）。
//   ★ データを揃えると**生成される本文まで変わる**（題名は出発の行と履歴に入る）ので、
//   ここは**別名**で吸収する。字を揃えるのは、生成の比較ができるときに別途。
//
// ★ **依頼ごとの「相手を指す呼び名」**（2026-09-17・EX-121）。題名と本文の置き換えの両方で使う。
//   ⚠️ **仮称そのものは本文にほとんど出ない。** 本文が実際に使っているのは短い呼び名のほう
//   （実測：畑と納屋は 「なにか」、夜道は 「灯り」。仮称「残る灯り」は本文に0回）。
//   ★ **長いものから順に置き換える**（納屋の「噛みつく「なにか」」が「なにか」で先に潰れないように）。
//   ⚠️ 夜道の 「灯り」 は**全70行を洗って、すべて相手を指していた**——一行が持つ明かりは
//   「ランタン」「明かり」「光の輪」と書き分けられている（EX-121 で実測）。
const QUEST_NAME_ALIASES = {
  quest_field_mystery: ["「なにか」"],
  quest_barn_bite: ["嚙みつく「なにか」", "噛みつく「なにか」", "「なにか」"],
  quest_lingering_light: ["灯り"]
};

// その依頼の相手を指す呼び名（長い順）。表に無ければ仮称そのものだけ。
function questNameAliases(quest) {
  const list = QUEST_NAME_ALIASES[quest?.id] ?? (quest?.observationTarget ? [quest.observationTarget] : []);
  return [...list].sort((a, b) => b.length - a.length);
}

// その依頼の観察対象に**確定した名前**があれば返す（無ければ null＝仮称のまま）
function namedTargetFor(quest) {
  const target = quest?.observationTarget;
  if (!target || target === "なし") return null;
  const entry = findEcologyRecordByTarget(target);
  return entry && isEcologyRecordNameConfirmed(entry) ? entry.name : null;
}

// 題名の表示（掲示板・報告書の見出し・遠征中・帰還カード）。確定前は仮称のまま。
function questDisplayTitle(quest) {
  if (!quest) return "";
  const name = namedTargetFor(quest);
  if (!name) return quest.title;
  return questNameAliases(quest).reduce((title, alias) => title.split(alias).join(name), quest.title);
}

// 掲示板の観察対象欄。確定したら名前、まだなら仮称。
function questDisplayTarget(quest) {
  return namedTargetFor(quest) ?? quest?.observationTarget ?? "";
}

// ── 名前の参照化 第二段（これから生成される報告書。2026-09-17・EX-121） ──────
// ★ **命名が確定したあとに生成された報告書だけ**が確定名になる。
//   - 命名前に生成済みの報告書は**1文字も変わらない**（保存された文字列にここは触れない）
//   - ★ **生成の出口で置き換えて、そのまま保存する**ので、あとで名前が変わっても過去の報告書は動かない
//   - こうして**一枚の中では必ず呼び名が揃う**（命名前は全部仮称／命名後は全部確定名）
// ⚠️ 置き換えるのは**本文が実際に使っている呼び名**（`questNameAliases`）。仮称そのものは本文にほとんど出ない。
function applyNamedTargetToReport(report) {
  const quest = getQuest(report?.questId);
  const name = namedTargetFor(quest);
  if (!name) return report;
  const aliases = questNameAliases(quest);
  const sub = (text) => (typeof text === "string"
    ? aliases.reduce((acc, alias) => acc.split(alias).join(name), text)
    : text);

  if (Array.isArray(report.logs)) report.logs = report.logs.map((line) => ({ ...line, text: sub(line.text) }));
  report.summary = sub(report.summary);
  report.highlight = sub(report.highlight);
  report.historyLine = sub(report.historyLine);
  if (report.adventurerHistoryLines) {
    report.adventurerHistoryLines = Object.fromEntries(
      Object.entries(report.adventurerHistoryLines).map(([id, line]) => [id, sub(line)]));
  }
  if (report.observationNotes) {
    report.observationNotes = {
      ...report.observationNotes,
      target: sub(report.observationNotes.target),
      notes: (report.observationNotes.notes ?? []).map((note) => ({ ...note, text: sub(note.text) }))
    };
  }
  return report;
}

// 交戦記録に出る敵の短縮名。★ その敵を出す依頼の観察対象に確定名があれば、そちらで書く（第二段）。
// ⚠️ 納屋の敵だけ `shortName` を持たない（交戦記録が「相手」になる既知の穴）。
//   命名が済んでいれば、そこにも名前が入る。
function enemyDisplayShortName(enemyRow, fallback) {
  if (!enemyRow) return fallback;
  const quest = (state.quests ?? []).find((q) => q.enemyId === enemyRow.id);
  return (quest && namedTargetFor(quest)) || enemyRow.shortName || fallback;
}

// 標本ラベルの名前欄。★ 3つの姿を持つ：確定済み（編集不可）／解禁済み（下書き＋確定印）／未解禁（軸の数だけ出す）。
function ecologyRecordNameSectionHtml(entry) {
  if (isEcologyRecordNameConfirmed(entry)) {
    return `
      <div class="er-form-row">
        <label>名前（確定済み）</label>
        <p class="er-static er-named">
          <span>${escapeHtml(ecologyRecordDisplayName(entry))}</span>
          <span class="er-name-stamp" aria-label="確定">確<br />定</span>
        </p>
        <p class="muted er-hint">${escapeHtml(stampDateText(entry.nameConfirmedAt))} に確定しました。名前はもう変えられません。</p>
      </div>`;
  }
  const filled = ecologyRecordFilledAxes(entry).size;
  const ready = canNameEcologyRecordEntry(entry);
  const gate = ready
    ? "名前を付けられます。"
    : `あと ${ECOLOGY_RECORD_NAMING_AXES_REQUIRED - filled} 軸で名前を付けられます。軸を書き足したら、いったん保存して開き直してください。`;
  return `
    <div class="er-form-row">
      <label for="er_name_draft">名前</label>
      <p class="er-static"><span>${escapeHtml(entry.target)}</span><span class="er-tag">仮称</span></p>
      <p class="muted er-hint">確かめられたことが ${filled} / ${ECOLOGY_RECORD_NAMING_AXES_REQUIRED} 軸（全12軸のうち）。${gate}</p>
      ${ready ? `
      <input id="er_name_draft" value="${escapeHtml(entry.nameDraft || "")}" placeholder="この生きものに名前を付ける" />
      <div class="button-row" style="margin-top: 8px;">
        <button class="secondary-button" onclick="confirmEcologyRecordName('${escapeJsArg(entry.id)}')">確定印を押す</button>
      </div>
      <p class="muted er-hint">⚠️ 確定印を押すと名前が確定し、二度と変えられません。押すまでは何度でも書き直せます（「生態目録に保存」で下書きが残ります）。</p>` : ""}
    </div>`;
}

function ecologyRecordEditorHtml(entry) {
  const testimonies = ecologyRecordTestimonies(entry);
  const sHtml = testimonies.length > 0 ? `
    <div class="obs-notes-grid">
      ${testimonies.map((memo) => `
        <div class="obs-note-card">
          <p class="obs-note-author">${escapeHtml(memo.adventurerName ?? "")}の記録 ／ ${escapeHtml(memo.questTitle ?? "")}</p>
          <p class="obs-note-text muted">「${escapeHtml(memo.text ?? "")}」</p>
        </div>
      `).join("")}
    </div>`
    : `<p class="muted">まだ証言はありません。観察記録票を持たせた遠征から届きます。</p>`;

  const currentCat = entry.category || "";
  const categorySelect = `<div class="er-form-row">
    <label for="er_category">分類</label>
    <select id="er_category">
      <option value=""${currentCat === "" ? " selected" : ""}>未分類</option>
      ${ECOLOGY_RECORD_CATEGORIES.map((c) => `<option value="${c}"${currentCat === c ? " selected" : ""}>${c}</option>`).join("")}
    </select>
  </div>`;

  const rows = (entry.confirmed ?? []).filter((obs) => obs.text);
  const txt = (id, label, value, placeholder) =>
    `<div class="er-form-row"><label for="${id}">${label}</label><textarea id="${id}" placeholder="${placeholder}">${escapeHtml(value || "")}</textarea></div>`;

  return `
    <div class="er-modal-box">
      <div class="er-modal-header">
        <h3>生態目録を編集</h3>
        <button class="ghost-button" onclick="closeEcologyRecordEditor()">✕ 閉じる</button>
      </div>
      <div class="er-modal-body">
        <div class="er-form">
          ${ecologyRecordNameSectionHtml(entry)}
          ${categorySelect}
          <div class="er-form-row">
            <label>遭遇地域</label>
            <p class="er-static">${escapeHtml(entry.area || "地域未記入")}</p>
          </div>

          <div class="er-form-row">
            <label>S 冒険者の証言（自動）</label>
            ${sHtml}
          </div>

          <div class="er-form-row">
            <label>O 確かめられたこと</label>
            <div id="er_obs_list" class="er-obs-list">${rows.map(ecologyRecordObservationRowHtml).join("")}</div>
            <button class="small-button" onclick="addEcologyRecordObservationRow()">＋ 軸を選んで書き足す</button>
          </div>

          ${txt("er_guess", "A 推測", entry.guess, "確かめられてはいないが、こう思う")}
          ${txt("er_next", "P 次に確かめたいこと", entry.nextCheck, "次の遠征で見てきてほしいこと")}
          ${entry.legacy ? txt("er_legacy", "移行前の記述（軸へ振り分けてください）", entry.legacy, "") : ""}

          <div class="button-row" style="margin-top: 18px;">
            <button class="primary-button" onclick="saveEcologyRecordEntry('${escapeJsArg(entry.id)}')">生態目録に保存</button>
            <button class="ghost-button" onclick="closeEcologyRecordEditor()">キャンセル</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderReportDetail(reportId) {
  const report = state.reports.find((item) => item.id === reportId);
  if (!report) {
    setRoute("home");
    return;
  }
  const quest = getQuest(report.questId);
  const party = report.adventurerIds.map(getAdventurer).filter(Boolean).map(getDisplayName).join(" / ");
  const raidItems = report.adventurerItemIds;
  const items = raidItems && Object.keys(raidItems).length > 0
    ? report.adventurerIds.map((advId) => {
        const adv = getAdventurer(advId);
        const names = getAdvItemIds(raidItems, advId).map((iId) => getItem(iId)?.name).filter(Boolean);
        return adv && names.length > 0 ? `${getDisplayName(adv)}：${names.join("・")}` : null;
      }).filter(Boolean).join(" / ") || "なし"
    : report.itemIds?.map(getItem).filter(Boolean).map((i) => i.name).join(" / ") || "なし";

  app.innerHTML = `
    <section class="card">
      <div class="card-body">
        <div class="card-title">
          <div>
            <p class="eyebrow">Opened Report</p>
            <h3>${escapeHtml(quest?.title ?? "報告書")}</h3>
          </div>
          <span class="status-pill good">開封済み</span>
        </div>
        <div class="kv">
          <span>地域</span><strong>${escapeHtml(quest?.area)}</strong>
          <span>分類</span><strong>${escapeHtml(quest?.category ?? "遠征")}</strong>
          <span>編成</span><strong>${escapeHtml(party)}</strong>
          <span>支給品</span><strong>${escapeHtml(items)}</strong>
          ${report.departConditions ? `<span>出発時</span><strong>${escapeHtml(report.departConditions.timeOfDay)} / ${escapeHtml(report.departConditions.weather)}</strong>` : ""}
          ${report.tensionLevel != null ? `<span>緊張度</span><strong>${report.tensionLevel}/5</strong>` : ""}
          <span>${quest?.category === "生活" ? "作業結果" : "結果"}</span><strong>${escapeHtml(report.result)}</strong>
        </div>
        ${report.highlight ? `
        <div class="highlight-box">
          <p class="eyebrow">今回のハイライト</p>
          <p class="highlight-text">「${escapeHtml(report.highlight)}」</p>
        </div>` : ""}
        <hr class="soft" />
        <p class="meta-label">${quest?.category === "生活" ? "作業報告" : "遠征ログ"}</p>
        <div class="log-list">
          ${report.logs.map((entry) => `<div class="log-line ${entry.kind}">${escapeHtml(entry.text)}</div>`).join("")}
        </div>
        ${report.observationNotes?.notes?.length > 0 ? observationNotesHtml(report.observationNotes) : ""}
        ${report.readStampAt ? `
        <div class="read-stamp-row">
          <span class="read-stamp" aria-label="読了">読<br />了</span>
          <span class="muted">${escapeHtml(readStampDateText(report))}</span>
        </div>` : `
        <div class="read-stamp-row">
          <button class="secondary-button" onclick="stampReport('${escapeJsArg(report.id)}')">読了のハンコを押す</button>
        </div>`}
        <div class="button-row" style="margin-top: 18px;">
          <button class="primary-button" onclick="setRoute('home')">ギルドへ戻る</button>
          <button class="secondary-button" onclick="setRoute('observations')">報告メモを見る</button>
          <button class="secondary-button" onclick="setRoute('adventurers')">名簿にメモする</button>
          ${quest?.observationTarget && quest.observationTarget !== "なし" && findEcologyRecordByTarget(quest.observationTarget)
            ? `<button class="secondary-button" onclick="openEcologyRecordByTarget('${escapeJsArg(quest.observationTarget)}')">生態目録を編集</button>`
            : ""}
        </div>
      </div>
    </section>
  `;
}

function renderResult(reportId) {
  const report = state.reports.find((item) => item.id === reportId);
  if (!report) {
    setRoute("home");
    return;
  }
  const quest = getQuest(report.questId);
  const party = report.adventurerIds.map(getAdventurer).filter(Boolean).map(getDisplayName).join(" / ");
  const branch = report.hiddenTags?.branch;
  const safetyLine = branch === "lost" ? "全員帰還・隊商は戻らず"
    : branch === "great_wound" || branch === "fail" || branch === "bail" || branch === "partial_loss" || branch === "partial_elsie" ? "負傷者あり"
    : "全員無事に帰還";
  const growth = report.growth;
  const growthAdv = growth ? getAdventurer(growth.advId) : null;

  app.innerHTML = `
    <section class="card">
      <div class="card-body">
        <div class="card-title">
          <div>
            <p class="eyebrow">Homecoming</p>
            <h3>${escapeHtml(quest?.title ?? "帰還報告")}</h3>
          </div>
          <span class="status-pill good">帰還</span>
        </div>
        <div class="kv">
          <span>${quest?.category === "生活" ? "作業結果" : "結果"}</span><strong>${escapeHtml(report.result)}</strong>
          <span>概況</span><strong>${escapeHtml(report.summary)}</strong>
          <span>編成</span><strong>${escapeHtml(party)}</strong>
          <span>安否</span><strong>${escapeHtml(safetyLine)}</strong>
          ${growthAdv ? `<span>成長</span><strong>${escapeHtml(getDisplayName(growthAdv))} が ${escapeHtml(GROWTH_STAT_LABELS[growth.statKey] ?? growth.statKey)} の経験を積んだ</strong>` : ""}
        </div>
        ${report.highlight ? `
        <div class="highlight-box">
          <p class="eyebrow">今回のハイライト</p>
          <p class="highlight-text">「${escapeHtml(report.highlight)}」</p>
        </div>` : ""}
        <div class="button-row" style="margin-top: 18px;">
          <button class="primary-button" onclick="openReport('${escapeJsArg(report.id)}')">報告書を読む</button>
          <button class="secondary-button" onclick="returnFromResult()">ギルドへ戻る</button>
        </div>
      </div>
    </section>
  `;
}

// リザルトを見終えたら「今回の帰還」通知を消す（案B・体験版①）。報告書を読んだ場合は openReport 側で消える。
function returnFromResult() {
  state.activeResultReportId = null;
  saveState();
  setRoute("home");
}

function selectQuest(id) {
  selectedQuestId = id;
  departRefusal = null;
  saveState();
  render();
}

function toggleAdventurer(id) {
  const adv = getAdventurer(id);
  if (!adv || adv.status !== "待機中") return;
  departRefusal = null;
  if (selectedAdventurerIds.includes(id)) {
    selectedAdventurerIds = selectedAdventurerIds.filter((advId) => advId !== id);
    delete selectedAdventurerItems[id];
  } else {
    if (selectedAdventurerIds.length >= MAX_PARTY_SIZE) return;
    selectedAdventurerIds = [...selectedAdventurerIds, id];
  }
  saveState();
  render();
}

function assignItem(advId, slot, itemId) {
  if (!selectedAdventurerItems[advId]) selectedAdventurerItems[advId] = [null, null];
  const slots = selectedAdventurerItems[advId];
  if (slots[slot] === itemId) {
    slots[slot] = null;
  } else {
    const otherSlot = slot === 0 ? 1 : 0;
    if (slots[otherSlot] === itemId) return; // 同じ冒険者の別スロットに同じ支給品は不可
    slots[slot] = itemId;
  }
  saveState();
  render();
}

function clearSelections() {
  departRefusal = null;
  selectedQuestId = null;
  selectedAdventurerIds = [];
  selectedAdventurerItems = {};
  saveState();
  render();
}

function startExpedition() {
  if (!selectedQuestId || selectedAdventurerIds.length === 0 || state.expedition) return;
  if (expeditionBlockedMessage(selectedAdventurerIds)) return;
  // 重症は本人が断る。編成では選べる（バッジで見えている）ので、断られるのは強行したときだけ。
  const refusal = departRefusalMessage(selectedAdventurerIds);
  if (refusal) {
    departRefusal = refusal;
    render();
    return;
  }
  departRefusal = null;
  selectedAdventurerIds.forEach((id) => {
    const adv = getAdventurer(id);
    if (adv) adv.status = "遠征中";
  });
  const departCond = getCurrentConditions();
  state.worldState.totalExpeditions += 1;
  state.expedition = {
    id: `exp_${Date.now()}`,
    questId: selectedQuestId,
    adventurerIds: [...selectedAdventurerIds],
    adventurerItemIds: JSON.parse(JSON.stringify(selectedAdventurerItems)),
    itemIds: getAllItemIds(selectedAdventurerItems),
    startTime: Date.now(),
    durationMs: getQuestDurationMs(getQuest(selectedQuestId)),
    seed: Math.floor(Math.random() * 1000000),
    departTimeOfDay: departCond.timeOfDay,
    departWeather: departCond.weather
  };
  // ★ 判明済みの行方不明の時計は、遠征が始まった時から進む（2026-08-18・EX-070）。
  state.adventurers.forEach((adv) => {
    const m = adv.missing;
    if (m && m.deadAt == null && m.revealedAt != null && m.anchorStart == null) m.anchorStart = state.expedition.startTime;
  });
  selectedQuestId = null;
  selectedAdventurerIds = [];
  selectedAdventurerItems = {};
  saveState();
  setRoute("home");
}

function advanceTimeForMock() {
  if (!state.expedition) return;
  state.expedition.startTime = Date.now() - state.expedition.durationMs;
  saveState();
  checkExpeditionCompletion();
  if (state.activeResultReportId) {
    setRoute("result");
  } else {
    render();
  }
}

function openReport(id) {
  const report = state.reports.find((item) => item.id === id);
  if (!report) return;
  report.opened = true;
  // ★ 報告書を開いた＝行方不明が判明した（2026-08-18・EX-070。名簿で見たときと同じ扱い）。
  (report.hiddenTags?.missingIds ?? []).forEach((advId) => revealMissing(getAdventurer(advId)));
  if (!report.applied) {
    applyReport(report);
    report.applied = true;
  }
  if (state.activeResultReportId === id) state.activeResultReportId = null; // 帰還通知を消化（案B）
  state.activeReportId = id;
  saveState();
  setRoute("report");
}

function applyReport(report) {
  report.adventurerIds.forEach((id) => {
    const adv = getAdventurer(id);
    if (!adv) return;
    const line = report.adventurerHistoryLines?.[id] ?? report.historyLine;
    adv.history.unshift(line);
  });

  state.worldState.totalReportsOpened += 1;
  state.worldState.recordDensity += 1;
  state.worldState.attachmentScore += report.adventurerIds.length;
  // TODO: anomalyPressure はここで増やす（コアコンセプト10-4「記録の精度が反ミーム影響度に効く」の受け皿）

  // 観察記録票メモを時系列アーカイブに保存（1報告書につき1回のみ）
  if (report.observationNotes && report.observationNotes.notes && report.observationNotes.notes.length > 0) {
    if (!state.reportMemos) state.reportMemos = [];
    const alreadyAdded = state.reportMemos.some((m) => m.reportId === report.id);
    if (!alreadyAdded) {
      const quest = getQuest(report.questId);
      report.observationNotes.notes.forEach((note) => {
        state.reportMemos.push({
          id: `memo_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          reportId: report.id,
          createdAt: report.createdAt ?? new Date().toISOString(),
          questId: report.questId,
          questTitle: quest?.title ?? report.questId,
          targetName: report.observationNotes.target,
          adventurerId: note.adventurerId,
          adventurerName: note.name,
          text: note.text
        });
      });
    }
  }
}

function editAdventurer(id) {
  editingAdventurerId = id;
  renderAdventurers();
}

function saveAdventurerMemo(id) {
  const adv = getAdventurer(id);
  if (!adv) return;
  const nextNickname = document.getElementById("nicknameInput").value.trim();
  const nextMemo = document.getElementById("memoInput").value.trim();
  if (nextNickname !== adv.nickname && nextNickname) state.worldState.attachmentScore += 2;
  if (nextMemo !== adv.memo && nextMemo) {
    state.worldState.attachmentScore += 2;
    state.worldState.recordDensity += 1;
  }
  adv.nickname = nextNickname;
  adv.memo = nextMemo;
  saveState();
  renderAdventurers();
}

function toggleFavorite(id) {
  const adv = getAdventurer(id);
  if (!adv) return;
  adv.favorite = !adv.favorite;
  if (adv.favorite) state.worldState.attachmentScore += 2;
  saveState();
  renderAdventurers();
}

function makeRng(seed) {
  let value = (seed || 1) % 2147483647;
  if (value <= 0) value += 2147483646;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

function pickOne(list, rng) {
  if (!list || list.length === 0) return null;
  return list[Math.floor(rng() * list.length)];
}

function clampTension(value) {
  return Math.min(100, Math.max(0, value));
}

function computeTensionValue(quest, rng) {
  const base = quest.tensionBase ?? 50;
  const range = quest.tensionRange ?? 0;
  return clampTension(base + Math.floor(rng() * (range + 1)));
}

function tensionToLevel(value) {
  if (value < 20) return 1;
  if (value < 40) return 2;
  if (value < 60) return 3;
  if (value < 80) return 4;
  return 5;
}

function candidateText(entry) {
  return typeof entry === "string" ? entry : entry.text;
}

function tensionCandidateInRange(entry, tensionValue) {
  if (typeof entry === "string") return true;
  const min = entry.minTension ?? 0;
  const max = entry.maxTension ?? 100;
  return tensionValue >= min && tensionValue <= max;
}

function pickTensionOne(candidates, tensionValue, rng) {
  if (!candidates || candidates.length === 0) return null;
  const pool = candidates.filter((entry) => tensionCandidateInRange(entry, tensionValue));
  const entry = pickOne(pool.length > 0 ? pool : candidates, rng);
  return entry ? candidateText(entry) : null;
}

function pickTensionLines(candidates, tensionValue, rng) {
  if (!candidates || candidates.length === 0) return null;
  const pool = candidates.filter((entry) => tensionCandidateInRange(entry, tensionValue));
  const entry = pickOne(pool.length > 0 ? pool : candidates, rng);
  if (!entry) return null;
  if (Array.isArray(entry)) return entry;
  if (entry.lines) return entry.lines;
  return [candidateText(entry)];
}

function pickMany(list, count, rng) {
  const pool = [...list];
  const picked = [];
  while (pool.length > 0 && picked.length < count) {
    picked.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  }
  return picked;
}

function hasPartyTrait(party, key, value) {
  return party.some((adv) => adv[key] === value);
}

function findByTrait(party, key, value) {
  const humans = humanMembers(party);
  const pool = humans.length > 0 ? humans : party;
  return pool.find((adv) => adv[key] === value) ?? pool[0];
}

function formatNames(party) {
  return party.map(getDisplayName).join("、");
}

function generateWeatherLog(quest, party, weather, rng) {
  const humans = humanMembers(party);
  const soloOnly = isSoloHumanParty(party);
  const companion = isCompanionParty(party);
  const group = partySubject(party);
  const leader = getDisplayName(pickOne(humans.length > 0 ? humans : party, rng));
  const careful = findByTrait(party, "personality", "慎重");
  const caregiver = findByTrait(party, "personality", "世話焼き");
  const brave = findByTrait(party, "personality", "豪胆");

  if (soloOnly) {
    const table = {
      晴れ: [
        `朝の光が差す中、${leader}は${quest.area}へひとりで向かった。出発前に装備をもう一度確かめ、足取り軽く歩き始めた。`,
        `空はよく晴れていた。視界が広く、${leader}は遠くの道標まで確認しながら一人で進んだ。`
      ],
      曇り: [
        `曇り空の下、${leader}は荷物を確かめてから${quest.area}へひとりで向かった。天候が崩れる前に戻れるよう、足を止めずに進んだ。`,
        `灰色の空が広がっていた。${leader}は「雨にはならないはず」と呟きながら、荷造りを確かめてから歩き始めた。`
      ],
      小雨: [
        `小雨の中、${leader}は外套の襟を立てて進んだ。紙の依頼書は湿りやすく、何度も手元を確認した。`,
        `出発からしばらくして細い雨が降り始めた。${leader}は濡れやすいものを荷物の内側へ移し直した。`
      ],
      風が強い: [
        `風が強く、依頼書の端が何度も跳ねた。${leader}は荷紐を結び直し、風を避けるように低い道を選んだ。`,
        `古い街道には乾いた葉が舞っていた。${leader}は顔を伏せながら、黙って歩き続けた。`
      ],
      霧: [
        `街道には薄い霧がかかっていた。${leader}は足跡と轍を見比べ、急がずに進むことを選んだ。`,
        `霧で視界が悪い。${leader}は立ち止まって耳を澄ませ、足元を確かめてから歩き続けた。`
      ]
    };
    return pickOne(table[weather] ?? table["晴れ"], rng);
  }

  if (companion) {
    const table = {
      晴れ: [
        `朝の光が差す中、${group}は${quest.area}へ向かった。${leader}の足元をエルシーが小走りに追い、装備を確かめてから歩き始めた。`,
        `空はよく晴れていた。${leader}は遠くの道標まで確認し、エルシーは足元から先を睨みながら進んだ。`
      ],
      曇り: [
        `曇り空の下、${group}は${quest.area}へ向かった。${leader}は荷造りを確かめ、エルシーも落ち着かずに匂いを嗅いでいた。`,
        `灰色の空が広がっていた。${leader}は「雨にはならないはず」と呟きながら、足取りを整えて歩き始めた。`
      ],
      小雨: [
        `小雨の中、${group}は外套の襟を立てて進んだ。紙の依頼書は湿りやすく、${leader}は何度も手元を確認した。`,
        `細い雨が降り始めた。${leader}は濡れやすいものを荷物の内側へ移し、エルシーは袖の下に入った。`
      ],
      風が強い: [
        `風が強く、依頼書の端が何度も跳ねた。${leader}は荷紐を結び直し、エルシーに寄る低い道を選んだ。`,
        `古い街道には乾いた葉が舞っていた。${leader}は顔を伏せ、エルシーは足元を小走りに進んだ。`
      ],
      霧: [
        `街道には薄い霧がかかっていた。${leader}は足跡と轍を見比べ、エルシーは立ち止まって耳を立てた。`,
        `霧で視界が悪い。${leader}は足元を確かめてから歩き続け、エルシーは背中に寄り添うように進んだ。`
      ]
    };
    return pickOne(table[weather] ?? table["晴れ"], rng);
  }

  const table = {
    晴れ: [
      `朝の光が差す中、一行は${quest.area}へ向かった。足取りは軽く、${leader}は出発前に装備をもう一度確かめた。`,
      `空はよく晴れていた。視界が広く、${getDisplayName(careful)}は遠くの道標まで確認しながら進んだ。`
    ],
    曇り: [
      `曇り空の下、一行は${quest.area}へ向かった。${getDisplayName(careful)}は「雨になるかもしれない」と呟き、荷造りを確かめ直した。`,
      `灰色の空が広がっていたが、風はなかった。${leader}は出発前に荷物の重さを確かめ、足取りを整えた。`
    ],
    小雨: [
      `小雨の中、一行は外套の襟を立てて進んだ。紙の依頼書は湿りやすく、${getDisplayName(careful)}が何度も手元を確認した。`,
      `出発からしばらくして細い雨が降り始めた。${getDisplayName(caregiver)}は仲間の荷物に布をかけ、濡れやすいものを内側へ移した。`
    ],
    風が強い: [
      `風が強く、依頼書の端が何度も跳ねた。${leader}は荷紐を結び直し、一行は風を避けるように低い道を選んだ。`,
      `古い街道には乾いた葉が舞っていた。${getDisplayName(brave)}は笑っていたが、声は風に流されてほとんど聞こえなかった。`
    ],
    霧: [
      `街道には薄い霧がかかっていた。${getDisplayName(careful)}は足跡と轍を見比べ、急がずに進むことを選んだ。`,
      `霧で視界が悪い。${getDisplayName(brave)}は先に進もうとしたが、仲間の声を聞いて歩幅を落とした。`
    ]
  };
  return pickOne(table[weather] ?? table["晴れ"], rng);
}

const questEventPools = {
  quest_letter: {
    roadEvents: ["ぬかるみ", "古い道標", "商人とのすれ違い", "封蝋の確認", "宛先の聞き込み", "犬の遠吠え"]
  },
  quest_herb: {
    roadEvents: ["湿った足跡", "倒木", "森喰い兎", "薬草袋の破れ", "泥被り茸の群生", "休憩地点"]
  },
  quest_signpost: {
    roadEvents: ["道標の傾き", "苔に隠れた文字", "旧道の分岐", "壊れた橋", "通行人の証言", "根元のゆるみ"]
  },
  // ★ 調査ジャンルの1件目（2026-09-15・EX-106）。⚠️ **未登録だと汎用フローが落ちて報告書が作れない。**
  //   ★ 名前だけ流用しても文は要る（未登録の名前は「〜について、短い確認を行った。」1行に落ちる）。
  quest_unknown_grass: {
    roadEvents: ["湿った足跡", "窪地の入口", "苔の色の違い", "倒木", "土の匂い", "群れの縁"]
  },
  quest_church_patrol: {
    roadEvents: ["柵の緩み", "鐘楼の確認", "墓地の灯り", "巡礼路の草", "礼拝堂の気配", "裏手の林"]
  }
};

const lifeQuestEventPools = {
  quest_wedding_support: {
    workEvents: ["長椅子の設営", "厨房の手伝い", "酒樽の運搬", "招待客の案内", "迷子対応", "夜間の見回り", "飾り紐の受け渡し"]
  },
  quest_old_house_cleanup: {
    workEvents: ["壊れた家具の撤去", "床板の確認", "古い手紙の整理", "生活用品の確認", "近所の聞き取り", "茶器の梱包", "部屋割りの確認"]
  },
  // ★ 最初のクエスト（2026-08-05・EX-053）。工程は2つだけで、樽を担ぐ工程は別に1行出す。
  quest_tavern_errand: {
    workEvents: ["注文の伝達", "樽の受け取り", "台車の借り受け", "裏口までの搬入"]
  }
};

function roadEventText(quest, eventName, party, itemIds, rng) {
  const humans = humanMembers(party);
  const soloAdv = humans[0] ?? party[0];
  const solo = isSoloHumanParty(party);
  const soloStyle = usesSoloHumanStyle(party);
  const group = partyGroupLabel(party);
  const scout = findByTrait(party, "job", "斥候");
  const herbalist = findByTrait(party, "job", "薬草師");
  const warrior = findByTrait(party, "job", "戦士");
  const post = findByTrait(party, "background", "郵便配達人");
  const has = (id) => itemIds.includes(id);
  const name = (adv) => getDisplayName(adv);

  const generic = {
    ぬかるみ: [
      `ぬかるんだ坂道で${name(warrior)}が足を滑らせた。すぐに立ち上がったが、荷物の底には泥がついた。`,
      `${name(scout)}は泥に残った足跡を見て、同じ道を通った者がいると判断した。`
    ],
    古い道標: [
      `道の脇に古い道標が立っていた。文字は薄いが、まだ読める。${has("item_map") ? "古地図と照合すると、少しだけ表記が古いことが分かった。" : solo ? `${name(soloAdv)}は目印だけを報告書に写し取った。` : `${group}は目印だけを報告書に写し取った。`}`,
      `${name(scout)}は道標の根元を調べ、最近誰かが土を踏み固めた跡を見つけた。`
    ],
    商人とのすれ違い: [
      `途中で荷車を引く商人とすれ違った。商人は「その先の家なら、夕方には戻るはずだ」と教えてくれた。`,
      `商人は手紙の宛名を見ても首をかしげたが、古い屋号だけは聞き覚えがあると言った。`
    ],
    封蝋の確認: [
      `${name(post)}は封蝋に触れず、光にかざして割れがないことだけを確認した。昔の癖が出たらしい。`,
      soloStyle
        ? `${name(warrior)}は封蝋を確認しようとして、思いとどまった。光にかざして状態を見るだけにした。`
        : `封蝋は古いが、まだ保たれていた。${name(warrior)}は不用意に触ろうとして、${name(scout)}に止められた。`
    ],
    宛先の聞き込み: [
      `宛先の家はすぐには見つからなかった。${name(scout)}は井戸端で聞き込みを行い、古い表札の場所を聞き出した。`,
      `${name(post)}は家の並びを見て、表通りより裏道に残っている家だと判断した。`
    ],
    犬の遠吠え: [
      `遠くで犬が吠えた。危険はなかったが、${solo ? name(soloAdv) : group}は少し歩く速度を上げた。`,
      `${name(warrior)}は剣の柄に手を置いたが、吠え声はすぐに遠ざかった。`
    ],
    湿った足跡: [
      soloStyle
        ? `${name(scout)}は湿った足跡を見つけ、荷物を手元に引き寄せて周囲を確認した。小型の獣が近くを通った可能性がある。`
        : `${name(scout)}は湿った足跡を見つけ、荷物を一か所にまとめるよう合図した。小型の獣が近くを通った可能性がある。`,
      `泥の上に小さな足跡が残っていた。${name(herbalist)}は薬草袋の口を固く結び直した。`
    ],
    倒木: [
      soloStyle
        ? `倒木が道をふさいでいた。${name(warrior)}が枝を払い、自分で安全な迂回路を確かめた。`
        : `倒木が道をふさいでいた。${name(warrior)}が枝を払い、${name(scout)}が安全な迂回路を探した。`,
      `古い倒木の裏側に、泥被り茸がいくつか生えていた。${name(herbalist)}は無理に引き抜かず、根元の土ごと採取した。`
    ],
    森喰い兎: [
      `森喰い兎が薬草袋に飛びついた。${name(scout)}は短弓で牽制し、距離を取らせた。`,
      `草むらが揺れ、小さな影が荷袋へ走った。${name(warrior)}が足音で追い払い、袋の破れは最小限で済んだ。`
    ],
    薬草袋の破れ: [
      `薬草袋の縫い目が裂けかけていた。${has("item_bandage") ? "支給された包帯を荷紐の補修に使い、採集物を失わずに済んだ。" : solo ? `${name(soloAdv)}は外套の紐で応急処置をしたが、少量の葉を失った。` : `${group}は外套の紐で応急処置をしたが、少量の葉を失った。`}`,
      `${name(herbalist)}は袋の中身を並べ直し、香りの強い薬草を内側へ移した。`
    ],
    泥被り茸の群生: [
      `倒木の陰に泥被り茸が群生していた。${name(herbalist)}は香りの強い個体だけを選び、採り過ぎないよう数を控えた。`,
      `泥をかぶった茸ほど香りが強い。${name(herbalist)}はその違いを報告書の余白に書き残した。`
    ],
    休憩地点: [
      `${has("item_pot") ? `${name(herbalist)}は携帯鍋で薄いスープを作った。${soloStyle ? "温かさが足取りを少し軽くした。" : `${name(warrior)}は文句を言いながらも、最後まで飲み干した。`}` : soloStyle ? `${name(soloAdv)}は倒木のそばで短い休憩を取った。靴紐を結び直し、また歩き始めた。` : `${group}は倒木のそばで短い休憩を取った。温かいものはないが、靴紐を結び直す余裕はあった。`}`,
      `休憩中、${name(scout)}は森の音が途切れる場所を記録した。採集路としては使えそうだ。`
    ],
    道標の傾き: [
      soloStyle
        ? `道標は片側へ傾いていた。${name(warrior)}は支えながら、反対の手で根元の土を確認した。`
        : `道標は片側へ傾いていた。${name(warrior)}が支え、${name(scout)}が根元の土を確認した。`,
      `傾いた道標は、近づいてみるとまだ読めた。文字の向きだけが少し怪しい。`
    ],
    苔に隠れた文字: [
      `苔に隠れた文字を、${name(scout)}が小刀の背で慎重に落とした。地名はかろうじて読めた。`,
      soloStyle
        ? `文字の一部は苔で見えない。${name(warrior)}は強くこすろうとしたが、木が崩れそうなため思いとどまった。`
        : `文字の一部は苔で見えない。${name(warrior)}は強くこすろうとしたが、木が崩れそうだったため止められた。`
    ],
    旧道の分岐: [
      `${has("item_map") ? `古地図には、現在使われていない旧道の線が残っていた。${solo ? `${name(soloAdv)}は分岐を確認し、報告書に照合結果を残した。` : `${group}は分岐を確認し、報告書に照合結果を残した。`}` : `旧道らしき分岐があったが、手元の記録だけでは照合しきれなかった。次回は古地図が必要。`}`,
      `分岐の先は草に覆われていた。通行量は少ないが、完全に途絶えているわけではない。`
    ],
    壊れた橋: [
      soloStyle
        ? `小さな橋の板が一枚抜けていた。${name(warrior)}は端を踏みしめ、安全に渡れることを確かめてから渡った。`
        : `小さな橋の板が一枚抜けていた。${name(warrior)}が先に渡り、他の者の足場を確かめた。`,
      `橋は渡れたが、荷車には危ない。報告書には「徒歩なら可、荷運びは不可」と記録された。`
    ],
    通行人の証言: [
      `通行人は「最近、道標を直そうとした者がいた」と話した。名前までは分からない。`,
      `旅人から、雨の日だけ旧道を使う者がいると聞いた。理由はまだ分からない。`
    ],
    // ★ 調査ジャンルの1件目（2026-09-15・EX-106）。「湿った足跡」「倒木」は既存の文を流用する。
    //   ★ 文面は 2026-09-15・EX-108 でチャット側が本置き。
    窪地の入口: [
      `窪地の入口は、外より二歩ぶん暗かった。空気が止まっている。`,
      `足を踏み入れると、靴底が音を立てなくなった。土が柔らかい。`
    ],
    苔の色の違い: [
      `岩の苔が、片側だけ色を失っていた。境目はまっすぐではない。`,
      `色の抜けた苔を指で押すと、乾いた粉のようにこぼれた。`
    ],
    土の匂い: [
      `土の匂いが、途中から変わった。湿ったものではなく、粉っぽい。`,
      `${solo ? `${name(soloAdv)}は` : `${group}は`}匂いのことを二度書き留めた。うまく言葉にできていない。`
    ],
    群れの縁: [
      `草は一箇所にまとまって生えていた。縁のところで、ふつりと途切れている。`,
      `群れの縁を辿ると、輪のような形になっていた。誰かが植えたようにも見える。`
    ],
    根元のゆるみ: [
      `道標の根元は雨でゆるんでいた。${has("item_bandage") ? "包帯を仮の固定具として巻き、石を積んで補強した。" : solo ? `${name(soloAdv)}は石を積んで応急処置をした。` : `${group}は石を積んで応急処置をした。`}`,
      `${name(scout)}は根元の土を触り、次の雨でまた傾く可能性が高いと判断した。`
    ]
  };
  return pickOne(generic[eventName] ?? [`${eventName}について、短い確認を行った。`], rng);
}

function workEventText(quest, eventName, party, itemIds, rng) {
  const solo = isSoloHumanParty(party);
  const hasPost = humanMembers(party).some((a) => a.background === "郵便配達人");
  const caregiver = findByTrait(party, "personality", "世話焼き");
  const brave = findByTrait(party, "personality", "豪胆");
  const careful = findByTrait(party, "personality", "慎重");
  const post = findByTrait(party, "background", "郵便配達人");
  const guard = findByTrait(party, "background", "宿場の用心棒");
  const herbalist = findByTrait(party, "job", "薬草師");
  const name = (adv) => getDisplayName(adv);

  // ★ 最初のクエスト（2026-08-05・EX-053）。酒場は画面外の場所として、ログと会話の中にだけ出す。
  const tavernEvents = {
    注文の伝達: [
      `酒場の主人に用件を伝えた。「ああ、聞いてるよ。新しい記録係さんの分だろう」と、すぐに奥へ引っ込んだ。`,
      `${solo ? name(humanMembers(party)[0] ?? party[0]) : name(caregiver)}が用件を伝えると、主人は手を拭きながら「今日中でいいのかい」と聞き返した。`
    ],
    樽の受け取り: [
      `奥から出てきた樽は、思ったより小ぶりだった。主人が栓の締まりを一度確かめてから渡してきた。`,
      `主人は樽を土間まで転がしてきて、「これで足りるだろう」と言った。代金はギルドの財布から出た。`
    ],
    台車の借り受け: [
      `酒場の台車を借りた。車輪が片方だけ鳴るので、道の段差でいちいち止まることになった。`,
      `台車は貸してもらえたが、返しに来る約束をひとつ追加で背負うことになった。`
    ],
    裏口までの搬入: [
      `ギルドの裏口は狭く、樽を横向きにしないと通らなかった。`,
      `裏口の段差で一度持ち上げ直し、そのまま受付の脇へ置いた。`
    ]
  };

  const weddingEvents = {
    長椅子の設営: [
      `${name(brave)}が長椅子を二脚まとめて担いで会場へ運んだ。通路をふさがない位置に置いてから、「まだあるか」と聞いた。`,
      `${name(careful)}は長椅子の向きと間隔を細かく調整した。年配の方が通りやすいよう、通路の幅も確かめていた。`
    ],
    厨房の手伝い: [
      `${name(caregiver)}は厨房で盛り付けと配膳の手伝いをした。料理人の手元を見てから動くので、邪魔にならずに済んでいた。`,
      `${name(herbalist)}は厨房の薬草束を見て、料理人に使い方を伝えた。「その葉は香り付けです」と一言言うと、温かく礼を言われた。`
    ],
    酒樽の運搬: [
      `${name(brave)}が重い酒樽を肩に担いで運んだ。「転がすより早い」と言いながら、先に着いていた。`,
      `酒樽の運搬は段差のある場所だけ気をつけた。${name(careful)}が傾きを確かめながら進んだおかげで、一滴もこぼれなかった。`
    ],
    招待客の案内: [
      hasPost
        ? `${name(post)}は席割りを一度見ただけで頭に入れ、招待客を迷わず席まで案内した。昔の仕事が自然に出ていた。`
        : `${name(careful)}は席次の札を一枚ずつ確かめながら、招待客を丁寧に席まで案内した。`,
      `${name(caregiver)}は年配の客に丁寧に声をかけ、細い廊下を一緒に歩いて席まで案内した。途中で少し話した。`
    ],
    迷子対応: [
      `子どもが席を離れて迷子になった。${name(caregiver)}がすぐに気づき、泣き出す前に見つけた。子どもは笑って親の元へ戻った。`,
      hasPost
        ? `迷子の子どもが「大きな木のそば」と言った。${name(post)}はその一言をもとに親を探し、すぐに見つけた。昔の癖だ。`
        : `${name(brave)}は迷子の子どもを抱き上げ、依頼人に声をかけて親のいる席まで連れて行った。子どもは泣かなかった。`
    ],
    夜間の見回り: [
      `${name(guard)}は会場の裏口と入口を順番に確認した。宿場仕事そのままの動きで、静かに一回りを済ませた。`,
      `夜の見回り中、${name(brave)}は外の縁台で眠りかけていた年配の客を見つけた。声をかけ、中の席へ案内した。`
    ],
    飾り紐の受け渡し: [
      `飾り紐を花嫁の控え室まで届けた。${name(caregiver)}は袋を開けず、そっと両手で渡した。受け取った人が小さく頭を下げた。`,
      `${name(careful)}は飾り紐が折れないよう平らにして運んだ。渡した時、受け取った人がほっとした顔をした。`
    ]
  };

  const cleanupEvents = {
    壊れた家具の撤去: [
      `${name(brave)}が壊れた椅子と棚を中庭へ出した。まだ使えるものだけ脇に寄せ、あとは積み上げた。`,
      `古い戸棚は思ったより重かった。${name(careful)}が引き出しを抜いてから動かすよう提案し、作業が楽になった。`
    ],
    床板の確認: [
      `${name(careful)}は床板を一枚ずつ踏んで、軋む場所を報告書に記録した。危険な箇所には印をつけた。`,
      `床板の下が空洞になっている場所があった。${name(brave)}が先に踏んで確かめ、他の者を安全な位置から歩かせた。`
    ],
    古い手紙の整理: [
      `古い手紙が数通出てきた。宛名の部分は雨染みで読めなかった。${name(post)}はそのまま袋に入れ、依頼人へ渡すことにした。封は開けなかった。`,
      `${name(careful)}は手紙を一枚ずつ確かめたが、差出人も宛名も判別できなかった。「誰かが大事にしていたものだと思います」と言い、別に包んだ。`
    ],
    生活用品の確認: [
      `棚の奥から古い生活用品が出てきた。誰かが確かに暮らしていた跡だった。${name(caregiver)}は使えるものと傷んでいるものを分け、積み直した。`,
      `割れた茶器や使い込まれた籠が出てきた。${name(herbalist)}は薬瓶らしきものも見つけたが、中身は空だった。`
    ],
    近所の聞き取り: [
      `近所の住民に話を聞いたが、この家に誰が住んでいたのかははっきり覚えていなかった。「ずいぶん前から人の出入りはなかった」とだけ言った。`,
      `${name(caregiver)}が話しかけると、住民は少し考えてから「古い家だから」と言った。それ以上のことは、誰も知らないようだった。`
    ],
    茶器の梱包: [
      `茶器の梱包は${name(careful)}が担当した。割れないよう布を間に挟み、重いものを下に積んだ。`,
      `${name(caregiver)}は茶器を一つずつ確かめながら包んだ。「これは随分古い」と一言言って、丁寧に扱った。`
    ],
    部屋割りの確認: [
      `間取りを確認しながら、どの部屋から片付けるかを${name(careful)}が決めた。窓のある部屋から進めることで、埃を外へ出しやすくした。`,
      `${name(guard)}は各部屋の出入口と窓の位置を確認した。宿場仕事の癖で、荷物の動線を先に把握する。`
    ]
  };

  const allEvents = { ...weddingEvents, ...cleanupEvents, ...tavernEvents };
  return pickOne(allEvents[eventName] ?? [`${eventName}について、作業を行った。`], rng);
}

function personalEventText(quest, party, rng) {
  const soloStyle = usesSoloHumanStyle(party);
  const candidates = [];
  humanMembers(party).forEach((adv) => {
    const name = getDisplayName(adv);
    if (adv.personality === "慎重") {
      candidates.push(`${name}はすぐには判断せず、報告書に残せる形で状況を整理してから${soloStyle ? "動いた" : "仲間に伝えた"}。`);
      candidates.push(`${name}は急ぐ必要のない場面だと判断し、確認を一つ増やした。結果的に、その一手で見落としが減った。`);
    }
    if (adv.personality === "豪胆") {
      candidates.push(`${name}は面倒な道を笑って進んだ。乱暴に見えるが、危ない場所では意外と慎重に足を置く。`);
      candidates.push(soloStyle
        ? `${name}は重い荷物を黙って背負い直した。疲れているのに、足取りは変わらなかった。`
        : `${name}は「帰ったら飯だな」と言って、重い荷物を背負い直した。疲れているのに気にしない。`);
    }
    if (adv.personality === "世話焼き") {
      if (!soloStyle) candidates.push(`${name}は休憩のたびに仲間の顔色を見ていた。報告書には書きにくいが、こういう気配りは遠征を安定させる。`);
      candidates.push(`${name}は汚れた道具をその場で拭き、帰還後の整理が楽になるようにしていた。`);
    }
    if (adv.background === "郵便配達人") {
      candidates.push(`${name}は家の並びと道の曲がり方を見て、昔の配達路を思い出した。地図より早く、人の住み方を読んだ。`);
    }
    if (adv.background === "宿場の用心棒") {
      candidates.push(`${name}は人の出入りが多い場所で、自然と背中を壁に向けて立った。昔の仕事の癖らしい。`);
    }
    if (adv.background === "村の調合係") {
      candidates.push(`${name}は匂いと湿り気だけで、使える草と避ける草をより分けた。手つきに迷いがない。`);
    }
  });
  return pickOne(candidates, rng);
}

function lifeQuestPersonalEventText(quest, party, rng, tensionValue = 50) {
  const soloStyle = usesSoloHumanStyle(party);
  const candidates = [];
  humanMembers(party).forEach((adv) => {
    const name = getDisplayName(adv);
    if (adv.personality === "慎重") {
      if (quest.id === "quest_wedding_support") {
        candidates.push(`${name}は依頼書の段取りを確認し、手順に抜けがないかを一つずつ確かめた。焦らず動く姿勢が、小さなミスを防いでいた。`);
        candidates.push(soloStyle
          ? `${name}は急いで雑にするより丁寧にやる方がよいと判断し、作業の順番を整えた。`
          : `${name}は「急いで雑にするより、ゆっくり丁寧にやった方が後が楽です」と言って、作業の順番を整えた。`);
        candidates.push({ text: `${name}は飾り付けの花びらを袖から払い、今日は何事もなく終わればいいと思った。`, maxTension: 35 });
      } else {
        candidates.push(`${name}は片付けた場所に何があったかを逐一メモした。捨てる前の記録が、依頼人の確認作業を助けた。`);
        candidates.push(soloStyle
          ? `${name}は判断に迷うものを勝手に捨てず、確認が必要なものとして別に積み分けた。`
          : `${name}は判断に迷うものを勝手に捨てず、「確認が必要なものは別にしておきます」と積み分けた。`);
      }
    }
    if (adv.personality === "豪胆") {
      if (quest.id === "quest_wedding_support") {
        candidates.push(`${name}は重い荷物を率先して引き受けた。こういう場所での控え方を、どこかで覚えてきたらしい。`);
        candidates.push(`${name}は段取りに口を出さず、言われたことを黙ってやり続けた。派手さはないが、確実だった。`);
        candidates.push({ text: `${name}は厨房の匂いに顔をほころばせ、「今日は戦いじゃない」と言って笑った。`, maxTension: 30 });
      } else {
        candidates.push(soloStyle
          ? `${name}は重い家具を次々と外へ運んだ。ひとりでも手を止めず、黙々と続けた。`
          : `${name}は重い家具を次々と外へ運んだ。仲間が確認を終えるまで、ちゃんと待っていた。`);
        candidates.push(`${name}は埃だらけの部屋でも文句を言わなかった。顔を袖で覆い、黙々と続けた。`);
      }
    }
    if (adv.personality === "世話焼き") {
      if (quest.id === "quest_wedding_support") {
        candidates.push(`${name}は会場全体を見渡し、困っている人がいないかを常に気にしていた。依頼書に書かれた仕事の外まで、自然と手が伸びていた。`);
        if (!soloStyle) candidates.push(`${name}は仲間が一息ついた時、「少し飲んでいいですよ」と水を渡した。自分が飲んだのは全員の後だった。`);
        candidates.push({ text: `${name}は招待客の笑い声を聞いて、肩の力が抜けた。`, maxTension: 28 });
      } else {
        candidates.push(`${name}は作業中も住民の話に耳を傾けた。報告書に書くほどのことではないが、依頼人が安心できる言葉をかけていた。`);
        candidates.push(soloStyle
          ? `${name}は自分の疲れを見ながら、こまめに手を止めて作業を続けた。無理をしない判断が、最後まで動けた理由だった。`
          : `${name}は片付けを進めながら、仲間の疲れ具合を見ていた。休憩のタイミングをうまく提案して、作業が安定した。`);
      }
    }
    if (adv.background === "郵便配達人") {
      candidates.push(`${name}は依頼人から受け取った書類の順番を崩さないよう気にしていた。紙を扱う仕事の癖が、こういう場所でも出る。`);
    }
    if (adv.background === "宿場の用心棒") {
      candidates.push(`${name}は作業の合間に自然と人の動きを見渡していた。誰がどこにいるかを常に把握しようとする癖は宿場仕事から来ている。`);
    }
    if (adv.background === "村の調合係") {
      if (quest.id !== "quest_wedding_support") {
        candidates.push(`${name}は古い薬草束や瓶を見て、素材かどうかを確かめた。「これは使えます」という一言が、いくつかのものを廃棄から救った。`);
      }
    }
  });
  if (quest.id === "quest_wedding_support") {
    candidates.push(
      { text: `会場の空気は軽く、誰も剣の話をしなかった。`, maxTension: 32 },
      { text: `作業の合間に、遠くで笑い声が聞こえた。`, maxTension: 35 }
    );
  }
  return quest.tensionBase != null
    ? pickTensionOne(candidates, tensionValue, rng)
    : pickOne(candidates, rng);
}

function statsPersonalityLog(party, rng) {
  const humans = humanMembers(party);
  if (!humans.length) return null;
  const soloStyle = usesSoloHumanStyle(party);
  const statKeys = ["memory", "caution", "courage", "kindness", "curiosity"];
  const chosen = pickOne(statKeys, rng);
  const best = humans.reduce((a, b) => ((b.tendencies?.[chosen] ?? 0) > (a.tendencies?.[chosen] ?? 0) ? b : a));
  const val = best.tendencies?.[chosen] ?? 0;
  if (val < 3) return null;
  const name = getDisplayName(best);
  const lines = {
    memory: [
      `${name}は、道中で気になった細部を手帳の端に書き留めていた。`,
      `${name}の報告書には、順番と向きまで細かく記録されていた。`,
      `${name}は、道標の傾きと泥の跳ね方まで報告書に残していた。`
    ],
    caution: [
      `${name}は、作業前に足場と帰り道を一つずつ確認した。`,
      `${name}は急がず、周囲の状況を確かめてから次の手順へ進んだ。`,
      `${name}は撤退路を頭に入れてから動いた。報告書にもその手順が残っている。`
    ],
    courage: [
      `${name}は、物音のした方へ迷わず一歩進んだ。`,
      `${name}は先頭に立ち、確認が必要な場所を率先して調べた。`,
      `${name}は、他の者が足を止めた場面でも躊躇わなかった。`
    ],
    kindness: soloStyle ? [
      `${name}は、疲れを感じたら早めに手を止め、自分のペースで作業を続けた。`,
      `${name}は、無理をせず確実に進める方を選んだ。報告書にはその判断が見える。`
    ] : [
      `${name}は、疲れた様子の者に声をかけてから作業へ戻った。`,
      `${name}は、荷物の多い者に無言で手を貸した。`,
      `${name}は、仲間の状態を確かめてから次の行動を決めた。`
    ],
    curiosity: [
      `${name}は、本筋とは関係ない小さな痕跡まで気にしていた。`,
      `${name}は、依頼の範囲外の場所を少し覗いた。報告書の余白にメモがある。`,
      `${name}は、気になったものを指さして立ち止まった。`
    ]
  };
  return pickOne(lines[chosen], rng);
}

function partyInteractionLog(party, quest, rng, tensionValue = 50) {
  if (humanMembers(party).length < 2) return [];

  const mina  = party.find((a) => a.id === "adv_mina");
  const gadd  = party.find((a) => a.id === "adv_gadd");
  const elne  = party.find((a) => a.id === "adv_elne");
  const row   = party.find((a) => a.id === "adv_row");
  const careful   = findByTrait(party, "personality", "慎重");
  const brave     = findByTrait(party, "personality", "豪胆");
  const caregiver = findByTrait(party, "personality", "世話焼き");
  const nm = (adv) => adv ? getDisplayName(adv) : null;

  // 汎用（依頼を問わず使える掛け合い）
  const general = [];
  if (mina && gadd) {
    general.push(`${nm(mina)}が足元の段差を指さすと、${nm(gadd)}は何も言わず荷物の持ち方を変えた。`);
    general.push(`${nm(mina)}が道順を読み上げ、${nm(gadd)}は黙って頷いてから歩き始めた。`);
    general.push(`${nm(gadd)}が重い荷物を引き受けているあいだ、${nm(mina)}は通り道に残った小物を拾い集めた。`);
    general.push(`${nm(gadd)}が「こっちは任せろ」と短く言うと、${nm(mina)}はその間に記録をまとめた。`);
  }
  if (mina && elne) {
    general.push(`${nm(mina)}が道順を読み上げ、${nm(elne)}は忘れ物の有無を確かめた。`);
    general.push(`${nm(mina)}が小さな違和感を記録している間、${nm(elne)}は確認を取った。`);
    general.push(`${nm(mina)}が気になった点を指すと、${nm(elne)}はそれを手早くメモした。`);
    general.push(`${nm(elne)}が「確認が取れました」と言うと、${nm(mina)}は報告書に一行書き加えた。`);
  }
  if (gadd && elne) {
    general.push(`${nm(elne)}が休憩を促すと、${nm(gadd)}は少し不満そうにしながらも腰を下ろした。`);
    general.push(`${nm(elne)}は${nm(gadd)}の手元を見て、包帯を使うほどではない傷だと判断した。`);
    general.push(`${nm(gadd)}が先に動き始め、${nm(elne)}がその後ろで小さな荷物をまとめた。`);
  }
  if (row && mina && quest.id !== "quest_wedding_support" && quest.id !== "quest_old_house_cleanup") {
    general.push(`${nm(row)}が前に立つ位置を選び、${nm(mina)}は退路がふさがっていないことを確認した。`);
  }
  if (row && gadd) {
    general.push(`${nm(gadd)}が先に動こうとしたとき、${nm(row)}は少し遅れてから同じ方向へ足をそろえた。`);
  }
  if (row && elne && quest.id !== "quest_wedding_support" && quest.id !== "quest_old_house_cleanup") {
    general.push(`${nm(row)}が荷物の前に立ち、${nm(elne)}は周囲に怪我人がいないかを確かめた。`);
  }
  if (careful && brave && careful.id !== brave.id) {
    general.push(`${nm(careful)}が確認を一つ増やすよう提案すると、${nm(brave)}は少しだけ足を止めた。`);
    if (quest.id !== "quest_wedding_support" && quest.id !== "quest_old_house_cleanup") {
      general.push(`${nm(brave)}が先に進もうとしたとき、${nm(careful)}が静かに制した。結果的にその判断が正しかった。`);
    }
  }
  if (caregiver && brave && caregiver.id !== brave.id) {
    general.push(`${nm(caregiver)}が${nm(brave)}の荷物の重さを気にして声をかけた。${nm(brave)}は「平気だ」と言いながら、少し荷を下げた。`);
  }
  if (caregiver && careful && caregiver.id !== careful.id) {
    general.push(`${nm(caregiver)}は${nm(careful)}の確認が終わるのを待ってから、次の場所へ移った。`);
  }

  // 依頼固有（依頼カテゴリ・IDに合う掛け合い）
  const contextual = [];
  if (quest.id === "quest_wedding_support") {
    if (gadd && elne) contextual.push(`${nm(elne)}が年配の客に声をかけると、${nm(gadd)}は通路を広く空けた。`);
    if (mina && elne) contextual.push(`${nm(mina)}が席順を確認し、${nm(elne)}が配膳の順番を整えた。`);
    if (mina && gadd) contextual.push(`${nm(gadd)}が重い荷物を運び、${nm(mina)}は置き場所を一つずつ確認した。`);
    if (elne && gadd) contextual.push(`${nm(gadd)}が長椅子を運ぶあいだ、${nm(elne)}は通り道に残った小物を拾い集めた。`);
    if (gadd && mina) contextual.push({ text: `${nm(gadd)}が酒樽を運びながら「今日は楽勝だ」と言い、${nm(mina)}は笑って受け流した。`, maxTension: 32 });
    if (mina && elne) contextual.push({ text: `${nm(mina)}が花の飾りを直し、${nm(elne)}はそれを見て小さく頷いた。`, maxTension: 35 });
  }
  if (quest.id === "quest_old_house_cleanup") {
    if (mina && gadd) contextual.push(`${nm(gadd)}が棚を動かし、${nm(mina)}は後ろに隠れていたものを取り出して確認した。`);
    if (elne && gadd) contextual.push(`${nm(gadd)}が重い家具を外へ運び、${nm(elne)}はそれを受け取って積み上げた。`);
    if (mina && elne) contextual.push(`${nm(elne)}が依頼人と話している間、${nm(mina)}は残置物のリストを書き続けた。`);
  }
  if (quest.id === "quest_letter") {
    if (mina && gadd) contextual.push(`${nm(mina)}が宛先を確認すると、${nm(gadd)}は周囲の様子を見渡した。`);
    if (elne) {
      const other = humanMembers(party).find((a) => a.id !== elne.id);
      if (other) contextual.push(`${nm(elne)}が近くの住人に声をかけ、${nm(other)}は少し離れた場所で待った。`);
    }
  }
  if (quest.id === "quest_herb" || quest.id === "quest_signpost") {
    if (mina && gadd) {
      contextual.push(`${nm(mina)}が足跡を見つけると、${nm(gadd)}は周囲に目を配った。`);
      contextual.push(`${nm(gadd)}が先に進みすぎたため、${nm(mina)}が小さく咳払いをした。`);
    }
    if (elne && gadd) contextual.push(`${nm(elne)}が足場を気にして立ち止まると、${nm(gadd)}はその場所を確かめた。`);
    if (mina && elne) contextual.push(`${nm(elne)}が足場を気にして立ち止まると、${nm(mina)}はその場所を記録した。`);
  }

  // 依頼固有を先に1つ（60%）、汎用を後に1つ（70%）まで追加
  const result = [];
  const pickLine = (list) => (quest.tensionBase != null ? pickTensionOne(list, tensionValue, rng) : pickOne(list, rng));
  if (contextual.length > 0 && rng() < 0.60) {
    const line = pickLine(contextual);
    if (line) result.push(line);
  }
  if (general.length > 0 && result.length < 2 && rng() < 0.70) {
    const line = pickLine(general);
    if (line) result.push(line);
  }
  return result;
}

function canUseItemInQuest(quest, itemId, weather = null) {
  const allowedByQuest = {
    quest_tavern_errand: ["item_bandage", "item_whistle"],
    quest_guild_cleanup: [], // ★ ギルド内なので支給品は選べない（持たせる判断が発生しない。EX-064）

    quest_wedding_support: ["item_pot", "item_bandage"],
    quest_old_house_cleanup: ["item_whistle", "item_bandage", "item_oilcase"],
    quest_letter: ["item_map", "item_oilcase"],
    quest_herb: ["item_whistle", "item_map", "item_bandage", "item_obs_sheet", "item_pot"],
    quest_signpost: ["item_whistle", "item_map", "item_bandage", "item_obs_sheet", "item_pot"],
    quest_field_mystery: ["item_bandage", "item_whistle", "item_obs_sheet"],
    quest_barn_bite: ["item_bandage", "item_whistle", "item_lantern", "item_obs_sheet"],
    // ★ 夜道 v2 は包帯を許可しない（2026-09-13・裁定）。許可すると段階1の閾値が動く…のではなく、
    //   この依頼は battleAmbush で段階1を経ないため判断には効かないが、**戦闘中の手当てで
    //   結末分布が動く**ので、v1 どおりの3品に留める。
    quest_lingering_light: ["item_lantern", "item_obs_sheet", "item_map"],
    quest_old_bridge_repair: ["item_bandage", "item_whistle", "item_map", "item_pot", "item_lantern"],
    quest_church_patrol: ["item_bandage", "item_whistle", "item_map", "item_lantern", "item_pot"],
    quest_herb_delivery: ["item_oilcase", "item_map", "item_pot", "item_whistle", "item_lantern", "item_bandage"],
    // ★ 調査ジャンルの1件目（2026-09-15・EX-106）。★ **観察記録票は必須**（観察記録が主眼の依頼）。
    quest_unknown_grass: ["item_map", "item_oilcase", "item_pot", "item_obs_sheet"],
    quest_missing_herbalist: ["item_bandage", "item_whistle", "item_map", "item_lantern", "item_pot", "item_obs_sheet"],
    quest_evening_market_escort: ["item_lantern", "item_whistle", "item_map", "item_bandage", "item_pot"],
    quest_caravan_escort: ["item_bandage", "item_smoke", "item_whistle", "item_map", "item_lantern"],
    // ★ 捜索チェーンの2件は登録漏れで、許可リストが無いと全許可に落ちていた（2026-09-12・EX-084）。
    //   交戦しない依頼なので**煙幕は外し**、観察対象が「なし」なので**観察記録票も外す**。
    //   護衛の許可から煙幕を抜き、2〜3時間の遠出なので携帯鍋を足した形。
    quest_caravan_search: ["item_bandage", "item_whistle", "item_map", "item_lantern", "item_pot"],
    quest_caravan_lastchance: ["item_bandage", "item_whistle", "item_map", "item_lantern", "item_pot"],
    quest_old_stele_rubbing: ["item_obs_sheet", "item_map", "item_oilcase", "item_lantern", "item_bandage", "item_whistle", "item_pot"]
  };
  const allowed = allowedByQuest[quest.id];
  // ★ 既定は全禁止（2026-09-12・EX-085）。旧実装は許可リストが無ければ全許可だったため、
  //   **書き忘れが沈黙で通っていた**（隊商捜索チェーンの2件が実際に漏れ、煙幕まで許可されていた）。
  //   全禁止なら「その依頼だけ支給品の行が一切出ない」という目に見える欠落として現れる。
  //   ★ 切り替えた時点で全19依頼が許可リストを持っており、挙動は1件も変わっていない（11,400件で不一致0）。
  if (!allowed) return false;
  if (itemId === "item_oilcase" && weather !== "小雨" && quest.id === "quest_wedding_support") return false;
  return allowed.includes(itemId);
}

function supplyEventText(quest, party, adventurerItemIds, rng, weather = null) {
  const solo = isSoloHumanParty(party);
  const has = (id) => getAllItemIds(adventurerItemIds).includes(id);
  const holderAdv = (itemId) => supplyItemHolderAdv(party, adventurerItemIds, itemId) ?? humanMembers(party)[0] ?? party[0];
  const h = (itemId) => getDisplayName(holderAdv(itemId));

  // 所持者以外に長けた冒険者がいれば表示名を返す。いなければ null
  const expertFor = (itemId, checkers) => {
    const hAdv = holderAdv(itemId);
    for (const check of checkers) {
      const cand = check(party);
      if (cand && cand.id !== hAdv.id) return getDisplayName(cand);
    }
    return null;
  };

  const lines = [];

  if (has("item_bandage") && canUseItemInQuest(quest, "item_bandage", weather)) {
    const expert = expertFor("item_bandage", [(p) => p.find((a) => a.job === "薬草師")]);
    if (expert && !solo) {
      lines.push(`${h("item_bandage")}は自分の荷から包帯を取り出した。手当ては${expert}が引き取り、素早く処置を終えた。`);
    } else {
      lines.push(`${h("item_bandage")}は自分の荷から包帯を取り出し、擦り傷に当てた。結び目は少し雑だったが、応急処置としては十分だった。`);
    }
    lines.push(`${h("item_bandage")}が持っていた包帯を荷紐の補修に使った。怪我のためではなかったが、役に立った。`);
  }
  if (has("item_map") && canUseItemInQuest(quest, "item_map", weather)) {
    const expert = expertFor("item_map", [(p) => p.find((a) => a.job === "斥候")]);
    if (expert && !solo) {
      lines.push(`${h("item_map")}は自分に預けられた古地図を広げた。${expert}が横から覗き込み、今の道との照合を手伝った。`);
    } else {
      lines.push(`${h("item_map")}は自分に預けられた古地図を広げ、道標の位置を確認した。迷う前に違和感に気づけたのが大きい。`);
    }
    lines.push(`古地図の余白には、前任の記録係らしい細い線が残っていた。${h("item_map")}はその線を目印に進んだ。`);
  }
  if (has("item_whistle") && canUseItemInQuest(quest, "item_whistle", weather)) {
    if (solo) {
      lines.push(`視界が悪くなった時、${h("item_whistle")}は笛を短く吹いて自分の位置を確かめた。音の響き方で周囲の地形が分かる。`);
    } else {
      lines.push(`視界が悪くなった時、${h("item_whistle")}が笛を短く吹いた。音を聞いて全員が集まった。合流手段として報告書に記録された。`);
      lines.push(`${h("item_whistle")}が試しに笛を吹いたら、思ったより大きな音が出た。以後、合図は短く一回に決まった。`);
    }
  }
  if (has("item_pot") && canUseItemInQuest(quest, "item_pot", weather)) {
    const expert = expertFor("item_pot", [
      (p) => p.find((a) => a.background === "村の調合係"),
      (p) => p.find((a) => a.job === "薬草師")
    ]);
    const isLife = quest.category === "生活";
    if (expert && !solo) {
      lines.push(`${h("item_pot")}は自分に預けられていた携帯鍋を取り出した。火加減は${expert}が横から口を出し、簡単なスープができあがった。`);
    } else if (isLife) {
      lines.push(`${h("item_pot")}は携帯鍋で湯を沸かした。湯気のおかげで、冷えた手を温めながら作業を続けられた。`);
      lines.push(`${h("item_pot")}は携帯鍋を取り出し、作業の合間に温かい飲み物を用意した。短い休憩になった。`);
    } else {
      lines.push(`${h("item_pot")}は携帯鍋で湯を沸かした。採集物の泥を落とすのに使い、休憩が確認作業を兼ねた。`);
    }
    lines.push(`${h("item_pot")}が携帯鍋でスープを作った。${solo ? "帰り道の足取りが少し軽くなった。" : "評判は分かれたが、帰り道の足取りは少し軽くなった。"}`);
  }
  if (has("item_oilcase") && canUseItemInQuest(quest, "item_oilcase", weather)) {
    const expert = expertFor("item_oilcase", [(p) => p.find((a) => a.background === "郵便配達人")]);
    // ★ 工程エンジンと同じ源で判定する（2026-09-12・EX-082）。本文側だけ「小雨」に限ると、
    //   曇り・霧・風が強いでは工程エンジンが油紙を使っているのに「使わずに済んだ」と書いてしまう
    //   （手紙・廃屋で晴れ以外は 100% 食い違っていた）。候補の数が変わるだけで pickOne は1回のまま。
    const oilcaseWeatherLoad = weather == null
      ? 0
      : (FIELDWORK_TUNING.weatherLoad[weather] ?? FIELDWORK_TUNING.defaultWeatherLoad);
    const isRainy = oilcaseWeatherLoad > 0;
    if (isRainy) {
      if (expert && !solo) {
        lines.push(`${h("item_oilcase")}が持っていた油紙の手紙入れを、${expert}が依頼書の保護に使うよう提案した。紙は濡れずに済んだ。`);
      } else {
        lines.push(`${h("item_oilcase")}が持っていた油紙の手紙入れのおかげで、書きつけは濡れずに済んだ。`);
      }
      lines.push(`${h("item_oilcase")}は濡れた手で依頼書に触れないよう、油紙の上から内容を確認した。`);
    } else {
      lines.push(`${h("item_oilcase")}は油紙の手紙入れを荷物に忍ばせていた。今日は使わずに済んだが、あると心強い。`);
    }
  }
  if (has("item_obs_sheet") && canUseItemInQuest(quest, "item_obs_sheet", weather)) {
    lines.push(`${h("item_obs_sheet")}は観察記録票を上着の内側にしまっていた。帰還後に報告書へ転記するためだ。`);
  }
  if (lines.length === 0) return null;
  return pickOne(lines, rng);
}

// ---- 結末文（2026-08-01・段階2）----
// 文面は data-outcomes.js が持つ。ここでやるのは名札の差し替えと、決まった条件の選び分けだけ。
// ★ 条件は「式」ではなく名前の列挙にする。増やすときはこの表に1行足す（データ側に式を書かせない）。
// ★ ここにある名前だけがデータから呼べる。データ側に式を書かせないための入り口。
const OUTCOME_CONDITIONS = {
  エルシーがいる: (ctx) => partyHasElsie(ctx.party),
  古地図を持っている: (ctx) => (ctx.itemIds ?? []).includes("item_map"),
  ランタンを持っている: (ctx) => (ctx.itemIds ?? []).includes("item_lantern"),
  // ★ この2つ（夜である／ランタンを持っている）は、いま生きた依頼からは使われていない
  //   （2026-09-14・EX-096 で夜道 v1 を退避したため）。**未使用に見えても消さないこと**——
  //   `data-quests.js` の `masterQuestsRetired.quest.outcomeOverride` が参照している。
  夜である: (ctx) => ctx.timeOfDay === "夜",
  斥候かエルシーがいる: (ctx) => ctx.party.some((adv) => adv.job === "斥候") || partyHasElsie(ctx.party)
};

// 結末を条件で直接決める依頼（工程や戦闘の結果を見ない例外）を、依頼データの outcomeOverride で表す。
// 上から順に見て、条件がすべて当てはまった最初のものを採る。どれにも当たらなければ default。
function overriddenOutcome(quest, ctx) {
  const override = quest?.outcomeOverride;
  if (!override) return null;
  const hit = (override.rules ?? []).find((rule) =>
    (rule.when ?? []).every((name) => OUTCOME_CONDITIONS[name] && OUTCOME_CONDITIONS[name](ctx)));
  return hit ? hit.outcome : override.default;
}

function outcomeSlotValues(quest, party) {
  const named = (key, value) => getDisplayName(findByTrait(party, key, value));
  return {
    "{一行}": partySubject(party),
    "{全員}": formatNames(party),
    "{斥候}": named("job", "斥候"),
    "{薬草師}": named("job", "薬草師"),
    "{戦士}": named("job", "戦士"),
    "{郵便配達人}": named("background", "郵便配達人"),
    "{世話焼き}": named("personality", "世話焼き"),
    "{慎重}": named("personality", "慎重"),
    "{依頼名}": quest?.title ?? ""
  };
}

function outcomeTextPart(value, party, itemIds) {
  if (typeof value !== "object" || value === null) return value;
  const test = OUTCOME_CONDITIONS[value.when];
  return test && test({ party, itemIds }) ? value.yes : value.no;
}

// 依頼の結末文を引く。鍵が無ければ fallbackKey（既定は最初の鍵）に落ちる。
function questOutcomeText(questId, key, party, itemIds, fallbackKey) {
  const table = window.masterOutcomeTexts?.[questId];
  if (!table) return null;
  const entry = table[key] ?? table[fallbackKey ?? Object.keys(table)[0]];
  if (!entry) return null;
  const quest = window.masterQuests.find((q) => q.id === questId);
  const slots = outcomeSlotValues(quest, party);
  const fill = (text) => (typeof text === "string" ? text.replace(/\{[^}]+\}/g, (m) => slots[m] ?? m) : text);
  return {
    result: entry.result,
    summary: fill(outcomeTextPart(entry.summary, party, itemIds)),
    line: fill(outcomeTextPart(entry.line, party, itemIds)),
    after: fill(outcomeTextPart(entry.after, party, itemIds)),
    history: fill(outcomeTextPart(entry.history, party, itemIds))
  };
}

function outcomeText(quest, party, itemIds, outcome, rng) {
  return questOutcomeText(quest.id, outcome, party, itemIds);
}

function lifeQuestOutcomeText(quest, party, itemIds, outcome, rng) {
  const fromData = questOutcomeText(quest.id, outcome, party, itemIds);
  if (fromData) return fromData;
  return {
    result: "成功",
    summary: "生活依頼を完了した。",
    line: `${partySubject(party)}は依頼を無事に終えた。`,
    after: `報告書は受付へ提出された。`,
    history: `${quest.title}：完了。`
  };
}

const REVIVE_MID_MEMORY_NOTE = false; // ★死蔵の分岐を止めている旗（下の memory === 3 を参照）

function generateRabbitNote(adv, rng) {
  const memory = adv.tendencies?.memory ?? 3;
  const isCareful = adv.personality === "慎重";
  const isBold = adv.personality === "豪胆";
  const isCaregiver = adv.personality === "世話焼き";
  const isPostman = adv.background === "郵便配達人";
  const isGuard = adv.background === "宿場の用心棒";
  const isCompounder = adv.background === "村の調合係";
  const isScout = adv.job === "斥候";
  const isHerbalist = adv.job === "薬草師";
  const isWarrior = adv.job === "戦士";

  if (memory >= 4) {
    if (isScout || isCareful) return pickOne([
      "耳の先が黒く、荷物袋の匂いに反応する。草むらへ逃げる際、後ろ脚で泥を跳ね上げた。こちらを追う様子はなかった。距離を保てば接触は避けられる。",
      "雨の中でも匂いへの反応は鋭かった。逃走方向は一定で、草むらの奥へ消えた。荷物の位置を変えれば被害は防げると思う。"
    ], rng);
    if (isHerbalist || isCompounder) return pickOne([
      "荷物袋を噛まれた冒険者がいたため、次回は袋の口を固く結ぶ必要がある。薬草の匂いに引き寄せられたかもしれない。",
      "薬草袋に噛みついた。香りの強い草が外側に出ていたのが原因と思われる。袋の口は必ず閉じること。"
    ], rng);
    if (isCaregiver) return pickOne([
      "仲間の袋を噛まれた。怪我はなかったが、次回は荷物の確認を出発前にしておきたい。追い払うのは容易だった。",
      "荷物袋に飛びついた。仲間に怪我はなし。ただし食べ物や薬草は外側に置かないこと。"
    ], rng);
    if (isPostman) return pickOne([
      "袋の匂いに反応して近づいてきた。宛先のある荷物は内側へ移した。追えば逃げるので危険度は低い。",
      "荷物袋を狙った。大事な荷物はなるべく内側に。追えば逃げる。前もって対策できる。"
    ], rng);
    return pickOne([
      "小型の獣。耳の先が黒い。荷物袋の匂いに反応して飛びついた。追えば逃げた。草むらの奥に消えた。",
      "荷物袋を噛もうとした。素早いが、追い払うのは難しくなかった。次回は荷物の位置に注意する。"
    ], rng);
  }

  // ★ 死蔵（2026-07-31 に明記）。1〜5スケール時代に書かれた分岐で、255スケール移行後は
  //   到達不能だった（memory が 12〜28 になったため）。性格値を1〜5へ戻すとそのままでは復活し、
  //   同一シードでの振る舞いが変わってしまうので、**到達不能のまま据え置く**。
  //   文言を活かすなら、条件を設計し直したうえで別タスクで有効化すること。
  if (REVIVE_MID_MEMORY_NOTE && memory === 3) {
    if (isBold || isGuard || isWarrior) return pickOne([
      "小さいが素早い。袋を狙う。追えば逃げる。大した危険はないが、荷物の管理には気をつけること。",
      "荷物袋に飛びついた小型の獣。追い払ったら逃げた。次も同じ対応でいい。"
    ], rng);
    return pickOne([
      "荷物袋に近づいてきた。追えば逃げた。草むらに隠れた。",
      "匂いに引き寄せられたようだ。そこまで大きな危険ではなかった。"
    ], rng);
  }

  if (isBold || isWarrior || isGuard) return pickOne([
    "小さい。噛む。袋を狙う。追えば逃げる。腹を空かせていたんだろう。",
    "弱い。追えば逃げる。荷物には注意。素手でも追い払える。"
  ], rng);

  return pickOne([
    "小さい獣がいた。袋を噛もうとした。すぐ逃げた。",
    "荷物をいたずらされた。危なくはなかった。"
  ], rng);
}

// ★ 段の順は「好奇心 → 記憶 → 既定」（2026-09-16・EX-109 の裁定2＝案a）。
//   ⚠️ 元は記憶が先で、**記憶と好奇心の両方が高い者（ミナ）が好奇心の段に永久に入らなかった**。
//   ★ 乱数の消費は変わらない（どちらの段も `pickOne` を1回引く）ので、変わるのは選ばれる文だけ。
function generateMysteryFieldNote(adv, rng) {
  const memory = adv.tendencies?.memory ?? 3;
  const curiosity = adv.tendencies?.curiosity ?? 3;
  const name = getDisplayName(adv);

  if (curiosity >= 4) {
    return pickOne([
      `${name}は「なにか」が逃げた後の草の倒れ方を気にしていた。巣穴か通り道が近くにあるかもしれない。`,
      `${name}は姿よりも痕跡を気にしていた。畑の外で同じ足跡を探したが、途中で途切れている。`
    ], rng);
  }
  if (memory >= 4) {
    return pickOne([
      `${name}は、耳の先が黒く、泥の跳ね方が左右で違っていたと記録している。足跡は畝の間から外側へ続いていた。`,
      `${name}の記録には、背丈は膝ほど、畑の柔らかい土を避けるように跳ねた、とある。正体は未確定。`
    ], rng);
  }
  return pickOne([
    `${name}は、小さな影が畑の外へ逃げたと記録した。特徴はまだ少ない。`,
    `${name}は、素早く跳ねる未同定の相手だったとだけ報告している。`
  ], rng);
}

// ★ 段の順は「好奇心 → 記憶 → 慎重 → 既定」（2026-09-16・EX-109 の裁定2＝案a）。
//   ★ 好奇心と記憶はどちらも `pickOne` を1回引くので、入れ替えても乱数の消費は変わらない
//     （慎重・既定は固定文で0回。**この2段には誰も移動しない**ので、そこも変わらない）。
function generateLingeringLightNote(adv, rng) {
  const memory = adv.tendencies?.memory ?? 3;
  const curiosity = adv.tendencies?.curiosity ?? 3;
  const caution = adv.tendencies?.caution ?? 3;
  const name = getDisplayName(adv);

  if (curiosity >= 4) {
    return pickOne([
      `${name}は灯りそのものより、消えた後の暗さを気にしていた。道の先に反射するものがあるのかもしれない。`,
      `${name}は灯りが揺れる間隔を気にしていた。風や人の手とは違う動きだった、と報告している。`
    ], rng);
  }
  if (memory >= 4) {
    return pickOne([
      `${name}は、灯りが道の右手、古い曲がり角の先で二度揺れてから消えたと記録している。足跡は増えていなかった。`,
      `${name}の記録では、灯りは人の腰ほどの高さに見え、近づくほど遠ざかったように見えた。位置の記録は次回調査に使える。`
    ], rng);
  }
  if (caution >= 4) {
    return `${name}は、帰り道の轍を見失わない位置で観察を止めた。安全な距離の記録として有用。`;
  }
  return `${name}は、小さな灯りが道の先に見え、しばらくして消えたと記録した。詳細は次回確認が必要。`;
}

// ★ 調査依頼「森の際に出た見慣れない草の確認」の専用分岐（2026-09-15・EX-108 の裁定 B）。
//   ★ 種別の既定（植物）ではなく専用にした理由：**この依頼は観察記録が主眼**で、
//     既定文は他の植物依頼にも効くので**固有名（灰かぶり）を出せない**。名が文に出ないと
//     命名の対象として立たない。
//   ★ 段の順は「好奇心 → 記憶 → 既定」（2026-09-16・EX-109 の裁定2＝案a）。
//   ★ 書き手の名前を文に入れる（2026-09-16・EX-109 の裁定4）。畑の「なにか」・残る灯りの2本と
//     種別既定が「{名前}は…」の形なので、ここだけ地の文にすると報告メモに文体の違う記録が並ぶ。
//     ⚠️ **森喰い兎の14文だけは地の文**（体験版①より前からある古い分岐。今回は触っていない）。
//   ★ どの段でも `pickOne` を必ず1回だけ引く（種別既定と同じ不変条件）。
function generateAshGrassNote(adv, rng) {
  const memory = adv.tendencies?.memory ?? 3;
  const curiosity = adv.tendencies?.curiosity ?? 3;
  const name = getDisplayName(adv);

  if (curiosity >= 4) {
    return pickOne([
      `${name}は、日の当たる側と当たらない側で葉の色が違うことを気にしていた。同じ株なのに。`,
      `${name}は根を少し掘り、土の中で横に長く繋がっているのを確かめた。株ではなくひとつづきかもしれない。`
    ], rng);
  }
  if (memory >= 4) {
    return pickOne([
      `${name}は、葉の裏の細かい粉を書き留めた。触れると指に残り、払っても薄く白い。`,
      `${name}の記録では、茎は中が空で、折っても音がしない。切り口はすぐに灰色になった。`
    ], rng);
  }
  return pickOne([
    `${name}は、全体に灰をかぶったような色だと書いた。背丈は膝より低い。`,
    `${name}は、窪地の湿った土にだけ生えていたと書き留めた。乾いた場所には一本も無かった。`
  ], rng);
}

// ★ 種別ごとの既定の観察文（2026-09-15・EX-105）。
//   ⚠️ **既定は「書けなかった」ではない。** 観察記録票を持って行った者が書いた紙なので、
//     「詳細な記録はできなかった」を既定にすると**票を持たせた回ほど嘘になる**（旧実装がそうだった）。
//   ★ 引くのは**対象の種別**（依頼データの `observationKind`）。生態目録の分類語と同じ語を使う。
//     1語だけなので**条件式をデータへ持ち出したことにはならない**
//     （2026-08-01 に却下された「依頼固有の34行を全部データに出す」とは別物）。
//   ★ 段の順は「好奇心 → 記憶 → 既定」（2026-09-16・EX-109 の裁定2＝案a）。
//   ⚠️ **文面は仮置き。** チャット側が書き直す前提で、まず穴を塞ぐために置いている。
const OBSERVATION_KIND_NOTES = {
  獣: {
    memory: [
      `{名前}は、体の大きさと毛の色、逃げた方角を書き留めた。足跡は途中で草むらに入って途切れている。`,
      `{名前}の記録には、鳴き声の高さと、近づいたときの距離の取り方が残っている。`
    ],
    curiosity: [
      `{名前}は姿よりも、餌にしていたものと通り道を気にしていた。次はそこを先に見ると早い。`,
      `{名前}は逃げたあとの草の倒れ方を確かめていた。ねぐらが近いかもしれない。`
    ],
    base: [
      `{名前}は、素早く動く獣だったとだけ書いた。特徴はまだ少ない。`,
      `{名前}は、姿を見た時間と場所を書き留めた。次に来たときの手掛かりにはなる。`
    ]
  },
  植物: {
    memory: [
      `{名前}は、葉の形と付き方、丈、生えていた場所の湿り具合を書き留めた。`,
      `{名前}の記録には、茎の色と切り口の匂い、群れの広がり方が残っている。`
    ],
    curiosity: [
      `{名前}は、そこだけに生えている理由を気にしていた。周りの土と日当たりを見比べている。`,
      `{名前}は虫が寄っているかを確かめていた。寄らないなら理由があるはず、と書いている。`
    ],
    base: [
      `{名前}は、見慣れない草だったとだけ書いた。丈と色は残してある。`,
      `{名前}は、生えていた場所を書き留めた。持ち帰りはしていない。`
    ]
  },
  // 種別が書かれていないときの受け皿。★ ここに落ちるのは `observationKind` の**付け忘れ**か、
  //   **この表に無い種別を書いたとき**。どちらも `scripts/check-observation-targets.js` が検出する。
  既定: {
    memory: [`{名前}は、見たままの形と大きさ、見つけた場所を書き留めた。`],
    curiosity: [`{名前}は、なぜそこに在るのかを気にして、周りの様子まで書いている。`],
    base: [`{名前}は、見たものの特徴を短く書き留めた。`]
  }
};

function generateKindObservationNote(target, adv, rng, kind) {
  const name = getDisplayName(adv);
  const table = OBSERVATION_KIND_NOTES[kind] ?? OBSERVATION_KIND_NOTES["既定"];
  const memory = adv.tendencies?.memory ?? 3;
  const curiosity = adv.tendencies?.curiosity ?? 3;
  // ★ 「好奇心 → 記憶 → 既定」の順（2026-09-16・EX-109 の裁定2＝案a）。
  //   ⚠️ 元は記憶が先で、**両方が高い者（ミナ）が好奇心の段に永久に入らなかった**。
  const pool = curiosity >= 4 ? table.curiosity : memory >= 4 ? table.memory : table.base;
  // ★ プールの長さに関わらず `pickOne` を必ず1回だけ引く（不変条件）。
  //   これが「種別を足しても既存の乱数列が動かない」根拠なので、崩さないこと。
  // ★ 差し込みは `{名前}` のプレースホルダ（行方不明の段階文言＝`masterMissingClock.stages` と同じ型）。
  return pickOne(pool, rng).replaceAll("{名前}", name);
}

function generateAdventurerObservationNote(target, adv, rng, kind) {
  if (target === "森喰い兎") return generateRabbitNote(adv, rng);
  if (target === "「なにか」") return generateMysteryFieldNote(adv, rng);
  if (target === "残る灯り") return generateLingeringLightNote(adv, rng);
  if (target === "灰かぶりのような『なにか』") return generateAshGrassNote(adv, rng);
  return generateKindObservationNote(target, adv, rng, kind);
}

function generateObservationNotes(quest, party, adventurerItemIds, rng) {
  if (!quest.observationTarget || quest.observationTarget === "なし") return null;
  // 観察記録票を所持している冒険者だけが記録を書ける
  const holders = party.filter((adv) =>
    isHumanAdventurer(adv) && getAdvItemIds(adventurerItemIds, adv.id).includes("item_obs_sheet")
  );
  // ★ 記録票を持たせなかった回は**空の配列**を返す（null にしない。2026-09-17・EX-117）。
  //   ⚠️ null は「**対象がいなかった**」の印で、報告書の組み立てが理由を添えて直書きするもの。
  //   両方を null にしていたので、**出会ったのに生態目録の枠が立たない**のと
  //   **いないのに枠が立つ**のを区別できなかった。文面は増えない（notes が空なら1行も出ない）。
  if (holders.length === 0) return { target: quest.observationTarget, notes: [] };
  const notes = holders.map((adv) => ({
    adventurerId: adv.id,
    name: getDisplayName(adv),
    text: generateAdventurerObservationNote(quest.observationTarget, adv, rng, quest.observationKind)
  }));
  return { target: quest.observationTarget, notes };
}

// 性格値（tendencies）で1人選ぶ。★ 読むのは stats ではなく tendencies（2026-07-31 に分離）。
function bestByTendency(party, key) {
  const humans = humanMembers(party);
  const pool = humans.length > 0 ? humans : party;
  return pool.reduce((best, adv) => ((adv.tendencies?.[key] ?? 0) > (best.tendencies?.[key] ?? 0) ? adv : best), pool[0]);
}

function battleSupplyEventText(quest, party, adventurerItemIds, rng) {
  const usableItems = getAllItemIds(adventurerItemIds).filter((itemId) => canUseItemInQuest(quest, itemId));
  const holderName = (itemId) => supplyItemHolderName(party, adventurerItemIds, itemId);
  const lines = [];

  if (usableItems.includes("item_bandage")) {
    lines.push(`${holderName("item_bandage")}は包帯を取り出し、畑の柵で擦った手を簡単に確かめた。処置は軽く済んだ。`);
  }
  if (usableItems.includes("item_whistle")) {
    lines.push(pickOne([
      `${holderName("item_whistle")}は笛を短く鳴らし、「なにか」を畑の外側へ追いやった。音に驚いた影は畝から離れた。`,
      `${holderName("item_whistle")}は笛を吹いた。音に驚いた「なにか」は外へ逃げた。`,
      `${holderName("item_whistle")}は笛を鳴らした。影は一瞬こちらへ向き直り、畝の向こうに引き寄せられたように見えた。`,
      `${holderName("item_whistle")}は笛を短く吹いたが、「なにか」は驚いて畑の端へ走り出した。`
    ], rng));
  }

  return lines.length > 0 ? pickOne(lines, rng) : null;
}

function battleEncounterText(rng) {
  return pickOne([
    `畑の畝の間から、「なにか」が跳ねるように飛び出した。`,
    `荒らされた畝の陰から、「なにか」が姿を見せた。`,
    `依頼人が指差した畝の先で、「なにか」が土を蹴って跳ねた。`
  ], rng);
}

function pickMysteryBehavior(rng) {
  return pickOne(["flee", "intimidate", "protect", "watch", "lure"], rng);
}

function battleOpponentEventText(behavior, rng) {
  const pools = {
    flee: [
      `「なにか」はこちらに気づくと、すぐ畝の陰へ身を寄せた。逃げ腰の動きだった。`,
      `小さな影は距離を取りながら、畑の端ばかりをちらちら見ていた。`,
      `「なにか」は近づくたびに一歩下がり、畑の外へ逃げる準備をしているようだった。`
    ],
    intimidate: [
      `「なにか」は低く身を伏せ、こちらへ向かって威嚇するように毛を逆立てた。`,
      `「なにか」は畝の上で足を止め、一歩も下がらずこちらを睨んでいた。`,
      `小さな影は畑の端まで踏み込むこちらに向かい、威嚇するように低い声を出した。`
    ],
    protect: [
      `「なにか」は荒らした畝の上を行き来し、踏み荒らされた苗の近くを離れなかった。`,
      `「なにか」は作物の間を低く跳ね、畝を守るようにこちらと距離を保っていた。`,
      `「なにか」は荒らした畝の上で足を止め、こちらが近づくたびに苗の方へ身を寄せた。`
    ],
    watch: [
      `「なにか」は逃げも威嚇もせず、こちらの動きだけを追うように姿勢を変えた。`,
      `「なにか」は畝の端で足を止め、こちらを観察しているかのように動きを減らした。`,
      `小さな影は距離を保ったまま、こちらの位置と動きだけを追っていた。`
    ],
    lure: [
      `「なにか」は畑の奥へ下がりながら、こちらを引き込むように畝の間をあけていた。`,
      `「なにか」は一歩下がるたびに奥へ逃げ道を見せ、こちらを畑の中へ誘い込もうとしていた。`,
      `「なにか」は畝の奥へ下がり、こちらが追いかけたくなる隙だけを残していた。`
    ]
  };
  return pickOne(pools[behavior] ?? pools.flee, rng);
}

function battleOpponentPushText(behavior, rng) {
  const pools = {
    flee: [
      `押し返すたび「なにか」は畝の陰へ身を縮め、外側ばかりを向いた。`,
      `「なにか」は抵抗を続けたが、逃げ腰の動きは畑の端へ向かっていた。`
    ],
    intimidate: [
      `「なにか」は低い仕草で威嚇してきたが、圧をかけられると位置を後退させた。`,
      `威嚇は続いたが、「なにか」の足は少しずつ畑の外側へ向いていた。`
    ],
    protect: [
      `「なにか」は荒らした畝の上で足を止め、こちらが近づくたびに苗を押し返すように動いた。`,
      `作物の近くでは「なにか」の動きが強くなり、追い払いは一歩ずつ進んだ。`
    ],
    watch: [
      `「なにか」は逃げずにこちらの動きだけを追い、一歩遅れて位置を変えた。`,
      `牽制の最中も「なにか」はこちらを観察するように、動きを小さく保っていた。`
    ],
    lure: [
      `「なにか」は畑の奥へ下がりながら、こちらを引き込むように畝の間を開けた。`,
      `追い返すたび「なにか」は一度奥へ下がり、畑の中で距離を稼いだ。`
    ]
  };
  return pickOne(pools[behavior] ?? pools.flee, rng);
}

function battleWeaponPushLine(adv, rng) {
  const name = getDisplayName(adv);
  const weapon = adv.weapon;
  if (!weapon) return null;
  const isRanged = weapon.range === "中距離";
  const isBlunt = weapon.type?.includes("鈍器");
  const isShield = weapon.type?.includes("盾");
  const isStaff = weapon.type?.includes("杖");

  if (isRanged) {
    return pickOne([
      `${name}は${weapon.name}で間合いを保ちながら、「なにか」の逃げ道を畑の外へ向けた。`,
      `${name}は${weapon.name}を構え、影が畝から出ないよう牽制した。`
    ], rng);
  }
  if (isBlunt) {
    return pickOne([
      `${name}は${weapon.name}で地面を叩き、音と圧で「なにか」を畑の端まで押し返した。`,
      `${name}は${weapon.name}を振り上げ、怯む「なにか」を畑の外側へ追いやった。`
    ], rng);
  }
  if (isShield) {
    return pickOne([
      `${name}は${weapon.name}で身を低く構え、「なにか」の進路を畑の外へ誘導した。`,
      `${name}は盾を畑の端に向け、小さな影が逃げる方角を狭めた。`
    ], rng);
  }
  if (isStaff) {
    return pickOne([
      `${name}は${weapon.name}で畝を示し、「なにか」が畑の外へ出る道だけを残した。`,
      `${name}は${weapon.name}を地面に向け、追い払いの合図のように一度打ち付けた。`
    ], rng);
  }
  return pickOne([
    `${name}は${weapon.name}を構え、「なにか」を畑の外へ追いやった。`,
    `${name}は${weapon.name}で牽制し、影の動きを畑の端へ向けた。`
  ], rng);
}

function battleOpponentRetreatText(behavior, rng) {
  const pools = {
    flee: [
      `「なにか」は畑の端へ向かう動きが強くなり、すぐ外へ消えかけた。`,
      `逃げ腰の影は、ついに畝から離れて畑の外側へ出た。`
    ],
    intimidate: [
      `威嚇は続いたが、「なにか」は外側へ開いた道を選び始めた。`,
      `「なにか」は最後に一歩踏み込もうとしたが、畑の外へ逃げる方角へ向きを変えた。`
    ],
    protect: [
      `「なにか」は畝から離れ、荒らした場所を振り返ってから畑の外へ出た。`,
      `作物の上から下りた「なにか」は、畑の端へ向かう動きに変わった。`
    ],
    watch: [
      `「なにか」は最後までこちらを見てから、畑の外へ消えた。`,
      `観察するように動いていた「なにか」は、ついに外側の逃げ道を選んだ。`
    ],
    lure: [
      `「なにか」は一度畑の奥へ引いたが、追い返されて外側の逃げ道を選んだ。`,
      `誘い込もうとする動きは続いたが、「なにか」は畑の端へ向かう方向も見せ始めた。`
    ]
  };
  return pickOne(pools[behavior] ?? pools.flee, rng);
}

function battleLanternOpponentText(party, adventurerItemIds, itemIds, isDim, rng) {
  if (!isDim || !itemIds.includes("item_lantern") || rng() < 0.55) return null;
  const holder = party.find((adv) => isHumanAdventurer(adv) && getAdvItemIds(adventurerItemIds, adv.id).includes("item_lantern"))
    ?? humanMembers(party)[0] ?? party[0];
  const name = getDisplayName(holder);
  return pickOne([
    `${name}がランタンを掲げると、「なにか」の輪郭が一瞬はっきり見えた。耳の先が黒い。`,
    `薄暗い畑の中、ランタンの光で「なにか」の背中の線だけが浮かび上がった。`,
    `ランタンの明かりが当たった瞬間、「なにか」は思わず動きを止め、輪郭だけがはっきりした。`
  ], rng);
}

function battleObsSheetMidBattleText(party, adventurerItemIds, behavior, rng) {
  const holder = party.find((adv) => isHumanAdventurer(adv) && getAdvItemIds(adventurerItemIds, adv.id).includes("item_obs_sheet"));
  if (!holder || rng() < 0.65) return null;
  const name = getDisplayName(holder);
  if (behavior === "watch") {
    return `${name}は観察記録票を開き、「なにか」がこちらを見る間だけ動きを書き留めた。`;
  }
  if (behavior === "intimidate") {
    return `${name}は観察記録票に、「なにか」の威嚇の仕草だけを短く書き留めた。`;
  }
  return pickOne([
    `${name}は観察記録票を開き、「なにか」の足跡の向きだけを書き留めた。`,
    `${name}は戦いの最中も観察記録票を手元に置き、影の大きさだけを控えめに記録した。`
  ], rng);
}

// 押し合い・牽制・追い払い（最大2行）
function battlePushRepelText(quest, party, adventurerItemIds, behavior, rng) {
  const lines = [];
  lines.push(battleOpponentPushText(behavior, rng));

  const roles = battleRoleDivisionText(party, rng);
  if (roles.length > 0) lines.push(roles[0]);

  const pusher = bestByTendency(party, "courage");
  const weaponLine = battleWeaponPushLine(pusher, rng);
  if (weaponLine && lines.length < 2) lines.push(weaponLine);

  if (lines.length < 2) {
    const supply = battleSupplyEventText(quest, party, adventurerItemIds, rng);
    if (supply) lines.push(supply);
  }

  if (lines.length === 0) {
    lines.push(`${getDisplayName(pusher)}は「なにか」を畑の外へ追い払うため、前に出た。`);
  }

  return lines.slice(0, 2);
}

function battleStatEventText(party, rng) {
  const humans = humanMembers(party);
  if (!humans.length) return null;
  const stat = pickOne(["courage", "caution", "kindness", "memory", "curiosity"], rng);
  const adv = bestByTendency(party, stat);
  const name = getDisplayName(adv);
  const solo = isSoloHumanParty(party);
  const other = humans.find((member) => member.id !== adv.id);
  const weapon = adv.weapon ?? null;
  const useWeapon = weapon != null && rng() < 0.55;
  const isRanged = weapon?.range === "中距離";
  const isBlunt = weapon?.type?.includes("鈍器");
  const isShield = weapon?.type?.includes("盾");

  if (useWeapon) {
    const weaponPools = {
      courage: isRanged
        ? [
            `${name}は${weapon.name}を手に、「なにか」の正面から間合いを詰めた。`,
            `${name}は${weapon.name}で「なにか」の退路を畑の外側へ向け、そのまま追いやった。`
          ]
        : isBlunt
          ? [
              `${name}は${weapon.name}を構え、怯まず前に踏み込んだ。`,
              `${name}は${weapon.name}で地面を一度叩き、「なにか」を畑の端まで押し返した。`
            ]
          : isShield
            ? [
                `${name}は${weapon.name}で身を低く構え、依頼人の前に立った。`,
                `${name}は盾を畑の端に向け、「なにか」の進路を外側へ誘導した。`
              ]
            : [
                `${name}は${weapon.name}を構え、怯まず前に踏み込んだ。`,
                `${name}は${weapon.name}で地面を一度叩き、「なにか」を畑の端まで押し返した。`
              ],
      caution: [
        `${name}は${weapon.name}を手に間合いを測り、逃げ道が外側を向くよう位置を変えた。`,
        `${name}は${weapon.name}を構えたまま急がず、「なにか」を端へ誘導した。`
      ],
      kindness: solo || !other
        ? [`${name}は${weapon.name}を手に、依頼人を先に退かせてから「なにか」に向き直った。`]
        : [`${name}は${weapon.name}を腰に、${getDisplayName(other)}と依頼人の位置をまず確かめた。`],
      memory: [
        `${name}は${weapon.name}を手に動きながら、「なにか」の跳び方と特徴を頭に記録していた。`,
        `${name}は${weapon.name}の持ち方を変えながら、逃げ方のパターンを観察した。`
      ],
      curiosity: [
        `${name}は${weapon.name}を持ちながら追いたがったが、依頼の目的を優先した。`,
        `${name}は${weapon.name}で足跡を示しながら、「なにか」の正体を考えていた。`
      ]
    };
    return pickOne(weaponPools[stat], rng);
  }

  // 武器なし / 武器非使用時の従来プール
  const pools = {
    courage: [
      `${name}は怯まず前に出て、鍬の柄で地面を強く叩いた。`,
      `${name}は「なにか」の目の前まで踏み込み、退路を畑の外側へ向けた。`,
      `${name}は躊躇なく前へ出た。「なにか」は一瞬だけ動きを止めた。`
    ],
    caution: [
      `${name}は間合いを測り、畑の外へ逃がす道を先に確かめた。深追いはしなかった。`,
      `${name}は「なにか」の動きを読みながら、逃げ道が外側を向くよう位置を変えた。`,
      `${name}は急がなかった。焦りが余分な被害を出すと判断したからだ。`
    ],
    kindness: solo || !other
      ? [
          `${name}は依頼人が畑に入らないよう手で制し、自分だけで畝の外側へ回り込んだ。`,
          `${name}は先に依頼人を畑の端まで下がらせてから、「なにか」に向き直った。`
        ]
      : [
          `${name}は依頼人と${getDisplayName(other)}の位置を確かめ、誰も畑の奥へ踏み込みすぎないようにした。`,
          `${name}は「なにか」よりも先に、踏み荒らされた苗と周囲の安全を確かめた。`
        ],
    memory: [
      `${name}は、耳の先が黒く、泥の跳ね方が妙だったと記録している。`,
      `${name}は「なにか」の跳び方と向き直る癖を観察しながら、頭の中に記録していた。`,
      `${name}は逃げ方のパターンを覚えながら、次の動きを読んで位置を変えた。`
    ],
    curiosity: [
      `${name}は「なにか」が逃げた後の足跡を気にしていた。正体はまだ分からない。`,
      `${name}は追いたかったが、まず畑の被害を止めることを優先した。`,
      `${name}は「なにか」の動きに見覚えがあると感じたが、今は確かめる場ではなかった。`
    ]
  };
  return pickOne(pools[stat], rng);
}

// アクセサリーを持つ冒険者がいれば、低確率で装備品の一文を返す
function battleAccessoryText(party, rng) {
  if (rng() < 0.65) return null; // 35%の確率で出す
  const adv = party.find((a) => a.accessory && isHumanAdventurer(a)) ?? null;
  if (!adv) return null;
  const name = getDisplayName(adv);
  const acc = adv.accessory;
  return pickOne([
    `${name}の${acc.name}が揺れた。それを一瞬確かめてから、次の動きを決めた。`,
    `${acc.name}がふと目に入った。いつもの遠征と変わらない装備だった。`
  ], rng);
}

// 戻り値は string[]。ソロは0〜1行、2人は1行、3人以上は同一冒険者重複なしで最大2行。
function battleRoleDivisionText(party, rng) {
  const humans = humanMembers(party);
  const mina = party.find((a) => a.id === "adv_mina");
  const gadd = party.find((a) => a.id === "adv_gadd");
  const elne = party.find((a) => a.id === "adv_elne");
  const row  = party.find((a) => a.id === "adv_row");
  const nm = (adv) => adv ? getDisplayName(adv) : null;

  if (isSoloHumanParty(party)) {
    if (rng() < 0.40) return []; // 60%の確率で出す
    const adv = humans[0];
    const name = getDisplayName(adv);
    const top = ["courage", "caution", "memory", "kindness", "curiosity"]
      .reduce((best, s) => (adv.tendencies?.[s] ?? 0) > (adv.tendencies?.[best] ?? 0) ? s : best, "courage");
    const soloLines = {
      courage:   `${name}は前に出て圧をかけながら、足元の安全と退路も確かめた。`,
      caution:   `${name}は間合いを測りながら、退路と逃げた先の方角を同時に確認した。`,
      memory:    `${name}は距離を保ちながら、「なにか」の動きと特徴を頭に記録し続けた。`,
      kindness:  `${name}は依頼人が近寄らないよう気を配りながら、自分で対処を進めた。`,
      curiosity: `${name}は正体を確かめたかったが、まず追い払いを優先した。`
    };
    return soloLines[top] ? [soloLines[top]] : [];
  }

  // 2人以上：各IDペアの候補を全部列挙する
  // 各エントリは [line, [advId, advId]] の形で冒険者IDを記録する
  const candidates = [];
  if (row && gadd) candidates.push([`${nm(gadd)}が前に圧をかけ、${nm(row)}は退路をふさがない位置でその横に立った。`, [gadd.id, row.id]]);
  if (row && mina) candidates.push([`${nm(row)}が仲間の前に立ち、${nm(mina)}はその背後で足跡と逃げた方角を記録した。`, [row.id, mina.id]]);
  if (row && elne) candidates.push([`${nm(row)}が畑の入口側を守り、${nm(elne)}は依頼人と苗の被害を確認した。`, [row.id, elne.id]]);
  if (gadd && mina) candidates.push([`${nm(gadd)}が前に出ると、${nm(mina)}はその背後で逃げ道の向きを記録した。`, [gadd.id, mina.id]]);
  if (gadd && elne) candidates.push([`${nm(gadd)}が畑の端まで「なにか」を押し返すあいだ、${nm(elne)}は依頼人を畑の外へ下がらせた。`, [gadd.id, elne.id]]);
  if (mina && elne) candidates.push([`${nm(mina)}が足跡の方角を確認し、${nm(elne)}は踏み荒らされた苗の被害を見渡した。`, [mina.id, elne.id]]);

  if (candidates.length === 0) {
    // ID に合致しない組み合わせ（フォールバック）
    const front = bestByTendency(party, "courage");
    const rest = humans.filter((a) => a.id !== front.id);
    if (rest.length > 0) {
      const rec = bestByTendency(rest, "memory");
      return [`${getDisplayName(front)}が前に出て距離を詰め、${getDisplayName(rec)}はその動きと「なにか」の反応を記録した。`];
    }
    return [];
  }

  // シャッフルして、使用済み冒険者IDが重複しない行を最大 (humans.length >= 3 ? 2 : 1) 行取る
  const maxLines = humans.length >= 3 ? 2 : 1;
  const shuffled = [...candidates].sort(() => rng() - 0.5);
  const picked = [];
  const usedIds = new Set();
  for (const [line, ids] of shuffled) {
    if (ids.every((id) => !usedIds.has(id))) {
      picked.push(line);
      ids.forEach((id) => usedIds.add(id));
    }
    if (picked.length >= maxLines) break;
  }
  return picked;
}

function battleObservationRecordText(party, adventurerItemIds, rng) {
  const holder = party.find((adv) => isHumanAdventurer(adv) && getAdvItemIds(adventurerItemIds, adv.id).includes("item_obs_sheet"));
  if (!holder) return null;
  const name = getDisplayName(holder);
  return pickOne([
    `${name}は観察記録票に、耳の先が黒かったことだけを書き添えている。`,
    `${name}は観察記録票に、足跡の向きと逃げた先を短く書き留めた。`,
    `報告書には、${name}の記録として泥の跳ね方と小さな足跡だけが残っている。`
  ], rng);
}

function battleOutcomeLines(party, adventurerItemIds, behavior, rng, tensionValue = 50) {
  const solo = isSoloHumanParty(party);
  const subject = partySubject(party);
  const humans = humanMembers(party);
  const statPool = humans.length > 0 ? humans : party;
  const hasObsSheet = statPool.some((adv) =>
    getAdvItemIds(adventurerItemIds, adv.id).includes("item_obs_sheet")
  );

  // 挙動に応じた結果（優先度：lure / watch を先に）
  if (behavior === "lure" && rng() < 0.55) {
    return pickOne([
      [`「なにか」は畑の奥まで一度引き込まれてから、外へ抜けていった。`, `追い払いはできたが、奥の畝にも新しい足跡が残っている。`],
      [`${subject}は誘い込みに乗らず、端から追い返した。「なにか」は畑の外へ出た。`, `畑の被害はそこで止まっている。`]
    ], rng);
  }
  if (behavior === "watch" && rng() < 0.50) {
    return pickOne([
      [`「なにか」は畑の外へ消えた。`, `正体は掴めないままだ。観察されていた側があるのか、報告書には見落としがあった気配だけが残っている。`],
      [`「なにか」は逃げ去った。`, hasObsSheet
        ? `観察記録票には動きは残ったが、正体を特定する情報は足りなかった。`
        : `こちらを見ていた相手の正体は、結局はっきりしなかった。`]
    ], rng);
  }
  if (behavior === "flee" && rng() < 0.45) {
    const actor = solo ? getDisplayName(humans[0]) : subject;
    return pickOne([
      [`「なにか」は逃げ腰のまま、畑の外へ消えていった。`, `畑の被害はそこで止まっている。依頼は無事に片づいた。`],
      [`${actor}は逃げ腰の「なにか」を畑の外まで追い払った。`, `畑の被害はそこで止まっている。`]
    ], rng);
  }

  // 最も高いパラメータで結果パターンを選ぶ
  const stats = ["caution", "courage", "memory", "curiosity", "kindness"];
  const dominant = stats.reduce((best, s) => {
    const bv = statPool.reduce((mx, a) => Math.max(mx, a.tendencies?.[best] ?? 0), 0);
    const sv = statPool.reduce((mx, a) => Math.max(mx, a.tendencies?.[s] ?? 0), 0);
    return sv > bv ? s : best;
  }, "courage");

  // パターン1：押し返し成功（courage 優位 or デフォルト）
  if (dominant === "courage") {
    return pickOne([
      [`「なにか」は畑の外へ逃げていった。`, `畑の被害はそこで止まっている。`],
      [`${subject}は「なにか」を畑の端まで強く押し返した。「なにか」は戻らなかった。`, `畑の被害はそこで止まっている。`]
    ], rng);
  }

  // パターン2：正体不明・記録優先（memory or curiosity 優位）
  if (dominant === "memory" || dominant === "curiosity") {
    const recorder = bestByTendency(party, dominant);
    const rname = getDisplayName(recorder);
    if (hasObsSheet) {
      // 観察記録票を持参している場合は記録済みの文体
      return pickOne([
        [`「なにか」は森の方へ逃げたが、正体は分からないままだった。`, `${rname}の観察記録票には、足跡と逃げた方角が書き留められている。`],
        [`「なにか」は道の外へ消えた。正体は未確定だが、足跡と逃げた方角は記録に残っている。`, `畑の被害はそこで止まっている。`]
      ], rng);
    } else {
      // 観察記録票を持っていない場合だけ「次回持参すべき」を出す
      return pickOne([
        [`「なにか」は森の方へ逃げたが、正体は分からないままだった。`, `${rname}は、次回は観察記録票を持参すべきだと報告書に書き添えている。`],
        [`「なにか」は道の外へ消えた。正体は未確定だが、足跡と逃げた方角は記録に残っている。`, `畑の被害はそこで止まっている。`]
      ], rng);
    }
  }

  // パターン3：深追いせず・安全確認優先（caution or kindness 優位）
  return pickTensionLines([
    [`${subject}は畑の外まで追い払ったところで足を止めた。`, `依頼は達成したが、巣や出どころの確認は次回に回された。`],
    [`「なにか」は畑の外へ出た。${solo ? "深追いはしなかった。" : `${subject}は深追いせず、その場で状況を確認した。`}`, `畑の被害はそこで止まっている。`],
    { lines: [`「なにか」は畑の外へ消えた。`, `深追いはせず、畑の奥の確認は次回に回された。`], minTension: 40, maxTension: 70 }
  ], tensionValue, rng);
}

function battleWithdrawalText(party, rng, tensionValue = 50) {
  if (rng() < 0.12) return null; // 約88%の確率で出す
  const stat = pickOne(["caution", "courage", "kindness", "memory", "curiosity"], rng);
  const adv = bestByTendency(party, stat);
  const name = getDisplayName(adv);
  const solo = isSoloHumanParty(party);
  const other = humanMembers(party).find((m) => m.id !== adv.id);

  const lines = {
    caution: [
      `${name}は深追いせず、「なにか」が畑の外へ出たところで足を止めた。`,
      `${name}は退路を確認してから引き返した。畑の中で見失うよりも、安全を取る判断だ。`,
      { text: `${name}は畝の奥まで踏み込まないよう、自分の位置を引き戻した。`, minTension: 40, maxTension: 70 }
    ],
    courage: [
      `${name}はもう一歩前に出ようとしたが、依頼は追い払いだと思い直してその場で止まった。`,
      `${name}は畑の外まで強く押し返したところで足を止めた。依頼は追い払いであって、討伐ではない。`
    ],
    kindness: solo || !other
      ? [
          `${name}は踏み荒らされた苗と怪我人がいないことを確認してから、作業を切り上げた。`,
          `${name}は依頼人の安全を先に確かめ、そこで引き返すことにした。`
        ]
      : [
          `${name}は${getDisplayName(other)}の無事を確かめてから、作業を切り上げた。`,
          `${name}は踏み荒らされた苗と怪我人の有無を確認し、そこで作業を切り上げた。`
        ],
    memory: [
      `${name}は追跡せず、足跡と逃げた方向を記録した。追いかけても得られる情報は少ないと判断した。`,
      `${name}は逃げた方角を記録し、追跡は次の依頼に回すべきだと判断した。`
    ],
    curiosity: [
      `${name}は追いたがったが、今回の依頼は畑の被害を止めることだと思い直した。`,
      `${name}は「なにか」の正体が気になったが、それは次回の仕事だとメモだけ残した。`,
      { text: `${name}は正体を確かめたかったが、畑の奥へ誘い込まれる動きには乗らなかった。`, minTension: 45, maxTension: 75 }
    ]
  };

  return pickTensionOne(lines[stat], tensionValue, rng);
}

function battleTensionReactionText(party, tensionValue, rng) {
  if (rng() < 0.45) return null;
  const adv = bestByTendency(party, tensionValue >= 55 ? "caution" : "courage");
  const name = getDisplayName(adv);
  return pickTensionOne([
    { text: `${name}は畝の間で位置を取り直し、依頼人の背後を空けた。`, minTension: 35, maxTension: 65 },
    { text: `${name}は短く息を吐き、次の一歩を決めた。`, minTension: 50, maxTension: 80 },
    { text: `${name}は冗談を言う余裕はなかった。`, minTension: 75 },
    { text: `${name}は笑う暇もなく、影の動きだけを追った。`, minTension: 80 }
  ], tensionValue, rng);
}

function generateBattleLogs(quest, party, adventurerItemIds, rng, context = {}) {
  const behavior = pickMysteryBehavior(rng);
  const itemIds = context.itemIds ?? getAllItemIds(adventurerItemIds);
  const tensionValue = context.tensionValue ?? 50;
  const isNight = context.departConditions?.timeOfDay === "夜";
  const isDim = isNight || ["霧", "小雨"].includes(context.departConditions?.weather);

  const logs = [];
  // 1. 遭遇
  logs.push(battleEncounterText(rng));
  // 2. 相手の様子
  logs.push(battleOpponentEventText(behavior, rng));
  const lanternLine = battleLanternOpponentText(party, adventurerItemIds, itemIds, isDim, rng);
  if (lanternLine) logs.push(lanternLine);
  // 3. 冒険者の対応
  logs.push(battleStatEventText(party, rng));
  const tensionLine = battleTensionReactionText(party, tensionValue, rng);
  if (tensionLine) logs.push(tensionLine);
  // ★ 2026-07-31：結末は simulateBattle が決めるようになった。押し切れなかったときに
  //   「追い払った」文が出ないよう、ここから先は交戦できたかどうかで切る。
  const battleOutcome = context.battleOutcome ?? "victory";
  if (battleOutcome === "withdraw_first") return logs; // 挑まずに引き返した＝押し合いに入っていない
  // 4. 押し合い・牽制・追い払い
  battlePushRepelText(quest, party, adventurerItemIds, behavior, rng).forEach((line) => logs.push(line));
  const obsMid = battleObsSheetMidBattleText(party, adventurerItemIds, behavior, rng);
  if (obsMid) logs.push(obsMid);
  if (battleOutcome !== "victory") return logs; // 押し切れなかった＝相手が退く行と結果行は書かない
  // 4→5. 相手が退き始める
  logs.push(battleOpponentRetreatText(behavior, rng));
  // 5. 切り上げ判断
  const withdrawal = battleWithdrawalText(party, rng, tensionValue);
  if (withdrawal) logs.push(withdrawal);
  // 6. 結果
  const outcomeLines = battleOutcomeLines(party, adventurerItemIds, behavior, rng, tensionValue);
  outcomeLines.forEach((line) => logs.push(line));
  const observation = battleObservationRecordText(party, adventurerItemIds, rng);
  if (observation) logs.push(observation);
  return logs;
}

// 納屋の討伐依頼専用ログ（現場確認→敵の痕跡→遭遇→交戦→討伐判断→結果）
function generateBarnHuntLogs(quest, party, adventurerItemIds, rng, context = {}) {
  const solo = isSoloHumanParty(party);
  const subject = partySubject(party);
  const itemIds = context.itemIds ?? getAllItemIds(adventurerItemIds);
  const tensionValue = context.tensionValue ?? 50;
  const hasLantern = itemIds.includes("item_lantern");
  const hasBandage = itemIds.includes("item_bandage");
  const hasWhistle = itemIds.includes("item_whistle");
  const logs = [];

  // 1. 現場確認
  logs.push(pickOne([
    `納屋の戸を開けると、藁の山と古い飼葉桶の陰に、引っかいたような傷跡が残っていた。`,
    `依頼人に案内された納屋は薄暗く、隅の木材には鋭い歯形がいくつも残っていた。`
  ], rng));

  // 2. 敵の痕跡
  logs.push(hasLantern
    ? pickOne([
        `ランタンの明かりを当てると、藁の上に乾いた跡と小さな足跡が浮かび上がった。`,
        `灯りで照らすと、飼葉桶の縁に細かい歯形がはっきり見えた。`
      ], rng)
    : pickOne([
        `薄暗い納屋の中では、足跡の細部までは見分けられなかった。気配だけが濃く残っていた。`,
        `手探りで確かめると、木材の表面がささくれるほど噛まれていた。`
      ], rng));

  // 3. 遭遇
  logs.push(pickTensionOne([
    `藁の山が大きく揺れ、「なにか」が低い唸り声とともに飛び出した。`,
    `飼葉桶の陰から、「なにか」が牙をむき出しにして姿を見せた。`,
    `物音に気づいた「なにか」が、こちらへ向き直り低く身構えた。`,
    { text: `唸り声だけが先に聞こえ、次の一瞬で「なにか」が飛び出した。`, minTension: 70 },
    { text: `暗い納屋の中で、牙の光だけが一瞬見えた。`, minTension: 80 }
  ], tensionValue, rng));

  // ★ 2026-07-31：結末は simulateBattle が決める。仕留められなかったときに「動きが止まった」が
  //   出ないよう、交戦できたか・押し切れたかでここから先を切る。
  const battleOutcome = context.battleOutcome ?? "victory";
  if (battleOutcome === "withdraw_first") return logs; // 挑まずに引き返した＝交戦していない

  // 4. 交戦
  const fighter = bestByTendency(party, "courage");
  const fname = getDisplayName(fighter);
  const weapon = fighter.weapon;
  if (weapon) {
    const isRanged = weapon.range === "中距離";
    const isBlunt = weapon.type?.includes("鈍器");
    const isShield = weapon.type?.includes("盾");
    const isStaff = weapon.type?.includes("杖");
    if (isRanged) {
      logs.push(`${fname}は${weapon.name}で間合いを取り、飛びかかってくる「なにか」を牽制した。`);
    } else if (isBlunt) {
      logs.push(`${fname}は${weapon.name}を振るい、「なにか」の突進を真正面から受け止めた。`);
    } else if (isShield) {
      logs.push(`${fname}は${weapon.name}で身を守りながら、「なにか」の牙を弾き返した。`);
    } else if (isStaff) {
      logs.push(`${fname}は${weapon.name}を構え、「なにか」の動きを止めようと足元を突いた。`);
    } else {
      logs.push(`${fname}は${weapon.name}を構え、「なにか」と正面から渡り合った。`);
    }
  } else {
    logs.push(`${fname}は怯まず前に出て、「なにか」と取っ組み合った。`);
  }
  const barnTensionLine = pickTensionOne([
    { text: `${fname}は言葉を減らし、武器だけを構え直した。`, minTension: 65 },
    { text: `誰も叫ばなかった。納屋の中は牙と息だけが残っていた。`, minTension: 80 }
  ], tensionValue, rng);
  if (barnTensionLine) logs.push(barnTensionLine);
  // ★ 包帯の行は、戦闘で実際に手当てがあったときだけ書く（2026-09-12・EX-082）。
  //   持っているだけで書くと、同じ報告書に「封を切られないまま戻ってきた」が並ぶ（実測12%）。
  //   抽選（rng）は条件の中で先に済ませるので、乱数の消費は変わらない。
  if (hasBandage && rng() < 0.5 && context.battleHealed === true) {
    logs.push(`牙が掠めた腕に、すぐ包帯が巻かれた。傷は浅かった。`);
  }
  if (!solo) {
    const mina = party.find((a) => a.id === "adv_mina");
    const gadd = party.find((a) => a.id === "adv_gadd");
    const elne = party.find((a) => a.id === "adv_elne");
    const row = party.find((a) => a.id === "adv_row");
    const nm = (adv) => (adv ? getDisplayName(adv) : null);
    const roleCandidates = [];
    if (gadd && row) roleCandidates.push(`${nm(gadd)}が正面で「なにか」を抑え、${nm(row)}は逃げ場をふさぐように戸口側へ回った。`);
    if (gadd && mina) roleCandidates.push(`${nm(gadd)}が押さえつけるあいだ、${nm(mina)}は隙を見て隙間を狙った。`);
    if (gadd && elne) roleCandidates.push(`${nm(gadd)}が前で受け止め、${nm(elne)}はすぐ手当てできるよう位置を整えた。`);
    if (row && elne) roleCandidates.push(`${nm(row)}が戸口をふさぎ、${nm(elne)}は仲間に怪我がないか確かめた。`);
    if (roleCandidates.length > 0) logs.push(pickOne(roleCandidates, rng));
  }
  if (hasWhistle && rng() < 0.4) {
    logs.push(`${solo ? fname : "誰か"}が短く笛を鳴らし、「なにか」の動きを一瞬乱した。`);
  }
  if (battleOutcome !== "victory") return logs; // 仕留められなかった＝討伐判断と結果行は書かない

  // 5. 討伐判断
  logs.push(pickTensionOne([
    solo
      ? `${fname}は追い払うだけでは依頼を終えられないと判断し、最後まで仕留めることを選んだ。`
      : `${subject}は「ここで終わらせる」と判断し、追い払いではなく仕留める方を選んだ。`,
    { text: solo
        ? `${fname}は一言も増やさず、最後の一撃だけを選んだ。`
        : `${subject}は短く合図を交わし、ここで終わらせる方を選んだ。`, minTension: 70 },
    { text: solo
        ? `${fname}は退路を確認してから、仕留める手だけを残した。`
        : `${subject}は退路を確かめたうえで、仕留める判断に踏み切った。`, minTension: 80 }
  ], tensionValue, rng));

  // 6. 結果
  logs.push(pickTensionOne([
    `「なにか」の動きが止まった。正体は分からないままだが、納屋を脅かしていた気配は消えた。`,
    { text: `「なにか」の動きが止まった。納屋に残っていた気配だけが、静かに薄れていった。`, minTension: 65 },
    { text: `動きが止まった。誰も正体までは言わなかった。`, minTension: 80 }
  ], tensionValue, rng));

  return logs;
}

// 戦闘依頼（畑の追い払い／納屋の討伐）の結末（2026-07-31）。
// ★ simulateBattle の outcome をそのまま結末に写す。データ（enemyId）とロジックが食い違っていた
//   状態を解消するためで、勝てば従来どおり、押し切れなければ中止・失敗になる。
// 戦闘依頼（畑の追い払い／納屋の討伐）の結末（2026-07-31）。
// ★ simulateBattle の outcome をそのまま結末に写す。データ（enemyId）とロジックが食い違っていた
//   状態を解消するためで、勝てば従来どおり、押し切れなければ中止・失敗になる。
//   文面は data-outcomes.js にある（2026-08-01・段階2）。
function questBattleOutcomeText(quest, battleOutcome, party) {
  const key = battleOutcome === "victory" ? "victory"
    : (battleOutcome === "withdraw_first" || battleOutcome === "withdraw_emergency") ? "withdraw"
      : "defeat";
  return questOutcomeText(quest.id, key, party, []);
}

// ★ 生きた呼び出しは v2 の昼ルート（`generateNightLightDayLogs`）1箇所だけで、**`isNight` は false 固定**。
//   つまり下の `if (hasLantern)` 以下（夜・ランタンあり／なし）は**いま到達しない**（2026-09-14・EX-096）。
//   ⚠️ **死蔵に見えても消さないこと**——夜道 v1 を戻すときに要る本文で、退避の一部として残している
//   （`data-quests.js` の `masterQuestsRetired` を参照）。
function lightInvestigationResponseText(party, isNight, hasLantern, rng) {
  const stat = pickOne(["caution", "memory", "curiosity", "courage", "kindness"], rng);
  const adv = bestByTendency(party, stat);
  const name = getDisplayName(adv);
  const solo = isSoloHumanParty(party);
  const other = humanMembers(party).find((member) => member.id !== adv.id);
  const withOther = !solo && other;

  if (!isNight) {
    if (stat === "memory") return `${name}は人の足跡と荷車の跡だけを記録した。灯りにつながる痕跡は見つからなかった。`;
    if (stat === "caution") return `${name}は道の曲がり角と帰り道を確認したが、昼の調査では危険な点はなかった。`;
    return `${name}は道端の草や古い轍を確かめた。異常と呼べるものは残っていなかった。`;
  }

  if (hasLantern) {
    if (stat === "caution") return `${name}はランタンの明かりを足元に落とし、帰り道の轍を見失わない位置で調査を止めた。`;
    if (stat === "memory") return `${name}は灯りが見えた位置と、消えた方角を報告書に書き込んだ。`;
    if (stat === "curiosity") return withOther
      ? `${name}は近づきたがったが、${getDisplayName(other)}が帰り道を示して距離を保たせた。`
      : `${name}は近づきたい気持ちを抑え、見える距離から灯りの揺れ方だけを観察した。`;
    if (stat === "courage") return `${name}は前に出ようとしたが、ランタンの届く範囲を越えないところで足を止めた。`;
    return withOther
      ? `${name}は${getDisplayName(other)}の足元を気にし、暗い方へ寄りすぎないよう位置を直した。`
      : `${name}は足元を確かめながら、無理に暗がりへ踏み込まない判断をした。`;
  }

  if (stat === "caution") return `${name}は足元と帰り道が不安定だと判断し、深追いを避けた。`;
  if (stat === "memory") return `${name}は灯りが見えた方角だけを記録し、接近調査は次回に回した。`;
  if (stat === "curiosity") return `${name}は灯りの正体を気にしていたが、暗さのためそれ以上は近づかなかった。`;
  if (stat === "courage") return `${name}は一歩前に出たが、足元が見えないためそこで止まった。`;
  return withOther
    ? `${name}は${getDisplayName(other)}の足元を確かめ、無理に進まないよう促した。`
    : `${name}は無理をせず、見える範囲の情報だけを持ち帰ることにした。`;
}

function bridgeRepairOutcomeText(outcome, party, rng) {
  return questOutcomeText("quest_old_bridge_repair", outcome, party, []);
}

function churchPatrolOutcomeText(outcome, party, rng) {
  return questOutcomeText("quest_church_patrol", outcome, party, []);
}

function generateChurchPatrolLogs(quest, party, adventurerItemIds, rng, context = {}) {
  const itemIds = context.itemIds ?? getAllItemIds(adventurerItemIds);
  const weather = context.departConditions?.weather ?? "晴れ";
  const timeOfDay = context.departConditions?.timeOfDay ?? "昼";
  const tensionValue = context.tensionValue ?? 35;
  const pick = (list) => pickTensionOne(list, tensionValue, rng);
  const nm = (adv) => adv ? getDisplayName(adv) : null;
  const subject = partySubject(party);
  const scout = findByTrait(party, "job", "斥候");
  const row = party.find((a) => a.id === "adv_row");
  const mina = party.find((a) => a.id === "adv_mina");
  const elne = party.find((a) => a.id === "adv_elne");
  const careful = findByTrait(party, "personality", "慎重");
  const elsie = party.find((a) => a.id === "adv_elsie");
  const holderName = (itemId) => supplyItemHolderName(party, adventurerItemIds, itemId);
  const logs = [];

  logs.push(pick([
    `${quest.area}に着いた。道端の花壇は手入れされ、祈りの跡だけが静かに残っていた。`,
    `辺境教会の外縁へ向かうと、風に鐘の音が一度だけ届き、すぐに静けさに戻った。`,
    `${subject}は礼拝堂の扉を遠くから確かめ、柵の向こうから巡回を始めた。`
  ]));

  logs.push(pick([
    `花壇の土は湿り気がなく、最近まで水をやった跡が残っていた。`,
    `巡礼路の石畳には、古い足跡より新しい轍は見当たらなかった。`,
    `境界の外側には、野獣の足跡だけが薄く残っていた。`
  ]));

  if (weather === "小雨" || weather === "雨") {
    logs.push(pick([
      `小雨で巡礼路が滑りやすく、鐘楼の足元だけ念入りに確かめた。`,
      `雨に濡れた花壇の縁に、人の足跡は新しく残っていなかった。`
    ]));
  } else if (weather === "霧") {
    logs.push(`霧の向こうで礼拝堂の灯りだけが、いつもより長く見えた。`);
  }

  const work = [];
  if (mina && isHumanAdventurer(mina)) work.push(`${nm(mina)}は柵の緩みと巡礼路の段差を順に確かめた。`);
  else if (scout && isHumanAdventurer(scout)) work.push(`${nm(scout)}は柵の緩みと巡礼路の段差を順に確かめた。`);

  if (row && isHumanAdventurer(row)) work.push(`${nm(row)}は鐘楼の足元と礼拝堂外縁の足場を見回った。`);
  else if (careful && isHumanAdventurer(careful) && !work.some((line) => line.includes(nm(careful)))) {
    work.push(`${nm(careful)}は鐘楼の足元と礼拝堂外縁の足場を見回った。`);
  }

  if (elne && isHumanAdventurer(elne)) work.push(`${nm(elne)}は花壇の周りと祈りの跡を、無理に触れずに確かめた。`);

  while (work.length > 2) work.splice(Math.floor(rng() * work.length), 1);
  work.forEach((line) => logs.push(line));

  if (timeOfDay === "夜" || timeOfDay === "夕方" || weather === "霧") {
    logs.push(pick([
      `外縁の道で、消えかけた灯りのような揺れが一度だけ見えた。近づく前に消えた。`,
      `夜明け前に見えたという話の場所で、${subject}は足元と帰り道だけを確かめた。`
    ]));
  }

  if (elsie) {
    logs.push(pick([
      `エルシーは花壇の前で足を止め、礼拝堂の方角だけを見ていた。`,
      `エルシーは鐘楼の下で立ち止まり、風に揺れる鐘の音だけを耳にしていた。`,
      `エルシーは境界の外側で鼻を低くし、足跡の匂いを短く確かめた。`,
      `エルシーは小さな灯りの方を見上げたが、吠えずに振り返った。`
    ]));
  }

  if (itemIds.includes("item_map") && canUseItemInQuest(quest, "item_map", weather)) {
    logs.push(`${holderName("item_map")}は地図で巡礼路と裏手の林の境界を確かめ、巡回順を決めた。`);
  }
  if (itemIds.includes("item_whistle") && canUseItemInQuest(quest, "item_whistle", weather)) {
    logs.push(`${holderName("item_whistle")}は笛を短く吹き、外縁で迷子がいないか周囲に合図した。`);
  }
  if (itemIds.includes("item_bandage") && canUseItemInQuest(quest, "item_bandage", weather)) {
    logs.push(`${holderName("item_bandage")}は柵の縛り目に包帯を巻き、緩みの目印にした。`);
  }
  if (itemIds.includes("item_pot") && canUseItemInQuest(quest, "item_pot", weather)) {
    logs.push(`${holderName("item_pot")}は花壇の脇で水を汲み、乾きかけた土を一度だけ潤した。`);
  }
  const isDim = timeOfDay === "夕方" || timeOfDay === "夜";
  if (itemIds.includes("item_lantern") && canUseItemInQuest(quest, "item_lantern", weather) && (isDim || weather === "霧")) {
    logs.push(`${holderName("item_lantern")}はランタンで巡礼路の段差と柵の緩みを照らし、無理に近づかず確認した。`);
  }

  logs.push(pick([
    `最後にもう一度、礼拝堂外縁と帰り道だけを確かめた。`,
    `何も起きなかった静かな巡回だった。それでも、記録としては十分だった。`,
    `鐘は鳴らず、花の匂いだけが残ったまま、一行は門へ戻った。`
  ]));

  return logs;
}

function generateBridgeRepairLogs(quest, party, adventurerItemIds, rng, context = {}) {
  const itemIds = context.itemIds ?? getAllItemIds(adventurerItemIds);
  const weather = context.departConditions?.weather ?? "晴れ";
  const tensionValue = context.tensionValue ?? 50;
  const pick = (list) => pickTensionOne(list, tensionValue, rng);
  const nm = (adv) => adv ? getDisplayName(adv) : null;
  const row = party.find((a) => a.id === "adv_row");
  const gadd = party.find((a) => a.id === "adv_gadd");
  const mina = party.find((a) => a.id === "adv_mina");
  const elne = party.find((a) => a.id === "adv_elne");
  const elsie = party.find((a) => a.id === "adv_elsie");
  const warrior = findByTrait(party, "job", "戦士");
  const scout = findByTrait(party, "job", "斥候");
  const caregiver = findByTrait(party, "personality", "世話焼き");
  const careful = findByTrait(party, "personality", "慎重");
  const logs = [];

  const holderName = (itemId) => supplyItemHolderName(party, adventurerItemIds, itemId);

  logs.push(pick([
    `村はずれの小川に着くと、古い小橋の板が一枚浮いていた。`,
    `${quest.area}に着いた。古い小橋は手すりの一部が緩み、中央の板が沈んでいた。`
  ]));

  logs.push(pick([
    `水音は穏やかだったが、橋の中央だけ踏むと少し沈む。`,
    `小川の水音は低く、橋脚の根元にはぬかるんだ足跡が残っていた。`,
    `手すりの釘が二本抜けており、板の端が水面に近い。`
  ]));

  if (weather === "小雨" || weather === "雨") {
    logs.push(pick([
      `小雨で板が滑りやすく、岸のぬかるみも深かった。足場を確かめてから作業を始めた。`,
      `雨で手すりが濡れ、釘の緩みが目立った。急がず、一か所ずつ確認することにした。`
    ]));
  } else if (weather === "風が強い") {
    logs.push(`風で古い手すりがきしむ。板を叩く前に、橋全体の揺れを確かめた。`);
  }

  const work = [];
  if (row) work.push(`${nm(row)}は先に橋へ乗らず、岸側から板の緩みを確かめた。`);
  else if (warrior && isHumanAdventurer(warrior)) work.push(`${nm(warrior)}は先に橋へ乗らず、岸側から板の緩みを確かめた。`);

  if (gadd) work.push(`${nm(gadd)}は傷んだ板を外し、使える釘だけを別に集めた。`);
  else if (warrior && isHumanAdventurer(warrior)) work.push(`${nm(warrior)}は傷んだ板を外し、手元の釘を確かめながら交換を進めた。`);

  if (mina) work.push(`${nm(mina)}は迂回路と通行人の足跡を確認し、修理中に人が渡らないよう声をかけた。`);
  else if (scout && isHumanAdventurer(scout)) work.push(`${nm(scout)}は迂回路と足跡を確かめ、作業中に橋へ近づかないよう手で制した。`);

  if (elne) work.push(`${nm(elne)}は作業後、手を擦った者がいないか確かめてから道具を片付けた。`);
  else if (caregiver && isHumanAdventurer(caregiver)) work.push(`${nm(caregiver)}は作業のあいだ、手すりに触れた者の手を確かめ、擦れがないか見た。`);

  if (careful && isHumanAdventurer(careful) && !work.some((line) => line.includes(nm(careful)))) {
    work.push(`${nm(careful)}は釘の抜けと板の反りを一つずつ記録しながら、足場の危ない場所に印を付けた。`);
  }

  while (work.length > 3) work.splice(Math.floor(rng() * work.length), 1);
  work.forEach((line) => logs.push(line));

  if (elsie) {
    logs.push(pick([
      `エルシーは橋のたもとで耳を立て、水音と足音のする方を交互に見ていた。`,
      `エルシーは岸の草むらで鼻を鳴らし、小川の匂いをしばらく追っていた。`,
      `エルシーは橋のたもとで伏せ、作業の合図があるまで動かなかった。`
    ]));
  }

  if (itemIds.includes("item_bandage") && canUseItemInQuest(quest, "item_bandage", weather)) {
    const h = holderName("item_bandage");
    logs.push(pick([
      `${h}は包帯を板の仮止めに使い、緩んだ端を結んで目印にした。`,
      `${h}が持っていた包帯を手すりの当たりに巻き、作業中の目印に使った。`
    ]));
  }
  if (itemIds.includes("item_whistle") && canUseItemInQuest(quest, "item_whistle", weather)) {
    logs.push(`${holderName("item_whistle")}は笛を短く吹き、通行人に橋を渡らないよう合図した。`);
  }
  if (itemIds.includes("item_map") && canUseItemInQuest(quest, "item_map", weather)) {
    logs.push(`${holderName("item_map")}は古地図で旧道と迂回路を確かめ、修理中の誘導先を決めた。`);
  }
  if (itemIds.includes("item_pot") && canUseItemInQuest(quest, "item_pot", weather)) {
    logs.push(`${holderName("item_pot")}は携帯鍋で薄いお湯を沸かし、冷えた手を温めてから作業を再開した。`);
  }
  const isDim = context.departConditions?.timeOfDay === "夕方" || context.departConditions?.timeOfDay === "夜";
  if (itemIds.includes("item_lantern") && canUseItemInQuest(quest, "item_lantern", weather) && (isDim || weather === "霧")) {
    logs.push(`${holderName("item_lantern")}はランタンを橋下に落とし、腐った板の桁を照らして確認した。`);
  }

  logs.push(pick([
    `最後にもう一度、橋板の浮きと手すりの揺れを確認した。`,
    `作業を終えたあと、荷車を通す前に徒歩での確認を行った。`,
    `報告書用に、危ない板の位置だけ印をつけておいた。`
  ]));

  return logs;
}

function herbDeliveryOutcomeText(outcome, party, rng) {
  return questOutcomeText("quest_herb_delivery", outcome, party, []);
}

function generateHerbDeliveryLogs(quest, party, adventurerItemIds, rng, context = {}) {
  const itemIds = context.itemIds ?? getAllItemIds(adventurerItemIds);
  const weather = context.departConditions?.weather ?? "晴れ";
  const tensionValue = context.tensionValue ?? 50;
  const pick = (list) => pickTensionOne(list, tensionValue, rng);
  const nm = (adv) => adv ? getDisplayName(adv) : null;
  const row = party.find((a) => a.id === "adv_row");
  const gadd = party.find((a) => a.id === "adv_gadd");
  const mina = party.find((a) => a.id === "adv_mina");
  const elne = party.find((a) => a.id === "adv_elne");
  const elsie = party.find((a) => a.id === "adv_elsie");
  const scout = findByTrait(party, "job", "斥候");
  const herbalist = findByTrait(party, "job", "薬草師");
  const caregiver = findByTrait(party, "personality", "世話焼き");
  const careful = findByTrait(party, "personality", "慎重");
  const warrior = findByTrait(party, "job", "戦士");
  const logs = [];

  const holderName = (itemId) => supplyItemHolderName(party, adventurerItemIds, itemId);

  logs.push(pick([
    `調合所で受け取った薬草包みは、思ったより軽かったが、強く揺らすと中身が崩れそうだった。`,
    `村の調合所で包みを受け取った。結び目は丁寧だが、道中の揺れには弱そうだった。`
  ]));

  logs.push(pick([
    `${partySubject(party)}は納品書と宛先を確かめ、${quest.area}へ向かった。`,
    `出発前に、診療所の表札と街道の分岐をもう一度読み直した。`
  ]));

  if (weather === "小雨" || weather === "雨") {
    logs.push(pick([
      `小雨が降り始め、街道の端はぬかるんでいた。包みを胸の高さに抱え、歩幅を狭めた。`,
      `雨で荷紐が湿り、包みの外布に水気が移りやすかった。`
    ]));
  } else if (weather === "風が強い") {
    logs.push(`風で包みの布がはためいた。歩くたびに荷が揺れないよう、手を添えて進んだ。`);
  } else if (weather === "霧") {
    logs.push(`霧で分岐が見えにくかったが、足元の轍を頼りに進んだ。`);
  } else {
    logs.push(pick([
      `街道は乾いていたが、橋の手前だけぬかるみが残っていた。`,
      `道中、荷車の轍と歩行者の足跡が混ざり、足場に注意が必要だった。`
    ]));
  }

  const work = [];
  if (mina) work.push(`${nm(mina)}は宛先の診療所と街道の分岐を確認し、遠回りでもぬかるみの少ない道を選んだ。`);
  else if (scout && isHumanAdventurer(scout)) work.push(`${nm(scout)}は分岐と迂回路を確かめ、荷が揺れにくい道を選んだ。`);

  if (elne) work.push(`${nm(elne)}は薬草包みの結び目を確かめ、湿気が入らないよう布をかけ直した。`);
  else if (herbalist && isHumanAdventurer(herbalist)) work.push(`${nm(herbalist)}は包みの結び目と乾き具合を確かめ、布の端を整えた。`);

  if (gadd) work.push(`${nm(gadd)}は荷を片側に寄せず、両手で抱えるようにして歩いた。`);
  else if (warrior && isHumanAdventurer(warrior)) work.push(`${nm(warrior)}は荷を両手で支え、段差のたびに足を止めた。`);

  if (row) work.push(`${nm(row)}は橋や段差の前で立ち止まり、荷物を持つ者が足を取られないよう先に足場を確かめた。`);
  else if (careful && isHumanAdventurer(careful) && !work.some((line) => line.includes(nm(careful)))) {
    work.push(`${nm(careful)}は段差の前で足場を確かめ、包みが揺れない位置を先に示した。`);
  }

  while (work.length > 3) work.splice(Math.floor(rng() * work.length), 1);
  work.forEach((line) => logs.push(line));

  if (elsie) {
    logs.push(pick([
      `エルシーは薬草の匂いが気になるのか、包みの近くで一度だけ鼻を鳴らした。`,
      `エルシーは荷物のそばで伏せ、出発の合図まで待っていた。`,
      `エルシーは道中、何度も振り返りながら歩いた。`
    ]));
  }

  if (itemIds.includes("item_oilcase") && canUseItemInQuest(quest, "item_oilcase", weather)) {
    if (weather === "小雨" || weather === "雨") {
      logs.push(`小雨が降り始めたが、油紙の手紙入れに納品書をしまっていたため、文字は滲まなかった。`);
    } else {
      logs.push(`${holderName("item_oilcase")}は油紙の手紙入れに納品書をしまい、湿気からラベルを守った。`);
    }
  }
  if (itemIds.includes("item_map") && canUseItemInQuest(quest, "item_map", weather)) {
    logs.push(`${holderName("item_map")}は古地図で街道と迂回路を確かめ、診療所への道筋を決めた。`);
  }
  if (itemIds.includes("item_pot") && canUseItemInQuest(quest, "item_pot", weather)) {
    logs.push(`${holderName("item_pot")}は携帯鍋で薄いお湯を沸かし、冷えた手を温めてから荷を抱え直した。`);
  }
  if (itemIds.includes("item_whistle") && canUseItemInQuest(quest, "item_whistle", weather) && (weather === "霧" || weather === "風が強い")) {
    logs.push(`${holderName("item_whistle")}は笛を短く吹き、霧の中でも道から離れないよう合図した。`);
  }
  const isDim = context.departConditions?.timeOfDay === "夕方" || context.departConditions?.timeOfDay === "夜";
  if (itemIds.includes("item_lantern") && canUseItemInQuest(quest, "item_lantern", weather) && isDim) {
    logs.push(`${holderName("item_lantern")}はランタンで診療所の看板と足元を照らし、納品先を確かめた。`);
  }
  if (itemIds.includes("item_bandage") && canUseItemInQuest(quest, "item_bandage", weather)) {
    logs.push(pick([
      `${holderName("item_bandage")}は緩んだ荷紐を包帯で補修し、包みが落ちないよう固定した。`,
      `${holderName("item_bandage")}が持っていた包帯を、擦れた指に当ててから荷を抱え直した。`
    ]));
  }

  logs.push(pick([
    `街道沿いの診療所に着いた。受付の戸は開いており、薬草の乾いた匂いが漂っていた。`,
    `診療所の前で立ち止まり、包みの結び目を最後にもう一度確かめた。`
  ]));

  return logs;
}

function missingHerbalistOutcomeText(outcome, party, rng) {
  return questOutcomeText("quest_missing_herbalist", outcome, party, []);
}

function generateMissingHerbalistLogs(quest, party, adventurerItemIds, rng, context = {}) {
  const itemIds = context.itemIds ?? getAllItemIds(adventurerItemIds);
  const weather = context.departConditions?.weather ?? "晴れ";
  const timeOfDay = context.departConditions?.timeOfDay ?? "昼";
  const tensionValue = context.tensionValue ?? 50;
  const outcome = context.outcome ?? "保護";
  const pick = (list) => pickTensionOne(list, tensionValue, rng);
  const nm = (adv) => adv ? getDisplayName(adv) : null;
  const row = party.find((a) => a.id === "adv_row");
  const gadd = party.find((a) => a.id === "adv_gadd");
  const mina = party.find((a) => a.id === "adv_mina");
  const elne = party.find((a) => a.id === "adv_elne");
  const elsie = party.find((a) => a.id === "adv_elsie");
  const scout = findByTrait(party, "job", "斥候");
  const herbalist = findByTrait(party, "job", "薬草師");
  const careful = findByTrait(party, "personality", "慎重");
  const logs = [];

  const holderName = (itemId) => supplyItemHolderName(party, adventurerItemIds, itemId);

  logs.push(pick([
    `依頼人は、薬草採りが朝から戻っていないとだけ言った。持っていた袋の色と、向かった森の入口が報告書に記された。`,
    `夕方になっても戻らない薬草採りのことを、依頼人は短く説明した。袋の色と採りに行った森の入口だけが手がかりだった。`
  ]));

  logs.push(pick([
    `${partySubject(party)}は${quest.area}へ向かった。森の浅い場所だけを確認する予定だった。`,
    `森の入口に着くと、昼の足跡と夕方のぬかるみが混ざっていた。`
  ]));

  if (timeOfDay === "夕方" || timeOfDay === "夜") {
    logs.push(pick([
      `木の影が長く、森の中は思ったより早く暗くなっていた。`,
      `夕方の森は静かで、遠くの水音だけがはっきり聞こえた。`
    ]));
  }

  logs.push(pick([
    `落ちていた薬草の束と、踏み荒らされた浅い足跡が見つかった。`,
    `ぬかるみに、小さな薬草袋の跡と、よろめいた足跡が残っていた。`,
    `森の浅瀬で、採取途中の薬草がいくつか落ちていた。`
  ]));

  if (weather === "小雨" || weather === "霧") {
    logs.push(pick([
      `霧で視界が悪く、足跡の先が読みにくかった。`,
      `小雨で足跡が滲み、古いものと新しいものの区別に時間がかかった。`
    ]));
  }

  const work = [];
  if (mina) work.push(`${nm(mina)}は森の入口で足跡を確認し、まだ新しいものだけを追った。`);
  else if (scout && isHumanAdventurer(scout)) work.push(`${nm(scout)}は足跡の向きを確かめ、浅瀬へ続く新しい跡だけを追った。`);

  if (elne) work.push(`${nm(elne)}は落ちていた薬草を見て、採取中に急いで動いた可能性があると判断した。`);
  else if (herbalist && isHumanAdventurer(herbalist)) work.push(`${nm(herbalist)}は落ちた薬草の切り口を見て、慌てて移動した形跡があると考えた。`);

  if (row) work.push(`${nm(row)}は帰り道を見失わないよう、分岐ごとに目印を確認した。`);
  else if (careful && isHumanAdventurer(careful)) work.push(`${nm(careful)}は分岐のたびに帰路の目印を確かめ、深追いしない範囲を決めた。`);

  if (gadd) work.push(`${nm(gadd)}は声を出して呼びかけたが、返事がない場所では無理に奥へ踏み込まなかった。`);

  while (work.length > 3) work.splice(Math.floor(rng() * work.length), 1);
  work.forEach((line) => logs.push(line));

  if (elsie) {
    logs.push(pick([
      `エルシーは草むらの前で鼻を低くし、同じ場所を何度も嗅いでいた。`,
      `エルシーは足跡のそばで立ち止まり、耳だけを動かしていた。`,
      `エルシーは浅瀬の匂いを追い、一度だけ低く唸った。`
    ]));
  }

  if (itemIds.includes("item_whistle") && canUseItemInQuest(quest, "item_whistle", weather)) {
    logs.push(`${holderName("item_whistle")}は森の中で笛を短く鳴らし、返事があるかしばらく待って確認した。`);
  }
  const isDim = timeOfDay === "夕方" || timeOfDay === "夜";
  if (itemIds.includes("item_lantern") && canUseItemInQuest(quest, "item_lantern", weather) && (isDim || weather === "霧")) {
    logs.push(`ランタンを灯したことで、ぬかるみに残った足跡の向きが分かった。`);
  }
  if (itemIds.includes("item_map") && canUseItemInQuest(quest, "item_map", weather)) {
    logs.push(`${holderName("item_map")}は古地図で採草地と帰り道を確かめ、浅瀬への近道を避けた。`);
  }
  if (itemIds.includes("item_bandage") && canUseItemInQuest(quest, "item_bandage", weather)) {
    logs.push(`${holderName("item_bandage")}は包帯をすぐ使えるよう、取り出しやすい位置に移しておいた。`);
  }
  if (itemIds.includes("item_pot") && canUseItemInQuest(quest, "item_pot", weather)) {
    logs.push(`${holderName("item_pot")}は休ませる場所を確保するため、携帯鍋で湯を沸かす準備だけしておいた。`);
  }
  if (itemIds.includes("item_obs_sheet") && canUseItemInQuest(quest, "item_obs_sheet", weather)) {
    logs.push(`${holderName("item_obs_sheet")}は観察記録票に、足跡の向きと落とし物の位置だけを書き留めた。`);
  }

  return logs;
}

function eveningEscortOutcomeText(outcome, party, rng) {
  return questOutcomeText("quest_evening_market_escort", outcome, party, []);
}

function generateEveningEscortLogs(quest, party, adventurerItemIds, rng, context = {}) {
  const itemIds = context.itemIds ?? getAllItemIds(adventurerItemIds);
  const weather = context.departConditions?.weather ?? "晴れ";
  const timeOfDay = context.departConditions?.timeOfDay ?? "夕方";
  const tensionValue = context.tensionValue ?? 50;
  const pick = (list) => pickTensionOne(list, tensionValue, rng);
  const nm = (adv) => adv ? getDisplayName(adv) : null;
  const row = party.find((a) => a.id === "adv_row");
  const gadd = party.find((a) => a.id === "adv_gadd");
  const mina = party.find((a) => a.id === "adv_mina");
  const elne = party.find((a) => a.id === "adv_elne");
  const elsie = party.find((a) => a.id === "adv_elsie");
  const scout = findByTrait(party, "job", "斥候");
  const caregiver = findByTrait(party, "personality", "世話焼き");
  const careful = findByTrait(party, "personality", "慎重");
  const shield = findByTrait(party, "job", "見習い盾役");
  const logs = [];

  const holderName = (itemId) => supplyItemHolderName(party, adventurerItemIds, itemId);

  logs.push(pick([
    `夕市の片付けが始まる頃、依頼人の親子と合流した。荷物は思ったより多かった。`,
    `夕市の端で親子を待ち受けた。買い物袋は二つあり、子どもは少し疲れていた。`
  ]));

  logs.push(pick([
    `帰り道と荷物の持ち方を確認し、暗くなる前に着く見込みを伝えた。`,
    `親は荷物の中身を簡単に説明し、町外れの家までの道を指さした。`
  ]));

  logs.push(pick([
    `夕暮れの街道は人の姿が少なくなり、店の灯りだけが遠くに残っていた。`,
    `空はまだ明るいが、路地の影は早く深くなっていた。`,
    { text: `風のない夕方、街道は思ったより静かだった。`, maxTension: 55 }
  ]));

  if (weather === "小雨" || weather === "霧") {
    logs.push(pick([
      `小雨で石畳が滑りやすく、親は子どもの手を強く握った。`,
      `霧で先の曲がり角が見えにくかったが、人の声はまだ聞こえていた。`
    ]));
  }

  const work = [];
  if (mina) work.push(`${nm(mina)}は帰り道の分岐を確認し、人通りの残っている道を選んだ。`);
  else if (scout && isHumanAdventurer(scout)) work.push(`${nm(scout)}は分岐を確かめ、人の気配が残る道を選んだ。`);

  if (row) work.push(`${nm(row)}は親子の少し前を歩き、道幅が狭くなる場所では足を止めて待った。`);
  else if (shield && isHumanAdventurer(shield)) work.push(`${nm(shield)}は親子より半歩前を歩き、狭い道では先に足場を確かめた。`);

  if (gadd) work.push(`${nm(gadd)}は重い買い物袋を引き受けた。子どもはその大きな背中の後ろを歩いた。`);
  else if (row && isHumanAdventurer(row)) work.push(`${nm(row)}は重い袋を引き受け、子どもがつまずかないよう歩幅を合わせた。`);

  if (elne) work.push(`${nm(elne)}は子どもの歩幅に合わせ、急がせないように声をかけた。`);
  else if (caregiver && isHumanAdventurer(caregiver)) work.push(`${nm(caregiver)}は子どもの歩幅に合わせ、休みどころをこまめに確かめた。`);

  if (careful && isHumanAdventurer(careful) && !work.some((line) => line.includes(nm(careful)))) {
    work.push(`${nm(careful)}は暗くなる前に危ない坂を避け、明るい道を優先した。`);
  }

  while (work.length > 3) work.splice(Math.floor(rng() * work.length), 1);
  work.forEach((line) => logs.push(line));

  if (elsie) {
    logs.push(pick([
      `エルシーは親子の少し後ろを歩き、子どもが立ち止まるたびに振り返った。`,
      `エルシーは子どものそばを小走りに進み、門の前まで離れなかった。`,
      `エルシーは夕暮れの足音に耳を立てながら、親子の後ろをついていった。`
    ]));
  }

  const isDim = timeOfDay === "夕方" || timeOfDay === "夜";
  if (itemIds.includes("item_lantern") && canUseItemInQuest(quest, "item_lantern", weather) && (isDim || weather === "霧")) {
    logs.push(`ランタンを灯すと、ぬかるみと石段が見えやすくなった。`);
  }
  if (itemIds.includes("item_map") && canUseItemInQuest(quest, "item_map", weather)) {
    logs.push(`${holderName("item_map")}は古地図で近道と安全な道を照らし合わせ、明るい方を選んだ。`);
  }
  if (itemIds.includes("item_whistle") && canUseItemInQuest(quest, "item_whistle", weather)) {
    const whistleLine = pick([
      `笛は使わずに済んだが、合図の手段があるだけで親は少し安心したようだった。`,
      `${holderName("item_whistle")}は笛を手元に持ったまま歩いたが、鳴らす必要はなかった。`
    ]);
    // ★ 工程エンジンで笛が鳴った回は書かない（2026-09-12・EX-082）。同じ報告書に
    //   「短い笛の音ですぐ立て直した」と並ぶため。抽選は済ませてから落とすので乱数の消費は変わらない
    //   （EX-071 の樽と同じ形）。
    if (whistleLine && context.whistleUsed !== true) logs.push(whistleLine);
  }
  if (itemIds.includes("item_bandage") && canUseItemInQuest(quest, "item_bandage", weather) && rng() < 0.45) {
    logs.push(`${holderName("item_bandage")}は子どもの擦れた膝に包帯を当て、歩きやすくしてから先へ進んだ。`);
  }
  if (itemIds.includes("item_pot") && canUseItemInQuest(quest, "item_pot", weather) && rng() < 0.40) {
    logs.push(`${holderName("item_pot")}は道端で携帯鍋を使い、子どもに温かい飲み物を渡した。`);
  }

  logs.push(pick([
    `町外れの家が見えてきた。戸口の灯りが一つだけ点いていた。`,
    `家の前の石段が見えた。親は荷物の数を数え直し、一つも欠けていないことを確かめた。`
  ]));

  return logs;
}

// 隊商護衛（掴み体験）：戦闘エンジンの結果を3分岐のドラマ型ログに翻訳する。
// スライス10：成長の行動ベース判定用サマリー（人間のみ）。
// 撤退判断への参加はイベントに参加者リストがないため「生存人間全員」で近似（会敵時判断は必ず発生する）。
function caravanBattleGrowthSummary(battle, party) {
  if (!battle) return null;
  const actorStats = {};
  party.filter((a) => a.species !== "dog").forEach((a) => { actorStats[a.id] = ["survival"]; });
  battle.events.forEach((ev) => {
    if (ev.type === "deal" && actorStats[ev.attackerId] && !actorStats[ev.attackerId].includes("combat")) actorStats[ev.attackerId].push("combat");
    if (ev.type === "heal" && actorStats[ev.healerId] && !actorStats[ev.healerId].includes("support")) actorStats[ev.healerId].push("support");
  });
  return { downed: battle.members.some((m) => m.downed), actorStats };
}

function caravanEscortOutcomeText(branch, party, rng) {
  return questOutcomeText("quest_caravan_escort", branch, party, [], "fail");
}

function generateCaravanEscortLogs(quest, party, adventurerItemIds, rng, context = {}) {
  // 遭遇フリ（到着〜遭遇）のみ。交戦の blow-by-blow は generateCaravanBattleDramaLog（案D）へ分離。
  const tensionValue = context.tensionValue ?? 55;
  const pick = (list) => pickTensionOne(list, tensionValue, rng);
  const nm = (adv) => (adv ? getDisplayName(adv) : null);
  const scout = findByTrait(party, "job", "斥候");
  const elsie = party.find((a) => a.id === "adv_elsie");
  const logs = [];

  logs.push(pick([
    `荷馬車の脇で隊商と合流した。商人は生活圏の外縁を抜ける道を指し、暗くなる前に通り抜けたいと言った。`,
    `隊商の荷は重く、外縁の街道は普段より人の姿が少なかった。商人は先を急ぎたがっていた。`
  ]));

  if (scout && isHumanAdventurer(scout)) {
    logs.push(`${nm(scout)}が少し先行し、道の曲がりと茂みの陰を先に確かめた。`);
  } else {
    logs.push(pick([
      `街道は外縁に近づくほど、両脇の茂みが深くなった。`,
      `外縁の風は乾いていて、遠くの物音がよく通った。`
    ]));
  }

  if (elsie) {
    logs.push(pick([
      `エルシーは荷馬車の前を歩きながら、途中で一度足を止めて茂みの奥へ鼻を向けた。`,
      `エルシーは低く唸り、街道の先の気配に耳を立てた。`
    ]));
  }

  logs.push(pick([
    `茂みが揺れ、街道の外れから野盗が現れて行く手を塞いだ。`,
    `荷を狙う野盗が、数を頼みに街道へ出てきた。`
  ]));

  // 末尾の1行は必ず遭遇（戦闘開始）の一文。色分け用に battle-start を付け、他は action。
  return logs.map((text, i) => ({ kind: i === logs.length - 1 ? "battle-start" : "action", text }));
}

// 隊商護衛の交戦を events から「1行1アクション」のドラマログへ翻訳する（案D・スライス2）。
// ラウンド番号は出さず、動作＋結果＋括弧内の数値で語る。状態変化は文章に溶かす。エルシーはダメージ・状態行に出さない。
function generateCaravanBattleDramaLog(battle, party, rng) {
  if (!battle || !Array.isArray(battle.events) || battle.events.length === 0) return [];
  const random = rng ?? Math.random;
  const pick = (list) => list[Math.floor(random() * list.length)];
  const enemyRow = Array.isArray(window.masterEnemies) ? window.masterEnemies.find((e) => e.id === battle.enemyId) : null;
  const enemyN = enemyDisplayShortName(enemyRow, enemyRow?.name ?? battle.enemyName ?? "相手");
  const jobById = {};
  party.forEach((a) => { jobById[a.id] = a.job; });
  const hasElsie = party.some((a) => a.id === "adv_elsie");
  const smokeHeld = battle.smoke?.held ?? false;

  // ★ 変化のない被弾はラウンド単位で1行に畳む（2026-08-04・EX-052／裁定B）。
  //   EX-046 の「防げた瞬間」と同型＝変化のない事象を1行にまとめる形の、別の場所への適用。
  //   個別に書くと同じ行が1つの報告書に3〜5回並ぶ（被弾の 71.1% が状態も変えない削りだった）。
  //   畳んでも合計ダメージは書くので、消耗の蓄積は読める（撤退が唐突にならない）。
  const changedAt = new Set();
  battle.events.forEach((ev) => {
    if (ev.type === "status" && !ev.recovered) changedAt.add(`${ev.round}|${ev.targetId}`);
  });
  const isPlainTake = (ev) =>
    ev.type === "take" && !ev.crit && ev.strong !== true && !changedAt.has(`${ev.round}|${ev.targetId}`);
  const plainByRound = {};
  battle.events.forEach((ev, i) => {
    if (!isPlainTake(ev)) return;
    if (!plainByRound[ev.round]) plainByRound[ev.round] = { total: 0, firstIndex: i };
    plainByRound[ev.round].total += ev.damage;
  });
  const attritionLine = (total) => pick([
    `${enemyN}の攻めは止まず、一行はじりじりと削られていった（一行に合計${total}ダメージ）`,
    `決定打はない。それでも手数が多く、浅い傷が積み上がっていく（一行に合計${total}ダメージ）`,
    `${enemyN}は数で押してくる。細かい傷が重なった（一行に合計${total}ダメージ）`
  ]);

  // 深手の者の攻撃行は専用文（損耗が動作に出る書き方・メタ用語なし）。連続で同じ文は使わない。
  let lastWeakenedIdx = -1;
  const weakenedDealLine = (ev) => {
    const n = ev.damage, name = ev.attackerName;
    if (ev.strong === true) return `${name}は傷を押して、なお重い一撃を叩き込んだ！（${enemyN}に${n}ダメージ！）`;
    const variants = [
      `${name}の一撃は、さっきほどの重さがなかった（${enemyN}に${n}ダメージ）`,
      `${name}は傷を押して打ちかかった（${enemyN}に${n}ダメージ）`,
      `${name}は乱れた息のまま打ち込んだ（${enemyN}に${n}ダメージ）`
    ];
    let idx = Math.floor(random() * variants.length);
    if (idx === lastWeakenedIdx) idx = (idx + 1) % variants.length;
    lastWeakenedIdx = idx;
    return variants[idx];
  };

  // クリティカル（＝深手）の行。赤文字は既に報告書で使っている表現なので、新しい色を増やさない。
  const critDealLine = (ev) => ({
    kind: "status-grave",
    text: `${ev.attackerName}が渾身の一撃を叩き込んだ。致命の一撃を与えた！（${enemyN}に${ev.damage}ダメージ！）`
  });
  const critTakeLine = (ev) => ({
    kind: "status-grave",
    text: `${enemyN}の刃が深く入った。${ev.targetName}が致命の一撃を受けた！（${ev.targetName}に${ev.damage}ダメージ！）`
  });

  const dealLine = (ev) => {
    if (ev.attackerStatus === "深手") return weakenedDealLine(ev);
    const n = ev.damage, big = ev.strong === true, name = ev.attackerName, job = jobById[ev.attackerId];
    // ★ 斥候の並打ちだけ候補が1文で、他の職（戦士2・盾役2・薬草師3）と不揃いだった。
    //   2026-08-04・EX-052 で他と同じ3文に揃えた。揃えるのが目的で、増やすのが目的ではない。
    if (job === "斥候") return big
      ? `${name}の矢が${enemyN}の胴を捉えた！（${enemyN}に${n}ダメージ！）`
      : pick([
        `${name}は間合いを取って矢を放ち、${enemyN}のひとりの肩を射抜いた（${enemyN}に${n}ダメージ）`,
        `${name}は素早く次の矢をつがえ、${enemyN}の脇腹を掠めた（${enemyN}に${n}ダメージ）`,
        `${name}は荷馬車の陰から狙いをつけ、${enemyN}の足を射た（${enemyN}に${n}ダメージ）`
      ]);
    if (job === "戦士") return big
      ? `${name}の一撃が${enemyN}をまとめて弾き飛ばした！（${enemyN}に${n}ダメージ！）`
      : pick([`${name}が踏み込み、${enemyN}を打ち据えた（${enemyN}に${n}ダメージ）`, `${name}が前へ出て、${enemyN}を弾き返した（${enemyN}に${n}ダメージ）`]);
    if (job === "見習い盾役") return big
      ? `${name}が盾ごと体当たりし、${enemyN}を押し崩した！（${enemyN}に${n}ダメージ！）`
      : pick([`${name}は盾で押し込み、${enemyN}の体勢を崩した（${enemyN}に${n}ダメージ）`, `${name}は突いてきた${enemyN}を打ち払った（${enemyN}に${n}ダメージ）`]);
    if (job === "薬草師") return pick([
      `${name}は慣れない手つきで棒を振るった（${enemyN}に${n}ダメージ）`,
      `${name}はおそるおそる棒を突き出した（${enemyN}に${n}ダメージ）`,
      `${name}は戦い慣れない様子で、それでも棒を振るった（${enemyN}に${n}ダメージ）`
    ]);
    return `${name}は${enemyN}へ打ちかかった（${enemyN}に${n}ダメージ${big ? "！" : ""}）`;
  };

  const finisherLine = (ev) => {
    const n = ev.damage, name = ev.attackerName, job = jobById[ev.attackerId];
    if (job === "斥候") return `${name}が最後の矢をつがえる。放たれた一射が決め手になった。${enemyN}は算を乱し、街道の奥へ引いていった（${enemyN}に${n}ダメージ！）`;
    if (job === "戦士") return `${name}の一撃で${enemyN}は総崩れになり、街道から姿を消した（${enemyN}に${n}ダメージ！）`;
    return `${name}の一撃が決め手になった。${enemyN}は算を乱して退いていった（${enemyN}に${n}ダメージ！）`;
  };

  const takeLine = (ev) => {
    const n = ev.damage, big = ev.strong === true, name = ev.targetName, job = jobById[ev.targetId];
    const frontish = job === "戦士" || job === "見習い盾役";
    if (frontish) return big
      ? `${name}はよろけた拍子に、${enemyN}の一撃をまともに受けた！（${name}に${n}ダメージ！）`
      : `${name}は前で受け止めたが、衝撃は殺しきれなかった（${name}に${n}ダメージ）`;
    return big
      ? `${name}は回り込まれ、${enemyN}の一撃をもらった！（${name}に${n}ダメージ！）`
      : `${name}はかすめる一撃を払い、浅く傷を負った（${name}に${n}ダメージ）`;
  };

  // 状態遷移行は色分け対象：手負い=status-hurt（橙）／深手・戦闘不能=status-grave（赤）／回復による戻り=battle-heal（緑）。
  const statusLine = (ev) => {
    const name = ev.targetName;
    if (ev.recovered) {
      if (ev.to === "手負い") return { kind: "battle-heal", text: `${name}の顔に血の気が戻った。まだ戦える。` };
      if (ev.to === "健在") return { kind: "battle-heal", text: `${name}の動きが軽くなった。もう案じることはない。` };
      return null;
    }
    if (ev.to === "手負い") return { kind: "status-hurt", text: pick([`${name}の息が上がってきた。`, `${name}の動きから、少しずつ精彩が失われていく。`]) };
    if (ev.to === "深手") return { kind: "status-grave", text: pick([`${name}の構えが崩れた。もう長くは保たない。`, `${name}は足を引きずり始めた。傷が深い。`]) };
    if (ev.to === "戦闘不能") return { kind: "status-grave", text: pick([`${name}は膝をつき、そのまま動けなくなった。`, `${name}が崩れ落ちた。もう立ち上がれない。`]) };
    return null;
  };

  // 回復行（スライス5）：supportの高い人間が包帯で手当てする。エルシーは施術者にならない。
  const healLine = (ev) => ({
    kind: "battle-heal",
    text: ev.self
      ? `${ev.healerName}は自分の傷に手早く包帯を巻いた（${ev.healerName}は${ev.amount}回復）（包帯消費：1）`
      : `${ev.healerName}は${ev.targetName}に駆け寄り、傷に包帯を巻いた（${ev.targetName}は${ev.amount}回復）（包帯消費：1）`
  });

  const retreatLines = (ev) => {
    const out = [];
    // ★段階2＝動揺（2026-07-30）。仲間が倒れて一行が揺れる。
    //   ここで決まるのは「引こうとなった」までで、実際に退くかは段階4（at:"resolve"）が決める。
    if (ev.at === "emergency") {
      const cname = ev.causeName ?? "仲間";
      out.push(ev.causeTo === "戦闘不能"
        ? pick([`${cname}が倒れたのを見て、一行の動きが一瞬止まった。`, `${cname}が崩れ落ち、一行の足並みが乱れた。`])
        : pick([`${cname}の傷を見て、一行の動きが一瞬止まった。`, `${cname}の傷の深さに、一行の間に迷いがよぎった。`]));
      out.push(ev.retreat
        ? pick([`これ以上は人が保たない――誰かがそう口にした。`, `退こう、と誰かが言った。反論は出なかった。`])
        : pick([`それでも、荷馬車の前を空けるわけにはいかなかった。`, `誰も口には出さず、ただ持ち場に戻った。`]));
      return out;
    }
    // ★段階1＝接敵。挑まずに引き返す判断がここで下りる（負傷も報酬もなく帰る）。
    if (ev.at === "first") {
      if (!ev.retreat) {
        out.push(pick([
          `相手の数と構えを測り、押し切れると見て、一行は荷馬車の前に出た。`,
          `やれる、と誰かが短く言った。一行は荷馬車の前に並んだ。`
        ]));
        return out;
      }
      out.push(smokeHeld ? pick([
        `やり合う前に煙幕で視界を塞ぎ、一行は隊商を裏道へ回した。`,
        `数が多すぎると見て煙幕を焚き、隊商ごと道を変えた。`
      ]) : pick([
        `相手の構えを見て、これは自分たちの手には合わないと判断した。`,
        `倒し切る前にこちらが保たない――そう見て、一行は矛を収めた。`
      ]));
      return out;
    }
    // ★段階4＝相手を見て決める。撤退が成立するのはここだけ。
    // 条件2：毎ラウンド回るので、動きがないラウンドには何も書かない（「まだやれる」を並べない）。
    // 撤退に失敗したラウンドでは「退いた」と書かない（直後の失敗行が引き受ける）。
    if (ev.retreat && ev.succeeded === false) {
      return out;
    }
    if (ev.retreat) {
      out.push(smokeHeld ? pick([
        `これ以上は保たないと見て煙幕を焚き、${enemyN}の足が止まるうちに隊商を先へ急がせた。`,
        `煙が視界を塞ぐあいだに隊商を先に行かせ、一行は退いた。`
      ]) : pick([
        `これ以上は保たないと見て、隊商を先に行かせ、一行は退いた。`,
        `踏みとどまる限界だった。隊商を逃がし、一行は街道の外へ退いた。`
      ]));
      // 撤退成立時のみエルシーの囮（撤退フレーバー＝ダメージ・状態行ではない）。
      if (hasElsie) out.push(pick([
        `エルシーが${enemyN}の足元へ飛び込んで気を引き、一行が退く隙を作った。`,
        `エルシーが吠えながら囮になり、そのあいだに一行は街道の外へ逃れた。`
      ]));
    } else if (ev.afterShaken) {
      // ★「引こうとなったが留まった」。動揺と計算を分けた成果がここに出る。
      out.push(pick([
        `だが${enemyN}の動きが鈍くなっているのを見て、一行はもう一歩踏み込んだ。`,
        `退き際を探る目が、${enemyN}の崩れかけた構えに止まった。まだ押せる。`
      ]));
    }
    return out;
  };

  // ★論点4＝A（2026-07-30）。撤退まわりで「動いた瞬間」だけを書く。
  const voteLine = (ev) => (ev.milestone === "first"
    ? pick([`${ev.name}が、そろそろ引くべきだと口にした。`, `${ev.name}の目が、退路の方を一度だけ探った。`])
    : pick([`引くべきだという声が、いつのまにか半分を超えていた。`, `残るべきだと言う者は、もういなかった。`]));
  const faltererLine = () => pick([
    `${enemyN}の動きが目に見えて鈍くなった。`,
    `${enemyN}の息が上がり、間合いの詰め方が雑になってきた。`
  ]);
  const retreatFailedLine = () => pick([
    `退こうとしたが、${enemyN}は間合いを詰めてきた。引き際を見失い、戦いは続いた。`,
    `背を向けようとした一行に${enemyN}が食い下がり、退くことはできなかった。`,
    `退く合図は出たが、${enemyN}の追いが速く、隊列は街道に押し戻された。`
  ]);
  const supplyOutLine = (ev) => pick([
    `${ev.healerName}が、包帯はこれで最後だと短く告げた。`,
    `巻けるものは、もう残っていなかった。`
  ]);

  // victory時、最後の deal イベントをトドメ扱いにする。
  let killIndex = -1;
  if (battle.outcome === "victory") {
    for (let i = battle.events.length - 1; i >= 0; i--) {
      if (battle.events[i].type === "deal") { killIndex = i; break; }
    }
  }

  // エンジンはラウンド内を同時解決（与ダメ一括→被ダメ一括）で記録するため、
  // トドメ行（決着宣言）はイベント位置のまま出すと同ラウンドの被弾行より前に来てしまう。
  // 読み物としての決着は最後に置く：トドメ行だけ退避し、全戦闘行の末尾に付ける。
  // 戻り値は {kind, text} の配列。kind はログ行のCSSクラス（状態遷移行のみ色分け用の専用kind）。
  const lines = [];
  let finisher = null;
  battle.events.forEach((ev, i) => {
    if (ev.type === "deal") {
      if (i === killIndex) finisher = { kind: "action", text: finisherLine(ev) };
      else if (ev.crit) lines.push(critDealLine(ev));
      else lines.push({ kind: "action", text: dealLine(ev) });
    }
    else if (ev.type === "take") {
      // 変化のない削りは、そのラウンドの最初の1件の位置に集約行を1本だけ置く。
      if (isPlainTake(ev)) {
        const r = plainByRound[ev.round];
        if (r && r.firstIndex === i) lines.push({ kind: "action", text: attritionLine(r.total) });
      } else {
        lines.push(ev.crit ? critTakeLine(ev) : { kind: "action", text: takeLine(ev) });
      }
    }
    else if (ev.type === "heal") lines.push(healLine(ev));
    else if (ev.type === "status") { const s = statusLine(ev); if (s) lines.push(s); }
    else if (ev.type === "retreat") retreatLines(ev).forEach((l) => lines.push({ kind: "action", text: l }));
    else if (ev.type === "vote") lines.push({ kind: "action", text: voteLine(ev) });
    else if (ev.type === "enemy_falter") lines.push({ kind: "action", text: faltererLine() });
    else if (ev.type === "retreat_failed") lines.push({ kind: "action", text: retreatFailedLine() });
    else if (ev.type === "supply_out") lines.push({ kind: "action", text: supplyOutLine(ev) });
  });
  if (finisher) lines.push(finisher);
  return lines;
}

// 隊商捜索チェーン（護衛失敗の後日談）：斥候かエルシーがいれば手がかりを追える。

function generateCaravanSearchLogs(quest, party, adventurerItemIds, rng, context = {}) {
  const tensionValue = context.tensionValue ?? 50;
  const stage = context.stage ?? 1;
  const found = context.found ?? false;
  const pick = (list) => pickTensionOne(list, tensionValue, rng);
  const nm = (adv) => (adv ? getDisplayName(adv) : null);
  const scout = party.find((a) => a.job === "斥候" && isHumanAdventurer(a));
  const elsie = party.find((a) => a.id === "adv_elsie");
  const logs = [];

  logs.push(pick(stage === 1 ? [
    `隊商が消えた街道の外れへ、急ぎ引き返した。荷馬車の轍と争った跡が残っていた。`,
    `商人と荷が消えた場所には、踏み荒らされた土と壊れた木箱の欠片が散らばっていた。`
  ] : [
    `最後の手がかりを頼りに、もう一度街道の外れへ向かった。残された時間は多くない。`,
    `前回追い切れなかった轍の先を、もう一度たどり直した。`
  ]));

  if (scout) {
    logs.push(`${nm(scout)}は轍と足跡を読み、野盗が向かった方角を絞り込んだ。`);
  }
  if (elsie) {
    logs.push(pick([
      `エルシーは荷馬車の匂いが残る地面に鼻を押し当て、迷わず一方向へ進み始めた。`,
      `エルシーは低く唸りながら、野盗の匂いを追って茂みの奥へ進んだ。`
    ]));
  }
  if (!scout && !elsie) {
    logs.push(pick([
      `手がかりになりそうな跡はいくつかあったが、どれを追うべきか一行だけでは判断がつかなかった。`,
      `轍は途中で他の道と交わり、追うべき方向を絞り込めなかった。`
    ]));
  }

  logs.push(found ? pick([
    `やがて轍は一つの方角にまとまり、争った跡の先に荷馬車の影が見えた。`,
    `匂いと足跡が一致した先に、置き去りにされた荷馬車があった。`
  ]) : pick([
    `手がかりは途中で途切れ、それ以上は追い切れなかった。`,
    `轍も匂いも、途中で他の痕跡に紛れて見失った。`
  ]));

  return logs;
}

function steleRubbingOutcomeText(outcome, party, rng) {
  return questOutcomeText("quest_old_stele_rubbing", outcome, party, []);
}

function generateSteleRubbingLogs(quest, party, adventurerItemIds, rng, context = {}) {
  const itemIds = context.itemIds ?? getAllItemIds(adventurerItemIds);
  const weather = context.departConditions?.weather ?? "晴れ";
  const timeOfDay = context.departConditions?.timeOfDay ?? "昼";
  const tensionValue = context.tensionValue ?? 50;
  const pick = (list) => pickTensionOne(list, tensionValue, rng);
  const nm = (adv) => adv ? getDisplayName(adv) : null;
  const row = party.find((a) => a.id === "adv_row");
  const gadd = party.find((a) => a.id === "adv_gadd");
  const mina = party.find((a) => a.id === "adv_mina");
  const elne = party.find((a) => a.id === "adv_elne");
  const elsie = party.find((a) => a.id === "adv_elsie");
  const scout = findByTrait(party, "job", "斥候");
  const herbalist = findByTrait(party, "job", "薬草師");
  const careful = findByTrait(party, "personality", "慎重");
  const logs = [];

  const holderName = (itemId) => supplyItemHolderName(party, adventurerItemIds, itemId);

  logs.push(pick([
    `${quest.area}に着いた。石碑は旧街道の分岐から少し外れた場所に立っていた。`,
    `旧街道脇の石碑は、半分ほど苔に覆われていた。`
  ]));

  logs.push(pick([
    `文字は残っていたが、端の数文字は欠けて読めなかった。`,
    `石碑の表面は湿気を帯びており、苔の下に浅い刻みが隠れていた。`,
    `風化した文字の一部は、もう判読できないほど薄れていた。`
  ]));

  logs.push(pick([
    `拓本用の紙を当てる前に、石碑の向きと周囲の地面を確認した。`,
    `無理に削らないよう、読める範囲だけを写し取る方針で作業を始めた。`
  ]));

  const work = [];
  if (mina) work.push(`${nm(mina)}は石碑の向きと、旧街道の分岐を地図と照合した。`);
  else if (scout && isHumanAdventurer(scout)) work.push(`${nm(scout)}は石碑の位置と旧街道の分岐を確かめ、地図の記載と照合した。`);

  if (elne) work.push(`${nm(elne)}は苔を無理に削らず、読める部分だけを丁寧に写し取った。`);
  else if (herbalist && isHumanAdventurer(herbalist)) work.push(`${nm(herbalist)}は苔に触れすぎず、読める文字だけを拓本に写した。`);

  if (row) work.push(`${nm(row)}は紙が風でずれないよう、石碑の下側を押さえていた。`);
  else if (careful && isHumanAdventurer(careful)) work.push(`${nm(careful)}は紙の端を押さえ、風で拓本がずれないよう支えた。`);

  if (gadd) work.push(`${nm(gadd)}は「削った方が早い」と言いかけたが、石が崩れそうなのを見て黙って手を引いた。`);

  if (careful && isHumanAdventurer(careful) && !work.some((line) => line.includes(nm(careful)))) {
    work.push(`${nm(careful)}は欠けた文字を補わず、読める範囲だけを報告書に残すよう促した。`);
  }

  while (work.length > 3) work.splice(Math.floor(rng() * work.length), 1);
  work.forEach((line) => logs.push(line));

  if (elsie) {
    logs.push(pick([
      `エルシーは石碑の足元を嗅いでから、道の方を見て耳を立てた。`,
      `エルシーは拓本作業のあいだ、石碑のそばで伏せて待っていた。`,
      `エルシーは旧街道の分岐を見て、一度だけ低く唸った。`
    ]));
  }

  if (itemIds.includes("item_obs_sheet") && canUseItemInQuest(quest, "item_obs_sheet", weather)) {
    logs.push(`${holderName("item_obs_sheet")}は観察記録票に、石碑の位置と文字の欠け方だけを書き留めた。`);
  }
  if (itemIds.includes("item_map") && canUseItemInQuest(quest, "item_map", weather)) {
    logs.push(`${holderName("item_map")}は古地図で旧街道と石碑の位置を照合し、地名の読みを確かめた。`);
  }
  if (itemIds.includes("item_oilcase") && canUseItemInQuest(quest, "item_oilcase", weather)) {
    if (weather === "小雨" || weather === "雨") {
      logs.push(`油紙の手紙入れに写しをしまったため、小雨でも紙は濡れずに済んだ。`);
    } else {
      logs.push(`${holderName("item_oilcase")}は油紙の手紙入れに拓本とメモをしまい、湿気から守った。`);
    }
  }
  const isDim = timeOfDay === "夕方" || timeOfDay === "夜";
  if (itemIds.includes("item_lantern") && canUseItemInQuest(quest, "item_lantern", weather) && (isDim || weather === "霧")) {
    logs.push(`ランタンの光を斜めから当てると、昼には見えなかった浅い刻みが浮かび上がった。`);
  }
  if (itemIds.includes("item_bandage") && canUseItemInQuest(quest, "item_bandage", weather)) {
    logs.push(pick([
      `${holderName("item_bandage")}は風ではがれそうな紙の端を包帯で仮止めした。`,
      `${holderName("item_bandage")}は石に擦れた指に包帯を当て、作業を続けた。`
    ]));
  }
  if (itemIds.includes("item_whistle") && canUseItemInQuest(quest, "item_whistle", weather) && weather === "霧") {
    logs.push(`${holderName("item_whistle")}は霧の中でも合流できるよう、短く笛を吹いた。`);
  }
  if (itemIds.includes("item_pot") && canUseItemInQuest(quest, "item_pot", weather) && rng() < 0.35) {
    logs.push(`${holderName("item_pot")}は作業の合間に携帯鍋で薄いお湯を沸かし、冷えた手を温めた。`);
  }

  logs.push(pick([
    `拓本を乾かしながら、読めなかった箇所には何も書き足さなかった。`,
    `石碑の前に立ち直し、苔を削らなかったことだけをもう一度確かめた。`
  ]));

  return logs;
}

// ★ 夜道 v2 の本文（2026-09-13・EX-092）。**既存の戦闘ログは流用しない**——
//   `generateBattleLogs` は「薄暗い畑の中」など畑・納屋の語彙を持っているため。
//   固定文（ランタンが効いた瞬間）は抽選にしない。設計5「固定文を出して弱体化」に従う。
function generateNightLightDayLogs(quest, party, adventurerItemIds, rng) {
  const itemIds = getAllItemIds(adventurerItemIds);
  const hasMap = itemIds.includes("item_map") && canUseItemInQuest(quest, "item_map");
  const logs = [`昼の道には、人の足跡と荷車の跡が残っているだけだった。`];
  logs.push(lightInvestigationResponseText(party, false, itemIds.includes("item_lantern"), rng));
  if (hasMap) logs.push(`古地図と照らしても、道筋そのものに新しい変化は見つからなかった。`);
  logs.push(`依頼人は、やはり夜にだけ出るのだと言った。${partySubject(party)}は日が落ちてから出直すことにした。`);
  return logs;
}

// ★ v2 の対応行。v1 の `lightInvestigationResponseText` は流用しない——あちらは
//   「近づくかどうかを選べる」前提の文（深追いを避けた／次回に回した）で、
//   **遭遇が判断を経由しない v2 では本文が嘘になる**（実際に交戦しているのに「避けた」と書かれる）。
function nightLightResponseText(party, hasLantern, rng) {
  const stat = pickOne(["caution", "memory", "curiosity", "courage", "kindness"], rng);
  const adv = bestByTendency(party, stat);
  const name = getDisplayName(adv);
  if (hasLantern) {
    if (stat === "memory") return `${name}は光が届く範囲を測りながら、灯りの動きを書き留めた。`;
    if (stat === "caution") return `${name}は帰り道の轍から目を離さず、光の輪の縁を保った。`;
    if (stat === "curiosity") return `${name}は灯りの芯を覗き込もうとして、明かりごと半歩踏み込んだ。`;
    if (stat === "courage") return `${name}は明かりを掲げたまま前に出て、灯りとの間に立った。`;
    return `${name}は列の後ろまで光が届くように、ランタンの角度を直した。`;
  }
  if (stat === "memory") return `${name}は見えたものだけを頭の中で数えた。書き留める手元すら見えなかった。`;
  if (stat === "caution") return `${name}は帰り道の方角だけを頼りに、後ろへ下がる足場を探した。`;
  if (stat === "curiosity") return `${name}は灯りの形を見極めようとしたが、輪郭は近づくほどほどけていった。`;
  if (stat === "courage") return `${name}は一歩前に出たが、足元が見えないためそこで止まった。`;
  return `${name}は仲間の位置を声で確かめながら、暗がりの中で列を保った。`;
}

function generateNightLightBattleLogs(quest, party, adventurerItemIds, rng, context = {}) {
  const logs = [];
  const itemIds = context.itemIds ?? getAllItemIds(adventurerItemIds);
  // ★ 判定は `battleWeakenedBy`（敵の弱体化）と同じ「持っているか」だけにする（2026-09-13・EX-092）。
  //   `canUseItemInQuest` を重ねると、許可リストからランタンを外したときに
  //   **本文は「手元に明かりはなく」なのに敵だけ弱くなる**という食い違いが起きる。
  const hasLantern = itemIds.includes("item_lantern");
  const battleOutcome = context.battleOutcome ?? "victory";

  logs.push(`夜道の先に、小さな灯りが一つ浮かんで見えた。`);
  // ★ 遭遇は判断を経由しない（battleAmbush）。近づいたのではなく、灯りの方が距離を詰めてくる。
  logs.push(`足を止める間もなく、灯りは${partySubject(party)}との距離を詰めてきた。`);
  if (hasLantern) {
    // ★ 固定文。弱体化が効いた回には必ず出る（抽選にしない）。
    logs.push(`${supplyItemHolderName(party, adventurerItemIds, "item_lantern")}がランタンを高く掲げた。光の輪の縁で、灯りは一度だけ身を縮めた。`);
  } else {
    logs.push(`手元に明かりはなく、灯りがどこまで近いのかも測れなかった。`);
  }
  logs.push(nightLightResponseText(party, hasLantern, rng));
  if (battleOutcome === "victory") {
    // ★ ランタンなしで押し切った回だけの1行（2026-09-13・EX-092）。これが無いと、
    //   唯一の行動描写が「後ろへ下がる足場を探した」のまま勝ってしまい、設計6の山場が消える。
    if (!hasLantern) logs.push(`明かりが無いまま、${partySubject(party)}は灯りの方へ踏み込んだ。暗がりは、もう足を止める理由にならなかった。`);
    logs.push(`灯りはしばらく揺れたあと、道の曲がり角の向こうで消えた。`);
  }
  return logs;
}

// ★ 支給品が実際に効いた id を工程の events から拾う（2026-08-04・EX-050）。
//   ハイライトの判定に使う。持っているだけで「使う場面があった」と書くと本文と食い違う。
function effectiveItemIds(fw) {
  if (!fw || !Array.isArray(fw.events)) return [];
  return [...new Set(fw.events.map((ev) => ev.itemId).filter(Boolean))];
}

// ★ 戦闘経路の同じもの（2026-08-04・EX-052）。EX-050 と同じ形で、報告書に実際に
//   出た支給品だけを返す。判定に効く quest.battleEffectiveItemIds とは別概念なので流用しない
//   （あちらは「撤退の判断に効く」で、持っているだけで効く）。
function effectiveBattleItemIds(battle) {
  if (!battle || !Array.isArray(battle.events)) return [];
  const ids = new Set();
  // 手当て＝包帯1消費。events に heal があるときだけ報告書に包帯の行が出る。
  if (battle.events.some((ev) => ev.type === "heal")) ids.add("item_bandage");
  // 煙幕は退くときに焚いたときだけ本文に出る（generateCaravanBattleDramaLog と同じ条件）。
  if (battle.smoke?.held && (battle.outcome === "withdraw_first" || battle.outcome === "withdraw_emergency")) {
    ids.add("item_smoke");
  }
  return [...ids];
}

// usedItemIds：実際に効いた支給品。配列で渡されたときだけ、支給品のハイライトを
// 「効いたときだけ」に絞る（2026-08-04・EX-050）。渡されない経路は従来どおり。
function generateHighlight(quest, party, itemIds, departConditions, result, rng, usedItemIds = null) {
  const itemWorked = (itemId) =>
    itemIds.includes(itemId) && (usedItemIds === null || usedItemIds.includes(itemId));
  const subject = partySubject(party);
  const isNight = departConditions?.timeOfDay === "夜";
  const isBattle = quest.category === "戦闘";
  const isInvestigation = quest.category === "調査";
  const humans = humanMembers(party);
  const pool = humans.length > 0 ? humans : party;

  // 武器・アクセサリー候補を先に準備する
  const front = pool.reduce((best, a) => (a.tendencies?.courage ?? 0) > (best.tendencies?.courage ?? 0) ? a : best, pool[0]);
  const frontName = getDisplayName(front);
  const frontWeapon = front.weapon ?? null;
  // アクセサリー持ちをランダムに1人取得
  const accAdvs = pool.filter((a) => a.accessory);
  const accAdv = accAdvs.length > 0 ? accAdvs[Math.floor(rng() * accAdvs.length)] : null;
  const accName = accAdv ? getDisplayName(accAdv) : null;
  const acc = accAdv?.accessory ?? null;
  // 執着持ちをランダムに1人取得
  const obsAdvs = pool.filter((a) => a.obsession);
  const obsAdv = obsAdvs.length > 0 ? obsAdvs[Math.floor(rng() * obsAdvs.length)] : null;
  const obsName = obsAdv ? getDisplayName(obsAdv) : null;
  const obs = obsAdv?.obsession ?? null;

  if (quest.id === "quest_old_bridge_repair") {
    const row = party.find((a) => a.id === "adv_row");
    const rowName = row ? getDisplayName(row) : null;
    const lines = [
      `古い小橋は、少なくとも今夜は誰も落とさずに済みそうだ。`,
      `修理済みの板には、まだ新しい足跡が一つだけ残っていた。`
    ];
    if (rowName) lines.push(`${rowName}は最後にもう一度だけ橋板を踏み、沈まないことを確かめてから帰還した。`);
    return pickOne(lines, rng);
  }

  if (quest.id === "quest_herb_delivery") {
    const elne = party.find((a) => a.id === "adv_elne");
    const elneName = elne ? getDisplayName(elne) : null;
    const lines = [
      `薬草包みは、最後までほどけなかった。`,
      `診療所の受領印は、少し滲んでいたが確かに押されていた。`
    ];
    if (elneName) lines.push(`${elneName}は納品が終わるまで、一度も包みから目を離さなかった。`);
    return pickOne(lines, rng);
  }

  if (quest.id === "quest_missing_herbalist") {
    const mina = party.find((a) => a.id === "adv_mina");
    const minaName = mina ? getDisplayName(mina) : null;
    const lines = [
      `エルシーが立ち止まった草むらの先に、落とした薬草袋があった。`,
      `報告書には、無事という二文字がいつもより大きく見えた。`
    ];
    if (minaName) lines.push(`${minaName}は最後まで足跡を見失わなかった。`);
    if (result === "発見" || result === "保護") lines.push(`帰還した時、薬草採りは自分の袋だけは離さず持っていた。`);
    return pickOne(lines, rng);
  }

  if (quest.id === "quest_evening_market_escort") {
    const row = party.find((a) => a.id === "adv_row");
    const rowName = row ? getDisplayName(row) : null;
    const lines = [
      `何も起きなかった。それが今回の一番良い報告だった。`,
      `帰宅した子どもは、眠そうにしながらも買い物袋だけは離さなかった。`
    ];
    if (rowName) lines.push(`${rowName}は最後まで、親子より半歩前を歩いていた。`);
    if (partyHasElsie(party)) lines.push(`エルシーは家の門につくまで、子どもの歩幅に合わせて何度も振り返った。`);
    return pickOne(lines, rng);
  }

  if (quest.id === "quest_old_stele_rubbing") {
    const elne = party.find((a) => a.id === "adv_elne");
    const elneName = elne ? getDisplayName(elne) : null;
    const lines = [
      `読めなかった文字を、読めないまま残した。それも記録だ。`,
      `拓本には、今は使われていない地名が一つだけ残っていた。`,
      `石碑はまだそこにある。報告書には、そう書かれていた。`
    ];
    if (elneName) lines.push(`${elneName}は最後まで、欠けた文字を勝手に補わなかった。`);
    return pickOne(lines, rng);
  }

  // ★ 夜道 v2 専用（2026-09-13・EX-092）。結末ごとに書き分ける——
  //   ここを汎用分岐に任せると、押し戻された回に「無事に戻ってきた」が出る。
  if (quest.id === "quest_lingering_light") {
    const tier = GROWTH_TIER_BY_RESULT[result] ?? "full";
    if (result === "昼に灯りは出ず") {
      const lines = [
        `昼の道はただの道だった。${subject}は日が落ちるのを待つことにした。`,
        `依頼人の言うとおり、昼には何も出なかった。それ自体が一つの記録になった。`
      ];
      return pickOne(lines, rng);
    }
    if (tier === "fail") {
      const lines = [
        `灯りは近づくほど遠ざかり、${subject}は道の外まで押し戻された。`,
        `明かりのない夜道で、距離も方角も測れなかった。それが今回分かったすべてだ。`
      ];
      if (obs) lines.push(`${obsName}【${obs.label}】— ${obs.idleLine}`);
      return pickOne(lines, rng);
    }
    if (tier === "partial") {
      const lines = [
        `${subject}は灯りに背を向けた。逃げたのではなく、今日はここまでだと決めた。`,
        `灯りは道に残ったままだ。見た、という事実だけを持ち帰った。`
      ];
      if (obs) lines.push(`${obsName}【${obs.label}】— ${obs.idleLine}`);
      return pickOne(lines, rng);
    }
    const lines = [
      `灯りが消えるまでの数秒を、${subject}は最後まで見ていた。`,
      `${frontName}は灯りの前から動かなかった。正体は分からないままだが、道は元に戻った。`
    ];
    if (acc) lines.push(`${accName}の${acc.name}は、夜の遠征でもいつも通りそこにあった。`);
    if (obs) lines.push(`${obsName}【${obs.label}】— ${obs.positiveLine}`);
    return pickOne(lines, rng);
  }

  // 夜の戦闘・調査依頼
  if (isNight && (isBattle || isInvestigation)) {
    // ★ 失敗した回に「無事に戻ってきた」を出さない（2026-09-13・EX-092）。
    //   この分岐は結末を見ていなかったので、夜の敗北でもこの1文が出ていた——実測で
    //   **夜の敗北・膠着 102件のうち 25件（24.5%）**。報告書に嘘を書かないのは隊商護衛で
    //   既に通した基準（2026-08-04・EX-052）で、ここだけ外れていた。
    //   ★ 判定は依頼データ由来（`quest.outcomes` のどの段に載っている結末か）で、新しい表は増やさない。
    //   ★ 2026-09-13 に「fail のときだけ」から「完遂できた回だけ」に広げた——中止（部分）の回にも
    //     この1行が出ており、昼の分岐を同じ形に直したときに夜だけ緩いままになっていた。
    const done = (GROWTH_TIER_BY_RESULT[result] ?? "full") === "full";
    const lines = [
      `夜の${quest.area}から戻った${subject}は、言葉を選ぶように報告書を書いた。`
    ];
    lines.push(done
      ? `夜に向かい、無事に戻ってきた。それだけで、今夜は十分だ。`
      : `夜の${quest.area}に、やり残したものがある。${subject}はそれを書いてから筆を置いた。`);
    if (frontWeapon) lines.push(`${frontName}は${frontWeapon.name}を手に夜道へ向かった。帰還したとき、それは少し傷ついていた。`);
    if (acc) lines.push(`${accName}の${acc.name}は、夜の遠征でもいつも通りそこにあった。`);
    // 執着：idleLine（夜の静けさに合う）
    if (obs) lines.push(`${obsName}【${obs.label}】— ${obs.idleLine}`);
    return pickOne(lines, rng);
  }

  // 戦闘依頼（夜以外）
  if (isBattle) {
    // ★ 結末を見る（2026-09-13・EX-092）。以前は `result === "討伐"` だけで討伐／追い払いを
    //   見分けており、**中止・失敗の回にも「追い払いは成功した」「それで十分だった」が出ていた**
    //   （実測で 討伐中止 33.2%／討伐失敗 31.3%）。隊商護衛で通した「報告書に嘘を書かない」
    //   （2026-08-04・EX-052）がここだけ外れていた。
    //   ★ 成否の判定は依頼データ由来（`quest.outcomes`）で、新しい表は増やさない。
    const done = (GROWTH_TIER_BY_RESULT[result] ?? "full") === "full";
    const isDefeat = result === "討伐";
    const lines = [
      `${frontName}は怯まず前に出た。それが今回の遠征で一番はっきりしたことだ。`
    ];
    if (done) {
      lines.push(isDefeat ? `「なにか」は仕留められた。ただし正体は、まだ誰も知らない。` : `追い払いは成功した。ただし正体は、まだ誰も知らない。`);
    } else {
      lines.push(`「なにか」は${quest.area}に残ったままだ。正体も、まだ誰も知らない。`);
    }
    if (frontWeapon) {
      lines.push(`${frontName}は${frontWeapon.name}を構え、${quest.area}の入口から最後まで動かなかった。`);
      if (done) {
        lines.push(isDefeat
          ? `${frontWeapon.name}が「なにか」の動きを止めた。それで十分だった。`
          : `${frontWeapon.name}が「なにか」の退路を${quest.area}の外へ向けた。それで十分だった。`);
      } else {
        lines.push(`${frontWeapon.name}は届かなかった。${quest.area}の入口から先へは進めていない。`);
      }
    }
    if (acc) lines.push(`${accName}の${acc.name}は、帰還後もしばらくその手元にあった。`);
    // 執着：positiveLine（行動として出た面）
    if (obs) lines.push(`${obsName}【${obs.label}】— ${obs.positiveLine}`);
    return pickOne(lines, rng);
  }

  // ★ 調査依頼「森の際に出た見慣れない草の確認」の専用分岐（2026-09-15・EX-108 の裁定）。
  //   ★ 汎用の調査文が「書面の情報より少し違っていた」＝**前情報がある前提**で、
  //     **前情報のない任務**というこの依頼の主眼と噛み合わないため、専用に分けた。
  //   ⚠️ 夜に出した回は上の「夜の戦闘・調査依頼」が先に返す（他の調査依頼と同じ扱い）。
  //   ★ 未達（引き返し）の回は別の2文にする（2026-09-16・EX-109 の裁定1）。**未達でも「書く」ことは
  //     起きている**ので、書けなかったことを書けなかったと書く側へ振る。判定は依頼データ由来の段
  //     （`GROWTH_TIER_BY_RESULT`）で、夜の分岐・戦闘の分岐と同じ形。新しい表は増やさない。
  //   ★ アクセサリー・執着の行は他の分岐と同じ形で足す（2026-09-16・EX-109 の裁定3）。
  if (quest.id === "quest_unknown_grass") {
    const failed = (GROWTH_TIER_BY_RESULT[result] ?? "full") === "fail";
    const lines = failed
      ? [
          `${subject}は草に触れないまま引き返した。見た形だけが手元に残っている。`,
          `確かめられなかったことを、確かめられなかったと書いた。`
        ]
      : [
          `${subject}は見たままを書いた。知っている草に似せて書かない、と決めていた。`,
          `報告書には名前が書かれていない。書けなかったのではなく、まだ無い。`
        ];
    if (acc) lines.push(`${accName}の${acc.name}が、調査の間ずっとそこにあった。小さなものが判断を支えることがある。`);
    if (obs) lines.push(`${obsName}【${obs.label}】— ${rng() < 0.5 ? obs.positiveLine : obs.idleLine}`);
    return pickOne(lines, rng);
  }

  // 調査依頼（夜以外）
  if (isInvestigation) {
    const lines = [
      `現地で確かめたことは、書面の情報より少し違っていた。それが今回の収穫だ。`,
      `調査は完了した。次に来るとき、また何かが変わっているかもしれない。`
    ];
    if (acc) lines.push(`${accName}の${acc.name}が、調査の間ずっとそこにあった。小さなものが判断を支えることがある。`);
    // 執着：positiveLine / idleLine どちらか
    if (obs) lines.push(`${obsName}【${obs.label}】— ${rng() < 0.5 ? obs.positiveLine : obs.idleLine}`);
    return pickOne(lines, rng);
  }

  // 支給品が役立った
  if (itemWorked("item_lantern") && isNight) {
    return `ランタンが暗がりで役立った。灯りがなければ、別の結果になっていたかもしれない。`;
  }
  if (itemWorked("item_bandage")) {
    return pickOne([
      `包帯を使う場面があった。大事には至らなかったが、持っていてよかった。`,
      `あの包帯がなかったら、帰りはもう少し遅くなっていただろう。`
    ], rng);
  }
  if (itemWorked("item_oilcase")) {
    return `油紙の手紙入れのおかげで、依頼の書類は濡れずに済んだ。`;
  }

  // 悪天候
  if (departConditions?.weather === "小雨" || departConditions?.weather === "霧") {
    return pickOne([
      `足元の悪い中での遠征だった。それでも${subject}は、予定の仕事を終えた。`,
      `${departConditions.weather}の中、${subject}は出かけた。帰還したとき、服はまだ乾いていなかった。`
    ], rng);
  }

  // 結果別
  if (result === "成功" || result === "調査成功") {
    const lines = [
      `依頼は成功した。こういう積み重ねが、${subject}の評判をつくっていく。`,
      `問題なく完了した。報告書が棚に増えるのは、悪いことではない。`
    ];
    if (acc && rng() < 0.40) lines.push(`${accName}の${acc.name}が目に入った。今回も、その小さな頼りを信じていたのかもしれない。`);
    // 執着：低確率で positiveLine
    if (obs && rng() < 0.35) lines.push(`${obsName}【${obs.label}】— ${obs.positiveLine}`);
    return pickOne(lines, rng);
  }

  // 汎用フォールバック
  const fallback = [
    `今回の遠征で、${subject}はまた少し、この仕事を覚えた。`,
    `報告書が棚に収まった。${subject}の記録が、また一つ増えた。`,
    `遠征は終わった。次の依頼が、すでに掲示板に張り出されている。`
  ];
  if (acc && rng() < 0.30) fallback.push(`${accName}の${acc.name}は、今回も変わらずそこにあった。`);
  // 執着：低確率で idleLine（何もない道での癖として）
  if (obs && rng() < 0.30) fallback.push(`${obsName}【${obs.label}】— ${obs.idleLine}`);
  return pickOne(fallback, rng);
}

// --- 新規依頼追加用ヘルパー（既存依頼ブロックは未使用） ---

function buildSupplyDescLines(party, adventurerItemIds) {
  return party.map((adv) => {
    const advItems = getAdvItemIds(adventurerItemIds, adv.id).map((iId) => getItem(iId)?.name).filter(Boolean);
    return advItems.length > 0 ? `${getDisplayName(adv)}：${advItems.join("・")}` : null;
  }).filter(Boolean);
}

function defaultNewQuestRoleNote(quest, adv) {
  const category = quest.category;
  if (category === "保全") {
    if (adv.job === "戦士") return "足場と板の交換で";
    if (adv.job === "見習い盾役") return "周囲からの確認で";
    if (adv.job === "斥候") return "巡回と通行確認で";
    if (adv.job === "薬草師") return "手当と片付けで";
    if (adv.personality === "慎重") return "丁寧な確認で";
    return "作業補助で";
  }
  if (category === "輸送") {
    if (adv.job === "薬草師") return "包みの管理で";
    if (adv.job === "斥候") return "道順と宛先確認で";
    if (adv.job === "見習い盾役") return "足場確認で";
    if (adv.job === "戦士") return "荷運びで";
    if (adv.personality === "慎重") return "丁寧な運搬で";
    return "輸送補助で";
  }
  if (category === "捜索") {
    if (adv.job === "斥候") return "足跡追跡で";
    if (adv.job === "薬草師") return "痕跡判断で";
    if (adv.job === "見習い盾役") return "帰路確認で";
    if (adv.job === "戦士") return "呼びかけと支援で";
    if (adv.personality === "慎重") return "慎重な捜索で";
    return "捜索補助で";
  }
  if (category === "護衛") {
    if (adv.job === "見習い盾役") return "前衛と足場確認で";
    if (adv.job === "斥候") return "道選びで";
    if (adv.job === "戦士") return "荷物運搬で";
    if (adv.job === "薬草師") return "気配りと付き添いで";
    if (adv.personality === "慎重") return "安全な道選びで";
    return "護衛補助で";
  }
  if (category === "記録") {
    if (adv.job === "薬草師") return "拓本と乾燥確認で";
    if (adv.job === "斥候") return "周囲警戒で";
    if (adv.personality === "慎重") return "丁寧な記録で";
    return "記録補助で";
  }
  if (category === "生活") {
    if (adv.personality === "世話焼き") return "気配りと補助で";
    if (adv.personality === "慎重") return "丁寧な確認で";
    if (adv.personality === "豪胆") return "力仕事で";
    return "一員として";
  }
  if (category === "戦闘") {
    if (adv.tendencies?.courage >= 4) return "前に出る判断で";
    if (adv.tendencies?.caution >= 4) return "慎重な距離取りで";
    if (adv.tendencies?.kindness >= 4) return "周囲への気配りで";
    return "戦闘に";
  }
  if (category === "調査") {
    if (adv.tendencies?.caution >= 4) return "慎重な距離取りで";
    if (adv.tendencies?.memory >= 4) return "記録役として";
    if (adv.tendencies?.kindness >= 4) return "周囲への気配りで";
    return "調査に";
  }
  if (adv.job === "斥候") return "確認役として";
  if (adv.job === "薬草師") return "採集と手当で";
  if (adv.job === "戦士") return "荷運びと警戒で";
  if (adv.personality === "慎重") return "丁寧な確認で";
  return "一行の一員として";
}

function buildSafeAdventurerHistoryLines(party, quest, context = {}) {
  const resultLabel = context.result ?? context.resultLabel ?? "";
  const elsieRoleNote = context.elsieRoleNote ?? (quest.category === "護衛" ? "鼻と付き添いで" : "鼻と警戒で");
  const roleNoteFor = context.roleNoteFor ?? ((adv) => defaultNewQuestRoleNote(quest, adv));
  const lines = {};
  party.forEach((adv) => {
    const displayName = getDisplayName(adv);
    const roleNote = adv.id === "adv_elsie" ? elsieRoleNote : roleNoteFor(adv);
    lines[adv.id] = `${quest.title}：${resultLabel}。${displayName}は${roleNote}記録に残った。`;
  });
  return lines;
}

function finalizeQuestReport(options) {
  const {
    expedition,
    quest,
    party,
    logs,
    result,
    summary,
    historyLine,
    adventurerHistoryLines,
    departConditions = expedition.departTimeOfDay
      ? { timeOfDay: expedition.departTimeOfDay, weather: expedition.departWeather }
      : null,
    adventurerItemIds = expedition.adventurerItemIds ??
      Object.fromEntries((expedition.itemIds ?? []).map((iId, i) => [expedition.adventurerIds[i] ?? `anon_${i}`, iId])),
    itemIds = getAllItemIds(
      expedition.adventurerItemIds ??
        Object.fromEntries((expedition.itemIds ?? []).map((iId, i) => [expedition.adventurerIds[i] ?? `anon_${i}`, iId]))
    ),
    observationNotes, // ★ 既定を置かない（undefined＝「渡されなかった」と区別するため。2026-09-15・EX-105）
    hiddenTags = {},
    highlight = null,
    tensionValue = null,
    tensionLevel = null,
    rng = null,
    wrapElsie = false,
    usedItemIds = null
  } = options;

  // ★ 観察記録は**渡されなかったら生成する**（2026-09-15・EX-105）。
  //   既定を null にしていたせいで、この関数を使う3つの分岐（教会巡回・隊商護衛・捜索チェーン）は
  //   **観察対象を付けた瞬間に記録が1行も出ないまま黙って通る**状態だった。
  //   意図して出さないときは `observationNotes: null` を**明示的に**渡し、理由を添える。
  const resolvedObservationNotes = observationNotes !== undefined
    ? observationNotes
    : (rng ? generateObservationNotes(quest, party, adventurerItemIds, rng) : null);

  const report = {
    id: `report_${Date.now()}`,
    questId: quest.id,
    adventurerIds: expedition.adventurerIds,
    adventurerItemIds,
    itemIds,
    opened: false,
    applied: false,
    result,
    summary,
    historyLine,
    adventurerHistoryLines: adventurerHistoryLines ?? {},
    logs,
    observationNotes: resolvedObservationNotes,
    departConditions,
    highlight: highlight ?? (rng ? generateHighlight(quest, party, itemIds, departConditions, result, rng, usedItemIds) : null),
    hiddenTags: {
      recordDensityGain: 1 + logs.length,
      ...hiddenTags
    },
    createdAt: new Date().toISOString()
  };

  if (tensionValue != null) report.tensionValue = tensionValue;
  if (tensionLevel != null) report.tensionLevel = tensionLevel;

  if (wrapElsie && rng) return withElsieLog(report, quest, party, rng);
  return report;
}

// 定型報告書の文面（2026-08-18・EX-064）。★ 文はチャット側が書いたもので、ここでは変えない。
//   ★ 抽選をしない（乱数を1つも引かない）。だからシード・天候・時間帯を変えても同じ報告書になる。
// 可変トークン：{参加者}＝記録係＋出した冒険者＋エルシーの名前列／{記録係}／{エルシー}／
//   historyPerAdventurer の {名前}＝その冒険者の表示名。
const RECEPTIONIST_REPORT_TEMPLATE = {
  logs: [
    { kind: "", text: "本日は遠征をお休みして、ギルドの大掃除を行いました。記録は僭越ながら、私がつけております。" },
    { kind: "", text: "参加してくださったのは、{参加者}のみなさんです。" },
    { kind: "action", text: "窓を開け、床を掃き、掲示板の古い貼り紙を剥がしました。机の下からは、失くしたはずのペン先がふたつ出てきました。" },
    { kind: "action", text: "書棚の埃を払い、依頼書の綴りを年の順に並べ直しました。インク壺はみんなで磨いたので、どれも新品のように光っています。" },
    { kind: "drama", text: "{エルシー}は雑巾を運ぶお手伝いをしてくれましたが、途中から陽だまりで眠ってしまいました。起こさないように、その一角だけ最後に掃除しました。" },
    { kind: "drama", text: "{記録係}さんは高いところの拭き掃除を引き受けてくださいました。いつも机で書いてばかりのあなたの、良い気分転換になっていたら嬉しいです。" },
    { kind: "afterglow", text: "綺麗になったホールは、少しだけ広く見えます。明日からまた、ここで皆さんの帰りをお待ちします。" }
  ],
  // ★ 結末ラベルは依頼データの outcomes.full と同じ語にする（履歴・段階の判定が同じ表を見るため）。
  result: "おつかれさまでした",
  summary: "ギルドの大掃除。今日だけは、受付嬢が記録をつけました。",
  historyLine: "ギルドの大掃除が行われた。記録は受付嬢の手による。",
  historyPerAdventurer: "{名前}はギルドの掃除に加わった。",
  highlight: "報告書を書く側ではなく、書かれる側になった一日。"
};

function generateReport(expedition) {
  const quest = getQuest(expedition.questId);
  const party = expedition.adventurerIds.map(getAdventurer).filter(Boolean);
  const departConditions = expedition.departTimeOfDay
    ? { timeOfDay: expedition.departTimeOfDay, weather: expedition.departWeather }
    : null;
  // adventurerItemIds: 新形式。旧形式（itemIds配列）はアドベンチャラー順に割り当てて互換。
  const adventurerItemIds = expedition.adventurerItemIds ??
    Object.fromEntries((expedition.itemIds ?? []).map((iId, i) => [expedition.adventurerIds[i] ?? `anon_${i}`, iId]));
  // 新形式 [id1, id2] と旧形式 "id" の両方に対応して平坦化
  const itemIds = getAllItemIds(adventurerItemIds);
  const items = itemIds.map(getItem).filter(Boolean);
  const rng = makeRng(expedition.seed + state.worldState.totalExpeditions * 37 + state.reports.length * 101);
  const tensionValue = quest.tensionBase != null ? computeTensionValue(quest, rng) : null;
  const tensionLevel = tensionValue != null ? tensionToLevel(tensionValue) : null;
  const tensionMeta = tensionLevel != null ? { tensionValue, tensionLevel } : {};
  const logs = [];
  const add = (kind, text) => logs.push({ kind, text });

  // ── 定型報告書（2026-08-18・EX-064）─────────────────────────────────────
  // ★ 本作で唯一、書き手が受付嬢になる例外。データの旗（fixedReport / reportAuthor）で分岐し、
  //   id のハードコードでは分岐しない。語彙の判定・工程エンジン・担い手の選出・緊張度・
  //   presence／掛け合い／成長ログのどれも使わない。文は定型で、可変部は参加者の名前だけ。
  if (quest.fixedReport) {
    // 参加者＝記録係＋出した冒険者＋エルシー。★ エルシーはギルド犬＝ギルドに常駐しているので、
    //   編成に入れていなくても名を連ねる（入れていれば重複させない）。
    const keeperName = state.player?.name ?? "記録係";
    const elsieName = getDisplayName(getAdventurer("adv_elsie") ?? { name: "エルシー" });
    const humanNames = party.filter((a) => isHumanAdventurer(a)).map((a) => getDisplayName(a));
    const participantNames = [keeperName, ...humanNames, elsieName].join("、");

    // ★★ 文面はチャット側が書く（EX-064・停止中）。下の各行は「差し替え待ちの印」であって仮文ではない。
    //   構造：{ kind, text } の配列。text の中の {参加者}｛記録係}{エルシー} を実名に置き換える。
    const template = RECEPTIONIST_REPORT_TEMPLATE;
    const fill = (text) => text
      .replaceAll("{参加者}", participantNames)
      .replaceAll("{記録係}", keeperName)
      .replaceAll("{エルシー}", elsieName);
    template.logs.forEach((line) => add(line.kind, fill(line.text)));

    const adventurerHistoryLines = {};
    party.forEach((adv) => {
      adventurerHistoryLines[adv.id] = fill(template.historyPerAdventurer).replaceAll("{名前}", getDisplayName(adv));
    });

    return {
      id: `report_${Date.now()}`,
      questId: quest.id,
      adventurerIds: expedition.adventurerIds,
      adventurerItemIds,
      itemIds,
      opened: false,
      applied: false,
      result: template.result,
      summary: fill(template.summary),
      historyLine: fill(template.historyLine),
      adventurerHistoryLines,
      logs,
      // ★ 定型報告書には観察記録を足さない（2026-08-18・EX-064。文は定型で、可変は名前だけ）。
      //   ここが null なのは**意図**（2026-09-15・EX-105 で確認）。
      observationNotes: null,
      departConditions,
      highlight: fill(template.highlight),
      hiddenTags: { fixedReport: true, reportAuthor: quest.reportAuthor ?? null, recordDensityGain: 1 + logs.length },
      createdAt: new Date().toISOString()
    };
  }

  // ★ 夜道 v2（2026-09-13・EX-092）：昼は空振り、夜は交戦。
  //   ★ v1 の特殊裁定（outcomeOverride）は使わない。夜は通常の戦闘計算に乗せる。
  if (quest.id === "quest_lingering_light") {
    const departTimeOfDay = expedition.departTimeOfDay ?? "昼";
    const isNight = departTimeOfDay === "夜";

    if (!isNight) {
      const dayInfo = questOutcomeText(quest.id, "daylight", party, itemIds);
      const dayLogs = generateNightLightDayLogs(quest, party, adventurerItemIds, rng);
      dayLogs.forEach((text, index) => add(index === dayLogs.length - 1 ? "afterglow" : "action", text));
      return withElsieLog({
        id: `report_${Date.now()}`,
        questId: quest.id,
        adventurerIds: expedition.adventurerIds,
        adventurerItemIds,
        itemIds,
        opened: false,
        applied: false,
        result: dayInfo.result,
        summary: dayInfo.summary,
        historyLine: dayInfo.history,
        adventurerHistoryLines: buildSafeAdventurerHistoryLines(party, quest, {
          result: dayInfo.result,
          elsieRoleNote: "鼻と警戒で",
          roleNoteFor: () => "昼の確認に"
        }),
        logs,
        // ★ 昼は灯りが出ないので観察対象がいない。ここが null なのは**意図**（2026-09-15・EX-105 で確認）。
        observationNotes: null,
        departConditions,
        highlight: generateHighlight(quest, party, itemIds, departConditions, dayInfo.result, rng),
        // ★ 昼は交戦しないので combat を育てない（2026-09-13・EX-093 の裁定1）。
        //   「伸びる stat ＝ 使う stat」（2026-08-01 確定）。**無傷・10分で戦闘値が育つ経路を作ると、
        //   夜に挑まず昼を回すのが最適になり、設計6（育成で越える）が空洞化する。**
        hiddenTags: { investigation: true, timeOfDay: departTimeOfDay, daylightMiss: true, growthStats: ["investigation"], recordDensityGain: 1 + logs.length },
        ...tensionMeta,
        createdAt: new Date().toISOString()
      }, quest, party, rng);
    }

    const battle = simulateBattle(quest, party, itemIds, rng);
    const battleOutcome = battle ? battle.outcome : "victory";
    const missingIds = battleMissingIds(battle, party);
    const outcomeInfo = questBattleOutcomeText(quest, battleOutcome, party);
    const questLogs = generateNightLightBattleLogs(quest, party, adventurerItemIds, rng, { itemIds, departConditions, battleOutcome });
    const dramaLines = [
      ...generateSimpleBattleDramaLog(battle, party, rng),
      ...battleDefenseHighlights(battle, party, rng),
      ...unusedSupplyLines(battle, party, adventurerItemIds, rng)
    ];
    if (battleOutcome === "victory") {
      questLogs.forEach((text, index) => {
        if (index === questLogs.length - 1) {
          dramaLines.forEach((line) => add(line.kind, line.text));
          add("afterglow", text);
        } else {
          add("action", text);
        }
      });
    } else {
      questLogs.forEach((text) => add("action", text));
      dramaLines.forEach((line) => add(line.kind, line.text));
      if (missingIds.length > 0) add("drama", missingLineText(missingIds, party));
      add("action", outcomeInfo.line);
      add("afterglow", outcomeInfo.after);
    }

    // ★ 夜は必ず観察記録が残る。**これが v2 の主眼**——v1 は「確認のみ」で生態目録に残っていたのに、
    //   段階1で引き返す形にすると残らなくなる（`withdraw_first` は観察記録を落とす）。
    //   battleAmbush で段階1を経ないので、押し戻された回でも灯りは見ている。
    const observationNotes = generateObservationNotes(quest, party, adventurerItemIds, rng);
    return withElsieLog({
      id: `report_${Date.now()}`,
      questId: quest.id,
      adventurerIds: expedition.adventurerIds,
      adventurerItemIds,
      itemIds,
      opened: false,
      applied: false,
      result: outcomeInfo.result,
      summary: outcomeInfo.summary,
      historyLine: outcomeInfo.history,
      adventurerHistoryLines: buildSafeAdventurerHistoryLines(party, quest, {
        result: outcomeInfo.result,
        elsieRoleNote: "鼻と警戒で",
        roleNoteFor: (adv) =>
          adv.tendencies?.courage >= 4 ? "前に出る判断で" : adv.tendencies?.caution >= 4 ? "慎重な距離取りで" : adv.tendencies?.memory >= 4 ? "記録役として" : "夜道の調査に"
      }),
      logs,
      observationNotes,
      departConditions,
      highlight: generateHighlight(quest, party, itemIds, departConditions, outcomeInfo.result, rng),
      hiddenTags: {
        combat: true,
        investigation: true,
        timeOfDay: departTimeOfDay,
        // ★ 夜は交戦するので combat / survival（category「戦闘」と同じ）。昼と分けるために明示する。
        growthStats: ["combat", "survival"],
        target: "残る灯り",
        battleOutcome,
        battleHpRatios: battleHpRatiosOf(battle),
        battleCritIds: battleCritIdsOf(battle),
        ...(missingIds.length > 0 ? { missingIds } : {}),
        recordDensityGain: 1 + logs.length
      },
      ...tensionMeta,
      createdAt: new Date().toISOString()
    }, quest, party, rng);
  }

  // 戦闘依頼（畑の追い払い／納屋の討伐）：2026-07-31 に simulateBattle へ接続した。
  // ★ enemyId を持ちながら戦闘経路を通っていなかった＝データとロジックの食い違いそのものだった。
  if (quest.id === "quest_field_mystery" || quest.id === "quest_barn_bite") {
    const hunt = quest.id === "quest_barn_bite";
    const battle = simulateBattle(quest, party, itemIds, rng);
    const battleOutcome = battle ? battle.outcome : "victory";
    const won = battleOutcome === "victory";
    const missingIds = battleMissingIds(battle, party); // 敗北時のみ非空（EX-070）
    const outcomeInfo = questBattleOutcomeText(quest, battleOutcome, party);

    const questLogs = hunt
      ? generateBarnHuntLogs(quest, party, adventurerItemIds, rng, { itemIds, departConditions, tensionValue, battleOutcome,
        // ★ 「使った」と書いてよいかの事実（2026-09-12・EX-082）。EX-052 の effectiveBattleItemIds と同じ考え方。
        battleHealed: Array.isArray(battle?.events) && battle.events.some((e) => e.type === "heal") })
      : generateBattleLogs(quest, party, adventurerItemIds, rng, { itemIds, departConditions, tensionValue, battleOutcome });
    // 交戦記録＋「防げた瞬間」＋「持たせたのに使わなかった支給品」。
    // ★ 畑は戦闘のチュートリアルなので、**うまく送れたときも理由が読める**ようにする（2026-07-31）。
    const dramaLines = [
      ...generateSimpleBattleDramaLog(battle, party, rng),
      ...battleDefenseHighlights(battle, party, rng),
      ...unusedSupplyLines(battle, party, adventurerItemIds, rng)
    ];
    if (won) {
      // 勝ったときの並びは従来どおり（最後の1行が余韻）。交戦記録はその手前に差し込む。
      questLogs.forEach((text, index) => {
        if (index === questLogs.length - 1) {
          dramaLines.forEach((line) => add(line.kind, line.text));
          add("afterglow", text);
        } else {
          add("action", text);
        }
      });
    } else {
      questLogs.forEach((text) => add("action", text));
      dramaLines.forEach((line) => add(line.kind, line.text));
      if (missingIds.length > 0) add("drama", missingLineText(missingIds, party)); // 連れ帰れなかった（EX-070）
      add("action", outcomeInfo.line);
      add("afterglow", outcomeInfo.after);
    }

    // 挑まずに引き返したときは相手を観察していない
    const observationNotes = battleOutcome === "withdraw_first"
      ? null
      : generateObservationNotes(quest, party, adventurerItemIds, rng);
    const adventurerHistoryLines = buildSafeAdventurerHistoryLines(party, quest, {
      result: outcomeInfo.result,
      elsieRoleNote: hunt ? "鼻と警戒で" : "吠えと警戒で",
      roleNoteFor: (adv) =>
        adv.tendencies?.courage >= 4 ? "前に出る判断で" : adv.tendencies?.caution >= 4 ? "慎重な距離取りで" : adv.tendencies?.kindness >= 4 ? "周囲への気配りで" : (hunt ? "討伐に" : "追い払いに")
    });

    return withElsieLog({
      id: `report_${Date.now()}`,
      questId: quest.id,
      adventurerIds: expedition.adventurerIds,
      adventurerItemIds,
      itemIds,
      opened: false,
      applied: false,
      result: outcomeInfo.result,
      summary: outcomeInfo.summary,
      historyLine: outcomeInfo.history,
      adventurerHistoryLines,
      logs,
      observationNotes,
      departConditions,
      highlight: generateHighlight(quest, party, itemIds, departConditions, outcomeInfo.result, rng),
      hiddenTags: {
        combat: true,
        target: hunt ? "嚙みつく「なにか」" : "「なにか」",
        battleOutcome,
        battleHpRatios: battleHpRatiosOf(battle),
        battleCritIds: battleCritIdsOf(battle),
        ...(missingIds.length > 0 ? { missingIds } : {}),
        recordDensityGain: 1 + logs.length
      },
      ...tensionMeta,
      createdAt: new Date().toISOString()
    }, quest, party, rng);
  }

  // 保全依頼：辺境教会周辺の定期巡回
  if (quest.id === "quest_church_patrol") {
    const field = resolveFieldwork(quest, party, itemIds, expedition.departWeather ?? "晴れ", rng);
    const outcome = field.outcome;

    const soloAdv = isSoloHumanParty(party);
    add("", soloAdv
      ? `${partySubject(party)}は「${quest.title}」のため、ひとりで${quest.area}へ向かった。`
      : `${partySubject(party)}は「${quest.title}」のため、${quest.area}へ向かった。`);
    const supplyDesc = buildSupplyDescLines(party, adventurerItemIds);
    add("", `支給品：${supplyDesc.length > 0 ? supplyDesc.join(" / ") : "なし"}。`);

    const patrolLogs = generateChurchPatrolLogs(quest, party, adventurerItemIds, rng, { itemIds, departConditions, tensionValue });
    patrolLogs.forEach((text) => add("action", text));
    field.logLines.forEach((line) => add(line.kind, line.text));

    const outcomeInfo = field.turnBack
      ? fieldworkTurnBackOutcomeText(quest, party, field.fw)
      : churchPatrolOutcomeText(outcome, party, rng);
    add("action", outcomeInfo.line);
    add("afterglow", outcomeInfo.after);

    return finalizeQuestReport({
      expedition,
      quest,
      party,
      logs,
      rng,
      result: outcomeInfo.result,
      summary: outcomeInfo.summary,
      historyLine: outcomeInfo.history,
      adventurerHistoryLines: buildSafeAdventurerHistoryLines(party, quest, { result: outcomeInfo.result }),
      departConditions,
      adventurerItemIds,
      itemIds,
      tensionValue,
      tensionLevel,
      hiddenTags: { preservation: true, outcome, ...fieldworkHiddenTags(field.fw) },
      usedItemIds: effectiveItemIds(field.fw),
      wrapElsie: true
    });
  }

  // 保全依頼：古い小橋の応急修理
  if (quest.id === "quest_old_bridge_repair") {
    const field = resolveFieldwork(quest, party, itemIds, expedition.departWeather ?? "晴れ", rng);
    const outcome = field.outcome;

    const soloAdv = isSoloHumanParty(party);
    add("", soloAdv
      ? `${partySubject(party)}は「${quest.title}」のため、ひとりで${quest.area}へ向かった。`
      : `${partySubject(party)}は「${quest.title}」のため、${quest.area}へ向かった。`);
    const bridgeSupplyDesc = party.map((adv) => {
      const advItems = getAdvItemIds(adventurerItemIds, adv.id).map((iId) => getItem(iId)?.name).filter(Boolean);
      return advItems.length > 0 ? `${getDisplayName(adv)}：${advItems.join("・")}` : null;
    }).filter(Boolean);
    add("", `支給品：${bridgeSupplyDesc.length > 0 ? bridgeSupplyDesc.join(" / ") : "なし"}。`);

    const bridgeLogs = generateBridgeRepairLogs(quest, party, adventurerItemIds, rng, { itemIds, departConditions, tensionValue });
    bridgeLogs.forEach((text) => add("action", text));
    field.logLines.forEach((line) => add(line.kind, line.text));

    const outcomeInfo = field.turnBack
      ? fieldworkTurnBackOutcomeText(quest, party, field.fw)
      : bridgeRepairOutcomeText(outcome, party, rng);
    add("action", outcomeInfo.line);
    add("afterglow", outcomeInfo.after);

    const adventurerHistoryLines = {};
    party.forEach((adv) => {
      const displayName = getDisplayName(adv);
      const roleNote = adv.id === "adv_elsie" ? "鼻と警戒で"
        : adv.job === "戦士" ? "足場と板の交換で" : adv.job === "見習い盾役" ? "岸からの確認で"
          : adv.job === "斥候" ? "迂回路と通行確認で" : adv.job === "薬草師" ? "手当と片付けで"
            : adv.personality === "慎重" ? "丁寧な確認で" : "作業補助で";
      adventurerHistoryLines[adv.id] = `${quest.title}：${outcomeInfo.result}。${displayName}は${roleNote}記録に残った。`;
    });

    return {
      id: `report_${Date.now()}`,
      questId: quest.id,
      adventurerIds: expedition.adventurerIds,
      adventurerItemIds,
      itemIds,
      opened: false,
      applied: false,
      result: outcomeInfo.result,
      summary: outcomeInfo.summary,
      historyLine: outcomeInfo.history,
      adventurerHistoryLines,
      logs,
      // ★ 専用分岐でも観察記録の生成を呼ぶ（2026-09-15・EX-105）。null を直書きすると、
      //   この分岐を使う依頼に観察対象を付けた瞬間、**記録が1行も出ないまま黙って通る**。
      observationNotes: generateObservationNotes(quest, party, adventurerItemIds, rng),
      departConditions,
      highlight: generateHighlight(quest, party, itemIds, departConditions, outcomeInfo.result, rng, effectiveItemIds(field.fw)),
      hiddenTags: { preservation: true, outcome, ...fieldworkHiddenTags(field.fw), recordDensityGain: 1 + logs.length },
      ...tensionMeta,
      createdAt: new Date().toISOString()
    };
  }

  // 輸送依頼：薬草包みの納品
  if (quest.id === "quest_herb_delivery") {
    // 雨と油紙の効きは共通経路（天候の負荷と油紙の軽減）に移した（2026-07-31）
    const field = resolveFieldwork(quest, party, itemIds, expedition.departWeather ?? "晴れ", rng);
    const outcome = field.outcome;

    const soloAdv = isSoloHumanParty(party);
    add("", soloAdv
      ? `${partySubject(party)}は「${quest.title}」のため、ひとりで${quest.area}へ向かった。`
      : `${partySubject(party)}は「${quest.title}」のため、${quest.area}へ向かった。`);
    const deliverySupplyDesc = party.map((adv) => {
      const advItems = getAdvItemIds(adventurerItemIds, adv.id).map((iId) => getItem(iId)?.name).filter(Boolean);
      return advItems.length > 0 ? `${getDisplayName(adv)}：${advItems.join("・")}` : null;
    }).filter(Boolean);
    add("", `支給品：${deliverySupplyDesc.length > 0 ? deliverySupplyDesc.join(" / ") : "なし"}。`);

    const deliveryLogs = generateHerbDeliveryLogs(quest, party, adventurerItemIds, rng, { itemIds, departConditions, tensionValue });
    deliveryLogs.forEach((text) => add("action", text));
    field.logLines.forEach((line) => add(line.kind, line.text));

    const outcomeInfo = field.turnBack
      ? fieldworkTurnBackOutcomeText(quest, party, field.fw)
      : herbDeliveryOutcomeText(outcome, party, rng);
    add("action", outcomeInfo.line);
    add("afterglow", outcomeInfo.after);

    const adventurerHistoryLines = {};
    party.forEach((adv) => {
      const displayName = getDisplayName(adv);
      const roleNote = adv.id === "adv_elsie" ? "鼻と警戒で"
        : adv.job === "薬草師" ? "包みの管理で" : adv.job === "斥候" ? "道順と宛先確認で"
          : adv.job === "見習い盾役" ? "足場確認で" : adv.job === "戦士" ? "荷運びで"
            : adv.personality === "慎重" ? "丁寧な運搬で" : "輸送補助で";
      adventurerHistoryLines[adv.id] = `${quest.title}：${outcomeInfo.result}。${displayName}は${roleNote}記録に残った。`;
    });

    return {
      id: `report_${Date.now()}`,
      questId: quest.id,
      adventurerIds: expedition.adventurerIds,
      adventurerItemIds,
      itemIds,
      opened: false,
      applied: false,
      result: outcomeInfo.result,
      summary: outcomeInfo.summary,
      historyLine: outcomeInfo.history,
      adventurerHistoryLines,
      logs,
      // ★ 専用分岐でも観察記録の生成を呼ぶ（2026-09-15・EX-105）。null を直書きすると、
      //   この分岐を使う依頼に観察対象を付けた瞬間、**記録が1行も出ないまま黙って通る**。
      observationNotes: generateObservationNotes(quest, party, adventurerItemIds, rng),
      departConditions,
      highlight: generateHighlight(quest, party, itemIds, departConditions, outcomeInfo.result, rng, effectiveItemIds(field.fw)),
      hiddenTags: { transport: true, outcome, ...fieldworkHiddenTags(field.fw), recordDensityGain: 1 + logs.length },
      ...tensionMeta,
      createdAt: new Date().toISOString()
    };
  }

  // 救助依頼：帰ってこない薬草採りの確認
  if (quest.id === "quest_missing_herbalist") {
    // 笛の効きは共通経路（はぐれかけた工程の立て直し）に移した（2026-07-31）
    const field = resolveFieldwork(quest, party, itemIds, expedition.departWeather ?? "晴れ", rng);
    const outcome = field.outcome;

    const soloAdv = isSoloHumanParty(party);
    add("", soloAdv
      ? `${partySubject(party)}は「${quest.title}」のため、ひとりで${quest.area}へ向かった。`
      : `${partySubject(party)}は「${quest.title}」のため、${quest.area}へ向かった。`);
    const rescueSupplyDesc = party.map((adv) => {
      const advItems = getAdvItemIds(adventurerItemIds, adv.id).map((iId) => getItem(iId)?.name).filter(Boolean);
      return advItems.length > 0 ? `${getDisplayName(adv)}：${advItems.join("・")}` : null;
    }).filter(Boolean);
    add("", `支給品：${rescueSupplyDesc.length > 0 ? rescueSupplyDesc.join(" / ") : "なし"}。`);

    const rescueLogs = generateMissingHerbalistLogs(quest, party, adventurerItemIds, rng, { itemIds, departConditions, tensionValue, outcome });
    rescueLogs.forEach((text) => add("action", text));
    field.logLines.forEach((line) => add(line.kind, line.text));

    const outcomeInfo = field.turnBack
      ? fieldworkTurnBackOutcomeText(quest, party, field.fw)
      : missingHerbalistOutcomeText(outcome, party, rng);
    add("action", outcomeInfo.line);
    if (partyHasElsie(party) && (outcome === "保護" || outcome === "発見")) {
      add("action", outcome === "保護"
        ? `帰り道、エルシーは何度も振り返りながら、保護した村人の歩みに合わせて進んだ。`
        : `帰り道、エルシーは何度も振り返りながら、見つけた村人のそばを離れなかった。`);
    }
    add("afterglow", outcomeInfo.after);

    const adventurerHistoryLines = {};
    party.forEach((adv) => {
      const displayName = getDisplayName(adv);
      const roleNote = adv.id === "adv_elsie" ? "鼻と警戒で"
        : adv.job === "斥候" ? "足跡追跡で" : adv.job === "薬草師" ? "痕跡判断で"
          : adv.job === "見習い盾役" ? "帰路確認で" : adv.job === "戦士" ? "呼びかけと支援で"
            : adv.personality === "慎重" ? "慎重な捜索で" : "救助補助で";
      adventurerHistoryLines[adv.id] = `${quest.title}：${outcomeInfo.result}。${displayName}は${roleNote}記録に残った。`;
    });

    return {
      id: `report_${Date.now()}`,
      questId: quest.id,
      adventurerIds: expedition.adventurerIds,
      adventurerItemIds,
      itemIds,
      opened: false,
      applied: false,
      result: outcomeInfo.result,
      summary: outcomeInfo.summary,
      historyLine: outcomeInfo.history,
      adventurerHistoryLines,
      logs,
      // ★ 専用分岐でも観察記録の生成を呼ぶ（2026-09-15・EX-105）。null を直書きすると、
      //   この分岐を使う依頼に観察対象を付けた瞬間、**記録が1行も出ないまま黙って通る**。
      observationNotes: generateObservationNotes(quest, party, adventurerItemIds, rng),
      departConditions,
      highlight: generateHighlight(quest, party, itemIds, departConditions, outcomeInfo.result, rng, effectiveItemIds(field.fw)),
      hiddenTags: { rescue: true, outcome, ...fieldworkHiddenTags(field.fw), recordDensityGain: 1 + logs.length },
      ...tensionMeta,
      createdAt: new Date().toISOString()
    };
  }

  // 護衛依頼：夕市帰りの親子の付き添い
  if (quest.id === "quest_caravan_escort") {
    const battle = simulateBattle(quest, party, itemIds, rng);
    // 煙幕S1（2026-07-25）：煙幕による離脱は時点を問わず部分成功。完全成功は戦って勝つしかない。
    // 部分成功は捜索チェーンを発火させない（fail/bailのみが発火）。
    let branch;
    if (!battle) branch = "fail";
    else if (battle.outcome === "victory") branch = battle.stage === "軽" ? "great_light" : "great_wound";
    else if (battle.outcome === "withdraw_first" && battle.smoke.questContinues) branch = "partial_detour"; // 会敵回避＝遠回りの遅延
    else if (battle.outcome === "withdraw_first") branch = "avoid"; // ★段階1＝挑まずに引き返す（負傷なし・報酬なし。2026-07-30）
    else if (battle.outcome === "withdraw_emergency" && battle.smoke.held) branch = "partial_loss"; // 交戦離脱も煙幕で追撃を断てる
    else if (battle.outcome === "withdraw_emergency" && partyHasElsie(party)) branch = "partial_elsie"; // E2：エルシーの早い警告が退き際を整える
    else if (battle.outcome === "withdraw_emergency") branch = "bail"; // 荷を置いて退く（臨時判断による撤退）
    else branch = "fail";
    const missingIds = battleMissingIds(battle, party); // 敗北（fail）時のみ非空（EX-070）

    const soloAdv = isSoloHumanParty(party);
    add("", soloAdv
      ? `${partySubject(party)}は「${quest.title}」のため、ひとりで${quest.area}へ向かった。`
      : `${partySubject(party)}は「${quest.title}」のため、${quest.area}へ向かった。`);
    const caravanSupplyDesc = party.map((adv) => {
      const advItems = getAdvItemIds(adventurerItemIds, adv.id).map((iId) => getItem(iId)?.name).filter(Boolean);
      return advItems.length > 0 ? `${getDisplayName(adv)}：${advItems.join("・")}` : null;
    }).filter(Boolean);
    add("", `支給品：${caravanSupplyDesc.length > 0 ? caravanSupplyDesc.join(" / ") : "なし"}。`);

    const caravanLogs = generateCaravanEscortLogs(quest, party, adventurerItemIds, rng, { itemIds, departConditions, tensionValue });
    caravanLogs.forEach((line) => add(line.kind, line.text));

    // 交戦ドラマログ（案D・スライス2）：events を1行1アクションで描画。結果ログより前に入れる。
    generateCaravanBattleDramaLog(battle, party, rng).forEach((line) => add(line.kind, line.text));

    const outcomeInfo = caravanEscortOutcomeText(branch, party, rng);
    if (missingIds.length > 0) add("drama", missingLineText(missingIds, party)); // 連れ帰れなかった（EX-070）
    add("action", outcomeInfo.line);
    if (branch === "bail") add("action", `商人は荷の行方を目で追ったまま、しばらく口を開かなかった。`);
    if (branch === "partial_loss" || branch === "partial_elsie") add("action", `商人は減った荷を数え直し、それでも歩みを止めなかった。`);
    add("afterglow", outcomeInfo.after);

    return finalizeQuestReport({
      expedition,
      quest,
      party,
      logs,
      rng,
      result: outcomeInfo.result,
      summary: outcomeInfo.summary,
      historyLine: outcomeInfo.history,
      adventurerHistoryLines: buildSafeAdventurerHistoryLines(party, quest, {
        result: outcomeInfo.result,
        elsieRoleNote: "鼻と警戒で",
        roleNoteFor: (adv) => {
          if (adv.job === "戦士") return "前衛で受け止め";
          if (adv.job === "見習い盾役") return "退路と足場確保で";
          if (adv.job === "斥候") return "先行偵察で";
          if (adv.job === "薬草師") return "手当てと後方支援で";
          if (adv.personality === "慎重") return "撤退判断で";
          return "隊商の護りで";
        }
      }),
      departConditions,
      adventurerItemIds,
      itemIds,
      // ★ 支給品のハイライトは、実際に効いたときだけ出す（2026-08-04・EX-052。EX-050 と同じ形）。
      usedItemIds: effectiveBattleItemIds(battle),
      tensionValue,
      tensionLevel,
      // battleHpRatios: 帰還時の個人HP率。負傷の確定に使う（第3段階）。エルシーは戦闘のHP管理外なので含まれない。
      hiddenTags: { escort: true, caravan: true, battleOutcome: battle ? battle.outcome : "no_enemy", branch, battleGrowth: caravanBattleGrowthSummary(battle, party), battleHpRatios: battleHpRatiosOf(battle), battleCritIds: battleCritIdsOf(battle), ...(missingIds.length > 0 ? { missingIds } : {}) },
      wrapElsie: true
    });
  }

  // 隊商捜索チェーン：護衛失敗の後日談（stage1＝緊急捜索／stage2＝最後の手がかり）
  if (quest.id === "quest_caravan_search" || quest.id === "quest_caravan_lastchance") {
    const stage = quest.id === "quest_caravan_search" ? 1 : 2;
    // ★ 結末（見つかるか）は編成で決まるまま据え置く（2026-07-31）。ロストは
    //   「最後のチャンスで不適切な編成を選んだときだけ」と確定済みで、天候や疲労で
    //   隊商を失わせるのはその確定事項を壊す。共通経路は消耗と工程ログにだけ効かせる。
    // ★ 結末は工程ではなく編成で決まる（2026-07-30 裁定）。その「どう決まるか」は
    //   依頼データの outcomeOverride が持つ（2026-08-01・段階3）。
    const searchOutcome = overriddenOutcome(quest, { party, itemIds });
    const found = searchOutcome !== quest.outcomeOverride.default;
    const fw = simulateFieldwork(quest, party, itemIds, rng, { weather: expedition.departWeather ?? "晴れ" });

    const soloAdv = isSoloHumanParty(party);
    add("", soloAdv
      ? `${partySubject(party)}は「${quest.title}」のため、ひとりで${quest.area}へ向かった。`
      : `${partySubject(party)}は「${quest.title}」のため、${quest.area}へ向かった。`);
    const searchSupplyDesc = party.map((adv) => {
      const advItems = getAdvItemIds(adventurerItemIds, adv.id).map((iId) => getItem(iId)?.name).filter(Boolean);
      return advItems.length > 0 ? `${getDisplayName(adv)}：${advItems.join("・")}` : null;
    }).filter(Boolean);
    add("", `支給品：${searchSupplyDesc.length > 0 ? searchSupplyDesc.join(" / ") : "なし"}。`);

    const searchLogs = generateCaravanSearchLogs(quest, party, adventurerItemIds, rng, { itemIds, departConditions, tensionValue, stage, found });
    searchLogs.forEach((text) => add("action", text));
    fieldworkLogLines(fw, rng).forEach((line) => add(line.kind, line.text));

    const outcomeInfo = questOutcomeText(quest.id, searchOutcome, party, itemIds);
    add("action", outcomeInfo.line);
    add("afterglow", outcomeInfo.after);

    return finalizeQuestReport({
      expedition,
      quest,
      party,
      logs,
      rng,
      result: outcomeInfo.result,
      summary: outcomeInfo.summary,
      historyLine: outcomeInfo.history,
      adventurerHistoryLines: buildSafeAdventurerHistoryLines(party, quest, {
        result: outcomeInfo.result,
        elsieRoleNote: "鼻での追跡で",
        roleNoteFor: (adv) => {
          if (adv.job === "斥候") return "足跡の追跡で";
          if (adv.personality === "慎重") return "手がかりの見極めで";
          return "捜索の同行で";
        }
      }),
      departConditions,
      adventurerItemIds,
      itemIds,
      tensionValue,
      tensionLevel,
      hiddenTags: {
        searchChain: true,
        searchStage: stage,
        searchSuccess: found,
        ...fieldworkHiddenTags(fw),
        branch: found ? "recovered" : (stage === 2 ? "lost" : "fail")
      },
      usedItemIds: effectiveItemIds(fw),
      wrapElsie: true
    });
  }

  if (quest.id === "quest_evening_market_escort") {
    // 古地図の効きは共通経路（道の負荷の軽減）に移した（2026-07-31）
    const field = resolveFieldwork(quest, party, itemIds, expedition.departWeather ?? "晴れ", rng);
    const outcome = field.outcome;

    const soloAdv = isSoloHumanParty(party);
    add("", soloAdv
      ? `${partySubject(party)}は「${quest.title}」のため、ひとりで${quest.area}へ向かった。`
      : `${partySubject(party)}は「${quest.title}」のため、${quest.area}へ向かった。`);
    const escortSupplyDesc = party.map((adv) => {
      const advItems = getAdvItemIds(adventurerItemIds, adv.id).map((iId) => getItem(iId)?.name).filter(Boolean);
      return advItems.length > 0 ? `${getDisplayName(adv)}：${advItems.join("・")}` : null;
    }).filter(Boolean);
    add("", `支給品：${escortSupplyDesc.length > 0 ? escortSupplyDesc.join(" / ") : "なし"}。`);

    const escortLogs = generateEveningEscortLogs(quest, party, adventurerItemIds, rng, { itemIds, departConditions, tensionValue,
      // ★ 「使わずに済んだ」と書いてよいかの事実（2026-09-12・EX-082）
      whistleUsed: (field.fw?.events ?? []).some((e) => e.itemId === "item_whistle") });
    escortLogs.forEach((text) => add("action", text));
    field.logLines.forEach((line) => add(line.kind, line.text));

    const outcomeInfo = field.turnBack
      ? fieldworkTurnBackOutcomeText(quest, party, field.fw)
      : eveningEscortOutcomeText(outcome, party, rng);
    add("action", outcomeInfo.line);
    add("afterglow", outcomeInfo.after);

    const adventurerHistoryLines = {};
    party.forEach((adv) => {
      const displayName = getDisplayName(adv);
      const roleNote = adv.id === "adv_elsie" ? "鼻と付き添いで"
        : adv.job === "見習い盾役" ? "前衛と足場確認で" : adv.job === "斥候" ? "道選びで"
          : adv.job === "戦士" ? "荷物運搬で" : adv.job === "薬草師" ? "気配りと付き添いで"
            : adv.personality === "慎重" ? "安全な道選びで" : "護衛補助で";
      adventurerHistoryLines[adv.id] = `${quest.title}：${outcomeInfo.result}。${displayName}は${roleNote}記録に残った。`;
    });

    return {
      id: `report_${Date.now()}`,
      questId: quest.id,
      adventurerIds: expedition.adventurerIds,
      adventurerItemIds,
      itemIds,
      opened: false,
      applied: false,
      result: outcomeInfo.result,
      summary: outcomeInfo.summary,
      historyLine: outcomeInfo.history,
      adventurerHistoryLines,
      logs,
      // ★ 専用分岐でも観察記録の生成を呼ぶ（2026-09-15・EX-105）。null を直書きすると、
      //   この分岐を使う依頼に観察対象を付けた瞬間、**記録が1行も出ないまま黙って通る**。
      observationNotes: generateObservationNotes(quest, party, adventurerItemIds, rng),
      departConditions,
      highlight: generateHighlight(quest, party, itemIds, departConditions, outcomeInfo.result, rng, effectiveItemIds(field.fw)),
      hiddenTags: { escort: true, outcome, ...fieldworkHiddenTags(field.fw), recordDensityGain: 1 + logs.length },
      ...tensionMeta,
      createdAt: new Date().toISOString()
    };
  }

  // 記録依頼：古い石碑の拓本
  if (quest.id === "quest_old_stele_rubbing") {
    const field = resolveFieldwork(quest, party, itemIds, expedition.departWeather ?? "晴れ", rng);
    const outcome = field.outcome;

    const soloAdv = isSoloHumanParty(party);
    add("", soloAdv
      ? `${partySubject(party)}は「${quest.title}」のため、ひとりで${quest.area}へ向かった。`
      : `${partySubject(party)}は「${quest.title}」のため、${quest.area}へ向かった。`);
    const steleSupplyDesc = party.map((adv) => {
      const advItems = getAdvItemIds(adventurerItemIds, adv.id).map((iId) => getItem(iId)?.name).filter(Boolean);
      return advItems.length > 0 ? `${getDisplayName(adv)}：${advItems.join("・")}` : null;
    }).filter(Boolean);
    add("", `支給品：${steleSupplyDesc.length > 0 ? steleSupplyDesc.join(" / ") : "なし"}。`);

    const steleLogs = generateSteleRubbingLogs(quest, party, adventurerItemIds, rng, { itemIds, departConditions, tensionValue });
    steleLogs.forEach((text) => add("action", text));
    field.logLines.forEach((line) => add(line.kind, line.text));

    const outcomeInfo = field.turnBack
      ? fieldworkTurnBackOutcomeText(quest, party, field.fw)
      : steleRubbingOutcomeText(outcome, party, rng);
    add("action", outcomeInfo.line);
    add("afterglow", outcomeInfo.after);

    const adventurerHistoryLines = {};
    party.forEach((adv) => {
      const displayName = getDisplayName(adv);
      const roleNote = adv.id === "adv_elsie" ? "鼻と警戒で"
        : adv.job === "斥候" ? "位置照合で" : adv.job === "薬草師" ? "拓本と判読で"
          : adv.job === "見習い盾役" ? "紙の固定で" : adv.job === "戦士" ? "作業補助で"
            : adv.personality === "慎重" ? "保存優先の判断で" : "記録補助で";
      adventurerHistoryLines[adv.id] = `${quest.title}：${outcomeInfo.result}。${displayName}は${roleNote}記録に残った。`;
    });

    return {
      id: `report_${Date.now()}`,
      questId: quest.id,
      adventurerIds: expedition.adventurerIds,
      adventurerItemIds,
      itemIds,
      opened: false,
      applied: false,
      result: outcomeInfo.result,
      summary: outcomeInfo.summary,
      historyLine: outcomeInfo.history,
      adventurerHistoryLines,
      logs,
      // ★ 専用分岐でも観察記録の生成を呼ぶ（2026-09-15・EX-105）。null を直書きすると、
      //   この分岐を使う依頼に観察対象を付けた瞬間、**記録が1行も出ないまま黙って通る**。
      observationNotes: generateObservationNotes(quest, party, adventurerItemIds, rng),
      departConditions,
      highlight: generateHighlight(quest, party, itemIds, departConditions, outcomeInfo.result, rng, effectiveItemIds(field.fw)),
      hiddenTags: { record: true, outcome, ...fieldworkHiddenTags(field.fw), recordDensityGain: 1 + logs.length },
      ...tensionMeta,
      createdAt: new Date().toISOString()
    };
  }

  // 生活依頼（lifeQuestEventPools に登録されているもの）は専用フローで生成
  if (lifeQuestEventPools[quest.id]) {
    const pool = lifeQuestEventPools[quest.id];
    const workEvents = pickMany(pool.workEvents, 3 + Math.floor(rng() * 2), rng);
    const field = resolveFieldwork(quest, party, itemIds, expedition.departWeather ?? "晴れ", rng);
    const outcome = field.outcome;

    const outcomeInfo = field.turnBack
      ? fieldworkTurnBackOutcomeText(quest, party, field.fw)
      : lifeQuestOutcomeText(quest, party, itemIds, outcome, rng);
    // ★ 個人イベントは既存2件の書き分けしか持っていないので、新クエストでは出さない
    //   （出すと廃屋の文が流れ込む）。最初のクエストは短いままでよい。
    const personal = quest.id === "quest_tavern_errand"
      ? null
      : lifeQuestPersonalEventText(quest, party, rng, tensionValue ?? 50);
    // ★ 天候を渡す（2026-09-12・EX-082）。遠征依頼フローは渡していて、ここだけ抜けていた＝渡し忘れ。
    //   渡さないと油紙の分岐が常に「使わずに済んだ」側に落ちる（廃屋は小雨でも食い違っていた）。
    const supply = supplyEventText(quest, party, adventurerItemIds, rng, expedition.departWeather ?? "晴れ");
    const statsLog = statsPersonalityLog(party, rng);
    const observationNotes = generateObservationNotes(quest, party, adventurerItemIds, rng);

    const arrivalLines = {
      quest_wedding_support: [
        `会場に着くと、すでに準備の真っ最中だった。依頼人の顔に安堵が浮かんだ。花の飾り付けはまだ途中だった。`,
        `町の小さな祝宴会場に着いた。外には招待客らしい人が少しずつ集まり始めていた。`
      ],
      quest_tavern_errand: [
        `酒場はギルドの隣で、扉を開けるとまだ昼の支度の途中だった。`,
        `隣の酒場に入ると、床を拭いていた主人が顔を上げた。`
      ],
      quest_old_house_cleanup: [
        `町外れの家屋に着いた。戸は開いたまま、中は物が積み重なっていた。`,
        isMultiHumanParty(party)
          ? `古い家屋の前に立った。一行は外から中を見渡し、どこから手をつけるかを相談した。`
          : `古い家屋の前に立った。${partySubject(party)}は外から中を見渡し、どこから手をつけるかを判断した。`
      ]
    };

    add("", `${partySubject(party)}が「${quest.title}」のため、${quest.area}へ向かった。`);
    const lifeSupplyDesc = party.map((adv) => {
      const advItems = getAdvItemIds(adventurerItemIds, adv.id).map((iId) => getItem(iId)?.name).filter(Boolean);
      return advItems.length > 0 ? `${getDisplayName(adv)}：${advItems.join("・")}` : null;
    }).filter(Boolean);
    add("", `支給品：${lifeSupplyDesc.length > 0 ? lifeSupplyDesc.join(" / ") : "なし"}。`);
    add("", pickOne(arrivalLines[quest.id] ?? [`${quest.area}に到着した。`], rng));
    workEvents.forEach((eventName) => add("action", workEventText(quest, eventName, party, itemIds, rng)));
    // ★ 樽を担ぐ工程は担ぎ手が変わると文が変わる（2026-08-05・EX-053）。
    let suppressSupportLine = false;
    if (quest.id === "quest_tavern_errand") {
      const barrel = tavernBarrelLine(field.fw, party, rng);
      if (barrel) add("action", barrel);
      // ★ 樽の行が出た回は工程固有文（「樽を担ぎ、休まず…」）を出さない（2026-08-18・EX-071）。
      //   同じ事実を二度書く二重行になるため。tendencies 分岐＝担ぎ手の性格が出る側を残す。
      //   ★ 汎用の衝突検知にはしない（樽の行と工程固有文の個別の衝突。2例目が出てから考える）。
      //   抽選（pickOne）は既に済んでいるので、ここで落としても乱数の消費は変わらない。
      suppressSupportLine = Boolean(barrel) && field.fw?.support?.label === "樽を担ぐ";
    }
    field.logLines.forEach((line) => {
      if (suppressSupportLine && line.support) return;
      add(line.kind, line.text);
    });
    if (personal) add("drama", personal);
    if (supply) add("drama", supply);
    if (statsLog) add("drama", statsLog);
    add("action", outcomeInfo.line);
    add("afterglow", outcomeInfo.after);

    const adventurerHistoryLines = {};
    party.forEach((adv) => {
      const displayName = getDisplayName(adv);
      const roleNote = adv.id === "adv_elsie" ? "鼻と警戒で"
        : adv.personality === "世話焼き" ? "気配りと補助で" : adv.personality === "慎重" ? "丁寧な確認で" : adv.personality === "豪胆" ? "力仕事で" : "一員として";
      adventurerHistoryLines[adv.id] = `${quest.title}：${outcomeInfo.result}。${displayName}は${roleNote}記録に残った。`;
    });

    return withElsieLog({
      id: `report_${Date.now()}`,
      questId: quest.id,
      adventurerIds: expedition.adventurerIds,
      adventurerItemIds,
      itemIds,
      opened: false,
      applied: false,
      result: outcomeInfo.result,
      summary: outcomeInfo.summary,
      historyLine: outcomeInfo.history,
      adventurerHistoryLines,
      logs,
      observationNotes,
      departConditions,
      highlight: generateHighlight(quest, party, itemIds, departConditions, outcomeInfo.result, rng, effectiveItemIds(field.fw)),
      hiddenTags: { workEvents, outcome, ...fieldworkHiddenTags(field.fw), recordDensityGain: 1 + logs.length },
      ...tensionMeta,
      createdAt: new Date().toISOString()
    }, quest, party, rng);
  }

  // 遠征依頼フロー
  const pool = questEventPools[quest.id];

  const weather = expedition.departWeather ?? "晴れ";
  const roadEvents = pickMany(pool.roadEvents, 2 + Math.floor(rng() * 2), rng);
  // 支給品と編成の効きは共通経路へ移した（2026-07-31）。油紙＝天候、古地図＝道の負荷、
  // 薬草師や配達人の腕＝その依頼で使う育成値、として工程の判定に入る。
  const field = resolveFieldwork(quest, party, itemIds, weather, rng);
  const outcome = field.outcome;

  const outcomeInfo = field.turnBack
    ? fieldworkTurnBackOutcomeText(quest, party, field.fw)
    : outcomeText(quest, party, itemIds, outcome, rng);
  const personal = personalEventText(quest, party, rng);
  const supply = supplyEventText(quest, party, adventurerItemIds, rng, weather);
  const statsLog = statsPersonalityLog(party, rng);
  const observationNotes = generateObservationNotes(quest, party, adventurerItemIds, rng);

  const soloAdv = isSoloHumanParty(party);
  const companion = isCompanionParty(party);
  add("", soloAdv
    ? `${partySubject(party)}は「${quest.title}」のため、ひとりで${quest.area}へ向かった。`
    : `${partySubject(party)}は「${quest.title}」のため、${quest.area}へ向かった。`);
  const supplyDesc = party.map((adv) => {
    const advItems = getAdvItemIds(adventurerItemIds, adv.id).map((iId) => getItem(iId)?.name).filter(Boolean);
    return advItems.length > 0 ? `${getDisplayName(adv)}：${advItems.join("・")}` : null;
  }).filter(Boolean);
  add("", `編成：${formatNames(party)}。支給品：${supplyDesc.length > 0 ? supplyDesc.join(" / ") : "なし"}。`);
  add("", generateWeatherLog(quest, party, weather, rng));
  roadEvents.forEach((eventName) => add("action", roadEventText(quest, eventName, party, itemIds, rng)));
  field.logLines.forEach((line) => add(line.kind, line.text));
  if (personal) add("drama", personal);
  if (supply) add("drama", supply);
  if (statsLog) add("drama", statsLog);
  add("action", outcomeInfo.line);
  add("afterglow", outcomeInfo.after);

  const adventurerHistoryLines = {};
  party.forEach((adv) => {
    const displayName = getDisplayName(adv);
    const roleNote = adv.id === "adv_elsie" ? "鼻と警戒で"
      : adv.job === "斥候" ? "確認役として" : adv.job === "薬草師" ? "採集と手当で" : adv.job === "戦士" ? "荷運びと警戒で" : soloAdv ? "単独で" : companion ? "エルシーと同行で" : "一行の一員として";
    adventurerHistoryLines[adv.id] = `${quest.title}：${outcomeInfo.result}。${displayName}は${roleNote}記録に残った。`;
  });

  return withElsieLog({
    id: `report_${Date.now()}`,
    questId: quest.id,
    adventurerIds: expedition.adventurerIds,
    itemIds: expedition.itemIds,
    opened: false,
    applied: false,
    result: outcomeInfo.result,
    summary: outcomeInfo.summary,
    historyLine: outcomeInfo.history,
    adventurerHistoryLines,
    logs,
    adventurerItemIds,
    observationNotes,
    departConditions,
    highlight: generateHighlight(quest, party, itemIds, departConditions, outcomeInfo.result, rng, effectiveItemIds(field.fw)),
    hiddenTags: {
      weather,
      roadEvents,
      outcome,
      ...fieldworkHiddenTags(field.fw),
      recordDensityGain: 1 + logs.length
    },
    createdAt: new Date().toISOString()
  }, quest, party, rng);
}

navButtons.forEach((button) => {
  button.addEventListener("click", () => setRoute(button.dataset.route));
});

if (recorderBadge) recorderBadge.addEventListener("click", toggleRecorderBadge);

// 就任日を持たない旧セーブの補完（2026-08-09・EX-065）。
// ★ 就任の時刻はこれまで記録していないので、既存の項目からは正確には導けない。
//   最古の報告書の作成日時が唯一の手がかり（就任後に書かれたものなので下限になる）で、
//   報告書もなければ、この読み込み時刻を就任日として置く。`schemaVersion` は上げない
//   （項目を1つ足しただけで、上げると報告書も名前も全部消えるため）。
if (state.player?.interviewDone && typeof state.player.appointedAt !== "number") {
  const times = state.reports
    .map((report) => Date.parse(report.createdAt ?? ""))
    .filter((t) => Number.isFinite(t));
  state.player.appointedAt = times.length > 0 ? Math.min(...times) : Date.now();
  saveState();
}

resetButton.addEventListener("click", () => {
  const ok = confirm("Mockの保存データを初期化しますか？");
  if (!ok) return;
  localStorage.removeItem(STORAGE_KEY);
  state = createInitialState();
  selectedQuestId = null;
  selectedAdventurerIds = [];
  selectedAdventurerItems = {};
  editingAdventurerId = null;
  route = "home";
  render();
});

// ★ 毎秒の再描画と初回描画は**このファイルの末尾**にある（2026-09-18・EX-130）。
//   ここに置いてはいけない——理由は末尾の注記を読むこと。
// === 戦闘エンジン（土台） =====================================================
// 隊商護衛の掴み体験に向けた内部エンジン。まだ報告書ログ生成には接続していない。
// 検証用: DevToolsコンソールで debugBattleSim() を実行する。
// 数値はすべて叩き台（docs/CURRENT_SPEC.md「戦闘システム」参照）。

const BATTLE_TUNING = {
  jobBaseHp: { "戦士": 95, "見習い盾役": 110, "斥候": 78, "薬草師": 72 },
  defaultJobBaseHp: 85,
  hpPerSurvival: 0.6,
  frontOrder: ["戦士", "見習い盾役", "斥候", "薬草師"],
  retreatJobBase: { "斥候": 50, "薬草師": 55, "見習い盾役": 65, "戦士": 80 },
  retreatJobDefault: 55,
  retreatPersonalityShift: { "慎重": -10, "豪胆": 10, "我慢強い": 10 },
  scoreElsieBonus: 10,
  // ★ 煙幕の判断ボーナス（旧 scoreSmokeBonus: 30）は 2026-07-31 に廃止。
  //   煙幕は撤退の成否（retreatSuccessSmokeBonus）と結末（partial_loss / partial_detour）にだけ効く。
  scoreEnemyLowHpPenalty: -25,
  enemyLowHpRatio: 0.2,
  // ★ 包帯（正確には quest.battleEffectiveItemIds の残り個数）が判断を継続寄りに倒す重み。
  //   2026-09-13 に -20 → -10（EX-090 で測り、EX-091 で実施）。★ 下げた理由は「包帯を判断から外す」
  //   ではなく **-20 が事実より楽観していた**こと——護衛では包帯1枚が勝率を 1.6%→6.0% しか動かさないのに、
  //   段階1の判断を「引き返す」から「挑む」へ反転させ、bail 48%/fail 45%/勝利 6% の戦いを作っていた。
  //   ★ 反転の境界は実測済み：**護衛は -18 以下で反転／納屋は -1 以下で反転**（接敵スコア 護衛 57→37・
  //   納屋 40→20、成立に要るスコアはどちらも 40）。-10 は -17〜-2 の窓の中で、
  //   **納屋の反転（勝率 64.4%＝妥当）を残したまま護衛の反転だけを消す**値。
  //   ⚠️ 0 にはしない。**「医療品を判断から外す」は 2026-07-31 に却下済み**（包帯は「勝つ手段がまだある」側）。
  scoreEffectiveItemPenalty: -10,
  frontDamageShare: 0.6,
  attackSqrtCombatCoef: 3.5,
  attackWeaponCoef: 2,
  // ★ guard のスケール（2026-07-30）。武器の guard は 0〜50 で持ち、被ダメから引くのはその 1/10。
  //   刻みを細かくするためだけの変更で、実効引き量（ミナ2/ガッド3/エルネ3/ロウ5）は据え置き。
  //   実効引き量が同じならバランスは変わらないことを実測で確認済み（軽・深手・ダメ0が誤差内一致）。
  //   ★ guard は成長しない。装備が決めるものなので、育つ数値とは別に扱う（詳細は DECISION_LOG）。
  guardScale: 0.1,
  // ★ power も guard と同じ流儀（2026-07-30）。武器の power は 0〜50 で持ち、与ダメ式に入るのは
  //   その 1/10。装備が決める値なので guard と揃えた。実効値（ミナ2/ガッド5/エルネ2/ロウ3）は据え置き。
  //   ★ power も成長しない（guard と同じ理由）。
  powerScale: 0.1,
  strongDealRatio: 1.08,
  strongTakeHpRatio: 0.12,
  varianceMin: 0.75,
  varianceMax: 1.25,
  maxRounds: 8,
  // ★ 撤退判断の4段階（2026-07-30）。段階1＝接敵で引く／段階2＝想定超過の被害（動揺）／
  //   段階3＝以後は毎ラウンド判定／段階4＝相手を見て決める。**撤退の最終決定は段階4だけ**。
  //   旧 R3 の定期判断は段階3に吸収して廃止した（実測で発火 0件だった）。
  // forecast＝「倒すまでのラウンド数 ÷ こちらが持たないラウンド数」。1.0 で互角、大きいほど絶望的。
  //   ★ これで初めて敵の threat と最大HPの絶対値が式に入る（旧式は敵HPの割合しか見ていなかった）。
  //   score = (比 − 1) × scale + offset。offset は閾値の最小（ミナ40）に合わせてある＝互角で誰も引かない。
  forecastScoreScale: 50,
  forecastScoreOffset: 40,
  forecastRatioCap: 6, // 絶望の度合いに上限を置く（スコアが桁で暴れないように）
  // 撤退は失敗しうる（失敗したら戦闘続行）。エルシーがいれば必ず成功する。
  retreatSuccessBase: 0.6,
  retreatSuccessSmokeBonus: 0.3,
  // 軽（浅手）判定の累積被ダメ閾値。軽＝「手負いはあったが浅く、手当てで戻した」（原設計の「軽傷で勝利」）。
  // ★ 0.30 の根拠（2026-07-31）：**状態語の「手負い」の定義を、一行全体に当てた量**。
  //   手負いは HP率 70% 以下＝3割を失ったとき。その定義をパーティ総量にそのまま伸ばして
  //   **「一行全員が手負いになる量を削られたら、もう浅手ではない」**とした。
  // ★★ 値の決め方が変わった。0.18/0.25/0.26 はいずれも**軽の割合を目標値に合わせるための逆算**で、
  //   その目標値（20〜30帯）の根拠が汚染されていたため 2026-07-31 に帯ごと取り下げた。
  //   **今の値は既存の定義から導いたもので、出てきた分布はそのまま受ける**（目標値は置かない）。
  lightWoundRatio: 0.30,
  healAmount: 15,
  // 損耗による与ダメ低下（状態語連動・段階的）。因果が読めることを最優先（2026-07-24）
  woundAttackMult: { "手負い": 0.8, "深手": 0.5 },
  // 臨時撤退判断（スライス9）：仲間が深手/不能になった動揺のショック補正と、1戦闘あたりの発火上限
  emergencyShock: { "深手": 30, "戦闘不能": 50 },
  emergencyCap: 2,
  // ★ クリティカル＝深手（2026-07-29）。深手を「累積」から「事件」に変える。
  //   HP率での深手判定はやめ、クリティカルを受けたこと自体を深手とする。1発で届くので
  //   連続ラウンド数を要さず、前衛の交代制（H1-a）と劇的な分岐が両立する。
  // ★ 上限は設けない。HP0 は死ではなく行方不明（捜索チェーン行き）なので、
  //   「2連続で即死しない」条件はもともと満たされている。上限を入れると
  //   意図的に殴られることが安全になり、自爆成長を許可してしまう。
  critRate: 0.05,
  critMultiplier: 2,
  // ★ 素ダメージが小さすぎる一撃はクリティカル判定をしない（2026-07-31）。
  //   「0ダメージの被弾では判定しない」の延長線で、**総ダメージは動かさない**
  //   （クリティカルに下限を入れて底上げする案は却下済み。底上げすると軽が下がり、
  //     lightWoundRatio の再調整が連鎖する）。
  // ★ 受け手の maxHp 比で持つ。「致命の一撃と呼べる重さか」は**受け手基準の不変量**なので、
  //   ロウ（125）とエルネ（79）で意味が変わってはいけない（2026-07-29「不変量は比率で持つ」）。
  //   敵の threat 比で持つ案は却下＝**致命かどうかを相手の都合で決めることになる**。
  // ★ 0.05 の根拠：4人編成では素ダメージに谷がある（前衛シェア0.6と後衛の頭割り0.4÷3の構造。
  //   threat38 なら後衛1〜4／前衛12〜26で、5〜11は0件）。0.05＝閾値3.95〜6.25 はその谷の中。
  //   0.08 まで上げると畑（threat16）の深手が0.7%になり、**低危険帯から危険が消える**ので採らない。
  // ★★ これで深手が 53% → 19% になるが、**下がったのではなく本来の値**。
  //   旧53%のうち 64.9% は「6ダメージの致命の一撃」＝後衛のかすり傷を深手に数えていた分。
  critMinHpRatio: 0.05
};

// ★ 依頼データの宣言 `battleWeakenedBy` で、支給品を持っているときだけ敵を弱くする
//   （2026-09-13・EX-092）。**特殊分岐ではなく宣言**なので、持たない依頼は今までどおり。
//   ねらいは「ランタンを通常の戦闘計算に乗せる」こと——そうすれば育成で越えられる形が自動的に
//   成立し、エンジンの外に特殊裁定を積まずに済む。
//   ⚠️ id / name / shortName は保つ（`battle.enemyId` から名前を引き直す箇所が3つある）。
function getEnemyForQuest(quest, heldItemIds) {
  if (!quest || !quest.enemyId || !Array.isArray(window.masterEnemies)) return null;
  const base = window.masterEnemies.find((e) => e.id === quest.enemyId) ?? null;
  if (!base) return null;
  const weaken = quest.battleWeakenedBy;
  if (!weaken || !Array.isArray(heldItemIds) || !heldItemIds.includes(weaken.itemId)) return base;
  return {
    ...base,
    hp: Math.max(1, Math.round(base.hp * (weaken.hp ?? 1))),
    threat: Math.max(1, Math.round(base.threat * (weaken.threat ?? 1)))
  };
}

// 前衛は毎ラウンド選び直す。HP率のもっとも高い者が前へ出る（H1-a・2026-07-29）。
// ★ 消耗した者を前に立たせ続けない＝「盾役が消耗したら次の者が前へ出る」。
//   以前は frontOrder の先頭固定で、倒れたときしか交代しなかったため負傷が前衛1人に集中していた。
// frontOrder は初期の立ち位置を決める役目として残す（1ラウンド目は全員HP率1.0なのでここで決まる）。
function pickBattleFront(fighters) {
  const alive = fighters.filter((f) => !f.downed);
  if (alive.length === 0) return null;
  const hpRatio = (f) => (f.maxHp > 0 ? Math.max(0, f.hp) / f.maxHp : 0);
  const sorted = [...alive].sort((a, b) => {
    const ah = hpRatio(a);
    const bh = hpRatio(b);
    if (ah !== bh) return bh - ah;
    const ai = BATTLE_TUNING.frontOrder.indexOf(a.job);
    const bi = BATTLE_TUNING.frontOrder.indexOf(b.job);
    const ar = ai === -1 ? 99 : ai;
    const br = bi === -1 ? 99 : bi;
    if (ar !== br) return ar - br;
    return (b.courage ?? 0) - (a.courage ?? 0);
  });
  return sorted[0];
}

// 「倒すまでのラウンド数」と「こちらが持たないラウンド数」の比（2026-07-30）。
// ★ これが「こいつに勝つ手段がもうない」の中身。1.0 で互角、1 を大きく超えると絶望的。
//   1ラウンドに通る被ダメは threat から生存者の guard 合計を引いた値で近似する
//   （実測と一致：野盗 38−13=25 に対し実測 25.0／大熊 46−13=33 に対し実測 33.0）。
// ★ 修正（2026-07-31）：「持たない」は**パーティ総HPと前衛の残り時間の短い方**で見る。
//   総HPだけで見ると前衛60%集中を無視するので、実際には前衛が先に崩れる編成を「やや不利」と
//   読んでしまう（ミナ+ガッドが比1.21なのに実際の勝率1.6〜16%だった）。
//   崩れるのは列であって総量ではない。「判断は常に正しい」を守るための精度修正。
function computeBattleForecast(fighters, enemyHpNow, enemy) {
  const alive = fighters.filter((f) => !f.downed);
  if (alive.length === 0) return { roundsToKill: Infinity, roundsToFall: 0, ratio: Infinity };
  const offense = alive.reduce((sum, f) => sum + f.attack * (BATTLE_TUNING.woundAttackMult[f.status] ?? 1), 0);
  const roundsToKill = offense > 0 ? Math.max(0, enemyHpNow) / offense : Infinity;
  const guardSum = alive.reduce((sum, f) => sum + f.weaponGuard, 0);
  const perRoundTake = Math.max(1, enemy.threat - guardSum);
  const allyHp = alive.reduce((sum, f) => sum + Math.max(0, f.hp), 0);
  const roundsToFallByHp = allyHp / perRoundTake;
  // 前衛が受ける取り分（他に人がいなければ全部その人に来る）
  const front = pickBattleFront(fighters);
  const frontShare = alive.length > 1 ? BATTLE_TUNING.frontDamageShare : 1;
  const frontTake = Math.max(1, enemy.threat * frontShare - (front?.weaponGuard ?? 0));
  const roundsToFrontFall = Math.max(0, front?.hp ?? 0) / frontTake;
  const roundsToFall = Math.min(roundsToFallByHp, roundsToFrontFall);
  const ratio = roundsToFall > 0 ? roundsToKill / roundsToFall : Infinity;
  return { roundsToKill, roundsToFall, roundsToFallByHp, roundsToFrontFall, ratio };
}

// 段階1（接敵）と段階4（相手を見て決める）の冷静な判断。相手の**残り**と相手の**強さ**の両方を見る。
// ★ 損耗は forecast の中（現在HP）に入っているので、旧式のように別項で足さない（二重計上を避ける）。
// ★ 医療系支給品は「残り個数」で効く（2026-07-30 裁定）。あるうちは粘り、使い切った瞬間に引く側へ倒れる。
// ★★ 一般則（2026-07-31 裁定）：**判断に入るのは「勝てるか」に関わるものだけ。
//    「逃げやすいか」は撤退の成否にだけ効く。** 人が撤退を決めるのは「勝つ手段がもうない」と
//    思ったときで、「逃げ道があるから逃げよう」ではない。
//   → 煙幕（逃げる手段）もエルシー（逃げる手段）も、段階1・段階4のどちらでも判断に入れない。
//     効くのは撤退の成否（`retreatSuccessSmokeBonus` / エルシーは必ず成功）と結末だけ。
//     判断に足していたときは、勝てる編成が煙幕を持っただけで離脱していた（1.3%→35.1%）。
//   ※ 段階2（動揺）のエルシー+10 は別（犬の警告＝本能。2026-07-24 の裁定のまま残す）。
//   ※ 包帯は「勝つ手段がまだある」側なので判断に入れてよい（継続寄り）。
function computeBattleResolveDecision(fighters, enemyHpNow, enemy, context, at = "resolve") {
  const alive = fighters.filter((f) => !f.downed);
  const forecast = computeBattleForecast(fighters, enemyHpNow, enemy);
  const enemyHpRatio = enemy.hp > 0 ? Math.max(0, enemyHpNow) / enemy.hp : 0;
  const capped = Math.min(forecast.ratio, BATTLE_TUNING.forecastRatioCap);
  let raw = (capped - 1) * BATTLE_TUNING.forecastScoreScale + BATTLE_TUNING.forecastScoreOffset;
  if ((context.medicalLeft ?? 0) > 0) raw += BATTLE_TUNING.scoreEffectiveItemPenalty; // 手当てできるからまだやれる
  if (enemyHpRatio <= BATTLE_TUNING.enemyLowHpRatio) raw += BATTLE_TUNING.scoreEnemyLowHpPenalty;
  const score = Math.round(raw);
  const votes = alive.map((f) => {
    const jobBase = BATTLE_TUNING.retreatJobBase[f.job] ?? BATTLE_TUNING.retreatJobDefault;
    const shift = BATTLE_TUNING.retreatPersonalityShift[f.personality] ?? 0;
    const threshold = jobBase + shift;
    return { id: f.id, name: f.name, threshold, score, retreat: score >= threshold };
  });
  const retreatCount = votes.filter((v) => v.retreat).length;
  // ★ 撤退の成立は「半数以上」（2026-07-31 裁定。4人→2票／3人→2票／2人→1票／1人→1票）。
  //   過半数だと2人編成で全員一致が要り、豪胆な戦士が1人いれば永久に引かない＝
  //   **少人数ほど危険なのに、少人数ほど引きにくくなる**という逆転が起きていた。
  //   半数以上なら人数が減るほど引きやすくなり、危険度と一致する。
  //   ★ 主題とも合う：1人が「もう無理だ」と言ったら引く（＝仲間を置いていく方向に寄せない）。
  //   ※ 2026-06-29 の「4人中3人以上」は4人編成だけを想定した保留付きの値で、この裁定が優先する。
  const needed = Math.ceil(alive.length / 2);
  return {
    score,
    votes,
    retreatCount,
    needed,
    retreat: retreatCount >= needed,
    roundsToKill: Math.round(forecast.roundsToKill * 100) / 100,
    roundsToFall: Math.round(forecast.roundsToFall * 100) / 100,
    ratio: Math.round(forecast.ratio * 100) / 100
  };
}

// stage（軽/中）は「累積被ダメ」基準（2026-07-23）：傷を負った事実は回復しても報告書に残す。
// 軽/中の対比軸は「深手が出たか」（2026-07-25裁定）：深手が出た戦闘は累積被ダメが浅くても軽にしない。
function battleStageLabel(outcome, woundRatio, hadDeepWound) {
  if (outcome === "victory") {
    return (woundRatio <= BATTLE_TUNING.lightWoundRatio && !hadDeepWound) ? "軽" : "中";
  }
  if (outcome === "withdraw_first") return "軽"; // 段階1＝挑まずに引き返す（負傷なし）
  if (outcome === "withdraw_emergency" || outcome === "stalemate") return "重";
  return "致命";
}

// 交戦記録用の状態語（案B・スライス1／2026-07-29 に深手の定義を差し替え）。
// 健在＝HP率70%超／手負い＝70%以下／戦闘不能＝HP0。
// ★ 深手だけは HP率ではなく「クリティカルを受けたか」で決まる（累積ではなく事件）。
//   35% の閾値は使わない。gotCrit を渡さない呼び出しでは深手にならない。
function battleStatusWord(hp, maxHp, gotCrit = false) {
  if (hp <= 0) return "戦闘不能";
  if (gotCrit) return "深手";
  return hp / maxHp > 0.70 ? "健在" : "手負い";
}

function simulateBattle(quest, party, itemIds, rng) {
  // ⚠️ heldItems の宣言はこの下なので、ここでは引数をそのまま渡す（順番を入れ替えない）。
  const enemy = getEnemyForQuest(quest, Array.isArray(itemIds) ? itemIds : []);
  if (!enemy) return null;
  const random = rng ?? Math.random;
  const humans = party.filter((a) => a.species !== "dog");
  if (humans.length === 0) return null;
  const hasElsie = party.some((a) => a.species === "dog");
  const heldItems = Array.isArray(itemIds) ? itemIds : [];
  let bandages = heldItems.filter((id) => id === "item_bandage").length; // 包帯総数（エルシーは運び手：所持分も人間が使う）
  const hasSmoke = heldItems.includes("item_smoke");
  const effectiveIds = Array.isArray(quest.battleEffectiveItemIds) ? quest.battleEffectiveItemIds : [];
  // ★ 有効な支給品は「残り個数」で判断に効く（2026-07-30）。持っているだけの固定値ではない。
  let medicalLeft = heldItems.filter((id) => effectiveIds.includes(id)).length;
  const bandageIsEffective = effectiveIds.includes("item_bandage");
  const context = { hasElsie, hasSmoke, medicalLeft };

  const fighters = humans.map((a) => {
    const combatStat = a.stats?.combat ?? 10;
    const survivalStat = a.stats?.survival ?? 10;
    // 保存値は 0〜50、与ダメ式に入るのはその 1/10（2026-07-30。guard と同じ流儀に揃えた）
    const weaponPower = (a.weapon?.power ?? 0) * BATTLE_TUNING.powerScale;
    // HP = job基礎値 + survival×0.6（2026-07-23 255スケール移行。盾役>戦士の序列）
    const maxHp = Math.round((BATTLE_TUNING.jobBaseHp[a.job] ?? BATTLE_TUNING.defaultJobBaseHp) + survivalStat * BATTLE_TUNING.hpPerSurvival);
    return {
      id: a.id,
      name: getDisplayName(a),
      job: a.job,
      personality: a.personality,
      courage: a.tendencies?.courage ?? 3, // 前衛選出の第3キー（同率のときだけ効く）
      combat: combatStat,
      support: a.stats?.support ?? 10,
      // 与ダメは平方根型：成長を実感しつつ終盤のインフレを圧縮する
      attack: Math.sqrt(combatStat) * BATTLE_TUNING.attackSqrtCombatCoef + weaponPower * BATTLE_TUNING.attackWeaponCoef,
      weaponPower,
      // 保存値は 0〜50、実際に引くのはその 1/10（2026-07-30。刻みを細かくするためのスケール）
      weaponGuard: (a.weapon?.guard ?? 0) * BATTLE_TUNING.guardScale,
      hp: maxHp,
      maxHp,
      downed: false,
      gotCrit: false, // クリティカルを受けたか。これが深手の定義（2026-07-29）
      taken: 0, // 合計被ダメ。これが maxHp の critMinHpRatio 未満なら負傷にしない（2026-07-31）
      status: "健在"
    };
  });

  const partyMaxHp = fighters.reduce((sum, f) => sum + f.maxHp, 0);
  let enemyHp = enemy.hp;
  const decisions = [];
  const roundLog = [];
  const events = []; // 交戦記録用イベント列（案B・スライス1）。既存ロジックからの派生記録のみ。
  let totalDamageTaken = 0; // 累積被ダメ（回復で戻さない総被弾）。stage判定の基準（2026-07-23）
  let emergencyCount = 0; // 段階2（動揺）の発火回数（emergencyCapまで）
  let shakenOnce = false; // 段階2が一度でも起きたか。以後は毎ラウンド段階4を回す（段階3）
  let retreatFailures = 0; // 撤退に失敗した回数（失敗したら戦闘続行）
  let voteSeen = false; // 撤退票が初めて出たか（ログの節目・条件2）
  let majoritySeen = false; // 撤退票が過半に達したか（ログの節目・条件2）
  let falterSeen = false; // 敵の勢いが落ちたことを一度書いたか
  let outcome = null;
  let rounds = 0;

  const allyRatio = () => fighters.reduce((sum, f) => sum + Math.max(0, f.hp), 0) / partyMaxHp;
  const enemyRatio = () => Math.max(0, enemyHp) / enemy.hp;
  const variance = () => BATTLE_TUNING.varianceMin + random() * (BATTLE_TUNING.varianceMax - BATTLE_TUNING.varianceMin);

  // 撤退票の変化は節目だけ書く（条件2・2026-07-30）。初めて出た／過半に達した、の2回だけ。
  const logVoteMilestone = (decision, round) => {
    const majorityNow = decision.retreat && !majoritySeen;
    // 初めて票が出た。ただし同じ判断で過半にも達したなら、そちらだけ書く（同趣旨の2行を並べない）。
    if (decision.retreatCount > 0 && !voteSeen) {
      voteSeen = true;
      if (!majorityNow) {
        const firstVoter = decision.votes.find((v) => v.retreat);
        events.push({ type: "vote", milestone: "first", round, name: firstVoter?.name ?? "誰か", count: decision.retreatCount, needed: decision.needed });
      }
    }
    if (majorityNow) {
      majoritySeen = true;
      events.push({ type: "vote", milestone: "majority", round, count: decision.retreatCount, needed: decision.needed });
    }
  };
  // 撤退の実行判定。失敗したら戦闘続行（エルシーがいれば必ず成功する）。
  const tryRetreat = () => {
    if (hasElsie) return true;
    const chance = BATTLE_TUNING.retreatSuccessBase + (hasSmoke ? BATTLE_TUNING.retreatSuccessSmokeBonus : 0);
    return random() < chance;
  };

  // ★段階1（接敵）：戦うか、挑まずに引き返すか。予想ラウンド数で判断する（2026-07-30 裁定・論点1=A）。
  // ★ `battleAmbush` の依頼は段階1を経ない（2026-09-13・EX-092）。**相手から仕掛けられるので
  //   「挑むかどうか」の判断がそもそも起きない。** 撤退は段階2〜4でこれまでどおり成立する。
  //   ⚠️ decisions / logVoteMilestone / events の3行ごと囲うこと。`first` を null にして if だけ
  //     書き替えると `logVoteMilestone(null)` と `first.ratio` で落ちる。
  //   ★ 副作用として `withdraw_first` が出なくなる＝観察記録の抑制（この下の報告書側）も外れる。
  //     夜道 v2 で生態目録が残るのはこれが理由。
  context.medicalLeft = medicalLeft;
  const ambush = quest.battleAmbush === true;
  let first = null;
  if (!ambush) {
    first = computeBattleResolveDecision(fighters, enemyHp, enemy, context, "first");
    decisions.push({ at: "first", ...first });
    logVoteMilestone(first, 0);
    events.push({ type: "retreat", at: "first", round: 0, retreat: first.retreat, ratio: first.ratio });
  }
  if (first && first.retreat) {
    outcome = "withdraw_first";
  } else {
    for (let round = 1; round <= BATTLE_TUNING.maxRounds; round++) {
      rounds = round;
      const alive = fighters.filter((f) => !f.downed);
      // 損耗DPS低下：状態語に応じて与ダメが段階的に落ちる（健在100%/手負い80%/深手50%）
      const offense = alive.reduce((sum, f) => sum + f.attack * (BATTLE_TUNING.woundAttackMult[f.status] ?? 1), 0);
      const dealt = Math.round(offense * variance());
      let dealtTotal = dealt;
      // 与ダメージを各人の攻撃寄与で按分（表示用の派生値。合計 dealt は既存計算のまま）。
      // クリティカルは1発ごとに判定し、上振れした分だけ合計にも足す（与える側も同じ発生率・同じ表記）。
      if (offense > 0 && dealt > 0) {
        alive.forEach((f) => {
          const effAttack = f.attack * (BATTLE_TUNING.woundAttackMult[f.status] ?? 1);
          const base = Math.round(dealt * (effAttack / offense));
          if (base > 0) {
            const crit = random() < BATTLE_TUNING.critRate;
            const personDealt = crit ? base * BATTLE_TUNING.critMultiplier : base;
            if (crit) dealtTotal += personDealt - base;
            // strong=自分の期待値（損耗後）より上振れした一撃。クリティカルとは別軸なので素の値で判定する。
            events.push({ type: "deal", round, attackerId: f.id, attackerName: f.name, damage: personDealt, crit, strong: !crit && base >= effAttack * BATTLE_TUNING.strongDealRatio, attackerStatus: f.status });
          }
        });
      }
      enemyHp -= dealtTotal;
      const front = pickBattleFront(fighters);
      const incoming = enemy.threat * variance();
      const others = alive.filter((f) => f.id !== front.id);
      const hits = [];
      let woundedThisRound = false;
      let crisis = null; // このラウンドで深手/戦闘不能になった最重度の者（臨時撤退判断のトリガー）
      alive.forEach((f) => {
        const frontShare = others.length > 0 ? BATTLE_TUNING.frontDamageShare : 1;
        const share = f.id === front.id
          ? incoming * frontShare
          : incoming * (1 - BATTLE_TUNING.frontDamageShare) / others.length;
        const base = Math.max(0, Math.round(share - f.weaponGuard));
        // ★ クリティカル＝深手。guard で削り切られた0ダメージの被弾では判定しない
        //   （傷を負っていないのに深手になるのを避ける）。
        // ★ 2026-07-31：その延長で、**その人にとって軽すぎる一撃でも判定しない**。
        //   かすり傷で「致命の一撃を受けた」と書かれ、重症で帰されるのを止めるため。
        // ★★ クリティカルは**1発あたり**で判定する。「その一撃が致命か」を見るので単発で正しい
        //    （負傷の下限は同じ 5% でも**累積**に当てる。適用する単位が違う。下の taken を参照）。
        const crit = base > 0 && base >= f.maxHp * BATTLE_TUNING.critMinHpRatio && random() < BATTLE_TUNING.critRate;
        const damage = crit ? base * BATTLE_TUNING.critMultiplier : base;
        if (crit) f.gotCrit = true;
        f.taken += damage; // 合計被ダメ（回復で戻さない）。負傷の下限判定に使う
        f.hp -= damage;
        if (f.hp <= 0) f.downed = true;
        hits.push({ id: f.id, damage, hp: Math.max(0, f.hp) });
        totalDamageTaken += damage;
        if (damage > 0) {
          events.push({ type: "take", round, targetId: f.id, targetName: f.name, damage, crit, strong: !crit && damage >= f.maxHp * BATTLE_TUNING.strongTakeHpRatio });
        }
        // 状態語は遷移した瞬間だけ記録する（健在→手負い→深手→戦闘不能）。
        const newStatus = battleStatusWord(f.hp, f.maxHp, f.gotCrit);
        if (newStatus !== f.status) {
          events.push({ type: "status", round, targetId: f.id, targetName: f.name, from: f.status, to: newStatus });
          f.status = newStatus;
          if (newStatus === "手負い" || newStatus === "深手") woundedThisRound = true;
          if (newStatus === "深手" && (!crisis || crisis.to !== "戦闘不能")) crisis = { name: f.name, to: "深手" };
          if (newStatus === "戦闘不能") crisis = { name: f.name, to: "戦闘不能" };
        }
      });
      roundLog.push({ round, dealt: dealtTotal, enemyHp: Math.max(0, enemyHp), frontId: front.id, hits });
      // 敵の勢いが落ちた瞬間（撤退を留める根拠になるので、報告書にも一度だけ書く）
      if (!falterSeen && enemyHp > 0 && enemyRatio() <= BATTLE_TUNING.enemyLowHpRatio) {
        falterSeen = true;
        events.push({ type: "enemy_falter", round });
      }
      if (enemyHp <= 0) {
        outcome = "victory";
        break;
      }
      if (fighters.every((f) => f.downed)) {
        outcome = "defeat";
        break;
      }
      // 回復（B案・スライス5）：このラウンドで手負い/深手が出たら、support最大の生存者が包帯1個で手当てする。
      // 勝敗が決したラウンドでは発動しない（上のbreakより後ろに置くことで保証）。1ラウンド1回まで。
      if (woundedThisRound && bandages > 0) {
        const standing = fighters.filter((f) => !f.downed);
        const healer = [...standing].sort((a, b) => b.support - a.support)[0];
        const severity = { "深手": 2, "手負い": 1 };
        const target = [...standing].filter((f) => severity[f.status]).sort((a, b) => severity[b.status] - severity[a.status])[0];
        if (healer && target) {
          bandages -= 1;
          if (bandageIsEffective) medicalLeft = Math.max(0, medicalLeft - 1);
          const healed = Math.min(BATTLE_TUNING.healAmount, target.maxHp - target.hp);
          target.hp += healed;
          events.push({ type: "heal", round, healerId: healer.id, healerName: healer.name, targetId: target.id, targetName: target.name, amount: healed, self: healer.id === target.id });
          // ★ 手当てはクリティカルの深手からも持ち直させる（スライス8の「回復＝戦線を維持する」を保つ）。
          //   これで包帯が「重症で帰さないための道具」として意味を持つ。
          target.gotCrit = false;
          const backStatus = battleStatusWord(target.hp, target.maxHp, target.gotCrit);
          if (backStatus !== target.status) {
            events.push({ type: "status", round, targetId: target.id, targetName: target.name, from: target.status, to: backStatus, recovered: true });
            target.status = backStatus;
          }
          // ★ 使い切った瞬間を書く（論点3=A）。ここから先は「手当てできるから続ける」が効かなくなる。
          if (bandages === 0) events.push({ type: "supply_out", round, healerName: healer.name });
        }
      }
      // ★段階2＝想定超過の被害（スライス9の臨時判断をそのまま使う）：仲間が深手/戦闘不能になったラウンドの末、一行が動揺する。
      // 「動揺スコア」＝損耗＋ショック（＋エルシーの警告は本能なので維持）。
      // 道具や敵の残り体力のそろばん（包帯-20/煙幕+30/敵瀕死-25）は動揺時には働かない（2026-07-24 の裁定を維持）。
      // ★ ただし**ここで撤退は決まらない**（2026-07-30・論点2=B）。決まるのは「引こうとなった」までで、
      //   実際に退くかは直後の段階4（冷静に相手を見る）が決める。動揺と計算を別の層に分けている。
      let shakenThisRound = false;
      if (crisis && emergencyCount < BATTLE_TUNING.emergencyCap) {
        emergencyCount++;
        const shock = BATTLE_TUNING.emergencyShock[crisis.to] ?? 0;
        const emScore = Math.round((1 - allyRatio()) * 100) + shock + (hasElsie ? BATTLE_TUNING.scoreElsieBonus : 0);
        const standing = fighters.filter((f) => !f.downed);
        const yes = standing.filter((f) => emScore >= ((BATTLE_TUNING.retreatJobBase[f.job] ?? BATTLE_TUNING.retreatJobDefault) + (BATTLE_TUNING.retreatPersonalityShift[f.personality] ?? 0))).length;
        shakenThisRound = yes >= Math.ceil(standing.length / 2);
        decisions.push({ at: "emergency", score: emScore, retreat: shakenThisRound });
        events.push({ type: "retreat", at: "emergency", round, retreat: shakenThisRound, causeName: crisis.name, causeTo: crisis.to });
        shakenOnce = true; // ★段階3：ここから先は毎ラウンド判定になる
      }
      // ★段階4＝相手の様子を見て決める。段階2が一度起きたら以降は毎ラウンド回る（段階3）。
      // 撤退が成立するのはここだけ。「あと一撃で倒せる」ときは forecast と敵瀕死−25 が留める。
      if (shakenOnce) {
        context.medicalLeft = medicalLeft;
        const resolve = computeBattleResolveDecision(fighters, enemyHp, enemy, context);
        decisions.push({ at: "resolve", ...resolve });
        logVoteMilestone(resolve, round);
        // ★撤退は失敗しうる。成否をここで決めてからログに渡す（「退いた」と「退けなかった」を並べないため）。
        const succeeded = resolve.retreat ? tryRetreat() : false;
        events.push({ type: "retreat", at: "resolve", round, retreat: resolve.retreat, succeeded, afterShaken: shakenThisRound, ratio: resolve.ratio });
        if (resolve.retreat) {
          if (succeeded) { outcome = "withdraw_emergency"; break; }
          retreatFailures++; // 失敗したら戦闘続行（次ラウンドにもう一度判断する）
          events.push({ type: "retreat_failed", round });
        }
      }
    }
    if (!outcome) outcome = "stalemate";
  }

  const finalAllyRatio = allyRatio();
  const woundRatio = totalDamageTaken / partyMaxHp;
  const hadDeepWound = events.some((e) => e.type === "status" && (e.to === "深手" || e.to === "戦闘不能"));
  return {
    enemyId: enemy.id,
    enemyName: enemy.name,
    outcome,
    stage: battleStageLabel(outcome, woundRatio, hadDeepWound),
    damageTakenRatio: Math.round(woundRatio * 100) / 100,
    rounds,
    allyHpRatio: Math.round(finalAllyRatio * 100) / 100,
    enemyHpRatio: Math.round(enemyRatio() * 100) / 100,
    frontId: pickBattleFront(fighters)?.id ?? fighters[0].id,
    // injuryHpRatio＝負傷の判定に渡すHP率。合計被ダメが maxHp の critMinHpRatio 未満なら無傷（1.0）、
    // それ以上なら従来どおり帰還時のHP率。★「取るに足らない」を**結果に対して**判定する。
    members: fighters.map((f) => ({
      id: f.id,
      name: f.name,
      job: f.job,
      hp: Math.max(0, f.hp),
      maxHp: f.maxHp,
      downed: f.downed,
      gotCrit: f.gotCrit,
      taken: f.taken,
      injuryHpRatio: f.taken < f.maxHp * BATTLE_TUNING.critMinHpRatio
        ? 1
        : (f.maxHp > 0 ? Math.max(0, f.hp) / f.maxHp : 1)
    })),
    retreatFailures,
    decisions,
    roundLog,
    events,
    smoke: { held: hasSmoke, questContinues: hasSmoke && outcome === "withdraw_first" }
  };
}

window.debugBattleSim = function (questId = "quest_barn_bite", trials = 20, partyIds = null) {
  const quest = window.masterQuests.find((q) => q.id === questId);
  if (!quest) return console.warn(`依頼が見つかりません: ${questId}`);
  const ids = partyIds ?? ["adv_mina", "adv_gadd", "adv_elne", "adv_row"];
  const party = ids
    .map((id) => window.masterAdventurers.find((a) => a.id === id))
    .filter(Boolean);
  const tally = {};
  let lastResult = null;
  for (let i = 0; i < trials; i++) {
    lastResult = simulateBattle(quest, party, [], Math.random);
    if (!lastResult) return console.warn(`敵データがありません: ${quest.enemyId ?? "enemyId未設定"}`);
    const key = `${lastResult.outcome}（${lastResult.stage}）`;
    tally[key] = (tally[key] ?? 0) + 1;
  }
  console.log(`--- debugBattleSim: ${quest.title} × ${trials}回 / 編成: ${party.map((a) => getDisplayName(a)).join("、")} ---`);
  console.table(tally);
  console.log("最終試行の詳細:", lastResult);
  // スライス1の一時確認用：交戦イベント列を出力（表示はスライス2で実装）。
  if (lastResult.events) {
    console.log(`交戦イベント列（${lastResult.events.length}件）:`);
    console.table(lastResult.events);
  }
  return tally;
};
// === 戦闘エンジンここまで ====================================================

// === 非戦闘依頼の共通経路（工程エンジン） ====================================
// ★ なぜあるか（2026-07-29 裁定B／2026-07-31 論点1〜4=A）：
//   17件のうち戦闘を通るのは隊商護衛だけで、残りは候補配列から pickOne するだけだった。
//   編成も支給品も成否に届いていない＝依頼の性質ではなく実装都合で安全度が分かれていた。
// ★ 全件を simulateBattle に寄せる案は却下済み（手紙の配達に敵を作るのは設定を曲げている）。
//   非戦闘の「敵」は**天候と疲労の2つだけ**。道中の事故・時間帯・依頼固有の脅威は後回し。
// ★ 撤退判断は入れない（論点1=A）。**非戦闘には勝敗がない。** 撤退判断は
//   「こいつに勝つ手段がもうない」を判定する仕組みで、草むしりや配達には対応する概念がない。
//   「引き返す」は成果の程度なので、結末の格下げ（完遂→部分→未達）で表す。
//   ★ 共有しないことで、戦闘側の撤退を直しても非戦闘は動かない（切り分けが保てる）。
// ★ 判定入力は「その依頼で伸びる stat」（論点2=A）。GROWTH_STAT_BY_CATEGORY をそのまま使い、
//   **伸びる stat ＝ 使う stat** で一貫させる。対応表を2つ持たない（成長用と判定用で腐るため）。
//   これで exploration / investigation / negotiation が初めて判定入力になる。
// ★ 天候と疲労は別々に持つ（論点3=A）。畳むと「何のせいで失敗したか」が報告書に書けない。
// ★ ログは工程ログ型（論点4=A）。工程を2〜4回し、**動いた工程だけ**書く。
const FIELDWORK_TUNING = {
  phasesMin: 2,
  phasesMax: 4,
  // 天候＝依頼の難度に乗る固定値。遠征の間ずっと同じ重さでかかる。
  // ★ キーは実際の天候名と一致させる（2026-09-12・EX-083）。「強風」と書かれていたため表に当たらず、
  //   風が強い日は既定値4（＝曇りと同じ）で動いていた。意図の7が一度も効いていなかった。
  // ★ 未実装の天候は表に載せない（2026-09-12・EX-084）。載せたままだと「実装済みだが効いていない」のか
  //   「未実装」のか読めず、上の故障（強風）と同じ見た目になる。
  //   消した値は記録として残す：「雨上がり」＝3 ／ 「雨」＝11（将来この2つを実装するときの出発点）。
  weatherLoad: { "晴れ": 0, "曇り": 4, "風が強い": 7, "霧": 8, "小雨": 8 },
  defaultWeatherLoad: 4,
  // 危険度の基礎負荷。★ 育成値と同じ目盛りで置く（現状の値は 10〜28）。
  dangerLoad: { "低": 17, "中": 24, "高": 30 },
  defaultDangerLoad: 17,
  // 疲労＝**遠征中だけ**のカウンタ。工程をこなすごとに増える。ユニットの永続状態としては持たない。
  //   人数が少ないほど1人あたりの負担が重い（少人数の不利はここで出す）。
  fatigueBase: 3,
  fatigueSmallPartyExtra: 1.5,
  fatigueSetbackExtra: 3,
  // 工程が滞る確率＝ floor + (負荷 − 力量) ÷ scale。★ 乱数の閾値ではなく確率で置くのは、
  //   「力量が1上がると何%変わるか」がそのまま読めるようにするため（1/60 ＝ 育成値1でおよそ1.7%）。
  setbackFloor: 0.10,
  setbackScale: 60,
  setbackMin: 0.03,
  setbackMax: 0.6,
  // 支給品。ランタンは時間帯の話なので入れない（時間帯は後回しと確定済み）。観察記録票は記録用で判定に効かない。
  mapLoadRelief: 5,
  mapCategories: ["探索", "輸送", "捜索", "護衛", "記録"], // ★ 2026-09-15（EX-104）に「救助」を統合して落とした（捜索が既に入っている）
  potFatigueRelief: 6,
  oilcaseWeatherRelief: 0.5,
  whistleRecoverMax: 1,
  bandageStaminaBack: 14,
  // 消耗（＝負傷の元）。★ 1回の滞りでは負傷しない大きさにしてある（軽症の閾値は余力70%）。
  //   同じ者に2回続けて来たときだけ負傷する＝人数が多いほど散る（前衛集中は戦闘の話）。
  // ★ 下限を 0.5 に置いているので、非戦闘では構造的に軽症までしか出ない
  //   （重症になるのはクリティカルを受けたか HP0 のときだけで、どちらもここでは起こらない）。
  staminaHitMin: 12,
  staminaHitMax: 22,
  minStaminaRatio: 0.5,
  // ★ 結末の閾値は「滞った工程の比率」で置く（2026-09-11・EX-077）。絶対件数（旧 1／2 件）だと
  //   工程数と難度が癒着し、工程数を変えた瞬間に難度が別物になる（上限4→8 で完遂 71.3%→48.0%）。
  //   「4工程中2つ滞った」と「8工程中2つ滞った」が同じ結果になるのは、工程数を変えなくても既に歪み。
  setbackRatioPartial: 0.25,
  setbackRatioFail: 0.5,
  // ★ 未達には最低2件が要る＝**一度のつまずきでは未達にしない**。丸めの都合ではなく設計判断そのもの
  //   なので式に残す。効くのは2工程のときだけ（3工程以上は ceil(0.5×n) が既に2以上）。
  //   ★ 部分側に同じ下限は要らない（ceil(0.25×n) は n>=1 で常に1以上）。
  setbacksForFailMin: 2
};

// 依頼で使う stat の平均力量。★ その stat を一番持っている者が担当する、という読み方（最大値を採る）。
// エルシーも数えるのは、鼻と警戒が実際に工程の助けになるため（消耗は負わない＝下の workers から外す）。
// ★ statKeys を受け取る版（2026-08-06・EX-054）。工程ごとに参照する育成値を変えられるように
//   分けただけで、計算は元のまま。ジャンル表からの導出は下の fieldworkCapability が持つ。
// ★ humanOnly（2026-08-06・EX-056）：**担い手を選ぶときだけ**犬を外す。力量の合計は従来どおり
//   全員から採る（＝エルシーの鼻と警戒は工程を助けている、という既存の読みを崩さない）。
//   犬に「読む」「手当てを整える」等をさせないためで、除外するのは**名前が文に出る側**だけ。
function capabilityForStats(statKeys, party, options = {}) {
  const humanOnly = options.humanOnly === true;
  // ★ 判定用語彙のフィルタ（2026-09-11・EX-074。EX-061 から続く接続の第一段）。
  //   工程の行為（How）の語を持つ者だけを担い手の候補にする。
  //   ★ 力量（capability）には一切効かせない。絞るのは担い手＝名前が文に出る側だけ（EX-056 と同型）。
  //   ★ 向き（dir）は見ない。苦手（−）を持つ者も候補に残す
  //     （「苦手な人がやってしまった」報告書に価値があるため。− は文面の選択にだけ使う）。
  //   ★ 対象（What）は問わない。行為が一致すれば候補。
  //   ★ 語を持つ者が0人なら絞らない（現状どおり全員から選ぶ）。
  const acts = Array.isArray(options.acts) && options.acts.length > 0 ? options.acts : null;
  const eligible = party.filter((adv) => !humanOnly || isHumanAdventurer(adv));
  const spoken = acts ? eligible.filter((adv) => hasVocabAct(adv, acts)) : [];
  const candidates = spoken.length > 0 ? spoken : eligible;
  const holders = [];
  const total = statKeys.reduce((sum, key) => {
    let best = 0;
    party.forEach((adv) => {
      const value = adv.stats?.[key] ?? 0;
      if (value > best) best = value; // 力量はこれまでどおり（犬も数える・絞り込みの影響を受けない）
    });
    let holder = null;
    let holderValue = 0;
    candidates.forEach((adv) => {
      const value = adv.stats?.[key] ?? 0;
      if (value > holderValue) { holderValue = value; holder = adv; }
    });
    if (holder) holders.push({ key, adv: holder, value: holderValue });
    return sum + best;
  }, 0);
  // vocabFiltered＝語で実際に絞れたか（false なら語を持つ者が0人でフォールバックした）
  return { capability: statKeys.length > 0 ? total / statKeys.length : 0, holders, vocabFiltered: spoken.length > 0 };
}

// 工程の表を、回す工程数ぶんに**均等に間引いて**引く（2026-09-11・EX-078）。
// ★ 旧実装（steps[phase-1]＝先頭から N 行だけ読む）だと、表が工程数より長い依頼で
//   **末尾が永久に読まれなかった**（data-vocab.js の102行中32行＝18依頼中12依頼で、
//   到達不能な行にしか出ない行為の語があった）。均等間引きなら**始まりと終わりの行が必ず入る**。
// ★ quest.fieldworkSteps（育成値・humanOnly・label）と masterVocab.questSteps（acts）の
//   **両方に同じ写像を当てる**。片方だけ直すと、同じ phase が別々の工程を指す
//   （酒場は旧実装で既にそうなっていた＝宣言は「樽を担ぐ」なのに語は「樽を受け取る」の行）。
function fieldworkStepIndex(rowCount, phase, phases) {
  if (!(rowCount > 0)) return -1;
  const n = Math.max(1, phases || 1);
  // ★ 工程が1回だけ（または表が1行）のときはゼロ除算になるので先頭を返す。
  if (n <= 1 || rowCount === 1) return 0;
  const i = Math.round(((phase - 1) * (rowCount - 1)) / (n - 1));
  return Math.min(rowCount - 1, Math.max(0, i));
}

// 工程の行為の語。★ data-vocab.js の questSteps はその依頼の工程を順番に並べた表で、
//   工程エンジンが回す数ぶんを上の写像で間引いて引く。
//   宣言が無い／その位置に工程が無い／語が空 のときは null を返し、呼び出し側は絞らない。
function fieldworkStepActs(quest, phase, phases) {
  const steps = window.masterVocab?.questSteps?.[quest?.id];
  if (!Array.isArray(steps)) return null;
  const acts = steps[fieldworkStepIndex(steps.length, phase, phases)]?.acts;
  if (!Array.isArray(acts) || acts.length === 0) return null;
  return acts;
}

// その者がその行為の語を持っているか。★ 向き（dir）も対象（targets）も見ない。
function hasVocabAct(adventurer, acts) {
  const entries = window.masterVocab?.adventurers?.[adventurer?.id];
  if (!Array.isArray(entries)) return false;
  return entries.some((e) => Array.isArray(e.acts) && e.acts.some((a) => acts.includes(a)));
}

// 工程の宣言（quest.fieldworkSteps）を読む。宣言がなければ null を返し、
// 呼び出し側はジャンル表（GROWTH_STAT_BY_CATEGORY）へフォールバックする。
// ★ ジャンル表は廃止しない。宣言は「その工程だけ別の育成値を見る」ための上書き。
function fieldworkStepStats(quest, phase, phases) {
  const steps = Array.isArray(quest?.fieldworkSteps) ? quest.fieldworkSteps : null;
  if (!steps) return null;
  const step = steps[fieldworkStepIndex(steps.length, phase, phases)];
  if (!step) return null;
  if (Array.isArray(step.stats) && step.stats.length > 0) return step.stats;
  return step.stat ? [step.stat] : null;
}

// 「この工程の担い手は人間だけ」の宣言（2026-08-06・EX-056）。EX-054 の宣言の2つ目。
// ★ 工程ごと（`fieldworkSteps[i].humanOnly`）が優先。工程の宣言を持たない依頼は
//   依頼ごと（`quest.fieldworkHumanOnly`）で同じことを宣言する。**同じ鍵を2段で読むだけで、
//   対応表は増やさない**（工程を宣言していない依頼は全工程が同じ担い手のため、依頼単位で足りる）。
function fieldworkStepHumanOnly(quest, phase, phases) {
  const steps = Array.isArray(quest?.fieldworkSteps) ? quest.fieldworkSteps : null;
  const step = steps ? steps[fieldworkStepIndex(steps.length, phase, phases)] : null;
  if (step && typeof step.humanOnly === "boolean") return step.humanOnly;
  return quest?.fieldworkHumanOnly === true;
}

function fieldworkCapability(quest, party) {
  const statKeys = growthStatsForCategory(quest.category);
  // ★ 誰がその育成値の最大値を持っているかも返す（2026-08-04・EX-050）。
  //   「滞らなかったのは誰のおかげか」を書くために要る。新しい値は持たず、
  //   既に取っている最大値の持ち主を控えるだけ。capability の計算は変えていない。
  // ★ 依頼が「担い手は人間だけ」を宣言していれば、ここの持ち主からも犬を外す（2026-08-06・EX-056）。
  //   ここの持ち主は `fw.lead`／`fw.support`＝「効いた瞬間」の主語になる。
  return { statKeys, ...capabilityForStats(statKeys, party, { humanOnly: quest?.fieldworkHumanOnly === true }) };
}

function simulateFieldwork(quest, party, itemIds, rng, options = {}) {
  const random = rng ?? Math.random;
  const workers = party.filter((a) => isHumanAdventurer(a)); // 消耗を負うのは人間だけ（犬は工程の負傷対象にしない）
  if (workers.length === 0) return null;
  const { statKeys, capability, holders } = fieldworkCapability(quest, party);
  const held = Array.isArray(itemIds) ? itemIds : [];
  const events = [];

  const weather = options.weather ?? "晴れ";
  let weatherLoad = FIELDWORK_TUNING.weatherLoad[weather] ?? FIELDWORK_TUNING.defaultWeatherLoad;
  if (held.includes("item_oilcase") && weatherLoad > 0) {
    const relieved = Math.round(weatherLoad * FIELDWORK_TUNING.oilcaseWeatherRelief);
    events.push({ type: "item", itemId: "item_oilcase", weather });
    weatherLoad = relieved;
  }
  let baseLoad = FIELDWORK_TUNING.dangerLoad[quest.danger] ?? FIELDWORK_TUNING.defaultDangerLoad;
  if (held.includes("item_map") && FIELDWORK_TUNING.mapCategories.includes(quest.category)) {
    baseLoad = Math.max(0, baseLoad - FIELDWORK_TUNING.mapLoadRelief);
    events.push({ type: "item", itemId: "item_map" });
  }

  const fatigueStep = FIELDWORK_TUNING.fatigueBase +
    FIELDWORK_TUNING.fatigueSmallPartyExtra * Math.max(0, MAX_PARTY_SIZE - party.length);
  let fatigue = 0;
  let potLeft = held.filter((id) => id === "item_pot").length;
  let whistleLeft = Math.min(FIELDWORK_TUNING.whistleRecoverMax, held.filter((id) => id === "item_whistle").length);
  let bandages = held.filter((id) => id === "item_bandage").length;
  const stamina = {};
  workers.forEach((adv) => { stamina[adv.id] = 100; });

  // ★ 工程数の決め方と宣言を切り離した（2026-08-13・EX-057）。
  //   `fieldworkPhases` があればその固定数（乱数を引かない）、無ければ従来どおり乱数 2〜4。
  //   `fieldworkSteps` は工程ごとの宣言（参照 stat・humanOnly）だけを持ち、**数は決めない**。
  //   ★ 宣言の要素数で数を決める形（EX-054）だと、乱数で数を決めている依頼に宣言を足した瞬間に
  //     工程数が固定され、不一致0を保てなかった（EX-057 の停止理由）。
  //   工程数より宣言が少ない依頼は、余った工程がジャンル表を見る（従来のフォールバックのまま）。
  const phasesMin = FIELDWORK_TUNING.phasesMin;
  const phasesMax = FIELDWORK_TUNING.phasesMax;
  const phases = typeof quest.fieldworkPhases === "number"
    ? Math.max(1, quest.fieldworkPhases)
    : phasesMin + Math.floor(random() * (phasesMax - phasesMin + 1));
  // その回で実際に見た育成値。★ 成長側はここを読む（対応表を2つに割らないため）。
  const usedStats = new Set();
  const stepLeads = [];
  let setbacks = 0;
  const causeCount = { weather: 0, fatigue: 0, skill: 0 };

  for (let phase = 1; phase <= phases; phase++) {
    // 携帯鍋：疲労が積もったところで一度だけ休憩を挟む
    if (potLeft > 0 && fatigue >= FIELDWORK_TUNING.potFatigueRelief) {
      potLeft -= 1;
      fatigue = Math.max(0, fatigue - FIELDWORK_TUNING.potFatigueRelief);
      events.push({ type: "rest", phase, itemId: "item_pot" });
    }
    const fatigueNow = Math.round(fatigue);
    const load = baseLoad + weatherLoad + fatigueNow;
    // ★ 工程ごとに参照する育成値を切り替える（2026-08-06・EX-054）。
    //   宣言がなければ冒頭で1回だけ計算した capability をそのまま使う（従来どおり）。
    const stepStats = fieldworkStepStats(quest, phase, phases);
    // ★ 工程の行為の語で担い手の候補を絞る（2026-09-11・EX-074）。
    //   育成値の宣言（stepStats）が無い依頼でも、語があればここで絞る＝工程単位で効く。
    const stepActs = fieldworkStepActs(quest, phase, phases);
    let stepCapability = capability;
    let phaseHolders = holders; // 宣言のない工程の担い手＝依頼単位の持ち主（humanOnly も依頼単位と同じ）
    let vocabFiltered = false;
    if (stepStats || stepActs) {
      const got = capabilityForStats(stepStats ?? statKeys, party, {
        humanOnly: fieldworkStepHumanOnly(quest, phase, phases), // 宣言が無ければ依頼単位に落ちる
        acts: stepActs
      });
      // ★ 力量は育成値の宣言があるときだけ差し替える。語だけのときは触らない
      //   （同じ育成値・同じパーティなら値は同じだが、滞りの判定に一切触れないことを構造で保証する）。
      if (stepStats) {
        stepCapability = got.capability;
        stepStats.forEach((k) => usedStats.add(k));
      }
      phaseHolders = got.holders;
      vocabFiltered = got.vocabFiltered;
    } else {
      // 宣言のない工程はジャンル表を見ている。★ 使ったものとして記録する
      //   （「伸びる stat ＝ 使う stat」。宣言と無宣言が混ざった依頼で漏れないように）。
      statKeys.forEach((k) => usedStats.add(k));
    }
    // ★ 担い手は全工程で控える（2026-08-13・EX-057）。宣言のある工程だけ控える形だと
    //   「効いた瞬間」が依頼単位の担い手（fw.support）しか読めず、per-step の humanOnly が
    //   どこにも効かなかった（EX-057 の停止理由の2つ目）。
    // ★ label と species も運ぶ（2026-08-18・EX-057）。文面の階層（工程固有＞種族固有＞基層）を
    //   選ぶための材料で、判定には使わない。
    const top = phaseHolders.reduce((best, h) => (best && best.value >= h.value ? best : h), null);
    if (top) {
      stepLeads.push({
        phase, statKey: top.key, id: top.adv.id, name: getDisplayName(top.adv), value: top.value,
        species: top.adv.species ?? null,
        label: (Array.isArray(quest.fieldworkSteps)
          ? quest.fieldworkSteps[fieldworkStepIndex(quest.fieldworkSteps.length, phase, phases)]?.label
          : null) ?? null,
        // ★ 語彙の接続の診断用（2026-09-11・EX-074）。判定には使わない。
        //   acts＝その工程の行為の語／vocabFiltered＝語で実際に絞れたか（false＝語を持つ者が0人）
        acts: stepActs ?? null,
        vocabFiltered
      });
    }
    const chance = Math.min(FIELDWORK_TUNING.setbackMax, Math.max(FIELDWORK_TUNING.setbackMin,
      FIELDWORK_TUNING.setbackFloor + (load - stepCapability) / FIELDWORK_TUNING.setbackScale));
    const stalled = random() < chance;
    fatigue += fatigueStep;
    if (!stalled) continue; // 動かなかった工程は書かない（論点4=A）
    // 笛：一度だけ、はぐれかけた工程を立て直す
    if (whistleLeft > 0) {
      whistleLeft -= 1;
      events.push({ type: "recover", phase, itemId: "item_whistle" });
      continue;
    }
    // 何のせいで滞ったか。★ ここを残すために天候と疲労を分けて持っている（論点3=A）。
    let cause = "skill";
    if (weatherLoad > 0 && weatherLoad >= fatigueNow) cause = "weather";
    else if (fatigueNow > 0) cause = "fatigue";
    causeCount[cause] += 1;
    setbacks += 1;
    fatigue += FIELDWORK_TUNING.fatigueSetbackExtra;
    const hitAdv = workers[Math.floor(random() * workers.length)]; // 前衛集中は戦闘の話。非戦闘では偏らせない
    const hit = Math.round(FIELDWORK_TUNING.staminaHitMin +
      random() * (FIELDWORK_TUNING.staminaHitMax - FIELDWORK_TUNING.staminaHitMin));
    stamina[hitAdv.id] = Math.max(FIELDWORK_TUNING.minStaminaRatio * 100, stamina[hitAdv.id] - hit);
    events.push({ type: "setback", phase, cause, weather, id: hitAdv.id, name: getDisplayName(hitAdv) });
    if (bandages > 0 && stamina[hitAdv.id] <= 70) {
      bandages -= 1;
      stamina[hitAdv.id] = Math.min(100, stamina[hitAdv.id] + FIELDWORK_TUNING.bandageStaminaBack);
      events.push({ type: "care", phase, itemId: "item_bandage", name: getDisplayName(hitAdv) });
    }
  }

  // ★ 比率で判定する（2026-09-11・EX-077）。切り上げ。現行の工程数は 2〜4 なので閾値は 1／2 のままで、
  //   現行の全依頼で恒等（5工程から分かれる）。★ ここは乱数を引かない位置なので、同一シードの結果は動かない。
  const partialAt = Math.ceil(FIELDWORK_TUNING.setbackRatioPartial * phases);
  const failAt = Math.max(FIELDWORK_TUNING.setbacksForFailMin,
    Math.ceil(FIELDWORK_TUNING.setbackRatioFail * phases));
  // ★ 初回だけの例外（2026-08-06 裁定／2026-09-18・EX-131）。呼び出し側が `noFail` を立てた回だけ、
  //   **未達を完遂へ引き上げる**（部分はそのまま）。立てるかどうかは依頼データの `firstRunNeverFails` と
  //   その依頼の実施歴で決まり、判断は `resolveFieldwork` が持つ（ここは state を見ない）。
  // ⚠️ **ここで乱数を引かないこと。** 引くと以降の並びが動いて、関係のない依頼の結果まで変わる。
  const rawTier = setbacks >= failAt ? "fail"
    : setbacks >= partialAt ? "partial" : "full";
  const tier = options.noFail && rawTier === "fail" ? "full" : rawTier;
  const mainCause = ["weather", "fatigue", "skill"].reduce((a, b) => (causeCount[b] > causeCount[a] ? b : a), "skill");
  // ★ 効いた瞬間（2026-08-04・EX-050）：一つも滞らなかったとき、誰の力量が支えたかを控える。
  //   戦闘の「防げた瞬間」と同じ考えで、**既にある事実を拾うだけ**。滞りが出た回は
  //   そちらが書くべき変化なので控えない（畑で「深手が出た戦闘では書かない」としたのと同じ）。
  // ★ 担い手は工程単位（stepLeads）から採る（2026-08-13・EX-057）。最も効いた（値が最大の）
  //   工程の担い手が主語になる。宣言のない依頼は全工程が同じ担い手なので、従来と同じ人が選ばれる。
  const topLead = stepLeads.reduce((best, s) => (best && best.value >= s.value ? best : s), null);
  const support = setbacks === 0 && topLead
    ? { statKey: topLead.statKey, id: topLead.id, name: topLead.name, value: topLead.value, species: topLead.species, label: topLead.label }
    : null;
  // ★ lead は support と同じ持ち主を、滞りの有無によらず控えたもの（2026-08-05・EX-053）。
  //   「その工程を誰が担ったか」を書くために要る。新しい値は持たず、上で既に取っている最大値の持ち主を渡すだけ。
  const lead = topLead
    ? { statKey: topLead.statKey, id: topLead.id, name: topLead.name, value: topLead.value, species: topLead.species, label: topLead.label }
    : null;
  return {
    tier,
    setbacks,
    phases,
    support,
    lead,
    // ★ 工程ごとの担い手（宣言がある工程だけ入る）。書き分けに使う。
    stepLeads,
    // ★ その回で実際に使った育成値の和集合。宣言がなければジャンル表由来の値そのまま。
    //   成長側はここだけを読む（「伸びる stat ＝ 使う stat」を1つの表で保つ）。
    statKeys: [...usedStats],
    capability: Math.round(capability * 10) / 10,
    weather,
    weatherLoad,
    baseLoad,
    fatigue: Math.round(fatigue),
    mainCause: setbacks > 0 ? mainCause : null,
    turnedBack: tier === "fail",
    // 帰還時の余力率。負傷の確定は戦闘と同じ経路（applyInjuriesFromReport）に乗せる。
    hpRatios: Object.fromEntries(workers.map((adv) => [adv.id, stamina[adv.id] / 100])),
    events
  };
}

function fieldworkHpRatiosOf(fw) {
  return fw && fw.hpRatios ? fw.hpRatios : null;
}

// 工程ログ（論点4=A）：動いた瞬間だけを1行ずつ書く。順調だった工程は書かない。
function fieldworkLogLines(fw, rng) {
  if (!fw || !Array.isArray(fw.events)) return [];
  const lines = [];
  fw.events.forEach((ev) => {
    if (ev.type === "item" && ev.itemId === "item_map") {
      lines.push({ kind: "drama", text: `古地図と照らし合わせ、余計な回り道をせずに済んだ。` });
    } else if (ev.type === "item" && ev.itemId === "item_oilcase") {
      lines.push({ kind: "drama", text: `油紙の包みが${ev.weather}を防ぎ、濡らさずに運べた。` });
    } else if (ev.type === "rest") {
      lines.push({ kind: "drama", text: `携帯鍋で湯を沸かし、短い休憩を挟んだ。息が戻った。` });
    } else if (ev.type === "recover") {
      lines.push({ kind: "drama", text: `一度は間が空きかけたが、短い笛の音ですぐ立て直した。` });
    } else if (ev.type === "setback") {
      lines.push({ kind: "action", text: pickOne(fieldworkSetbackTexts(ev), rng) });
    } else if (ev.type === "care") {
      lines.push({ kind: "drama", text: `${ev.name}の擦り傷に包帯が巻かれ、そのまま作業に戻った。` });
    }
  });
  // ★ 効いた瞬間は最も効いた1個だけ（2026-08-04・EX-050／論点3=A）。
  //   支給品が効いた行が既にあるならそれが「効いた瞬間」なので、重ねて書かない。
  //   `support: true` は「この行が効いた瞬間である」の印（2026-08-18・EX-071）。
  //   樽の行との二重行を呼び出し側で抑制するために見る。描画は kind/text しか読まない。
  if (fw.support && lines.length === 0) {
    lines.push({ kind: "action", text: pickOne(fieldworkSupportTexts(fw.support), rng), support: true });
  }
  return lines;
}

// 誰の力量が支えたか。育成値ごとに言い方を変えるだけで、新しい値は持たない。
// ★ 階層方式の初適用（2026-08-18・EX-057）。優先順位は 工程固有 > 種族固有 > 基層。
//   - 工程固有：宣言の label で引く（樽担ぎに警戒の文が続く文脈ずれを直すため）
//   - 種族固有＋基層：犬が担い手のときは基層＋犬固有のプールから選ぶ
//   ★ 人間の抽選は従来のまま。基層を人間のプールにも足すと、同じシードで選ばれる文が
//     変わってしまう（プールの数が変わると pickOne の割り付けがずれる）ため、
//     基層が実際に抽選へ乗るのは現状犬だけ。「誰でも成立する文」という位置づけは変えない。
function fieldworkSupportTexts(support) {
  const name = support.name;
  // ① 工程固有（宣言に label がある工程で、固有文があればそちらを優先）
  const stepTable = {
    "樽を担ぐ": [`${name}が樽を担ぎ、休まず酒場から運びきった。`]
  };
  if (support.label && stepTable[support.label]) return stepTable[support.label];
  // ② 種族固有（犬）＋基層。固有文の無い育成値は下の表（基層扱い）へ落ちる
  if (support.species === "dog") {
    const dogBase = {
      exploration: [`${name}が先んじて道を確かめ、一行は迷わずに済んだ。`]
    };
    const dogTable = {
      exploration: [
        `${name}が鼻先で道を確かめ、一行は迷わずに進んだ。`,
        `分かれ道では${name}が迷わず片方へ進み、それが正しかった。`,
        `${name}は時折立ち止まって風の匂いを嗅ぎ、進む先を変えた。遠回りに見えたが、帰りにその理由が分かった。`
      ]
    };
    const pool = [...(dogBase[support.statKey] ?? []), ...(dogTable[support.statKey] ?? [])];
    if (pool.length > 0) return pool;
  }
  const table = {
    exploration: [
      `${name}が道と目印を先に読み、どの工程も引き返さずに済んだ。`,
      `迷いそうな場所では${name}が先に立ち、一行は足を止めずに進んだ。`
    ],
    investigation: [
      `${name}が見落としを先に拾い、どの工程もやり直さずに済んだ。`,
      `${name}は確認の順番を崩さず、書き損じのないまま終えた。`
    ],
    negotiation: [
      `${name}が先に話を通しておいたので、どの工程も待たされずに済んだ。`,
      `${name}の口添えで話が早く、一行は手を止めずに済んだ。`
    ],
    support: [
      `${name}が道具と手当てを先回りで整え、どの工程も滞らなかった。`,
      `${name}が段取りを整えていたので、一行は手戻りなく進んだ。`
    ],
    survival: [
      `${name}が周囲を絶やさず見ていたので、どの工程も止まらずに済んだ。`,
      `${name}が先に危ない場所を潰しておき、一行は歩みを緩めずに済んだ。`
    ],
    combat: [
      `${name}が前を空けずにいたので、どの工程も邪魔されずに済んだ。`,
      `${name}が構えを解かずにいたおかげで、一行は手を止めずに済んだ。`
    ]
  };
  return table[support.statKey] ?? [`${name}が手際よく進め、どの工程も滞らなかった。`];
}

// ★ 樽を担ぐ工程（2026-08-05・EX-053）。担ぎ手は fieldworkCapability が返す持ち主（fw.lead）で決まり、
//   言い回しはその人の tendencies で変わる。新しい値も新しい判定も持たない（既にある事実を拾うだけ）。
function tavernBarrelLine(fw, party, rng) {
  // ★ 担ぎ手は「樽を担ぐ」工程が見る育成値（survival）の持ち主（2026-08-06・EX-054）。
  //   宣言が無かった頃は依頼ジャンルの持ち主（`fw.lead`）だったので、その経路は残す。
  const lead = fw?.stepLeads?.find((s) => s.statKey === "survival") ?? fw?.lead ?? null;
  const adv = lead ? party.find((a) => a.id === lead.id) : null;
  if (!adv) return null;
  const name = getDisplayName(adv);
  // エルシーは樽を担がない（人間の行動をさせない）。付き添う形にする。
  if (!isHumanAdventurer(adv)) {
    return pickOne([
      `${name}は樽の横をぴったり歩き、荷から離れなかった。`,
      `${name}は樽の匂いを一度だけ嗅ぎ、あとは黙って歩調を合わせた。`
    ], rng);
  }
  const t = adv.tendencies ?? {};
  if ((t.courage ?? 0) >= 5) {
    return pickOne([
      `${name}は樽を肩へ担ぎ上げ、そのまま歩き出した。重さの話は一度も出なかった。`,
      `${name}が樽を抱えると、酒場の主人が「そんな軽々と」と笑った。`
    ], rng);
  }
  if ((t.kindness ?? 0) >= 5) {
    return pickOne([
      `${name}は「割れたら台無しですから」と言って、樽の口を上に保ったまま運んだ。`,
      `${name}は樽を抱え直し、重い側を自分に寄せた。`
    ], rng);
  }
  if ((t.memory ?? 0) >= 5) {
    return pickOne([
      `${name}は樽の焼き印を写し取ってから担いだ。銘柄は報告書に残った。`,
      `${name}は担ぐ前に、樽の位置と本数を数え直した。`
    ], rng);
  }
  if ((t.courage ?? 0) >= 4) {
    return pickOne([
      `${name}は樽を背に回し、足場の悪いところだけ歩幅を狭めた。`,
      `${name}は樽を担ぎ、段差の手前で一度だけ声をかけた。`
    ], rng);
  }
  if ((t.caution ?? 0) >= 4) {
    return pickOne([
      `${name}は縄の結び目を確かめてから樽を持ち上げた。道中で緩むことはなかった。`,
      `${name}は樽を担ぐ前に、通る道の段差を先に見に行った。`
    ], rng);
  }
  return pickOne([
    `${name}は文句を言いながら樽を担ぎ、それでもギルドまで運び切った。`,
    `${name}は樽の重さに一度ふらついたが、持ち直して歩き出した。`
  ], rng);
}

function fieldworkSetbackTexts(ev) {
  if (ev.cause === "weather") {
    return [
      `${ev.weather}に足元と手元を取られ、${ev.name}の手が止まった。`,
      `${ev.weather}が続き、${ev.name}は同じ工程をやり直すことになった。`
    ];
  }
  if (ev.cause === "fatigue") {
    return [
      `工程が長引き、${ev.name}の動きから精度が落ち始めた。`,
      `息が上がってきた頃、${ev.name}が手順をひとつ取りこぼした。`
    ];
  }
  return [
    `${ev.name}は勝手の分からない工程に手こずり、やり直しになった。`,
    `${ev.name}は思っていたより手間のかかる工程に足を止められた。`
  ];
}

// 結末の格下げ（論点1=A）。★ 段階ごとの候補は依頼データ（quest.outcomes）が持っている。
//   欲しい段階に候補が無ければ、その次に近い段階へ寄せる。
function pickOutcomeByTier(outcomes, tier, rng) {
  const order = tier === "full" ? ["full", "partial", "fail"]
    : tier === "partial" ? ["partial", "full", "fail"]
      : ["fail", "partial", "full"];
  const found = order.map((t) => outcomes[t] ?? []).find((list) => list.length > 0);
  return found ? pickOne(found, rng) : null;
}

// 未達の結末を持たない依頼のための共通の「引き返し」。個別に16通り書かず、1つで受ける。
function fieldworkOutcome(quest, fw, outcomes, rng) {
  if (fw && fw.tier === "fail" && (outcomes.fail ?? []).length === 0) {
    return { outcome: "引き返し", turnBack: true };
  }
  return { outcome: pickOutcomeByTier(outcomes, fw ? fw.tier : "full", rng), turnBack: false };
}

// その依頼を一度も行っていないか。★ `state` を増やさず `state.reports` から導く（EX-093／EX-102 と同じ形）。
//   遠征の完了処理は報告書を棚に載せる**前**に生成を回すので、ここに今回の回は入っていない。
function isFirstRunOfQuest(quest) {
  if (!quest) return false;
  return !(state.reports ?? []).some((report) => report.questId === quest.id);
}

// 各依頼の分岐から同じ形で呼ぶための入口。工程を回し、結末を格下げし、工程ログを作るまで。
function resolveFieldwork(quest, party, itemIds, weather, rng) {
  // ★ 初回だけの例外（2026-08-06 裁定／EX-131）。依頼データが `firstRunNeverFails` を持つ回だけ見る。
  const noFail = quest?.firstRunNeverFails === true && isFirstRunOfQuest(quest);
  const fw = simulateFieldwork(quest, party, itemIds, rng, { weather, noFail });
  const picked = fieldworkOutcome(quest, fw, questOutcomes(quest), rng);
  return { fw, outcome: picked.outcome, turnBack: picked.turnBack, logLines: fieldworkLogLines(fw, rng) };
}

// 報告書の裏に残す値。battleHpRatios は戦闘と同じ鍵で、負傷の確定は同じ経路に乗る。
function fieldworkHiddenTags(fw) {
  if (!fw) return {};
  return {
    fieldwork: {
      tier: fw.tier,
      setbacks: fw.setbacks,
      phases: fw.phases,
      cause: fw.mainCause,
      capability: fw.capability,
      stats: fw.statKeys,
      weatherLoad: fw.weatherLoad,
      fatigue: fw.fatigue
    },
    battleHpRatios: fieldworkHpRatiosOf(fw)
  };
}

function fieldworkCauseWord(fw) {
  if (!fw || !fw.mainCause) return "続けられる状態ではなくなった";
  if (fw.mainCause === "weather") return `${fw.weather}が収まらなかった`;
  if (fw.mainCause === "fatigue") return "工程が長引き、消耗が重なった";
  return "手が足りず、工程が進まなかった";
}

function fieldworkTurnBackOutcomeText(quest, party, fw) {
  const reason = fieldworkCauseWord(fw);
  return {
    result: "引き返し",
    summary: `${reason}ため、${quest.area}での作業を途中で切り上げた。`,
    line: `これ以上は続けられないと見て、${partySubject(party)}は道具をまとめ、来た道を引き返した。`,
    after: `報告書には「引き返し。${reason}」と記されている。`,
    history: `${quest.title}：引き返し。${reason}。`
  };
}

// 戦闘依頼の交戦記録（隊商護衛の drama ログとは別。あちらは隊商・荷馬車の文言を含むので分ける）。
// 動いた瞬間だけ書く方針は共通：決定的な一撃・状態の変化・手当て・退き際の4種に絞る。
function generateSimpleBattleDramaLog(battle, party, rng) {
  if (!battle || !Array.isArray(battle.events) || battle.events.length === 0) return [];
  const random = rng ?? Math.random;
  const enemyRow = Array.isArray(window.masterEnemies) ? window.masterEnemies.find((e) => e.id === battle.enemyId) : null;
  const enemyN = enemyDisplayShortName(enemyRow, "相手");
  const lines = [];
  battle.events.forEach((ev) => {
    if (ev.type === "deal" && ev.crit) {
      lines.push({ kind: "status-grave", text: `${ev.attackerName}が渾身の一撃を叩き込んだ！（${enemyN}に${ev.damage}ダメージ！）` });
    } else if (ev.type === "deal" && ev.strong) {
      lines.push({ kind: "action", text: `${ev.attackerName}の一撃が深く入った（${enemyN}に${ev.damage}ダメージ！）` });
    } else if (ev.type === "take" && ev.crit) {
      lines.push({ kind: "status-grave", text: `${enemyN}の牙が深く入った。${ev.targetName}が致命の一撃を受けた！（${ev.targetName}に${ev.damage}ダメージ！）` });
    } else if (ev.type === "status" && ev.recovered) {
      lines.push({ kind: "drama", text: `手当てが間に合い、${ev.targetName}は${ev.to}まで持ち直した。` });
    } else if (ev.type === "status" && (ev.to === "深手" || ev.to === "戦闘不能")) {
      lines.push({ kind: "status-grave", text: `${ev.targetName}が${ev.to}になった。` });
    } else if (ev.type === "heal") {
      lines.push({ kind: "drama", text: `${ev.healerName}が${ev.self ? "自分の傷" : `${ev.targetName}の傷`}に包帯を巻いた。` });
    } else if (ev.type === "retreat" && ev.at === "first" && ev.retreat) {
      lines.push({ kind: "action", text: `相手の構えを見て、${enemyN}に挑まずに引き返す判断をした。` });
    } else if (ev.type === "retreat" && ev.at === "resolve" && ev.retreat && ev.succeeded) {
      lines.push({ kind: "action", text: `これ以上は保たないと見て、${enemyN}から距離を取って退いた。` });
    } else if (ev.type === "retreat_failed") {
      lines.push({ kind: "action", text: `退こうとしたが、${enemyN}は間合いを詰めたまま離れなかった。` });
    }
  });
  // 行数が増えすぎないよう、決定打だけを残す（後ろの節目を優先して残す）
  const cap = 6;
  return lines.length <= cap ? lines : lines.slice(lines.length - cap);
}

// ★ 防げた瞬間（2026-07-31・論点3=A）。
//   被害が出なかった戦闘は報告書に何も残らず、**「何も起きなかった」としか読めなかった**。
//   畑は戦闘のチュートリアルなので、**うまく送れたときも理由が読めないと学習にならない**。
// ★★ 全部は拾わない。**最も効いた1〜2個だけ**（2026-07-30 の「書くのは変化があったときだけ」を守る。
//    長くすることと、起きたこと全部を書くことは別）。
// ★ 新しい値は使わない。`roundLog` に既にある事実（0ダメージに抑えた被弾・前衛の交代）を拾うだけ。
function battleDefenseHighlights(battle, party, rng) {
  if (!battle || !Array.isArray(battle.roundLog) || battle.roundLog.length === 0) return [];
  // 深手や戦闘不能が出た戦闘では、そちらが「書くべき変化」なのでここは黙る
  const hadDeep = battle.events.some((e) => e.type === "status" && (e.to === "深手" || e.to === "戦闘不能"));
  if (hadDeep) return [];
  const random = rng ?? Math.random;
  const enemyRow = Array.isArray(window.masterEnemies) ? window.masterEnemies.find((e) => e.id === battle.enemyId) : null;
  const enemyN = enemyDisplayShortName(enemyRow, "相手");
  const memberById = Object.fromEntries(battle.members.map((m) => [m.id, m]));
  const advById = Object.fromEntries(party.map((a) => [a.id, a]));

  // guard で 0 に抑えた被弾の回数
  const blocked = {};
  battle.roundLog.forEach((r) => {
    r.hits.forEach((h) => { if (h.damage === 0) blocked[h.id] = (blocked[h.id] ?? 0) + 1; });
  });
  const frontIds = battle.roundLog.map((r) => r.frontId);
  const wasFront = new Set(frontIds);
  const nameOf = (id) => memberById[id]?.name ?? "誰か";
  const weaponOf = (id) => advById[id]?.weapon?.name ?? null;
  // 受け切った回数が最も多い者。前に立った者と後ろにいた者は書き分ける。
  const ranked = Object.keys(blocked).sort((a, b) => blocked[b] - blocked[a]);
  const frontBlocker = ranked.find((id) => wasFront.has(id));
  const rearBlocker = ranked.find((id) => !wasFront.has(id));

  const lines = [];
  if (frontBlocker) {
    // 前に立った当人が guard で受け切った＝装備がそのまま場面になっている
    const w = weaponOf(frontBlocker);
    lines.push({ kind: "drama", text: w
      ? `${nameOf(frontBlocker)}は${w}で受け、${enemyN}の一撃は通らなかった。`
      : `${nameOf(frontBlocker)}が正面で受け止め、${enemyN}の一撃は通らなかった。` });
  } else if (rearBlocker) {
    // ★ 誰が前を塞いだから後ろに届かなかったのかを、名前で結ぶ（編成の効果を因果で書く）
    const frontId = frontIds[frontIds.length - 1];
    const w = weaponOf(frontId);
    lines.push({ kind: "drama", text: w
      ? `${nameOf(frontId)}が${w}で前を塞いでいるあいだ、${nameOf(rearBlocker)}のところまで${enemyN}の牙は届かなかった。`
      : `${nameOf(frontId)}が前を塞いでいるあいだ、${nameOf(rearBlocker)}のところまで${enemyN}の牙は届かなかった。` });
  }
  // 前衛が入れ替わったこと自体が「編成が効いた瞬間」
  if (lines.length < 2 && new Set(frontIds).size >= 2) {
    const lastName = memberById[frontIds[frontIds.length - 1]]?.name ?? "次の者";
    lines.push({ kind: "drama", text: `消耗した者を下げ、${lastName}が前へ出た。順に前を代わったので、深い傷は誰にも残らなかった。` });
  }
  // 拾えるものが何もなかったときだけ、無傷そのものを書く。
  // ★ 本当に全員が無傷のときに限る（消耗して帰った者がいるのに「傷を負わず」と書かない）。
  if (lines.length === 0 && battleAllClean(battle)) {
    lines.push({ kind: "drama", text: pickOne([
      `誰も傷を負わずに戻ってきた。かすった跡が残っている者はいたが、手当てはいらなかった。`,
      `帰ってきた一行に、手当ての要る者はいなかった。`
    ], random) });
  }
  return lines.slice(0, 2);
}

// 帰還後に負傷が1件も付かなかったか（名簿と同じ判定を使う）
function battleAllClean(battle) {
  if (!battle || !Array.isArray(battle.members)) return false;
  return battle.members.every((m) => !injuryLevelFromHpRatio(
    m.injuryHpRatio ?? (m.maxHp > 0 ? Math.max(0, m.hp) / m.maxHp : 1),
    m.gotCrit
  ));
}

// ★ 持たせたのに使わなかった支給品（2026-07-31・論点3=B）。
//   「使わなかった」と書くと読み物として弱いので、**物の状態**として書く
//   （遺品の設計と同じ形＝物の状態を書くと、使われ方が読める）。
// ★ 持たせていないものは書かない。そうすると**支給品を持たせた判断が正しかったか**の手がかりになる
//   （「要らなかった」も学習になる）。
function unusedSupplyLines(battle, party, adventurerItemIds, rng) {
  if (!battle) return [];
  // 挑まずに引き返した回は、そもそも道具の出番がない（要らなかった、とは書けない）
  if (!Array.isArray(battle.roundLog) || battle.roundLog.length === 0) return [];
  // ★ 誰かが傷を負って帰ったなら「要らなかった」ではない（道具は要ったが間に合わなかっただけ）。
  //   持たせた判断の手がかりとして書くので、本当に要らなかったときに限る。
  if (!battleAllClean(battle)) return [];
  const random = rng ?? Math.random;
  const held = getAllItemIds(adventurerItemIds);
  const lines = [];
  if (held.includes("item_bandage") && !battle.events.some((e) => e.type === "heal")) {
    const holder = supplyItemHolderName(party, adventurerItemIds, "item_bandage");
    lines.push({ kind: "drama", text: pickOne(holder ? [
      `包帯は封を切られないまま、${holder}の荷に戻ってきた。`,
      `${holder}の包帯は巻いた形のまま、結び目もほどかれずに戻ってきた。`
    ] : [
      `包帯は封を切られないまま戻ってきた。`,
      `包帯は巻いた形のまま、結び目もほどかれずに戻ってきた。`
    ], random) });
  }
  return lines;
}

window.debugFieldworkSim = function (questId = "quest_herb", trials = 200, partyIds = null, itemIds = [], weather = "晴れ") {
  const quest = window.masterQuests.find((q) => q.id === questId);
  if (!quest) return console.warn(`依頼が見つかりません: ${questId}`);
  const ids = partyIds ?? ["adv_mina", "adv_gadd", "adv_elne", "adv_row"];
  const party = ids.map((id) => window.masterAdventurers.find((a) => a.id === id)).filter(Boolean);
  const tally = { full: 0, partial: 0, fail: 0 };
  let injured = 0;
  let last = null;
  for (let i = 0; i < trials; i++) {
    last = simulateFieldwork(quest, party, itemIds, Math.random, { weather });
    if (!last) return console.warn("人間の冒険者がいません");
    tally[last.tier] += 1;
    if (Object.values(last.hpRatios).some((r) => r <= 0.7)) injured += 1;
  }
  console.log(`--- debugFieldworkSim: ${quest.title} × ${trials}回 / ${party.map((a) => getDisplayName(a)).join("、")} / ${weather} ---`);
  console.table({ ...tally, 負傷が出た回数: injured, 力量: last.capability, 使う値: last.statKeys.join("+") });
  console.log("最終試行の詳細:", last);
  return tally;
};
// === 非戦闘依頼の共通経路ここまで ============================================

// === 起動（このファイルの最後） ===============================================
// ★ 毎秒の再描画と初回描画は**必ずここ＝評価がすべて終わったあと**に置く（2026-09-18・EX-130）。
//
// ⚠️ 以前はファイルの途中（掲示板の描画のすぐ後）にあり、**実機でフリーズを起こしていた**。
//   `render()` の1行目は `checkExpeditionCompletion()` なので、**遠征中のまま所要時間が過ぎた
//   セーブでページを開くと、初回描画がそのまま報告書の生成に入る**（「閉じている間に帰還していた」
//   経路）。そこから工程エンジンが `FIELDWORK_TUNING` に触れるが、**その宣言はもっと後ろにあって
//   まだ初期化されていない**ので ReferenceError になり、**app.js の評価がその行で止まる**。
//   止まると、それ以降の定数（`BATTLE_TUNING` / `FIELDWORK_TUNING` ほか）は
//   **そのページでは永久に未定義**になる。しかも `setInterval` は先に登録されているので生き残り、
//   **毎秒同じ例外を投げ続ける**——画面は遠征中のまま止まり、報告書は1件も作られず、
//   暦だけが毎秒進む（暦を進める行が報告書の生成より前にあるため）。
//   ★ **一度踏むとリロードするまで直らない。** 保存データを初期化して遊び直しても、
//     同じページなら定数は未定義のままなので、完了時に必ず同じ例外になる。
//
// ★ **だから新しい定数やエンジンを足すときも、この2文より前に置くこと。**
//   ここを動かすと同じ事故が戻る。
setInterval(() => {
  if (state.expedition) render();
}, 1000);

render();
