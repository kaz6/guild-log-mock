const STORAGE_KEY = "expeditionGuildLogMockV011";
const DEMO_DURATION_MS = 10000;
const MOCK_VERSION = "v0.1.2";

const masterAdventurers = [
  {
    id: "adv_mina",
    name: "ミナ・レイフォード",
    nickname: "ミナ",
    favorite: true,
    job: "斥候",
    personality: "慎重",
    background: "郵便配達人",
    memo: "道をよく覚えている。無理をしない判断ができる。手紙配達系の依頼に向いていそう。",
    status: "待機中",
    history: [],
    stats: { memory: 5 }
  },
  {
    id: "adv_gadd",
    name: "ガッド・オルベイン",
    nickname: "鉄鍋",
    favorite: false,
    job: "戦士",
    personality: "豪胆",
    background: "宿場の用心棒",
    memo: "前に出る癖がある。危険度が低い依頼でも、念のため包帯を持たせたい。",
    status: "待機中",
    history: [],
    stats: { memory: 2 }
  },
  {
    id: "adv_elne",
    name: "エルネ・シェルカ",
    nickname: "",
    favorite: false,
    job: "薬草師",
    personality: "世話焼き",
    background: "村の調合係",
    memo: "採集依頼で頼りになる。休憩時の観察が細かい。",
    status: "待機中",
    history: [],
    stats: { memory: 4 }
  }
];

const masterQuests = [
  {
    id: "quest_herb",
    title: "森の薬草採集",
    category: "探索",
    danger: "低",
    area: "薄明の森",
    recommended: ["斥候", "薬草師"],
    tags: ["探索", "採集", "観察"],
    observationTarget: "森喰い兎",
    summary: "森の浅い場所で薬草を採集する。小型の獣による荷荒らしが報告されている。"
  },
  {
    id: "quest_signpost",
    title: "古い道標の確認",
    category: "探索",
    danger: "低",
    area: "古い街道",
    recommended: ["斥候"],
    tags: ["探索", "街道", "記録"],
    observationTarget: "なし",
    summary: "雨で傾いた道標を確認し、街道記録と照合する。戦闘は想定されていない。"
  },
  {
    id: "quest_letter",
    title: "届けられなかった手紙",
    category: "生活",
    danger: "低",
    area: "雨待ちの街道",
    recommended: ["慎重", "郵便配達人"],
    tags: ["生活", "配達", "記録"],
    observationTarget: "なし",
    summary: "宿場に残された古い手紙を、記録上の宛先まで届ける。簡単な確認依頼。"
  },
  {
    id: "quest_wedding_support",
    title: "結婚式の裏方",
    category: "生活",
    danger: "低",
    area: "町の小さな祝宴会場",
    recommended: ["世話焼き", "郵便配達人", "豪胆"],
    tags: ["生活", "祝宴", "運搬", "案内", "地域"],
    observationTarget: "なし",
    summary: "町の小さな結婚式を手伝う。会場設営、料理の運搬、招待客の案内、夜間の見回り、迷子対応を行う。"
  },
  {
    id: "quest_old_house_cleanup",
    title: "廃屋の片付け",
    category: "生活",
    danger: "低",
    area: "町外れの古い家屋",
    recommended: ["慎重", "豪胆", "記録"],
    tags: ["生活", "片付け", "記録", "荷運び", "古物"],
    observationTarget: "なし",
    summary: "町外れの古い家屋を片付ける。壊れた家具、古い手紙、小物、埃をかぶった生活用品を整理する。"
  }
];

const masterItems = [
  { id: "item_bandage", name: "包帯", tags: ["治療", "負傷ログ"], note: "負傷時のログや撤退判断に影響する。" },
  { id: "item_map", name: "古地図", tags: ["道迷い", "街道照合"], note: "街道・森・古い道標の記録照合に使える。" },
  { id: "item_whistle", name: "笛", tags: ["合流", "撤退"], note: "視界が悪い場所での合流ログに影響する。" },
  { id: "item_pot", name: "携帯鍋", tags: ["休憩", "士気"], note: "休憩ログや関係性ログに影響する。" },
  { id: "item_oilcase", name: "油紙の手紙入れ", tags: ["手紙", "雨", "記録保護"], note: "紙の依頼書や手紙を濡らさず運ぶ。" },
  { id: "item_obs_sheet", name: "観察記録票", tags: ["観察", "記録", "生物", "図鑑"], note: "観察対象がいる依頼で持たせると、報告書に冒険者ごとの観察メモが追加される。" }
];

const masterObservations = [
  {
    id: "obs_rabbit",
    name: "森喰い兎",
    category: "通常敵",
    testimony: ["森の浅い場所で荷物を荒らす小型の獣。"],
    facts: ["薬草袋や革袋を噛み破る。"],
    inference: ["食料や薬草の匂いに寄ってくる可能性がある。"],
    next: ["雨天時にも活動するか。", "火や金属音を恐れるか。"]
  },
  {
    id: "obs_mushroom",
    name: "泥被り茸",
    category: "採集対象",
    testimony: ["湿った倒木の近くに生える薬用茸。"],
    facts: ["泥をかぶった個体ほど香りが強い。"],
    inference: ["雨上がりに採集量が増える可能性がある。"],
    next: ["調合時の効果差を確認する。"]
  }
];

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

function createInitialState() {
  return {
    adventurers: structuredClone(masterAdventurers),
    quests: structuredClone(masterQuests),
    items: structuredClone(masterItems),
    observations: structuredClone(masterObservations),
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
    lastObservationUpdate: null,
    beastLog: {},
    reportMemos: []
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
    const merged = { ...base, ...parsed, worldState: { ...base.worldState, ...(parsed.worldState ?? {}) } };
    merged.quests = mergeMasterList(masterQuests, parsed.quests);
    merged.items = mergeMasterList(masterItems, parsed.items);
    merged.adventurers = mergeMasterList(masterAdventurers, parsed.adventurers);
    // 旧形式 { advId: "itemId" } を新形式 { advId: ["itemId", null] } に正規化
    merged.selectedAdventurerItems = normalizeItemMap(parsed.selectedAdventurerItems);
    return merged;
  } catch (error) {
    console.warn("保存データの読み込みに失敗したため初期化します", error);
    return createInitialState();
  }
}

function mergeMasterList(masterList, savedList = []) {
  const savedById = new Map(savedList.map((item) => [item.id, item]));
  return masterList.map((masterItem) => ({ ...masterItem, ...(savedById.get(masterItem.id) ?? {}) }));
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
  const elapsed = Date.now() - state.expedition.startTime;
  if (elapsed < state.expedition.durationMs) return;

  const report = generateReport(state.expedition);
  state.reports.unshift(report);
  state.expedition.adventurerIds.forEach((id) => {
    const adv = getAdventurer(id);
    if (adv) adv.status = "待機中";
  });
  state.expedition = null;
  saveState();
}

function render() {
  checkExpeditionCompletion();
  navButtons.forEach((button) => button.classList.toggle("active", button.dataset.route === route));

  const titles = {
    home: "ギルド",
    quests: "依頼掲示板",
    adventurers: "冒険者名簿",
    observations: "報告メモ",
    beastlog: "いきもの図鑑",
    report: "報告書"
  };
  viewTitle.textContent = titles[route] ?? "ギルド";

  if (route === "home") renderHome();
  if (route === "quests") renderQuests();
  if (route === "adventurers") renderAdventurers();
  if (route === "observations") renderObservations();
  if (route === "beastlog") renderBeastLog();
  if (route === "report") renderReportDetail(state.activeReportId);
}

function renderHome() {
  const unopened = state.reports.filter((report) => !report.opened);
  const latestReports = state.reports.slice(0, 3);
  const expedition = state.expedition;

  app.innerHTML = `
    <div class="grid-2">
      <section class="card">
        <div class="card-body reception">
          <div class="reception-portrait" aria-hidden="true"></div>
          <div>
            <p class="eyebrow">Guild Reception</p>
            <h3>受付嬢</h3>
            <div class="speech">
              ${unopened.length > 0
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
  const elapsed = Math.max(0, Date.now() - expedition.startTime);
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
        <div class="button-row">
          <button class="secondary-button" onclick="advanceTimeForMock()">Mock用：扉の音を待たず報告書を届ける</button>
        </div>
      </div>
    </section>
  `;
}

function renderQuests() {
  const selectedQuest = getQuest(selectedQuestId);
  const canStart = selectedQuestId && selectedAdventurerIds.length > 0 && !state.expedition;

  app.innerHTML = `
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
          ${state.quests.map(questCardHtml).join("")}
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
            <span class="status-pill">${selectedAdventurerIds.length}/3人</span>
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
        ${selectedQuest ? dispatchSummaryHtml(selectedQuest) : `<div class="empty">まず依頼を選んでください。</div>`}
        <div class="button-row" style="margin-top: 16px;">
          <button class="primary-button" ${canStart ? "" : "disabled"} onclick="startExpedition()">遠征開始</button>
          <button class="ghost-button" onclick="clearSelections()">選択解除</button>
        </div>
      </div>
    </section>
  `;
}

function questCardHtml(quest) {
  const selected = selectedQuestId === quest.id;
  const tags = quest.tags ?? quest.recommended ?? [];
  const isLifeQuest = quest.category === "生活";
  return `
    <article class="quest-card ${selected ? "selected" : ""}" onclick="selectQuest('${quest.id}')">
      <h3>${escapeHtml(quest.title)}</h3>
      <p class="muted">${escapeHtml(quest.summary)}</p>
      <div class="kv">
        <span>分類</span><strong>${escapeHtml(quest.category ?? "遠征")}</strong>
        <span>${isLifeQuest ? "作業負荷" : "危険度"}</span><strong class="${isLifeQuest ? "subtle-danger" : ""}">${escapeHtml(quest.danger)}</strong>
        <span>地域</span><strong>${escapeHtml(quest.area)}</strong>
        <span>観察対象</span><strong>${escapeHtml(quest.observationTarget)}</strong>
      </div>
      <div class="tags">${tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>
    </article>
  `;
}

function selectableAdventurerHtml(adventurer) {
  const selected = selectedAdventurerIds.includes(adventurer.id);
  const disabled = adventurer.status !== "待機中";
  return `
    <article class="adventurer-card ${selected ? "selected" : ""}" onclick="toggleAdventurer('${adventurer.id}')">
      <div class="card-title">
        <div>
          <h3>${adventurer.favorite ? "★ " : ""}${escapeHtml(getDisplayName(adventurer))}</h3>
          <p class="muted">${escapeHtml(adventurer.job)} / ${escapeHtml(adventurer.personality)} / 前職：${escapeHtml(adventurer.background)}</p>
        </div>
        <span class="status-pill ${disabled ? "away" : ""}">${escapeHtml(adventurer.status)}</span>
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

function dispatchSummaryHtml(quest) {
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
      <span>所要時間</span><strong>Mockでは約10秒</strong>
    </div>
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
        <span class="status-pill ${adventurer.status !== "待機中" ? "away" : ""}">${escapeHtml(adventurer.status)}</span>
      </div>
      <div class="tags">
        <span class="tag">${escapeHtml(adventurer.job)}</span>
        <span class="tag">${escapeHtml(adventurer.personality)}</span>
        <span class="tag">${escapeHtml(adventurer.background)}</span>
      </div>
    </article>
  `;
}

function adventurerEditorHtml(adventurer) {
  return `
    <div class="card-title">
      <div>
        <p class="eyebrow">Record Makeup</p>
        <h3>${escapeHtml(getDisplayName(adventurer))}</h3>
      </div>
      <button class="small-button" onclick="toggleFavorite('${adventurer.id}')">${adventurer.favorite ? "★ お気に入り" : "☆ お気に入り"}</button>
    </div>

    <div class="kv">
      <span>本名</span><strong>${escapeHtml(adventurer.name)}</strong>
      <span>職業</span><strong>${escapeHtml(adventurer.job)}</strong>
      <span>性格</span><strong>${escapeHtml(adventurer.personality)}</strong>
      <span>前職</span><strong>${escapeHtml(adventurer.background)}</strong>
    </div>

    <hr class="soft" />

    <div class="form-row">
      <label for="nicknameInput">あだ名</label>
      <input id="nicknameInput" value="${escapeHtml(adventurer.nickname)}" placeholder="例：ミナ、鉄鍋" />
    </div>
    <div class="form-row">
      <label for="memoInput">記録係メモ</label>
      <textarea id="memoInput" placeholder="この冒険者について覚えておきたいこと">${escapeHtml(adventurer.memo)}</textarea>
    </div>
    <div class="button-row">
      <button class="primary-button" onclick="saveAdventurerMemo('${adventurer.id}')">記録を保存</button>
    </div>

    <hr class="soft" />
    <p class="meta-label">最近の記録</p>
    ${adventurer.history.length === 0 ? `<div class="empty">まだ遠征記録はありません。</div>` : `
      <div class="log-list">
        ${adventurer.history.slice(0, 5).map((line) => `<div class="log-line afterglow">${escapeHtml(line)}</div>`).join("")}
      </div>
    `}
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

function isNewObservationLine(obsId, key, line) {
  const luo = state.lastObservationUpdate;
  if (!luo) return false;
  const item = luo.items.find((i) => i.id === obsId);
  if (!item) return false;
  return (item.keys[key] ?? []).includes(line);
}

function observationHtml(obs) {
  return `
    <article class="observation-card">
      <div class="card-title">
        <div>
          <h3>${escapeHtml(obs.name)}</h3>
          <p class="muted">分類：${escapeHtml(obs.category)}</p>
        </div>
      </div>
      ${observationSectionHtml("証言", obs.testimony, obs.id, "testimony")}
      ${observationSectionHtml("確認された事実", obs.facts, obs.id, "facts")}
      ${observationSectionHtml("推定", obs.inference, obs.id, "inference")}
      ${observationSectionHtml("次に調べること", obs.next, obs.id, "next")}
    </article>
  `;
}

function observationSectionHtml(title, lines, obsId, key) {
  return `
    <p class="meta-label">${escapeHtml(title)}</p>
    <ul>
      ${lines.map((line) => {
        const isNew = obsId && key && isNewObservationLine(obsId, key, line);
        return `<li class="muted${isNew ? " new-observation-highlight" : ""}">${escapeHtml(line)}</li>`;
      }).join("")}
    </ul>
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
      ${entry.behavior  ? `<p class="meta-label">行動</p><p class="muted">${escapeHtml(entry.behavior)}</p>` : ""}
      ${entry.notes     ? `<p class="meta-label">観察メモ</p><p class="muted">${escapeHtml(entry.notes)}</p>` : ""}
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
    category: "",
    appearance: "",
    behavior: "",
    danger: "",
    effectiveMeasures: "",
    ineffectiveMeasures: "",
    notes: "",
    nextCheck: ""
  };

  let overlay = document.getElementById("beastLogOverlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "beastLogOverlay";
    overlay.className = "beast-log-overlay";
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = beastLogEditorHtml(entry, obsNotes);
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
    category: document.getElementById("bl_category").value.trim(),
    appearance: document.getElementById("bl_appearance").value.trim(),
    behavior: document.getElementById("bl_behavior").value.trim(),
    danger: document.getElementById("bl_danger").value.trim(),
    effectiveMeasures: document.getElementById("bl_effective").value.trim(),
    ineffectiveMeasures: document.getElementById("bl_ineffective").value.trim(),
    notes: document.getElementById("bl_notes").value.trim(),
    nextCheck: document.getElementById("bl_nextcheck").value.trim()
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

  const f = (id, label, val, ph, multiline = false) => {
    const esc = escapeHtml(val || "");
    return multiline
      ? `<div class="bl-form-row"><label for="${id}">${label}</label><textarea id="${id}" placeholder="${ph}">${esc}</textarea></div>`
      : `<div class="bl-form-row"><label for="${id}">${label}</label><input id="${id}" value="${esc}" placeholder="${ph}" /></div>`;
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
          ${f("bl_target",      "対象名",           entry.target,              "例：森喰い兎")}
          ${f("bl_category",    "分類",              entry.category,            "例：小型獣、植物")}
          ${f("bl_area",        "遭遇地域",          entry.area,                "例：薄明の森")}
          ${f("bl_appearance",  "外見・特徴",        entry.appearance,          "体の大きさ、色、特徴的な部位など", true)}
          ${f("bl_behavior",    "行動",              entry.behavior,            "どう動くか、何を狙うか、いつ活動するか", true)}
          ${f("bl_danger",      "危険性",            entry.danger,              "直接の攻撃、荷物への被害、感染など", true)}
          ${f("bl_effective",   "有効だった対処",    entry.effectiveMeasures,   "追い払えた方法、回避できた状況など", true)}
          ${f("bl_ineffective", "効かなかった対処",  entry.ineffectiveMeasures, "試したが効果がなかったこと", true)}
          ${f("bl_notes",       "観察メモ",          entry.notes,               "気になったこと、次回への引き継ぎ", true)}
          ${f("bl_nextcheck",   "次に確認したいこと", entry.nextCheck,           "次回の観察で調べたいこと", true)}
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
          <span>${quest?.category === "生活" ? "作業結果" : "結果"}</span><strong>${escapeHtml(report.result)}</strong>
        </div>
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

function selectQuest(id) {
  selectedQuestId = id;
  saveState();
  render();
}

function toggleAdventurer(id) {
  const adv = getAdventurer(id);
  if (!adv || adv.status !== "待機中") return;
  if (selectedAdventurerIds.includes(id)) {
    selectedAdventurerIds = selectedAdventurerIds.filter((advId) => advId !== id);
    delete selectedAdventurerItems[id];
  } else {
    if (selectedAdventurerIds.length >= 3) return;
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
  selectedQuestId = null;
  selectedAdventurerIds = [];
  selectedAdventurerItems = {};
  saveState();
  render();
}

function startExpedition() {
  if (!selectedQuestId || selectedAdventurerIds.length === 0 || state.expedition) return;
  selectedAdventurerIds.forEach((id) => {
    const adv = getAdventurer(id);
    if (adv) adv.status = "遠征中";
  });
  state.worldState.totalExpeditions += 1;
  state.expedition = {
    id: `exp_${Date.now()}`,
    questId: selectedQuestId,
    adventurerIds: [...selectedAdventurerIds],
    adventurerItemIds: JSON.parse(JSON.stringify(selectedAdventurerItems)),
    itemIds: getAllItemIds(selectedAdventurerItems),
    startTime: Date.now(),
    durationMs: DEMO_DURATION_MS,
    seed: Math.floor(Math.random() * 1000000)
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
  render();
}

function openReport(id) {
  const report = state.reports.find((item) => item.id === id);
  if (!report) return;
  report.opened = true;
  if (!report.applied) {
    applyReport(report);
    report.applied = true;
  }
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
  state.worldState.recordDensity += 1 + report.observationUpdates.length;
  state.worldState.attachmentScore += report.adventurerIds.length;
  if (report.observationUpdates.length > 0) state.worldState.anomalyPressure += 0;

  const newHighlightItems = [];
  report.observationUpdates.forEach((update) => {
    const obs = state.observations.find((item) => item.id === update.id);
    if (!obs) return;
    const addedKeys = {};
    for (const [key, lines] of Object.entries(update.add)) {
      const added = [];
      lines.forEach((line) => {
        if (!obs[key].includes(line)) {
          obs[key].push(line);
          added.push(line);
        }
      });
      if (added.length > 0) addedKeys[key] = added;
    }
    if (Object.keys(addedKeys).length > 0) newHighlightItems.push({ id: update.id, keys: addedKeys });
  });

  if (newHighlightItems.length > 0) {
    state.lastObservationUpdate = { reportId: report.id, items: newHighlightItems };
  }

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
  return party.find((adv) => adv[key] === value) ?? party[0];
}

function formatNames(party) {
  return party.map(getDisplayName).join("、");
}

function generateWeatherLog(quest, party, weather, rng) {
  const solo = party.length === 1;
  const leader = getDisplayName(pickOne(party, rng));
  const careful = findByTrait(party, "personality", "慎重");
  const caregiver = findByTrait(party, "personality", "世話焼き");
  const brave = findByTrait(party, "personality", "豪胆");

  if (solo) {
    const table = {
      晴れ: [
        `朝の光が差す中、${leader}は${quest.area}へひとりで向かった。出発前に装備をもう一度確かめ、足取り軽く歩き始めた。`,
        `空はよく晴れていた。視界が広く、${leader}は遠くの道標まで確認しながら一人で進んだ。`
      ],
      小雨: [
        `小雨の中、${leader}は外套の襟を立てて進んだ。紙の依頼書は湿りやすく、何度も手元を確認した。`,
        `出発からしばらくして細い雨が降り始めた。${leader}は濡れやすいものを荷物の内側へ移し直した。`
      ],
      霧: [
        `街道には薄い霧がかかっていた。${leader}は足跡と轍を見比べ、急がずに進むことを選んだ。`,
        `霧で視界が悪い。${leader}は立ち止まって耳を澄ませ、足元を確かめてから歩き続けた。`
      ],
      強風: [
        `風が強く、依頼書の端が何度も跳ねた。${leader}は荷紐を結び直し、風を避けるように低い道を選んだ。`,
        `古い街道には乾いた葉が舞っていた。${leader}は顔を伏せながら、黙って歩き続けた。`
      ],
      雨上がり: [
        `雨上がりの道はぬかるんでいた。${leader}は泥の深さを見て、遠回りでも固い道を選んだ。`,
        `森の入口には湿った匂いが残っていた。${leader}は「こういう日は足元から冷える」と呟きながら進んだ。`
      ]
    };
    return pickOne(table[weather] ?? table["晴れ"], rng);
  }

  const table = {
    晴れ: [
      `朝の光が差す中、一行は${quest.area}へ向かった。足取りは軽く、${leader}は出発前に装備をもう一度確かめた。`,
      `空はよく晴れていた。視界が広く、${getDisplayName(careful)}は遠くの道標まで確認しながら進んだ。`
    ],
    小雨: [
      `小雨の中、一行は外套の襟を立てて進んだ。紙の依頼書は湿りやすく、${getDisplayName(careful)}が何度も手元を確認した。`,
      `出発からしばらくして細い雨が降り始めた。${getDisplayName(caregiver)}は仲間の荷物に布をかけ、濡れやすいものを内側へ移した。`
    ],
    霧: [
      `街道には薄い霧がかかっていた。${getDisplayName(careful)}は足跡と轍を見比べ、急がずに進むことを選んだ。`,
      `霧で視界が悪い。${getDisplayName(brave)}は先に進もうとしたが、仲間の声を聞いて歩幅を落とした。`
    ],
    強風: [
      `風が強く、依頼書の端が何度も跳ねた。${leader}は荷紐を結び直し、一行は風を避けるように低い道を選んだ。`,
      `古い街道には乾いた葉が舞っていた。${getDisplayName(brave)}は笑っていたが、声は風に流されてほとんど聞こえなかった。`
    ],
    雨上がり: [
      `雨上がりの道はぬかるんでいた。${getDisplayName(careful)}は泥の深さを見て、遠回りでも固い道を選んだ。`,
      `森の入口には湿った匂いが残っていた。${getDisplayName(caregiver)}は「こういう日は足元から冷えます」と仲間に声をかけた。`
    ]
  };
  return pickOne(table[weather], rng);
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
  const solo = party.length === 1;
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
      `道の脇に古い道標が立っていた。文字は薄いが、まだ読める。${has("item_map") ? "古地図と照合すると、少しだけ表記が古いことが分かった。" : "一行は目印だけを報告書に写し取った。"}`,
      `${name(scout)}は道標の根元を調べ、最近誰かが土を踏み固めた跡を見つけた。`
    ],
    商人とのすれ違い: [
      `途中で荷車を引く商人とすれ違った。商人は「その先の家なら、夕方には戻るはずだ」と教えてくれた。`,
      `商人は手紙の宛名を見ても首をかしげたが、古い屋号だけは聞き覚えがあると言った。`
    ],
    封蝋の確認: [
      `${name(post)}は封蝋に触れず、光にかざして割れがないことだけを確認した。昔の癖が出たらしい。`,
      solo
        ? `${name(warrior)}は封蝋を確認しようとして、思いとどまった。光にかざして状態を見るだけにした。`
        : `封蝋は古いが、まだ保たれていた。${name(warrior)}は不用意に触ろうとして、${name(scout)}に止められた。`
    ],
    宛先の聞き込み: [
      `宛先の家はすぐには見つからなかった。${name(scout)}は井戸端で聞き込みを行い、古い表札の場所を聞き出した。`,
      `${name(post)}は家の並びを見て、表通りより裏道に残っている家だと判断した。`
    ],
    犬の遠吠え: [
      `遠くで犬が吠えた。危険はなかったが、${solo ? name(party[0]) : "一行"}は少し歩く速度を上げた。`,
      `${name(warrior)}は剣の柄に手を置いたが、吠え声はすぐに遠ざかった。`
    ],
    湿った足跡: [
      solo
        ? `${name(scout)}は湿った足跡を見つけ、荷物を手元に引き寄せて周囲を確認した。小型の獣が近くを通った可能性がある。`
        : `${name(scout)}は湿った足跡を見つけ、荷物を一か所にまとめるよう合図した。小型の獣が近くを通った可能性がある。`,
      `泥の上に小さな足跡が残っていた。${name(herbalist)}は薬草袋の口を固く結び直した。`
    ],
    倒木: [
      solo
        ? `倒木が道をふさいでいた。${name(warrior)}が枝を払い、自分で安全な迂回路を確かめた。`
        : `倒木が道をふさいでいた。${name(warrior)}が枝を払い、${name(scout)}が安全な迂回路を探した。`,
      `古い倒木の裏側に、泥被り茸がいくつか生えていた。${name(herbalist)}は無理に引き抜かず、根元の土ごと採取した。`
    ],
    森喰い兎: [
      `森喰い兎が薬草袋に飛びついた。${name(scout)}は短弓で牽制し、距離を取らせた。`,
      `草むらが揺れ、小さな影が荷袋へ走った。${name(warrior)}が足音で追い払い、袋の破れは最小限で済んだ。`
    ],
    薬草袋の破れ: [
      `薬草袋の縫い目が裂けかけていた。${has("item_bandage") ? "支給された包帯を荷紐の補修に使い、採集物を失わずに済んだ。" : "一行は外套の紐で応急処置をしたが、少量の葉を失った。"}`,
      `${name(herbalist)}は袋の中身を並べ直し、香りの強い薬草を内側へ移した。`
    ],
    泥被り茸の群生: [
      `倒木の陰に泥被り茸が群生していた。${name(herbalist)}は香りの強い個体だけを選び、採り過ぎないよう数を控えた。`,
      `泥をかぶった茸ほど香りが強い。${name(herbalist)}はその違いを報告書の余白に書き残した。`
    ],
    休憩地点: [
      `${has("item_pot") ? `${name(herbalist)}は携帯鍋で薄いスープを作った。${name(warrior)}は文句を言いながらも、最後まで飲み干した。` : `一行は倒木のそばで短い休憩を取った。温かいものはないが、靴紐を結び直す余裕はあった。`}`,
      `休憩中、${name(scout)}は森の音が途切れる場所を記録した。採集路としては使えそうだ。`
    ],
    道標の傾き: [
      solo
        ? `道標は片側へ傾いていた。${name(warrior)}は支えながら、反対の手で根元の土を確認した。`
        : `道標は片側へ傾いていた。${name(warrior)}が支え、${name(scout)}が根元の土を確認した。`,
      `傾いた道標は、近づいてみるとまだ読めた。文字の向きだけが少し怪しい。`
    ],
    苔に隠れた文字: [
      `苔に隠れた文字を、${name(scout)}が小刀の背で慎重に落とした。地名はかろうじて読めた。`,
      solo
        ? `文字の一部は苔で見えない。${name(warrior)}は強くこすろうとしたが、木が崩れそうなため思いとどまった。`
        : `文字の一部は苔で見えない。${name(warrior)}は強くこすろうとしたが、木が崩れそうだったため止められた。`
    ],
    旧道の分岐: [
      `${has("item_map") ? `古地図には、現在使われていない旧道の線が残っていた。一行は分岐を確認し、報告書に照合結果を残した。` : `旧道らしき分岐があったが、手元の記録だけでは照合しきれなかった。次回は古地図が必要。`}`,
      `分岐の先は草に覆われていた。通行量は少ないが、完全に途絶えているわけではない。`
    ],
    壊れた橋: [
      solo
        ? `小さな橋の板が一枚抜けていた。${name(warrior)}は端を踏みしめ、安全に渡れることを確かめてから渡った。`
        : `小さな橋の板が一枚抜けていた。${name(warrior)}が先に渡り、他の者の足場を確かめた。`,
      `橋は渡れたが、荷車には危ない。報告書には「徒歩なら可、荷運びは不可」と記録された。`
    ],
    通行人の証言: [
      `通行人は「最近、道標を直そうとした者がいた」と話した。名前までは分からない。`,
      `旅人から、雨の日だけ旧道を使う者がいると聞いた。理由はまだ分からない。`
    ],
    根元のゆるみ: [
      `道標の根元は雨でゆるんでいた。${has("item_bandage") ? "包帯を仮の固定具として巻き、石を積んで補強した。" : "一行は石を積んで応急処置をした。"}`,
      `${name(scout)}は根元の土を触り、次の雨でまた傾く可能性が高いと判断した。`
    ]
  };
  return pickOne(generic[eventName] ?? [`${eventName}について、短い確認を行った。`], rng);
}

function workEventText(quest, eventName, party, itemIds, rng) {
  const caregiver = findByTrait(party, "personality", "世話焼き");
  const brave = findByTrait(party, "personality", "豪胆");
  const careful = findByTrait(party, "personality", "慎重");
  const post = findByTrait(party, "background", "郵便配達人");
  const guard = findByTrait(party, "background", "宿場の用心棒");
  const herbalist = findByTrait(party, "job", "薬草師");
  const name = (adv) => getDisplayName(adv);

  const weddingEvents = {
    長椅子の設営: [
      `${name(brave)}が長椅子を担いで会場へ運んだ。「何脚いる」と確かめながら、黙って運び続けた。`,
      `${name(caregiver)}は長椅子の向きを細かく調整した。招待客が座りやすいよう、通路の幅も確かめていた。`
    ],
    厨房の手伝い: [
      `${name(caregiver)}は厨房で皿洗いと盛り付けを手伝った。料理人の邪魔をしない動き方を、自然と心得ていた。`,
      `${name(herbalist)}は厨房の薬草束を見て、料理人に使い方を伝えた。「そこの葉は香り付けです」と言うと、礼を言われた。`
    ],
    酒樽の運搬: [
      `${name(brave)}が重い酒樽を肩に担いだ。転がすより早いと判断したらしく、他の者より先に着いた。`,
      `酒樽の運搬は手分けした。${name(careful)}は段差を確かめながら、樽が傾かないように進んだ。`
    ],
    招待客の案内: [
      `${name(post)}は席割りを一度見ただけで覚え、招待客を迷わず席まで案内した。配達の仕事が活きていた。`,
      `${name(caregiver)}は年配の客に丁寧に声をかけた。迷いそうな細い廊下を一緒に歩き、席まで送り届けた。`
    ],
    迷子対応: [
      `子どもが一人、席を離れて迷子になった。${name(caregiver)}がすぐに気づき、泣き出す前に保護した。`,
      `${name(post)}は迷子の子どもが言った「大きな木のそば」という手がかりをもとに、親を見つけた。昔の道案内の癖だ。`
    ],
    夜間の見回り: [
      `${name(guard)}は会場の裏口と入口を交互に確認しながら見回りを続けた。宿場仕事そのままの動き方だった。`,
      `夜間の見回り中、${name(brave)}は外で休んでいた遠方の客を見つけた。声をかけ、中へ案内した。`
    ],
    飾り紐の受け渡し: [
      `飾り紐を花嫁の控え室まで届けた。${name(caregiver)}は袋の結び目をほどかず、そっと渡した。`,
      `${name(careful)}は飾り紐を折れないよう平らにして運んだ。渡した時、受け取った人がほっとした顔をした。`
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
  const solo = party.length === 1;
  const candidates = [];
  party.forEach((adv) => {
    const name = getDisplayName(adv);
    if (adv.personality === "慎重") {
      candidates.push(`${name}はすぐには判断せず、報告書に残せる形で状況を整理してから${solo ? "動いた" : "仲間に伝えた"}。`);
      candidates.push(`${name}は「急がなくていい場面です」と言い、確認を一つ増やした。結果的に、その一手で見落としが減った。`);
    }
    if (adv.personality === "豪胆") {
      candidates.push(`${name}は面倒な道を笑って進んだ。乱暴に見えるが、危ない場所では意外と慎重に足を置く。`);
      candidates.push(`${name}は「帰ったら飯だな」と言って、重い荷物を背負い直した。疲れているのに気にしない。`);
    }
    if (adv.personality === "世話焼き") {
      if (!solo) candidates.push(`${name}は休憩のたびに仲間の顔色を見ていた。報告書には書きにくいが、こういう気配りは遠征を安定させる。`);
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

function lifeQuestPersonalEventText(quest, party, rng) {
  const candidates = [];
  party.forEach((adv) => {
    const name = getDisplayName(adv);
    if (adv.personality === "慎重") {
      if (quest.id === "quest_wedding_support") {
        candidates.push(`${name}は依頼書の段取りを確認し、手順に抜けがないかを一つずつ確かめた。焦らず動く姿勢が、小さなミスを防いでいた。`);
        candidates.push(`${name}は「急いで雑にするより、ゆっくり丁寧にやった方が後が楽です」と言って、作業の順番を整えた。`);
      } else {
        candidates.push(`${name}は片付けた場所に何があったかを逐一メモした。捨てる前の記録が、依頼人の確認作業を助けた。`);
        candidates.push(`${name}は判断に迷うものを勝手に捨てず、「確認が必要なものは別にしておきます」と積み分けた。`);
      }
    }
    if (adv.personality === "豪胆") {
      if (quest.id === "quest_wedding_support") {
        candidates.push(`${name}は重い荷物を率先して引き受けた。こういう場所での控え方を、どこかで覚えてきたらしい。`);
        candidates.push(`${name}は段取りに口を出さず、言われたことを黙ってやり続けた。派手さはないが、確実だった。`);
      } else {
        candidates.push(`${name}は重い家具を次々と外へ運んだ。仲間が確認を終えるまで、ちゃんと待っていた。`);
        candidates.push(`${name}は埃だらけの部屋でも文句を言わなかった。顔を袖で覆い、黙々と続けた。`);
      }
    }
    if (adv.personality === "世話焼き") {
      if (quest.id === "quest_wedding_support") {
        candidates.push(`${name}は会場全体を見渡し、困っている人がいないかを常に気にしていた。依頼書に書かれた仕事の外まで、自然と手が伸びていた。`);
        candidates.push(`${name}は仲間が一息ついた時、「少し飲んでいいですよ」と水を渡した。自分が飲んだのは全員の後だった。`);
      } else {
        candidates.push(`${name}は作業中も住民の話に耳を傾けた。報告書に書くほどのことではないが、依頼人が安心できる言葉をかけていた。`);
        candidates.push(`${name}は片付けを進めながら、仲間の疲れ具合を見ていた。休憩のタイミングをうまく提案して、作業が安定した。`);
      }
    }
    if (adv.background === "郵便配達人") {
      candidates.push(`${name}は依頼人から受け取った書類の順番を崩さないよう気にしていた。紙を扱う仕事の癖が、こういう場所でも出る。`);
    }
    if (adv.background === "宿場の用心棒") {
      candidates.push(`${name}は作業の合間に自然と人の動きを見渡していた。誰がどこにいるかを常に把握しようとする癖は宿場仕事から来ている。`);
    }
    if (adv.background === "村の調合係") {
      candidates.push(`${name}は古い薬草束や瓶を見て、素材かどうかを確かめた。「これは使えます」という一言が、いくつかのものを廃棄から救った。`);
    }
  });
  return pickOne(candidates, rng);
}

function supplyEventText(quest, party, adventurerItemIds, rng) {
  const solo = party.length === 1;
  const has = (id) => getAllItemIds(adventurerItemIds).includes(id);
  const holderAdv = (itemId) => {
    for (const advId of Object.keys(adventurerItemIds)) {
      if (getAdvItemIds(adventurerItemIds, advId).includes(itemId)) {
        return getAdventurer(advId) ?? party[0];
      }
    }
    return party[0];
  };
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

  if (has("item_bandage")) {
    const expert = expertFor("item_bandage", [(p) => p.find((a) => a.job === "薬草師")]);
    if (expert && !solo) {
      lines.push(`${h("item_bandage")}は自分の荷から包帯を取り出した。手当ては${expert}が引き取り、素早く処置を終えた。`);
    } else {
      lines.push(`${h("item_bandage")}は自分の荷から包帯を取り出し、擦り傷に当てた。結び目は少し雑だったが、応急処置としては十分だった。`);
    }
    lines.push(`${h("item_bandage")}が持っていた包帯を荷紐の補修に使った。怪我のためではなかったが、役に立った。`);
  }
  if (has("item_map")) {
    const expert = expertFor("item_map", [(p) => p.find((a) => a.job === "斥候")]);
    if (expert && !solo) {
      lines.push(`${h("item_map")}は自分に預けられた古地図を広げた。${expert}が横から覗き込み、今の道との照合を手伝った。`);
    } else {
      lines.push(`${h("item_map")}は自分に預けられた古地図を広げ、道標の位置を確認した。迷う前に違和感に気づけたのが大きい。`);
    }
    lines.push(`古地図の余白には、前任の記録係らしい細い線が残っていた。${h("item_map")}はその線を目印に進んだ。`);
  }
  if (has("item_whistle")) {
    if (solo) {
      lines.push(`視界が悪くなった時、${h("item_whistle")}は笛を短く吹いて自分の位置を確かめた。音の響き方で周囲の地形が分かる。`);
    } else {
      lines.push(`視界が悪くなった時、${h("item_whistle")}が笛を短く吹いた。音を聞いて全員が集まった。合流手段として報告書に記録された。`);
      lines.push(`${h("item_whistle")}が試しに笛を吹いたら、思ったより大きな音が出た。以後、合図は短く一回に決まった。`);
    }
  }
  if (has("item_pot")) {
    const expert = expertFor("item_pot", [
      (p) => p.find((a) => a.background === "村の調合係"),
      (p) => p.find((a) => a.job === "薬草師")
    ]);
    if (expert && !solo) {
      lines.push(`${h("item_pot")}は自分に預けられていた携帯鍋を取り出した。火加減は${expert}が横から口を出し、簡単なスープができあがった。`);
    } else {
      lines.push(`${h("item_pot")}は携帯鍋で湯を沸かした。採集物の泥を落とすのに使い、休憩が確認作業を兼ねた。`);
    }
    lines.push(`${h("item_pot")}が携帯鍋でスープを作った。${solo ? "帰り道の足取りが少し軽くなった。" : "評判は分かれたが、帰り道の足取りは少し軽くなった。"}`);
  }
  if (has("item_oilcase")) {
    const expert = expertFor("item_oilcase", [(p) => p.find((a) => a.background === "郵便配達人")]);
    if (expert && !solo) {
      lines.push(`${h("item_oilcase")}が持っていた油紙の手紙入れを、${expert}が依頼書の保護に使うよう提案した。紙は濡れずに済んだ。`);
    } else {
      lines.push(`${h("item_oilcase")}が持っていた油紙の手紙入れにより、紙の依頼書とメモは濡れずに済んだ。地味だが大事な仕事だ。`);
    }
    lines.push(`${h("item_oilcase")}は濡れた手で依頼書に触れないよう、油紙の上から内容を確認した。`);
  }
  if (has("item_obs_sheet")) {
    lines.push(`${h("item_obs_sheet")}は観察記録票を上着の内側にしまっていた。帰還後に報告書へ転記するためだ。`);
  }
  if (lines.length === 0) return null;
  return pickOne(lines, rng);
}

function outcomeText(quest, party, itemIds, outcome, rng) {
  const scout = findByTrait(party, "job", "斥候");
  const herbalist = findByTrait(party, "job", "薬草師");
  const post = findByTrait(party, "background", "郵便配達人");
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
        line: `宛先の家は空き家だった。近所に預ける案も出たが、${getDisplayName(scout)}は首を振った。「本人に渡す依頼です。今日は持ち帰ります」`,
        after: `受付嬢は手紙を受け取ると、乾いた布で封筒の端をそっと押さえた。こういう判断も、ちゃんと記録に残る。`,
        history: "届けられなかった手紙を持ち帰り。封筒の保全を優先。"
      },
      再配達: {
        result: "再配達",
        summary: "宛先の所在は判明。次回の再配達が必要。",
        line: `宛先の人物は夕方まで戻らないと分かった。一行は無理に待たず、現在の所在だけを記録して帰還した。`,
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
      line: `道標の根元はゆるんでいた。一行は石を積み、次の巡回までは倒れないよう応急処置をした。`,
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
      line: `苔に隠れた文字は一部しか読めなかった。無理に削ると木が崩れそうだったため、一行は保存を優先した。`,
      after: `読めない文字を、読めないまま残す判断。記録係としては、少しだけ嬉しい報告だった。`,
      history: "古い道標の確認で、文字保存を優先し再確認扱い。"
    }
  };
  return variants[outcome] ?? variants.成功;
}

function lifeQuestOutcomeText(quest, party, itemIds, outcome, rng) {
  const caregiver = findByTrait(party, "personality", "世話焼き");
  const careful = findByTrait(party, "personality", "慎重");

  if (quest.id === "quest_wedding_support") {
    const variants = {
      成功: {
        result: "成功",
        summary: "式の裏方を最後まで務めた。大きな問題はなく、当日は無事に終わった。",
        line: `一行は担当した作業をすべて終えた。式は滞りなく進み、見送りの時、依頼人から「来てくれてよかった」と言われた。`,
        after: `帰り道、${getDisplayName(caregiver)}は「いい式でしたね」と言った。報告書には書かれないことを、覚えている人間がいる。`,
        history: "結婚式の裏方で、設営から見回りまでを担当。式は無事終了。"
      },
      小さな失敗: {
        result: "小さな失敗",
        summary: "軽微なミスはあったが、式の進行に支障はなかった。",
        line: `飾り紐の受け渡しが少し遅れた。${getDisplayName(careful)}はすぐに気づいて補ったが、あの一瞬は報告書に残した。`,
        after: `依頼人は「気にしないで」と言った。そう言ってもらえるうちは、次の機会に活かせる失敗だ。`,
        history: "結婚式の裏方。軽微なミスあり、式は無事終了。"
      },
      感謝: {
        result: "感謝",
        summary: "依頼の範囲を超えた対応が、依頼人から感謝された。",
        line: `${getDisplayName(caregiver)}が迷子の子どもを保護したことで、式の雰囲気が崩れずに済んだ。依頼人から改めて礼を言われた。`,
        after: `式が終わった後、依頼人は一行に小さな菓子折りを持たせた。報告書の末尾には「菓子折り受領、ギルドへ持参」とだけ書いてある。`,
        history: "結婚式の裏方。迷子対応など依頼範囲外にも対応し、感謝を受けた。"
      }
    };
    return variants[outcome] ?? variants["成功"];
  }

  if (quest.id === "quest_old_house_cleanup") {
    const variants = {
      成功: {
        result: "成功",
        summary: "廃屋の片付けを完了した。整理品と要確認品を分けて引き渡した。",
        line: `一行は部屋を順番に片付け、処分品・保管品・要確認品を分けて依頼人へ報告した。住人の名前は最後まで分からなかった。`,
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
    line: `一行は依頼を無事に終えた。`,
    after: `報告書は受付へ提出された。`,
    history: `${quest.title}：完了。`
  };
}

function observationUpdateFor(quest, outcome, roadEvents) {
  if (quest.id === "quest_herb") {
    const addFacts = [];
    const addInference = [];
    const addNext = [];
    if (roadEvents.includes("森喰い兎") || roadEvents.includes("薬草袋の破れ")) {
      addFacts.push("薬草袋や荷紐に反応し、噛みつくことがある。");
      addNext.push("香りの強い薬草を囮にできるか確認する。");
    }
    if (outcome === "観察優先") {
      addFacts.push("荷袋を少し離して置くと、接近行動を観察しやすい。");
    }
    if (roadEvents.includes("泥被り茸の群生") || roadEvents.includes("倒木")) {
      addFacts.push("泥被り茸は湿った倒木の陰に群生することがある。");
      addInference.push("雨上がりや湿度の高い日に採集量が増える可能性がある。");
    }
    const updates = [];
    if (addFacts.length || addInference.length || addNext.length) {
      updates.push({
        id: "obs_rabbit",
        add: { facts: addFacts, inference: [], next: addNext }
      });
    }
    if (addInference.length || roadEvents.includes("泥被り茸の群生")) {
      updates.push({
        id: "obs_mushroom",
        add: { facts: roadEvents.includes("泥被り茸の群生") ? ["湿った倒木の陰に群生することがある。"] : [], inference: addInference, next: ["採集後すぐ乾かした場合の薬効差を確認する。"] }
      });
    }
    return updates.filter((update) => Object.values(update.add).some((lines) => lines.length > 0));
  }
  return [];
}

function observationTextFor(updates) {
  const texts = [];
  updates.forEach((update) => {
    const obs = state.observations.find((item) => item.id === update.id);
    const count = Object.values(update.add).flat().length;
    if (obs && count > 0) texts.push(`${obs.name}：${count}件の記録を追記。`);
  });
  return texts;
}

function generateRabbitNote(adv, rng) {
  const memory = adv.stats?.memory ?? 3;
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

function generateAdventurerObservationNote(target, adv, rng) {
  if (target === "森喰い兎") return generateRabbitNote(adv, rng);
  return `${getDisplayName(adv)}は${target}の様子を確認した。短い観察だったため、詳細な記録はできなかった。`;
}

function generateObservationNotes(quest, party, adventurerItemIds, rng) {
  if (!quest.observationTarget || quest.observationTarget === "なし") return null;
  // 観察記録票を所持している冒険者だけが記録を書ける
  const holders = party.filter((adv) => getAdvItemIds(adventurerItemIds, adv.id).includes("item_obs_sheet"));
  if (holders.length === 0) return null;
  const notes = holders.map((adv) => ({
    adventurerId: adv.id,
    name: getDisplayName(adv),
    text: generateAdventurerObservationNote(quest.observationTarget, adv, rng)
  }));
  return { target: quest.observationTarget, notes };
}

function generateReport(expedition) {
  const quest = getQuest(expedition.questId);
  const party = expedition.adventurerIds.map(getAdventurer).filter(Boolean);
  // adventurerItemIds: 新形式。旧形式（itemIds配列）はアドベンチャラー順に割り当てて互換。
  const adventurerItemIds = expedition.adventurerItemIds ??
    Object.fromEntries((expedition.itemIds ?? []).map((iId, i) => [expedition.adventurerIds[i] ?? `anon_${i}`, iId]));
  // 新形式 [id1, id2] と旧形式 "id" の両方に対応して平坦化
  const itemIds = getAllItemIds(adventurerItemIds);
  const items = itemIds.map(getItem).filter(Boolean);
  const rng = makeRng(expedition.seed + state.worldState.totalExpeditions * 37 + state.reports.length * 101);
  const logs = [];
  const add = (kind, text) => logs.push({ kind, text });

  // 生活依頼（lifeQuestEventPools に登録されているもの）は専用フローで生成
  if (lifeQuestEventPools[quest.id]) {
    const pool = lifeQuestEventPools[quest.id];
    const workEvents = pickMany(pool.workEvents, 3 + Math.floor(rng() * 2), rng);
    let outcome = pickOne(pool.outcomes, rng);

    if (quest.id === "quest_wedding_support" && hasPartyTrait(party, "personality", "世話焼き") && rng() < 0.5) outcome = pickOne(["感謝", "成功"], rng);
    if (quest.id === "quest_old_house_cleanup" && hasPartyTrait(party, "personality", "慎重") && rng() < 0.5) outcome = pickOne(["成功", "整理完了"], rng);

    const outcomeInfo = lifeQuestOutcomeText(quest, party, itemIds, outcome, rng);
    const personal = lifeQuestPersonalEventText(quest, party, rng);
    const supply = supplyEventText(quest, party, adventurerItemIds, rng);
    const observationNotes = generateObservationNotes(quest, party, adventurerItemIds, rng);

    const arrivalLines = {
      quest_wedding_support: [
        `会場に着くと、すでに準備の真っ最中だった。依頼人の顔に安堵が浮かんだ。`,
        `町の小さな祝宴会場に着いた。外はにぎやかで、中はまだ落ち着きがなかった。`
      ],
      quest_old_house_cleanup: [
        `町外れの家屋に着いた。戸は開いたまま、中は物が積み重なっていた。`,
        `古い家屋の前に立った。${formatNames(party)}は外から中を見渡し、どこから手をつけるかを相談した。`
      ]
    };

    add("", `${formatNames(party)}が「${quest.title}」のため、${quest.area}へ向かった。`);
    add("", `支給品：${items.length ? items.map((item) => item.name).join("、") : "なし"}。`);
    add("", pickOne(arrivalLines[quest.id] ?? [`${quest.area}に到着した。`], rng));
    workEvents.forEach((eventName) => add("action", workEventText(quest, eventName, party, itemIds, rng)));
    if (personal) add("drama", personal);
    if (supply) add("drama", supply);
    add("action", outcomeInfo.line);
    add("afterglow", outcomeInfo.after);

    const adventurerHistoryLines = {};
    party.forEach((adv) => {
      const displayName = getDisplayName(adv);
      const roleNote = adv.personality === "世話焼き" ? "気配りと補助で" : adv.personality === "慎重" ? "丁寧な確認で" : adv.personality === "豪胆" ? "力仕事で" : "一員として";
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
      observationUpdates: [],
      observationText: [],
      observationNotes,
      hiddenTags: { workEvents, outcome, recordDensityGain: 1 + logs.length },
      createdAt: new Date().toISOString()
    };
  }

  // 遠征依頼フロー
  const pool = questEventPools[quest.id];

  const weather = pickOne(pool.weather, rng);
  const roadEvents = pickMany(pool.roadEvents, 2 + Math.floor(rng() * 2), rng);
  let outcome = pickOne(pool.outcomes, rng);

  // 支給品や人物特性で、納得感のある結果へ少しだけ寄せる。
  if (quest.id === "quest_letter" && itemIds.includes("item_oilcase") && rng() < 0.45) outcome = pickOne(["成功", "持ち帰り", "再配達"], rng);
  if (quest.id === "quest_letter" && hasPartyTrait(party, "background", "郵便配達人") && rng() < 0.45) outcome = pickOne(["成功", "部分成功", "再配達"], rng);
  if (quest.id === "quest_herb" && hasPartyTrait(party, "job", "薬草師") && rng() < 0.5) outcome = pickOne(["成功", "小成功", "採集優先"], rng);
  if (quest.id === "quest_signpost" && itemIds.includes("item_map") && rng() < 0.5) outcome = pickOne(["成功", "応急処置", "照合保留"], rng);

  const outcomeInfo = outcomeText(quest, party, itemIds, outcome, rng);
  // 観察記録票を持っている場合のみ、観察記録本体を更新する
  const hasObsSheet = getAllItemIds(adventurerItemIds).includes("item_obs_sheet");
  const observationUpdates = hasObsSheet ? observationUpdateFor(quest, outcome, roadEvents) : [];
  const observationText = observationTextFor(observationUpdates);
  const personal = personalEventText(quest, party, rng);
  const supply = supplyEventText(quest, party, adventurerItemIds, rng);
  const observationNotes = generateObservationNotes(quest, party, adventurerItemIds, rng);

  add("", `一行は「${quest.title}」のため、${quest.area}へ向かった。`);
  const supplyDesc = party.map((adv) => {
    const advItems = getAdvItemIds(adventurerItemIds, adv.id).map((iId) => getItem(iId)?.name).filter(Boolean);
    return advItems.length > 0 ? `${getDisplayName(adv)}：${advItems.join("・")}` : null;
  }).filter(Boolean);
  add("", `編成：${formatNames(party)}。支給品：${supplyDesc.length > 0 ? supplyDesc.join(" / ") : "なし"}。`);
  add("", generateWeatherLog(quest, party, weather, rng));
  roadEvents.forEach((eventName) => add("action", roadEventText(quest, eventName, party, itemIds, rng)));
  if (personal) add("drama", personal);
  if (supply) add("drama", supply);
  add("action", outcomeInfo.line);
  add("afterglow", outcomeInfo.after);

  const adventurerHistoryLines = {};
  party.forEach((adv) => {
    const displayName = getDisplayName(adv);
    const roleNote = adv.job === "斥候" ? "確認役として" : adv.job === "薬草師" ? "採集と手当で" : adv.job === "戦士" ? "荷運びと警戒で" : "一行の一員として";
    adventurerHistoryLines[adv.id] = `${quest.title}：${outcomeInfo.result}。${displayName}は${roleNote}記録に残った。`;
  });

  return {
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
    observationUpdates,
    observationText,
    observationNotes,
    hiddenTags: {
      weather,
      roadEvents,
      outcome,
      recordDensityGain: 1 + logs.length + observationText.length
    },
    createdAt: new Date().toISOString()
  };
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
