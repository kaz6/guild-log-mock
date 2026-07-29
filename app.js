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
  const base = `${gameText}（実${formatRealDuration(getQuestDurationMs(quest))}）`;
  const speed = getDemoSpeed();
  if (speed === 1) return base;
  return `${base} ／ 加速中：約${formatRealDuration(getQuestDurationMs(quest) / speed)}`;
}

const app = document.getElementById("app");
const viewTitle = document.getElementById("viewTitle");
const navButtons = [...document.querySelectorAll(".nav-button")];
const resetButton = document.getElementById("resetButton");

let state = loadState();
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
    beastLog: {},
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
  const savedKeys = ["favorite", "memo", "history", "status", "nickname", "injury"]; // injury: 負傷の持続（第3段階）
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
      stats: isOldScaleStats(saved.stats) ? { ...masterItem.stats } : { ...masterItem.stats, ...(saved.stats ?? {}) }
    };
  });
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
  救助: ["exploration", "support"],
  護衛: ["survival"],
  捜索: ["exploration", "investigation"],
  記録: ["investigation"]
};

// 成否補正（スライス10）：result文字列→3段階。**新しい依頼で result を増やしたら必ずここに登録すること**（未登録は完全成功扱い＝プレイヤー不利にしない安全側）。
const GROWTH_OUTCOME_TIER = { full: 1.0, partial: 0.85, fail: 0.7 };
const GROWTH_TIER_BY_RESULT = {
  成功: "full", 討伐: "full", 追い払い: "full", 発見: "full", 保護: "full",
  無事帰宅: "full", 納品完了: "full", 時刻内納品: "full", 整理完了: "full", 拓本完了: "full",
  通行可: "full", 応急修理: "full", 安全確認: "full", 異常なし: "full", 感謝: "full",
  帰還報告: "full", 軽微な対処: "full", 持ち帰り: "full",
  採集優先: "full", 観察優先: "full", 保存優先: "full", // 方針選択＝完遂
  護衛成功: "full", "護衛成功（負傷）": "full", // 負傷は生還補正の軸。任務は完遂
  隊商奪還: "full",
  部分成功: "partial", 小成功: "partial", 一部保留: "partial", 一部注意: "partial", 一部判読: "partial",
  応急処置: "partial", 照合保留: "partial", 再確認: "partial", 要再確認: "partial", 再配達: "partial",
  遠回り帰宅: "partial", 小さな違和感: "partial", 手がかりのみ: "partial", 痕跡確認: "partial",
  辛くも奪還: "partial", "隊商通過（遅延あり）": "partial", "隊商通過（荷の一部損失）": "partial",
  小さな失敗: "fail", 護衛失敗: "fail", 荷を置いて撤退: "fail", 隊商喪失: "fail"
};

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
// 成長するのは育成stats（6種）のみ。性格値（memory/caution/courage/kindness/curiosity）は
// 能力ではなく性格なので成長させない（2026-07-23決定。全員が同じ性格へ収束するのを防ぐ）。
const GROWTH_ELIGIBLE_STAT_KEYS = ["combat", "exploration", "investigation", "negotiation", "support", "survival"];

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
  const quest = getQuest(expedition.questId);
  if (!quest || !report?.logs) return;
  const party = expedition.adventurerIds.map(getAdventurer).filter(Boolean);
  const humans = humanMembers(party);
  if (humans.length === 0) return;

  const categoryStats = growthStatsForCategory(quest.category);
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
    救助: [
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
    救助: [
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
function injuryLevelFromHpRatio(hpRatio) {
  const word = battleStatusWord(hpRatio, 1);
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
  const now = Date.now();
  Object.entries(ratios).forEach(([advId, ratio]) => {
    const level = injuryLevelFromHpRatio(ratio);
    if (!level) return;
    const adv = getAdventurer(advId);
    if (!adv) return;
    adv.injury = { level, injuredAt: now, recoverMs: window.masterRecoveryTimes[level] };
  });
}

function battleHpRatiosOf(battle) {
  if (!battle || !Array.isArray(battle.members)) return null;
  return Object.fromEntries(battle.members.map((m) => [m.id, m.maxHp > 0 ? Math.max(0, m.hp) / m.maxHp : 1]));
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

  if (quest.category === "救助" || reportResult === "保護" || reportResult === "発見") {
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

  if (quest.category === "戦闘" || quest.id === "quest_field_mystery" || quest.id === "quest_barn_bite") {
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

function checkExpeditionCompletion() {
  if (!state.expedition) return;
  // durationMs は素の値を保存し、比較時に倍率を掛ける（出発済みの遠征も加速できる）。
  const elapsed = (Date.now() - state.expedition.startTime) * getDemoSpeed();
  if (elapsed < state.expedition.durationMs) return;

  // 依頼の所要日数だけ暦を進める（体験版②）。表示は②-2。
  state.worldState.daysPassed += getQuestDurationDays(getQuest(state.expedition.questId));

  const report = generateReport(state.expedition);
  appendPresenceLogToReport(report, state.expedition);
  appendPartyBanterToReport(report, state.expedition);
  appendGrowthLogToReport(report, state.expedition);
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
  state.expedition.adventurerIds.forEach((id) => {
    const adv = getAdventurer(id);
    if (adv) adv.status = "待機中";
  });
  state.expedition = null;
  saveState();
}

function render() {
  checkExpeditionCompletion();
  clearRecoveredInjuries(); // 回復はオフライン中も進む（絶対時刻で判定するため）

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
    beastlog: "いきもの図鑑",
    report: "報告書",
    result: "帰還報告"
  };
  viewTitle.textContent = titles[route] ?? "ギルド";

  if (route === "home") renderHome();
  if (route === "quests") renderQuests();
  if (route === "adventurers") renderAdventurers();
  if (route === "observations") renderObservations();
  if (route === "beastlog") renderBeastLog();
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
    personalityTags: chosen?.tags ?? [],
    interviewDone: true
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

function reportCardHtml(report) {
  const quest = getQuest(report.questId);
  return `
    <article class="report-card ${report.opened ? "" : "unopened"}">
      <h3>${escapeHtml(quest?.title ?? "報告書")}</h3>
      <p>${escapeHtml(report.summary)}</p>
      <div class="button-row" style="margin-top: 14px;">
        <button class="small-button" onclick="openReport('${report.id}')">${report.opened ? "読み返す" : "開封する"}</button>
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
            <h3>遠征中：${escapeHtml(quest?.title)}</h3>
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
function isQuestUnlocked(quest, clearedQuestIds) {
  if (!quest.unlockedBy) return true;
  return clearedQuestIds.has(quest.unlockedBy);
}

function getClearedQuestIds() {
  return new Set(state.reports.map((report) => report.questId));
}

function renderQuests() {
  const selectedQuest = getQuest(selectedQuestId);
  const expeditionBlock = expeditionBlockedMessage(selectedAdventurerIds);
  const canStart = selectedQuestId && selectedAdventurerIds.length > 0 && !state.expedition && !expeditionBlock;

  const cond = getCurrentConditions();
  const timeOptions = ["朝", "昼", "夕方", "夜"];
  const weatherOptions = ["晴れ", "曇り", "小雨", "霧", "風が強い"];

  const searchChain = state.searchChain;
  const urgentQuestId = searchChain ? (searchChain.stage === 2 ? "quest_caravan_lastchance" : "quest_caravan_search") : null;
  const urgentQuest = urgentQuestId ? getQuest(urgentQuestId) : null;
  const clearedQuestIds = getClearedQuestIds();
  const boardQuests = state.quests.filter((quest) => !quest.hidden && isQuestUnlocked(quest, clearedQuestIds));
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
    <article class="quest-card ${selected ? "selected" : ""}" onclick="selectQuest('${quest.id}')">
      <div class="card-title">
        <h3>${isUrgent ? "🚨 " : ""}${escapeHtml(quest.title)}</h3>
        ${isUrgent ? `<span class="status-pill away">緊急</span>` : ""}
      </div>
      <p class="muted">${escapeHtml(quest.summary)}</p>
      <div class="kv">
        <span>分類</span><strong>${escapeHtml(quest.category ?? "遠征")}</strong>
        <span>${isLifeQuest ? "作業負荷" : "危険度"}</span><strong class="${isLifeQuest ? "subtle-danger" : ""}">${escapeHtml(quest.danger)}</strong>
        <span>地域</span><strong>${escapeHtml(quest.area)}</strong>
        <span>所要時間</span><strong>${escapeHtml(formatQuestDuration(quest))}</strong>
        <span>観察対象</span><strong>${escapeHtml(quest.observationTarget)}</strong>
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
    <article class="adventurer-card ${selected ? "selected" : ""}" onclick="toggleAdventurer('${adventurer.id}')">
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
                    onclick="${sameAdvOtherSlot ? "" : `assignItem('${advId}', ${slot}, '${item.id}')`}"
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
      <span>依頼</span><strong>${escapeHtml(quest.title)}</strong>
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
    <article class="adventurer-card ${selected ? "selected" : ""}" onclick="editAdventurer('${adventurer.id}')">
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

const TENDENCY_STAT_KEYS = ["memory", "caution", "courage", "kindness", "curiosity"];
const TENDENCY_STAT_LABELS = {
  memory: "記憶",
  caution: "慎重",
  courage: "胆力",
  kindness: "面倒見",
  curiosity: "好奇心"
};

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

function adventurerStatsDetailHtml(adventurer) {
  const stats = adventurer.stats ?? {};
  const tendency = TENDENCY_STAT_KEYS.map((key) => `${TENDENCY_STAT_LABELS[key]}${stats[key] != null ? Math.floor(stats[key]) : "—"}`).join(" / ");
  const mission = ROSTER_STAT_KEYS.map((key) => `${ROSTER_STAT_LABELS[key]}${Math.floor(stats[key] ?? 10)}`).join(" / ");
  return `
    <div class="kv adventurer-detail-stats">
      <span>傾向</span><strong>${escapeHtml(tendency)}</strong>
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
      <button class="small-button" onclick="toggleFavorite('${adventurer.id}')">${adventurer.favorite ? "★ お気に入り" : "☆ お気に入り"}</button>
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
      <button class="primary-button" onclick="saveAdventurerMemo('${adventurer.id}')">記録を保存</button>
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
        <p class="muted" style="margin-bottom: 16px;">観察記録票を持った冒険者が依頼から持ち帰った一次記録です。いきもの図鑑を書くための素材置き場として使ってください。</p>
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
          <button class="small-button" onclick="openBeastLogFromMemo('${memo.reportId}', '${escapeHtml(memo.targetName ?? "")}')">図鑑を編集</button>
        </div>
      </div>
      <p class="memo-author muted">${escapeHtml(memo.adventurerName ?? "")} ／ ${dateStr}</p>
      <p class="memo-text">「${escapeHtml(memo.text ?? "")}」</p>
    </article>
  `;
}

function openBeastLogFromMemo(reportId, targetName) {
  const report = state.reports.find((r) => r.id === reportId);
  if (report && report.observationNotes) {
    openBeastLogFromReport(reportId);
  } else {
    const existing = state.beastLog[targetName];
    openBeastLogEditor(targetName, existing?.area ?? "", null);
  }
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

// ── いきもの図鑑 ──────────────────────────────────────────────────────────────

function renderBeastLog() {
  const entries = Object.values(state.beastLog ?? {});
  app.innerHTML = `
    <section class="card">
      <div class="card-body">
        <div class="card-title">
          <div>
            <p class="eyebrow">Beast Log</p>
            <h3>いきもの図鑑</h3>
          </div>
          <span class="status-pill">${entries.length}件</span>
        </div>
        <p class="muted" style="margin-bottom: 12px;">遠征で記録した生物のメモです。報告書の観察記録票を参照しながら自由に転記・編集できます。</p>
        ${entries.length === 0
          ? `<div class="empty">まだ記録はありません。<br>観察記録票を持たせた遠征の報告書から「図鑑を編集」ボタンで転記できます。</div>`
          : `<div class="grid-2" style="margin-top: 4px;">${entries.map(beastLogCardHtml).join("")}</div>`}
      </div>
    </section>
  `;
}

function beastLogCardHtml(entry) {
  const eName = escapeHtml(entry.target);
  const eArea = escapeHtml(entry.area || "地域未記入");
  const eCat  = escapeHtml(entry.category || "分類未記入");
  return `
    <article class="beast-log-card">
      <div class="card-title">
        <div>
          <h3>${eName}</h3>
          <p class="muted">${eCat} &middot; ${eArea}</p>
        </div>
        <button class="small-button" onclick="openBeastLogEditor('${eName}', '${eArea}', null)">編集</button>
      </div>
      ${entry.appearance ? `<p class="meta-label" style="margin-top:8px">外見・特徴</p><p class="muted">${escapeHtml(entry.appearance)}</p>` : ""}
      ${entry.notes     ? `<p class="meta-label">備考</p><p class="muted" style="white-space:pre-wrap">${escapeHtml(entry.notes)}</p>` : ""}
    </article>
  `;
}

function openBeastLogFromReport(reportId) {
  const report = state.reports.find((r) => r.id === reportId);
  if (!report) return;
  const quest = getQuest(report.questId);
  if (!quest || !quest.observationTarget || quest.observationTarget === "なし") return;
  const targetName = quest.observationTarget;
  const existing = state.beastLog[targetName];
  const area = existing?.area || quest.area || "";
  openBeastLogEditor(targetName, area, report.observationNotes ?? null);
}

function openBeastLogEditor(targetName, area, obsNotes) {
  const entry = state.beastLog[targetName] ?? {
    target: targetName,
    area: area || "",
    category: "未分類",
    appearance: "",
    notes: ""
  };
  // 旧形式の個別フィールドが残っている場合、備考に統合して表示する
  const oldParts = [
    entry.behavior        ? `【行動】${entry.behavior}` : "",
    entry.danger          ? `【危険性】${entry.danger}` : "",
    entry.effectiveMeasures   ? `【有効な対処】${entry.effectiveMeasures}` : "",
    entry.ineffectiveMeasures ? `【効かなかった対処】${entry.ineffectiveMeasures}` : "",
    entry.nextCheck       ? `【次に確認したいこと】${entry.nextCheck}` : ""
  ].filter(Boolean);
  const mergedNotes = [entry.notes, ...oldParts].filter(Boolean).join("\n");
  const editorEntry = { ...entry, notes: mergedNotes };

  let overlay = document.getElementById("beastLogOverlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "beastLogOverlay";
    overlay.className = "beast-log-overlay";
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = beastLogEditorHtml(editorEntry, obsNotes);
  overlay.classList.add("open");
}

function closeBeastLogEditor() {
  const overlay = document.getElementById("beastLogOverlay");
  if (overlay) overlay.classList.remove("open");
}

function saveBeastLogEntry() {
  const targetName = document.getElementById("bl_target").value.trim();
  if (!targetName) return;
  state.beastLog[targetName] = {
    target: targetName,
    area: document.getElementById("bl_area").value.trim(),
    category: document.getElementById("bl_category").value,
    appearance: document.getElementById("bl_appearance").value.trim(),
    notes: document.getElementById("bl_notes").value.trim(),
    // 旧フィールドをクリア（備考統合済みのため）
    behavior: "", danger: "", effectiveMeasures: "", ineffectiveMeasures: "", nextCheck: ""
  };
  saveState();
  closeBeastLogEditor();
  render();
}

function beastLogEditorHtml(entry, obsNotes) {
  const refHtml = obsNotes && obsNotes.notes && obsNotes.notes.length > 0 ? `
    <div class="bl-ref-section">
      <p class="meta-label">観察記録票（転記の参考）</p>
      <div class="obs-notes-grid">
        ${obsNotes.notes.map((n) => `
          <div class="obs-note-card">
            <p class="obs-note-author">${escapeHtml(n.name)}の記録</p>
            <p class="obs-note-text muted">「${escapeHtml(n.text)}」</p>
          </div>
        `).join("")}
      </div>
    </div>` : "";

  const categories = ["未分類", "獣", "鳥", "虫", "植物", "菌類", "水棲", "魔物", "怪異", "人工物", "その他"];
  const currentCat = entry.category || "未分類";
  const categorySelect = `<div class="bl-form-row">
    <label for="bl_category">分類</label>
    <select id="bl_category">
      ${categories.map((c) => `<option value="${c}"${currentCat === c ? " selected" : ""}>${c}</option>`).join("")}
    </select>
  </div>`;

  const inp = (id, label, val, ph) => {
    const esc = escapeHtml(val || "");
    return `<div class="bl-form-row"><label for="${id}">${label}</label><input id="${id}" value="${esc}" placeholder="${ph}" /></div>`;
  };
  const txt = (id, label, val, ph) => {
    const esc = escapeHtml(val || "");
    return `<div class="bl-form-row"><label for="${id}">${label}</label><textarea id="${id}" placeholder="${ph}">${esc}</textarea></div>`;
  };

  return `
    <div class="bl-modal-box">
      <div class="bl-modal-header">
        <h3>いきもの図鑑を編集</h3>
        <button class="ghost-button" onclick="closeBeastLogEditor()">✕ 閉じる</button>
      </div>
      <div class="bl-modal-body">
        ${refHtml}
        <div class="bl-form">
          ${inp("bl_target",     "名前",       entry.target,     "例：森喰い兎")}
          ${categorySelect}
          ${inp("bl_area",       "遭遇地域",   entry.area,       "例：薄明の森")}
          ${txt("bl_appearance", "外見・特徴", entry.appearance, "体の大きさ、色、特徴的な部位など")}
          ${txt("bl_notes",      "備考",       entry.notes,
            "・どんな行動をしたか\n・危険そうな点\n・有効だった対処\n・効かなかった対処\n・次に確認したいこと")}
          <div class="button-row" style="margin-top: 18px;">
            <button class="primary-button" onclick="saveBeastLogEntry()">図鑑に保存</button>
            <button class="ghost-button" onclick="closeBeastLogEditor()">キャンセル</button>
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
        ${report.observationNotes ? observationNotesHtml(report.observationNotes) : ""}
        <div class="button-row" style="margin-top: 18px;">
          <button class="primary-button" onclick="setRoute('home')">ギルドへ戻る</button>
          <button class="secondary-button" onclick="setRoute('observations')">報告メモを見る</button>
          <button class="secondary-button" onclick="setRoute('adventurers')">名簿にメモする</button>
          ${quest?.observationTarget && quest.observationTarget !== "なし"
            ? `<button class="secondary-button" onclick="openBeastLogFromReport('${report.id}')">図鑑を編集</button>`
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
          <button class="primary-button" onclick="openReport('${report.id}')">報告書を読む</button>
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
    weather: ["晴れ", "小雨", "霧", "強風", "雨上がり"],
    roadEvents: ["ぬかるみ", "古い道標", "商人とのすれ違い", "封蝋の確認", "宛先の聞き込み", "犬の遠吠え"],
    outcomes: ["成功", "持ち帰り", "再配達", "部分成功"]
  },
  quest_herb: {
    weather: ["晴れ", "小雨", "霧", "雨上がり"],
    roadEvents: ["湿った足跡", "倒木", "森喰い兎", "薬草袋の破れ", "泥被り茸の群生", "休憩地点"],
    outcomes: ["成功", "小成功", "採集優先", "観察優先"]
  },
  quest_signpost: {
    weather: ["晴れ", "小雨", "霧", "強風", "雨上がり"],
    roadEvents: ["道標の傾き", "苔に隠れた文字", "旧道の分岐", "壊れた橋", "通行人の証言", "根元のゆるみ"],
    outcomes: ["成功", "応急処置", "照合保留", "再確認"]
  },
  quest_church_patrol: {
    weather: ["晴れ", "小雨", "霧", "雨上がり"],
    roadEvents: ["柵の緩み", "鐘楼の確認", "墓地の灯り", "巡礼路の草", "礼拝堂の気配", "裏手の林"],
    outcomes: ["異常なし", "軽微な対処", "要再確認", "小さな違和感"]
  }
};

const lifeQuestEventPools = {
  quest_wedding_support: {
    workEvents: ["長椅子の設営", "厨房の手伝い", "酒樽の運搬", "招待客の案内", "迷子対応", "夜間の見回り", "飾り紐の受け渡し"],
    outcomes: ["成功", "小さな失敗", "感謝"]
  },
  quest_old_house_cleanup: {
    workEvents: ["壊れた家具の撤去", "床板の確認", "古い手紙の整理", "生活用品の確認", "近所の聞き取り", "茶器の梱包", "部屋割りの確認"],
    outcomes: ["成功", "整理完了", "一部保留"]
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

  const allEvents = { ...weddingEvents, ...cleanupEvents };
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
  const best = humans.reduce((a, b) => ((b.stats?.[chosen] ?? 0) > (a.stats?.[chosen] ?? 0) ? b : a));
  const val = best.stats?.[chosen] ?? 0;
  if (val < 14) return null;
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
    quest_wedding_support: ["item_pot", "item_bandage"],
    quest_old_house_cleanup: ["item_whistle", "item_bandage", "item_oilcase"],
    quest_letter: ["item_map", "item_oilcase"],
    quest_herb: ["item_whistle", "item_map", "item_bandage", "item_obs_sheet", "item_pot"],
    quest_signpost: ["item_whistle", "item_map", "item_bandage", "item_obs_sheet", "item_pot"],
    quest_field_mystery: ["item_bandage", "item_whistle", "item_obs_sheet"],
    quest_barn_bite: ["item_bandage", "item_whistle", "item_lantern", "item_obs_sheet"],
    quest_lingering_light: ["item_lantern", "item_obs_sheet", "item_map"],
    quest_old_bridge_repair: ["item_bandage", "item_whistle", "item_map", "item_pot", "item_lantern"],
    quest_church_patrol: ["item_bandage", "item_whistle", "item_map", "item_lantern", "item_pot"],
    quest_herb_delivery: ["item_oilcase", "item_map", "item_pot", "item_whistle", "item_lantern", "item_bandage"],
    quest_missing_herbalist: ["item_bandage", "item_whistle", "item_map", "item_lantern", "item_pot", "item_obs_sheet"],
    quest_evening_market_escort: ["item_lantern", "item_whistle", "item_map", "item_bandage", "item_pot"],
    quest_caravan_escort: ["item_bandage", "item_smoke", "item_whistle", "item_map", "item_lantern"],
    quest_old_stele_rubbing: ["item_obs_sheet", "item_map", "item_oilcase", "item_lantern", "item_bandage", "item_whistle", "item_pot"]
  };
  const allowed = allowedByQuest[quest.id];
  if (!allowed) return true;
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
    const isRainy = weather === "小雨";
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

function outcomeText(quest, party, itemIds, outcome, rng) {
  const scout = findByTrait(party, "job", "斥候");
  const herbalist = findByTrait(party, "job", "薬草師");
  const post = findByTrait(party, "background", "郵便配達人");
  const subject = partySubject(party);
  const has = (id) => itemIds.includes(id);

  if (quest.id === "quest_letter") {
    const variants = {
      成功: {
        result: "成功",
        summary: "手紙は無事に届けられた。宛先確認の記録も残った。",
        line: `${getDisplayName(post)}の確認により、手紙は本人へ渡された。受取人は驚いたあと、何度も礼を言った。`,
        after: `帰り道、${getDisplayName(post)}は少しだけ誇らしそうだった。報告書の文字も、いつもより丁寧に見える。`,
        history: "届けられなかった手紙で、宛先確認と受け渡しを完了。"
      },
      持ち帰り: {
        result: "持ち帰り",
        summary: "受取人不在のため、手紙は濡れない状態で持ち帰られた。",
        line: `宛先の家は空き家だった。近所に預ける案も出たが、${getDisplayName(scout)}は本人に渡すべき依頼だと判断し、今日は持ち帰ることにした。`,
        after: `受付嬢は手紙を受け取ると、乾いた布で封筒の端をそっと押さえた。こういう判断も、ちゃんと記録に残る。`,
        history: "届けられなかった手紙を持ち帰り。封筒の保全を優先。"
      },
      再配達: {
        result: "再配達",
        summary: "宛先の所在は判明。次回の再配達が必要。",
        line: `宛先の人物は夕方まで戻らないと分かった。${subject}は無理に待たず、現在の所在だけを記録して帰還した。`,
        after: `報告書の最後には「次回は午後発が望ましい」とある。失敗ではない。次に繋がる記録だ。`,
        history: "手紙依頼で受取人の所在を確認。次回再配達。"
      },
      部分成功: {
        result: "部分成功",
        summary: "手紙は届けられなかったが、宛先情報は更新された。",
        line: `${has("item_map") ? "古地図の表記" : "聞き込み"}により、宛先の旧住所と現在の家屋の対応が分かった。手紙はギルドで保管する。`,
        after: `派手な成果はない。けれど、次に誰かがこの依頼を受ける時、迷う時間は短くなる。`,
        history: "手紙依頼で宛先情報を更新。次回の成功率を上げた。"
      }
    };
    return variants[outcome] ?? variants.成功;
  }

  if (quest.id === "quest_herb") {
    const variants = {
      成功: {
        result: "成功",
        summary: "薬草と泥被り茸を持ち帰った。観察記録も更新された。",
        line: `${getDisplayName(herbalist)}は必要な分だけを採集し、残りの群生地を荒らさずに残した。`,
        after: `薬草袋の底には、小さな歯形のついた革紐が残っていた。受付で保管し、観察記録へ追記する。`,
        history: "森の薬草採集で、採集と小型獣の観察を両立。"
      },
      小成功: {
        result: "小成功",
        summary: "採集量は少なめだが、状態の良い薬草を持ち帰った。",
        line: `森の湿り気が強く、採れる量は多くなかった。${getDisplayName(herbalist)}は質の良い個体だけを選んだ。`,
        after: `少ない成果でも、香りはよい。調合係からは「この量で十分」と返事があった。`,
        history: "森の薬草採集で、量より品質を優先。"
      },
      採集優先: {
        result: "成功",
        summary: "採集を優先し、予定量の薬草を確保した。",
        line: `${getDisplayName(scout)}が周囲を警戒し、${getDisplayName(herbalist)}が手早く採集した。観察は浅いが、依頼分の量は満たしている。`,
        after: `帰還後、袋を開くと森の湿った匂いが受付に広がった。`,
        history: "森の薬草採集で、予定量の確保を優先。"
      },
      観察優先: {
        result: "観察優先",
        summary: "採集量は控えめだが、森喰い兎の反応を詳しく記録した。",
        line: `${getDisplayName(scout)}はあえて荷袋を少し離して置き、森喰い兎の反応を観察した。危険は小さいが、記録としては有用。`,
        after: `報告書には、歯形の向きと噛み跡の深さまで書かれていた。こういう細かさが後で効く。`,
        history: "森の薬草採集で、森喰い兎の反応を重点観察。"
      }
    };
    return variants[outcome] ?? variants.成功;
  }

  if (quest.id === "quest_church_patrol") {
    const variants = {
      異常なし: {
        result: "異常なし",
        summary: "定期巡回を終え、外縁に異常は見つからなかった。",
        line: `${subject}は柵から鐘楼、花壇、礼拝堂外縁まで順に回り、新しい痕跡はなかった。`,
        after: `礼拝堂の灯りは、いつも通り静かに見えた。誰も鐘を鳴らす者はいなかった。`,
        history: "辺境教会周辺の定期巡回で、異常なし。"
      },
      軽微な対処: {
        result: "軽微な対処",
        summary: "巡礼路の柵が一本緩んでいたが、応急で固定した。",
        line: `巡礼路の柵が一本ゆるんでいた。${subject}は落ちないよう縄で結び、次の巡回まで持つようにした。`,
        after: `大きな問題ではない。けれど、見逃さなかった記録としてはちゃんと残る。`,
        history: "辺境教会周辺の定期巡回で、柵を軽微に処置。"
      },
      要再確認: {
        result: "要再確認",
        summary: "鐘楼の足元に擦れ跡があった。今回は記録のみで、次回の巡回に回した。",
        line: `鐘楼の足元に、最近ついたとは思えない擦れ跡があった。${subject}は無理に追わず、位置だけを報告書に残した。`,
        after: `報告書の余白には「次回、雨天以外で再確認」とある。`,
        history: "辺境教会周辺の定期巡回で、擦れ跡を記録し要再確認。"
      },
      小さな違和感: {
        result: "小さな違和感",
        summary: "礼拝堂の外縁で消えかけた灯りを確認したが、接近せず記録にとどめた。",
        line: `${getDisplayName(scout) ?? subject}は外縁の道で、夜明け前に見えたという小さな灯りの痕跡だけを確かめた。接近はしなかった。`,
        after: `風に花の匂いが一度だけ混じり、また静けさだけが戻った。`,
        history: "辺境教会周辺の定期巡回で、小さな違和感を記録。"
      }
    };
    return variants[outcome] ?? variants.異常なし;
  }

  const variants = {
    成功: {
      result: "成功",
      summary: "道標の位置を確認し、街道記録と照合した。",
      line: `${getDisplayName(scout)}は道標の向きと周囲の目印を照合し、現在の記録と大きな差がないことを確認した。`,
      after: `報告書の端には、道標の簡単なスケッチが添えられていた。地味だが、とても助かる記録だ。`,
      history: "古い道標の確認で、街道記録との照合を完了。"
    },
    応急処置: {
      result: "応急処置",
      summary: "道標の傾きを確認し、倒れないよう補強した。",
      line: `道標の根元はゆるんでいた。${subject}は石を積み、次の巡回までは倒れないよう応急処置をした。`,
      after: `帰還した${formatNames(party)}の靴には、道標の根元と同じ赤土がついていた。`,
      history: "古い道標の確認で、根元を応急補強。"
    },
    照合保留: {
      result: "照合保留",
      summary: "現地確認は完了。旧道との照合は次回に持ち越し。",
      line: `${has("item_map") ? "古地図は役に立ったが、旧道の記述が古すぎた。" : "古地図がなかったため、旧道の照合は保留となった。"}現地の状態だけを記録して帰還した。`,
      after: `報告書には「次回は晴天時に再確認」とある。焦らない記録は、次の事故を減らす。`,
      history: "古い道標の確認で、旧道照合を次回へ持ち越し。"
    },
    再確認: {
      result: "再確認",
      summary: "道標の文字が一部読めず、再確認が必要。",
      line: `苔に隠れた文字は一部しか読めなかった。無理に削ると木が崩れそうだったため、${subject}は保存を優先した。`,
      after: `読めない文字を、読めないまま残す判断。記録係としては、少しだけ嬉しい報告だった。`,
      history: "古い道標の確認で、文字保存を優先し再確認扱い。"
    }
  };
  return variants[outcome] ?? variants.成功;
}

function lifeQuestOutcomeText(quest, party, itemIds, outcome, rng) {
  const subject = partySubject(party);
  const caregiver = findByTrait(party, "personality", "世話焼き");
  const careful = findByTrait(party, "personality", "慎重");

  if (quest.id === "quest_wedding_support") {
    const variants = {
      成功: {
        result: "成功",
        summary: "式の手伝いを最後まで務めた。大きな問題はなく、当日は無事に終わった。",
        line: `担当した作業をすべて終えた。式は滞りなく進み、見送りの時、依頼人から「来てくれてよかった」と言われた。`,
        after: `片付けが終わった会場の床に、花びらと小さな足跡が残っていた。${getDisplayName(caregiver)}は「いい式でしたね」と言って、最後の掃除をした。`,
        history: "結婚式の手伝い。設営から片付けまでを担当。式は無事終了。"
      },
      小さな失敗: {
        result: "小さな失敗",
        summary: "軽微なミスはあったが、式の進行に支障はなかった。",
        line: `飾り紐の受け渡しが少し遅れた。${getDisplayName(careful)}はすぐに気づいて補ったが、あの一瞬は報告書に残した。`,
        after: `依頼人は「気にしないで」と言った。そう言ってもらえるうちは、次の機会に活かせる失敗だ。`,
        history: "結婚式の手伝い。軽微なミスあり、式は無事終了。"
      },
      感謝: {
        result: "感謝",
        summary: "依頼の範囲を超えた対応が、依頼人から感謝された。",
        line: `${getDisplayName(caregiver)}が迷子の子どもを保護したことで、式の雰囲気が崩れずに済んだ。依頼人から改めて礼を言われた。`,
        after: `式が終わった後、依頼人は${subject}に小さな菓子折りを持たせた。報告書の末尾には「菓子折り受領、ギルドへ持参」とだけ書いてある。`,
        history: "結婚式の手伝い。迷子対応など依頼範囲外にも対応し、感謝を受けた。"
      }
    };
    return variants[outcome] ?? variants["成功"];
  }

  if (quest.id === "quest_old_house_cleanup") {
    const variants = {
      成功: {
        result: "成功",
        summary: "廃屋の片付けを完了した。整理品と要確認品を分けて引き渡した。",
        line: `${subject}は部屋を順番に片付け、処分品・保管品・要確認品を分けて依頼人へ報告した。住人の名前は最後まで分からなかった。`,
        after: `報告書には「住人名は不明。生活用品のみ整理」と記されている。${getDisplayName(careful)}の文字は丁寧だった。`,
        history: "廃屋の片付けを完了。住人名は不明のまま、生活用品を整理して引き渡した。"
      },
      整理完了: {
        result: "整理完了",
        summary: "廃屋の整理は完了。残置物の確認は依頼人とともに行った。",
        line: `${getDisplayName(careful)}は依頼人を呼んで、残置物の判断を一緒に行った。誰の持ち物かは分からなくとも、捨てるかどうかは依頼人が決めることだ。`,
        after: `依頼人は「ひとつひとつ見せてくれてよかった」と言った。ただ、割れた茶器や古い帳面だけが、誰かの暮らしを静かに残していた。`,
        history: "廃屋の整理完了。残置物の判断を依頼人と確認しながら進めた。"
      },
      一部保留: {
        result: "一部保留",
        summary: "大半の片付けは完了。宛名の読めない古い手紙は依頼人の再確認待ち。",
        line: `古い手紙は宛名の部分が雨染みで読めなかった。依頼人に見せたところ「自分でもう少し調べます」と言ったため、保留とした。`,
        after: `封を開けなかったのは正しい判断だと思う。読めなかった文字の先に何があるかは、依頼人が知ることだ。`,
        history: "廃屋の片付けで一部保留。宛名の読めない手紙を依頼人確認待ちで残した。"
      }
    };
    return variants[outcome] ?? variants["成功"];
  }

  return {
    result: "成功",
    summary: "生活依頼を完了した。",
    line: `${subject}は依頼を無事に終えた。`,
    after: `報告書は受付へ提出された。`,
    history: `${quest.title}：完了。`
  };
}

function generateRabbitNote(adv, rng) {
  const memory = adv.stats?.memory ?? 15;
  const isCareful = adv.personality === "慎重";
  const isBold = adv.personality === "豪胆";
  const isCaregiver = adv.personality === "世話焼き";
  const isPostman = adv.background === "郵便配達人";
  const isGuard = adv.background === "宿場の用心棒";
  const isCompounder = adv.background === "村の調合係";
  const isScout = adv.job === "斥候";
  const isHerbalist = adv.job === "薬草師";
  const isWarrior = adv.job === "戦士";

  if (memory >= 20) {
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

  if (memory === 3) {
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

function generateMysteryFieldNote(adv, rng) {
  const memory = adv.stats?.memory ?? 15;
  const curiosity = adv.stats?.curiosity ?? 15;
  const name = getDisplayName(adv);

  if (memory >= 20) {
    return pickOne([
      `${name}は、耳の先が黒く、泥の跳ね方が左右で違っていたと記録している。足跡は畝の間から外側へ続いていた。`,
      `${name}の記録には、背丈は膝ほど、畑の柔らかい土を避けるように跳ねた、とある。正体は未確定。`
    ], rng);
  }
  if (curiosity >= 20) {
    return pickOne([
      `${name}は「なにか」が逃げた後の草の倒れ方を気にしていた。巣穴か通り道が近くにあるかもしれない。`,
      `${name}は姿よりも痕跡を気にしていた。畑の外で同じ足跡を探したが、途中で途切れている。`
    ], rng);
  }
  return pickOne([
    `${name}は、小さな影が畑の外へ逃げたと記録した。特徴はまだ少ない。`,
    `${name}は、素早く跳ねる未同定の相手だったとだけ報告している。`
  ], rng);
}

function generateLingeringLightNote(adv, rng) {
  const memory = adv.stats?.memory ?? 15;
  const curiosity = adv.stats?.curiosity ?? 15;
  const caution = adv.stats?.caution ?? 15;
  const name = getDisplayName(adv);

  if (memory >= 20) {
    return pickOne([
      `${name}は、灯りが道の右手、古い曲がり角の先で二度揺れてから消えたと記録している。足跡は増えていなかった。`,
      `${name}の記録では、灯りは人の腰ほどの高さに見え、近づくほど遠ざかったように見えた。位置の記録は次回調査に使える。`
    ], rng);
  }
  if (curiosity >= 20) {
    return pickOne([
      `${name}は灯りそのものより、消えた後の暗さを気にしていた。道の先に反射するものがあるのかもしれない。`,
      `${name}は灯りが揺れる間隔を気にしていた。風や人の手とは違う動きだった、と報告している。`
    ], rng);
  }
  if (caution >= 20) {
    return `${name}は、帰り道の轍を見失わない位置で観察を止めた。安全な距離の記録として有用。`;
  }
  return `${name}は、小さな灯りが道の先に見え、しばらくして消えたと記録した。詳細は次回確認が必要。`;
}

function generateAdventurerObservationNote(target, adv, rng) {
  if (target === "森喰い兎") return generateRabbitNote(adv, rng);
  if (target === "「なにか」") return generateMysteryFieldNote(adv, rng);
  if (target === "残る灯り") return generateLingeringLightNote(adv, rng);
  return `${getDisplayName(adv)}は${target}の様子を確認した。短い観察だったため、詳細な記録はできなかった。`;
}

function generateObservationNotes(quest, party, adventurerItemIds, rng) {
  if (!quest.observationTarget || quest.observationTarget === "なし") return null;
  // 観察記録票を所持している冒険者だけが記録を書ける
  const holders = party.filter((adv) =>
    isHumanAdventurer(adv) && getAdvItemIds(adventurerItemIds, adv.id).includes("item_obs_sheet")
  );
  if (holders.length === 0) return null;
  const notes = holders.map((adv) => ({
    adventurerId: adv.id,
    name: getDisplayName(adv),
    text: generateAdventurerObservationNote(quest.observationTarget, adv, rng)
  }));
  return { target: quest.observationTarget, notes };
}

function bestByStat(party, statKey) {
  const humans = humanMembers(party);
  const pool = humans.length > 0 ? humans : party;
  return pool.reduce((best, adv) => ((adv.stats?.[statKey] ?? 0) > (best.stats?.[statKey] ?? 0) ? adv : best), pool[0]);
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

  const pusher = bestByStat(party, "courage");
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
  const adv = bestByStat(party, stat);
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
      .reduce((best, s) => (adv.stats?.[s] ?? 0) > (adv.stats?.[best] ?? 0) ? s : best, "courage");
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
    const front = bestByStat(party, "courage");
    const rest = humans.filter((a) => a.id !== front.id);
    if (rest.length > 0) {
      const rec = bestByStat(rest, "memory");
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
    const bv = statPool.reduce((mx, a) => Math.max(mx, a.stats?.[best] ?? 0), 0);
    const sv = statPool.reduce((mx, a) => Math.max(mx, a.stats?.[s] ?? 0), 0);
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
    const recorder = bestByStat(party, dominant);
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
  const adv = bestByStat(party, stat);
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
  const adv = bestByStat(party, tensionValue >= 55 ? "caution" : "courage");
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
  // 4. 押し合い・牽制・追い払い
  battlePushRepelText(quest, party, adventurerItemIds, behavior, rng).forEach((line) => logs.push(line));
  const obsMid = battleObsSheetMidBattleText(party, adventurerItemIds, behavior, rng);
  if (obsMid) logs.push(obsMid);
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

  // 4. 交戦
  const fighter = bestByStat(party, "courage");
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
  if (hasBandage && rng() < 0.5) {
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

function lightInvestigationResponseText(party, isNight, hasLantern, rng) {
  const stat = pickOne(["caution", "memory", "curiosity", "courage", "kindness"], rng);
  const adv = bestByStat(party, stat);
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

function lightInvestigationInteractionText(party, rng) {
  if (isSoloHumanParty(party)) return null;
  const mina = party.find((a) => a.id === "adv_mina");
  const gadd = party.find((a) => a.id === "adv_gadd");
  const elne = party.find((a) => a.id === "adv_elne");
  const nm = (adv) => adv ? getDisplayName(adv) : null;
  const lines = [];

  if (mina && gadd) lines.push(`${nm(mina)}が灯りの位置を読み上げると、${nm(gadd)}は道の端で足場を確かめた。`);
  if (mina && elne) lines.push(`${nm(mina)}が消えた方角を記録し、${nm(elne)}は帰り道の目印を確認した。`);
  if (gadd && elne) lines.push(`${nm(elne)}が「ここまでにしましょう」と言うと、${nm(gadd)}は不満を飲み込んで引き返した。`);

  return lines.length > 0 ? pickOne(lines, rng) : null;
}

function lightObservationRecordText(party, adventurerItemIds, rng) {
  const holder = party.find((adv) => isHumanAdventurer(adv) && getAdvItemIds(adventurerItemIds, adv.id).includes("item_obs_sheet"));
  if (!holder) return null;
  const name = getDisplayName(holder);
  return pickOne([
    `${name}は観察記録票に、灯りが見えた位置と消えた方角を書き残した。`,
    `報告書には、${name}の記録として灯りの揺れ方と見えた高さが追記されている。`,
    `${name}は、灯りが道の曲がり角の向こうで消えたことだけを観察記録票に残した。`
  ], rng);
}

function bridgeRepairOutcomeText(outcome, party, rng) {
  const subject = partySubject(party);
  const variants = {
    応急修理: {
      result: "応急修理",
      summary: "板の緩みを直し、徒歩での通行は可能になった。本修理は後日必要。",
      line: `応急修理の後、荷車はまだ難しいが、人が歩いて渡るには十分だと判断された。`,
      after: `報告書には「本修理は後日必要。徒歩通行は可」と記されている。`,
      history: "古い小橋の応急修理。徒歩通行可、本修理は後日。"
    },
    通行可: {
      result: "通行可",
      summary: "手すりと足場を補強し、村人が安全に渡れる状態になった。",
      line: `手すりと足場の補強が終わり、${subject}は通行人に一時立ち止まるよう声をかけてから、試し渡りを確認した。`,
      after: `修理済みの板には、まだ新しい足跡が一つだけ残っていた。`,
      history: "古い小橋の応急修理。手すりと足場を補強し通行可。"
    },
    一部保留: {
      result: "一部保留",
      summary: "応急処置は完了したが、荷車の通行は危険と判断された。",
      line: `板の緩みは直したが、中央の沈みは完全には消えなかった。荷車の通行は危険と判断し、迂回路の案内を残した。`,
      after: `報告書には「徒歩は可、荷運びは不可」とだけ書いてある。`,
      history: "古い小橋の応急修理。徒歩は可、荷車通行は保留。"
    }
  };
  return variants[outcome] ?? variants["応急修理"];
}

function churchPatrolOutcomeText(outcome, party, rng) {
  return outcomeText({ id: "quest_church_patrol", category: "保全" }, party, [], outcome, rng);
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
  const variants = {
    納品完了: {
      result: "納品完了",
      summary: "薬草包みは破損なく診療所へ届けられた。納品書も無事だった。",
      line: `診療所の受付は包みを受け取ると、中身を確かめてから受領印を押した。`,
      after: `報告書には「薬草包み、破損なし。納品時刻内」と記されている。`,
      history: "薬草包みの納品。破損なし、納品書も無事。"
    },
    時刻内納品: {
      result: "時刻内納品",
      summary: "遠回りにはなったが、指定時刻内に納品できた。",
      line: `迂回路を取ったが、診療所の受付は指定時刻前に包みを受け取った。受領印が押された。`,
      after: `帰り道、${partySubject(party)}は荷の結び目をもう一度だけ確かめてから門へ戻った。`,
      history: "薬草包みの納品。遠回りしたが時刻内に納品。"
    },
    一部注意: {
      result: "一部注意",
      summary: "包みの外布は少し湿ったが、中身と納品書は守られた。",
      line: `診療所へ届けたが、外布は雨で少し湿っていた。中身と納品書は無事で、受領印も押された。`,
      after: `報告書には「外布に湿気あり。中身・書類は問題なし」と書き添えられている。`,
      history: "薬草包みの納品。外布は湿ったが中身と納品書は無事。"
    }
  };
  return variants[outcome] ?? variants["納品完了"];
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
  const variants = {
    保護: {
      result: "保護",
      summary: "薬草採りを森の浅瀬で保護し、無事に村まで連れ帰った。",
      line: `薬草採りは倒木のそばで座り込んでいた。足をくじいていたが、意識ははっきりしていた。`,
      after: `報告書には「保護。歩行は可能。本日は休養を要する」と記されている。`,
      history: "帰ってこない薬草採りの確認。保護し村へ連れ帰った。"
    },
    発見: {
      result: "発見",
      summary: "薬草採りを発見した。軽い負傷はあったが、自力歩行は可能だった。",
      line: `草むらの先で薬草採りを見つけた。膝を擦っていたが、自分の足で立ち上がれた。`,
      after: `帰り道、本人は自分の袋だけは離さず持っていた。`,
      history: "帰ってこない薬草採りの確認。発見、自力歩行可能。"
    },
    痕跡確認: {
      result: "痕跡確認",
      summary: "本人は見つからなかったが、落とし物と足跡を確認した。翌朝の再捜索が必要。",
      line: `森の奥まで近づいたが、本人は見つからなかった。落とした薬草袋と足跡だけが残っていた。`,
      after: `報告書には「再捜索推奨。痕跡は浅瀬方向」と書き添えられている。`,
      history: "帰ってこない薬草採りの確認。本人未発見、痕跡のみ。"
    }
  };
  return variants[outcome] ?? variants["保護"];
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
  const homeLine = partyHasElsie(party)
    ? `町外れの家に着くと、子どもは眠そうにしながらも、エルシーに小さく手を振った。`
    : `町外れの家に着くと、子どもは眠そうにしながら買い物袋を抱えていた。`;
  const variants = {
    無事帰宅: {
      result: "無事帰宅",
      summary: "親子を家まで送り届けた。荷物の破損もなく、道中の問題はなかった。",
      line: homeLine,
      after: `報告書には「親子、無事帰宅。荷物破損なし」と記されている。`,
      history: "夕市帰りの親子の付き添い。無事帰宅、荷物破損なし。"
    },
    安全確認: {
      result: "安全確認",
      summary: "暗くなる前に危ない道を避け、無事に送り届けた。",
      line: `暗くなる前に家へ着いた。親は荷物を受け取り、子どもの手を握って礼を言った。`,
      after: `何も起きなかった。それが今回の一番良い報告だった。`,
      history: "夕市帰りの親子の付き添い。危ない道を避け安全に送り届けた。"
    },
    遠回り帰宅: {
      result: "遠回り帰宅",
      summary: "近道は避け、明るい道を選んだため少し遅れたが、無事に帰宅できた。",
      line: `明るい道を選んだため到着は遅れたが、親子は無事に家の戸口へ着いた。`,
      after: `帰宅した子どもは、眠そうにしながらも買い物袋だけは離さなかった。`,
      history: "夕市帰りの親子の付き添い。遠回りしたが無事帰宅。"
    }
  };
  return variants[outcome] ?? variants["無事帰宅"];
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
    logs.push(pick([
      `笛は使わずに済んだが、合図の手段があるだけで親は少し安心したようだった。`,
      `${holderName("item_whistle")}は笛を手元に持ったまま歩いたが、鳴らす必要はなかった。`
    ]));
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
  const variants = {
    great_light: {
      result: "護衛成功",
      summary: "隊商を狙う野盗を正面から退け、荷を欠かさず外縁の先まで送り届けた。傷は浅く、手当てのみで済んだ。",
      line: `野盗は間合いを詰めきれず、荷馬車は止まることなく街道を抜けた。`,
      after: `報告書には「隊商、無事通過。負傷は浅く、手当て済み」と記されている。`,
      history: "街道の外れを行く隊商の護衛。浅手のみで押し切り、隊商を送り届けた。"
    },
    great_wound: {
      result: "護衛成功（負傷）",
      summary: "野盗の襲撃を受け止め、負傷しながらも押し返して隊商を通した。荷は守り切った。",
      line: `幾人かは傷を負ったが、隊商は止まらずに外縁の先へ抜けた。`,
      after: `報告書には「隊商通過。護衛に負傷あり、荷の損失なし」と記されている。`,
      history: "街道の外れを行く隊商の護衛。負傷しつつ強行突破、隊商を送り届けた。"
    },
    partial_detour: {
      result: "隊商通過（遅延あり）",
      summary: "会敵の前に煙幕で視界を塞ぎ、戦わずに隊商を裏道へ回した。荷は無事だが、約束の刻限には遅れた。",
      line: `煙の向こうで野盗の影が揺れるうち、荷馬車は裏道へ抜けていった。`,
      after: `報告書には「隊商は通過。交戦なし。遠回りによる遅延あり」と記されている。`,
      history: "街道の外れを行く隊商の護衛。煙幕で会敵を避け、遠回りで送り届けた。"
    },
    partial_loss: {
      result: "隊商通過（荷の一部損失）",
      summary: "交戦の途中で煙幕を焚き、追撃を断って隊商と共に退いた。人は守ったが、荷の一部は置いてきた。",
      line: `煙が野盗の足を止めている間に、一行は隊商を先へ急がせた。`,
      after: `報告書には「隊商は通過。荷の一部を失う。負傷者あり、死者なし」と記されている。`,
      history: "街道の外れを行く隊商の護衛。煙幕で退き、荷の一部を失いつつ隊商を通した。"
    },
    partial_elsie: {
      result: "隊商通過（荷の一部損失）",
      summary: "エルシーが吠えたのは、まだ退けるうちだった。退き際が早かった分、荷の一部を確保したまま隊商と退いた。",
      line: `エルシーの声に押されるように、一行は隊商を先へ急がせた。`,
      after: `報告書には「隊商は通過。荷の一部を失う。負傷者あり、死者なし」と記されている。`,
      history: "街道の外れを行く隊商の護衛。早めの退き際で、荷の一部を失いつつ隊商を通した。"
    },
    bail: {
      result: "荷を置いて撤退",
      summary: "野盗の狙いが荷にあると見て、荷を残して人を退かせた。商人と一行は外縁まで戻った。",
      line: `荷は失われたが、商人も一行も外縁まで退いた。`,
      after: `報告書には「荷の損失あり、負傷者あり、死者なし」と記されている。`,
      history: "街道の外れを行く隊商の護衛。荷を置いて退いた。負傷はあれど、死者はない。"
    },
    fail: {
      result: "護衛失敗",
      summary: "野盗の数に押し込まれ、隊商を護り切れないまま街道から退いた。",
      line: `隊商とははぐれ、荷馬車は野盗の側へ取り残された。`,
      after: `報告書には「隊商を護り切れず。後日の捜索が要る」と短く記されている。`,
      history: "街道の外れを行く隊商の護衛。護り切れず撤退、後日の捜索へ。"
    }
  };
  return variants[branch] ?? variants.fail;
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
  const enemyN = enemyRow?.shortName ?? enemyRow?.name ?? battle.enemyName ?? "相手";
  const jobById = {};
  party.forEach((a) => { jobById[a.id] = a.job; });
  const hasElsie = party.some((a) => a.id === "adv_elsie");
  const smokeHeld = battle.smoke?.held ?? false;

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

  const dealLine = (ev) => {
    if (ev.attackerStatus === "深手") return weakenedDealLine(ev);
    const n = ev.damage, big = ev.strong === true, name = ev.attackerName, job = jobById[ev.attackerId];
    if (job === "斥候") return big
      ? `${name}の矢が${enemyN}の胴を捉えた！（${enemyN}に${n}ダメージ！）`
      : `${name}は間合いを取って矢を放ち、${enemyN}のひとりの肩を射抜いた（${enemyN}に${n}ダメージ）`;
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
    // 臨時判断（スライス9）：仲間が倒れて一行が迷う。踏みとどまっても退いても、判断があったことを必ず出す。
    if (ev.at === "emergency") {
      const cname = ev.causeName ?? "仲間";
      out.push(ev.causeTo === "戦闘不能"
        ? pick([`${cname}が倒れたのを見て、一行の動きが一瞬止まった。`, `${cname}が崩れ落ち、一行の足並みが乱れた。`])
        : pick([`${cname}の傷を見て、一行の動きが一瞬止まった。`, `${cname}の傷の深さに、一行の間に迷いがよぎった。`]));
      if (ev.retreat) {
        // 撤退の実行は道具と犬が助ける（判断は動揺のまま＝スライス9維持。煙幕S1・エルシーE2：2026-07-25）
        if (smokeHeld) {
          out.push(`これ以上は人が保たない――誰かが煙幕を叩きつけ、白い煙が${enemyN}の視界を塞いだ。`);
          out.push(`一行は煙に紛れ、隊商を先へ急がせた。`);
        } else if (hasElsie) {
          out.push(`これ以上は人が保たない。一行は荷の一部をあきらめ、退き際を揃えた。`);
        } else {
          out.push(`これ以上は人が保たない。一行は荷を置いて退くことを決めた。`);
        }
        if (hasElsie) out.push(pick([
          `エルシーが${enemyN}の足元へ飛び込んで気を引き、一行が退く隙を作った。`,
          `エルシーが吠えながら囮になり、そのあいだに一行は街道の外へ逃れた。`
        ]));
      } else {
        out.push(pick([`それでも、荷馬車の前を空けるわけにはいかなかった。`, `誰も口には出さず、ただ持ち場に戻った。`]));
      }
      return out;
    }
    if (ev.at === "first") {
      if (ev.retreat) out.push(smokeHeld ? pick([
        `やり合う前に煙幕で視界を塞ぎ、一行は隊商を裏道へ回した。`,
        `数が多すぎると見て煙幕を焚き、隊商ごと道を変えた。`
      ]) : pick([
        `まともにやり合うのは危険と見て、一行は早々に距離を取った。`,
        `数が多すぎると見て、一行は交戦を避けて退いた。`
      ]));
    } else if (ev.retreat) {
      out.push(smokeHeld ? pick([
        `これ以上は保たないと見て煙幕を焚き、${enemyN}の足が止まるうちに隊商を先へ急がせた。`,
        `煙が視界を塞ぐあいだに隊商を先に行かせ、一行は退いた。`
      ]) : pick([
        `これ以上は保たないと見て、隊商を先に行かせ、一行は退いた。`,
        `踏みとどまる限界だった。隊商を逃がし、一行は街道の外へ退いた。`
      ]));
    } else {
      out.push(pick([
        `退くか一瞬迷ったが、隊商を置いてはいけないと、一行は踏みとどまった。`,
        `ここが退き時かと思われたが、一行はもう一歩踏ん張ることを選んだ。`
      ]));
    }
    // 撤退成立時のみエルシーの囮（撤退フレーバー＝ダメージ・状態行ではない）。
    if (ev.retreat && hasElsie) out.push(pick([
      `エルシーが${enemyN}の足元へ飛び込んで気を引き、一行が退く隙を作った。`,
      `エルシーが吠えながら囮になり、そのあいだに一行は街道の外へ逃れた。`
    ]));
    return out;
  };

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
      else lines.push({ kind: "action", text: dealLine(ev) });
    }
    else if (ev.type === "take") lines.push({ kind: "action", text: takeLine(ev) });
    else if (ev.type === "heal") lines.push(healLine(ev));
    else if (ev.type === "status") { const s = statusLine(ev); if (s) lines.push(s); }
    else if (ev.type === "retreat") retreatLines(ev).forEach((l) => lines.push({ kind: "action", text: l }));
  });
  if (finisher) lines.push(finisher);
  return lines;
}

// 隊商捜索チェーン（護衛失敗の後日談）：斥候かエルシーがいれば手がかりを追える。
function caravanSearchOutcomeText(stage, found, party, rng) {
  const variants = {
    stage1_found: {
      result: "隊商奪還",
      summary: "足跡と気配を頼りに野盗を追い、隊商を無事に取り戻した。",
      line: `側道の茂みに隠された荷馬車を見つけた。商人は無事で、荷にも大きな欠けはなかった。`,
      after: `報告書には「隊商奪還。商人・荷とも無事」と記されている。`,
      history: "護衛失敗後の緊急捜索。隊商を無事奪還。"
    },
    stage1_lost: {
      result: "手がかりのみ",
      summary: "野盗の足跡は追えたが、隊商そのものには辿り着けなかった。",
      line: `踏み荒らされた跡は途中で他の道に紛れ、それ以上は追い切れなかった。`,
      after: `報告書には「手がかりのみ。最後の望みを賭けた再捜索が要る」と記されている。`,
      history: "護衛失敗後の緊急捜索。手がかりのみで隊商は見つからず。"
    },
    stage2_found: {
      result: "辛くも奪還",
      summary: "最後の手がかりを頼りに追い詰め、辛くも隊商を取り戻した。",
      line: `古い轍の先に、置き去りにされた荷馬車と商人の姿があった。`,
      after: `報告書には「隊商、辛くも奪還。これ以上の捜索は要さず」と記されている。`,
      history: "最後の捜索。辛くも隊商を取り戻した。"
    },
    stage2_lost: {
      result: "隊商喪失",
      summary: "手がかりは尽き、商人と荷は最後まで見つからなかった。",
      line: `古い轍もそこで途絶え、それより先の痕跡は残っていなかった。`,
      after: `報告書には「隊商、ついに見つからず。捜索を打ち切る」と短く記されている。`,
      history: "最後の捜索。手がかりが尽き、隊商はついに見つからなかった。"
    }
  };
  const key = `stage${stage}_${found ? "found" : "lost"}`;
  return variants[key] ?? variants.stage1_lost;
}

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
  const variants = {
    拓本完了: {
      result: "拓本完了",
      summary: "石碑の拓本を取り、読める範囲の文字を記録した。",
      line: `拓本には、今は使われていない古い地名が一つだけ残っていた。`,
      after: `報告書には「判読不能箇所は無理に補わず」と記されている。`,
      history: "古い石碑の拓本。読める範囲を記録。"
    },
    一部判読: {
      result: "一部判読",
      summary: "文字の一部は欠けていたが、旧街道に関する地名を確認できた。",
      line: `欠けた文字はそのまま残し、読めた地名だけを報告書に書き留めた。`,
      after: `読めなかった文字を、読めないまま残した。それも記録だ。`,
      history: "古い石碑の拓本。一部判読、旧街道の地名を確認。"
    },
    保存優先: {
      result: "保存優先",
      summary: "石碑を傷めないため、無理な清掃は避けた。読める範囲のみ記録した。",
      line: `苔は削らず、石碑の表面も無理に触らない範囲で拓本を取った。`,
      after: `石碑はまだそこにある。報告書には、そう書かれていた。`,
      history: "古い石碑の拓本。保存優先、読める範囲のみ記録。"
    }
  };
  return variants[outcome] ?? variants["拓本完了"];
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

function generateLightInvestigationLogs(quest, party, adventurerItemIds, departTimeOfDay, rng) {
  const logs = [];
  const isNight = departTimeOfDay === "夜";
  const itemIds = getAllItemIds(adventurerItemIds);
  const hasLantern = itemIds.includes("item_lantern");
  const hasMap = itemIds.includes("item_map") && canUseItemInQuest(quest, "item_map");
  const observation = isNight ? lightObservationRecordText(party, adventurerItemIds, rng) : null;

  if (!isNight) {
    logs.push(`昼の道には、人の足跡と荷車の跡が残っているだけだった。`);
    logs.push(lightInvestigationResponseText(party, false, hasLantern, rng));
    if (hasMap) logs.push(`古地図と照らしても、道筋そのものに新しい変化は見つからなかった。`);
    logs.push(`問題の灯りは見えず、報告書には「昼間の異常は確認できず」と記されている。`);
    logs.push(`依頼人は、やはり夜にだけ見えるのだと言った。`);
    return logs;
  }

  logs.push(`夜道の先に、小さな灯りが一つ浮かんで見えた。`);
  if (hasLantern) {
    logs.push(`ランタンの明かりを地面に落とすと、帰り道の轍がはっきり見えた。`);
    logs.push(lightInvestigationResponseText(party, true, true, rng));
    const interaction = lightInvestigationInteractionText(party, rng);
    if (interaction) logs.push(interaction);
    logs.push(`灯りはしばらく揺れたあと、道の曲がり角の向こうで消えた。`);
    if (!observation) logs.push(`報告書には「ランタンなしでの再調査は避けること」と書き添えられている。`);
  } else {
    logs.push(`足元が暗く、帰り道の目印もすぐに見えなくなった。`);
    logs.push(lightInvestigationResponseText(party, true, false, rng));
    logs.push(`${partySubject(party)}は深追いせず、その場で引き返した。`);
    logs.push(`報告書には「灯りは確認。ただし接近調査は不可」とだけ残っている。`);
  }

  if (observation) logs.push(observation);
  return logs;
}

function generateHighlight(quest, party, itemIds, departConditions, result, rng) {
  const subject = partySubject(party);
  const isNight = departConditions?.timeOfDay === "夜";
  const isBattle = quest.category === "戦闘";
  const isInvestigation = quest.category === "調査";
  const humans = humanMembers(party);
  const pool = humans.length > 0 ? humans : party;

  // 武器・アクセサリー候補を先に準備する
  const front = pool.reduce((best, a) => (a.stats?.courage ?? 0) > (best.stats?.courage ?? 0) ? a : best, pool[0]);
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

  // 夜の戦闘・調査依頼
  if (isNight && (isBattle || isInvestigation)) {
    const lines = [
      `夜の${quest.area}から戻った${subject}は、言葉を選ぶように報告書を書いた。`,
      `夜に向かい、無事に戻ってきた。それだけで、今夜は十分だ。`
    ];
    if (frontWeapon) lines.push(`${frontName}は${frontWeapon.name}を手に夜道へ向かった。帰還したとき、それは少し傷ついていた。`);
    if (acc) lines.push(`${accName}の${acc.name}は、夜の遠征でもいつも通りそこにあった。`);
    // 執着：idleLine（夜の静けさに合う）
    if (obs) lines.push(`${obsName}【${obs.label}】— ${obs.idleLine}`);
    return pickOne(lines, rng);
  }

  // 戦闘依頼（夜以外）
  if (isBattle) {
    const isDefeat = result === "討伐";
    const lines = [
      `${frontName}は怯まず前に出た。それが今回の遠征で一番はっきりしたことだ。`,
      isDefeat ? `「なにか」は仕留められた。ただし正体は、まだ誰も知らない。` : `追い払いは成功した。ただし正体は、まだ誰も知らない。`
    ];
    if (frontWeapon) {
      lines.push(`${frontName}は${frontWeapon.name}を構え、${quest.area}の入口から最後まで動かなかった。`);
      lines.push(isDefeat
        ? `${frontWeapon.name}が「なにか」の動きを止めた。それで十分だった。`
        : `${frontWeapon.name}が「なにか」の退路を${quest.area}の外へ向けた。それで十分だった。`);
    }
    if (acc) lines.push(`${accName}の${acc.name}は、帰還後もしばらくその手元にあった。`);
    // 執着：positiveLine（行動として出た面）
    if (obs) lines.push(`${obsName}【${obs.label}】— ${obs.positiveLine}`);
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
  if (itemIds.includes("item_lantern") && isNight) {
    return `ランタンが暗がりで役立った。灯りがなければ、別の結果になっていたかもしれない。`;
  }
  if (itemIds.includes("item_bandage")) {
    return pickOne([
      `包帯を使う場面があった。大事には至らなかったが、持っていてよかった。`,
      `あの包帯がなかったら、帰りはもう少し遅くなっていただろう。`
    ], rng);
  }
  if (itemIds.includes("item_oilcase")) {
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
  if (category === "救助") {
    if (adv.job === "斥候") return "足跡追跡で";
    if (adv.job === "薬草師") return "痕跡判断で";
    if (adv.job === "見習い盾役") return "帰路確認で";
    if (adv.job === "戦士") return "呼びかけと支援で";
    if (adv.personality === "慎重") return "慎重な捜索で";
    return "救助補助で";
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
    if (adv.stats?.courage >= 20) return "前に出る判断で";
    if (adv.stats?.caution >= 20) return "慎重な距離取りで";
    if (adv.stats?.kindness >= 20) return "周囲への気配りで";
    return "戦闘に";
  }
  if (category === "調査") {
    if (adv.stats?.caution >= 20) return "慎重な距離取りで";
    if (adv.stats?.memory >= 20) return "記録役として";
    if (adv.stats?.kindness >= 20) return "周囲への気配りで";
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
    observationNotes = null,
    hiddenTags = {},
    highlight = null,
    tensionValue = null,
    tensionLevel = null,
    rng = null,
    wrapElsie = false
  } = options;

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
    observationNotes,
    departConditions,
    highlight: highlight ?? (rng ? generateHighlight(quest, party, itemIds, departConditions, result, rng) : null),
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

  if (quest.id === "quest_lingering_light") {
    const departTimeOfDay = expedition.departTimeOfDay ?? "昼";
    const lightLogs = generateLightInvestigationLogs(quest, party, adventurerItemIds, departTimeOfDay, rng);
    lightLogs.forEach((text, index) => add(index === lightLogs.length - 1 ? "afterglow" : "action", text));
    const isNight = departTimeOfDay === "夜";
    const observationNotes = isNight ? generateObservationNotes(quest, party, adventurerItemIds, rng) : null;
    const hasLantern = itemIds.includes("item_lantern");
    const adventurerHistoryLines = buildSafeAdventurerHistoryLines(party, quest, {
      result: isNight ? (hasLantern ? "夜間調査" : "灯り確認") : "昼間確認",
      elsieRoleNote: "鼻と警戒で",
      roleNoteFor: (adv) =>
        adv.stats?.caution >= 20 ? "慎重な距離取りで" : adv.stats?.memory >= 20 ? "記録役として" : adv.stats?.kindness >= 20 ? "周囲への気配りで" : "調査に"
    });

    return withElsieLog({
      id: `report_${Date.now()}`,
      questId: quest.id,
      adventurerIds: expedition.adventurerIds,
      adventurerItemIds,
      itemIds,
      opened: false,
      applied: false,
      result: isNight ? (hasLantern ? "調査成功" : "確認のみ") : "異常なし",
      summary: isNight
        ? (hasLantern ? "夜道の灯りを安全な距離から確認し、消えた方角を記録した。" : "夜道の灯りは確認したが、暗さのため接近調査は避けた。")
        : "昼間の道に異常はなく、問題の灯りも確認されなかった。",
      historyLine: `${quest.title}：${isNight ? (hasLantern ? "ランタンありで夜間確認。" : "夜間に灯りを確認、接近は保留。") : "昼間確認では異常なし。"}`,
      adventurerHistoryLines,
      logs,
      observationNotes,
      departConditions,
      highlight: generateHighlight(quest, party, itemIds, departConditions, isNight ? (hasLantern ? "調査成功" : "確認のみ") : "異常なし", rng),
      hiddenTags: { investigation: true, timeOfDay: departTimeOfDay, hasLantern, recordDensityGain: 1 + logs.length },
      ...tensionMeta,
      createdAt: new Date().toISOString()
    }, quest, party, rng);
  }

  if (quest.id === "quest_field_mystery") {
    const battleLogs = generateBattleLogs(quest, party, adventurerItemIds, rng, { itemIds, departConditions, tensionValue });
    battleLogs.forEach((text, index) => add(index === battleLogs.length - 1 ? "afterglow" : "action", text));
    const observationNotes = generateObservationNotes(quest, party, adventurerItemIds, rng);
    const adventurerHistoryLines = buildSafeAdventurerHistoryLines(party, quest, {
      result: "追い払い",
      elsieRoleNote: "吠えと警戒で",
      roleNoteFor: (adv) =>
        adv.stats?.courage >= 20 ? "前に出る判断で" : adv.stats?.caution >= 20 ? "慎重な距離取りで" : adv.stats?.kindness >= 20 ? "周囲への気配りで" : "追い払いに"
    });

    return withElsieLog({
      id: `report_${Date.now()}`,
      questId: quest.id,
      adventurerIds: expedition.adventurerIds,
      adventurerItemIds,
      itemIds,
      opened: false,
      applied: false,
      result: "追い払い",
      summary: "畑を荒らしていた未同定の相手を、畑の外へ追い払った。正体はまだ不明。",
      historyLine: "畑を荒らす「なにか」を追い払い。未同定のまま、特徴のみ記録。",
      adventurerHistoryLines,
      logs,
      observationNotes,
      departConditions,
      highlight: generateHighlight(quest, party, itemIds, departConditions, "追い払い", rng),
      hiddenTags: { combat: true, target: "「なにか」", recordDensityGain: 1 + logs.length },
      ...tensionMeta,
      createdAt: new Date().toISOString()
    }, quest, party, rng);
  }

  if (quest.id === "quest_barn_bite") {
    const huntLogs = generateBarnHuntLogs(quest, party, adventurerItemIds, rng, { itemIds, departConditions, tensionValue });
    huntLogs.forEach((text, index) => add(index === huntLogs.length - 1 ? "afterglow" : "action", text));
    const observationNotes = generateObservationNotes(quest, party, adventurerItemIds, rng);
    const adventurerHistoryLines = buildSafeAdventurerHistoryLines(party, quest, {
      result: "討伐",
      elsieRoleNote: "鼻と警戒で",
      roleNoteFor: (adv) =>
        adv.stats?.courage >= 20 ? "前に出る判断で" : adv.stats?.caution >= 20 ? "慎重な距離取りで" : adv.stats?.kindness >= 20 ? "周囲への気配りで" : "討伐に"
    });

    return withElsieLog({
      id: `report_${Date.now()}`,
      questId: quest.id,
      adventurerIds: expedition.adventurerIds,
      adventurerItemIds,
      itemIds,
      opened: false,
      applied: false,
      result: "討伐",
      summary: "納屋に巣食っていた未同定の相手を仕留めた。正体はまだ不明。",
      historyLine: "納屋の「なにか」を討伐。未同定のまま、特徴のみ記録。",
      adventurerHistoryLines,
      logs,
      observationNotes,
      departConditions,
      highlight: generateHighlight(quest, party, itemIds, departConditions, "討伐", rng),
      hiddenTags: { combat: true, target: "嚙みつく「なにか」", recordDensityGain: 1 + logs.length },
      ...tensionMeta,
      createdAt: new Date().toISOString()
    }, quest, party, rng);
  }

  // 保全依頼：辺境教会周辺の定期巡回
  if (quest.id === "quest_church_patrol") {
    let outcome = pickOne(["異常なし", "軽微な対処", "要再確認", "小さな違和感"], rng);
    if (hasPartyTrait(party, "personality", "慎重") && rng() < 0.45) outcome = pickOne(["異常なし", "軽微な対処"], rng);
    if (itemIds.includes("item_map") && rng() < 0.35) outcome = pickOne(["異常なし", "要再確認"], rng);

    const soloAdv = isSoloHumanParty(party);
    add("", soloAdv
      ? `${partySubject(party)}は「${quest.title}」のため、ひとりで${quest.area}へ向かった。`
      : `${partySubject(party)}は「${quest.title}」のため、${quest.area}へ向かった。`);
    const supplyDesc = buildSupplyDescLines(party, adventurerItemIds);
    add("", `支給品：${supplyDesc.length > 0 ? supplyDesc.join(" / ") : "なし"}。`);

    const patrolLogs = generateChurchPatrolLogs(quest, party, adventurerItemIds, rng, { itemIds, departConditions, tensionValue });
    patrolLogs.forEach((text) => add("action", text));

    const outcomeInfo = churchPatrolOutcomeText(outcome, party, rng);
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
      hiddenTags: { preservation: true, outcome },
      wrapElsie: true
    });
  }

  // 保全依頼：古い小橋の応急修理
  if (quest.id === "quest_old_bridge_repair") {
    let outcome = pickOne(["応急修理", "通行可", "一部保留"], rng);
    if (hasPartyTrait(party, "personality", "慎重") && rng() < 0.5) outcome = pickOne(["通行可", "応急修理"], rng);

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

    const outcomeInfo = bridgeRepairOutcomeText(outcome, party, rng);
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
      observationNotes: null,
      departConditions,
      highlight: generateHighlight(quest, party, itemIds, departConditions, outcomeInfo.result, rng),
      hiddenTags: { preservation: true, outcome, recordDensityGain: 1 + logs.length },
      ...tensionMeta,
      createdAt: new Date().toISOString()
    };
  }

  // 輸送依頼：薬草包みの納品
  if (quest.id === "quest_herb_delivery") {
    const weather = expedition.departWeather ?? "晴れ";
    let outcome = pickOne(["納品完了", "時刻内納品", "一部注意"], rng);
    if (hasPartyTrait(party, "personality", "慎重") && rng() < 0.5) outcome = pickOne(["納品完了", "時刻内納品"], rng);
    if ((weather === "小雨" || weather === "雨") && !itemIds.includes("item_oilcase") && rng() < 0.4) outcome = "一部注意";

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

    const outcomeInfo = herbDeliveryOutcomeText(outcome, party, rng);
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
      observationNotes: null,
      departConditions,
      highlight: generateHighlight(quest, party, itemIds, departConditions, outcomeInfo.result, rng),
      hiddenTags: { transport: true, outcome, recordDensityGain: 1 + logs.length },
      ...tensionMeta,
      createdAt: new Date().toISOString()
    };
  }

  // 救助依頼：帰ってこない薬草採りの確認
  if (quest.id === "quest_missing_herbalist") {
    let outcome = pickOne(["保護", "発見", "痕跡確認"], rng);
    if (hasPartyTrait(party, "job", "斥候") && rng() < 0.45) outcome = pickOne(["保護", "発見"], rng);
    if (hasPartyTrait(party, "personality", "慎重") && rng() < 0.4) outcome = pickOne(["発見", "保護"], rng);
    if (!itemIds.includes("item_whistle") && rng() < 0.35) outcome = pickOne(["痕跡確認", "発見"], rng);

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

    const outcomeInfo = missingHerbalistOutcomeText(outcome, party, rng);
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
      observationNotes: null,
      departConditions,
      highlight: generateHighlight(quest, party, itemIds, departConditions, outcomeInfo.result, rng),
      hiddenTags: { rescue: true, outcome, recordDensityGain: 1 + logs.length },
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
    else if (battle.outcome === "withdraw_second" && battle.smoke.questContinues) branch = "partial_loss"; // 交戦離脱＝荷の一部損失
    else if (battle.outcome === "withdraw_emergency" && battle.smoke.held) branch = "partial_loss"; // 臨時撤退も煙幕で追撃を断てる
    else if (battle.outcome === "withdraw_emergency" && partyHasElsie(party)) branch = "partial_elsie"; // E2：エルシーの早い警告が退き際を整える
    else if (battle.outcome === "withdraw_emergency") branch = "bail"; // 荷を置いて退く（臨時判断による撤退）
    else branch = "fail";

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
      tensionValue,
      tensionLevel,
      // battleHpRatios: 帰還時の個人HP率。負傷の確定に使う（第3段階）。エルシーは戦闘のHP管理外なので含まれない。
      hiddenTags: { escort: true, caravan: true, battleOutcome: battle ? battle.outcome : "no_enemy", branch, battleGrowth: caravanBattleGrowthSummary(battle, party), battleHpRatios: battleHpRatiosOf(battle) },
      wrapElsie: true
    });
  }

  // 隊商捜索チェーン：護衛失敗の後日談（stage1＝緊急捜索／stage2＝最後の手がかり）
  if (quest.id === "quest_caravan_search" || quest.id === "quest_caravan_lastchance") {
    const stage = quest.id === "quest_caravan_search" ? 1 : 2;
    const found = party.some((a) => a.job === "斥候") || party.some((a) => a.id === "adv_elsie");

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

    const outcomeInfo = caravanSearchOutcomeText(stage, found, party, rng);
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
        branch: found ? "recovered" : (stage === 2 ? "lost" : "fail")
      },
      wrapElsie: true
    });
  }

  if (quest.id === "quest_evening_market_escort") {
    let outcome = pickOne(["無事帰宅", "安全確認", "遠回り帰宅"], rng);
    if (hasPartyTrait(party, "personality", "慎重") && rng() < 0.5) outcome = pickOne(["安全確認", "無事帰宅"], rng);
    if (itemIds.includes("item_map") && rng() < 0.4) outcome = pickOne(["遠回り帰宅", "安全確認", "無事帰宅"], rng);

    const soloAdv = isSoloHumanParty(party);
    add("", soloAdv
      ? `${partySubject(party)}は「${quest.title}」のため、ひとりで${quest.area}へ向かった。`
      : `${partySubject(party)}は「${quest.title}」のため、${quest.area}へ向かった。`);
    const escortSupplyDesc = party.map((adv) => {
      const advItems = getAdvItemIds(adventurerItemIds, adv.id).map((iId) => getItem(iId)?.name).filter(Boolean);
      return advItems.length > 0 ? `${getDisplayName(adv)}：${advItems.join("・")}` : null;
    }).filter(Boolean);
    add("", `支給品：${escortSupplyDesc.length > 0 ? escortSupplyDesc.join(" / ") : "なし"}。`);

    const escortLogs = generateEveningEscortLogs(quest, party, adventurerItemIds, rng, { itemIds, departConditions, tensionValue });
    escortLogs.forEach((text) => add("action", text));

    const outcomeInfo = eveningEscortOutcomeText(outcome, party, rng);
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
      observationNotes: null,
      departConditions,
      highlight: generateHighlight(quest, party, itemIds, departConditions, outcomeInfo.result, rng),
      hiddenTags: { escort: true, outcome, recordDensityGain: 1 + logs.length },
      ...tensionMeta,
      createdAt: new Date().toISOString()
    };
  }

  // 記録依頼：古い石碑の拓本
  if (quest.id === "quest_old_stele_rubbing") {
    let outcome = pickOne(["拓本完了", "一部判読", "保存優先"], rng);
    if (hasPartyTrait(party, "personality", "慎重") && rng() < 0.5) outcome = pickOne(["保存優先", "拓本完了"], rng);
    if (hasPartyTrait(party, "job", "薬草師") && rng() < 0.45) outcome = pickOne(["拓本完了", "一部判読"], rng);

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

    const outcomeInfo = steleRubbingOutcomeText(outcome, party, rng);
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
      observationNotes: null,
      departConditions,
      highlight: generateHighlight(quest, party, itemIds, departConditions, outcomeInfo.result, rng),
      hiddenTags: { record: true, outcome, recordDensityGain: 1 + logs.length },
      ...tensionMeta,
      createdAt: new Date().toISOString()
    };
  }

  // 生活依頼（lifeQuestEventPools に登録されているもの）は専用フローで生成
  if (lifeQuestEventPools[quest.id]) {
    const pool = lifeQuestEventPools[quest.id];
    const workEvents = pickMany(pool.workEvents, 3 + Math.floor(rng() * 2), rng);
    let outcome = pickOne(pool.outcomes, rng);

    if (quest.id === "quest_wedding_support" && hasPartyTrait(party, "personality", "世話焼き") && rng() < 0.5) outcome = pickOne(["感謝", "成功"], rng);
    if (quest.id === "quest_old_house_cleanup" && hasPartyTrait(party, "personality", "慎重") && rng() < 0.5) outcome = pickOne(["成功", "整理完了"], rng);

    const outcomeInfo = lifeQuestOutcomeText(quest, party, itemIds, outcome, rng);
    const personal = lifeQuestPersonalEventText(quest, party, rng, tensionValue ?? 50);
    const supply = supplyEventText(quest, party, adventurerItemIds, rng);
    const statsLog = statsPersonalityLog(party, rng);
    const observationNotes = generateObservationNotes(quest, party, adventurerItemIds, rng);

    const arrivalLines = {
      quest_wedding_support: [
        `会場に着くと、すでに準備の真っ最中だった。依頼人の顔に安堵が浮かんだ。花の飾り付けはまだ途中だった。`,
        `町の小さな祝宴会場に着いた。外には招待客らしい人が少しずつ集まり始めていた。`
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
      highlight: generateHighlight(quest, party, itemIds, departConditions, outcomeInfo.result, rng),
      hiddenTags: { workEvents, outcome, recordDensityGain: 1 + logs.length },
      ...tensionMeta,
      createdAt: new Date().toISOString()
    }, quest, party, rng);
  }

  // 遠征依頼フロー
  const pool = questEventPools[quest.id];

  const weather = expedition.departWeather ?? "晴れ";
  const roadEvents = pickMany(pool.roadEvents, 2 + Math.floor(rng() * 2), rng);
  let outcome = pickOne(pool.outcomes, rng);

  // 支給品や人物特性で、納得感のある結果へ少しだけ寄せる。
  if (quest.id === "quest_letter" && itemIds.includes("item_oilcase") && rng() < 0.45) outcome = pickOne(["成功", "持ち帰り", "再配達"], rng);
  if (quest.id === "quest_letter" && hasPartyTrait(party, "background", "郵便配達人") && rng() < 0.45) outcome = pickOne(["成功", "部分成功", "再配達"], rng);
  if (quest.id === "quest_herb" && hasPartyTrait(party, "job", "薬草師") && rng() < 0.5) outcome = pickOne(["成功", "小成功", "採集優先"], rng);
  if (quest.id === "quest_signpost" && itemIds.includes("item_map") && rng() < 0.5) outcome = pickOne(["成功", "応急処置", "照合保留"], rng);

  const outcomeInfo = outcomeText(quest, party, itemIds, outcome, rng);
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
    highlight: generateHighlight(quest, party, itemIds, departConditions, outcomeInfo.result, rng),
    hiddenTags: {
      weather,
      roadEvents,
      outcome,
      recordDensityGain: 1 + logs.length
    },
    createdAt: new Date().toISOString()
  }, quest, party, rng);
}

navButtons.forEach((button) => {
  button.addEventListener("click", () => setRoute(button.dataset.route));
});

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

setInterval(() => {
  if (state.expedition) render();
}, 1000);

render();
// === 戦闘エンジン（土台） =====================================================
// 隊商護衛の掴み体験に向けた内部エンジン。まだ報告書ログ生成には接続していない。
// 検証用: DevToolsコンソールで debugBattleSim() を実行する。
// 数値はすべて叩き台（CURRENT_SPEC.md「戦闘内部値」参照）。

const BATTLE_TUNING = {
  jobBaseHp: { "戦士": 95, "見習い盾役": 110, "斥候": 78, "薬草師": 72 },
  defaultJobBaseHp: 85,
  hpPerSurvival: 0.6,
  frontOrder: ["戦士", "見習い盾役", "斥候", "薬草師"],
  retreatJobBase: { "斥候": 50, "薬草師": 55, "見習い盾役": 65, "戦士": 80 },
  retreatJobDefault: 55,
  retreatPersonalityShift: { "慎重": -10, "豪胆": 10, "我慢強い": 10 },
  scoreElsieBonus: 10,
  scoreSmokeBonus: 30,
  scoreEnemyLowHpPenalty: -25,
  enemyLowHpRatio: 0.2,
  scoreEffectiveItemPenalty: -20,
  frontDamageShare: 0.6,
  attackSqrtCombatCoef: 3.5,
  attackWeaponCoef: 2,
  strongDealRatio: 1.08,
  strongTakeHpRatio: 0.12,
  varianceMin: 0.75,
  varianceMax: 1.25,
  secondDecisionRound: 3,
  maxRounds: 8,
  // 軽（浅手）判定の累積被ダメ閾値。前衛60%集中のため真の無傷勝利は構造上0%であり、
  // 軽＝「手負いはあったが浅く、手当てで戻した」（原設計の「軽傷で勝利」）。0.18→0.25（2026-07-25）
  lightWoundRatio: 0.25,
  healAmount: 15,
  // 損耗による与ダメ低下（状態語連動・段階的）。因果が読めることを最優先（2026-07-24）
  woundAttackMult: { "手負い": 0.8, "深手": 0.5 },
  // 臨時撤退判断（スライス9）：仲間が深手/不能になった動揺のショック補正と、1戦闘あたりの発火上限
  emergencyShock: { "深手": 30, "戦闘不能": 50 },
  emergencyCap: 2
};

function getEnemyForQuest(quest) {
  if (!quest || !quest.enemyId || !Array.isArray(window.masterEnemies)) return null;
  return window.masterEnemies.find((e) => e.id === quest.enemyId) ?? null;
}

// 前衛は毎ラウンド選び直す。★ ルールは1行＝「負傷した者は下がり、無傷の者が前に出る」（H1-a・2026-07-29）。
// 境目は負傷の閾値と同じものを使う（battleStatusWord の「健在」＝HP率70%超）。しきい値を新設しない。
//   ・前衛は70%まで削られてから交代するので、深手が出る余地が残る
//   ・全員が順に70%まで削られるので、負傷は分散する
// 無傷の者がいなくなったら下がる先がないので、従来どおり frontOrder の順に戻る。
// frontOrder は初期の立ち位置も決める（1ラウンド目は全員が健在なのでここで決まる）。
function pickBattleFront(fighters) {
  const alive = fighters.filter((f) => !f.downed);
  if (alive.length === 0) return null;
  const isUnhurt = (f) => battleStatusWord(f.hp, f.maxHp) === "健在";
  const sorted = [...alive].sort((a, b) => {
    const au = isUnhurt(a);
    const bu = isUnhurt(b);
    if (au !== bu) return au ? -1 : 1;
    const ai = BATTLE_TUNING.frontOrder.indexOf(a.job);
    const bi = BATTLE_TUNING.frontOrder.indexOf(b.job);
    const ar = ai === -1 ? 99 : ai;
    const br = bi === -1 ? 99 : bi;
    if (ar !== br) return ar - br;
    return (b.courage ?? 0) - (a.courage ?? 0);
  });
  return sorted[0];
}

function computeBattleRetreatDecision(fighters, allyHpRatio, enemyHpRatio, context) {
  const alive = fighters.filter((f) => !f.downed);
  const base = (1 - allyHpRatio) * 100 + (enemyHpRatio - 0.5) * 30;
  let modifiers = 0;
  if (context.hasElsie) modifiers += BATTLE_TUNING.scoreElsieBonus;
  if (context.hasSmoke) modifiers += BATTLE_TUNING.scoreSmokeBonus;
  if (context.hasEffectiveItem) modifiers += BATTLE_TUNING.scoreEffectiveItemPenalty;
  if (enemyHpRatio <= BATTLE_TUNING.enemyLowHpRatio) modifiers += BATTLE_TUNING.scoreEnemyLowHpPenalty;
  const score = Math.round(base + modifiers);
  const votes = alive.map((f) => {
    const jobBase = BATTLE_TUNING.retreatJobBase[f.job] ?? BATTLE_TUNING.retreatJobDefault;
    const shift = BATTLE_TUNING.retreatPersonalityShift[f.personality] ?? 0;
    const threshold = jobBase + shift;
    return { id: f.id, name: f.name, threshold, score, retreat: score >= threshold };
  });
  const retreatCount = votes.filter((v) => v.retreat).length;
  const needed = Math.floor(alive.length / 2) + 1;
  return { score, votes, retreatCount, needed, retreat: retreatCount >= needed };
}

// stage（軽/中）は「累積被ダメ」基準（2026-07-23）：傷を負った事実は回復しても報告書に残す。
// 軽/中の対比軸は「深手が出たか」（2026-07-25裁定）：深手が出た戦闘は累積被ダメが浅くても軽にしない。
function battleStageLabel(outcome, woundRatio, hadDeepWound) {
  if (outcome === "victory") {
    return (woundRatio <= BATTLE_TUNING.lightWoundRatio && !hadDeepWound) ? "軽" : "中";
  }
  if (outcome === "withdraw_first") return "軽";
  if (outcome === "withdraw_second" || outcome === "withdraw_emergency" || outcome === "stalemate") return "重";
  return "致命";
}

// 交戦記録用の状態語（案B・スライス1）。閾値：70%以下で手負い、35%以下で深手、HP0で戦闘不能。
function battleStatusWord(hp, maxHp) {
  if (hp <= 0) return "戦闘不能";
  const ratio = hp / maxHp;
  if (ratio > 0.70) return "健在";
  if (ratio > 0.35) return "手負い";
  return "深手";
}

function simulateBattle(quest, party, itemIds, rng) {
  const enemy = getEnemyForQuest(quest);
  if (!enemy) return null;
  const random = rng ?? Math.random;
  const humans = party.filter((a) => a.species !== "dog");
  if (humans.length === 0) return null;
  const hasElsie = party.some((a) => a.species === "dog");
  const heldItems = Array.isArray(itemIds) ? itemIds : [];
  let bandages = heldItems.filter((id) => id === "item_bandage").length; // 包帯総数（エルシーは運び手：所持分も人間が使う）
  const hasSmoke = heldItems.includes("item_smoke");
  const effectiveIds = Array.isArray(quest.battleEffectiveItemIds) ? quest.battleEffectiveItemIds : [];
  const hasEffectiveItem = effectiveIds.some((id) => heldItems.includes(id));
  const context = { hasElsie, hasSmoke, hasEffectiveItem };

  const fighters = humans.map((a) => {
    const combatStat = a.stats?.combat ?? 10;
    const survivalStat = a.stats?.survival ?? 10;
    const weaponPower = a.weapon?.power ?? 0;
    // HP = job基礎値 + survival×0.6（2026-07-23 255スケール移行。盾役>戦士の序列）
    const maxHp = Math.round((BATTLE_TUNING.jobBaseHp[a.job] ?? BATTLE_TUNING.defaultJobBaseHp) + survivalStat * BATTLE_TUNING.hpPerSurvival);
    return {
      id: a.id,
      name: getDisplayName(a),
      job: a.job,
      personality: a.personality,
      courage: a.stats?.courage ?? 15,
      combat: combatStat,
      support: a.stats?.support ?? 10,
      // 与ダメは平方根型：成長を実感しつつ終盤のインフレを圧縮する
      attack: Math.sqrt(combatStat) * BATTLE_TUNING.attackSqrtCombatCoef + weaponPower * BATTLE_TUNING.attackWeaponCoef,
      weaponPower,
      weaponGuard: a.weapon?.guard ?? 0,
      hp: maxHp,
      maxHp,
      downed: false,
      status: "健在"
    };
  });

  const partyMaxHp = fighters.reduce((sum, f) => sum + f.maxHp, 0);
  let enemyHp = enemy.hp;
  const decisions = [];
  const roundLog = [];
  const events = []; // 交戦記録用イベント列（案B・スライス1）。既存ロジックからの派生記録のみ。
  let totalDamageTaken = 0; // 累積被ダメ（回復で戻さない総被弾）。stage判定の基準（2026-07-23）
  let emergencyCount = 0; // 臨時撤退判断の発火回数（emergencyCapまで）
  let outcome = null;
  let rounds = 0;

  const allyRatio = () => fighters.reduce((sum, f) => sum + Math.max(0, f.hp), 0) / partyMaxHp;
  const enemyRatio = () => Math.max(0, enemyHp) / enemy.hp;
  const variance = () => BATTLE_TUNING.varianceMin + random() * (BATTLE_TUNING.varianceMax - BATTLE_TUNING.varianceMin);

  const first = computeBattleRetreatDecision(fighters, allyRatio(), enemyRatio(), context);
  decisions.push({ at: "first", ...first });
  events.push({ type: "retreat", at: "first", round: 0, retreat: first.retreat });
  if (first.retreat) {
    outcome = "withdraw_first";
  } else {
    for (let round = 1; round <= BATTLE_TUNING.maxRounds; round++) {
      rounds = round;
      if (round === BATTLE_TUNING.secondDecisionRound) {
        const second = computeBattleRetreatDecision(fighters, allyRatio(), enemyRatio(), context);
        decisions.push({ at: "second", ...second });
        events.push({ type: "retreat", at: "second", round, retreat: second.retreat });
        if (second.retreat) {
          outcome = "withdraw_second";
          break;
        }
      }
      const alive = fighters.filter((f) => !f.downed);
      // 損耗DPS低下：状態語に応じて与ダメが段階的に落ちる（健在100%/手負い80%/深手50%）
      const offense = alive.reduce((sum, f) => sum + f.attack * (BATTLE_TUNING.woundAttackMult[f.status] ?? 1), 0);
      const dealt = Math.round(offense * variance());
      enemyHp -= dealt;
      // 与ダメージを各人の攻撃寄与で按分（表示用の派生値。合計 dealt は既存計算のまま）。
      if (offense > 0 && dealt > 0) {
        alive.forEach((f) => {
          const effAttack = f.attack * (BATTLE_TUNING.woundAttackMult[f.status] ?? 1);
          const personDealt = Math.round(dealt * (effAttack / offense));
          if (personDealt > 0) {
            // strong=自分の期待値（損耗後）より上振れした一撃。深手の者の上振れ＝「傷を押してなお重い一撃」
            events.push({ type: "deal", round, attackerId: f.id, attackerName: f.name, damage: personDealt, strong: personDealt >= effAttack * BATTLE_TUNING.strongDealRatio, attackerStatus: f.status });
          }
        });
      }
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
        const damage = Math.max(0, Math.round(share - f.weaponGuard));
        f.hp -= damage;
        if (f.hp <= 0) f.downed = true;
        hits.push({ id: f.id, damage, hp: Math.max(0, f.hp) });
        totalDamageTaken += damage;
        if (damage > 0) {
          events.push({ type: "take", round, targetId: f.id, targetName: f.name, damage, strong: damage >= f.maxHp * BATTLE_TUNING.strongTakeHpRatio });
        }
        // 状態語は遷移した瞬間だけ記録する（健在→手負い→深手→戦闘不能）。
        const newStatus = battleStatusWord(f.hp, f.maxHp);
        if (newStatus !== f.status) {
          events.push({ type: "status", round, targetId: f.id, targetName: f.name, from: f.status, to: newStatus });
          f.status = newStatus;
          if (newStatus === "手負い" || newStatus === "深手") woundedThisRound = true;
          if (newStatus === "深手" && (!crisis || crisis.to !== "戦闘不能")) crisis = { name: f.name, to: "深手" };
          if (newStatus === "戦闘不能") crisis = { name: f.name, to: "戦闘不能" };
        }
      });
      roundLog.push({ round, dealt, enemyHp: Math.max(0, enemyHp), frontId: front.id, hits });
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
          const healed = Math.min(BATTLE_TUNING.healAmount, target.maxHp - target.hp);
          target.hp += healed;
          events.push({ type: "heal", round, healerId: healer.id, healerName: healer.name, targetId: target.id, targetName: target.name, amount: healed, self: healer.id === target.id });
          const backStatus = battleStatusWord(target.hp, target.maxHp);
          if (backStatus !== target.status) {
            events.push({ type: "status", round, targetId: target.id, targetName: target.name, from: target.status, to: backStatus, recovered: true });
            target.status = backStatus;
          }
        }
      }
      // ★臨時撤退判断（スライス9）：仲間が深手/戦闘不能になったラウンドの末、一行が迷う。
      // 「動揺スコア」＝損耗＋ショック（＋エルシーの警告は本能なので維持）。
      // 道具や敵の残り体力のそろばん（包帯-20/煙幕+30/敵瀕死-25）は動揺時には働かない。
      // 成立は生存者の半数以上（動揺時は安全側に倒れる）。定期2回制はそのまま。
      if (crisis && emergencyCount < BATTLE_TUNING.emergencyCap) {
        emergencyCount++;
        const shock = BATTLE_TUNING.emergencyShock[crisis.to] ?? 0;
        const emScore = Math.round((1 - allyRatio()) * 100) + shock + (hasElsie ? BATTLE_TUNING.scoreElsieBonus : 0);
        const standing = fighters.filter((f) => !f.downed);
        const yes = standing.filter((f) => emScore >= ((BATTLE_TUNING.retreatJobBase[f.job] ?? BATTLE_TUNING.retreatJobDefault) + (BATTLE_TUNING.retreatPersonalityShift[f.personality] ?? 0))).length;
        const retreatNow = yes >= Math.ceil(standing.length / 2);
        decisions.push({ at: "emergency", score: emScore, retreat: retreatNow });
        events.push({ type: "retreat", at: "emergency", round, retreat: retreatNow, causeName: crisis.name, causeTo: crisis.to });
        if (retreatNow) { outcome = "withdraw_emergency"; break; }
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
    members: fighters.map((f) => ({ id: f.id, name: f.name, job: f.job, hp: Math.max(0, f.hp), maxHp: f.maxHp, downed: f.downed })),
    decisions,
    roundLog,
    events,
    smoke: { held: hasSmoke, questContinues: hasSmoke && (outcome === "withdraw_first" || outcome === "withdraw_second") }
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
